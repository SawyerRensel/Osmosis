---
title: "3D Graph - Planet core layer shells drawn"
summary: "Round 11 (T86). With Core layers > 1, each shell draws as a faint translucent sphere, and outer shells fade as the camera zooms in past them so inner plates become readable and reachable."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[3D Graph - Planet core layers]]"
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

# 3D Graph - Planet core layer shells drawn (T86)

## Spec (grilled with Sawyer, 2026-11-15)
Follows T85 (layout + slider). **Translucent + fade**: each shell (1…N−1, and the surface as today) draws as a faint translucent sphere; shells **fade out as the camera goes inside / close to them**, so plates on inner shells become readable. Plates on a faded shell must not be hidden or block picking of inner plates (check raycast/pick order; a faded outer plate should not steal clicks meant for an inner one only if that's how "nearer covers farther" already works — memory `3d-graph-view-feature`: no decluttering, a nearer thing covers a farther one; record what you do).

## Where the code is
`Graph3DBoundaries` (planet boundary patches, `PATCH_PUSH`), `src/graph3d/planets.ts`, `globe.ts` (grab/orbit assume one surface: grabbing should pick the outermost *visible* shell or keep the surface; record the call). Depth: plates draw at real depth; branches use 11 of 16 vertex attribute slots.

## Conventions
- Round 11 batch ticket. Follow `batch/subagent-brief.md`: stay on the branch the orchestrator checked out, commit code by path and the note separately, set `status: In-Review`, add "Batch implementation notes (awaiting manual test)" with desktop and phone retest steps. No push, no PR.
- `vault/Bases/Osmosis Project Board.base` has an uncommitted edit of Sawyer's. Never stage, revert or touch it; "clean tree" means clean apart from that file.
- Pure logic goes outside `src/views/` (Vitest cannot import `obsidian`). Run vitest with `--maxWorkers=2`.
- Never read whole: `src/views/MindMapView.ts` (~84k tokens, NUL bytes, use `grep -a -n`), `Graph3DScene.ts`, `Graph3DView.ts`, `Graph3DNear.ts`, `styles.css`.

## Done when
Shells visible as faint spheres at N>1, fade by camera distance, inner plates readable and selectable when zoomed in, N=1 unchanged, phone frame rate not hurt (one sphere mesh per shell, shared material params).

## Context budget
~130k. T85's implementation notes first; `planets.ts`, `globe.ts` whole; boundaries file whole if small; scene by grep.

## Test plan (Sawyer)
Planets, Core layers 3: faint shells visible; zoom toward the planet — outer shell fades, inner continent plates readable; click them; rotate-grab still works; Core layers 1 looks as before.
