---
title: 3D Graph - Nearer edges cut through near-tier panels
summary: "T98. Remainder of T97: near-tier HTML panels still cover every edge; cut a nearer edge segment out of a farther panel's mask."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[3D Graph - Edges respect depth over plates and panels]]"
  - "[[3D Graph Phase 4 - Near tier]]"
status: To-Do
batch: 13
priority:
progress:
date_created: 2026-11-19T12:00:00.000Z
date_modified: 2026-11-19T12:00:00.000Z
date_start_scheduled:
date_start_actual:
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
parent:
children:
blocked_by:
cover:
color:
pull_request:
---

# 3D Graph - Nearer edges cut through near-tier panels (T98)

Split out of [[3D Graph - Edges respect depth over plates and panels]] (T97),
which shipped only its part 1 (WebGL plates, batch 12, commit 274e996).

## What happened?

Near-tier HTML panels (`Graph3DNear.ts`: CSS2D, or CSS3D tilted panels in
Planets) sit above the canvas, so they cover **every** edge, including edges
nearer the camera than the panel. In Sawyer's Planets screenshots, the "Git"
image and the "git add" / "Working Directory" panels hide edges that run in
front of them.

## What should have happened?

Where an edge segment is nearer the camera than a panel, the edge shows across
it. Panels already have **plate cut-outs**: a nearer plate is masked out of a
farther panel (`src/graph3d/occlusion.ts`). Extend that so nearer edge segments
are cut out as line-shaped strokes.

## Design (drafted in T97, not built)

- New pure `src/graph3d/edge-cuts.ts`:
  - an `EdgeSegments` buffer: a flat `Float32Array` of the world ends, the world width (0 = line, tapered = ribbon full width) and the two end node ids per segment. The scene's `writeEdges` / `writeRibbon` refill it.
  - `toView`, run once a frame and shared by all panels.
  - `facingStrokes`: clip each segment to near < depth < panel depth, project it, then Liang–Barsky clip it to the panel box.
  - `tiltedStrokes`: clip to the eye's side of the panel plane and short of the eye's distance, then cast from the eye onto the plane, as `tiltedHole` does.
  - Skip segments that end at the panel's own node (the own-plate rule, `own-plate.ts`).
  - Stroke width = max(1.5 CSS px, the tapered width on screen), in lens px.
- `occlusion.ts` `holeMask(holes, strokes)`: each stroke adds one `add` layer. It is a `linear-gradient(<atan2(dy,dx)>deg, …)` sized to the stroke's padded box, with px stops at the gradient-line centre ± half width. The gradient line length is |W sin a| + |H cos a|.
- Add `snapStrokes` beside `snapHoles` in `raster.ts`.
- `Graph3DNear.placeOne` / `placeTilted` add the strokes to the holes. The scene hands the near tier the segment buffer.

## Facts from T97

- Plate backgrounds are opaque and write depth. Glyph layers have `renderOrder = GLYPH_RENDER_ORDER` (-1).
- Every transparent 3D-graph object sits at the origin, so three's draw order is `renderOrder`, then object id.
- Near panels and edge hints sort by `renderOrder = -depth`.

## Acceptance criteria

- [ ] An edge in front of a panel shows across it, in screen-facing panels and in Planets (CSS3D) tilted panels. An edge behind a panel stays hidden.
- [ ] An edge ending at the panel's own node is not cut out of that panel.
- [ ] The mist/fade still looks the same for panels.
- [ ] Measure frame time and mask writes per frame (the perf gauge `masks`) before and after, while orbiting a large map. Report the numbers. No regression >10% without a decision from Sawyer.
- [ ] Unit tests for the pure parts: segment-vs-panel depth clip, Liang–Barsky, tilted cast, the gradient geometry and `snapStrokes`.

## Test plan

Open the 3D graph on a large linked map and fly close so nodes become panels.
Orbit until an edge from a nearer node crosses a farther panel → the edge is
visible across it. Orbit the other way → the panel hides it. Repeat in Planets
(tilted panels). Watch the perf gauge while orbiting.

## Context budget (~35k tokens)

| Read | Range | ~Tokens |
|---|---|---|
| `src/graph3d/occlusion.ts` + test | whole | ~2.5k |
| `src/graph3d/raster.ts`, `tilt.ts`, `own-plate.ts` | whole or the exports | ~3k |
| `src/views/Graph3DNear.ts` | 1–60 (doc), and `placeOne` / `placeTilted` / mask code (`grep -n "mask\|occlu\|placeTilted\|placeOne"`) | ~8k |
| `src/views/Graph3DScene.ts` | `grep -n "writeEdges\|writeRibbon\|near\."` ± 30 lines | ~5k |
| `src/views/Graph3DRibbons.ts` | the write path | ~1.5k |

Read memories `3d-graph-view-feature` (never declutter) and
`justify-work-with-measurements` first.
