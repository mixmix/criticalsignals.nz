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
 * - Events with status "draft" are written with `draft: true` in the front
 *   matter, so Hugo omits them from production builds (buildDrafts = false)
 *   while `hugo server -D` still renders them for previewing.
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
import { generateSlugs } from './build-slugs.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')
const PROGRAMME_DIR = join(REPO_ROOT, 'content', 'programme')
const COLLABORATORS_DIR = join(REPO_ROOT, 'content', 'people')

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

// Ticket Tailor's editor lets authors scale inline images by hand: the upload
// is served at up to 630px wide but the <img> carries the size they actually
// displayed it at (e.g. 167x112 for a small logo). Turndown's default image
// rule drops width/height, so those images landed on our pages stretched to
// the full width of the text column. Carry the authored size through to the
// tt-image shortcode instead (layouts/shortcodes/tt-image.html).
turndown.addRule('sizedImage', {
  filter: 'img',
  replacement (content, node) {
    const src = node.getAttribute('src')
    if (!src) return ''

    const attrs = [`src="${escapeAttr(src)}"`]
    const alt = imageAlt(node.getAttribute('alt'), src)
    if (alt) attrs.push(`alt="${escapeAttr(alt)}"`)
    for (const name of ['width', 'height']) {
      const px = pixelValue(node.getAttribute(name))
      if (px) attrs.push(`${name}="${px}"`)
    }

    return `\n\n{{< tt-image ${attrs.join(' ')} >}}\n\n`
  }
})

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

async function main () {
  const events = await fetchAllEvents()
  const collaborators = await loadCollaboratorTitles()
  console.log(`Fetched ${events.length} event(s) from Ticket Tailor.\n`)

  const keptSlugs = new Set()
  const reports = []

  for (const event of events) {
    const slug = slugify(event.name)
    keptSlugs.add(slug)
    reports.push(await writeEvent(event, slug, collaborators))
  }

  await pruneRemovedEvents(keptSlugs)

  // Refresh auto-generated slugs on hand-authored pages that have been split
  // into title + subtitle + part.
  await generateSlugs()

  printGroup('LIVE', reports.filter((r) => !r.isDraft))
  printGroup('DRAFT', reports.filter((r) => r.isDraft))

  const complete = reports.filter((r) => r.complete).length
  console.log(`${complete}/${reports.length} event(s) have everything they need.`)
  console.log('Done.')
}

function printGroup (label, reports) {
  if (!reports.length) return
  console.log(`[${label}]`)
  for (const r of reports) {
    console.log(`${r.complete ? '✓' : '✗'} ${r.name}${r.custom ? ' (CUSTOM)' : ''}`)
    if (r.missing.length) console.log(`    missing: ${r.missing.join(', ')}`)
    if (!r.hosts.length) {
      console.log('    hosts: unable to find hosts')
    } else if (r.hostsWithoutProfile.length) {
      console.log(`    hosts: missing profiles (${r.hostsWithoutProfile.join(', ')})`)
    }
  }
  console.log('')
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

async function writeEvent (event, slug, collaborators) {
  const isDraft = event.status === 'draft'

  // Turn the HTML description into clean markdown, then pull the hosts line out
  // of it so it renders via the programme-hosts partial rather than inline.
  const markdown = event.description ? turndown.turndown(event.description) : ''
  const { hosts, body } = extractHosts(markdown)

  const frontMatter = { title: event.name }
  if (isDraft) frontMatter.draft = true
  if (hosts.length) frontMatter.hosts = hosts
  frontMatter.date = event.start?.date
  if (event.start?.time) frontMatter.start_time = event.start.time
  if (event.end?.time) frontMatter.end_time = event.end.time

  // Draft events aren't on sale yet — omit the link so the template shows
  // "Registration coming soon!". Published events link to their event page.
  if (!isDraft && event.url) frontMatter.sign_up_link = event.url

  // Subtle price line next to the Tickets button, e.g. "Koha" or "$5 or koha".
  const price = ticketPrice(event)
  if (price) frontMatter.price = price

  // The event's currency, straight off the Ticket Tailor event object
  // ("nzd", "usd", ...). Every event on the account should be NZD — the
  // `money()` helper above hardcodes a "$" sign on that assumption — so this
  // is kept in front matter purely so the /_admin/programme audit can flag
  // any event that's drifted onto a different currency.
  if (event.currency) frontMatter.currency = event.currency.toUpperCase()

  // How full the event is. A snapshot as of this run — the site is static, so
  // these numbers are only as fresh as the last build (the update-programme
  // workflow re-runs this script, see .github/workflows/).
  frontMatter.attendees = event.total_issued_tickets ?? 0
  const capacity = ticketCapacity(event)
  if (capacity) frontMatter.capacity = capacity

  // The event's header image, rendered at the top of the page. `featureimage`
  // is the site-wide key for "this page's photo" (people use it too) and it
  // takes a remote URL as well as a bundled filename — see
  // layouts/partials/feature-image.html.
  if (event.images?.header) frontMatter.featureimage = event.images.header

  // Kept for traceability + safe pruning on re-runs.
  frontMatter.ticket_tailor_id = event.id

  const file = `${toYamlFrontMatter(frontMatter)}\n${body.trim()}\n`

  const dir = join(PROGRAMME_DIR, slug)

  // A directory that already exists without our marker is a hand-authored
  // ("custom") page. Never overwrite it or drop a marker into it — we still
  // audit it below so the summary can report what it's missing.
  const isCustom = (await exists(dir)) && !(await exists(join(dir, MARKER)))

  if (!isCustom) {
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'index.md'), file, 'utf8')
    await writeFile(join(dir, MARKER), `${event.id}\n`, 'utf8')
  }

  // Completeness report: what a finished event page needs. Hosts are tracked
  // separately (see printGroup) so they get their own dedicated sub-line.
  const location = event.venue?.name || (event.online_event === 'true' ? 'Online' : null)
  const missing = []
  if (!event.start?.time) missing.push('start time')
  if (!event.end?.time) missing.push('end time')
  if (!location) missing.push('location')
  if (!event.url) missing.push('sign-up link')

  // Hosts we found but who have no matching profile in content/people/.
  // Matched on the same key the templates use to link them, so an honorific
  // on one side only isn't reported as a missing profile (see nameKey).
  const hostsWithoutProfile = hosts.filter((name) => !collaborators.has(nameKey(name)))

  return {
    name: event.name,
    slug,
    isDraft,
    custom: isCustom,
    hosts,
    hostsWithoutProfile,
    missing,
    complete: missing.length === 0 && hosts.length > 0
  }
}

