---
title: "Mind Map - 10,000-line notes pan and zoom at 60 fps"
summary: "Round 10 (T79). 2D Mind Map on a 10,000+ line note: opening, panning and zooming hold 60 fps on desktop and phone. Measure first with the T76 gauge and vitest benchmarks."
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

# Mind Map - 10,000-line notes pan and zoom at 60 fps (T79)

## Problem
Sawyer wants the 2D Mind Map to open, pan and zoom a note of 10,000+ lines at 60 fps on desktop and phone. Nothing in 2D has been measured yet; T76 adds the gauge and the "Perf 10k" note.

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

## What the code does today (read from code)
- Nodes are SVG `<foreignObject>` elements holding rendered Markdown. The view keeps a rendered-HTML cache (`nodeHtmlCache`, ~346).
- Viewport culling with a 200 px margin (`CULL_MARGIN`, ~148). Cull passes are serialised (`runCullUpdate`, ~3411) and `drawNode` awaits `MarkdownRenderer`.
- Pan on iOS uses a CSS transform, not the viewBox (memory `mindmap-ios-transform-pan`; there are three things not to "simplify"). Idea note: "Fold every platform onto the mind map's transform pan path".

## Directions (pick by the measured cost)
- If cull passes during a pan are the cost: render newly visible nodes in batches across frames, and skip the cull while the viewport moved less than the margin.
- If the DOM size is the cost: drop offscreen nodes, recycling them through the cache.
- If style/layout is the cost: use `contain` on node boxes.
- Consider the transform-pan path on every platform, if measurement shows viewBox pans repaint. Read that Idea note and the memory first.
- Opening: run parse and layout once, then draw the first viewport before the rest.

## Done when
Panning and zooming "Perf 10k" holds a frame avg of at most 16.7 ms on desktop. "Perf 3k" holds it on a phone. Opening shows the first viewport quickly (record the time).

## Context budget
Keep it under ~130k tokens. `MindMapView.ts` by range only: cull ~3290–3430, `drawNode` ~1700–1800, layout call ~8490–8620. Read `src/mindmap-viewport.ts` and `src/layout.ts` whole.

## Test plan (Sawyer)
Open "Perf 10k" in 2D with the gauge on. Pan fast, pinch or wheel zoom, and fold and unfold a big branch. Then check a normal note for regressions: rendering, links, images, code and callouts, fold, and selection.
