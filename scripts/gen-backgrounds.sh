#!/usr/bin/env bash
#
# gen-backgrounds.sh — (re)build the site's background photos from the
# high-resolution originals in the draft repo, as optimised *progressive* JPEGs.
#
# Progressive JPEGs render coarse-to-sharp (they "resolve" in place) as bytes
# arrive, which the <img> heroes and bands lean on. Source images are the
# untouched 1920x1080 originals — we don't re-compress the already-shipped files.
#
# Writes static/images/backgrounds/NN.jpeg (01..10).
#
# Usage:
#   ./scripts/gen-backgrounds.sh              # all 10
#   ./scripts/gen-backgrounds.sh 4 9          # just 4.jpeg -> 04.jpeg, 9 -> 09
#
# Tunables:
#   BG_QUALITY=90     JPEG quality (progressive re-encode from the originals)
#   BG_SRC_REPO       raw base URL of the originals (default: the draft repo)
#
# Requirements: curl, libjpeg-turbo (djpeg + cjpeg). macOS: `brew install jpeg-turbo`.
# After running, refresh the low-poly placeholders with ./scripts/gen-lowpoly.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT="$ROOT/static/images/backgrounds"

QUALITY="${BG_QUALITY:-90}"
REPO="${BG_SRC_REPO:-https://raw.githubusercontent.com/mixmix/criticalsignalsdraft/main/assets/img}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "✗ missing '$1' — $2" >&2; exit 1; }; }
need curl  "install curl"
need djpeg "install libjpeg-turbo: brew install jpeg-turbo"
need cjpeg "install libjpeg-turbo: brew install jpeg-turbo"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

nums=("$@"); [ "$#" -eq 0 ] && nums=(1 2 3 4 5 6 7 8 9 10)

echo "quality=$QUALITY progressive, source=$REPO"
for n in "${nums[@]}"; do
  nn="$(printf '%02d' "$n")"
  if ! curl -fsSL "$REPO/$n.jpeg" -o "$TMP/$n.jpeg"; then echo "  ✗ $n (download failed)"; continue; fi
  # decode the original, re-encode as an optimised progressive JPEG
  djpeg "$TMP/$n.jpeg" 2>/dev/null | cjpeg -progressive -optimize -quality "$QUALITY" > "$OUT/$nn.jpeg" 2>/dev/null
  printf '  %s  %dKB\n' "$nn" "$(( $(stat -f%z "$OUT/$nn.jpeg") / 1024 ))"
done

echo "✓ done → $OUT   (now run ./scripts/gen-lowpoly.sh to refresh placeholders)"
