---
title: "3D Graph - New plates lay out without a frame stall"
summary: "Round 10 (T78). Showing new data plates all nodes at once (523 plates in 35 ms; 30,865 in 380 ms on the stress web). Make plating incremental and the simulating tick cheap, so loads and edits don't drop frames."
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

# 3D Graph - New plates lay out without a frame stall (T78)

## Problem
"Last plating 523 in 35.4 ms" (measured) is a stall of about two frames each time new data is shown: on open, after every edit's re-parse, and on refocus. On the stress web it was 30,865 plates in 380 ms. A simulating tick also rewrites every glyph (~700k on the stress web; see the related note).

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

## Directions
- **Plate only what changed.** Cache each node's plate layout (glyph runs, size) keyed by its text and style, so an edit re-plates one node, not 523. Plating happens in `Graph3DScene` setData (~720–786) and `Graph3DPlates`.
- **Time-slice the rest.** Spread the remaining plating over frames, within a per-frame budget of about 4 ms. A plate that isn't laid out yet stays hidden and appears from the background, which Sawyer accepted in "Plates for every node".
- **Cheaper simulating ticks:** store each glyph relative to its plate and read the plate's centre in the vertex shader, so a tick rewrites one centre per plate, not one per glyph. Branches already use 11 of 16 vertex attributes; check the glyph material's count before adding any.
- Keep the atlas upload incremental.

## Done when
An edit on the JS-objects note never drops a frame in the gauge. "Perf 10k" opens in 3D without a frame longer than about 50 ms. Record before and after.

## Context budget
Keep it under ~130k tokens. Read `Graph3DPlates.ts` whole and `src/graph3d/plates.ts`; read `Graph3DScene.ts` only at ~700–800 and ~2970–2990.

## Test plan (Sawyer)
1. Edit a line on the JS-objects note while the gauge is open, and check that "last plating" now shows a small count and time.
2. Open "Perf 10k" in 3D and the stress web hub at depth 2. Check that plates appear smoothly and that styles, colours, selection and focus dimming are unchanged.
