---
title: 3D Graph - Mobile walk and fly joysticks
summary: "A toggle that brings up two on-screen thumb joysticks on mobile, one to look around and one to move (the WASD equivalent), so you can walk and fly through the 3D graph on a phone."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[3D Graph Phase 2 - View shell]]"
status: In-Review
priority:
progress:
date_created: "2026-10-31T16:00:00.000Z"
date_modified: "2026-10-31T16:00:00.000Z"
date_start_scheduled: "2026-10-31T16:00:04.000Z"
date_start_actual: "2026-10-31T16:00:04.000Z"
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

# Feature Request

Requested by Sawyer in the Batch 1 manual test, 2026-10-31, after testing on a phone: "super fast, super smooth… The only thing I wish I had on mobile is some kind of way I could walk and fly."

## What do you need built?

- A toggle button (e.g. lower right of the viewport) that shows or hides two on-screen joysticks, like an Xbox controller's thumbsticks, one per thumb.
- **Left stick: look**, orienting the camera the way the mouse does in desktop look mode.
- **Right stick: move**, the equivalent of W/A/S/D: forward/back, strafe left/right. (Q/E up/down is optional; Sawyer said "I guess in this case, it would just be WASD.")
- Speed should respect the existing flight speed (`flightScale`), and stick deflection should scale speed (analog).
- Keep the existing pinch / drag / pan gestures exactly as they are; Sawyer loves how they feel. The sticks are an addition, only active while toggled on. Touches that start on a stick must not reach the orbit/pan handlers.

## Open question for Sawyer

Sawyer specified left = look, right = move. Most console games use the opposite (left = move, right = look). Build it as specified, with the mapping in one place so it's trivial to swap.

## What problem does this solve?

Walk/fly navigation exists only on desktop (keys + mouse look). On mobile you can only orbit/zoom/pan.

## Batch implementation notes (awaiting manual test)

Built on `feature/3d-graph-joysticks` (stacked on `feature/3d-graph-phase-5`), commit f9b7c1b. Not pushed, no PR.

### Approach

- A gamepad toggle in the viewport's **bottom-right corner** shows or hides two thumb sticks. **Left = look, right = move**, as specified. The mapping is `STICK_ROLES` in `src/graph3d/joysticks.ts`, the only place to change to swap them.
- **No parallel flight code.** The move stick feeds the same `fly()` the W/A/S/D keys drive, so it uses the same speed (camera→target distance × `FLIGHT_SPEED` × `flightScale`). The look stick turns the camera in place with `rotateAboutPivot` about the camera, which is what mouse-look does. Both call `cancelFlight()` when they move, as the keys already did.
- **Analog.** `stickDeflection` applies a radial deadzone (12% of the radius), rescales the rest of the travel to 0–1 so motion starts from zero instead of jumping, then squares it: a small push is slow and fine, and the rim is full rate. Look is 2 rad/s (about 115°/s) at full deflection. `flightAxes` combines keys and stick: held keys are normalised to full speed as before, the stick's push is added, and the total is capped at full speed. With no stick input, `fly()` behaves exactly as before. The old `.normalize()` became `flightAxes`; the side, lift and look vectors are orthonormal, so lengths carry through.
- **Isolation.** Each stick is its own DOM element over the canvas. The scene's `pointerdown` listener is on the canvas only, so a touch that starts on a stick never becomes a press, drag, pinch or momentum sample. The window-level move and up listeners key everything by `pointerId`, and the stick's pointer is never registered in `touches`, `drag`, `press` or `pinch`, so they ignore it. Each stick captures its own pointer (`setPointerCapture`), so one thumb on each stick works at once, and a third finger on the canvas still orbits, or two fingers pinch, as usual. With the sticks off they are `display: none` and every deflection is zero, so the existing gestures run unchanged.

### Decisions worth remembering

- **The toggle state persists per device**, in Obsidian's vault-scoped localStorage (`app.saveLocalStorage("osmosis-graph3d-sticks")`), not in `data.json`. If you walk with the sticks on a phone, they should still be on next time. Synced settings would also turn them on for a laptop that has keys.
- **The toggle shows only on touch-capable devices** (`Platform.isMobile || navigator.maxTouchPoints > 0`). That includes touchscreen desktops, where the sticks work too (a mouse can drag them as well). There is no setting to force the button on a non-touch desktop: keys and mouse already do this there, and the brief asked for no extra configurability.
- **Layout.** The flight-speed readout and the toggle now share a bottom-right flex corner (`.osmosis-graph3d-corner`), with the readout left of the toggle, so they can't overlap. On a non-touch desktop the toggle is hidden and the readout sits exactly where it was. The sticks are raised 48 px above the bottom edge, which clears the perf gauge (bottom-left) and the toggle. The Overlays button is in the top-left header, nowhere near them.
- **Fixed sticks, not floating ones.** A touch must start on the 120 px base. Floating sticks (spawn where the thumb lands) would claim parts of the canvas that orbit and pan use now.
- **Q/E (up/down) has no stick.** The ticket marked it optional. The physical keys still work alongside the sticks.
- **`graph3dOneFingerDrag` is untouched.** Its `look` option still governs a one-finger drag on the canvas; the look stick is independent of it.
- The sticks don't stop touch momentum that is already coasting. Neither do the flight keys. A coast and a stick simply add up.

### Surface map

| File | Change |
|---|---|
| `src/graph3d/joysticks.ts` | New pure module: `STICK_ROLES`, deadzone and curve (`stickDeflection`), `stickLook`, `stickMove`, `flightAxes` |
| `src/graph3d/joysticks.test.ts` | 14 unit tests |
| `src/views/Graph3DSticks.ts` | New: the toggle, the two stick elements, per-stick pointer capture, knob display |
| `src/views/Graph3DScene.ts` | Bottom-right corner holds the speed readout and the toggle; `fly()` takes the move stick through `flightAxes`; new `lookAround()` in `tick()`; `SceneOptions.sticks` / `onSticksToggle` |
| `src/views/Graph3DView.ts` | Reads and saves the toggle state in localStorage |
| `styles.css` | `.osmosis-graph3d-corner`, stick and knob styles; the speed readout's absolute position moved to the corner |

### Fixture

Reuses the existing `vault/tests/graph3d/` sailing notes (e.g. open the 3D graph on `Sailing Basics.md`).

### Manual test

1. **Phone:** open the 3D graph on `vault/tests/graph3d/Sailing Basics.md`. A gamepad button sits bottom-right. Tap it: two circles appear, above the perf gauge and the button. Push the right stick up to fly forward. A light push is slow, a full push is fast, and sideways strafes. The left stick turns the view: right turns right, up looks up. Hold both at once to fly in a curve.
2. With a thumb on a stick, the view must not orbit or pan, and nothing should coast after you let go. With a thumb on one stick, a finger dragged on the canvas still orbits.
3. Tap the toggle off: one-finger orbit, pinch, two-finger pan and flick momentum feel exactly as before. Close and reopen the view: the toggle state is remembered on that device only.
4. **Desktop without a touchscreen:** no gamepad button. W/A/S/D, mouse-look and wheel flight speed behave as before, and the speed readout still appears bottom-right.

### Not verified

Everything on screen: I can't run Obsidian. Specifically not verified:

- that the `gamepad-2` icon exists in Obsidian's bundled Lucide;
- that `touch-action: none` plus `preventDefault` stops Obsidian mobile's sidebar swipe on a stick near the screen edge;
- the feel of the deadzone, curve and look rate (constants in `joysticks.ts`);
- that the open perf readout (it grows upward from bottom-left) may cover the left stick. It's a diagnostic, so I left it.
