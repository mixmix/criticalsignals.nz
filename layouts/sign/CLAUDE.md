# `/sign/` — the venue signage board

`sign.html` renders `https://criticalsignals.nz/sign/`: a full-screen event
board showing what is on now, or what is next with a countdown. It is driven
by `content/sign.md` (`type: sign`, `layout: sign`).

**Before changing anything in this folder, read the constraints below.** They
are not stylistic preferences. They were each established by something failing
on the actual hardware.

## The hardware

The target is a **Samsung DM65E from 2016**, mounted portrait at 113 Taranaki
Street, running **Tizen 2.4** with a browser engine around **Chromium 47**.
It has had no firmware updates since. Nothing else renders this page in
production, so "it works in Chrome" proves nothing.

## Hard constraints

### 1. The JavaScript must be ES5

No arrow functions, no `let`/`const`, no template literals, no `fetch`, no
`Promise`, no classes, no spread, no `Object.assign`, no default or rest
parameters, no `for...of`.

This fails **silently**. Chromium 47 throws a syntax error while parsing the
whole `<script>` block, nothing executes, and the panel shows a black screen
with no console you can reach from the floor. There is no error to find. You
will only know by looking at the wall.

If you ever add a build step, a bundler, or a different minifier to this file,
verify the *output* is still ES5 — not just the source.

### 2. No external assets. None.

No webfonts, no external stylesheets, no external scripts, no `<img src>`, no
CDN anything. The panel's network access is unreliable and at times absent
entirely; anything fetched by URL fails and takes the page down with it.

The spore mark is an inlined `<svg>` for exactly this reason. Do not move it
into `assets/` or `static/`, and do not let Hugo's asset pipeline rewrite it
into an external file.

The single permitted request is `rev.json` (see below), and it is guarded so
a 404 is harmless.

### 3. No `localStorage` / `sessionStorage`

Unavailable on this panel. Everything is recomputed on each render.

### 4. Standalone document — no theme shell

`sign.html` deliberately does **not** open with a `define "main"` block. That
is what keeps Hugo from wrapping it in Blowfish's `baseof.html`, which would
drag in the nav, footer, theme CSS, webfonts and Blowfish's own JavaScript —
all of which violate the rules above and fight the fixed canvas.

If you find yourself adding `define`, stop.

### 5. Fixed canvas, scaled by JS

1920×1080 landscape / 1080×1920 portrait, scaled to fit by `fit()`. This is
not a responsive layout in the usual sense. Don't add media queries expecting
them to help.

### 6. `hugo --minify` runs in CI, and it will happily break this page

The deploy workflow builds with `--minify`, which minifies this file's inline
CSS and JS. **The minifier is capable of introducing post-ES5 syntax.** It was
caught rewriting `catch (e) { ... }` into `catch { ... }` — ES2019 optional
catch binding, a SyntaxError on this panel, and therefore a black screen. That
failure appears *only* in the minified build, so `hugo server` looks perfect
while production is dead.

`version = 5` under `[minify.tdewolff.js]` in `config/_default/hugo.toml` pins
the minifier's output target and is what prevents this. Do not remove it. It
constrains only what minification may emit — it does not transpile, so the
theme's own JavaScript is unaffected.

After any substantial edit here, build with `--minify` to a scratch directory
and check the *built* file, not the source. Grepping for `=>` is not enough;
optional catch binding, `?.`, `??` and `**` all need checking too.

## Timezone

`Pacific/Auckland` is hardcoded, in two places, on purpose.

- **Build time** (`sign.html` header): Go formats each event's ISO timestamp
  with a real offset for that specific date, so August events emit `+12:00`
  and October events emit `+13:00` after NZDT begins on 27 September 2026.
  Never hardcode the *offset* — only the zone.
- **Run time** (`nzOffset`): the NZST/NZDT rule is spelled out in ES5 because
  Chromium 47 has no usable IANA timezone data, and the panel's own timezone
  setting is not trustworthy. Displayed event times are derived from the
  offsets baked into the ISO strings, never from the panel's clock. Only the
  countdown depends on the panel clock being roughly right.

There is no `timeZone` set in `config/_default/hugo.toml`, and this page does
not need one. Adding one is a site-wide behaviour change affecting the
homepage and programme list — out of scope here.

## Rotation

An event is **featured** from `FEATURE_BEFORE_MS` before it starts until
`FEATURE_AFTER_MS` after it started, or until it ends, whichever is later —
the window in which people are arriving or already in the room. `FEATURE_MODE`
decides what the board does about it:

