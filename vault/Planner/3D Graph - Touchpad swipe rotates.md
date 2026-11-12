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
status: In-Review
priority:
progress:
date_created: "2026-11-12T05:53:58.000Z"
date_modified: "2026-11-12T10:26:00.000Z"
date_start_scheduled: "2026-11-12T05:55:00.000Z"
date_start_actual: "2026-11-12T05:55:00.000Z"
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

## Batch implementation notes (awaiting manual test)

Code commit `1fa0872` on `feature/3d-touchpad-gestures`. Not pushed, no PR.

### Approach

- **Classifier (`src/graph3d/wheel-input.ts`, `WheelClassifier`).** Classifies per gesture: events less than `GESTURE_GAP_MS` (200 ms) apart belong to one gesture. A gesture counts as a **touchpad** once (a) it has moved on both axes, in one event or across events (Windows sends a diagonal as alternating vertical and horizontal messages), or (b) its deltas share no wheel-sized common step. For (b), `commonStep` is an approximate GCD with 5% slack, and below `MIN_WHEEL_STEP_PX` (2 px) the gesture is a touchpad. A mouse wheel's deltas are whole multiples of one step: a 100 or 120 px notch, about 53 px on some Linux builds, any of those over the display scale, a hi-res wheel's fraction of a notch, or macOS's 4.000244 px. Touchpad deltas are continuous, so their GCD collapses within one or two events. Line or page deltas (`deltaMode` ≠ 0) make the gesture a wheel. Once decided, the gesture keeps its answer until a 200 ms pause. **Until decided, every event zooms**, as before. A swipe's first event or two therefore zoom by a hair (a few px, under 1%) before it starts turning.
- **Actions (`wheelAction`).** Mouse wheel → zoom, unchanged. Pinch (ctrl-wheel while Control is physically up) → zoom with the ×10, unchanged. Ctrl + scroll with Control down → zoom with no ×10, for a touchpad or a mouse. Touchpad swipe → rotate. Shift + swipe → pan. Ctrl wins over Shift.
- **Ctrl tracking.** The scene listens on `window` for `keydown` and `keyup` (capture), and clears the flag on `blur`. `ctrlHeld` is true for a Control keydown and false for its keyup; any other key's event carries `ctrlKey` and sets it from that.
- **Rotation reuses the drag.** On the first touchpad event of a gesture, `swipeBy` calls `aim(x, y, false, grab = true)` at the cursor and builds a synthetic `RotateDrag` (`pointerId` -1) exactly as `onPointerDown` does, so the desktop pivot setting and the Planets surface grab (T57) apply. Each event moves that drag's virtual pointer by the deltas and calls `rotate()`, which samples for the spin. It is held in `this.swipe`, not `this.drag`, so pointer code never sees it. A real pointer press ends it.
- **Pan.** `pan(dx, dy, depth)` runs at the view depth of the point aimed at under the cursor, as a pinch's pan does, so what is under the cursor follows the fingers.
- **Release and coast (`endSwipe`, from `tick`).** Once the swipe's events stop for `SWIPE_LIFT_MS` (50 ms), it ends like a released drag. Velocity is estimated at its last event: `launchSpin` for rotate, `launchVelocity` into `panCoast` for pan.

### Decisions worth remembering

- **Content follows the fingers = the opposite of the scroll delta** (`dx = -deltaX`, `dy = -deltaY`), the way the OS scrolls a page. Under natural scrolling (the touchpad default on macOS, GNOME and Windows precision touchpads), that is the fingers' real direction. **Ctrl + swipe uses the same convention**: zoom in as the fingers go up (scroll deltaY > 0). That is the *opposite* sign from a mouse wheel's, and it is what the ticket's "Ctrl + swipe up zooms in" means under natural scrolling. With traditional (non-natural) scrolling, both rotate and Ctrl-zoom run reversed, matching how that user's pages scroll.
- **Momentum: our own coast, but only when the swipe ends fast.** Where the OS or Chromium sends momentum wheel events (macOS, Windows precision touchpads), they arrive without a 50 ms gap, so they keep the swipe going. The OS curve drives the coast, and the swipe ends at a crawl, too slow for `launchSpin` to fire, so nothing coasts twice. Where none arrive (likely Linux/X11 Chromium), the swipe ends at finger speed and our spin coasts like a drag's. Cost: up to 50 ms of stillness between lift and coast.
- **Any wheel event during a pointer drag, pinch or mouse pan zooms**, as before, and isn't classified.
- **Flight-speed wheel while mouse-look flying is unchanged** (still `wheelNotches` with its ctrl ×10).
- **Ctrl + mouse wheel lost its ×10.** It is the same bug as Ctrl + swipe, since a real Ctrl + scroll is not a pinch. A plain mouse wheel is unchanged.
- **No conflict with the gesture map:** Shift + *left-drag* stays box select. Shift + *swipe* is a wheel event. `pointer-gesture.ts` is untouched. I did not edit the "Graph pointer gestures" note itself.

