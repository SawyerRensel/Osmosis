---
title: 3D Graph - Stress web first settle runs at 2 fps
summary: "While the stress web settles after first load, frames take ~367 ms but the d3 tick is only ~25 ms and rendering ~1.6 ms; the remaining ~340 ms per frame is unaccounted for, most likely the per-tick rewrite of every glyph instance."
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
  - "[[3D Graph - Plates for every node]]"
status: Ideas
priority:
progress:
date_created: "2026-10-31T16:00:00.000Z"
date_modified: "2026-10-31T16:00:00.000Z"
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
parent: "[[Develop Mind-Map Graph View]]"
children:
blocked_by:
cover:
color:
pull_request:
---

# Optimization

Measured by Sawyer with the perf gauge during the Batch 1 test, 2026-10-31. Sawyer wasn't bothered ("took a second"); this note records the measurement so it isn't lost.

## Measurement

Stress web, depth 2, while settling right after load:

`fps 2  frame avg 367.0 / worst 367.0 ms · cpu: tick 24.93 ms  render 1.57 ms · draw calls 3 · plates 30865  glyphs 695708 · atlas 1 page ~5.3 MB  instances ~32.9 MB GPU · last plating 30865 in 380.1 ms`

![[2026-10-31 3D graph stress web settling.png]]

Once settled: 42–60 fps, tick 4–8 ms, render 0.2 ms.

## Hypothesis

The plates ticket predicted this: on a simulating tick, every glyph's centre (~700k) is rewritten and re-uploaded. Tick + render explain only ~27 ms of the 367 ms. Measure before changing anything (e.g. time `Graph3DPlates.write` on a simulating tick). If confirmed, candidate fixes are storing glyph offsets relative to their plate and reading the plate centre in the vertex shader (one plate-centre buffer update per tick instead of 700k glyphs), or updating only moving nodes.

Earlier note (Phase 3): the stress web's first load was ~3 fps for 5–10 s, not yet attributed.
