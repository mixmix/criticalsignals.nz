#!/usr/bin/env node
/**
 * podcast-covers.mjs
 *
 * Rebuilds a podcast episode's cover art as a large SVG from the small
 * (423px) design export:
 *
 *   - the photo (right of the cream text panel) becomes a low-poly triangle
 *     approximation from fogleman/primitive, the same tool and look as the
 *     site's background placeholders (scripts/gen-lowpoly.sh). Faces, hands
 *     and arms (found by scripts/lib/detect-faces.swift) get extra, smaller
 *     triangles: each is fitted again on its own, in several nested levels
 *     for faces, and layered over the base with a soft radial fade — so
 *     detail grades up towards the face with no visible edges;
 *   - the cream text panel on the left is enlarged with a plain
 *     nearest-neighbour scale — deliberately pixelated, no smoothing or
 *     "enhancement" — and embedded in the SVG as a PNG.
 *
 * Reads  content/podcast/<episode>/artwork-source.png  (named so that it
 *        matches neither the theme's *cover* / *feature* image lookups)
 * Writes content/podcast/<episode>/cover.svg   (the source of truth)
 *        content/podcast/<episode>/cover.jpg   (3000px render of the SVG —
 *                                               podcast apps don't take SVG)
 *
 *   pnpm run podcast:covers                 # every episode folder
 *   pnpm run podcast:covers episode-2       # just one
 *
 * Tunables (env vars): COVER_TRIANGLES=400 for the whole photo,
 * COVER_ITERS=4 (primitive is random; the closest of N runs is kept),
 * COVER_PATCH_ITERS=2 for the detail patches, COVER_SIZE=3000. Detail levels
 * per face / hand / arm: LEVELS below.
 *
 * Requires macOS (Vision, for faces), primitive
 * (`go install github.com/fogleman/primitive@latest`) and rsvg-convert
 * (`brew install librsvg`).
 */

import { readFile, writeFile, readdir, mkdtemp, rm, access } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir, homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PODCAST_DIR = join(__dirname, '..', 'content', 'podcast')

const TRIANGLES = Number(process.env.COVER_TRIANGLES ?? 400)
const ITERS = Number(process.env.COVER_ITERS ?? 4)
// Detail patches are many and small; fewer best-of runs each keeps it quick.
const PATCH_ITERS = Number(process.env.COVER_PATCH_ITERS ?? 2)
const SIZE = Number(process.env.COVER_SIZE ?? 3000)

// Extra detail per region found by scripts/lib/detect-faces.swift. Each level
// is one more triangle fit of a square patch `pad` × the region's size,
// layered over the base and faded out radially from `solid` (fraction of the
// radius at full strength) to its edge. Several levels per face, wide and
// coarse to tight and fine, stack into a gradient of detail centred on it.
// Same triangle count over a smaller patch = smaller triangles.
const LEVELS = {
  arm: [{ pad: 1.5, n: 80, solid: 0.35 }],
  hand: [
    { pad: 3.5, n: 100, solid: 0.3 },
    { pad: 1.8, n: 80, solid: 0.4 }
  ],
  face: [
    { pad: 7, n: 200, solid: 0.25 },
    { pad: 4, n: 200, solid: 0.3 },
    { pad: 2.2, n: 160, solid: 0.4 },
    { pad: 1.3, n: 100, solid: 0.5 }
  ]
}
// Drawn in this order, so faces end up on top.
const KINDS = ['arm', 'hand', 'face']

// The design's panel colour, used to find where the panel ends.
const CREAM = [248, 244, 206]

const PRIMITIVE = process.env.PRIMITIVE ?? join(homedir(), 'go', 'bin', 'primitive')

