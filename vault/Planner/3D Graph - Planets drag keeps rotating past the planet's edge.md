---
title: "3D Graph - Planets drag keeps rotating past the planet's edge"
summary: "A drag that starts on a planet and leaves its disc snaps to a pole instead of rotating on; it should keep rotating continuously, trackball-style, like Blender's infinite viewport drag. Same for touchpad swipes."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[3D Graph - Planets surface grab anywhere on the sphere]]"
  - "[[3D Graph - Touchpad swipe rotates]]"
status: To-Do
priority:
progress:
date_created: "2026-11-12T17:00:00.000Z"
date_modified: "2026-11-12T17:00:00.000Z"
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

# 3D Graph - Planets drag keeps rotating past the planet's edge (T73)

## Request (Sawyer, 2026-11-12, verbatim)
> When I click-drag with mouse on a planet and my mouse travels beyond the planet extent, it snaps to a pole instead of continuously rotating like I expect (Blender's mouse has infinite dragging when rotating in viewport). This also happens with two finger swip on touchpad.

## Not to re-decide
Round 7: Sawyer **declined a rim-snap** — a drag that *starts off* every sphere keeps orbiting about the clicked point. This ticket is different: a drag that *starts on* a planet.

## Design
- Today the grab follows the surface point under the pointer (`sphereOnRay` in `src/graph3d/globe.ts`, `aim(x,y,touch,grab)` in `Graph3DScene.ts`); off the disc it "holds at the rim" and the rotation snaps toward a pole. T59's note says a long touchpad swipe "still holds at the rim" (`SwipeFeed` in `src/graph3d/wheel-input.ts`, `SWIPE_GAIN` 0.3).
- Once the pointer leaves the disc (or as a whole, if cleaner), switch to **incremental** rotation: rotate by the pointer delta about the axis perpendicular to the motion (in view space), at the angular rate the surface had at the moment it left the disc (or the rate at the disc's centre), with no clamp, snap or discontinuity at the crossing. Moving back over the disc must not jump either.
- Touchpad uses the same path via `SwipeFeed`; make sure swipes get the same continuous behaviour.
- Diagnose first with numbers: log/compute the rotation at the rim crossing in a unit test to show the snap, then show it gone.

## Acceptance criteria
- Mouse: start a drag on a planet, keep moving far past its edge, even off the view: the planet keeps turning in the drag direction, smoothly, never snapping to a pole. Reverse direction: it turns back.
- Touchpad two-finger swipe on a planet: same.
- Drags that start off every sphere: unchanged (orbit).
- Unit tests in globe.test.ts for continuity at the rim.

## Context budget
Under ~130k. Opus. globe.ts, wheel-input.ts, planets.ts whole; Graph3DScene.ts by range around `aim`/grab.

## Conventions
- Batch ticket (round 9). Follow `batch/subagent-brief.md`: own branch stacked on the previous ticket, code commit by path + separate note commit, `status: In-Review`, "Batch implementation notes (awaiting manual test)" section with phone/desktop retest steps. No push, no PR.
- Keys in map views need the view `Scope` (memory: mind map keys need the view Scope). Toolbar buttons come from `TOOLBAR_GROUPS` in `src/views/ToolRibbon.ts`.
- Pure logic goes in modules outside `src/views/` so Vitest can import it (Vitest cannot import `obsidian`).
- `src/views/MindMapView.ts` is ~84k tokens with NUL bytes: never read it whole, use `grep -a -n` and read ranges. Graph3DScene.ts (~37k), Graph3DView.ts (~30k), styles.css (~33k): ranges only.
