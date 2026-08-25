# criticalsignals.nz

## Dev

NOTE: we want to display pages with future dates so

```bash
git submodule update --init --recursive --depth 1
hugo serve --buildFuture --bind 0.0.0.0
```

For CLI tool which offers interactive configuration:
```bash
npx blowfish-tools
```

## Recurring events

An event usually carries a single `date:`. Something that runs on many days
takes a `dates:` list instead:

```yaml
dates:
  - 2026-08-11
  - 2026-08-12
start_time: "10:00"
end_time: "14:00"
calendar_symbol: "☕"   # optional, one character
```

It stays **one page**, and `start_time`/`end_time` apply to every date. It then
appears:

- on `/programme` — once under **each** date it runs on;
- on the calendar — in every one of those day cells; if `calendar_symbol` is set
  the day is marked with that glyph on its top row, beside the date, instead of
  the event taking a slot in the cell's list. It must be a single character —
  anything longer is trimmed, with a warning at build time;
- on the homepage's Upcoming Events — once, dated by its next session;
- on its own page — the next three sessions, with the full run (past dates
  greyed) behind a "Show all dates" toggle.

The dates are read via `partials/programme/dates.html`, which every one of those
surfaces goes through, so `date:` and `dates:` events stay interchangeable.

## Event types

Every programme event carries an `event_type:` in its front matter, which puts
a small icon in the slot to the left of its name on `/programme`, on the
homepage's Upcoming Events, and in the `/_admin/programme/` audit table.

For events synced from Ticket Tailor, set it by putting a line of its own in
the event description:

```
Type: Workshop
```

`scripts/build-programme.mjs` lifts that line out of the description (so it
never shows up in the page body) and writes it to front matter. The five
recognised types are **Social**, **Workshop**, **Talk**, **Screening** and
**Community Building**. Hand-authored pages just set `event_type:` themselves.

Matching is forgiving, since nobody writes these the same way twice — it
ignores case and punctuation, and drops a trailing "event"/"events". So all of
`Community Building`, `community building event`, `Community-Building-Events`
and `COMMUNITY BUILDING` land on the one type, and get written to front matter
in its canonical spelling.

Anything else leaves the event untyped: no icon on the public pages (the slot
stays empty, so titles still line up) and a 🔥 next to its name on
`/_admin/programme/` saying what needs fixing. Two ways in, which the audit
tells apart — no `Type:` line at all, in which case the sync leaves
`event_type` off the page entirely, or a value that isn't one of the five,
which is written through as-is so the 🔥 can quote it back at you.

The icons live in `assets/images/event-types/<slug>.svg`, one per type, named
after the slugified type (`community-building.svg`). They're inlined into the
page rather than linked, so a downloaded icon needs a little tidying before it
goes in:

- `fill="currentColor"` on the `<svg>`, so it picks up the ink colour of
  whatever it's sitting on (dark on cream, cream on dark) rather than being
  stuck black;
- no `<?xml ?>` prolog — it's not valid inside HTML;
- no `id=`/`data-name=` attributes — the same icon is inlined many times on
  one page, and exported icons all carry the same `id="Layer_1"`, so they'd
  land as duplicate IDs in the DOM;
- no `width`/`height` on the `<svg>` (exports often say `512`) — sizing is the
  stylesheet's job;
- keep the `viewBox`.

Adding a sixth type means touching three places, which name each other in their
comments: `EVENT_TYPES` in `scripts/build-programme.mjs`, the list in
`layouts/partials/programme/type.html`, and a new SVG in
`assets/images/event-types/`.

NOTE the front matter key is `event_type`, not `type`: `type` is reserved by
Hugo for a page's content type, and setting it would send these pages looking
for a `layouts/Workshop/` template.

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

The full-bleed photos (`static/images/backgrounds/NN.webp`, 1920x1080) are
plain files in `static/`, referenced by a hardcoded `/images/backgrounds/NN.webp`
string built in `assets/js/design.js` (the `pool` array in `randomiseImages`) —
unlike every other image on the site, they don't go through Hugo's
`.Resize`/`.Fill` pipeline (see "WebP" below), so there's no automatic
conversion or resizing here; whatever's in that folder is what ships.

Every spot (heroes, image bands, footer) is an `<img>` rather than a CSS
background, since that's what the low-poly SVG placeholder + JS fade-in (see
"Low-poly placeholders" below) needs to layer against.

They're built from the high-res originals in the
[draft repo](https://github.com/mixmix/criticalsignalsdraft/tree/main/assets/img):

```bash
./scripts/gen-backgrounds.sh          # all 10, webp @ q85
./scripts/gen-backgrounds.sh 4 9      # just those
# needs webp:  brew install webp   (provides cwebp)
# tune with BG_QUALITY (default 85)
```

These used to be progressive JPEGs (coarse-to-sharp as they downloaded).
WebP has no equivalent to that multi-scan decoding, so that specific
resolve-in-place effect is gone — the low-poly SVG placeholder + fade-in is
what now carries the "appearing" feel instead. Traded for meaningfully
smaller files (~30% smaller across the ten, even at a high quality setting).

## Low-poly placeholders (LQIP)

Each background has a tiny low-poly SVG twin in
`static/images/backgrounds/lowpoly/NN.svg` (~6 KB vs ~200–750 KB) that shows an
instant faceted preview while the photo loads. All ten are inlined as
URL-encoded (not base64 — smaller, and compresses better under gzip; see
`design/svg-url-encode.html`) data-URIs into `window.CS_LOWPOLY` (partial
`design/lowpoly-data.html`, emitted
on marketing pages via `extend-footer.html`), so **no placeholder request is
made**. The randomiser in `assets/js/design.js` shuffles the pool per page load
and assigns each `[data-img-spot]` element its photo plus the matching inline
SVG (set as the element's `background-image`); the photo fades in over the
facets once it decodes.

To (re)generate the SVGs from the backgrounds:

```bash
./scripts/gen-lowpoly.sh          # all backgrounds
./scripts/gen-lowpoly.sh 02 07    # just 02.webp and 07.webp
```

Requirements (macOS):

```bash
brew install go librsvg webp   # librsvg provides rsvg-convert, webp provides dwebp
# Node.js (for npx/SVGO) — via nvm, brew, or nodejs.org
# fogleman/primitive is auto-installed on first run via `go install`
```

The script runs `primitive` several times per image (it's random), keeps the
closest match by RMSE, then compresses with SVGO. Tune with `LOWPOLY_N`
(triangle count, default 100), `LOWPOLY_ITERS` (passes/image, default 20) and
`LOWPOLY_RES`. Rebuild Hugo afterwards so the inline `CS_LOWPOLY` array updates.

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

