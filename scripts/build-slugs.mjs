#!/usr/bin/env node
/**
 * build-slugs.mjs
 *
 * Auto-generates the `slug` front-matter field for hand-authored programme
 * pages from their title + subtitle + part, e.g.
 *
 *   title:    "(Do Not!) Burn Your Journals"
 *   subtitle: "afternoon"
 *   part:     "2"
 *   -> slug:  "do-not-burn-your-journals_afternoon_2"
 *
 * Pages without a subtitle or part are left untouched (their URL keeps coming
 * from the directory name). Runs standalone (no Ticket Tailor API key needed)
 * and is also invoked at the end of `npm run build:programme`.
 *
 *   npm run build:slugs
 */

import { readFile, writeFile, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')
const PROGRAMME_DIR = join(REPO_ROOT, 'content', 'programme')

/**
 * Walk every programme page and, for those split into subtitle/part, (re)write
 * a `slug` derived from their title fields.
 */
export async function generateSlugs () {
  let entries
  try {
    entries = await readdir(PROGRAMME_DIR, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const indexPath = join(PROGRAMME_DIR, entry.name, 'index.md')

    let text
    try {
      text = await readFile(indexPath, 'utf8')
    } catch {
      continue
    }

    const title = readParam(text, 'title')
    const subtitle = readParam(text, 'subtitle')
    const part = readParam(text, 'part')

    // Only manage the slug for pages that have been split into subtitle/part.
    // Everything else keeps its directory-name URL.
    if (!title || (!subtitle && !part)) continue

    const slug = buildSlug({ title, subtitle, part })
    const updated = upsertFrontMatterField(text, 'slug', slug)
    if (updated !== text) {
      await writeFile(indexPath, updated, 'utf8')
      console.log(`  slug for content/programme/${entry.name}/ -> ${slug}`)
    }
  }
}

/**
 * Build a slug from the split title fields: slugified title, then subtitle and
 * part appended as `_`-separated segments (each internally hyphenated).
 */
export function buildSlug ({ title, subtitle, part }) {
  const segments = [slugify(title)]
  if (subtitle) segments.push(slugify(subtitle))
  if (part) segments.push(slugify(String(part)))
  return segments.join('_').toLowerCase()
}

function slugify (name) {
  return name
    .replace(/['’"]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Read a simple scalar front-matter field, unwrapping optional quotes. */
function readParam (text, key) {
  const match = text.match(new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, 'm'))
  return match ? match[1].trim() : null
}

/**
 * Set (or replace) a scalar field inside the YAML front-matter block, leaving
 * the body untouched. A new field is inserted just after part/subtitle/title.
 */
function upsertFrontMatterField (text, key, value) {
  const fm = text.match(/^(---\n)([\s\S]*?)(\n---)/)
  if (!fm) return text

  const line = `${key}: "${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  let body = fm[2]
  const keyRe = new RegExp(`^${key}:.*$`, 'm')

  if (keyRe.test(body)) {
    body = body.replace(keyRe, line)
  } else {
    const anchor = [/^part:.*$/m, /^subtitle:.*$/m, /^title:.*$/m].find((re) => re.test(body))
    if (anchor) {
      body = body.replace(anchor, (m) => `${m}\n${line}`)
    } else {
      body = `${line}\n${body}`
    }
  }

  return text.slice(0, fm.index) + fm[1] + body + fm[3] + text.slice(fm.index + fm[0].length)
}

// Run when invoked directly (not when imported by build-programme.mjs).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  generateSlugs().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
