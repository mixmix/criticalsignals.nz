#!/usr/bin/env bash
#
# gen-lowpoly.sh — (re)generate the low-poly SVG placeholders for the site's
# background photos, used as instant LQIP previews while the full photo loads.
#
# For each assets/images/backgrounds/NN.webp it runs fogleman/primitive several
# times (it's stochastic), keeps the closest match by RMSE, then compresses the
# winner with SVGO — writing static/images/backgrounds/lowpoly/NN.svg.
#
# primitive only decodes JPEG/PNG, not WebP, so each source is first decoded
# to a temporary PNG (via dwebp) and primitive/scoring both run against that.
#
# Usage:
#   ./scripts/gen-lowpoly.sh            # regenerate all backgrounds
#   ./scripts/gen-lowpoly.sh 02 07      # regenerate only 02.webp and 07.webp
#
# Tunables (env vars):
#   LOWPOLY_N=100      triangle count (lower = more abstract, smaller file)
#   LOWPOLY_ITERS=20   randomised passes per image; the best (lowest MSE) is kept
#   LOWPOLY_RES=384    resolution primitive fits against (higher = finer, slower)
#
# Requirements: Go, librsvg (rsvg-convert), Node (npx), webp (dwebp). See
# README "Background low-poly placeholders". primitive is auto-installed via
# `go install` if missing.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# The 1920x1080 masters live in assets/ so Hugo can build the responsive width
# ladder from them. The low-poly placeholders stay in static/: they are read at
# build time by layouts/partials/design/lowpoly-css.html (which inlines them into
# the CSS bundle as custom properties) and served verbatim as design.js's
# fallback, so they need a stable public path and no processing.
SRC="$ROOT/assets/images/backgrounds"
OUT="$ROOT/static/images/backgrounds/lowpoly"

N="${LOWPOLY_N:-100}"
ITERS="${LOWPOLY_ITERS:-20}"
RES="${LOWPOLY_RES:-384}"
RENDER_W=480   # width the candidate SVG is rasterised to for scoring

# --- dependency checks -------------------------------------------------------
need() { command -v "$1" >/dev/null 2>&1 || { echo "✗ missing '$1' — $2" >&2; exit 1; }; }
need go   "install Go: https://go.dev/dl/"
need rsvg-convert "install librsvg: brew install librsvg"
need npx  "install Node.js (bundles npx): https://nodejs.org/"
need dwebp "install webp: brew install webp"

export PATH="$PATH:$(go env GOPATH)/bin"
if ! command -v primitive >/dev/null 2>&1; then
  echo "→ installing fogleman/primitive…"
  go install github.com/fogleman/primitive@latest
fi

# --- setup -------------------------------------------------------------------
mkdir -p "$OUT"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
SCORE="$TMP/score"
go build -o "$SCORE" "$SCRIPT_DIR/lib/lowpoly-score.go"

# which images: args (basenames without .webp) or every webp in $SRC
imgs=()
if [ "$#" -gt 0 ]; then
  imgs=("$@")
else
  for f in "$SRC"/*.webp; do imgs+=("$(basename "$f" .webp)"); done
fi

echo "settings: N=$N triangles, ITERS=$ITERS passes/image, RES=$RES"

done_svgs=()
for i in "${imgs[@]}"; do
  webp="$SRC/$i.webp"
  if [ ! -f "$webp" ]; then echo "  skip $i (no $webp)"; continue; fi
  # primitive only decodes JPEG/PNG — decode to a temporary PNG first
  src="$TMP/$i.png"
  dwebp -quiet "$webp" -o "$src"
  best=""; bestscore=""
  for k in $(seq 1 "$ITERS"); do
    cand="$TMP/${i}_$k.svg"
    primitive -i "$src" -o "$cand" -n "$N" -m 1 -r "$RES" >/dev/null 2>&1
    rsvg-convert -w "$RENDER_W" "$cand" -o "$TMP/${i}_$k.png" 2>/dev/null
    s="$("$SCORE" "$src" "$TMP/${i}_$k.png")"
    # keep the candidate with the smallest MSE (float compare via awk)
    if [ -z "$bestscore" ] || awk "BEGIN{exit !($s < $bestscore)}"; then
      bestscore="$s"; best="$cand"
    fi
  done
  cp "$best" "$OUT/$i.svg"
  done_svgs+=("$OUT/$i.svg")
  printf '  %s  best MSE=%s\n' "$i" "$bestscore"
done

# --- compress (only the images we just (re)generated, in place) --------------
echo "→ compressing with SVGO…"
for svg in "${done_svgs[@]}"; do
  npx -y svgo@latest --quiet --config "$SCRIPT_DIR/lib/svgo.config.mjs" "$svg" -o "$svg"
done

echo "✓ done → $OUT"
