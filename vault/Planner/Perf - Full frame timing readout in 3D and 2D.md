---
title: "Perf - Full frame timing readout in 3D and 2D"
summary: "Round 10 (T76). The 3D gauge times only ~2.3 ms of a 28 ms frame. Time everything (panel renderers, layout ticks, browser style/layout/paint), give the 2D map the same gauge, and add a 10,000-line benchmark note."
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
  - "[[3D Graph - Stress web first settle runs at 2 fps]]"
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

# Perf - Full frame timing readout in 3D and 2D (T76)

## Why
Sawyer wants the 2D and 3D Mind Map views to run at a smooth 60 fps on very large notes. The 3D gauge (`src/views/Graph3DPerf.ts`) times only the scene's `tick()` and `WebGLRenderer.render`, and those cover about a tenth of the frame (see the baseline). The fix tickets that follow (T77–T80) need numbers for the other nine-tenths.

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

## What to build
1. **3D gauge: time what is untimed today, behind the existing toggle.** Record nothing while hidden, as now. Add:
   - The near tier's CSS2D and CSS3D renderers. They are registered as `extraRenderers` (`Graph3DScene.ts` ~597) and their render calls `Graph3DNear.place` per panel. Wrap their `render` the way the WebGL render is wrapped.
   - Within that, the time spent in `place` / `placeTilted`, and counts per frame of mask writes (`cutHoles` writes that weren't skipped) and transform writes.
   - The force-engine tick, if the engine is still ticking (`onEngineTick`, ~682).
   - **The browser's own work:** use the Long Animation Frames API (`PerformanceObserver`, type `long-animation-frame`; check that Obsidian's Electron supports it). Report style and layout time (`styleAndLayoutStart`) and the render-phase time (`renderStart`). Where it is unsupported, show the untimed remainder as frame avg minus the timed parts.
   - The number of live panels, and the count of each kind (code block, image, plain).
2. **2D gauge:** the same gauge in the 2D Mind Map, with the toggle in the same place and hidden by default. Show:
   - fps and frame avg/worst while panning and zooming;
   - the cull pass time (`runCullUpdate`) and the number of nodes drawn and kept in the DOM;
   - the time of the last parse, layout and full render, and the last edit's commit time (from the keystroke or op to the redrawn map);
   - the same LoAF style/layout/render numbers.

   Keep the gauge code small and shared with the 3D one where it can be (a pure frame-stats module that vitest can test).
3. **Benchmark notes:** extend `e2e/generate-graph3d-stress.mjs`, or add a sibling generator following its pattern (deterministic output; the master copy in `e2e/fixtures/…` is gitignored, as is the copy in `vault/tests/…`).
   - **"Perf 10k"**: one note of about 10,000 lines. Mix headings at depths 1–5, nested lists, prose, adjacent-line groups (T75), code blocks, callouts, tables, a few images from `vault/media`, block refs and wikilinks. Use neutral domains (no biology).
   - **"Perf 3k"**: a smaller one for phones.
4. **Vitest benchmarks** for the pure 2D pipeline on the 10k note: `OsmosisParser.parse` and `computeLayout` (`src/layout.ts`). Report the numbers rather than assert them; wall-clock asserts are flaky here (memory `flaky-parser-perf-test`).

## Out of scope
Fixing anything. Record the vitest numbers and the obvious suspects for T77–T80 in the implementation notes.

## Context budget
Keep it under ~130k tokens. Read `Graph3DPerf.ts` and `Graph3DNear.ts` whole (they are small). Read `Graph3DScene.ts` only at ~590–720 and ~2940–3000. For `MindMapView.ts`, read only the cull, render and edit-commit paths by grep (`runCullUpdate` ~3411, `computeLayout` ~8501).

## Test plan (Sawyer)
Run the generator. Open "Perf 10k" in 2D and in 3D, open the gauge, and pan, orbit and edit. Report the numbers. These numbers are the baseline T77–T80 are judged against.
