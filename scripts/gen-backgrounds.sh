#!/usr/bin/env bash
#
# gen-backgrounds.sh — (re)build the site's background photos from the
# high-resolution originals in the draft repo, as WebP.
#
# Source images are the untouched 1920x1080 originals — we don't re-compress
# the already-shipped files.
#
# Writes static/images/backgrounds/NN.webp (01..10).
#
# Usage:
#   ./scripts/gen-backgrounds.sh              # all 10
#   ./scripts/gen-backgrounds.sh 4 9          # just 4.jpeg -> 04.webp, 9 -> 09.webp
#
# Tunables:
#   BG_QUALITY=85     WebP quality (default balances size against the
#                     large full-bleed display size of these photos)
#   BG_SRC_REPO       raw base URL of the originals (default: the draft repo)
#
# Requirements: curl, webp (cwebp). macOS: `brew install webp`.
# After running, refresh the low-poly placeholders with ./scripts/gen-lowpoly.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT="$ROOT/static/images/backgrounds"

QUALITY="${BG_QUALITY:-85}"
REPO="${BG_SRC_REPO:-https://raw.githubusercontent.com/mixmix/criticalsignalsdraft/main/assets/img}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "✗ missing '$1' — $2" >&2; exit 1; }; }
need curl  "install curl"
need cwebp "install webp: brew install webp"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

nums=("$@"); [ "$#" -eq 0 ] && nums=(1 2 3 4 5 6 7 8 9 10)

echo "quality=$QUALITY webp, source=$REPO"
for n in "${nums[@]}"; do
  nn="$(printf '%02d' "$n")"
  if ! curl -fsSL "$REPO/$n.jpeg" -o "$TMP/$n.jpeg"; then echo "  ✗ $n (download failed)"; continue; fi
  cwebp -quiet -q "$QUALITY" -m 6 "$TMP/$n.jpeg" -o "$OUT/$nn.webp"
  printf '  %s  %dKB\n' "$nn" "$(( $(stat -f%z "$OUT/$nn.webp") / 1024 ))"
done

echo "✓ done → $OUT   (now run ./scripts/gen-lowpoly.sh to refresh placeholders)"
