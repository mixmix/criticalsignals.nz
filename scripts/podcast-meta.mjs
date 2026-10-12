#!/usr/bin/env node
/**
 * podcast-meta.mjs
 *
 * Fills in `audio_bytes` for each podcast episode by asking the media host for
 * the file's Content-Length. Podcast apps reject an <enclosure> without a real
 * byte count, and it's easy to get wrong by hand.
 *
 * Only touches episodes whose `audio_bytes` is missing or 0, so re-running is
 * cheap. Run after uploading a new episode's audio:
 *
 *   pnpm run podcast:meta
 */

import { readFile, writeFile, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PODCAST_DIR = join(__dirname, '..', 'content', 'podcast')

async function main () {
  const entries = await readdir(PODCAST_DIR, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const file = join(PODCAST_DIR, entry.name, 'index.md')
    const text = await readFile(file, 'utf8')

    const audio = text.match(/^audio:\s*"?([^"\n]+)"?\s*$/m)?.[1]
    if (!audio) continue
    const bytes = Number(text.match(/^audio_bytes:\s*(\d+)/m)?.[1] ?? 0)
    if (bytes > 0) continue

    const res = await fetch(audio, { method: 'HEAD' })
    const length = Number(res.headers.get('content-length'))
    if (!res.ok || !length) {
      console.warn(`${entry.name}: ${audio} → HTTP ${res.status}, no Content-Length; skipped`)
      continue
    }

    const updated = /^audio_bytes:/m.test(text)
      ? text.replace(/^audio_bytes:.*$/m, `audio_bytes: ${length}`)
      : text.replace(/^audio:.*$/m, m => `${m}\naudio_bytes: ${length}`)
    await writeFile(file, updated)
    console.log(`${entry.name}: audio_bytes = ${length}`)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
