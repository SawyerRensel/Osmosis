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
status: In-Review
priority:
progress:
date_created: "2026-11-12T05:53:58.000Z"
date_modified: "2026-11-12T06:30:00.000Z"
date_start_scheduled:
date_start_actual: "2026-11-12T06:06:21.000Z"
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

## Batch implementation notes (awaiting manual test)

Code commit `cd08e22` on `feature/3d-nav-gizmos`. Not pushed, no PR.

### Approach

- **Pure module `src/graph3d/gizmos.ts`.** `GIZMOS` (kind, Lucide icon, tooltip, rest and drag cursors), `gizmosAvailable` (the inverse of the joystick gate, `!isMobile && maxTouchPoints === 0`), and `gizmoZoom(dy, height)`, the natural-log zoom for a vertical drag: a drag the height of the view is x8.
- **DOM `src/views/Graph3DGizmos.ts`.** Three round buttons in a column. Pointer capture on press, so the drag goes on off the button, and `stopPropagation` so the canvas never starts a drag. It reports `begin` / `move(dx, dy)` / `end(released)` to the scene. **`begin` waits for the first move**, so a click without dragging does nothing at all (it doesn't even cancel a flight or coast). The scene builds it only when the view passes `gizmos: true` (`Graph3DView`, from `gizmosAvailable`), so it is never in 2D (a different view) and not on touch devices.
- **Scene (`Graph3DScene`: `beginGizmo` / `moveGizmo` / `endGizmo`).**
  - Rotate builds a `RotateDrag` pivoted on a clone of the orbit target, with no grab, and calls the drag's own `rotate()`. Pan calls `pan()` at the target's depth, as OrbitControls' mouse pan does. The state is `this.gizmoDrag`, a `Swipe`, separate from `this.drag` and from `this.swipe`.
  - Release coasts through `launchSwipe`, which I extracted from T59's `endSwipe`. `endSwipe` passes the last event's time, as before; a gizmo passes the moment of release, so holding still before letting go coasts nowhere, as a drag does.
  - Zoom adds `gizmoZoom` to `wheelZoom.pending`, aimed at the middle of the view, as the ribbon's `zoomStep` does. The wheel's own glide plays it out, so no separate coast.
- **Swipe interplay.** `beginGizmo` clears `this.swipe`. A wheel event while a gizmo is held counts as pointer-busy, so it zooms and isn't classified as a swipe. `endSwipe` (from `tick`) only looks at `this.swipe`, so it never ends a gizmo drag. A followed node's move shifts the gizmo's pivot with the others.

### Decisions worth remembering

- **Drag direction = the content follows the pointer**, the same as a canvas drag (rotate drags the world, pan drags the view). Zoom: up zooms in.
- **Zoom rate x8 per view height.** A guess to be felt. It is `GIZMO_ZOOM_PER_HEIGHT`.
- **Zoom aims at the screen centre through `wheelZoom`**, so it picks a node near the centre if there is one (as the ribbon does) and falls back to the last depth. I did not use the orbit target, to match the ribbon.
- **Find bar:** it sits in the same corner (z-index 11), so the gizmos are hidden while it is open (`:has(.osmosis-find-bar)`; it is attached only while open).
- **Icons:** `rotate-3d`, `hand`, `search` (Lucide, bundled with Obsidian). If `rotate-3d` is missing in some Obsidian version the button shows blank; swap it in `GIZMOS`.
- **Cursors:** rotate grab then grabbing, pan move, zoom ns-resize. The drag cursor works through the captured pointer's element.
- **Help list:** new "Navigation gizmos" group in `controls-help.ts`.

### Surface map

| File | Change |
|---|---|
| `src/graph3d/gizmos.ts`, `gizmos.test.ts` (new) | Gizmo definitions, availability gate, drag-to-zoom mapping; 6 tests |
| `src/views/Graph3DGizmos.ts` (new) | The three buttons and their pointer handling |
| `src/views/Graph3DScene.ts` | `gizmos` option, `gizmoDrag`, `beginGizmo` / `moveGizmo` / `endGizmo`, `launchSwipe` extracted from `endSwipe`, pointer-busy and follow-pivot include the gizmo drag |
| `src/views/Graph3DView.ts` | Passes `gizmos: gizmosAvailable(...)` |
| `styles.css` | `.osmosis-graph3d-gizmos` / `-gizmo` (top right, faint, hover, dragging, hidden while Find is open) |
| `src/graph3d/controls-help.ts`, `.test.ts` | "Navigation gizmos" group |
| `docs/mind-mapping/graph-3d.md` | "Navigation gizmos" section under Controls |

### Fixture

No new fixture: `vault/tests/graph3d/Sailing Basics.md` in 3D.

### Not verified

Nothing was run in Obsidian. Unchecked: the icons' look, the zoom rate and rotate/pan feel, that the tooltip appears to the left, the cursor while dragging, coast on release, and a touch-screen laptop (`maxTouchPoints > 0` hides them).
