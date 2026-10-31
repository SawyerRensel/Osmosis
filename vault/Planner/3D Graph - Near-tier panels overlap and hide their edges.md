---
title: 3D Graph - Near-tier panels overlap and hide their edges
summary: "In dense clusters the near-tier panels (images, code blocks, callouts) are much larger than their plates, so they pile on top of each other and cover the edges, and you can't see what connects to what."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[3D Graph Phase 4 - Near tier]]"
  - "[[3D Graph - Plate-aware spacing]]"
status: In-Review
priority:
progress:
date_created: "2026-10-31T16:00:00.000Z"
date_modified: "2026-10-31T15:35:04.000Z"
date_start_scheduled: "2026-10-31T19:00:00.000Z"
date_start_actual: "2026-10-31T19:00:00.000Z"
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

# Bug Report

Found in Sawyer's Batch 1 manual test, 2026-10-31, on Sawyer's own notes (a CSS/flexbox note with many image and code panels).

## Environment

| Field            | Value |
| ---------------- | ----- |
| Platform         | Desktop (Obsidian) |
| Operating System | Linux |

## What happened?

Near-tier panels overlap one another heavily, and because DOM panels always draw over the WebGL canvas, they also hide the edges. "Can't see where these plates connect to."

![[2026-10-31 3D graph panels overlap 1.png]]
![[2026-10-31 3D graph panels overlap 2.png]]

## What should have happened?

Panels near each other should still read as separate nodes, and the edges between them should stay traceable.

## Notes for the implementer

The cause is very likely a size mismatch: plate-aware spacing sizes link lengths from the **plate** (`plateExtent(shape)`), but a near-tier panel for an image, an embed, a code block or a table is many times larger than the plate under it. Constraints and options:
- **Settled nodes never move** (Phase 3, confirmed by Sawyer). Don't push settled nodes apart when a panel appears.
- **No decluttering** (Sawyer): a nearer thing simply covers a farther one. So the panel stacking order must follow depth (check CSS2DRenderer z-index ordering is really applied), and the result must stay honest rather than hiding things.
- Options worth weighing: size an attachment/image node's *plate* (and therefore its spacing) from the media's aspect and a nominal size known before layout; cap panel size relative to plate spacing; show the edge endpoints over the panels (e.g. a thin edge overlay or connection markers on the panel border). Pick the one that best keeps connections visible without breaking the two constraints above, and record why.

## Batch implementation notes (awaiting manual test)

Built 2026-10-31 on `fix/3d-graph-batch-1`, commit `407dc0c`. Not pushed, no PR. A first sub-agent wrote most of the code and the machine crashed before it could commit. A second sub-agent reviewed that diff against this ticket, kept it as it was, added the fixture, ran the checks and committed. Nothing has been seen running in Obsidian.

### Cause

Two causes.

1. **Spacing was sized from the plate, but the panel is much bigger.** Plate-aware spacing set each link's rest length to `edgeDistance + plateExtent(source) + plateExtent(target)`. A line plate is drawn at 1 em ≈ 2.86 world units (`LINE_PLATE_HEIGHT` 5 / 1.75 em). Rough sizes:
   - A short label plate (an image filename, or a short line) reaches about 10–12 units.
   - Its panel used to be capped only by CSS at 360 × 480 px, which is 22.5 × 30 em, or about 64 × 86 units: a half-diagonal of about 54.
   - So an image, code or table panel reached up to **~4.5× as far as its plate**. Neighbours spaced for their plates were bound to pile up once their panels appeared.
   - The nodes have long since settled by then, and settled nodes never move, so the room can't be made when the panel appears.
2. **Stacking followed distance, not depth.** CSS2DRenderer gives each panel a z-index from its straight-line distance to the camera. The plates use the depth buffer, which works on view depth. So a panel near the edge of the screen could land behind a farther panel in the middle, and the panels' stacking disagreed with the plates under them.

### Fix

- **Space for the panel at layout time.** `panelBoxEm(node)` (`src/graph3d/near.ts`, pure) estimates how big a node's panel can get, in ems, from its Markdown before anything renders:
  - Image or video attachment: the full media box.
  - Audio: a player strip.
  - Text: line count × row height per block type (prose wrapped at the panel width, headings and callout titles, code lines with fences counted, table rows minus the separator, Markdown images).
  - The estimate is clamped to the panel's maximum.
  
  `nodeExtent(plate, panelEm, emWorld)` takes the larger of the plate's half-diagonal and the panel's. The scene stores this as `EngineNode.extent` on add, re-plate and theme change, and the link force uses it instead of `plateExtent`. Every node gets its extent before its first tick, so the room is made while the node is still free. Settled nodes are never pushed.
