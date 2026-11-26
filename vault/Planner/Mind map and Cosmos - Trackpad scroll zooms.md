---
title: Mind map and Cosmos - Trackpad scroll zooms
summary: "T123. Two-finger trackpad scroll zooms the Mind map and Cosmos views (like a mouse wheel) instead of panning or orbiting; click-drag pans and orbits."
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
status: Done
batch: 16
priority:
progress:
date_created: 2026-11-24T23:17:08.000Z
date_modified: 2026-11-26T18:47:06.000Z
date_start_scheduled: 2026-11-25T00:00:00.000Z
date_start_actual: 2026-11-25T00:00:00.000Z
date_end_scheduled: 2026-11-26T18:47:06.000Z
date_end_actual: 2026-11-26T18:47:06.000Z
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/54
---

# Mind map and Cosmos - Trackpad scroll zooms (T123)

## What Sawyer asked
> Two-finger swipe should zoom in and out in mindmap view and cosmos view instead of panning and orbiting, respectively

Settled at intake:
- This is about a desktop trackpad's two-finger scroll, which arrives as wheel events.
- It zooms in both views, like a mouse wheel.
- Pan in the mind map and orbit in Cosmos happen only by click-drag.
- Pinch zoom stays as is, and touch-screen gestures are unchanged.

## Current state
- **Mind map:** `MindMapView.handleWheel` L4607–4636. `ctrlKey || metaKey` (pinch or Ctrl) zooms around the cursor (L4611–4626). Any other wheel pans by deltaX/deltaY, with Shift swapping axes (L4627–4633). It has no wheel-vs-trackpad classifier, so a mouse wheel pans as well today. Check what a plain mouse wheel should do and record the result.
- **Cosmos:** `CosmosScene.onWheel` L2455–2476 classifies the source with `WheelClassifier` (`src/cosmos/wheel-input.ts` L59–84). `wheelAction` L107–112 maps a touchpad without Ctrl to rotate or pan (`swipeBy` L2485–2515). Changing that mapping to zoom is the minimal change.

## Design
- **Cosmos:** the touchpad source without Ctrl goes to zoom (`wheelZoom`). Tune the gain so that a two-finger scroll zooms smoothly, not in jumps. Touchpad deltas are small and continuous, so use `wheelNotches` / `wheelLogZoom` (`src/cosmos/depth.ts` L67–80) with a touchpad scale. Remove `swipeBy` / `stepSwipe` / `SWIPE_GAIN` if they become orphans.
- **Mind map:** every plain wheel zooms around the cursor, using the same path as Ctrl+wheel with a gain suited to plain deltas. A mouse wheel zooming in the mind map is the usual canvas convention and agrees with Cosmos.
- Keep the zoom limits and cursor-anchored zoom. Inertia (`src/mindmap-inertia.ts`) must not keep panning after a zoom.
- Put pure mapping logic in `wheel-input.ts` / `mindmap-viewport.ts` with unit tests.

## Context budget (~45k)
- `src/views/MindMapView.ts` (10539 lines). Read **only** constants L135–138, the wheel registration L2010–2020, and `handleWheel` L4600–4640. Do not read further.
- `src/mindmap-viewport.ts` (218) and `src/mindmap-inertia.ts` (265): grep for wheel/zoom and read only those parts.
- `src/views/CosmosScene.ts`: fields L580–590, listener ~L643, `onWheel`/`swipeBy` L2455–2520, ctrlHeld L2600–2615.
- `src/cosmos/wheel-input.ts` (192, whole file), `src/cosmos/depth.ts` L60–81, and the matching tests.

## Acceptance criteria
- On a trackpad, two-finger scroll up and down zooms in and out smoothly in both views, anchored at the cursor.
- Pinch still zooms. Click-drag still pans (mind map) and orbits (Cosmos). Shift+drag pan in Cosmos is unchanged if it exists.
- A mouse wheel zooms in both views.
- Touch screens are unchanged.
- Unit tests pass.

## Test plan
On a laptop trackpad, open a mind map and two-finger scroll up and down: it zooms around the pointer and does not pan. Drag: it pans. Pinch: it zooms. In Cosmos do the same: scrolling zooms, dragging orbits. Repeat with a mouse wheel. On the phone, check that two-finger gestures behave as before.

## What was implemented

