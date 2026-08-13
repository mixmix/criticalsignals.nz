{{- /* CRITICAL SIGNALS: overrides themes/blowfish/assets/js/appearance.js.

       The theme's version is 3,692 B of dark-mode machinery: it reads
       localStorage("appearance"), adds/removes `.dark` on <html>, wires the
       header's #appearance-switcher buttons, follows prefers-color-scheme, and
       swaps a secondary logo. This site has no dark mode and renders no
       switcher (its own header partial replaced the theme's), so all of that
       was dead code executing on every page — and executing in a
       render-blocking <script> in <head>, because head.html loads it without
       `defer`.

       One thing in there was NOT dark-related and is kept below: hiding the
       scroll-to-top button when it would overlap the footer.

       `defer` is now safe (and added at the call site in head.html): the only
       remaining logic is inside a DOMContentLoaded listener, and deferred
       scripts all execute before that event fires.

       Left as a .js under assets/ rather than deleted, because head.html pulls
       it through `resources.Get "js/appearance.js"` — a project file of the
       same name shadows the theme's, which is what stops the theme's dark code
       from being bundled at all. It is still run through
       resources.ExecuteAsTemplate, hence this Go-template comment. */ -}}
window.addEventListener("DOMContentLoaded", () => {
  const scroller = document.getElementById("top-scroller");
  const footer = document.getElementById("site-footer");
  if (scroller && footer && scroller.getBoundingClientRect().top > footer.getBoundingClientRect().top) {
    scroller.hidden = true;
  }
});