/** Width of the cream panel: first column, scanning right, that isn't cream. */
async function panelWidth (file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H } = info
  for (let x = 0; x < W; x++) {
    let cream = 0
    for (let y = 0; y < H; y++) {
      const i = (y * W + x) * 3
      const d = Math.abs(data[i] - CREAM[0]) + Math.abs(data[i + 1] - CREAM[1]) + Math.abs(data[i + 2] - CREAM[2])
      if (d < 30) cream++
    }
    if (cream / H < 0.5) return x
  }
  throw new Error(`${file}: no photo found right of the cream panel`)
}

/** Mean squared error between two same-size raw RGB buffers. */
function mse (a, b) {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2
  return sum / a.length
}

/**
 * Best-of-ITERS primitive triangle fit of `png`. Returns the markup inside
 * primitive's <svg>, the size it drew at (its -s sets the longer side, so it
 * is not simply the input size), and the score.
 */
async function lowPoly (png, n, tmp, tag, iters = ITERS) {
  const { width: w, height: h } = await sharp(png).metadata()
  const sw = 160
  const sh = Math.max(1, Math.round(sw * h / w))
  const target = await sharp(png).resize(sw, sh).removeAlpha().raw().toBuffer()
  let best
  for (let k = 0; k < iters; k++) {
    const out = join(tmp, `${tag}-${k}.svg`)
    execFileSync(PRIMITIVE, ['-i', png, '-o', out, '-n', String(n), '-m', '1', '-r', '384', '-s', String(Math.max(w, h))])
    const svg = await readFile(out, 'utf8')
    const render = await sharp(Buffer.from(svg)).resize(sw, sh).removeAlpha().raw().toBuffer()
    const score = mse(target, render)
    if (!best || score < best.score) best = { svg, score }
  }
  const root = best.svg.match(/<svg[^>]*\bwidth="([\d.]+)"[^>]*\bheight="([\d.]+)"/)
  const inner = best.svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
  return { inner, vw: Number(root[1]), vh: Number(root[2]), score: best.score }
}

