#!/usr/bin/env node
/**
 * build-programme.mjs
 *
 * Builds the /programme content from the Ticket Tailor API.
 *
 * For every event returned by the API we (re)generate a Hugo page at
 *   content/programme/<slug>/index.md
 *
 * - Fields (title, date, times, sign-up link, feature image) are pulled from
 *   the event object.
 * - Hosts are parsed out of the description, looking for a line of the form
 *   "Hosted by: <name-a>, <name-b>".
 * - Events with status "draft" are flagged in the header text ("[DRAFT] …")
 *   rather than as a Hugo draft, so they still render (buildDrafts = false).
 *
 * Every generated directory gets a hidden marker file so re-running the script
 * can safely prune events that have been removed from Ticket Tailor without
 * ever touching the hand-authored pages that live alongside them.
 *
 *   npm run build:programme
 */

import 'dotenv/config'
import { readFile, writeFile, mkdir, readdir, rm, access } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import TurndownService from 'turndown'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')
const PROGRAMME_DIR = join(REPO_ROOT, 'content', 'programme')

// Marker written into every generated event directory. Directories without it
// (i.e. hand-authored pages) are never modified or deleted by this script.
const MARKER = '.generated-by-tickettailor'

const API_BASE = 'https://api.tickettailor.com/v1'

const API_KEY = process.env.TICKET_TAILOR_API_KEY
if (!API_KEY) {
  console.error(
    'Missing TICKET_TAILOR_API_KEY. Add it to a .env file in the repo root:\n' +
    '  TICKET_TAILOR_API_KEY=sk_...'
  )
  process.exit(1)
}

const AUTH_HEADER = `Basic ${Buffer.from(API_KEY).toString('base64')}`

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '*',
  codeBlockStyle: 'fenced',
  emDelimiter: '_'
})

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

async function main () {
  const events = await fetchAllEvents()
  console.log(`Fetched ${events.length} event(s) from Ticket Tailor.\n`)

  const keptSlugs = new Set()

  for (const event of events) {
    const slug = slugify(event.name)
    keptSlugs.add(slug)
    await writeEvent(event, slug)
  }

  await pruneRemovedEvents(keptSlugs)

  console.log('\nDone.')
}

/**
 * Page through the events endpoint using cursor pagination (`starting_after`).
 */
async function fetchAllEvents () {
  const all = []
  const limit = 100
  let startingAfter = null

  while (true) {
    const url = new URL(`${API_BASE}/events`)
    url.searchParams.set('limit', String(limit))
    if (startingAfter) url.searchParams.set('starting_after', startingAfter)

    const res = await fetch(url, {
      headers: { accept: 'application/json', authorization: AUTH_HEADER }
    })

    if (!res.ok) {
      throw new Error(`Ticket Tailor API responded ${res.status}: ${await res.text()}`)
    }

    const body = await res.json()
    const page = body.data ?? []
    all.push(...page)

    if (page.length < limit) break
    startingAfter = page[page.length - 1].id
  }

  return all
}

async function writeEvent (event, slug) {
  const isDraft = event.status === 'draft'

  // Turn the HTML description into clean markdown, then pull the hosts line out
  // of it so it renders via the programme-hosts partial rather than inline.
  const markdown = event.description ? turndown.turndown(event.description) : ''
  const { hosts, body } = extractHosts(markdown)

  const headerTitle = isDraft ? `[DRAFT] ${event.name}` : event.name

  const frontMatter = { title: headerTitle }
  if (hosts.length) frontMatter.hosts = hosts
  frontMatter.date = event.start?.date
  if (event.start?.time) frontMatter.start_time = event.start.time
  if (event.end?.time) frontMatter.end_time = event.end.time

  // Draft events aren't on sale yet — omit the link so the template shows
  // "Registration coming soon!". Published events link to their event page.
  if (!isDraft && event.url) frontMatter.sign_up_link = event.url

  if (event.images?.header) frontMatter.featureimage = event.images.header

  // Kept for traceability + safe pruning on re-runs.
  frontMatter.ticket_tailor_id = event.id

  const file = `${toYamlFrontMatter(frontMatter)}\n${body.trim()}\n`

  const dir = join(PROGRAMME_DIR, slug)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'index.md'), file, 'utf8')
  await writeFile(join(dir, MARKER), `${event.id}\n`, 'utf8')

  console.log(`  ${isDraft ? '[draft] ' : ''}wrote content/programme/${slug}/index.md`)
}

/**
 * Remove previously-generated event directories that are no longer in the API.
 * Only directories carrying our marker file are eligible, so hand-authored
 * pages are always left alone.
 */
async function pruneRemovedEvents (keptSlugs) {
  let entries
  try {
    entries = await readdir(PROGRAMME_DIR, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (keptSlugs.has(entry.name)) continue

    const dir = join(PROGRAMME_DIR, entry.name)
    if (!(await exists(join(dir, MARKER)))) continue // hand-authored, leave it

    await rm(dir, { recursive: true, force: true })
    console.log(`  removed stale content/programme/${entry.name}/ (no longer in Ticket Tailor)`)
  }
}

/**
 * Look for "Hosted by: A, B and C" anywhere in the description (it's usually
 * tucked into the end of a sentence). Returns the parsed names plus the body
 * with that phrase stripped out — the hosts render via the programme-hosts
 * partial instead. The colon is optional and the list may join names with
 * commas, "&" or "and".
 */
function extractHosts (markdown) {
  // Capture the names run: everything after "Hosted by" up to the sentence
  // end (a period) or line break.
  const namesMatch = markdown.match(/Hosted by:?[ \t]*\**[ \t]*([^.\n]+)/i)
  if (!namesMatch) return { hosts: [], body: markdown }

  const hosts = namesMatch[1]
    .replace(/[*_]+/g, '')            // drop markdown emphasis
    .split(/\s*(?:,|&|\band\b)\s*/i)  // split on comma / "&" / "and"
    .map((name) => name.trim())
    .filter(Boolean)

  // Strip the "Hosted by …" phrase (plus a trailing period), without crossing
  // line breaks so surrounding paragraphs stay intact.
  const body = markdown
    .replace(/[ \t]*\**[ \t]*Hosted by:?[ \t]*\**[ \t]*[^.\n]+\.?/i, '')
    .replace(/[ \t]+$/gm, '')

  return { hosts, body }
}

function slugify (name) {
  return name
    .replace(/['’"]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function toYamlFrontMatter (obj) {
  const lines = ['---']
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      lines.push(`${key}:`)
      for (const item of value) lines.push(`  - ${yamlScalar(item)}`)
    } else {
      lines.push(`${key}: ${yamlScalar(value)}`)
    }
  }
  lines.push('---')
  return lines.join('\n')
}

function yamlScalar (value) {
  if (typeof value !== 'string') return String(value)
  // Quote anything that could confuse the YAML parser; escape embedded quotes.
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

async function exists (path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}
