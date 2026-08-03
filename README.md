# criticalsignals.nz

## Dev

NOTE: we want to display pages with future dates so

```bash
git submodule update --init --recursive --depth 1
hugo serve --buildFuture
```

For CLI tool which offers interactive configuration:
```bash
npx blowfish-tools
```

## Color Scheme

```bash
cd ..
git clone https://github.com/nunocoracao/fugu.git
cd fugu
npm i
```

Inputs are `<neutral>` `<primary>` `<secondary>`
```bash
./index.js generate F8F4CE 194021 FF00FF > ../criticalsignals.nz/assets/css/schemes/crit-sigs.css 
# NOTE: you may have to go in and comment out the first line
```

Hmm... this didn't really work so ended up manually inspecting which css
was being used then putting the associated codes in:

Green: 194021 => rgb(25, 64, 33)
Cream: F8F4CE => rgb(248, 244, 206)


## Background photos

The full-bleed photos (`static/images/backgrounds/NN.jpeg`, 1920x1080) are
**progressive** JPEGs — they resolve coarse-to-sharp as they download. Every
spot (heroes, image bands, footer) is an `<img>` so the browser renders those
progressive passes in place; the heroes use a `.hero__bg`/`.hero__photo` layer
(see `.hero` in `assets/css/custom.css`) rather than a CSS background, since
CSS backgrounds don't render progressively.

They're built from the high-res originals in the
[draft repo](https://github.com/mixmix/criticalsignalsdraft/tree/main/assets/img):

```bash
./scripts/gen-backgrounds.sh          # all 10, progressive @ q90
./scripts/gen-backgrounds.sh 4 9      # just those
# needs libjpeg-turbo:  brew install jpeg-turbo   (provides djpeg + cjpeg)
# tune with BG_QUALITY (default 90)
```

## Low-poly placeholders (LQIP)

Each background has a tiny low-poly SVG twin in
`static/images/backgrounds/lowpoly/NN.svg` (~6 KB vs ~400–900 KB) that shows an
instant faceted preview while the JPEG loads. All ten are inlined as base64
data-URIs into `window.CS_LOWPOLY` (partial `design/lowpoly-data.html`, emitted
on marketing pages via `extend-footer.html`), so **no placeholder request is
made**. The randomiser in `assets/js/design.js` shuffles the pool per page load
and assigns each `[data-img-spot]` element its JPEG plus the matching inline SVG
(set as the element's `background-image`); the progressive JPEG then resolves
over the facets.

To (re)generate the SVGs from the JPEGs:

```bash
./scripts/gen-lowpoly.sh          # all backgrounds
./scripts/gen-lowpoly.sh 02 07    # just 02.jpeg and 07.jpeg
```

Requirements (macOS):

```bash
brew install go   # builds scripts/lib/lowpoly-warp.go
# Node.js (for npx/SVGO)  — via nvm, brew, or nodejs.org
```

The script's fitter (`scripts/lib/lowpoly-warp.go`) fits N triangles against
the real photo (position, then color/alpha), then tunes 3 shared turbulence
filters — a low-frequency "big wave" over the first 50% of triangles (in
paint order), a "mid" wave over the next 30%, and a high-frequency "small
wave" over the last 20% — searching each tier's frequency/scale for the
boldest warp that stays within an error-tolerance budget of the flat fit (see
that file's header/comments for why it's a budget, not a strict minimum).
It's run several times per image (it's stochastic), the lowest-error result
is kept, then compressed with SVGO. Every (image, attempt) pair is fitted
concurrently, so a full rebuild of all ten is ~2min. Tune with `LOWPOLY_N`
(triangle count, default 100), `LOWPOLY_EFFORT` (how hard each attempt
searches, default 8), `LOWPOLY_ITERS` (attempts/image, default 5),
`LOWPOLY_RES` and `LOWPOLY_JOBS` (concurrency). Budget is far better spent on
EFFORT than on ITERS: at matched CPU cost, 4x the attempts measured 0–2.4%
lower error against 3.9–6.9% for 4x the effort.
Rebuild Hugo afterwards so the inline `CS_LOWPOLY` array updates.

## Deploy

```bash
sudo wg-quick up nikau91
ssh sitedev@10.89.22.91
./update.sh
```
Install site, then when down 

```bash
sudo wg-quick down nikau91
```