/** Face / hand / arm regions in `png` as [{ kind, cx, cy, size }], via macOS Vision. */
function detectRegions (png, tmp) {
  const bin = join(tmp, 'detect-faces')
  execFileSync('swiftc', ['-O', join(__dirname, 'lib', 'detect-faces.swift'), '-o', bin], { stdio: 'ignore' })
  return execFileSync(bin, [png], { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean)
    .map(l => { const [kind, cx, cy, size] = l.split(' '); return { kind, cx: +cx, cy: +cy, size: +size } })
}

/**
 * One detail level for one region, as SVG markup in photo pixel coordinates.
 * The fit's opaque background rect is dropped so its first, half-transparent
 * triangles blend into the layers below, and it's masked with a radial fade
 * centred on the region (not the crop, which is clamped at the photo's edges)
 * so the patch has no edge.
 */
async function detailPatch (photoPng, photoW, photoH, region, level, id, tmp) {
  const { cx, cy } = region
  const s = Math.max(8, region.size * level.pad)
  const left = Math.max(0, Math.round(cx - s / 2))
  const top = Math.max(0, Math.round(cy - s / 2))
  const w = Math.min(photoW - left, Math.round(cx + s / 2) - left)
  const h = Math.min(photoH - top, Math.round(cy + s / 2) - top)
  if (w < 4 || h < 4) return ''
  const png = join(tmp, `${id}.png`)
  await sharp(photoPng).extract({ left, top, width: w, height: h }).png().toFile(png)

  const fit = await lowPoly(png, level.n, tmp, id, PATCH_ITERS)
  const shapes = fit.inner.replace(/<rect[^>]*\/>/, '')
  return `<radialGradient id="${id}-fade" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${s / 2}">` +
      `<stop offset="${level.solid}" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>` +
    `<mask id="${id}" maskUnits="userSpaceOnUse" x="${left}" y="${top}" width="${w}" height="${h}">` +
      `<rect x="${left}" y="${top}" width="${w}" height="${h}" fill="url(#${id}-fade)"/></mask>` +
    `<g mask="url(#${id})"><svg x="${left}" y="${top}" width="${w}" height="${h}" viewBox="0 0 ${fit.vw} ${fit.vh}" preserveAspectRatio="none" overflow="hidden">${shapes}</svg></g>`
}

/** The text panel enlarged nearest-neighbour — blocky pixels, no smoothing. */
async function pixelPanel (file, panelW, srcH, outW, outH) {
  return sharp(file)
    .extract({ left: 0, top: 0, width: panelW, height: srcH })
    .removeAlpha()
    .resize(outW, outH, { kernel: 'nearest' })
    .png({ palette: true })
    .toBuffer()
}

async function buildCover (dir) {
  const src = join(dir, 'artwork-source.png')
  const { width: W, height: H } = await sharp(src).metadata()
  const scale = SIZE / H
  const panelW = await panelWidth(src)
  const photoW = W - panelW

  const tmp = await mkdtemp(join(tmpdir(), 'podcast-cover-'))
  try {
    const photoPng = join(tmp, 'photo.png')
    await sharp(src).extract({ left: panelW, top: 0, width: photoW, height: H }).png().toFile(photoPng)

    const base = await lowPoly(photoPng, TRIANGLES, tmp, 'base')
    const regions = detectRegions(photoPng, tmp)
    // Level by level across all regions (all the coarse passes, then finer),
    // so a finer patch never sits under a neighbour's coarser one.
    const patches = []
    for (const kind of KINDS) {
      const ofKind = regions.filter(r => r.kind === kind)
      for (const [li, level] of LEVELS[kind].entries()) {
        for (const [ri, region] of ofKind.entries()) {
          patches.push(await detailPatch(photoPng, photoW, H, region, level, `${kind}${ri}-${li}`, tmp))
        }
      }
    }

    const outPanelW = Math.round(panelW * scale)
    const panel = await pixelPanel(src, panelW, H, outPanelW, SIZE)

    // Photo layers share one coordinate space — the source photo's pixels —
    // scaled up to fill everything right of the panel.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">` +
      `<svg x="${outPanelW}" y="0" width="${SIZE - outPanelW}" height="${SIZE}" viewBox="0 0 ${photoW} ${H}" preserveAspectRatio="none">` +
        `<svg width="${photoW}" height="${H}" viewBox="0 0 ${base.vw} ${base.vh}" preserveAspectRatio="none">${base.inner}</svg>` +
        patches.join('') +
      '</svg>' +
      `<image x="0" y="0" width="${outPanelW}" height="${SIZE}" style="image-rendering:pixelated" href="data:image/png;base64,${panel.toString('base64')}"/>` +
      '</svg>\n'
    await writeFile(join(dir, 'cover.svg'), svg)

    execFileSync('rsvg-convert', ['-w', String(SIZE), '-h', String(SIZE), '-o', join(tmp, 'cover.png'), join(dir, 'cover.svg')])
    await sharp(join(tmp, 'cover.png')).flatten({ background: '#ffffff' }).jpeg({ quality: 88 }).toFile(join(dir, 'cover.jpg'))
    console.log(`${dir.split('/').pop()}: panel ${panelW}px, ${TRIANGLES} triangles (MSE ${base.score.toFixed(0)}), ` +
      `${KINDS.map(k => `${regions.filter(r => r.kind === k).length} ${k}`).join(', ')}, svg ${(svg.length / 1024).toFixed(0)} KB`)
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}

async function main () {
  const only = process.argv.slice(2)
  const dirs = (await readdir(PODCAST_DIR, { withFileTypes: true }))
    .filter(e => e.isDirectory() && (only.length === 0 || only.includes(e.name)))
    .map(e => join(PODCAST_DIR, e.name))
  for (const dir of dirs) {
    try {
      await access(join(dir, 'artwork-source.png'))
    } catch {
      continue
    }
    await buildCover(dir)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
