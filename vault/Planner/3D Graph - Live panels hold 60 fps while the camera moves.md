---
title: "3D Graph - Live panels hold 60 fps while the camera moves"
summary: "Round 10 (T77). With Panel detail 1 and Live panels 48 the 3D view runs at ~36 fps. Make the near tier's per-frame DOM work cheap enough for 60 fps on desktop and phone, with panel text crisp at all times."
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
  - "[[Perf - Full frame timing readout in 3D and 2D]]"
status: Done
priority:
progress:
date_created: "2026-11-12T18:30:00.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-12T23:31:09.000Z"
date_start_actual: "2026-11-12T23:31:09.000Z"
date_end_scheduled: "2026-11-17T00:43:08.000Z"
date_end_actual: "2026-11-17T00:43:08.000Z"
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/48
---

# 3D Graph - Live panels hold 60 fps while the camera moves (T77)

## Problem
On the JS-objects note with Panel detail 1 and Live panels 48, the 3D view feels "choppy, delayed, and slow" at about 36 fps. Sawyer wants buttery-smooth 60 fps.

## Constraints (Sawyer, 2026-11-12 grill)
- **Target:** 60 fps on **desktop and phone**. On desktop, test with Panel detail 1 and Live panels 48 (the setup in the screenshot).
- **No regressions.** Keep every existing behaviour, and keep the design decisions in memory `3d-graph-view-feature` (no decluttering, no saved positions, settled nodes never move, a nearer thing covers a farther one).
- **Panel text stays crisp at all times**, in motion too. Sawyer rejected "soft while moving, sharp on stop". Never show a raster upscaled past its drawn size.
- **2D "very large" means 10,000+ lines.**
- **Measure before and after.** Record the numbers in this note. Label each finding **measured** or **read from code** (memory `justify-work-with-measurements`).

## Baseline (measured by Sawyer, 2026-11-12, desktop, JS-objects note, Panel detail 1, Live panels 48)
`fps 36  frame avg 28.2 / worst 50.1 ms · cpu: tick 1.46 ms  render 0.85 ms (max 1.2) · draw calls 6  triangles 33980  textures 1 · plates 523  glyphs 9050 · atlas 1 page ~5.3 MB · instances ~0.8 MB GPU · last plating 523 in 35.4 ms`

The JS tick plus the WebGL render explain about 2.3 ms of a 28 ms frame. **About 90% of each frame is untimed.**

## Conventions
- This is a round 10 batch ticket. Follow `batch/subagent-brief.md`: work on your own branch stacked on the previous ticket, commit the code by path and the note separately, set `status: In-Review`, and add a "Batch implementation notes (awaiting manual test)" section with retest steps for phone and desktop. No push, no PR.
- Pure logic goes outside `src/views/`, because Vitest cannot import `obsidian`. Run vitest with `--maxWorkers=2`.
- Never read these files whole; read them by range or with grep:
  - `src/views/MindMapView.ts` (~84k tokens, contains NUL bytes, so use `grep -a -n`)
  - `Graph3DScene.ts` (~37k tokens)
  - `Graph3DView.ts` (~30k tokens)
  - `styles.css` (~33k tokens)

## Suspects (read from code; confirm with the T76 gauge first)
1. **Re-raster on every frame.** `Graph3DNear.place` (~587) writes a new `scale()` to every panel every frame the camera moves. A panel has no compositing layer, so Chromium may repaint all 48 panels' text (including code blocks) each frame.
2. **Masks rewritten every frame.** `cutHoles` (~685) rewrites `mask-image` whenever a hole moves, and in motion holes move every frame. Masks are painted, not composited.
3. **Untimed work.** `panelHoles` runs every panel against every on-screen plate (48 × ~500) inside the CSS2D render.
4. **Style invalidation.** Panels have no `contain`, so a style write may invalidate more than the panel.

## Directions (the implementer picks by measured cost, and records why)
- Containment (`contain: layout paint style` or similar) on panels, if it changes nothing visible.
- Mask writes only when a hole really changes on screen (sub-pixel quantising). Prefilter plates by screen box or with a grid.
- Raster scale with crisp text: composited layers are allowed **only if** the raster is never shown larger than drawn. For example, lay a panel out at a raster scale bucket at or above its drawn scale, and re-raster when the ratio leaves a narrow band. Flag the band you chose as a judgment call for Sawyer to check by eye. Never show text soft while moving.
- Skip transform and opacity writes that don't change anything visible.
- On phones, check that the defaults (budget 12) hold 60 fps on "Perf 3k".

