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
status: Done
priority:
progress:
date_created: "2026-11-10T12:00:00.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-11T00:19:00.000Z"
date_start_actual: "2026-11-11T00:19:00.000Z"
date_end_scheduled: "2026-11-17T00:43:08.000Z"
date_end_actual: "2026-11-17T00:43:08.000Z"
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/48
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

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

Code commit `8c27bd1` on `feature/3d-globe-drag-inertia` (stacked on T40). Not pushed, no PR.

### Cause

A drag turned the camera by `ORBIT_RATE` (2π / view height) radians per pixel whatever it orbited. With the pivot at a planet's core, the surface under the cursor moves at `radius × rate` per pixel on screen-ish terms, so it only matched the pointer for one radius at one distance. Momentum existed for touch only (orbit, pinch pan, pinch zoom, in screen pixels); mouse drags, OrbitControls' mouse pan and the wheel all stopped dead.

### What was built

- **Grab (src/graph3d/globe.ts).** A press on a planet's surface plate (`aim()` now reports the plate's distance from the core) records the grabbed world point on that sphere (`grabPoint`: near ray hit). Every move casts the pointer's ray onto the same sphere and `stickyTurn` solves the yaw (about `camera.up`) and pitch (about the camera's right axis) that bring the grabbed point back under it, then `rotateAboutPivot` applies them about the core. It is absolute, not incremental, so it never drifts. Mouse and touch ("Point" one-finger setting) both grab.
- **Spin coast.** Every orbit drag (grabbed or not, mouse or touch, and touch-look) samples the turn it has made (yaw, pitch in radians) as well as the pointer. On release, `launchSpin` coasts the turn at the drag's own angular rate if the pointer was flicked faster than the mind map's fling threshold, decaying at `SPIN_FRICTION`. Same carry rule as the mind map: a flick the same way while a spin is still going adds to it.
- **Pan coast.** OrbitControls' right-button and Ctrl-drag pans are now sampled and coast on release at the orbit target's depth (where OrbitControls pans), as the pinch's pan already did.
- **Wheel zoom glide.** Wheel notches and trackpad deltas join a pending ln(zoom) that the camera takes an eased share of each frame (`easeLook` with `WHEEL_EASE_SECONDS` 0.2 s), aimed at the pointer.
- **Cancelling.** `cancelFlight()` now also stops every coast and the wheel glide, so a press, wheel (it keeps its own pending zoom), WASD/stick move, arrow-key glide, `standOver` and opening the editor all stop it. `tick()` also drops coasts while any flight, glide, ride or hover flight runs, which covers programmatic flights (`flyTo`, edge rides, hover).

### Decisions worth remembering

- **Only a grabbed planet sticks.** Orbiting a node or the empty-space fallback point keeps today's 2π/height rate: the pivot is what you pressed and it already stays put on screen, so "the surface follows the cursor" has nothing to mean there.
- **Yaw + pitch, not a free arcball rotation.** OrbitControls re-aims with `lookAt` and a fixed up, so any rotation with roll would be undone and the point would slip. Yaw about up plus pitch about the right axis is exactly the roll-free set; the pitch is solved first (smaller of its two solutions, so the globe never flips), then the yaw.
- **Past the silhouette the grabbed point is held at the rim** on the cursor's side (the grazing tangent point), continuous with the last hit. The first version used the sphere point nearest the ray, which slides back toward the front and turned the globe backward; don't return to it. Near a pole, where the pitch can't reach the grabbed height or `rotateAboutPivot`'s pole clamp bites, the point trails the cursor a little.
- **Spin coasts in radians, not pixels.** A grabbed planet's turn per pixel varies with where you hold it, so the spin replays the turn the drag was actually making. Whether a release coasts at all is still decided by the pointer's pixel speed (mind map threshold), and the spin stops at the angular speed equivalent to the mind map's 50 px/s stop at the drag's own radians per pixel. `SPIN_MAX_VELOCITY` (0.05 rad/ms) guards the near-pole case, where a small move can need a big yaw.
- **Timing matches the 2D map.** Spin uses the mind map pan's friction (`SPIN_FRICTION = PAN_FRICTION`, 500 ms time constant; tune in `src/graph3d/inertia.ts`); pans and pinch zoom keep `PAN_FRICTION` / `ZOOM_FRICTION`.
- **The wheel glides, it doesn't fling.** A coast that added travel would compound with a trackpad's own OS momentum events (the reason the 2D map has no desktop inertia); an ease plays out exactly the zoom the wheel asked for, starting at once and decelerating. 0.2 s time constant, a balance between a visible glide on a notched wheel and lag on a trackpad.
- **Mouse-look gets no coast.** It already glides out (`easeLookPending`); a spin on top would stack. Touch look keeps its existing coast.
- **A press that stops a coast is not a click**, now for the mouse too (it was touch only). That is "click to stop it instantly" without also hopping to whatever was under the pointer. The wheel glide does not count as a coast here, so clicking a plate right after scrolling still works.
- **Distance-keeping (T38) is safe:** an arrow key's `glideTo` goes through `cancelFlight()`, which drops the pending wheel zoom, so the camera stops where it is and the glide keeps that distance.

### Surface map

| File | Change |
|---|---|
| `src/graph3d/globe.ts` (new) | `grabPoint` (ray-sphere hit, rim fallback), `stickyTurn` (yaw/pitch that keep the grabbed point under the pointer) |
| `src/graph3d/globe.test.ts` (new) | Sticks at several radii and distances, off-centre target, drag direction, smaller pitch, rim continuity, pole and degenerate cases |
| `src/graph3d/inertia.ts` (new) | `SPIN_FRICTION`, `SPIN_MAX_VELOCITY`, `launchSpin`, `stepCoast`, `WHEEL_EASE_SECONDS`/`_EPSILON` |
| `src/graph3d/inertia.test.ts` (new) | No coast on still/slow release, carry, cap, monotone decay, same travel at 30 and 120 fps, wheel glide totals and frame-rate independence |
| `src/graph3d/look-ease.ts` | `easeLook` takes an optional epsilon (default unchanged) so the wheel glide reuses it |
| `src/views/Graph3DScene.ts` | `aim()` reports the grabbed globe; `RotateDrag.grab`/`turned`; `rotate` solves the grab; angular `orbitCoast`; mouse pan sampling + coast; wheel glide (`easeWheel`); `stopCoasting`/`coasting`, called from `cancelFlight` and the tick's flight guard; `rayThrough` updates the camera matrix first |

### Fixture

No new fixture: `vault/tests/graph3d/Anchor Balance.md` / `Anchor Radial.md` (and the other sailing notes) in the Planets layout.

### Not verified

Nothing was run in Obsidian. Unverified: how sticky the grab feels in practice (the unit tests prove the maths against a no-roll `lookAt` camera, not OrbitControls' own clamps), whether 0.2 s on the wheel feels like a glide or like lag on Sawyer's trackpad, and whether OrbitControls' pan per pixel matches the coast's exactly (both use the target distance and canvas height; `panSpeed` is the default 1).