### Surface map

| File | Change |
|---|---|
| `src/graph3d/wheel-input.ts` (new) | `WheelClassifier` (per-gesture touchpad vs wheel), `commonStep`, `wheelAction` (zoom / rotate / pan; pinch vs held Ctrl) |
| `src/graph3d/wheel-input.test.ts` (new) | Notched, scaled-and-rounded, macOS accelerated, hi-res and Shift-sideways wheels stay wheels; line deltas; diagonal, split-axis and axis-locked swipes; stickiness, gap reset; pinch ×10 vs held Ctrl, Ctrl-swipe direction, Shift pan |
| `src/views/Graph3DScene.ts` | `onWheel` routes through the classifier; `swipeBy`, `endSwipe` (from `tick`), `Swipe` state, `ctrlHeld` via window key listeners and blur (removed in `destroy`); a press clears the swipe; a followed node's move shifts the swipe's pivot |
| `src/graph3d/controls-help.ts`, `.test.ts` | New "Touchpad" group in the in-view help |
| `docs/mind-mapping/graph-3d.md` | Touchpad table under Controls |

### Fixture

No new fixture: `vault/tests/graph3d/Sailing Basics.md`, and `Anchor Radial.md` in Planets.

### Not verified

Nothing was run in Obsidian, and I had no real wheel event recordings. The thresholds rest on known platform behaviour, not measurement:
- **Ambiguous mice.** A mouse running smooth-scrolling software that eases its deltas (for example Logitech SmoothScroll), or a hi-res wheel with steps under 2 px, looks like a touchpad and would rotate. No signal tells those apart from an axis-locked vertical touchpad swipe.
- **Shift may swap the axes.** If Chromium turns Shift + scroll into horizontal on this platform for touchpads (it does for mouse wheels), a vertical Shift + swipe would pan sideways. The fix would be to swap back in `wheelAction` when `shiftKey` is set.
- **Untuned constants.** The rotation speed per swipe px is the drag's (`ORBIT_RATE`), and the platform's scroll distance per finger travel varies. `SWIPE_LIFT_MS` (50 ms) and the 200 ms gesture gap need a feel check.
- **Long swipes and the grab.** A long swipe over a planet moves the virtual pointer off the planet's disc, where the grab holds at the rim (T41 behaviour), as a long mouse drag would.

## Follow-up after Sawyer's test, 2026-11-12

Code commit `5f3aa09` on `fix/round-8-feedback`. Still In-Review.

### What was reported

1. Two-finger swipe rotation is "way too sensitive", "jittery", and when it stops it feels like "slamming into invisible arbitrary barriers". It should feel like dragging a planet's surface. Sawyer confirmed that a click-drag on the mouse or touchpad feels right in the same layouts, so a swipe should map exactly like a drag, with a smooth coast when the fingers lift.
2. Ctrl + two-finger swipe zooms the wrong way.

### The cause

The swipe already called the drag's own `rotate()` (same `ORBIT_RATE`, pivot and Planets grab). The problem was what went into it and when.

- **Too sensitive: scroll px are not pointer px.** Raw `deltaX/deltaY` were treated as pointer movement. On Linux, Chromium turns libinput's 15 px of finger motion per scroll "click" into a 53 px wheel tick, so the same finger travel moves a swipe about 3.5 times further than a drag. In Planets that also ran the virtual pointer off the planet's disc quickly, where the grab holds at the rim. That was one "barrier".
- **Slamming: the gesture ended and restarted mid-swipe.** `endSwipe` ended the swipe after any 50 ms gap between events. A slowing finger on libinput easily leaves such gaps. Each false end launched a spin coast, and the inflated scroll px easily cleared the fling threshold. The next event stopped that coast dead, then restarted the swipe: it re-aimed at the cursor (a new pivot, a new grab), and it carried the stopped spin into the next release. That gave a surge, a hard stop and a jump in the pivot, over and over. The stacked carry made release coasts too strong as well.
- **Jitter: per-event application.** Each wheel event turned the camera as it arrived. Their sizes and spacing are uneven and don't line up with frames (unlike a drag's pointer moves, which Chromium delivers once a frame), and the 3.5x gain made that worse.
- **Ctrl + swipe** deliberately used the opposite sign from the wheel ("in as the fingers go up" under natural scrolling). Sawyer wants the opposite.

