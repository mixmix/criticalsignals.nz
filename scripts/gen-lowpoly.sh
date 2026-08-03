#!/usr/bin/env bash
#
# gen-lowpoly.sh — (re)generate the low-poly SVG placeholders for the site's
# background photos, used as instant LQIP previews while the full JPEG loads.
#
# For each static/images/backgrounds/NN.jpeg, scripts/lib/lowpoly-warp.go:
#   1. fits N triangles (position, then color/alpha) against the real photo,
#      via successive-halving search over incrementally-updated aggregate
#      stats — see that file's header for why;
#   2. tunes 3 shared turbulence "wave" filters against fixed tiers of the
#      paint order (first 50% get a low-frequency "big wave", next 30% a
#      "mid" wave, last 20% a high-frequency "small wave"), searching each
#      tier's baseFrequency/scale for the boldest warp that stays within an
#      error-tolerance budget of the flat (untextured) fit — see that file's
#      errorBudget comment for why it's a budget and not a strict minimum.
#
# Run ITERS times per image (stochastic), lowest final error kept, then
# compressed with SVGO — writing static/images/backgrounds/lowpoly/NN.svg.
#
# Usage:
#   ./scripts/gen-lowpoly.sh            # regenerate all backgrounds
#   ./scripts/gen-lowpoly.sh 02 07      # regenerate only 02.jpeg and 07.jpeg
#
# Tunables (env vars):
#   LOWPOLY_N=100      triangle count (lower = more abstract, smaller file)
#   LOWPOLY_ITERS=5    independent fitting attempts per image; lowest final
#                      error wins. Each attempt already runs its own internal
#                      successive-halving search, so this mainly guards
#                      against a globally unlucky random seed, not a
#                      substitute for it — keep it small. Measured at equal
#                      CPU cost, 4x the attempts bought 0–2.4% lower error
#                      while 4x the EFFORT bought 3.9–6.9%, so spend budget
#                      there first.
#   LOWPOLY_EFFORT=8   how hard each attempt searches: multiplies the width of
#                      the wide-net rounds and the length of every hill-climb,
#                      in both the triangle fit and the wave tuning. Cost is
#                      roughly linear in it; error gains flatten out past ~4
#                      on most images, but the awkward ones keep improving to
#                      8, and it's never been worse there.
#   LOWPOLY_RES=384    working canvas width the fitter searches against
#   LOWPOLY_SUFFIX=    writes NN.<suffix>.svg instead of overwriting NN.svg —
#                      handy while iterating on the look (LOWPOLY_SUFFIX=new).
#                      Empty by default: output goes straight to NN.svg
#   LOWPOLY_JOBS=<cpus> how many fitting attempts to run concurrently. Every
#                      (image, seed) pair is independent and the fitter itself
#                      is single-threaded, so this is what keeps the other
#                      cores busy — the default (all of them) is usually right.
#
# Requirements: Go (builds lowpoly-warp.go), Node (npx, for SVGO compression).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC="$ROOT/static/images/backgrounds"
OUT="$SRC/lowpoly"

N="${LOWPOLY_N:-100}"
ITERS="${LOWPOLY_ITERS:-5}"
RES="${LOWPOLY_RES:-384}"
EFFORT="${LOWPOLY_EFFORT:-8}"
SUFFIX="${LOWPOLY_SUFFIX-}"
JOBS="${LOWPOLY_JOBS:-$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 4)}"

# --- dependency checks -------------------------------------------------------
need() { command -v "$1" >/dev/null 2>&1 || { echo "✗ missing '$1' — $2" >&2; exit 1; }; }
need go  "install Go: https://go.dev/dl/"
need npx "install Node.js (bundles npx): https://nodejs.org/"

# --- setup -------------------------------------------------------------------
mkdir -p "$OUT"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
WARP="$TMP/lowpoly-warp"
go build -o "$WARP" "$SCRIPT_DIR/lib/lowpoly-warp.go"

# which images: args (basenames without .jpeg) or every jpeg in $SRC
imgs=()
if [ "$#" -gt 0 ]; then
  imgs=("$@")
else
  for f in "$SRC"/*.jpeg; do imgs+=("$(basename "$f" .jpeg)"); done
fi

echo "settings: N=$N triangles, ITERS=$ITERS attempts/image, EFFORT=$EFFORT, RES=$RES, SUFFIX=${SUFFIX:-<none>}, JOBS=$JOBS"

# drop any images with no source jpeg before we build the job list
todo=()
for i in "${imgs[@]}"; do
  if [ ! -f "$SRC/$i.jpeg" ]; then echo "  skip $i (no $SRC/$i.jpeg)"; continue; fi
  todo+=("$i")
done
[ "${#todo[@]}" -eq 0 ] && { echo "nothing to do"; exit 0; }

# --- fit ---------------------------------------------------------------------
# Every (image, seed) pair is an independent run of a single-threaded fitter,
# so they all go out at once and the reduce pass below picks each image's
# winner. Seeds are fixed per attempt, so the chosen SVGs are identical to
# running the pairs one after another — only the wall-clock changes.
# Each job writes $TMP/NN_K.svg and drops its final error in $TMP/NN_K.score.
echo "→ fitting $((${#todo[@]} * ITERS)) attempts across $JOBS jobs…"
for i in "${todo[@]}"; do
  for k in $(seq 1 "$ITERS"); do printf '%s\n%s\n' "$i" "$k"; done
done | WARP="$WARP" N="$N" RES="$RES" EFFORT="$EFFORT" SRC="$SRC" TMP="$TMP" \
  xargs -P "$JOBS" -n 2 bash -c '
    set -euo pipefail
    "$WARP" -n "$N" -res "$RES" -effort "$EFFORT" -seed "$2" "$SRC/$1.jpeg" "$TMP/${1}_$2.svg" \
      > "$TMP/${1}_$2.score"
    printf "  %s seed %s  error=%s\n" "$1" "$2" "$(cat "$TMP/${1}_$2.score")"
  ' _

# --- reduce: keep each image's lowest-error attempt --------------------------
done_svgs=()
for i in "${todo[@]}"; do
  out_svg="$OUT/$i${SUFFIX:+.$SUFFIX}.svg"
  best=""; bestscore=""
  for k in $(seq 1 "$ITERS"); do
    read -r s < "$TMP/${i}_$k.score"
    # keep the candidate with the smallest final error (float compare via awk)
    if [ -z "$bestscore" ] || awk "BEGIN{exit !($s < $bestscore)}"; then
      bestscore="$s"; best="$TMP/${i}_$k.svg"
    fi
  done
  cp "$best" "$out_svg"
  done_svgs+=("$out_svg")
  printf '  %s  best error=%s\n' "$i" "$bestscore"
done

# --- compress (only the images we just (re)generated, in place) --------------
# One svgo process for the whole batch: it takes matching input/output lists,
# and a single node startup beats paying ~0.9s of it per file (running several
# `npx` copies concurrently instead would race on the npx package cache).
echo "→ compressing with SVGO…"
npx -y svgo@latest --quiet --config "$SCRIPT_DIR/lib/svgo.config.mjs" \
  "${done_svgs[@]}" -o "${done_svgs[@]}"

for svg in "${done_svgs[@]}"; do printf '+ %s\n' "$(basename "$svg")"; done
echo "✓ done → $OUT"
