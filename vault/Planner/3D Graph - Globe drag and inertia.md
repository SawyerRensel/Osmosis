---
title: 3D Graph - Globe drag and inertia
summary: "Dragging a planet makes the grabbed surface point stick to the cursor, and pan, zoom and rotation decelerate with inertia like the 2D map, like spinning a physical globe."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[3D Graph - Mouse-look easing]]"
  - "[[3D Graph - Planets mode]]"
  - "[[Add inertia for pinch-zoom gesture on Mind Map view]]"
  - "[[Graph pointer gestures - orbit, pan, link, menu]]"
status: To-Do
priority:
progress:
date_created: "2026-11-10T12:00:00.000Z"
date_modified: "2026-11-10T12:00:00.000Z"
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

# Feature Request

## What do you need built?

Sawyer wants dragging a globe to feel like spinning a physical globe: the point of the surface he grabbed stays under the cursor as he drags, and when he lets go it keeps turning and slows down. Today rotation is a fixed rate per pixel, so a big planet or a close camera spins far too fast (or too slowly), and nothing coasts to a stop.

Inertia is wanted for pan, zoom AND rotation, like the 2D map's inertia.

## What problem does this solve?

When you press a point on a planet and drag, that surface point follows the cursor. On release, rotation, pan and zoom each continue and decelerate smoothly to a stop. Related: [[3D Graph - Mouse-look easing]].

## What's your current workaround?

Orbiting a planet moves the surface at a rate that depends on nothing but the window height, so the surface does not follow the cursor, and every gesture stops dead on release.

## Batch and checkpoint

Round 7, Batch A (fixes). Checkpoint: checkpoint 1 (A + B) (checkpoint 1 = A + B, checkpoint 2 = C, checkpoint 3 = D).

## Decisions (settled with Sawyer, 2026-11-10 design session; not to be re-decided)

> Rotation: grabbed surface sticks to cursor; ADD inertia/deceleration for pan, zoom AND rotation (like 2D map, like spinning a globe).

Plus the Sawyer phrasing: rotation rate scales with distance and planet radius (arcball-style grab), and deceleration is "like spinning a physical globe".

## Code facts (from the round 7 scout, 2026-11-10)

Refs are as of the scout; spot-check them before relying on a line number.

- Drag rotation: the camera orbits a pivot (the planet core when pressing a surface plate), at `ORBIT_RATE` = 2π / height radians per pixel. It is not scaled by distance or planet radius (facts, `src/views/Graph3DScene.ts` and `src/graph3d/pivot.ts`).
- Mouse-look has its own easing: `src/graph3d/look-ease.ts` (+ test). Reuse its shape for decay where it fits.
- 2D map inertia exists (see [[Add inertia for pinch-zoom gesture on Mind Map view]] and the mind map's pan code in `src/views/MindMapView.ts`); copy the feel, not the code, since 3D uses a camera orbit.
- Pointer gestures (orbit, pan, link, menu) are described in [[Graph pointer gestures - orbit, pan, link, menu]].

## Acceptance criteria

- Pressing a point on a planet and dragging keeps that point under the cursor to within a few pixels for the drag's duration, at any camera distance and for any planet radius (angular rate = pixel motion / (distance to surface, scaled by radius)).
- Releasing a drag with velocity continues the rotation and decelerates smoothly to zero (time constant tuned by feel, in one named constant).
- Pan and zoom decelerate the same way on release / wheel stop.
- A new press, key press or programmatic fly cancels any coasting immediately.
- Touch and mouse both work; a still release does not coast.
- No change to click-vs-drag thresholds.

## Test plan

Unit tests (pure logic, e.g. a new `src/graph3d/inertia.ts` + test, or extend `pivot.ts`): the rotation-rate function (angle per pixel for given distance and radius: sticks the grabbed point), decay function (velocity monotonically decreases to zero, frame-rate independent: same result at 30 and 120 fps), cancel on new input.

Manual test (fixture: Anchor notes in `vault/tests/graph3d/`, Planets layout):
1. Grab a plate or the surface near the planet's limb and drag slowly: it tracks the cursor.
2. Zoom out and drag: same stickiness, not faster.
3. Flick and release: the planet coasts and stops; click to stop it instantly.
4. Pan and wheel-zoom both coast to a stop; the 2D map's feel is the reference.

## Out of scope

- Changing mouse-look (see [[3D Graph - Mouse-look easing]]) beyond sharing a decay helper.
- Joysticks (mobile) and keyboard walk.
- Any change to what a click does.

## Working conventions

Conventions: follow CLAUDE.md. Branch `feature/...` or `fix/...` cut from the current release branch (stacked on the previous ticket's branch if the batch workflow says so). `npm run lint`, `npm test`, `npm run build` after each change. Do NOT run Playwright E2E tests. Write unit tests for pure logic (vitest cannot import `obsidian`, so keep pure logic out of `src/views/`). Some src files contain NUL bytes: use `grep -a`. Never `git stash`. Fixtures go in `e2e/fixtures/` and are copied to `vault/`; Obsidian must be reloaded (Ctrl+R) after a fixture is written, and every fixture card must be back-dated. Use neutral domains (no biology) in fixtures and tests. After implementing, STOP and give Sawyer manual test steps; do not mark the note Done or open a PR until he confirms.
