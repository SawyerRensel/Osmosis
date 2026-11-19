---
title: 3D Graph - Edges respect depth over plates and panels
summary: "Batch 12 (T97). Plates and near-tier panels draw over nearer edges regardless of depth; a nearer edge must show over a farther plate or panel."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[3D Graph Phase 4 - Near tier]]"
status: In-Review
batch: 12
priority:
progress: 50
date_created: 2026-11-18T12:00:00.000Z
date_modified: 2026-11-19T11:45:10.000Z
date_start_scheduled: 2026-11-19T04:03:37.000Z
date_start_actual: 2026-11-19T04:03:37.000Z
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

# 3D Graph - Edges respect depth over plates and panels (T97)

## What happened?

In the 3D graph, nodes still appear **in front of edges regardless of depth**
(Sawyer, four screenshots). An edge that passes in front of a farther node is
hidden behind it. In the Planets screenshots, the "Git" image plate draws over
edges that run in front of it, and near-tier panels ("git add", "Working
Directory") cover edges that should cross them.

## What should have happened?

Edges respect depth. Where an edge is nearer the camera than a plate or panel,
the edge shows on top. Where it's farther, the node covers it.

**Scope (Sawyer chose "Plates and panels"):** both tiers.

1. **WebGL plates:** a depth-buffer problem. Edges (`Graph3DScene.ts:697`, `LineBasicMaterial … transparent: true, depthWrite: false`), ribbons (`Graph3DRibbons.ts:34`, same) and the plate/glyph materials (`Graph3DPlates.ts:~691`, `transparent: true, depthWrite: false`) are all transparent and write no depth, so draw order decides and plates win. Find the minimum change that makes plates occlude edges by depth and edges occlude plates by depth (e.g. opaque plate bodies writing depth, with fog/mist fading done without blending, or edges writing depth before plates draw). Mind the mist/fade (`plateVisibility`), which may be why plates are transparent.
2. **Near-tier HTML panels** (`Graph3DNear.ts`: CSS2D, or CSS3D in Planets) sit above the canvas, so no canvas edge can draw over them. They already have **plate cut-outs**: a nearer plate is masked out of a farther panel (`src/graph3d/occlusion.ts`). Extend this so a **nearer edge segment** is also cut out of a farther panel. Edges are thin, so the mask is a set of line-shaped strokes in the panel's local space, clipped to where the edge is nearer than the panel. Measure the per-frame cost (memory `justify-work-with-measurements`), since masks are re-rastered layers (`raster.ts`).

Do 1 first and commit it. It's independently shippable. If 2 outgrows the
context budget, stop after 1 and report a slice. The orchestrator will split 2
into a new ticket.

## Acceptance criteria

- [ ] Far-tier plates: an edge in front of a plate draws over it, and an edge behind it is hidden. Holds in the default layout and in Planets.
- [ ] Near-tier panels: an edge in front of a panel shows across it, in screen-facing panels and in Planets (CSS3D) tilted panels.
- [ ] The mist/fade still looks the same for plates and panels.
- [ ] Frame time measured before and after on a large map (the 2D/3D perf gauge). Report the numbers. No regression >10% without a decision from Sawyer.
- [ ] Unit tests for the pure parts (edge-segment vs panel-plane depth, clipping, mask path).

## Test plan

Manual: open the 3D graph on a large linked map. Orbit until an edge from a near
node crosses in front of a farther plate → the edge is visible across the plate.
Orbit to put the plate in front → the plate hides the edge. Fly close so nodes
become HTML panels and repeat. Repeat in Planets layout, where panels are
tilted. Watch the perf gauge while orbiting.

## Context budget (~45k tokens; the largest in the batch)

| Read | Range | ~Tokens |
|---|---|---|
| `src/views/Graph3DPlates.ts` | material setup: `grep -n "Material\|depth\|transparent"` ± 30 lines, plus the shader strings | ~5k |
| `src/views/Graph3DScene.ts` | 680–720 (edge/thread materials), the edge geometry update (`grep -n "edgeMaterial\|updateEdges"`) | ~4k |
| `src/views/Graph3DRibbons.ts`, `Graph3DSticks.ts` | whole | 2.5k |
| `src/views/Graph3DNear.ts` | 1–60 (doc), and the mask/occlusion code (`grep -n "mask\|occlu"`) | ~5k |
| `src/graph3d/occlusion.ts` + test | whole | ~2.5k |
| `src/graph3d/tilt.ts`, `raster.ts` | skim the exports | ~2k |

Read memory `3d-graph-view-feature` first (plates replace spheres; never declutter).

## Batch implementation notes (awaiting manual test)

**Slice shipped: part 1 (WebGL plates), in 274e996. Part 2 (near-tier panel edge cut-outs) is not done. It needs its own ticket.**

### Cause (part 1)

The ticket assumed plates are transparent. They are not. Plate backgrounds are already opaque and write depth (`Graph3DPlates.ts`, since "Plates draw over branches that are in front of them"), and edges test depth against them. So an edge behind a plate background was already hidden, and an edge in front of one already drew over it. What was broken is the **glyphs**. Glyph layers are `transparent`, `depthWrite: false`, and their meshes are made lazily when an atlas page is (`reserve` → `addGlyphLayer`). That happens after the scene constructor makes the edges. three sorts transparent objects by `renderOrder`, then z (equal here, since every object sits at the origin), then object id. So glyphs drew after the edges. The depth buffer held only the plate's depth, so a farther plate's **text was painted over a nearer edge** crossing it.

### Fix

Glyph layers get `renderOrder = GLYPH_RENDER_ORDER` (-1), so they draw first among transparent objects, straight after the opaque plates. Edges, ribbons, thread and particles then draw over farther text, and are still hidden behind nearer plate backgrounds by depth.

### Decisions

- **Moved the glyphs earlier, not the edges later.** Raising edges to renderOrder 1 would have put boundaries and shells (translucent, renderOrder 0) before the edges, so an edge would paint over a nearer boundary tint. With glyphs at -1, the only order change is glyphs against the other transparent objects.
- **Side effect (check by eye):** a translucent boundary patch or planet shell in front of a plate now tints the plate's text as well as its background. Before, the text was drawn on top untinted. Mist and focus dimming are in-shader and unchanged.
- **The own-plate rule is unchanged.** An edge still passes under the plates at its own two ends (`own-plate.ts`). If an edge vanishes over the plate of a node it connects to, that is by design, not this bug.
- **The screenshots weren't available** (none embedded, none in `vault/media/`). The note says the Planets "Git" image and "git add" / "Working Directory" are panels, so most of what Sawyer saw is probably part 2: HTML panels sit above the canvas and cover every edge.

### Surface map

| File | Change |
|---|---|
| `src/views/Graph3DPlates.ts` | `GLYPH_RENDER_ORDER = -1` (exported, documented). Each glyph layer mesh gets it. |
| `src/views/Graph3DPlates.test.ts` | Test: glyph layers have the negative render order, the plate background keeps 0. |

### Remaining (part 2, not started in code): near-tier panel edge cut-outs

A design was drafted and then dropped for context budget. Nothing of it is committed. The plan:
- New pure `src/graph3d/edge-cuts.ts`:
  - an `EdgeSegments` buffer (flat `Float32Array` of world ends, world width (0 = line, tapered = ribbon full width), and the two end node ids per segment). The scene's `writeEdges` / `writeRibbon` refill it.
  - `toView` (once a frame, shared by all panels).
  - `facingStrokes`: clip each segment to near < depth < panel depth, project, then Liang–Barsky to the panel box.
  - `tiltedStrokes`: clip to the eye's side of the panel plane and short of the eye's distance, then cast from the eye onto the plane, as `tiltedHole` does.
  - Skip segments that end at the panel's own node (own-plate rule).
  - Stroke width = max(1.5 CSS px, tapered width on screen), in lens px.
- `occlusion.ts` `holeMask(holes, strokes)`: each stroke is one more `add` layer. It is a `linear-gradient(<atan2(dy,dx)>deg, …)` sized to the stroke's padded box, with px stops at the gradient-line centre ± half width. The gradient line length is |W sin a| + |H cos a|.
- Add `snapStrokes` beside `snapHoles` in `raster.ts`.
- `Graph3DNear.placeOne` / `placeTilted` add the strokes to the holes. The scene hands the near tier the segment buffer.
- Measure: the pure cost (panels × segments per frame), and mask writes per frame during an orbit (perf gauge `masks`). Masks re-raster, so this is the risk.

### Fixture

No new fixture. Any large linked map in `vault/` works. The bug is about geometry, not content.

### Not verified

- Not run in Obsidian, and I had no screenshots to check against.
- Frame time before and after was not measured. The change adds no draw calls and no per-frame work (same objects, different sort key), so I expect no perf change, but that is from reading code, not measured.
