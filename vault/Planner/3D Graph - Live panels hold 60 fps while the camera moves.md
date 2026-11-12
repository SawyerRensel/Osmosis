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
status: To-Do
priority:
progress:
date_created: "2026-11-12T18:30:00.000Z"
date_modified: "2026-11-12T18:30:00.000Z"
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
