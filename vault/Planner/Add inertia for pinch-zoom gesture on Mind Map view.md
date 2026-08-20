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
status: In-Progress
priority:
progress_current:
progress_total:
date_created: 2026-08-15T11:59:06.484Z
date_modified: 2026-08-20T01:49:41.659Z
date_start_scheduled: 2026-08-19T00:00:00.000Z
date_start_actual: 2026-08-19T00:00:00.000Z
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
| Pan bounds | **Rubber-band, content edge to viewport edge.** |
| Bounds when the map fits on screen | **Free within the screen** — no spring-back until an edge actually leaves the viewport, so the map can be parked to one side. |
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
computes in. So for content extent `[0, c]` and viewport width `w`, the valid
`viewBox.x` range is:

```
lo = min(0, c - w)
hi = max(0, c - w)
```

One formula covers both cases: when the content is wider than the viewport it
reads "keep the viewport inside the content"; when it is narrower it flips to
"keep the content inside the viewport", which is exactly the *free within the
screen* behaviour that was asked for.

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

*Filled at close-out.*