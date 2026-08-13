// Critical Signals — image randomiser, spore/dates parallax, burger menu,
// dark-mode toggle, and Loops.so sign-up handling.

var PREFERS_REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// Off for now — the cross-dissolve on the way OUT to another page (section 4).
// Flip to true to re-enable; the build-in/fade-in on arrival is unaffected.
var ENABLE_OUTBOUND_FADE = false;
// Placeholder controllers keyed by spot, shared between the build-in (section 1)
// and the outbound teardown (section 4), so a page-leave can un-assemble the
// same triangles a page-arrival assembled.
var lowpolyControllers = [];
// Each placeholder gets its own <filter id>, since several can be on one page.
var lowpolyFilterCount = 0;

// A low-poly SVG is a solid base fill plus ~100 triangular facet <path>s. Rather
// than showing it as one flat image, parse it and grow/shrink those facets into
// a live inline <svg> a batch at a time — so the placeholder visibly assembles
// itself out of triangles on arrival, and dissolves back into them on the way
// out, instead of just popping or fading as a flat bitmap.
function buildLowpolyPlaceholder(wrap, svgText) {
  const BUILD_MS = 220;
  let source;
  try { source = new DOMParser().parseFromString(svgText, "image/svg+xml").documentElement; }
  catch (e) { return null; }
  const paths = Array.prototype.slice.call(source.querySelectorAll("path"));
  if (!paths.length) return null;
  const group = source.querySelector("g[fill-opacity]");
  const facetOpacity = group && group.getAttribute("fill-opacity");

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 " + (source.getAttribute("width") || 1024) + " " + (source.getAttribute("height") || 576));
  svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;z-index:0;display:block;";

  // Soften the hard triangle edges with a gaussian blur, so the placeholder
  // reads as a blurred photo preview rather than a stack of flat facets. The
  // filter sits on a wrapping <g> (not each facet) so it's one blur pass over
  // the assembled whole, not per-triangle; each placeholder gets its own
  // filter id since several can share a page.
  const filterId = "lowpoly-blur-" + (lowpolyFilterCount++);
  const defs = document.createElementNS(svgNS, "defs");
  const filter = document.createElementNS(svgNS, "filter");
  filter.setAttribute("id", filterId);
  filter.setAttribute("x", "-10%"); filter.setAttribute("y", "-10%");
  filter.setAttribute("width", "120%"); filter.setAttribute("height", "120%");
  const blur = document.createElementNS(svgNS, "feGaussianBlur");
  blur.setAttribute("stdDeviation", "2.5");
  filter.appendChild(blur);
  defs.appendChild(filter);
  svg.appendChild(defs);
  const facetGroup = document.createElementNS(svgNS, "g");
  facetGroup.setAttribute("filter", "url(#" + filterId + ")");
  svg.appendChild(facetGroup);
  wrap.insertBefore(svg, wrap.firstChild);

  // Background fill first (index 0, fully opaque), then each translucent facet —
  // same visual as the original flat SVG, just built up node by node.
  const facets = paths.map(function (p, i) {
    const clone = p.cloneNode(false);
    if (i > 0 && facetOpacity) clone.setAttribute("fill-opacity", facetOpacity);
    return clone;
  });

  let added = 0;
  let raf = null;
  if (PREFERS_REDUCED_MOTION) {
    facets.forEach(function (n) { facetGroup.appendChild(n); });
    added = facets.length;
  } else {
    const t0 = performance.now();
    (function grow() {
      const target = Math.min(facets.length, Math.ceil(((performance.now() - t0) / BUILD_MS) * facets.length));
      while (added < target) facetGroup.appendChild(facets[added++]);
      if (added < facets.length) raf = requestAnimationFrame(grow);
    })();
  }

  return {
    shrink: function (durationMs) {
      if (raf) cancelAnimationFrame(raf);
      if (PREFERS_REDUCED_MOTION) { svg.remove(); return; }
      const total = facetGroup.children.length;
      const t0 = performance.now();
      (function shrink() {
        const remaining = Math.max(0, total - Math.ceil(((performance.now() - t0) / durationMs) * total));
        while (facetGroup.children.length > remaining) facetGroup.removeChild(facetGroup.lastElementChild);
        if (facetGroup.children.length > 0) requestAnimationFrame(shrink);
      })();
    },
  };
}

