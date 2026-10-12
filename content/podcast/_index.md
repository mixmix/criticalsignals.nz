---
title: Podcast
description: "Conversations from Critical Signals — practical and visionary responses to an era of collapses, recorded in Pōneke, Wellington."
# `draft: true` here hides /podcast/ and /podcast/feed.xml, but NOT the
# episode pages: Hugo doesn't cascade drafts, so each episode needs its own.
csDesign: true
# The feed is /podcast/feed.xml (see [outputFormats.PODCAST] in hugo.toml);
# no default /podcast/index.xml.
outputs: [HTML, PODCAST]

# Show-level tags for the feed — read by layouts/podcast/list.podcast.xml.
# Cover art: drop a square JPG/PNG (1400–3000px) into this folder as cover.jpg.
podcast:
  author: "Critical Signals"
  # Apple and Spotify email this address to verify ownership. Required before
  # submitting the feed anywhere.
  owner_name: "Critical Signals"
  owner_email: ""
  # https://podcasters.apple.com/support/1691-apple-podcasts-categories
  category: "Society & Culture"
  explicit: false
  language: "en-nz"
  type: "episodic"

cascade:
  csDesign: true
---

Things and stuff