- `'interleave'` (current) — the featured event takes every second panel:
  featured, coming up 2 of N, featured, coming up 3 of N, and so on. The
  feature counts as panel 1, so the rotation is numbered from 2 and `total`
  includes it. The featured event is removed from the rotation list by
  `without()`, otherwise a not-yet-started feature would appear twice, two
  panels apart.
- `'pin'` — the board shows only the featured event and stops rotating. The
  original behaviour, kept working.
- `'off'` — no special treatment.

With no featured event the board pages through the next `CYCLE_MAX` upcoming
events, or all of them if fewer remain.

`advance()` is what makes interleaving work: it alternates `featureTurn` and
only steps `cycleIdx` when leaving a rotation panel, so every upcoming event
gets its own slot instead of every second one being skipped.

Note that `upcoming()` only returns events that have not started. An event in
progress therefore reaches the board *only* as the feature — under
`FEATURE_MODE = 'off'` it would not appear at all and the "Happening now" pill
would never render.

All the knobs are constants at the top of the display-loop section of
`sign.html`. `CYCLE_HOLD_MS` is the *whole* slide including both fades, so if
you change `FADE_MS` you must change the `#inner` CSS transition to match.

Motion is deliberately transform/opacity-only so the panel composites rather
than repaints. Three layers: the crossfade on `#inner`; `#spore` translated by
JS to a random spot in the upper area on every slide (and every
`SPORE_IDLE_MS` when the copy is pinned), eased by a CSS transition; and
`#sporespin` rotating underneath on its own animation. Translation and
rotation are on separate elements on purpose — one element cannot hold two
competing `transform` values.

In a desktop console, `SIGN.next()` advances the rotation by hand and
`SIGN.state()` reports the current mode.

## QR codes

Each slide shows a QR pointing at that event's own page, plus the site address
above the footer rule. **This is fully automatic** — `images.QR` generates the
code at build time from `$p.Permalink`, and `.Content | base64Encode` inlines
it as a `data:` URI. Adding an event to `content/programme/` is all that is
required; its QR appears on the next build. There is no external service, no
committed image, and nothing to run by hand.

The `.Content | base64Encode` step is load-bearing: publishing the QR as a
file would put a `<img src="/...">` on the page, which the panel cannot fetch.
Keep it inlined. Each code adds roughly 2KB to the page.

**The domain is hardcoded as `$signBase`, not taken from `Permalink`.** This
matters: `Permalink` follows `baseURL`, and the board is served to the panel
by `hugo server` over the LAN, so deriving it would bake
`http://192.168.x.x:1313/...` into every code — worthless to anyone scanning
it. The phone is on the internet, not the venue network, so the code must
carry the public address no matter where the page is served from. Building
with `--baseURL http://192.168.68.56:1313/` and diffing the QR payloads
against a normal build is the way to check this still holds; they must be
byte-identical.

## Keeping an event off the sign

`showOnSign: false` in an event's front matter excludes it from the board
while leaving it everywhere else on the site. Kiekie Koha Coffee Hours uses
this: it runs most days, so it crowded the rotation out.

## Where the data comes from

`EVENTS` is generated by Hugo from `content/programme/` via
`layouts/partials/programme/occurrences.html`. Do not edit the array; edit the
event's `index.md`.

**Do not pick the current-or-next event in Go templates.** Hugo's `now`
evaluates at build time and the site only rebuilds on push to `main`, so the
sign would advertise a finished event until someone next deployed. Hugo emits
every non-past occurrence; the client-side `pick()` chooses, re-running every
20 seconds. That is also what keeps the board correct across midnight and
across the end of one event into the next.

Excluded automatically: `draft: true` events, and `dateTBC:` events (which
`programme/dates.html` gives no dates, so they never produce an occurrence).

## `rev.json`

`/sign/rev.json` is emitted by the `SIGNREV` output format
(`config/_default/hugo.toml`) from `sign.json` in this folder, and contains the
build timestamp. The page polls it every 10 seconds and reloads when the value
changes, so a deploy reaches the screen on its own. The poll is wrapped so a
missing file is a no-op — the board keeps working if it 404s.

## Serving

The panel is pointed at a **plain HTTP** URL. GitHub Pages must not force a
redirect to HTTPS: this panel's certificate store is from 2016, it does not
speak TLS 1.3, and the Let's Encrypt cross-signed root it trusts expired in
2021. Always use the trailing slash — `/sign/` not `/sign` — so the old
browser doesn't have to follow a 301.

`tmp/signage-kit/` holds the original prototype and a local Python server.
That local path is currently the only route proven to work on this panel.
Don't break it.