## Done when
Sawyer's gauge on the baseline setup shows a frame avg of at most 16.7 ms while orbiting, with text as crisp as today. Record the before and after numbers here.

## Context budget
Keep it under ~130k tokens. Read `Graph3DNear.ts` whole, plus `src/graph3d/occlusion.ts`, `lod.ts`, `near.ts` and `tilt.ts`. Read `styles.css` only at ~4475–4560 and `Graph3DScene.ts` by range.

## Test plan (Sawyer)
Use the JS-objects note at Panel detail 1 and Live panels 48. Then use Planets mode, which uses tilted CSS3D panels.
1. Orbit, zoom and fly, and compare the gauge to the baseline.
2. Check that panel text is crisp both still and moving, that nearer plates still cut holes in panels, that the mist veil fades, that links, checkboxes and resize still work, and that editing still works.

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

Code commit `b34ec81` on `fix/3d-panels-60fps` (stacked on T76). Nothing here is **measured**: I can't run Obsidian. Every effect below is **expected**, from reading the code and how Chromium renders. Sawyer's gauge decides.

### Cause (read from code)
Every frame, each screen-facing panel got a new `scale()` on its box, a new veil opacity and often a new mask. None of the panels had its own compositor layer. In Chromium, changing a transform, opacity or mask on content without a layer makes the browser re-raster that content. So all 48 panels' text (code blocks included) was redrawn every frame the camera moved. That matches the baseline: ~25 of 28 ms untimed, outside JS and WebGL.

