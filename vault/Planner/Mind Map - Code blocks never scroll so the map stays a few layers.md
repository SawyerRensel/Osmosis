---
title: "Mind Map - Code blocks never scroll so the map stays a few layers"
summary: "Round 11 (T88). Measured: 48 scrollable code blocks make the 2D map 263 compositor layers (~28 ms frames). Code blocks (and any other scroll container) in 2D nodes never scroll: they show their full content."
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
  - "[[Mind Map - Pan and zoom at 60 fps on a large map]]"
status: To-Do
priority:
progress:
date_created: "2026-11-16T23:40:00.000Z"
date_modified: "2026-11-16T23:40:00.000Z"
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

# Mind Map - Code blocks never scroll so the map stays a few layers (T88)

## Measured (Sawyer's DevTools trace, 2026-11-16, real 524-node JS note at fitted zoom, panning, build 8c6ceea)
Trace: `ref/perf-traces/Trace-20261116T182249.json` (216 MB, gitignored; parse line by line, never `json.load` whole — 7 GB RAM).
- T87's layer translate works (`37 layer moves/s, 0 repaints/s`) but the frame stayed ~28 ms (27.9 vs 28.2 before). Sawyer's Layers panel: **246 layers**.
- `LayerTreeHostImpl:snapshot`: **263 cc layers**. Compositing reasons: **208 "Overlaps other composited content"**, **51 "scrollable overflow element using accelerated scrolling"** — 48 of those are `PRE class='language-js'` (code blocks), plus **49 `LayoutCustomScrollbarPart`** layers. The overlap layers are node rects, collapse circles and other PREs painted above a composited scroller (layer explosion).
- So every frame re-layerizes/overlap-tests/commits ~260 layers; cost scales with code blocks on screen (zoomed in, 54 nodes → 61 fps). Main-thread Commit/UpdateLayer times in that trace are inflated by "advanced paint instrumentation"; don't read them as real.

## Decision (Sawyer, 2026-11-16)
**Code blocks never scroll; show it all.** A code block in a 2D map node grows to its full content: no clipping, no scrollbar. Long code makes larger nodes and changes layout — accepted.

## Work
1. Find what makes node code blocks scroll (Obsidian's `pre { overflow-x: auto }`, any max-width/max-height on code nodes in `styles.css` or the measurer). Make every scroll container inside 2D node content non-scrolling (`overflow: visible`, or `clip` only where something must not spill) — check tables, callouts, embeds, math, too, not only `pre`. The measurer (`measureNodeSizes` / `collectMeasureWork` / `measureEntries`) must measure the same full size the drawn node shows; no clipped or over-wide nodes.
2. Keep the 2D look otherwise. Don't touch the 3D near panels or study cards unless they share the rule (record it).
3. Verify the layer count drop without Obsidian as far as possible (e.g. by reasoning on which elements remain composited: the layer, toolbar backdrop-filter, rating bubble, perf gauge); Sawyer will confirm with the Layers panel and gauge.
4. Keep T87's composited-layer pan; it becomes effective once the layer explosion is gone.

## Conventions
- Round 11 batch ticket. Follow `batch/subagent-brief.md`: stay on the checked-out branch, commit code by path and the note separately, `status: In-Review`, "Batch implementation notes (awaiting manual test)" with desktop + phone retest steps. No push, no PR.
- `vault/Bases/Osmosis Project Board.base` has an uncommitted edit of Sawyer's. Never stage, revert or touch it.
- `src/views/MindMapView.ts` (~84k tokens, NUL bytes): `grep -a -n` and range reads only. `styles.css` by grep/range.

## Done when
No element inside 2D node content can scroll; code nodes show all their code at the correct measured size; Sawyer's Layers panel shows roughly a dozen layers on the same note and the gauge shows ≥ 60 fps panning at fitted zoom.

## Context budget
~80k. `styles.css` by grep (`pre`, `overflow`, `max-height`, `max-width`, `osmosis-code`), measurer in MindMapView by grep.

## Test plan (Sawyer)
Same real JS note: code nodes show full code, no scrollbars, nothing clipped or overflowing its box; Layers panel count; gauge fps panning at fitted/mid/zoomed-in; zoom-out text sharp. Regressions: tables, callouts, images, math, transclusions, resized nodes, study modes.
