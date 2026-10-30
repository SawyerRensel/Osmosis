---
title: 3D Graph Phase 1 - Graph model
summary: "Pure world model for the 3D graph: line nodes and every edge kind from parse trees and link caches, the note-level hop search, and loaded-set diffing."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
status: In-Progress
priority:
progress:
date_created: "2026-10-29T01:03:06.000Z"
date_modified: "2026-10-29T10:43:23.000Z"
date_start_scheduled: "2026-10-29T10:43:23.000Z"
date_start_actual: "2026-10-29T10:43:23.000Z"
date_end_scheduled:
date_end_actual:
all_day: false
repeat_frequency:
repeat_interval:
repeat_until:
repeat_count:
repeat_byday:
repeat_bymonth:
repeat_bymonthday:
repeat_bysetpos:
repeat_completed_dates:
parent: "[[Develop Mind-Map Graph View]]"
children:
blocked_by:
cover:
color:
pull_request:
---

# Feature Request

## What do you need built?

*Describe the new tool, script, or capability you're requesting.*

One phase of [[Develop Mind-Map Graph View]]. **Read that note's `# Spec` section first:** it holds the decisions, the world model, the conventions and the full test plan. This note only scopes this phase.

Pure logic only, in `src/graph3d/` with no `obsidian` import, so Vitest can test all of it. Nothing on screen yet.

- **`model.ts`:**
  - Build every node kind: note core, every line, tag hub, attachment, ghost.
  - Build every edge kind: hierarchy, link, embed, property, tag, attachment.
  - Inputs are `OsmosisTree`s (via `ParseCache`) plus a link-cache shape that mirrors `metadataCache.getFileCache()` (`links`, `embeds`, `frontmatterLinks` with positions).
  - Resolve each link's *source line* by offset, and its *target* to a block ID, heading, note or ghost.
- **`horizon.ts`:**
  - A breadth-first search over notes to depth N.
  - Rings: loaded, prefetch (N + 1), unloaded.
  - Tag and attachment edges are shown but **never** extend the horizon.
  - A diff of loaded sets when the focus moves.

**Acceptance:**
- Unit tests cover link resolution (block ref, heading ref, bare link, embed, property link, unresolved), the hop search and rings, hubs not extending the horizon, and diffs on a hop.
- `npm run lint` and `npm test` are clean.

**Every phase:**
- Add or extend the fixture web in `e2e/fixtures/graph3d/`, copy it to `vault/tests/graph3d/`, and reload Obsidian.
- Run lint, test and build, then stop for Sawyer's manual test before committing.
- Work on the `feature/3d-graph-view…` branch, cut from the current release branch.
