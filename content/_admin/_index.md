---
title: "Admin"
type: admin
robots: "noindex, nofollow"
# Three separate mechanisms, because each covers a different output. Removing any
# one of them leaks the admin pages somewhere:
#
#   outputs: ["HTML"]  stops Hugo emitting /_admin/index.xml. Without it the
#                      section RSS feed shipped, publicly listing every admin
#                      page by title and URL — and a robots meta cannot apply to
#                      XML, nor can we set X-Robots-Tag on GitHub Pages. Only
#                      needed on this section page: Hugo gives RSS to
#                      home/section/taxonomy pages, not to single pages.
#
#   xml: false         keeps the pages OUT OF THE SITEMAP. This is not a Hugo
#                      key — it is read by the theme's own sitemap template
#                      (themes/blowfish/layouts/_default/sitemap.xml, via
#                      `.Param "xml"`). It must stay in the cascade below too, or
#                      the child pages reappear. Deleting it as "inert" adds all
#                      three admin URLs straight back into sitemap.xml.
#
#   sitemap.disable    Hugo's own per-page switch. It has no effect while the
#                      theme's custom sitemap template is in play, since that
#                      template iterates .Data.Pages and never consults
#                      .Sitemap.Disable — kept so this still does the right thing
#                      if the theme override ever goes away.
outputs: ["HTML"]
xml: false
sitemap:
  disable: true
cascade:
  type: admin
  robots: "noindex, nofollow"
  xml: false
  sitemap:
    disable: true
---
