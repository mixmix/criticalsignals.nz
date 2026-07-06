// Critical Signals — image randomiser, spore/dates parallax, burger menu,
// dark-mode toggle, and Loops.so sign-up handling.

// 1. Randomise the photo in each marked spot, distinct per page.
(function randomiseImages() {
  const spots = document.querySelectorAll("[data-img-spot]");
  if (!spots.length) return;
  // Low-poly placeholders are inlined as base64 data-URIs (window.CS_LOWPOLY,
  // see design/lowpoly-data.html) so previewing any photo needs no request;
  // fall back to the on-disk SVG if the inline array is somehow absent.
  const inline = window.CS_LOWPOLY || [];
  const pool = Array.from({ length: 10 }, function (_, i) {
    const nn = String(i + 1).padStart(2, "0");
    return {
      jpeg: "/images/backgrounds/" + nn + ".jpeg",
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
      // Two real <img>s stacked in the same box: the low-poly SVG placeholder
      // sits directly UNDER the JPEG, so it's guaranteed present in the DOM
      // (no reliance on CSS background painting). Wrap the JPEG in a relative
      // holder sized by the JPEG itself, and absolutely overlay the SVG behind
      // it — exact alignment regardless of the outer container's size. The
      // progressive JPEG then resolves (coarse → sharp) over the SVG: that's
      // the "merge in as it loads". object-fit:cover keeps both cropped alike.
      const wrap = document.createElement("span");
      wrap.style.cssText = "position:relative;display:block;";
      el.parentNode.insertBefore(wrap, el);
      const ph = document.createElement("img");
      ph.alt = "";
      ph.setAttribute("aria-hidden", "true");
      ph.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;";
      ph.src = pick.svg;
      wrap.appendChild(ph);      // placeholder first (underneath)
      wrap.appendChild(el);      // JPEG moves into the wrap, painting on top
      el.style.position = "relative";
      el.style.zIndex = "1";
      el.src = pick.jpeg;
    } else {
      // Layered background: JPEG on top, SVG beneath — SVG shows until JPEG loads.
      el.style.backgroundImage = "url('" + pick.jpeg + "'),url('" + pick.svg + "')";
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
    const photos = Array.prototype.slice.call(document.querySelectorAll(".imgband__photo, .hero__photo"));
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
      photos.forEach(function (img) {
        if (mobile) { img.style.transform = ""; return; }
        const r = img.getBoundingClientRect();
        const slack = (r.height * (PHOTO_SCALE - 1)) / 2;
        let t = -((r.top + r.height / 2) - vh / 2) * 0.09;
        if (t > slack) t = slack; else if (t < -slack) t = -slack;
        img.style.transform = "translate3d(0," + t.toFixed(1) + "px,0) scale(" + PHOTO_SCALE + ")";
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
});
