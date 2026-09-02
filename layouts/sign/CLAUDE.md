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
them to help. The one exception is phones — see "Phones" below, and note that
it is not a media query either.

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

`Pacific/Auckland` is hardcoded, in three places, on purpose.

- **Build time, per-event offsets** (`sign.html` header): Go formats each
  event's ISO timestamp with a real offset for that specific date, so August
  events emit `+12:00` and October events emit `+13:00` after NZDT begins on
  27 September 2026. Never hardcode the *offset* — only the zone.
- **Build time, `now`** (`$cutoff`, and every other build-time "today"/"N
  days ago" comparison sitewide): Hugo's `now` reflects the build machine's
  own clock and zone, which is UTC in CI and whatever a developer's laptop is
  set to locally — never Wellington's. `layouts/partials/now-nzt.html`
  re-anchors it to Pacific/Auckland via `time.In` before anything compares
  against it. Do not compare bare `now` against an event date anywhere;
  go through that partial.
- **Run time** (`nzOffset`): the NZST/NZDT rule is spelled out in ES5 because
  Chromium 47 has no usable IANA timezone data, and the panel's own timezone
  setting is not trustworthy. Displayed event times are derived from the
  offsets baked into the ISO strings, never from the panel's clock. Only the
  countdown depends on the panel clock being roughly right.

`config/_default/hugo.toml` sets `timeZone = "Pacific/Auckland"`, which fixes
how Hugo parses front-matter dates that carry no explicit offset (`date:`,
`dates:` are plain `"2026-08-06"` strings) — it does **not** affect `now`,
hence the separate partial above. This was a site-wide change (it also
touches the homepage and programme list), made together with introducing
`now-nzt.html`.

## Rotation

An event is **featured** from `FEATURE_BEFORE_MS` (30 minutes) before it
starts until it ends — doors open to lights up, the window in which people are
either arriving or already in the room. The moment it finishes the board drops
straight back to plain rotation. `FEATURE_MODE` decides what the board does
about a featured event, and it has **exactly two settings**:

- `'pin'` (current) — the board shows only the featured event and stops
  rotating. Inside the window the board has one job, which is the thing
  happening in the room behind it, and that is also the window in which it
  asks for koha — see "Koha" below. The two go together: the call to action
  follows the pin, so under `'interleave'` it would blink in and out with the
  feature.
- `'interleave'` — the featured event takes every second panel: featured,
  coming up 2 of N, featured, coming up 3 of N, and so on. The feature counts
  as panel 1, so the rotation is numbered from 2 and `total` includes it. The
  featured event is removed from the rotation list by `without()`, otherwise a
  not-yet-started feature would appear twice, two panels apart. Kept working.

There is no third setting and there should not be. `upcoming()` only returns
events that have not started, so an event in progress reaches the board **only**
as the feature — anything that switched featuring off would drop the running
event off the board entirely, and the "On now" pill would never render at all.
There was an `'off'` for a while; it is gone. `SIGN.state()` also used to
report a mode of `'cycle'` when nothing was featured, which is a *status*, not
a setting, and was most of why this looked like it had four options. It now
reports `mode` (the setting) and `showing` (`'feature'` or `'rotation'`)
separately.

With no featured event the board pages through everything still to come. There
is no cap on that, but there is one slide per event, not one per date — see
"Recurring events" below — and every three slides the koha panel takes a
turn.

`rotationList()` is the one place that answer is computed: everything still to
come, collapsed to one slide per series, minus the feature. Both
`currentView()` and `advance()` read it, so they cannot disagree about what
the rotation contains.

There is an earlier rule you may find traces of, in which a feature lingered
for three hours after it started. That was wrong — it kept a finished event on
the board with a stale "Happening now" long after everyone had left. Don't
reintroduce it.

`advance()` is what makes interleaving work: it alternates `featureTurn` and
only steps `cycleIdx` when leaving a rotation panel, so every upcoming event
gets its own slot instead of every second one being skipped.

`currentView()` puts its result through `collapse()`; the rest of the code
works on the uncollapsed list.

All the knobs are constants at the top of the display-loop section of
`sign.html`. `CYCLE_HOLD_MS` is the *whole* slide including both fades, so if
you change `FADE_MS` you must change the `#inner` CSS transition to match.

Motion is deliberately transform/opacity-only so the panel composites rather
than repaints. Four layers: the crossfade on `#inner`; `#spore` translated by
JS to a random spot in the upper area on every slide (and every
`SPORE_IDLE_MS` when the copy is pinned), eased by a CSS transition;
`#sporespin` rotating underneath on its own animation; and `#timerbar`, a
thin line flush with the very top of the canvas that shrinks via `scaleX`
from full width at `slideAt` to nothing `CYCLE_HOLD_MS` later. Translation
and rotation are on separate elements on purpose — one element cannot hold
two competing `transform` values.

`#timerbar` is hidden (`rotating = false`) whenever nothing is counting
down — a pinned feature, or a season with only one slide — since there's
nothing for it to say. `updateTimerBar()` runs unconditionally at the top of
`step()`, *before* the `fading` early-return, so it keeps ticking smoothly
through the ~460ms crossfade instead of freezing for the last slice of every
slide. Its CSS transition is tied to the `setInterval(step, 250)` cadence,
not to `FADE_MS` — change one, change the other.

In a desktop console, `SIGN.next()` advances the rotation by hand and
`SIGN.state()` reports the current mode (including `paused`).

A keyboard listener gives the same controls to whoever is standing at a
laptop previewing the board:

- **space** toggles `paused`, which is checked first thing in `step()` —
  while paused, nothing updates, not the clock, not the timer bar, not the
  rotation.
- **right arrow** calls `forceNext()`, the same advance-and-fade `step()`
  runs when the hold timer expires, just fired on demand; it works even while
  paused, so a presenter can single-step through slides by hand without
  ending the pause.
- **c** — *current* — shows the in-event board (pinned event, koha call to
  action, site QR dark) **for the event currently on screen**, without waiting
  for it to come round in real life. Press it again to come back to real time.
  `step()` picks the change up on its next tick and crossfades into it like
  any other change of panel — so it does nothing while paused, which is what
  space is for. Same toggle as `SIGN.event()`. See "The `c` preview moves the
  clock" below for how it works and why.

None of them is wired to click/tap — these are desktop controls, not
something the panel (no touch) or a phone visitor should be able to trigger.

### The `c` preview moves the clock

It does **not** fake the feature. `togglePreview()` sets `previewSkew` so the
board's idea of now lands `PREVIEW_INTO_MS` (10 minutes) into the event on
screen, and everything then follows by the ordinary rules rather than one flag
having to lie to each of them in turn: `featuredEvent()` finds the event
because the window genuinely contains the clock, `currentView()` pins it, the
pill says "On now", the countdown counts down to its real finish, and the
events before it drop out of `upcoming()` so the season meter advances exactly
as it will have on the day.

That is the whole point. There was a `forceFeature` flag here first, which
made `featuredEvent()` return an event the clock disagreed with — the board
pinned, but the pill still said "Coming up" and the countdown still said
"Starts in 3 days", so the preview showed you something the wall will never
show. It is gone.

**Everything in the display loop reads `clock()` or `clockMs()`**, never
`new Date()`, which is what lets one number move all of them at once. The
single deliberate exception is the `rev.json` cache-buster, which wants the
real clock because it is talking to a real server. `previewSkew` is zero
unless a keypress or the console sets it, and the panel has neither a keyboard
nor a console, so on the wall these are `new Date()` with an addition of zero
on the end.

Two things the toggle has to do besides moving the number: reset `driftAt` and
`slideAt`, which both hold timestamps taken from the clock that just moved.
Left alone, the spore would sit still for however many days the skew was worth
and the slide timer would read as either expired or rewound.

`lastEvent` is the event the preview uses. It is not `shown`, because
`renderKoha()` sets `shown` to null — so pressing `c` while the koha panel is
up would do nothing. `lastEvent` remembers the event either side of it
instead.

## Landscape is not a scaled portrait

The two orientations carry the same content in half the height, so every type
size and gap has a `body.portrait` override and the two have to be tuned
independently. **Changing one and not the other is the standing trap here** —
enlarging the host photos for the panel pushed the whole footer 192px off the
bottom of the landscape canvas, and because the panel is portrait, nothing on
the wall showed it. It only appeared in a wide browser window.

The season label is hidden in landscape (`#seasonnote` is `display: none`
until `body.portrait` puts it back): with the label in, the dots, the label
and the pill were stacked on top of each other and the label read as part of
the pill.

After changing anything in `#main` or `#foot`, measure rather than eyeball —
`#foot`'s bottom must not sit below `#inner`'s. A three-line title with a host
photo is the worst case; most slides have slack.

## Recurring events

`collapse()` gives a repeating event a single slide, the soonest sitting.
Kiekie Koha Coffee Hours runs twelve dates this season; a slide each made it
half the rotation, the same panel with a different date on it, twice in a row
in four places.

**`series` is keyed on the event's title, not on its page**, because "the same
event on again" takes two forms here and both have to count:

- one page with several `dates:` — Kiekie Koha Coffee Hours;
- **two pages with the same title** — Journaling is not a Luxury, an afternoon
  session and an evening one, same day, different times. Keying on the page
  missed this entirely and the board showed them as two unrelated events.

`repeats` is therefore counted per title across the whole season (`$seriesCount`
in the Hugo header), not from one page's date count.

The other dates are not hidden, they are stated in the two places where they
mean something:

- **The meter** — while a recurring event is on screen, its other dates light
  up full strength (`.pip.repeat`), so you can see where they fall across the
  season instead of them collapsing into one dot. This is **per slide, not per
  event**: a one-off showing lights nothing but its own dot. Marking every
  recurring event all the time left the coffee-hour dates bright on slides
  that had nothing to do with them, which reads as a fault. Brightness, not a
  new hue: the board is one mint, and a fourth colour would read as a fourth
  kind of thing.
- **The "More dates" box** — `otherDates()` fills the footer box that used to
  show the venue (`#morebox`/`#more`): "Also 26, 27 & 28 Aug" when three or
  fewer remain in one month, otherwise "10 more dates, through 28 Aug". When
  every remaining sitting is on the *same day* it switches to times — "Also
  18:00–20:00 the same day" — because that is what actually differs between
  them. The venue itself was dropped from the footer: it's the same address
  for every event on the board, so a dedicated box for it wasn't worth the
  space, and this is what took its place. Empty for a one-off — no label, no
  value — rather than showing a heading over nothing.

`series` is the event's `RelPermalink` and `repeats` is set at build time from
the *whole season's* date count, not from what is left — so the final date of a
twelve-date series still says it recurs.

Only the rotation is collapsed. `remaining()` and `SEASON_TOTAL` still count
every occurrence, which is what keeps the meter's arithmetic (`done = total -
left`) lined up with the dots.

## The season meter

The row of dots under the brand rule is one dot per event in the whole season:
the ones already run faded back, the ones still to come lit, and the one on
screen picked out larger. Under it sits the season label, and nothing else.

**No count is written anywhere on the board.** The dots are the count. The
pill below says what the event is ("Starting soon", "Coming up", "Happening
now") and nothing about position — it carried "15 of 23 left" for a while,
which read as a number to be parsed rather than a shape to be glanced at,
next to a meter already saying the same thing. Putting the figure back, in
the pill or beside the label, has been tried and undone twice.

Two counts are in play and they are deliberately different:

- **`seasonPos()`** — where an event sits in what is *left of the season*.
  This is what the meter points at. It doesn't move when an event is featured.
- **`cycleIdx` / `view.total`** — where a slide sits in *this rotation*, which
  is a different number whenever a feature is interleaved into it. It drives
  the rotation, never the copy.

`remaining()` counts an event that has started but not finished as still left
— it is on now, which is not the same as over — while `upcoming()` (which
feeds the rotation) does not.

`SEASON_TOTAL` and `SEASON_LABEL` come from Hugo and cover the whole season,
past dates included. `EVENTS` does not: it starts two days back. So how many
events have already run is `SEASON_TOTAL` minus what is left, which is all the
meter needs — the past events themselves never reach the page.

## Host photos

Each host's photo sits immediately in front of their name, resolved at build
time by the same rule the rest of the site uses: `people/by-name.html` maps
the name in `hosts:` to that person's profile (honorific-insensitive, via
`people/name-key.html`), and `feature-image.html` finds that page's photo.
Nothing here is specific to the sign; adding a photo to someone's profile puts
it on the board.

The `faces` array is **positional** — one entry per host, in `hosts:` order,
empty string where there is no photo. Skipping the empty ones would slide
every later photo onto the wrong name. A host with no profile, or a profile
with no photo, renders as a name on its own and the row still reads.

Photos are `Fill`ed square and inlined as `data:` URIs for the same reason as
the QR codes: the panel cannot fetch anything, so an `<img src="/...">` is a
hole on the wall. `$faceSpec` should track what the circle actually renders at
in portrait — the panel is 1:1, so anything larger is bytes for nothing and
anything smaller is a soft photo on a 65" screen.

### `#main` shrinks to fit

A slide with eight hosts is four times the block a slide with two is, and
inside the feature window the koha call to action arrives as a whole extra
block on top of that. The board has no scrollbar and nowhere to put the
overflow — past a certain amount of content the block grows straight down
through the footer. `fitMain()` measures and steps it down.

**Two knobs, both font-sizes: `#speakers`' and `#koha`'s.** Everything inside
each block — photos, gaps, names, the code's plate and the line beside it — is
sized in `em` off its own, so shrinking the type takes the rest with it and a
face never drifts out of scale with the name beside it, nor the code out of
scale with the line pointing at it. They step together, and each stops at its
own floor. The em figures are the pixel ones divided by the base size, so an
unshrunk block measures exactly as it did before — **if you change a base
font-size, the `em` ratios have to be redivided against it.**

- `SPEAKERS_MIN_SCALE` (0.5) — below that the names stop being readable from
  the footpath, which is worse than an overfull board.
- `KOHA_MIN_SCALE` (0.7) — the tighter of the two, because below it the code
  stops being worth pointing a phone at. On the panel that floor is a 210px
  code; landscape is a desktop preview and can go smaller.

The budget is what `#inner` has left once every one of its children *except*
`#main` has taken its share. Measured off the siblings rather than off `#main`
on purpose: `#main`'s own height grows with the very content being measured,
so asking it how much room there is always gets back "exactly enough".

`#main > *` is pinned to `flex: 0 0 auto` for the same reason. A flex item
that has been quietly squashed by the flex algorithm measures as fitting, and
the block would then never step down; it keeps its content height and
overflows instead, which is what the measurement is there to notice.

It runs off a *change*, not off the clock — `renderEvent()` runs every second
and a layout pass a second on this panel is not free. **There are two kinds of
change and both have to trigger it:**

- a write to `#title`, `#titlesub` or `#speakers`. `put()` returns whether it
  actually wrote, and `renderEvent()` re-measures when any of the three did.
- a change of *panel kind* in `renderView()` — the koha block joining or
  leaving `#main`, and the masthead standing down. Missing this one is what
  put the footer 100px off the bottom of the panel: pressing `c` on a slide
  pins the same event with the same title and the same hosts, so nothing in
  the first list changed, and the board went on believing it had room it had
  just given away.

### Landscape overflows on long titles, and always has

Seven of the twenty slides currently overflow the landscape canvas by 10–54px
with a long title and several hosts, `#speakers` already at its floor. This is
**pre-existing and unrelated to koha** — the same seven, to the pixel, on the
commit before any of it. Portrait, which is the panel, is clean on all twenty
in both the rotation and the feature window. Measure against a baseline build
before assuming a landscape overflow is something you just did.

## Koha

The board asks for a koha in two places, both pointing at the same inlined
Volley code (`assets/images/volley_qr_code.png`).

**During the feature window** — half an hour before an event starts until it
ends (`FEATURE_BEFORE_MS`) — the board **stops rotating and stays on that one
event**, and a mint line and the code appear under the hosts: `KOHA_EVENT_TEXT`.
The site QR in the footer goes dark for the duration.

The masthead stands down with it: `body.current` hides the "/ Programme"
qualifier and the "2026 SEASON" label. Both were introducing the season around
a board that is now about one thing, and on a full slide the label left the
"On now" pill wedged against it with nothing in between. The dots stay — they
say something at a glance and they say it without a caption — and `#season`
takes over the gap down to the pill that the label used to provide.

**`body.current` is the mode; `body.koha-event` is only whether there is a
code to ask with.** They are two facts and two classes on purpose: a missing
image should drop the call to action, not also undo the layout the mode is
there for.

In portrait the code is pushed hard right (`space-between` on `#koha`), so its
edge lands on the same line as the countdown under it, the footer rule, and
the season dots — 1000px on the 1080 canvas, the right margin everything else
on the panel already uses, rather than a third edge floating mid-board.
`#koha` stretches to `#main`'s full width because `#main` is a column flex
container, and `#main` is as wide as `#inner`, which is what makes those edges
the same one. **Landscape deliberately does not do this**: the canvas is twice
as wide there and the arrow would end up pointing across most of a screen of
nothing. Two codes on one board is
a question rather than an invitation, and inside the window the answer is the
one being asked for. The address stays; it is type, not a target.

**The rest of the time** the board rotates, and the koha panel takes a turn of
its own every `KOHA_EVERY` (3) event slides: three events, the code, three
more. `KOHA_SLIDE_TEXT`, the code large, and nothing else but the masthead.

The gap is **fixed, not random**. It was drawn from a 3-to-5 range to begin
with, on the theory that a predictable slot reads as belonging to whichever
event it keeps landing next to. A steady beat turned out to be easier to
describe to someone standing at the window and easier to check on the wall,
and that won the argument. If you want it less often, change the number — do
not put the range back without knowing why the beat was wanted.

The count is also reset to a full `KOHA_EVERY` when a feature window closes,
so the rotation resumes with three events in front of the panel rather than
with whatever was left on the clock when the window opened.

Both are one block of markup, `#koha` inside `#main`, switched between by a
class on `<body>`: `.koha-event` and `.koha-slide`. Inside `#main` on purpose —
`#main` centres in whatever slack the slide leaves, so the block sits in the
empty band rather than jammed against the footer, and `fitMain()` already
counts everything in `#main` when it decides how big the host photos may be, so
a four-host event in the window shrinks its photos to make room by itself.

**`<body>` has three writers now** — orientation from `fit()`, and the two koha
states from `renderView()`. They go through `syncBody()`; do not write
`document.body.className` directly or you will clobber somebody else's fact.

The copy is two constants, `KOHA_EVENT_TEXT` and `KOHA_SLIDE_TEXT`, at the top
of the display-loop section. They are HTML: `.arrow` is the `→`, tied to the
last word with a non-breaking space so it can never be stranded alone on a
line pointing at nothing, and hidden on the dedicated panel where there is
nothing to its right.

### The code is not inverted

The site QR is inverted at build time (`images.Invert`) and needs no plate.
This one is left the right way up on a white plate: it carries Volley's own
mark in a brand colour, which inverts into something else entirely, and a
white plate is the most reliable thing to point a phone at from a footpath at
night. The plate's padding is also the quiet zone — the source file has about
two modules of margin where the spec wants four.

**`.Resize "450x png box"`, and the size matters twice.** 450 is what the
dedicated panel renders at in portrait, so the panel draws it pixel for pixel;
it is also exactly half the source, and that is why it costs 25KB of base64
instead of 110KB. An off-ratio resize antialiases every module edge in the
image and there goes PNG's run-length compression. If you change the size on
the panel, change it to another exact divisor of the source and check what it
costs.

### Previewing it

`SIGN.koha()` puts the dedicated panel up now instead of waiting for the
rotation to reach it. `SIGN.event()` toggles the in-event board — pinned, call
to action, site QR dark — for whatever event is on screen, by moving the clock
to a few minutes into it; call it again to come back to real time. Same thing
the `c` key does, and the same caveats: see "The `c` preview moves the clock"
under Rotation. `SIGN.state()` reports how many slides away the koha panel is,
and `preview` — false on the real clock, otherwise where `c` has moved it to.

### If the file is missing

`KOHA_QR` is an empty string and the script drops both presentations rather
than showing a hole: no call to action, and `advance()` never arms the panel.

## One copy of each image

Everything is inlined, so a duplicate is paid for in full every time it
appears. Kiekie Koha Coffee Hours has twelve dates, and it was carrying twelve
copies of the same QR and twelve of the same host photo — 25 embedded images
where 14 would do.

Hugo builds two tables, `QRS` and `FACES`, and the events hold indices into
them: `qr` is an index, and each entry of `faces` is an index or `-1` for a
host with no photo. **Index 0 is a real photo**, so the script tests `>= 0`,
never truthiness.

If you add another inlined image, put it in a table the same way. It is the
difference between the page growing with the number of *dates* and growing
with the number of *things*.

## Phones

`/sign/` is a public URL, so people do open it on a phone. The fixed canvas
alone doesn't survive that: `width=1920` in the viewport tag is what the panel
needs, and a phone honouring it lays the page out 1920px wide and shows one
corner of the board blown up to fill the screen.

The small script in `<head>` narrows the viewport tag to `width=device-width`
on phone-sized screens only, and puts `.handheld` on `<html>` for the CSS that
draws the frame around the fitted canvas.

`fit()` then treats a phone differently from the panel. The panel and the
desktop get the whole canvas letterboxed and centred. A phone **fills the
width and pins the bottom**, so the canvas hangs off the top when the screen
is too short for it:

- Fitting the height as well threw away a fifth of the type on a phone with
  its address bar showing, on a board whose entire job is to be read.
- Scale then depends only on the width, which doesn't change when the address
  bar slides away — so the board holds still instead of resizing under your
  thumb. Only how much of the top is cut changes.
- What goes over the top is the brand line and the season meter. The title,
  the hosts, the QR and the times are all anchored to the bottom and always
  in view. That ordering is why the meter sits at the top: it is the part the
  board can most afford to lose.

When it does crop, `fit()` adds `.cropped`, which drops the frame (three sides
of a box reads as a broken box) and shows `#topfade` — a shallow gradient that
turns a line of type sliced mid-letter into an edge. Keep it shallow: at 58px
it was greying out the title.

`#topfade` sits outside `#stage` because `#stage` is scaled, and the fade wants
a fixed depth in screen pixels rather than in canvas ones.

It tests `screen`, not `window`, so a narrow desktop window is never mistaken
for a phone. The threshold is 1000px on the **longer** screen dimension: the
panel reports 1080×1920 and is comfortably clear of it, and desktop browsers
ignore the viewport tag entirely. **Everything under `html.handheld` is
therefore unreachable from the panel** — which is what makes it safe to change
freely, and what you must preserve if you touch it.

## QR codes

Each slide shows a QR pointing at that event's own page, plus the site address
above the footer rule. Every code carries `?utm_source=window_sign` (`$signUTM`)
so the analytics can tell what the sign is actually doing. The tag is static,
which is what keeps the codes byte-identical regardless of baseURL. **This is fully automatic** — `images.QR` generates the
code at build time from `$p.Permalink`, and `.Content | base64Encode` inlines
it as a `data:` URI. Adding an event to `content/programme/` is all that is
required; its QR appears on the next build. There is no external service, no
committed image, and nothing to run by hand.

The `.Content | base64Encode` step is load-bearing: publishing the QR as a
file would put a `<img src="/...">` on the page, which the panel cannot fetch.
Keep it inlined. Each code adds roughly 2KB to the page.

The koha code is the one exception to "no committed image" — it is Volley's
own code with their mark in the middle, so it cannot be generated, and it
lives at `assets/images/volley_qr_code.png`. See "Koha" above; it is inlined
the same way and is subject to all the same rules.

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
while leaving it everywhere else on the site. Absent means shown, and so does
`true`. It also removes the event from `SEASON_TOTAL`, so the meter counts
the season the board actually shows.

Nothing currently uses it. Kiekie Koha Coffee Hours and Volunteer Orientation
both did — Kiekie runs most days and crowded the rotation out — and both are
switched on now to see how the board reads with the whole programme in it.
Kiekie is twelve of the season's dates on its own, so that is the thing to
look at first if the rotation feels long.

Ticket Tailor knows nothing about the sign, so `scripts/build-programme.mjs`
reads any existing `showOnSign` off the page and writes it back out
(`readShowOnSign`). Without that, the next sync rewrites the file without the
key and the event quietly returns to the board.

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

Excluded automatically: `dateTBC:` events, which `programme/dates.html` gives
no dates, so they never produce an occurrence at all.

`draft: true` events are excluded too, but by an **explicit `not .page.Draft`
check** in the header, not by `buildDrafts = false`. Don't remove it on the
grounds that the config already covers it: this board is served to the panel by
`hugo server` over the LAN, and `hugo server -D` — the flag you reach for to see
the drafts section on `/_admin/programme/` — would otherwise put unpublished
events on the window, in the rotation, counted in `SEASON_TOTAL`, with QR codes
pointing at pages the public site does not have. `layouts/_default/calendar.html`
checks it for the same reason.

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
