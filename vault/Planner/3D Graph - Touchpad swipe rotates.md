---
title: 3D Graph - Touchpad swipe rotates
summary: "In 3D, a touchpad two-finger swipe rotates like a click-drag, Shift+swipe pans, Ctrl+swipe zooms at a sane speed, and pinch still zooms. A mouse wheel keeps zooming (auto-detected, no setting)."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Graph pointer gestures - orbit, pan, link, menu]]"
  - "[[3D Graph - Planets surface grab anywhere on the sphere]]"
  - "[[3D Graph - Navigation gizmos]]"
status: To-Do
priority:
progress:
date_created: "2026-11-12T05:53:58.000Z"
date_modified: "2026-11-12T05:53:58.000Z"
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

Touchpad navigation in the 3D graph view:

| Touchpad input | 3D view |
|---|---|
| Two-finger swipe (any direction, incl. diagonal) | **Rotate**, exactly like a left-drag starting under the cursor |
| Shift + two-finger swipe | **Pan** |
| Ctrl + two-finger swipe up / down | **Zoom** (up = in), at the mouse wheel's rate |
| Pinch | Zoom (unchanged) |
| Mouse wheel | Zoom (unchanged) |

## What problem does this solve?

On a touchpad, a two-finger swipe zooms today, so there's no way to rotate without click-dragging. Ctrl + swipe zooms "way too fast".

## What's your current workaround?

Click-drag on the touchpad.

## Decisions (settled with Sawyer, 2026-11-12; not to be re-decided)

- **Swipe = same as a click-drag from under the cursor**: content follows the fingers; pivot setting (`graph3dDesktopPivot`) applies; in Planets the surface grab applies (T57, `aim(..., grab)`); coasts after release like a drag.
- **Auto-detect only, no setting.** Mouse wheel must keep zooming. Sawyer declined a setting fallback, so the heuristic has to be conservative: when unsure, treat as a mouse wheel (zoom), the current behaviour.
- **Shift + swipe pans.** (Three-finger pan was Sawyer's first wish, but three-finger touchpad gestures never reach Obsidian on Windows/Linux, and on macOS they arrive as a left-drag. Shift was chosen instead.)
- **Ctrl + swipe zooms at the wheel's rate.** Pinch keeps its current speed.
- **3D only.** The 2D mind map is unchanged.
- Wheel while mouse-look flying still sets the flight speed (unchanged).

## Code facts (orchestrator, 2026-11-12 — spot-check line numbers)

- `onWheel` in `src/views/Graph3DScene.ts` (~`:2289`), capture-phase listener on the container (`:575`) that stops OrbitControls' wheel. It currently always zooms: `wheelLogZoom(e)` into `this.wheelZoom`, eased by `easeWheel`.
- `wheelNotches` / `wheelLogZoom` in `src/graph3d/depth.ts:68-81`. `if (e.ctrlKey) delta *= 10` is there because **Chromium sends a touchpad pinch as a wheel event with `ctrlKey: true`**. A real Ctrl + swipe also arrives with `ctrlKey: true`, so it gets the ×10 too. That's the "way too fast" bug.
- **Telling pinch from Ctrl + swipe:** both are ctrl-wheel events. Track whether the Control key is physically held (`keydown` / `keyup` for `Control`, and clear it on `blur`). If Ctrl is held, it's a swipe: no ×10. If not, it's a synthetic pinch: keep ×10.
- **Telling a touchpad swipe from a mouse wheel:** the usual signals are:
  - `deltaX !== 0` (a mouse wheel is vertical-only, apart from tilt wheels);
  - `deltaMode === 0` with small or fractional deltas, rather than the uniform ±100 / ±120 (or the platform's notch size) of a mouse wheel;
  - a high event rate.
  Classify per gesture rather than per event: once a burst looks like a touchpad, keep it that way until the events stop for ~150–300 ms, so a swipe doesn't flicker between rotate and zoom. Put the classifier in a pure module (`src/graph3d/`) and unit-test it with recorded-style sequences (touchpad bursts, mouse notches, smooth-scroll mouse). When unsure, zoom.
- **Rotation path:** the drag code is `onPointerDown` → `aim()` → `RotateDrag` → `rotate()` (~`:1884`, `:2495`, `:2317`), with inertia from `turnSamples` / `orbitCoast`. Reuse it: start a synthetic rotate at the cursor on the first swipe event of a gesture, feed the deltas as pointer movement, and end it when the gesture times out. On macOS the OS already sends momentum wheel events; decide whether to add our own coast or let the OS momentum drive it (avoid double coasting), and record why.
- **Pan:** the mouse pan is OrbitControls' right / Ctrl drag, sampled for coast (`:2099-2105`). Shift + swipe needs its own pan by delta. Look for an existing pan helper (pinch pan / `panCoast`) first.
- New camera input must call `cancelFlight()` and respect `stopCoasting()` (see the 3D memory file).
- **Reconcile with the settled gesture map** in [[Graph pointer gestures - orbit, pan, link, menu]]. Shift + *left-drag* is reserved for box select, which is a different input from Shift + *wheel*, so there's no conflict. Add the touchpad rows to the Controls docs (`docs/` 3D page and the in-view help list).

## Context budget

`Graph3DScene.ts` is ~37k tokens, so read it by range. Don't open `MindMapView.ts`.

## Acceptance criteria

- On a touchpad in 3D, a two-finger swipe in any direction rotates the way a drag would, including the surface grab in Planets.
- Shift + swipe pans.
- Ctrl + swipe up zooms in and down zooms out, about as fast as a mouse wheel.
- Pinch zooms as before.
- A mouse wheel (notched) zooms as before.
- 2D is unchanged.

## Test plan

**Unit:** the classifier (touchpad vs wheel, sticky per gesture), and Ctrl-held vs pinch scaling.

**Manual** (Ctrl+R after build), laptop touchpad, `vault/tests/graph3d/Sailing Basics.md` in 3D, then `Anchor Radial.md` in Planets:
1. Swipe up, down, left, right and diagonally: the view rotates and the content follows your fingers. Lift your fingers: it coasts or settles smoothly with no jump.
2. Shift + swipe: the view pans.
3. Ctrl + swipe up / down: zooms in / out at a controllable speed.
4. Pinch: zooms as before.
5. A USB mouse wheel: zooms as before, never rotates.
6. In Planets, swipe over a planet: the surface turns under the cursor.
