---
title: "Mind Map - 10,000-line notes open with the first view first"
summary: "Round 11 (T84). 2D Mind Map on 10,000+ line notes: draw the first viewport before MarkdownRenderer has measured every node, and trim the per-edit cost. Continues T79/T80."
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
  - "[[Mind Map - 10,000-line notes pan and zoom at 60 fps]]"
  - "[[Mind Map - 10,000-line notes edit without a stall]]"
status: To-Do
priority:
progress:
date_created: "2026-11-15T21:50:00.000Z"
date_modified: "2026-11-15T21:50:00.000Z"
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

# Mind Map - 10,000-line notes open with the first view first (T84)

## Request (Sawyer, 2026-11-15)
> Let's strive to make 2D mind mapping more performant.

Sawyer has **no 2D gauge numbers yet** (T79/T80 untested) and said go anyway, targeting the known hot spots. **No zoomed-out level of detail** (not approved; visuals unchanged).

## Constraints (round 10, unchanged)
60 fps desktop *and* phone; 10,000+ lines = very large; text crisp at all times (no upscaled rasters); no regressions. Measure before/after where you can (vitest benchmarks over the pure stages, timing logs routed to the T76 gauge) and label each finding **measured** or **read from code** (memory `justify-work-with-measurements`).

## Known open items (from T79/T80 notes; read their "Batch implementation notes")
1. **Opening** awaits `MarkdownRenderer` for all ~4,136 nodes on Perf 10k before the first frame. Direction: measure/render the nodes in (and near) the first fitted viewport first and draw; measure the rest in time-sliced batches (idle/rAF chunks) and relayout once sizes settle — without a visible jump of what is already on screen (estimated sizes for unmeasured nodes; check how T79 batched size reads). This is the priority.
2. **Edit path** ~27 ms pure on Perf 10k (normalise 6.8 ms, parse 12 ms, layout 5–6 ms) plus **two full-file `vault.read`s per edit**. Remove the redundant read(s) if safe (the file is authoritative — see CLAUDE.md "reset hazard"; don't break external-edit detection). Do this second, only if budget allows.
3. Fitted-zoom repaint of ~320 `<foreignObject>` nodes on every pan: **out of scope** unless a crisp-preserving fix is cheap; record findings.

## Benchmark notes
`node e2e/generate-perf-notes.mjs` → `tests/perf/Perf 10k`, `Perf 3k` (check whether they already exist under `vault/tests/perf/`).

## Conventions
- Round 11 batch ticket. Follow `batch/subagent-brief.md`: stay on the branch the orchestrator checked out, commit code by path and the note separately, set `status: In-Review`, add "Batch implementation notes (awaiting manual test)" with desktop and phone retest steps. No push, no PR.
- `vault/Bases/Osmosis Project Board.base` has an uncommitted edit of Sawyer's. Never stage, revert or touch it; "clean tree" means clean apart from that file.
- Pure logic goes outside `src/views/` (Vitest cannot import `obsidian`). Run vitest with `--maxWorkers=2`.
- Never read whole: `src/views/MindMapView.ts` (~84k tokens, NUL bytes, use `grep -a -n`), `Graph3DScene.ts`, `Graph3DView.ts`, `Graph3DNear.ts`, `styles.css`.

## Done when
Perf 10k shows its first fitted view before all nodes are measured, with no visible jump; open-to-first-frame recorded (gauge line) for Sawyer to compare. Edit-path item done or recorded as remaining.

## Context budget
~130k. T79/T80 notes' implementation sections; `MindMapView.ts` by range around render/measure (grep `MarkdownRenderer`, `measure`, `render (measure`), `src/layout.ts` whole, gauge code by grep.

## Test plan (Sawyer)
Open Perf 10k (desktop) and Perf 3k (phone): note the gauge's `render (measure …)` / first-frame line; the view appears quickly and nothing already visible jumps when the rest is measured. Pan/zoom, fold, edit; regressions on a normal note (code, tables, images, checkboxes, resized nodes, callouts, transclusions, boundaries, find, study modes).