// Decodes an inlined URL-encoded SVG data-URI synchronously (no request, so
// the build-in can start on the same tick); falls back to fetching the
// on-disk path for the rare case the inline array (window.CS_LOWPOLY) is
// absent.
function loadSvgText(src, cb) {
  const marker = "data:image/svg+xml,";
  if (src.indexOf(marker) === 0) { cb(decodeURIComponent(src.slice(marker.length))); return; }
  fetch(src).then(function (res) { return res.text(); }).then(cb).catch(function () {});
}

// The low-poly SVG's first <path> is always a full-canvas rect in the photo's
// dominant colour (see buildLowpolyPlaceholder). Pull it out with a cheap
// regex rather than a full DOM parse, so a solid-colour placeholder can be
// painted the instant the (usually inline, synchronously-decoded) SVG text is
// available — no waiting on facets to build or the photo to load.
function svgBaseColor(svgText) {
  const m = /<path[^>]*\sfill="(#[0-9a-fA-F]{3,8})"/.exec(svgText);
  return m ? m[1] : null;
}

// 1. Randomise the photo in each marked spot, distinct per page.
(function randomiseImages() {
  const spots = document.querySelectorAll("[data-img-spot]");
  if (!spots.length) return;
  // These <img> tags carry no `src` in the template — this loop always
  // assigns one, so a hardcoded src there would just be a wasted fetch of a
  // photo that gets immediately replaced.
  const MIN_PLACEHOLDER_MS = 400;
  // Low-poly placeholders are inlined as URL-encoded data-URIs (window.CS_LOWPOLY,
  // see design/lowpoly-data.html) so previewing any photo needs no request;
  // fall back to the on-disk SVG if the inline array is somehow absent.
  const inline = window.CS_LOWPOLY || [];
  const pool = Array.from({ length: 10 }, function (_, i) {
    const nn = String(i + 1).padStart(2, "0");
    return {
      photo: "/images/backgrounds/" + nn + ".webp",
      svg: inline[i] || "/images/backgrounds/lowpoly/" + nn + ".svg",
    };
  });
  for (let i = pool.length - 1; i > 0; i--) {            // Fisher–Yates shuffle
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  spots.forEach(function (el, i) {
    const pick = pool[i % pool.length];
    if (el.tagName === "IMG") {
      // The low-poly placeholder sits directly UNDER the photo, built live as an
      // inline <svg> (see buildLowpolyPlaceholder) so it's guaranteed present in
      // the DOM (no reliance on CSS background painting). Wrap the photo in a
      // relative holder sized by the photo itself, and absolutely overlay the SVG
      // behind it — exact alignment regardless of the outer container's size.
      const wrap = document.createElement("span");
      wrap.style.cssText = "position:relative;display:block;";
      el.parentNode.insertBefore(wrap, el);
      wrap.appendChild(el);      // photo moves into the wrap, painting on top
      el.style.position = "relative";
      el.style.zIndex = "1";
      // Fade the photo in over the SVG rather than letting it snap into place the
      // instant it decodes — opacity 0 until `load` fires, then eased up to 1.
      // The placeholder stays on screen at least MIN_PLACEHOLDER_MS even if the
      // photo loads (near-)instantly from cache, so it's never just a flicker.
      el.style.opacity = "0";
      el.style.transition = "opacity .6s ease";
      const requestedAt = Date.now();
      el.addEventListener("load", function () {
        const wait = MIN_PLACEHOLDER_MS - (Date.now() - requestedAt);
        if (wait > 0) window.setTimeout(function () { el.style.opacity = "1"; }, wait);
        else el.style.opacity = "1";
      }, { once: true });
      el.src = pick.photo;
      loadSvgText(pick.svg, function (svgText) {
        // Paint the dominant colour on the wrap straight away — cheaper and
        // faster than waiting for the facets to build, and it still shows
        // through their translucent edges once they do.
        const bg = svgBaseColor(svgText);
        if (bg) wrap.style.backgroundColor = bg;
        const placeholder = buildLowpolyPlaceholder(wrap, svgText);
        if (placeholder) lowpolyControllers.push(placeholder);
      });
    } else {
      // Layered background: photo on top, SVG beneath — SVG shows until photo loads.
      el.style.backgroundImage = "url('" + pick.photo + "'),url('" + pick.svg + "')";
      loadSvgText(pick.svg, function (svgText) {
        const bg = svgBaseColor(svgText);
        if (bg) el.style.backgroundColor = bg;
      });
    }
  });
})();

document.addEventListener("DOMContentLoaded", function () {
  // 1b. Sticky-nav state: once the page is scrolled, flag <html> so the white
  //     nav strip rises to cover content passing beneath it (see
  //     `html.is-scrolled .menu-bg` in custom.css). At rest (top of page) the
  //     flag is off, so the wordmark still straddles over the nav bar.
  var docEl = document.documentElement;
  var syncScrolled = function () { docEl.classList.toggle("is-scrolled", window.pageYOffset > 140); };
  window.addEventListener("scroll", syncScrolled, { passive: true });
  syncScrolled();

  // 2. Parallax: the spore + dates drift slower than the page; hero and middle
  //    photos drift gently "behind". Transforms / background-position only.
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const drifters = [];
    document.querySelectorAll(".rail .spore").forEach(function (el) { drifters.push({ el: el, rate: 0.34 }); });
    document.querySelectorAll(".bigdates").forEach(function (el) { drifters.push({ el: el, rate: 0.20 }); });

    const PHOTO_SCALE = 1.14;
    // Transform the WRAP (span from section 1), not the <img> itself — the wrap
    // is what holds both the photo and its low-poly SVG placeholder stacked
    // together, so scaling/panning it keeps the two in lockstep. Transforming
    // the <img> alone would drift the photo away from the still-static SVG
    // beneath it (or leave a visible seam once the photo has faded in).
    const photos = Array.prototype.slice.call(document.querySelectorAll(".imgband__photo, .hero__photo")).map(function (el) { return el.parentElement; });
    photos.forEach(function (el) { el.style.willChange = "transform"; });

    let ticking = false;
    const apply = function () {
      // Parallax is for the desktop layout, where the spore + dates live in a tall
      // right-hand rail. On mobile everything is a single column, so drifting the
      // spore/dates would slide them over the sign-up section — keep them static so
      // the date + location stay as clean foreground content above the sign-up.
      const mobile = window.innerWidth <= 880;
      const y = window.pageYOffset;
      const vh = window.innerHeight;
      drifters.forEach(function (d) { d.el.style.transform = mobile ? "" : "translate3d(0," + (y * d.rate).toFixed(1) + "px,0)"; });
      photos.forEach(function (wrap) {
        if (mobile) { wrap.style.transform = ""; return; }
        const r = wrap.getBoundingClientRect();
        const slack = (r.height * (PHOTO_SCALE - 1)) / 2;
        let t = -((r.top + r.height / 2) - vh / 2) * 0.09;
        if (t > slack) t = slack; else if (t < -slack) t = -slack;
        wrap.style.transform = "translate3d(0," + t.toFixed(1) + "px,0) scale(" + PHOTO_SCALE + ")";
      });
      ticking = false;
    };
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; requestAnimationFrame(apply); }
    }, { passive: true });
    window.addEventListener("resize", apply, { passive: true });
    apply();
  }

  // 2b. Teal halo for the big dates. The dates are black text sitting mostly over
  //     the white page, crossing onto the middle image band at the bottom (and the
  //     overlap shifts as the dates parallax). Pure CSS layering can't paint a halo
  //     "over image but not white" here — the image band is a foreground element,
  //     so no z-index both reveals over it and hides over white. Instead we clone
  //     the dates as a transparent-text teal-glow overlay (see .bigdates__halo) and
  //     clip it every frame to just the slice that overlaps the band, so the glow
  //     never bleeds onto the white page. Runs regardless of reduced-motion.
  (function dateHalo() {
    const band = document.querySelector(".imgband");
    const dateEls = document.querySelectorAll(".bigdates");
    if (!band || !dateEls.length) return;
    const halos = [];
    dateEls.forEach(function (d) {
      // Idempotent: drop any halo from a previous run BEFORE cloning, so we never
      // clone a halo-inside-a-halo (which would render a duplicated, offset glow).
      d.querySelectorAll(":scope > .bigdates__halo").forEach(function (old) { old.remove(); });
      const halo = d.cloneNode(true);         // now copies ONLY the date spans, verbatim
      halo.className = "bigdates__halo";       // drop `.bigdates` so parallax won't move it twice
      halo.setAttribute("aria-hidden", "true");
      d.appendChild(halo);                     // overlay inside the dates: inherits transform + type metrics
      halos.push(halo);
    });
    let ticking = false;
    const clip = function () {
      const b = band.getBoundingClientRect();
      halos.forEach(function (h) {
        const r = h.getBoundingClientRect();   // reflects the live parallax transform
        const top = Math.max(0, b.top - r.top);
        const bottom = Math.max(0, r.bottom - b.bottom);
        // reveal only the band-overlapping slice; if there's no overlap this clips everything away
        h.style.clipPath = "inset(" + top + "px 0 " + bottom + "px 0)";
      });
      ticking = false;
    };
    const onScroll = function () { if (!ticking) { ticking = true; requestAnimationFrame(clip); } };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    // Re-clip whenever layout can shift the dates: after the webfont swaps in, once
    // images/everything has loaded, and on the next frame. Otherwise a clip measured
    // against the fallback-font layout leaves the halo boundary on the wrong line
    // until the first scroll.
    clip();
    requestAnimationFrame(clip);
    window.addEventListener("load", clip);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(clip);
    // Recompute on ANY layout change to the dates or band — catches font swaps and
    // the dev server's CSS-only hot-swaps, which restyle the DOM without firing a
    // scroll/resize/load event and would otherwise leave the clip boundary stale.
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(function () { onScroll(); });
      ro.observe(band);
      dateEls.forEach(function (d) { ro.observe(d); });
    }
  })();

  // 3. Burger menu — opens the full-screen overlay on mobile.
  const burger = document.querySelector(".menu-burger");
  const overlay = document.getElementById("cs-menu-overlay");
  if (burger && overlay) {
    const close = overlay.querySelector(".menu-overlay__close");
    const open = function () {
      overlay.classList.add("is-open");
      overlay.setAttribute("aria-hidden", "false");
      burger.setAttribute("aria-expanded", "true");
      document.body.style.overflow = "hidden";
    };
    const shut = function () {
      overlay.classList.remove("is-open");
      overlay.setAttribute("aria-hidden", "true");
      burger.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
    };
    burger.addEventListener("click", open);
    if (close) close.addEventListener("click", shut);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) shut(); });
    overlay.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", shut); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") shut(); });
  }

  // 4. Fade the photos out — and shrink each low-poly placeholder back down to
  //    nothing, facet by facet — on the way to another page, so everything
  //    dissolves away instead of hard-cutting. The outbound bookend to the
  //    build-in/fade-in above, so hero/band images feel like they cross-dissolve
  //    across navigations. Currently disabled — flip ENABLE_OUTBOUND_FADE to
  //    turn it back on.
  if (ENABLE_OUTBOUND_FADE && !PREFERS_REDUCED_MOTION) {
    document.addEventListener("click", function (e) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest("a[href]");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      let url;
      try { url = new URL(a.href, location.href); } catch (err) { return; }
      if (url.origin !== location.origin) return;
      // Same page (only the hash differs, e.g. an in-page anchor): no navigation, no fade.
      if (url.pathname === location.pathname && url.search === location.search) return;
      const photos = document.querySelectorAll("[data-img-spot]");
      if (!photos.length) return;
      e.preventDefault();
      photos.forEach(function (img) {
        img.style.transition = "opacity .35s ease";
        img.style.opacity = "0";
      });
      lowpolyControllers.forEach(function (c) { c.shrink(180); });
      window.setTimeout(function () { window.location.href = a.href; }, 350);
    });
  }

  // 5. Footer sign-up forms → Loops.so.
  document.querySelectorAll("form.signup-form").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      const input = form.querySelector("input[type=email]");
      const btn = form.querySelector("button");
      const msg = form.parentNode.querySelector(".signup-msg");
      if (!input || !input.value) { if (input) input.focus(); return; }
      if (btn) { btn.disabled = true; btn.textContent = "…"; }
      submitLoops(form.getAttribute("action"), input.value)
        .then(function () {
          form.reset();
          if (msg) { msg.hidden = false; msg.textContent = "Thanks — we'll keep you posted."; }
          if (btn) { btn.textContent = "Done"; }
        })
        .catch(function () {
          if (msg) { msg.hidden = false; msg.textContent = "Something went wrong — please try again, or email contact@criticalsignals.nz"; }
          if (btn) { btn.disabled = false; btn.textContent = "Sign up"; }
        });
    });
  });

  // Shared Loops.so submit (rate-limited, x-www-form-urlencoded).
  function submitLoops(action, email) {
    if (!action || action === "#") return Promise.resolve();
    try {
      const now = Date.now();
      const prev = localStorage.getItem("loops-form-timestamp");
      if (prev && Number(prev) + 60000 > now) return Promise.reject(new Error("rate-limited"));
      localStorage.setItem("loops-form-timestamp", String(now));
    } catch (e) { /* ignore storage failures */ }
    return fetch(action, {
      method: "POST",
      body: "userGroup=&mailingLists=&email=" + encodeURIComponent(email),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }).then(function (res) { if (!res.ok) throw new Error("bad status"); });
  }

  // 6. Dark-mode toggle. Saved theme is applied pre-paint by an inline <head>
  //    script (see extend-head.html); here we flip it and remember the choice.
  const root = document.documentElement;
  const toggle = document.querySelector(".theme-toggle");
  if (toggle) {
    const sync = function () {
      toggle.setAttribute("aria-pressed", root.getAttribute("data-theme") === "dark" ? "true" : "false");
    };
    sync();
    toggle.addEventListener("click", function () {
      const dark = root.getAttribute("data-theme") === "dark";
      try {
        if (dark) { root.removeAttribute("data-theme"); localStorage.setItem("theme", "light"); }
        else { root.setAttribute("data-theme", "dark"); localStorage.setItem("theme", "dark"); }
      } catch (e) {
        if (dark) root.removeAttribute("data-theme"); else root.setAttribute("data-theme", "dark");
      }
      sync();
    });
  }

  // 7. Home page "Recent Events" sampler — the full candidate pool of photos
  //    (from the last 5 past events) is rendered server-side as a JSON data
  //    island; here we shuffle it and build just the N shown thumbnails, so a
  //    fresh random sample appears on every page load. Must run before
  //    section 8 below, so those thumbnails are in the DOM by the time it
  //    collects `.gallery-item`s. See partials/home/recent-events.html.
  document.querySelectorAll(".gallery-grid[data-recent-events-pool]").forEach(function (grid) {
    let pool;
    try { pool = JSON.parse(grid.getAttribute("data-recent-events-pool")); } catch (e) { pool = []; }
    const n = parseInt(grid.getAttribute("data-recent-events-count"), 10) || 6;
    for (let i = pool.length - 1; i > 0; i--) {            // Fisher–Yates shuffle
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    // The grid already holds one empty `.gallery-item` per thumbnail we're
    // about to show, rendered server-side so the section occupies its final
    // size before this runs. Swap the real items in for those placeholders
    // in a single replaceChildren, and keep the count the same, so the page
    // never changes shape — appending to them instead would double the grid.
    const built = pool.slice(0, n).map(function (item) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "gallery-item";
      btn.setAttribute("data-lightbox-src", item.src);
      btn.setAttribute("data-full-width", item.fullWidth);
      btn.setAttribute("data-full-height", item.fullHeight);
      btn.setAttribute("data-title", item.title);
      btn.setAttribute("data-href", item.href);
      // Every attribute BEFORE src: setting src is what kicks off the load
      // and fixes how the browser fetches it, so loading/decoding hints set
      // afterwards can arrive too late to be honoured.
      const img = document.createElement("img");
      img.width = item.width;
      img.height = item.height;
      img.loading = "lazy";
      img.decoding = "async";
      img.alt = "";
      img.src = item.thumb;
      btn.appendChild(img);
      return btn;
    });
    grid.replaceChildren.apply(grid, built);
  });

  // 8. Photo lightbox — wires up any `.gallery-item` grid on the page (an
  //    event's own Artefacts gallery, or the Recent Events sampler above) to
  //    open the full-size photo in colour in an overlay (see
  //    partials/design/lightbox.html). With 2+ photos, the overlay also
  //    supports left/right navigation: the nav buttons, clicking the
  //    left/right half of the photo, or the arrow keys. Items carrying
  //    `data-title`/`data-href` (Recent Events only, since its grid mixes
  //    photos from several events) get a caption naming the source event,
  //    linking through to it.
  const lightbox = document.querySelector(".lightbox");
  if (lightbox) {
    // .col (the white text column) is a stacking context (position:relative +
    // z-index:55), which traps this fixed-position overlay's z-index:200
    // inside it — so the sticky nav bar (z-index:70, but outside .col) was
    // painting on top of the close/nav buttons. Hoist it to <body> so it
    // competes in the root stacking context instead.
    document.body.appendChild(lightbox);
    const lightboxImg = lightbox.querySelector(".lightbox__img");
    const lightboxFrame = lightbox.querySelector(".lightbox__frame");
    const lightboxPlaceholder = lightbox.querySelector(".lightbox__placeholder");
    const captionTitle = lightbox.querySelector(".lightbox__caption-title");
    const captionLink = lightbox.querySelector(".lightbox__caption-link");
    const items = Array.from(document.querySelectorAll(".gallery-item"));
    let index = 0;
    // Photos this session has already displayed in full — see showImage's
    // fast path below, which skips straight to is-loaded for these instead
    // of replaying the placeholder/noise loading state for an image that's
    // already sitting decoded in the browser's cache.
    const loadedSrcs = new Set();

    // The full-colour photo fades in on top of the placeholder once it's
    // actually loaded — one listener reused across every image, since it's
    // the same <img> element throughout. A cached/instant load can fire
    // before the browser has painted a single opacity:0 frame, collapsing
    // the transition into a pop; a hair of delay guarantees that frame
    // actually paints before flipping to opacity:1, so the fade always shows.
    lightboxImg.addEventListener("load", function () {
      if (!lightboxImg.src) return;
      loadedSrcs.add(lightboxImg.getAttribute("src"));
      setTimeout(function () { lightboxImg.classList.add("is-loaded"); }, 20);
    });

    // The grid thumbnails are loading="lazy" — anything below the fold (or
    // just not yet visible when the page loaded) has never actually been
    // fetched. showImage's placeholder logic assumes the thumbnail is
    // already loaded, which is only true for photos that have actually been
    // seen in the grid; without this, clicking next/prev to one that hasn't
    // starts its very first fetch right at the click, which is exactly why
    // it's slow to appear on a bad connection. Warming next/prev's
    // thumbnails as soon as the CURRENT photo is shown gives that fetch a
    // head start — however long you spend looking at this photo — instead
    // of only starting once you actually click.
    const preloadThumb = function (i) {
      const el = items[(i + items.length) % items.length];
      const img = el && el.querySelector("img");
      if (img && !img.complete) new Image().src = img.src;
    };

    const showImage = function (i) {
      index = (i + items.length) % items.length;
      const item = items[index];
      // Use the already-loaded grid thumbnail as a placeholder — same source
      // photo, so same aspect ratio — while the full-colour image loads.
      const thumb = item.querySelector("img");
      lightboxImg.classList.remove("is-loaded");
      if (thumb) {
        lightboxPlaceholder.src = thumb.src;
      }
      if (items.length > 1) {
        preloadThumb(index + 1);
        preloadThumb(index - 1);
      }
      // Drop the outgoing photo's bitmap: as long as lightboxImg still holds
      // a decoded image it keeps painting THAT photo — which, now that it's
      // stretched over the frame the placeholder sizes, would show the
      // previous photo distorted into the new one's shape until the incoming
      // bytes arrive.
      lightboxImg.src = "";
      // Hand the frame this photo's aspect ratio as a plain number; the
      // frame's CSS does the rest of the sizing arithmetic from it (see
      // custom.css). Every layer inside then fills that box absolutely, so
      // the whole thing is sized without waiting on any image — which is
      // the point: the placeholder needs a correctly-shaped box to appear
      // in the instant you hit next, long before the full photo lands.
      const fullWidth = parseInt(item.getAttribute("data-full-width"), 10);
      const fullHeight = parseInt(item.getAttribute("data-full-height"), 10);
      if (fullWidth && fullHeight) {
        lightboxFrame.style.setProperty("--ar", fullWidth / fullHeight);
      }
      const dataSrc = item.getAttribute("data-lightbox-src");
      lightboxImg.src = dataSrc;
      // Already shown earlier this session — nothing left to wait for, so
      // jump straight to is-loaded instead of showing the placeholder/noise
      // loading state for an instant only to immediately cover it back up.
      if (loadedSrcs.has(dataSrc)) {
        lightboxImg.classList.add("is-loaded");
      }
      const title = item.getAttribute("data-title");
      if (title) {
        captionTitle.textContent = title;
        captionLink.href = item.getAttribute("data-href") || "#";
      }
    };
    const openLightbox = function (i) {
      showImage(i);
      lightbox.classList.add("is-open");
      lightbox.setAttribute("aria-hidden", "false");
    };
    const closeLightbox = function () {
      lightbox.classList.remove("is-open");
      lightbox.setAttribute("aria-hidden", "true");
      lightboxImg.src = "";
      lightboxImg.classList.remove("is-loaded");
      lightboxFrame.style.removeProperty("--ar");
      lightboxPlaceholder.src = "";
    };
    const next = function () { showImage(index + 1); };
    const prev = function () { showImage(index - 1); };

    if (items.length > 1) lightbox.classList.add("has-nav");
    if (items.some(function (el) { return el.getAttribute("data-title"); })) lightbox.classList.add("has-caption");

    items.forEach(function (btn, i) {
      btn.addEventListener("click", function () { openLightbox(i); });
    });

    const prevBtn = lightbox.querySelector(".lightbox__prev");
    const nextBtn = lightbox.querySelector(".lightbox__next");
    prevBtn.addEventListener("click", function (e) { e.stopPropagation(); prev(); });
    nextBtn.addEventListener("click", function (e) { e.stopPropagation(); next(); });

    // Clicking the photo itself: left half goes back, right half goes forward.
    lightboxImg.addEventListener("click", function (e) {
      if (items.length < 2) return;
      const rect = lightboxImg.getBoundingClientRect();
      const isLeftHalf = (e.clientX - rect.left) < rect.width / 2;
      if (isLeftHalf) prev(); else next();
    });

    // Swipe left/right on mobile — same prev/next as the arrows. Tracked on
    // the frame (placeholder + photo both sit inside it) rather than just
    // the photo, so a swipe still works while the full photo is loading.
    // Uses e.touches (total active contact points), not e.changedTouches
    // (only the points that just changed), so a pinch-to-zoom — which lands
    // its second finger in a later touchstart — is reliably told apart from
    // a one-finger swipe, including if the pinch starts mid-drag.
    let touchStartX = 0, touchStartY = 0, touchTracking = false;
    lightboxFrame.addEventListener("touchstart", function (e) {
      if (items.length < 2 || e.touches.length !== 1) { touchTracking = false; return; }
      touchTracking = true;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    });
    lightboxFrame.addEventListener("touchmove", function (e) {
      if (e.touches.length !== 1) touchTracking = false;
    });
    lightboxFrame.addEventListener("touchend", function (e) {
      if (!touchTracking || e.touches.length !== 0) { touchTracking = false; return; }
      touchTracking = false;
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      // Require a mostly-horizontal, deliberate drag so a vertical scroll or
      // a tap-to-navigate-halves gesture isn't mistaken for a swipe.
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
        e.preventDefault(); // stop the browser's synthetic click firing too
        if (dx < 0) next(); else prev();
      }
    });

    lightbox.querySelector(".lightbox__close").addEventListener("click", closeLightbox);
    lightbox.addEventListener("click", function (e) { if (e.target === lightbox) closeLightbox(); });
    document.addEventListener("keydown", function (e) {
      if (!lightbox.classList.contains("is-open")) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    });
  }
});