Shipped in [PR #54](https://github.com/SawyerRensel/Osmosis/pull/54) → `release/0.0.6` (batch 16, commit `21f8dbb`).

### The cause

Both views treated a plain wheel event as navigation. A desktop trackpad's two-finger scroll arrives as wheel events, so it panned the mind map and orbited Cosmos (through a swipe-inertia feed), where Sawyer wanted zoom. Settled at intake: it zooms in both views like a mouse wheel; pan and orbit happen only by click-drag; pinch and touch-screen gestures stay as they are.

### The fix

Every plain wheel event now zooms in both views; nothing pans or orbits from the wheel.

- **Mind map:** `handleWheel` is one cursor-anchored zoom path. The step comes from a new pure `wheelLogZoom(e, pinch)` in `src/mindmap-viewport.ts`, and zoom is now `zoom * exp(logZoom)`, not the old linear `zoom * (1 - delta)`.
- **Cosmos:** `wheelAction` became `wheelZoomStep`, which returns only a log zoom. A touchpad swipe feeds the existing `wheelZoom` glide (`easeWheel`), so it is cursor-anchored and eased like a wheel. `WheelClassifier` stays because it now picks the gain.

### Decisions worth remembering

- **Mind map gains:** pinch or Ctrl/Cmd+wheel keeps 0.002 per px, as before; plain wheel is 0.0006 per px (about 6% per 100 px mouse notch, about 2x for a full ~1000 px two-finger swipe). Plain deltas are far larger than a pinch's, so the pinch gain would jump. One plain event is capped at 300 px; line and page deltas are read as 16 and 100 px.
- **Mind map mouse wheel used to pan** (no classifier); it now zooms, per the ticket. Shift+wheel horizontal panning is gone too, and only `deltaY` is read, so a purely horizontal swipe does nothing (`preventDefault` still stops the page scrolling).
- **Exponential zoom maths** so large deltas can never flip the factor negative; for pinch-sized deltas the result matches the old linear form within 1%.
- **Cosmos touchpad gain** `TOUCHPAD_ZOOM_GAIN = 0.6` of the wheel rate (5% per 100 px): a swipe streams many small events and Linux Chromium inflates them about 3.5x. A mouse wheel and a pinch keep their old rates; real Ctrl+swipe uses the touchpad rate with no x10, as before.
- **Orphans removed.** Cosmos: `SwipeFeed`, `SwipePush`, `SWIPE_GAIN`, `SWIPE_LIFT_MS`, `SWIPE_LIFT_FRAMES`, `swipeBy`, `stepSwipe`, the `swipe` and `swipeFeed` fields, and their tests. Kept: the `Swipe` interface, `launchSwipe` and `gizmoDrag`, which the on-screen rotate and pan gizmos still use; Shift+drag pan and click-drag orbit are untouched. Mind map: `ZOOM_SENSITIVITY` and `SCROLL_SENSITIVITY`.
- Not changed: touch-screen pinch in the mind map and the Cosmos touch pinch.

### Surface map

| File | Change |
|---|---|
| `src/mindmap-viewport.ts` | `wheelLogZoom`, the gain constants and the cap |
| `src/mindmap-viewport.test.ts` | Tests for `wheelLogZoom`, the gains and the cap |
| `src/views/MindMapView.ts` | `handleWheel` is zoom only; unused constants removed |
| `src/cosmos/wheel-input.ts` | `wheelZoomStep` and `TOUCHPAD_ZOOM_GAIN` replace `wheelAction` and the swipe feed |
| `src/cosmos/wheel-input.test.ts` | Tests rewritten |
| `src/views/CosmosScene.ts` | `onWheel` always zooms; swipe code removed |
| `docs/mind-mapping/navigation.md`, `docs/mind-mapping/cosmos.md` | The input tables (the Touchpad table and its footnote) |

### Test fixture

None. Any mind map and the Cosmos view will do.

### Follow-ups

- **The gains were tuned by feel, from estimates, not measured on hardware.** `WHEEL_ZOOM_GAIN` (mind map) is the first knob, then `TOUCHPAD_ZOOM_GAIN` (Cosmos). Sawyer's manual test passed, but speed on other trackpads and mice may differ.
- There is no longer any way to pan the mind map or orbit Cosmos from a trackpad or wheel alone, including horizontal scrolling; it is click-drag only, by design.
