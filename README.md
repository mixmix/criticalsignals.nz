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


## Background low-poly placeholders

The full-bleed background photos (`static/images/backgrounds/NN.jpeg`) each have a
tiny low-poly SVG twin in `static/images/backgrounds/lowpoly/NN.svg` (~6 KB vs
~400 KB). These render instantly as a faceted preview while the JPEG loads
(LQIP): heroes layer `url(jpeg), url(svg)` and image bands show the SVG as the
`<img>` background until the JPEG paints over it (see `assets/js/design.js` and
`.imgband__photo` / `.endband__photo` in `assets/css/custom.css`). The homepage
hero (04) and band (09) are pinned and inline their SVG as a base64 data-URI in
`layouts/partials/home/custom.html`, so they need no request at all.

To (re)generate them from the JPEGs:

```bash
./scripts/gen-lowpoly.sh          # all backgrounds
./scripts/gen-lowpoly.sh 02 07    # just 02.jpeg and 07.jpeg
```

Requirements (macOS):

```bash
brew install go librsvg   # librsvg provides rsvg-convert
# Node.js (for npx/SVGO) — via nvm, brew, or nodejs.org
# fogleman/primitive is auto-installed on first run via `go install`
```

The script runs `primitive` several times per image (it's random), keeps the
closest match by RMSE, then compresses with SVGO. Tune with `LOWPOLY_N`
(triangle count, default 100), `LOWPOLY_ITERS` (passes/image, default 20) and
`LOWPOLY_RES`. Rebuild Hugo afterwards so the homepage picks up the new inline SVGs.

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