- **Panels have a hard cap, in ems, mirrored in CSS.** The panel is capped at `PANEL_MAX_EM` 20 × 30 em (was 360 × 480 px), and media at `PANEL_MEDIA_MAX_EM` 15 em tall with `object-fit: contain`. This keeps the estimate an upper bound. A media panel now reaches about 36 units, down from up to ~54.
- **Stack by view depth.** `place()` sets `panel.object.renderOrder = -depth` each render. CSS2DRenderer sorts by `renderOrder` before distance (higher renderOrder on top). `place()` runs in `onBeforeRender`, before `zOrder()` in the same `render()` call, so the nearest panel by view depth is on top, matching the plates.

### Decisions worth remembering

- **Reserve room, rather than move anything or hide anything.** This is the only option that keeps both constraints: settled nodes don't move, and nothing is decluttered. A nearer panel still simply covers a farther one. The gap between two neighbouring panels is now at least the link kind's `edgeDistance`, which is where the edge shows.
- **The estimate leans large on purpose.** Too large costs a little room. Too small puts a panel over its neighbour's edges again. Every image or video reserves the full 20 × 15.5 em box whatever its real aspect, because the aspect isn't known until the file loads, and reading image headers at layout time would mean vault I/O per node.
- **Constants live in two places.** `PANEL_MAX_EM` / `PANEL_MEDIA_MAX_EM` in `near.ts` and the `em` values in `styles.css` must stay in step. Comments on both sides point at each other.
- **Rejected: an edge overlay drawn over the panels** (a second canvas or SVG of edges, or connection markers on panel borders). It would draw farther edges over nearer panels, which breaks "a nearer thing covers a farther one". It would also add a second edge renderer to keep in sync.
- **Rejected: capping panel size by local spacing** (shrinking a panel until it fits between its neighbours). This makes an image or table illegible in exactly the dense clusters where you fly in to read it. It also makes panel size depend on the neighbours, so the same node would render differently from place to place.
- **Rejected: pushing neighbours apart when a panel appears** (a collision force on panel size). This moves settled nodes. It also costs a calculation per node every tick.
- **Not done: sizing image *plates* from the media.** The plate stays a label, as the plates ticket settled. Only the spacing knows about the panel.

### Surface map

| File | Change |
|---|---|
| `src/graph3d/near.ts` | `PANEL_MAX_EM`, `PANEL_MEDIA_MAX_EM`, `panelBoxEm` (panel size estimate from Markdown) |
| `src/graph3d/near.test.ts` | 9 tests: no panel, media box, audio strip, short line, wrapped prose, code lines, table rows, Markdown image, cap |
| `src/graph3d/appearance.ts` / `.test.ts` | `nodeExtent` (max of the plate's and the panel's half-diagonal), 2 tests |
| `src/views/Graph3DScene.ts` | `EngineNode.extent`, `extentFor`; link distance uses extents; recomputed on add, update and theme |
| `src/views/Graph3DNear.ts` | `renderOrder = -depth` in `place()`; header doc |
| `styles.css` | Panel max 20 × 30 em; media max-height 15 em, `object-fit: contain` |
| `e2e/fixtures/graph3d/Signal Flags.md` + `flag-*.svg` → `vault/tests/graph3d/` | New fixture |

### Fixture

`vault/tests/graph3d/Signal Flags.md`: one heading, "Flags to know", with these packed under it:
- six image lines, each embedding its own flag SVG, so six attachment nodes
- three code blocks
- three tables
- a callout

It links to `[[Sail Care]]`, which still covers the single-panel kinds. All new files; no existing fixture was edited.

### Not verified (needs Sawyer)

- Everything visual. Do panels in the "Flags to know" cluster (and in Sawyer's CSS/flexbox note) leave gaps where the edges show? Does the graph now feel too spread out? Media nodes push their neighbours out by roughly 25 more units an end.
- Siblings around one heading spread over a larger sphere, but nothing stops two siblings on the same side from overlapping on screen in a big cluster. If that still happens, a collision force on `extent` for *free* nodes only is the next step. It needs timing with the perf readout first.
- Whether the text estimate is close for real notes: proportional fonts and Obsidian's theme sizes vary.
- The cost of `panelBoxEm` on each `setData`. It runs once per node per call, as a few regexes per line. Expected to be small; not measured on the stress web.
