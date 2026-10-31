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
status: To-Do
priority:
progress:
date_created: "2026-10-31T16:00:00.000Z"
date_modified: "2026-10-31T16:00:00.000Z"
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
