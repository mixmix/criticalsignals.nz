---
title: Wildest Streams
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
  owner_email: "condact@criticalsignals.nz"
  # https://podcasters.apple.com/support/1691-apple-podcasts-categories
  category: "Society & Culture"
  explicit: false
  language: "en-nz"
  # serial: apps list episode 1 first and start new listeners from the top.
  type: "serial"

cascade:
  csDesign: true
  # Publish only the files a template actually links (cover.jpg / cover.svg),
  # not every file in an episode folder — keeps artwork-source.png, the
  # source for scripts/podcast-covers.mjs, off the live site.
  build:
    publishResources: false
---

Kia ora koutou, nau mai haere mai ki te Wildest Streams. Welcome to the podcast that elaborates on dialogues held within and around a community initiative known as Critical Signals. For three months in 2025, Critical Signals temporarily held residence at 115 Taranaki street in Te Whanganui a Tara, during which we held a range of discussions, seminars, workshops, and gatherings dealing with our anthropological world; climate response, community resilience, data sovereignty, food systems, and the creative potential of community response. In this podcast, we reflect on and share some of those dialogues, with me, your host, Clay. Thanks for being here. 
