---
title: "Mind Map - 10,000-line notes edit without a stall"
summary: "Round 10 (T80). 2D Mind Map on a 10,000+ line note: typing in a node, Enter/Tab and moves commit without a visible stall. Parse, layout and redraw only what changed."
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
  - "[[Mind Map - 10,000-line notes pan and zoom at 60 fps]]"
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

# Mind Map - 10,000-line notes edit without a stall (T80)

## Problem
On a 10,000-line note, each commit (typing a node's text, Enter, Tab, moves, delete) probably re-parses the whole note, re-lays it all out and redraws (read from code: `parser.parse` ~8197, `computeLayout` ~8501). Sawyer wants edits without a visible stall.

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

## Directions (by the T76 numbers and the vitest benchmarks)
- Find the cost per stage for one edit on "Perf 10k": file write, parse, style lookup (`buildTreePathMap` is called several times, ~8607/8780/8807), layout, and redraw.
- Fix the biggest stage first:
  - for parse and layout: an incremental update of the changed subtree;
  - for redraw: reuse the culled DOM and the HTML cache for unchanged nodes (keyed so that a moved node keeps its render).
- Edit behaviour must not change at all. `mindmap-edit.test.ts`, `edit-*.test.ts` and `select-after-delete.test.ts` must stay green.

## Done when
On "Perf 10k", an edit commits in under about 50 ms on desktop, and under about 100 ms on a phone with "Perf 3k". Record before and after.

## Context budget
Keep it under ~130k tokens. Read `src/parser.ts` and `src/layout.ts` whole, `src/edit-pipeline.ts` and `src/styles.ts` by grep, and `MindMapView.ts` by range only.

## Test plan (Sawyer)
On "Perf 10k":
1. Type in a node and press Enter, Tab, Shift+Tab and Shift+Enter.
2. Move a branch with Alt+arrows, delete a node, then undo and redo.
3. Watch the gauge's "last edit" time.
4. Then repeat the usual edits on a normal note to check for regressions.
