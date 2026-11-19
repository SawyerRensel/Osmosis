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
status: In-Review
batch: 13
priority:
progress:
date_created: 2026-11-19T12:00:00.000Z
date_modified: 2026-11-19T12:40:00.000Z
date_start_scheduled: 2026-11-19T11:49:52.000Z
date_start_actual: 2026-11-19T11:49:52.000Z
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

## Batch implementation notes (awaiting manual test)

**Both slices shipped in 2307dd8: screen-facing (CSS2D) panels and Planets tilted (CSS3D) panels.**

### Approach

The T97 design, mostly as drafted. One simplification: both panel kinds are the same central projection. A facing panel's strokes are the edge projected from the camera onto the screen. A tilted panel's strokes are the edge cast from the eye onto the panel's plane. In both, a point at distance `d` from the eye (the view depth, or the height below the eye over the panel's plane) lands at `offset + rel · k / d` in panel px. So one pure `cut()` does the depth clip, the projection, the Liang–Barsky clip and the width for both. `facingStrokes` and `tiltedStrokes` only set up the projection.

- `EdgeSegments` (owned by `Graph3DNear` as `near.edges`) is refilled in the scene's `writeEdges`, which runs only when edges change. It holds every line segment (straight or planet arc) and every ribbon segment, with world widths and both end ids.
- `toView` runs once a frame, lazily at the first panel drawn, as `screenPlates` does. It also stores each segment's box on screen (past the near plane, widths included) in px at depth 1. Each panel rejects most segments with four compares before any clipping. That cut the cost from 1.15 to about 0.5 ms/frame in the benchmark below.
- `holeMask(holes, strokes)` adds one `linear-gradient` layer per stroke (`strokeLayer`). `snapStrokes` snaps them like holes. The existing mask key comparison in `cutHoles` already skips a write unless the snapped mask changed.

### Decisions

- **`MIN_STROKE_PX = 1.5` CSS px**, with a 0.5 px ramp each side, as the corner discs have. A line edge is 1 device px, so a cut this wide shows a sliver of whatever the canvas has beside the edge (usually the panel's own plate fill, or background). **Check by eye:** if you see a dark halo along edges crossing a light panel, lower it toward 1.0. If edges look nicked or flicker at the panel, raise it.
- **The tapered width is taken at the middle of the stretch that crosses the panel** (mapped back perspective-correct), not averaged over the segment. A straight tapered edge is one segment from parent to child, so an average would be badly wrong near either end.
- **An edge with either end at the panel's own node is never cut from that panel**, along its whole length (the own-plate rule). Otherwise an edge leaving toward the camera would draw a line from the panel's centre through its text.
- **"In front" for tilted panels means on the eye's side of the panel's plane**, the same rule `tiltedHole` uses for plates. So on a planet, surface arcs (which lie under every tangent plane) don't cut a planet's own panels. Edges from another planet, or ones lifted above the surface, do.
- **Not cut:** the trail thread and particles. Only edges and ribbons fill the buffer. A dashed ribbon is cut as a solid stroke, so its gaps show the canvas behind (background) across the panel.
- **No cap on strokes per panel.** At 10,000 segments the benchmark averaged 23 strokes per panel. A panel behind a dense hairball could carry many more mask layers. Not capped, because I couldn't measure the compositor cost here.

### Measured (Node, vitest, a temporary timing test that was not committed)

These are random clouds: segments 0–120 units long among nodes spread over 600 units, and 30 panels of 320×160 px at depths 60–360, on a 1600×900 viewport. Times are per frame, averaged over 300 frames, and were the same across two runs.

| Segments | Facing: toView + 30 panels | Tilted: 30 panels | Building the mask strings (30 panels) | Strokes / panel (facing, tilted) |
|---|---|---|---|---|
| 2,000 | 0.48–0.51 ms | 0.54–0.57 ms | 0.17 ms | 4.6, 2.2 |
| 10,000 | 2.37 ms | 2.62–2.63 ms | 0.80 ms | 23.1, 11.3 |

Before the screen-box rejection, 2,000 segments cost 1.15 ms (facing) and 1.6 ms (tilted).

**Mask writes per frame:** at most one per panel per frame, as before. Any panel with a stroke now rewrites its mask on every orbiting frame, because its strokes move. Before, only panels with plate holes did. So the perf gauge's `masks` count should go up while orbiting. I could not measure whether frame time regresses by more than 10%. That needs Obsidian (see the test steps).

### Surface map

| File | Change |
|---|---|
| `src/graph3d/edge-cuts.ts` | New: `EdgeSegments`, `toView` (with screen boxes), `screenBox`, `cut`, `facingStrokes`, `tiltedStrokes`, `MIN_STROKE_PX`. |
| `src/graph3d/edge-cuts.test.ts` | New: the depth clip, the near plane, Liang–Barsky, own-node skip, tapered widths, layout-px scale, tilted cast, the eye-side clip. |
| `src/graph3d/occlusion.ts` | `holeMask(holes, strokes = [])`; `strokeLayer` gradient geometry. |
| `src/graph3d/occlusion.test.ts` | Tests for stroke layers and the gradient geometry (level, 45°, vertical). |
| `src/graph3d/raster.ts` (+ test) | `snapStrokes`. |
| `src/views/Graph3DNear.ts` | `edges` buffer, lazy per-frame `viewEdges`, strokes in `placeOne` / `placeTilted`, `cutHoles` takes strokes. |
| `src/views/Graph3DScene.ts` | `writeEdges` / `writeRibbon` refill `near.edges`; `writeRibbon` takes the parent node. |

### Fixture

No new fixture. As T97 said, any large linked map in `vault/` works, because this is about geometry, not content.

### Not verified

- Not run in Obsidian. I have not seen it work: that the gradient angle convention and stops land on the drawn edge, that stroke widths look right, and how much the frame time and the `masks` count change.
- That the CSS3D panel's mask lines up with tilted panels on a slanted view. It uses the same cast as `tiltedHole`, which is exact for a panel seen flat-on.
