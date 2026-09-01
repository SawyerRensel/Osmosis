---
title: Add inertia for pan and zoom gesture in Mind Map view on mobile
summary: Right now pinch to zoom and tap-drag to pan feels like there's a lot of friction.  We need acceleration and deceleration to make it feel fluid.
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
status: Done
priority:
progress_current:
progress_total:
date_created: 2026-08-15T11:59:06.484Z
date_modified: 2026-09-01T01:57:28.000Z
date_start_scheduled: 2026-08-19T00:00:00.000Z
date_start_actual: 2026-08-19T00:00:00.000Z
date_end_scheduled: 2026-09-01T01:57:28.000Z
date_end_actual: 2026-09-01T01:57:28.000Z
pull_request: https://github.com/SawyerRensel/Osmosis/pull/35
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
---

# Optimization

## What tool or process needs improvement?

Touch pan and pinch-zoom in the Mind Map view (`src/views/MindMapView.ts`), on
mobile.

State of the tree before this task:

- One-finger pan is 1:1 per `pointermove` — `handlePointerMove` subtracts the
  SVG-space delta from `viewBox.x/y` and calls `updateViewBox()`.
- Pinch is 1:1 on finger distance — `initPinch` records the start distance and
  zoom, `updatePinch` rescales the viewBox around the moving pinch centre.
- `updateViewBox()` writes a CSS transform on iOS (`viewportHost`) or the
  `viewBox` attribute elsewhere, repositions the edit overlay, and calls
  `scheduleCullUpdate()` — which is already rAF-coalesced, so a per-frame
  animation loop costs no extra culling passes.
- There is **no velocity tracking anywhere**. Every gesture stops the instant the
  finger lifts.
- Pan is unbounded: you can fling the map into empty space and lose it.

## What's slow or frustrating about it?

Two distinct complaints, confirmed with the user:

1. **Gestures stop dead on lift.** No coast, so crossing a large map takes a
   sequence of drags instead of one flick.
2. **Zoom feels stiff / too slow.** Finger travel is capped by screen width, so a
   1:1 pinch can only cover a small slice of the 0.1–5× range per gesture.

## What would "better" look like?

### Settled design

| Decision | Choice |
|---|---|
| Gestures with momentum | **Pan and zoom both.** |
| Zoom stiffness fix | **Momentum only, pinch stays 1:1.** No gain curve — fingers keep sticking to the map points they grabbed; the flick-pinch coast supplies the range. |
| Platform | **Touch only** (`pointerType === "touch"`). Trackpads already emit OS-level momentum wheel events; adding ours would compound. |
| Pan bounds | **Rubber-band, content edge to viewport edge.** ⚠️ *Revised on device — see "The bounds were too strict" below. Shipped rule is the 48px sliver.* |
| Bounds when the map fits on screen | **Free within the screen** — no spring-back until an edge actually leaves the viewport, so the map can be parked to one side. ⚠️ *Subsumed by the sliver rule, which is looser still.* |
| Overshoot resistance | **During the drag as well as the fling.** Past the bound the map tracks at a fraction of finger speed, then springs back on release. |
| Zoom limits | **Hard clamp at 0.1×/5×, as today.** No scale overshoot. |

Decisions taken without asking, all reversible:

- Physics lives in a new pure module, `src/mindmap-inertia.ts`, with Vitest
  coverage. `MindMapView.ts` cannot be imported by Vitest (it pulls in
  `obsidian`), so anything that needs a test has to sit outside it — the same
  split that `mindmap-viewport.ts` already uses.
- No new setting. Inertia is always on for touch; tuning constants live in the
  module.
- Any new pointer, wheel, or toolbar zoom **cancels an in-flight coast**.
- Mouse and trackpad panning is untouched, bounds included — the clamp rides on
  the same touch-only guard, so desktop keeps today's free pan.

### Geometry

Content occupies `[0, bounds.width + 2·LAYOUT_PADDING] × [0, bounds.height +
2·LAYOUT_PADDING]` in viewBox user units — `getOffsetX/Y` translate the layout so
its top-left lands at `LAYOUT_PADDING`, which is the same frame `fitToView`
computes in.

The **planned** rule for content extent `[0, c]` and viewport width `w` was
`lo = min(0, c - w)`, `hi = max(0, c - w)` — keep the viewport inside the
content, flipping to keep the content inside the viewport once the map is
smaller than the screen. **That is not what shipped**; see below. The **shipped**
rule keeps a sliver of content on screen instead:

```
lo = keep - w
hi = c - keep
```

where `keep = KEEP_VISIBLE_PX / zoom`. Both bounds sit strictly outside the
planned ones, in every direction and at every zoom.

### Test plan

- Unit (`src/mindmap-inertia.test.ts`): velocity from a sample window, friction
  decay reaching rest, the clamp range in both the larger-than and
  smaller-than-viewport cases, rubber-band resistance monotonic and bounded,
  spring settling at the bound.
- Manual (mobile, iOS and Android if available): flick-pan coasts and decays;
  flick-pinch keeps zooming after lift and clamps at 5×; dragging past the map
  edge resists and springs back; tapping mid-coast stops it; desktop mouse pan
  unchanged and still unbounded; edit overlay stays glued to its node
  throughout.

## What was implemented

### Where it shipped