/**
 * A short price line for the event, shown beside the Tickets button:
 *
 *   "Free"          every ticket is $0
 *   "Koha"          every ticket is $0, and that's what the organiser called it
 *   "$10"           one price
 *   "$120–250"      cheapest to dearest
 *   "$5 or koha"    a paid ticket alongside a $0 "pay at the door" option
 *
 * Booking fees are left out — the price shown is the one on the ticket, same
 * as Ticket Tailor's own listing headline.
 *
 * Returns null when there's nothing to say (an event with no ticket types yet),
 * so the front matter key is simply omitted.
 */
function ticketPrice (event) {
  // Hidden tickets are unlocked with a code, so they're not part of the public
  // price. Sold-out ones still are: the price stands even when it's gone.
  const types = (event.ticket_types ?? []).filter((t) => !t.access_code)
  if (!types.length) return null

  const paid = types.filter((t) => t.price > 0).map((t) => t.price)
  const free = types.filter((t) => t.price === 0)

  if (!paid.length) return capitalise(freeWord(free))

  const min = Math.min(...paid)
  const max = Math.max(...paid)
  const range = min === max ? money(min) : `${money(min)}–${money(max)}`

  return free.length ? `${range} or ${freeWord(free)}` : range
}

/**
 * How many people the event can take.
 *
 * Two limits are in play and the smaller wins: the quantities on the ticket
 * types (which are per-type, so they sum), and the event's own cap on tickets
 * sold. They often disagree — "Detangling Yourself from Big Tech" offers 20
 * waged + 15 door tickets but caps the room at 20 — and it's the cap that
 * decides when the event is full.
 */
function ticketCapacity (event) {
  const types = (event.ticket_types ?? []).filter((t) => !t.access_code)
  const total = types.reduce((sum, t) => sum + (t.quantity_total ?? 0), 0)
  const cap = event.max_tickets_sold_per_occurrence

  if (!total) return cap || null
  return cap ? Math.min(cap, total) : total
}

/**
 * What to call a $0 ticket. Koha is a donation rather than a free ticket, and
 * it's the organiser who decides which this is — so echo back the word they
 * used on the ticket ("Koha", "Pay at the door (Koha)") rather than flattening
 * everything to "Free". Ticket types with no such word (RSVP, General
 * Admission) really are free.
 */
function freeWord (freeTypes) {
  for (const type of freeTypes) {
    const match = String(type.name ?? '').match(/koha|donation/i)
    if (match) return match[0].toLowerCase()
  }
  return 'free'
}

/** Cents to dollars, dropping a trailing ".00": 25000 → "$250", 1250 → "$12.50". */
function money (cents) {
  const dollars = cents / 100
  return `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`
}

function capitalise (word) {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/**
 * Comparison key for a person's name: lowercased, whitespace collapsed, and a
 * leading honorific ("Dr", "Dr.", "Prof", …) removed.
 *
 * Ticket Tailor descriptions and content/people/ profiles are written by
 * different hands and don't agree on honorifics — the same person can be
 * "Dr. Jessica Hutchings" on an event and "Jessica Hutchings" on their
 * profile. Comparing raw names would report that as a missing profile.
 *
 * Mirrored in layouts/partials/people/name-key.html, which is what actually
 * links hosts to profiles on the site — change both together.
 */
function nameKey (name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/^\s*(?:dr|prof|professor|mr|mrs|ms|mx|sir|dame)\.?\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Build a set of people's name keys (from their page Title) out of
 * content/people/*\/index.md, used to check whether a host has a profile.
 */
async function loadCollaboratorTitles () {
  const titles = new Set()

  let entries
  try {
    entries = await readdir(COLLABORATORS_DIR, { withFileTypes: true })
  } catch {
    return titles
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    let text
    try {
      text = await readFile(join(COLLABORATORS_DIR, entry.name, 'index.md'), 'utf8')
    } catch {
      continue
    }
    const match = text.match(/^title:\s*["']?(.+?)["']?\s*$/m)
    if (match) titles.add(nameKey(match[1]))
  }

  return titles
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

/**
 * Ticket Tailor defaults an image's alt text to its filename, which is noise
 * for a screen reader. Treat that as decorative (empty alt) and keep anything
 * the author actually wrote.
 */
function imageAlt (alt, src) {
  if (!alt) return ''
  const filename = decodeURIComponent(src.split('/').pop() || '')
  if (alt.trim() === filename.trim()) return ''
  return alt.trim()
}

/** A width/height attribute in whole pixels, or null if it isn't one (e.g. "50%"). */
function pixelValue (value) {
  if (!value) return null
  const match = String(value).trim().match(/^(\d+)(?:px)?$/i)
  return match ? Number(match[1]) : null
}

function escapeAttr (value) {
  return String(value).replace(/"/g, '&quot;')
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