### The fix

- **`SWIPE_GAIN` = 0.3** (`wheel-input.ts`, in `wheelAction`) scales swipe deltas to pointer px before they reach the drag (about 1/3.5, the Linux ratio).
- **`SwipeFeed`** (pure, `wheel-input.ts`) models the swipe as a synthetic pointer drag:
  - Events only collect movement. `stepSwipe` (from `tick`, replacing `endSwipe`) hands it to the drag **once a frame**, as pointer moves arrive.
  - A swipe counts as **released** once no event has come for `SWIPE_LIFT_MS` (30 ms) **and** `SWIPE_LIFT_FRAMES` (2) frames. The frame count stops a slow, busy frame that delivers its events late from reading as a lift. On release it coasts through the drag's own `launchSwipe` / `launchSpin`, measured at the last event.
  - **Events that return within `GESTURE_GAP_MS` (200 ms) resume the same swipe**: same pivot and drag, with the Planets grab re-taken under the virtual pointer and any coast stopped. Only after 200 ms of quiet does a new swipe start, re-aimed at the cursor. So a pause never re-anchors the gesture.
- **Ctrl + swipe** now zooms with the wheel's sign (`deltaY`, not `-deltaY`): scrolling down zooms out, as a mouse wheel does. **Ctrl + mouse wheel is unchanged.** It is classified as `"wheel"` and has always zoomed like the plain wheel. Only the touchpad branch flipped, so the two never needed telling apart.

### Decisions worth remembering

- **One gain, tuned for Linux.** Nothing reports the scroll-to-finger ratio, and it varies by platform. On Linux X11 it is about 3.5. Wayland Chromium may scale differently. macOS and Windows deltas are closer to finger travel, so a swipe there may feel slower than a drag. If it still feels off, `SWIPE_GAIN` is the one knob.
- **OS momentum is not filtered out.** Momentum wheel events (macOS, and Chromium's own touchpad fling where it has one) can't be told from finger events in JS. They keep the swipe alive and act as its coast. When they stop while still fast, our release coast takes over, so the coast still ends softly rather than with a hard stop.
- **A resume after a false release stops that coast.** That only happens if the fingers pause while moving at fling speed, which is rare. Slow fingers, the usual cause of event gaps, are below the fling threshold and never coast.
- **No easing of the per-frame movement.** It is applied whole each frame, as a pointer drag's is, so the content stays 1:1 with no added lag.
- **Up to about 2 frames of stillness** between the last event and the coast (the lift detection). That is far less than the old 50 ms.
- T60's gizmos are untouched. They use `Swipe` and `launchSwipe` but never `SwipeFeed` or `stepSwipe`.

### Files changed

| File | Change |
|---|---|
| `src/graph3d/wheel-input.ts` | `SWIPE_GAIN` on swipe deltas; Ctrl + swipe zoom sign flipped; new `SwipeFeed` (per-frame movement, lift detection, resume vs new gesture), `SWIPE_LIFT_MS`, `SWIPE_LIFT_FRAMES` |
| `src/graph3d/wheel-input.test.ts` | Gain and Ctrl direction tests updated (Ctrl + swipe matches the wheel); `SwipeFeed` tests: per-frame coalescing, lift by time and frames, slow frames don't lift, resume vs new start, over, cancel |
| `src/views/Graph3DScene.ts` | `swipeBy` feeds `SwipeFeed` and starts or resumes (re-grab, same pivot); `stepSwipe` in `tick` replaces `endSwipe`; scene `SWIPE_LIFT_MS` removed |
| `src/graph3d/controls-help.ts`, `docs/mind-mapping/graph-3d.md` | Ctrl + swipe row: "zoom like the wheel: scrolling down zooms out" |

### Not verified

Nothing was run in Obsidian, and there are no recordings of real wheel events. The 3.5 ratio comes from known Linux and Chromium behaviour, not measurement. To measure it, open devtools (Ctrl+Shift+I) and run `addEventListener('wheel', e => console.log(e.deltaX, e.deltaY), true)`, swipe a known distance, and compare that with how far a drag of the same finger travel moves the cursor.
