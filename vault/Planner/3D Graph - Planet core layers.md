---
title: "3D Graph - Planet core layers"
summary: "Round 11 (T85). Planets layout: a Core layers slider sets N concentric shells evenly spaced between the core and the surface; plates sit on the shell of their outline depth (deeper clamped to the surface)."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[3D Graph - Planets mode]]"
  - "[[3D Graph - Planet core layer shells drawn]]"
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

# 3D Graph - Planet core layers (T85)

## Request (Sawyer, 2026-11-15)
> What if we had planet core layers? A slider that controlled the number of layers/headings of concentric spheres evenly spaced along the radius of the planet?

## Spec (grilled with Sawyer, 2026-11-15)
- **Slider "Core layers"** in the **Planets** section of Overlays, next to Continent spacing / Direction / Balance (`src/graph3d/overlays.ts`). Integer N; **1 = today's single surface** (default, so nothing changes until moved). Pick a sensible max (e.g. 6) and record it.
- **Shells evenly spaced along the radius** between core and surface: shell k of N at radius `R·k/N` (k = 1…N, shell N = today's surface), or another even spacing that keeps the innermost shell clear of the core — record the call.
- **Placement: outline depth, clamped.** Depth 1 (continents, the root's children) on shell 1 (innermost), depth 2 on shell 2, … depth ≥ N on the surface. Works for heading-less notes.
- **Orbit/direction preserved:** each plate keeps the direction from the planet centre it gets today (its spot in its continent's 2D map); only its radius changes. (Orchestrator's reading of "concentric spheres"; record if this breaks spacing — inner shells have less area, so check plate overlap on inner shells and scale per-shell spacing if needed, staying panel-aware via `flatSize`.)
- **Live re-settle while dragging the slider**: plates glide to their new shells. This is a **new approved re-settle exception** (Sawyer, 2026-11-15) — add it to the list in memory-facing notes; settled nodes otherwise never move.
- **Drawing the shells and fading outer shells is T86**, not this ticket. This ticket is layout + slider + live re-settle only. Branches/edges must still connect correctly between shells.

## Where the code is
`src/graph3d/planets.ts` (core at centre, continents on the surface: `radius`, `places`, `centres` ~450–490), `overlays.ts` (Planets options; `continentSpacing`; change-detection helpers ~136–146 decide re-settle vs fresh layout), `globe.ts` (grab/drag assumes the surface — grabbing must still work; note if inner-shell plates are hard to reach, T86 handles visibility).

## Conventions
- Round 11 batch ticket. Follow `batch/subagent-brief.md`: stay on the branch the orchestrator checked out, commit code by path and the note separately, set `status: In-Review`, add "Batch implementation notes (awaiting manual test)" with desktop and phone retest steps. No push, no PR.
- `vault/Bases/Osmosis Project Board.base` has an uncommitted edit of Sawyer's. Never stage, revert or touch it; "clean tree" means clean apart from that file.
- Pure logic goes outside `src/views/` (Vitest cannot import `obsidian`). Run vitest with `--maxWorkers=2`.
- Never read whole: `src/views/MindMapView.ts` (~84k tokens, NUL bytes, use `grep -a -n`), `Graph3DScene.ts`, `Graph3DView.ts`, `Graph3DNear.ts`, `styles.css`.

## Done when
Slider exists in Planets section; N=1 is pixel-identical to today; N>1 places plates by depth on even shells; live re-settle; unit tests for the shell radius/placement pure function.

## Context budget
~130k. `planets.ts` and `overlays.ts` whole; settings UI for Planets section and re-settle path in `Graph3DView.ts`/`Graph3DScene.ts` by grep (`continentSpacing`).

## Test plan (Sawyer)
Planets layout on a multi-level note: Core layers 1 = as before. Drag to 3, 4: plates glide inward by depth, continents innermost, leaves on the surface. Grab-rotate still works. Phone too.
