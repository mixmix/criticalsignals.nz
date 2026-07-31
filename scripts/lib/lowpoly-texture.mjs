#!/usr/bin/env node
//
// lowpoly-texture.mjs — bakes 3 turbulence-noise textures into a primitive-
// generated low-poly SVG, applied to its facet <path>s in layering order:
// the first third laid down (the bottom/broadest facets) get a low-frequency
// texture (big, streaky, "broad brushstroke" noise), the middle third a
// finer texture, and the final third (the facets painted on top) the
// finest, smallest-wavelength noise — so the placeholder reads like it was
// built up coarse-to-fine, like brush passes on a canvas.
//
// Run on the output of `primitive` after SVGO has already compacted it (see
// gen-lowpoly.sh), so this only has to match one known, stable shape:
//   <svg ...><path fill="#bg" d="..."/><g fill-opacity="...">
//     <path fill="#c1" d="..."/><path fill="#c2" d="..."/>...
//   </g></svg>
//
// Usage: node lowpoly-texture.mjs <file.svg> <two-digit-index>
import { readFileSync, writeFileSync } from "node:fs";

const [, , file, idxArg] = process.argv;
if (!file || !idxArg) {
  console.error("usage: lowpoly-texture.mjs <file.svg> <index>");
  process.exit(1);
}
const idx = String(idxArg).padStart(2, "0");
const svg = readFileSync(file, "utf8").trim();

const shape = /^(<svg[^>]*>)(<path[^>]*\/>)(<g[^>]*>)(.*)(<\/g><\/svg>)$/s.exec(svg);
if (!shape) {
  console.error(`✗ ${file}: unexpected SVG structure, skipping texture pass`);
  process.exit(1);
}
const [, svgOpen, bgPath, gOpen, facetsHtml, gClose] = shape;
const facets = facetsHtml.match(/<path[^>]*\/>/g) || [];
if (!facets.length) {
  console.error(`✗ ${file}: no facet paths found, skipping texture pass`);
  process.exit(1);
}

// Coarse-to-fine noise tiers. baseFrequency sets the noise wavelength (lower =
// broader features); "low" also uses uneven x/y frequencies to stretch the
// noise into streaks, reading more like a brushstroke than isotropic grain.
// Seeded per-image (from its index) so the ten backgrounds don't all share
// the exact same grain.
const seed = idx.charCodeAt(0) * 31 + idx.charCodeAt(1);
const tiers = [
  { key: "low", freq: "0.006 0.018", octaves: 2, seed: seed + 1 },
  { key: "mid", freq: "0.035", octaves: 2, seed: seed + 2 },
  { key: "high", freq: "0.15", octaves: 2, seed: seed + 3 },
];

// Each filter: greyscale the turbulence noise, clip it to the facet's own
// alpha (so it never spills past the triangle it's applied to), then overlay-
// blend it onto the facet's colour — darkening/lightening it into a mottled,
// painted texture rather than just tinting it grey.
const filterDefs = tiers
  .map((t) => (
    `<filter id="t${idx}-${t.key}">` +
    `<feTurbulence type="fractalNoise" baseFrequency="${t.freq}" numOctaves="${t.octaves}" seed="${t.seed}" result="n"/>` +
    `<feColorMatrix in="n" type="matrix" values="0.33 0.33 0.33 0 0 0.33 0.33 0.33 0 0 0.33 0.33 0.33 0 0 0 0 0 1 0" result="g"/>` +
    `<feComposite in="g" in2="SourceAlpha" operator="in" result="c"/>` +
    `<feBlend in="SourceGraphic" in2="c" mode="overlay"/>` +
    `</filter>`
  ))
  .join("");

// Split facets into thirds in paint order (first drawn = bottom layer).
const n = facets.length;
const cut1 = Math.round(n / 3);
const cut2 = Math.round((2 * n) / 3);
const textured = facets.map((p, i) => {
  const tier = i < cut1 ? tiers[0] : i < cut2 ? tiers[1] : tiers[2];
  return p.replace(/\/>$/, ` filter="url(#t${idx}-${tier.key})"/>`);
});

writeFileSync(file, `${svgOpen}<defs>${filterDefs}</defs>${bgPath}${gOpen}${textured.join("")}${gClose}`);