### What changed
1. **Each screen-facing panel is a composited layer, re-rastered in scale buckets** (`src/graph3d/raster.ts`). New DOM: anchor → **lens** (`will-change: transform`, carries the mask) → **fill** (the plate fill, the lens's first child) → box (as before, now with `transform: scale(B)` from its corner, `B` = raster scale). The fill is painted in the lens's own space, so Chromium merges the box's content into the lens layer at scale `B`. The lens transform `translate(-50%,-50%) scale(s/B)` is all the compositor scales. `rasterScale` keeps `s/B` in **[0.9, 1]**. Outside that range it re-rasters at `B = s/0.95`. A panel's first raster is at `B = s` (ratio 1). So the raster is **never shown larger than drawn**, only shrunk by at most 10%.
2. **The CSS2D anchor is composited too** (`will-change: transform`). The renderer's per-frame translate is then a compositor-only update.
3. **The veil is its own layer** (`will-change: opacity`). The mist fade no longer repaints the text under it.
4. **Masks.** The mask moved from the box to the lens. Hole lengths snap to 0.25 screen px (`snapHoles`, `MASK_STEP_PX`), so sub-pixel drift doesn't rewrite the mask. Because the fill is a child of the lens and not the lens's background, a mask write should invalidate only the mask layer, not the text.
5. **Skipped writes.** The cross-fade opacity, lens transform and veil opacity are written only when their value changes.
6. **Gauge.** The `panels:` line now reads `… transforms N  masks N  re-rasters N /frame`. `transforms` now counts lens transform writes that actually happened (before: panels placed).

### Expected effect (not measured)
- **Orbit and pan:** scale drifts by well under 10%, so close to 0 re-rasters a frame. Translate, scale, veil and z-order become compositor work. Masks only repaint their own mask layer. Frame avg should drop from 28.2 ms toward the JS + WebGL cost (~2.3 ms) plus style recalc for ~150 inline writes. I expect it under 16.7 ms.
- **Zoom or fly:** a panel re-rasters about every 5% of scale change, not every frame. All panels change scale together, so they re-raster on the same frame: expect a heavier frame every few frames while zooming, not every frame.
- **Planets mode (tilted CSS3D panels):** unchanged path. The lens has no `will-change` there (only `.osmosis-graph3d-near-flat`, the CSS2D layer, gets it), the box is unscaled and the raster scale is 1. Only the skipped writes, mask snapping and veil layer apply. I don't expect a big gain in Planets mode.

### Decisions worth remembering
- **Band [0.9, 1], reset 0.95: Sawyer, please check by eye.** Between re-rasters the compositor shrinks the text bitmap by up to 10%, which is bilinear resampling. A wider band means fewer re-rasters but softer text. If text looks softer than before while still, raise `RASTER_BAND.low` (for example 0.95, reset 0.975). If zooming stutters, lower it.
- **What "never larger than drawn" relies on.** Chromium chooses a layer's raster resolution itself. For `will-change: transform` layers it keeps that resolution while the transform changes, and I believe it never goes below the layer's own scale 1. The lens's scale is always ≤ 1, so the raster is never enlarged. If that belief is wrong, the worst case is Chromium fixing the resolution at a moment in the band and then enlarging it by up to 1/0.9 = 1.11×. **Check:** zoom slowly into a code block from far away. Text should never look soft or smeared. Panning at a constant distance should look the same as before.
- **Why the fill is a separate child.** The box must be drawn into the lens's layer, not get a layer of its own. In its own layer it would carry the full scale and blur. Something has to paint in the lens's own space before the box for Chromium to merge them, and the fill does that. It can't be the lens's background: a mask write on the lens would then invalidate that background and re-raster the whole layer.
- **The box no longer has a background.** The fill draws it, at the box's corners × `B`. `.is-editing` now hides the lens, so the fill hides too.
- **Not done: plate prefilter for `panelHoles`.** It costs 48 × ~500 arithmetic checks. That's inside the timed `place` figure, which was small in the baseline (`tick` 1.46 ms covers it). Not worth a grid without a measurement saying otherwise.
- **Fractional positions.** Layers sit at sub-pixel positions, as the CSS2D renderer computes them. I didn't round them, because rounding would make a panel jitter by up to half a pixel against its plate.

### Surface map
| File | Change |
|---|---|
| `src/graph3d/raster.ts` | New: `RASTER_BAND`, `rasterScale`, `MASK_STEP_PX`, `snapHoles` |
| `src/graph3d/raster.test.ts` | New: 9 tests (band kept, re-raster up/down, never > 1 over a zoom sweep, snapping) |
| `src/views/Graph3DNear.ts` | Lens + fill elements; bucketed raster in `placeOne`; `sizeLens` (also from the ResizeObserver, same frame); mask on lens with snapping; skipped opacity/transform/veil writes; `NearStats.rasters` |
| `src/views/Graph3DPerf.ts` | `re-rasters /frame` in the panels line |
| `styles.css` | `.osmosis-graph3d-near-lens`, `-fill`, `-flat` will-change; the box loses its fill, gets `transform-origin: 0 0`; veil `will-change: opacity`; `.is-editing` on the lens |

### Fixtures
No new fixture. Use Sawyer's JS-objects note (the baseline setup), `tests/perf/Perf 3k` for the phone (generate with `node e2e/generate-perf-notes.mjs`), and `tests/graph3d/Code Fit Widths` for code panels.

### Retest (desktop, then phone)
1. Reload Obsidian (Ctrl+R). Open the JS-objects note in the 3D graph with Panel detail 1 and Live panels 48, and open the gauge.
2. **Orbit for 5 s, then pan, then zoom with the wheel and fly.** Record the `fps … frame avg …`, `panels: … re-rasters …` and `untimed` lines for each, and compare with the baseline (`fps 36 frame avg 28.2 / worst 50.1 ms`). Done when orbiting is at or below 16.7 ms. Expected: re-rasters near 0 while orbiting, a few a frame while zooming.
3. **Crispness:** compare panel text still and while orbiting against the plates and against the previous build. Zoom slowly into a code block and watch for soft or smeared text (see the band note above).
4. **Behaviour:** nearer plates still cut holes in panels (no flicker at the hole edges); the mist veil fades panels with depth; panels fade in and out over 0.25 s; links, task checkboxes and the width handle (edit mode, select a line) still hit where drawn; editing a line hides its panel and the editor tracks the plate; styled nodes (`tests/graph3d/Styled Mooring`) keep their fill and corners, including semi-transparent fills, with no darker corners.
5. **Planets mode:** repeat steps 2 and 4. Tilted panels should look and behave as before.
6. **Phone:** `tests/perf/Perf 3k` at the defaults (budget 12). Orbit and pinch, and record the gauge. Check text crispness at the phone's pixel ratio.

### Could not verify
All rendering behaviour: whether Chromium merges the box into the lens layer as described, its raster-resolution choice for `will-change` layers, whether mask writes stay off the text layer, GPU memory for ~100 extra layers (lens + veil per panel; expected modest because tiles cover only visible area), and every number above.
