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
status: Done
priority:
progress:
date_created: "2026-11-12T11:52:00.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-12T16:11:54.000Z"
date_start_actual: "2026-11-12T16:11:54.000Z"
date_end_scheduled: "2026-11-17T00:43:08.000Z"
date_end_actual: "2026-11-17T00:43:08.000Z"
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/48
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

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

Code commit `9ccf022` on `fix/keyboard-zoom-out`.

### The cause
3D: the editor sets `navigator.virtualKeyboard.overlaysContent = true`, but on Obsidian Android the WebView still resizes when the keyboard opens (the screenshots show the stage ending at the keyboard). The stage's `ResizeObserver` calls `Graph3DScene.resize`, which hands the new size to the engine; the engine only changes `camera.aspect`, so the fixed vertical field of view now spans fewer pixels and every plate shrinks by roughly the height ratio. No fit or refocus runs on resize. The visible-band offset (`bandOffset`) didn't fire because the stage it measures had already shrunk to fit inside the band.

2D: no change needed, checked by reading the code. `MindMapView.handleContainerResize` returns early while a node is being edited, and on mobile `startEditing` pins the map host with `position: fixed` at its pre-keyboard size. When the keyboard closes, the resize keeps `zoom` (px per unit) and only recentres the viewBox, so the scale never changes. I left the CSS-transform pan alone.

### The fix
`src/graph3d/keep-scale.ts`: `keepScale(base, width, height, defaultFov)`. When only the height changes, the vertical field of view becomes `2·atan(tan(fov₀/2)·h/h₀)`, so world units per pixel stay the same. When the width changes (first layout, rotation, split screen), it starts again at the default field of view and records the new size as the base. `Graph3DScene.resize` applies this on `Platform.isMobile` only. The field of view narrows around the centre of the picture, and the phone editor already pans the edited line to that centre (`setEditing` → `panOnto`), so the node stays in view above the keyboard. When the keyboard closes, the height returns and so does the default field of view.

### Decisions worth remembering
- **I changed the field of view, not the camera position.** Moving the camera would change the perspective and the near-tier choice, and it would need a flight. The field of view gives exactly constant scale at every depth, and anything that reads `camera.fov` together with `container.clientHeight` (per-pixel maths, `plateInset`, near-tier scale) stays consistent automatically.
- **Mobile only, for every height-only resize, not just while editing.** Any keyboard shortens the stage the same way (search, rename, the Osmosis bar's inputs), and on a phone a change of height alone is effectively always a keyboard or bar change. Desktop window resizing is unchanged: fixed field of view, as before.
- **A width change resets to the default field of view.** If you rotate the phone while the keyboard is open, the shorter height becomes the base, and the field of view grows past the default when the keyboard closes. This is still scale-preserving; it settles back to the default on the next rotation.
- Width changes under 1 px count as unchanged, to absorb sub-pixel layout jitter.

### Surface map
| File | Change |
|---|---|
| `src/graph3d/keep-scale.ts` | New: `heightFov`, `keepScale`, `ScaleBase` |
| `src/graph3d/keep-scale.test.ts` | New: 6 tests (constant scale, restore on close, jitter, width reset) |
| `src/views/Graph3DScene.ts` | `defaultFov` captured at construction; `scaleBase`; `resize()` applies `keepScale` on mobile |

### Fixture
None new. Any `vault/tests/graph3d/` note works (the screenshots used an operators note).

### Not verified
I couldn't run this on a phone. The cause is inferred from the screenshots and the code. I didn't check whether iOS also resizes the WebView: if it overlays the keyboard instead, the existing visible-band offset handles it, and this change has no effect there.
