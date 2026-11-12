---
title: 3D Graph - Navigation gizmos
summary: "Three semi-transparent round gizmos (rotate, pan, zoom) stacked at the 3D view's top right, Blender style: press and drag to orbit/pan/zoom about the view center. Desktop without a touch screen only."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[3D Graph - Touchpad swipe rotates]]"
  - "[[Graph pointer gestures - orbit, pan, link, menu]]"
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

Blender-style navigation gizmos in the 3D graph view. These are three semi-transparent round buttons, stacked vertically at the **top right** of the 3D viewport:

1. **Rotate** (an orbit / rotate icon)
2. **Pan** (a hand icon)
3. **Zoom** (a magnifier icon)

Press a gizmo and drag anywhere on screen. The view rotates, pans or zooms until you release.

## What problem does this solve?

It gives a discoverable way to navigate with a mouse or touchpad without remembering modifier gestures.

## What's your current workaround?

Modifier drags (Ctrl or right-drag to pan, middle-drag to zoom) or the ribbon's zoom buttons.

## Decisions (settled with Sawyer, 2026-11-12; not to be re-decided)

- **Plain round icon buttons**, not Blender's X/Y/Z axis ball. Notes have no meaningful world axes.
- **They act on the view center**, not on what's under the pointer:
  - **Rotate** orbits the current orbit target, with no surface grab.
  - **Pan** slides the view.
  - **Zoom**: drag up zooms in and drag down zooms out, toward the screen center.
- **Clicking without dragging does nothing.** The ribbon already has zoom in/out, fit and home.
- **Desktop without a touch screen only.** Hide them when `Platform.isMobile || navigator.maxTouchPoints > 0`, the inverse of the joystick toggle's gate.
- Semi-transparent at rest, more opaque on hover and while dragging. While dragging, the cursor matches the gizmo (e.g. `grabbing` / `move` / `ns-resize`). Use Obsidian theme variables.

## Code facts (orchestrator, 2026-11-12 — spot-check)

- Top-right of the 3D stage is currently free. Other overlays sit elsewhere: perf readout top-left (`.osmosis-graph3d-perf`), help and corner bottom-left (`.osmosis-graph3d-corner` / `-help`), speed readout, and the study panel bottom-centre. Check `styles.css` near `:4100-4360` and the view's DOM build in `src/views/Graph3DView.ts` (~`:405-480`).
- Rotation: `rotate()` / `rotateAboutPivot` and the orbit rate `ORBIT_RATE / clientHeight` in `src/views/Graph3DScene.ts`. Pan: OrbitControls' pan and the mouse-pan sampling (`:2099-2105`). Zoom: the wheel's eased zoom `this.wheelZoom` / `easeWheel`, and the ribbon zoom's `wheelZoom` at the screen centre (~`:1147-1154`). Reuse these rather than adding new camera maths. Release should coast like the matching drag where that's cheap.
- New camera input must call `cancelFlight()` (see the 3D memory file).
- Use pointer capture on the gizmo so the drag continues off it. Stop propagation so the canvas doesn't also start a drag.
- Add the gizmos to the in-view help list and the 3D docs page.

## Context budget

`Graph3DScene.ts` is ~37k tokens, `Graph3DView.ts` ~30k, `styles.css` ~33k. Read all three by range. Don't open `MindMapView.ts`.

## Acceptance criteria

- On a non-touch desktop, three gizmos appear top right in 3D. They're hidden on touch devices and never appear in 2D.
- Dragging Rotate orbits about the view centre, dragging Pan pans, and dragging Zoom up or down zooms in or out.
- Clicking any gizmo without dragging changes nothing.
- They stay out of the way of the other overlays and don't block node clicks elsewhere.

## Test plan

**Unit:** if there's a pure mapping (drag delta to zoom factor, visibility gate), test it.

**Manual** (Ctrl+R after build), desktop, `vault/tests/graph3d/Sailing Basics.md` in 3D:
1. Three faint round gizmos sit top right and brighten on hover.
2. Drag Rotate: orbits around the centre. Drag Pan: the view slides. Drag Zoom up and down: zooms in and out.
3. Click each gizmo without moving: nothing happens.
4. In 2D, or on a phone or touch-screen laptop: no gizmos.
