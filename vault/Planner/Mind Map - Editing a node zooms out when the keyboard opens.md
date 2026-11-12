---
title: "Mind Map - Editing a node zooms out when the keyboard opens"
summary: "On a phone, starting to edit a node opens the keyboard, the view shrinks and the map zooms out. Keep the scale and keep the edited node in view."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[Toolbar - Mind map toolbar sizing, buttons and icons]]"
status: To-Do
priority:
progress:
date_created: "2026-11-12T11:52:00.000Z"
date_modified: "2026-11-12T11:52:00.000Z"
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

# Bug Report

## Sawyer's report (round 8 retest, 2026-11-12)

> Editing a node shouldn't zoom out when the keyboard appears.

Screenshots (3D, phone): before ![[r9-3d-phone-toolbar.png]] and after the keyboard opens ![[r9-3d-keyboard-zoomout.png]]. Every plate became much smaller.

## Expected
When the keyboard opens (or closes), the on-screen scale of the map stays the same, and the node being edited stays visible above the keyboard (pan it into the remaining viewport if needed). Check **both 2D and 3D**; the report is from 3D, but verify 2D on the same resize path.

## Likely cause (verify)
3D: the canvas resize handler sets `camera.aspect`/size with a fixed vertical FOV, so a shorter viewport shows the same vertical extent → everything shrinks. Or a fit/refocus runs on resize. 2D: a resize may trigger fit-to-view or a viewBox recompute. Fix: on a resize that only changes height (keyboard), keep the world-units-per-pixel constant (3D: scale the FOV with height, `fov' = 2·atan(tan(fov/2)·h'/h)`, around a base FOV restored when the height comes back, or move the camera; choose and record) and keep the edited node on screen. Don't change desktop window-resize behaviour beyond what's needed; record if you unify them.

## Code facts
- 3D: `Graph3DScene.ts` (resize/ResizeObserver, `camera.fov`); `Graph3DView.ts` node editor. 2D: `MindMapView.ts` (**~84k tokens with NUL bytes**: `grep -a -n "resize\|ResizeObserver\|fitToView"`, small ranges only). Remember the 2D pan uses CSS transform, not viewBox (memory `mindmap-ios-transform-pan.md`: don't "simplify" it).
- Pure math in `src/graph3d/` with unit tests.

## Context budget
Under ~130k tokens.

## Acceptance criteria
- Phone, 3D and 2D: start editing a node → the keyboard opens → the map scale is unchanged and the node stays visible; finish → back as before.
