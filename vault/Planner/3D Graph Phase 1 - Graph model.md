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
status: Done
priority:
progress: 100
date_created: "2026-10-29T01:03:06.000Z"
date_modified: "2026-10-30T01:35:00.000Z"
date_start_scheduled: "2026-10-29T10:43:23.000Z"
date_start_actual: "2026-10-29T10:43:23.000Z"
date_end_scheduled: "2026-10-30T01:35:00.000Z"
date_end_actual: "2026-10-30T01:35:00.000Z"
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/45
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

## What was implemented

Shipped in [PR #45](https://github.com/SawyerRensel/Osmosis/pull/45) → `feature/3d-graph-view`, together with [[3D Graph Phase 2 - View shell]].

**The shape.** Two pure modules in `src/graph3d/`:
- `model.ts`: `buildGraph(notes, resolve)` turns a set of loaded notes into nodes (note core, line, tag hub, attachment, ghost) and edges (hierarchy, link, embed, property, tag, attachment). Every parse-tree node becomes a line node, held to its note's core by hierarchy edges.
- `horizon.ts`: `noteAdjacency` builds an undirected note graph from `metadataCache.resolvedLinks`. `computeHorizon` does a breadth-first search to depth N, returning the loaded set plus the N + 1 prefetch ring. `diffLoaded` reports what arrives and what leaves when the focus hops.

**Decisions worth remembering:**
- **Links come from Obsidian's link cache, not a re-parse.** Each cached link carries its source offset, which places it on the line whose range contains it. Don't add a second link parser.
- **A link to a Markdown note outside the loaded set is dropped.** The horizon decides what is loaded. Tag hubs, attachments and ghosts still appear whenever a loaded note reaches them.
- **Hops count in both directions** (a backlink is as near as a forward link), and `resolvedLinks` already includes frontmatter links, which was verified against Obsidian's local graph. Tags and attachments are drawn but never extend the horizon.
- **A missing block or heading target falls back to the note core** rather than a ghost: the note exists, only the anchor is stale.
- `model.ts` has `import type` from `obsidian`. It's erased at compile time, so Vitest is unaffected; the spec's "no obsidian import" is about runtime imports.

**Not as scoped:** `horizon.ts` landed in the Phase 2 commit (`42b74a3`), not this phase's (`3a20fe0`), because the view is its first caller. Its tests (hop search, rings, hubs not extending the horizon, diffs on a hop) are in `horizon.test.ts`.

**Surface map:**

| File | Change |
|---|---|
| `src/graph3d/model.ts` | New: the world model (`buildGraph`, node ID helpers) |
| `src/graph3d/model.test.ts` | New: 21 tests covering block/heading/bare/embed/property/unresolved links, attachments, tags and dedupe |
| `src/graph3d/horizon.ts` | New: hop search, rings, loaded-set diff |
| `src/graph3d/horizon.test.ts` | New: 9 tests |

**Test fixture:** this phase draws nothing, so it has no fixture of its own. The web in `e2e/fixtures/graph3d/` (copied to `vault/tests/graph3d/`) exercises it through Phase 2. `Points of Sail` checks property links as hops, and `Navigation` checks that a shared tag or attachment doesn't pull a note closer.

**Follow-ups:** [[3D Graph Phase 3 - Streaming and stability]] uses `diffLoaded` to stream notes in and out.

