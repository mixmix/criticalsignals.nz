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
      // SVG behind (via CSS background); JPEG src paints over it once loaded.
      el.style.backgroundImage = "url('" + pick.svg + "')";
      el.src = pick.jpeg;
    } else {
      // Layered background: JPEG on top, SVG beneath — SVG shows until JPEG loads.
      el.style.backgroundImage = "url('" + pick.jpeg + "'),url('" + pick.svg + "')";
    }
  });
})();

document.addEventListener("DOMContentLoaded", function () {
  // 2. Parallax: the spore + dates drift slower than the page; hero and middle
  //    photos drift gently "behind". Transforms / background-position only.
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const drifters = [];
    document.querySelectorAll(".rail .spore").forEach(function (el) { drifters.push({ el: el, rate: 0.34 }); });
    document.querySelectorAll(".bigdates").forEach(function (el) { drifters.push({ el: el, rate: 0.20 }); });

    const heroes = Array.prototype.slice.call(document.querySelectorAll(".hero"));
    const PHOTO_SCALE = 1.14;
    const photos = Array.prototype.slice.call(document.querySelectorAll(".imgband__photo"));
    photos.forEach(function (el) { el.style.willChange = "transform"; });

    let ticking = false;
    const apply = function () {
      const y = window.pageYOffset;
      const vh = window.innerHeight;
      drifters.forEach(function (d) { d.el.style.transform = "translate3d(0," + (y * d.rate).toFixed(1) + "px,0)"; });
      heroes.forEach(function (h) { h.style.backgroundPositionY = (y * 0.18).toFixed(1) + "px"; });
      photos.forEach(function (img) {
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
