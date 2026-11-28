---
title: Mind Map - 60 fps on Perf 3k
summary: "T142. The 2D mind map holds 60 fps (frame avg ≤ 16.7 ms) on Perf 3k while panning and zooming. Diagnose first, then fix the largest cost."
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
  - "[[Cosmos - 60 fps on Perf 3k]]"
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
# Mind Map - 60 fps on Perf 3k (T142)

## Target
**60 fps: frame average ≤ 16.7 ms** in the 2D mind map on `vault/tests/perf/Perf 3k.md` (3,002 lines, ~52 code blocks, 6 images), while panning and zooming. This is the last ticket of the batch, so it measures the final code.

## Settled at intake (don't re-ask)
- **Diagnose first**, as in T141 ([[Cosmos - 60 fps on Perf 3k]]): reason from the 2D perf readout ([[Perf - Full frame timing readout in 3D and 2D]], `src/perf-stats.ts`). Add any timer you need as a permanent cheap readout, and give Sawyer exact numbers to read under exact motions.
- Fix the largest measured cost, and ship what gets closest. More than one test round is expected.
- **Prior rules** (`.claude/batch/archive-rounds-2-11/handoff-2d-perf.md`; memories justify-work-with-measurements and mindmap-ios-transform-pan): 60 fps is the minimum, text is always crisp, no level-of-detail tricks, and measure first. Panning uses a CSS transform, not the viewBox. Don't "simplify" the three things that memory lists.
- `MindMapView.ts` is ~84k tokens: **never read it whole**. Use `grep -an` (NUL bytes; memory mindmap-edit-grep-blind-spot) and read targeted ranges.

## Where to look
- The archive handoff lists the previous 2D perf findings and what was already tried. Start there to avoid repeating it.
- The frame path: culling against the live viewBox (`MindMapView.ts` ~L3451), the pan / zoom transform, foreignObject bodies (code blocks, images), and the perf readout hooks (`grep -an "perf\|frameStats\|PerfGauge" src/views/MindMapView.ts`).

## Context budget (~90k)
- `.claude/batch/archive-rounds-2-11/handoff-2d-perf.md` (whole).
- `src/perf-stats.ts` (whole); `src/views/PerfGauge.ts` (whole).
- `src/views/MindMapView.ts`: the grep hits above, ±40 lines each, to a cap of ~40k tokens of this file.
- The *What was implemented* section of [[Perf - Full frame timing readout in 3D and 2D]], and any "Mind Map … 60fps" Planner note (`ls vault/Planner | grep -i "60\|fps\|perf"`).

## Acceptance criteria
- Your report names where the 2D frame goes, with numbers.
- Fixes land for the largest measured cost, with no visible change in text.
- Sawyer's readout on Perf 3k reads frame avg ≤ 16.7 ms while panning and zooming, or the report gives the remaining gap and the next cost.
- lint, test and build pass. (The parser perf test is flaky under load: re-run it before investigating.)

## Test plan
1. Open `vault/tests/perf/Perf 3k.md` in the mind map (Layout Mindmap). Open the perf readout.
2. Pan steadily for 5 s, zoom in and out for 5 s, then fling-pan. Read fps, frame avg / worst, and the rows the worker names.
3. Check that the text is crisp at rest and while moving, and that code blocks and images render.