[PR #35](https://github.com/SawyerRensel/Osmosis/pull/35), branch
`feature/mindmap-touch-inertia` → `release/0.0.6`. Three commits: the physics and
wiring (`f7fdeeb`), this design note (`df71dcc`), and the on-device tuning pass
(`23bc59c`).

### The cause

There was no velocity tracking anywhere in the view. `handlePointerMove` wrote
the finger's delta straight into the viewBox and `handlePointerUp` dropped it, so
every gesture ended at rest by construction — nothing to "fix", something to add.

Two further faults only surfaced once the coast existed, and both came from the
same wrong assumption: **that a pinch ends when a finger lifts.**

- `handlePointerUp` cleared `pinchStartDistance` on the *first* lift and handed
  the gesture straight to the one-finger pan. But fingers never leave the glass
  together — a "simultaneous" lift is two `pointerup` events milliseconds apart.
  So the second lift always arrived with the pinch state already gone, and the
  zoom-coast branch it was supposed to reach was **dead code that never ran
  once**. The first round of device testing reported zoom "feels the same as
  before", which is exactly right: it was.
- That same handoff made the lifting finger's wobble a legitimate one-finger pan,
  which jerked the map sideways at the end of every pinch.

### The fix

Physics in `src/mindmap-inertia.ts` (pure, unit-tested), plumbing in the view.
Pan and pinch both coast on exponential decay, integrated as a continuous rate so
a dropped frame costs the same travel as two on-time ones.

A broken pinch now enters a **tail** rather than becoming a pan. The map holds
still, the zoom velocity is snapshotted while the samples are fresh, and the tail
resolves one of two ways: the remaining finger travels past `DRAG_THRESHOLD` (it
was a drag — becomes a pan, no coast), or it lifts within `PINCH_TAIL_MS` (it was
a two-finger release — the zoom coasts).

**The bounds were too strict.** The planned rule pinned the content edge to the
viewport edge, and on device that was wrong for a reason the design missed:
panning past the last node is *useful*, because it is how you clear room before
adding a child that would otherwise be laid out off screen. The shipped rule
keeps a 48px sliver of content on screen instead — deliberately loose, and
converted through the current zoom so the bound feels identical at any scale.

The tuning pass then matched the feel to a real scroll view: UIKit's
`decelerationRate.normal`, a 250 px/s floor below which a release is a placement
rather than a throw, and `launchVelocity` carrying leftover momentum into a new
flick so repeated throws build speed instead of each restarting from zero.

### Decisions worth remembering

- **Touch only, and that is not an oversight.** Trackpads already emit OS-level
  momentum wheel events; a coast of our own would compound with theirs into
  runaway scrolling. Mouse and trackpad panning is untouched *including the
  bounds* — desktop keeps its unbounded pan, because the clamp rides on the same
  `pointerType === "touch"` guard. Do not "unify" the two paths.
- **The physics is outside the view because it has to be.** `MindMapView.ts`
  imports `obsidian`, which Vitest cannot resolve, so anything that needs a test
  cannot live there. Same split as `mindmap-viewport.ts`.
- **Pinch stays finger-accurate.** A gain curve was offered and declined: the
  coast supplies the range instead, so fingers keep sticking to the map points
  they grabbed.
- **`launchVelocity`'s three constraints are load-bearing**, not defensive
  padding. The carry decays across the held time (so stop-hold-flick gets no free
  momentum), it only applies when the directions agree (so a flick back turns the
  map around), and a sub-threshold release spends it (which is what makes a tap
  on a moving map stop it dead).
- **A touch landing on a coasting map only stops it** — it does not synthesise a
  tap, so catching a fling keeps the node selection. `stoppedInertiaOnDown`
  carries that fact from `pointerdown` to `pointerup`.
- **`KEEP_VISIBLE_PX` divides by zoom.** It is a screen-space constant; dropping
  the division would make the overscroll balloon when zoomed out.
- **No new setting**, by choice. Tuning lives in module constants.

### Surface map

| File | Change |
|---|---|
| `src/mindmap-inertia.ts` | New. Velocity estimation, `launchVelocity` carry rule, frame-rate-independent decay, bounds (`clampRange`), rubber-band and spring. All pure. |
| `src/mindmap-inertia.test.ts` | New. 31 tests over the above. |
| `src/views/MindMapView.ts` | Sample recording on pan and pinch; the rAF coast loop (`stepInertia` / `stepPanAxis` / `stepZoomInertia`); `panBounds`; rubber-banded touch drag via `panRaw`; the pinch tail; `stopInertia` from every competing viewport writer (`pointerdown`, wheel, `zoomStep`, `fitToView`, `cleanupAllInteractions`, `onClose`). |

### Test fixture

No new fixture — `vault/tests/mindmap/large-map.md` (1051 lines) was already big
enough to fling and to reach the bounds in every direction, and
`vault/tests/mindmap/test-note.md` covered the small-map case.

### What was not done

- **Zoom limits do not rubber-band.** Pinching past 0.1×/5× hard-clamps, as it
  always did. Offered and declined — it would put an overshoot state into every
  zoom path for a case you rarely hit.
- **No E2E coverage.** Per project convention these gestures are manually tested;
  the pure physics carries the unit tests instead.
- `handleContainerResize` does not stop a coast. A virtual keyboard opening
  mid-fling is rare and self-correcting, and the spring lands the map back in
  bounds afterwards regardless.