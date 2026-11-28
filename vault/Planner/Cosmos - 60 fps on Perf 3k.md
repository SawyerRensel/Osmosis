---
title: Cosmos - 60 fps on Perf 3k
summary: "T141. Cosmos holds 60 fps (frame avg ≤ 16.7 ms) on Perf 3k at Labels 'Plates and panels', Panel detail 1.00, Live panels 48. Diagnose first, then fix the largest cost."
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
  - "[[Mind Map - 60 fps on Perf 3k]]"
  - "[[3D Graph - Live panels hold 60 fps while the camera moves]]"
  - "[[Perf - Full frame timing readout in 3D and 2D]]"
status: To-Do
batch: 18
priority:
progress:
date_created: 2026-11-28T03:39:06.000Z
date_modified: 2026-11-28T03:39:06.000Z
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
# Cosmos - 60 fps on Perf 3k (T141)

## Target
**60 fps: frame average ≤ 16.7 ms** in Cosmos on `vault/tests/perf/Perf 3k.md` (3,002 lines, ~52 code blocks, 6 images; the master copy is `e2e/fixtures/perf/Perf 3k.md`). Measure at Sawyer's settings: Labels "Plates and panels", Panel detail 1.00, Live panels 48.

## Baseline (Sawyer, on their own ~2,000-line note)
fps 28; frame avg 36.3 ms, worst 50 ms; cpu tick 8.44 ms; render 0.51 ms; panels render 5.00 ms, place 3.83 ms; live panels 54 (15 code, 0 image, 39 plain); **untimed 22.4 ms/frame** (browser style, layout and paint); plates 600; glyphs 10,614.

The untimed share is the biggest. It points at the DOM near-tier panels (CSS2DObject transforms, mask-image holes, veil opacity), not WebGL.

## Settled at intake (don't re-ask)
- **Diagnose first.** Establish where the frame goes before changing anything. The sandbox has no GPU, so you cannot see real frames. Do the following:
  1. Reason from the overlay's breakdown (`src/views/CosmosPerf.ts`, `src/perf-stats.ts`; untimed = frame − tick − WebGL − panel render − engine).
  2. Add any missing timer you need to the perf overlay as a permanent, cheap readout.
  3. Write down exactly which numbers Sawyer should read, under which camera motion, in your test steps.
- Then fix the largest cost, and ship whatever gets closest. More than one test round is expected: say in your report what the next round should measure.
- **Prior rules** (`.claude/batch/archive-rounds-2-11/handoff-2d-perf.md` and memory justify-work-with-measurements): text always crisp, no level-of-detail tricks, and measure before proposing. Don't lower Sawyer's settings and don't cap the panel count below their slider.

## Where to look (intake facts)
- Near panels: `src/views/CosmosNear.ts` (1,068 lines; its design header is L1–46). Each panel is a DOM tree in a CSS2DObject (CSS3DObject, tilted, in Planets). Each panel gets a full `MarkdownRenderer.render`. Bodies are cached in an LRU of 64 and cloned on reuse; media and embeds are not cached. `chooseNear` budgets 24 desktop / 12 mobile (`cosmos/lod.ts:17`), but Sawyer's slider is at 48.
- Per frame: `update()` :293, `placeOne()` :771-805 (renderOrder, re-raster on leaving the band, lens transform, mask-image holes from plates and edges via `cutHoles` :926, veil opacity).
- Candidates to *measure*, not assume: writing transform / mask / opacity styles every frame even when they haven't changed, mask-image re-rasterisation, layout thrash from reads after writes, and compositor layer count.
- Prior work: [[3D Graph - Live panels hold 60 fps while the camera moves]] (T77, ~36 fps at 48 panels) and [[Perf - Full frame timing readout in 3D and 2D]].

## Context budget (~90k)
- `src/views/CosmosNear.ts`: L1–120, L280–420, L760–960.
- `src/views/CosmosPerf.ts` (whole, 151 lines); `src/perf-stats.ts` (whole, 126 lines); `src/cosmos/lod.ts` (whole).
- `.claude/batch/archive-rounds-2-11/handoff-2d-perf.md` (whole).
- The two prior Planner notes above: their *What was implemented* sections only.
- `src/views/CosmosScene.ts`: only the frame loop. Find it with `grep -n "requestAnimationFrame\|tick(" src/views/CosmosScene.ts`, then read ±40 lines.

## Acceptance criteria
- Your report names where the frame goes, with numbers (unit or Node micro-benchmarks where possible, and the overlay numbers for Sawyer to read).
- One or more fixes land for the largest measured cost, with no visible change in text or panels.
- Sawyer's overlay on Perf 3k reads frame avg ≤ 16.7 ms while orbiting, or the ticket reports the remaining gap and the next cost to attack.
- lint, test and build pass.

## Test plan
1. Copy the Perf 3k fixture to `vault/tests/perf/` if it is missing, then Ctrl+R.
2. Open it in Cosmos (Layout Organic). Set Labels "Plates and panels", Panel detail 1.00, Live panels 48. Open the perf overlay.
3. Orbit slowly for 5 s, then fast for 5 s. Read: fps, frame avg / worst, cpu tick, render, panels render / place, untimed, and any new rows the worker added.
4. Check that panel text is crisp at rest and while moving.
