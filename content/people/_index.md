---
title: People
# csShell marks pages laid out by this site's own templates, so head.html knows
# not to send them Blowfish's stylesheet. The individual bios are rendered by
# layouts/people/single.html — own hero, own imgspot, .cs-hero and all — so they
# qualify; only THIS listing page still uses a theme layout, so it must not.
#
# Deliberately csShell and not csDesign, even though the bios are as
# site-designed as any csDesign page. csDesign additionally selects the full
# design footer in partials/footer.html, and these bios currently get the
# theme's small-print footer instead — so flagging them csDesign would quietly
# restyle the bottom of 62 pages. See partials/design/own-shell.html.
#
# Hugo applies `cascade` to the node that declares it as well as to its
# descendants, so without the explicit `false` this listing would flag itself
# and lose the very stylesheet it needs.
csShell: false
cascade:
  showHero: true
  heroStyle: "big-collaborator"
  csShell: true
---

