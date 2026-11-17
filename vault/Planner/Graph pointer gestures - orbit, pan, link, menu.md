---
title: Graph pointer gestures - orbit, pan, link, menu
summary: "3D: plain drag always orbits (edit mode too), Alt+drag links, Ctrl/Cmd+drag pans, Shift+drag is reserved for box select; right-drag pans and a right-click that never moved opens the menu on release, in both the 3D view and the 2D mind map."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Develop Mind-Map Graph View]]"
  - "[[3D Graph - Focus changes only on purpose]]"
status: Done
priority:
progress:
date_created: "2026-11-08T20:30:00.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-08T20:30:00.000Z"
date_start_actual: "2026-11-08T20:30:00.000Z"
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

# Feature Request

## What do you need built?

Settled with Sawyer in a grill on 2026-11-08; do not re-decide.

**3D view, left-button drag**

- **Plain drag = orbit**, including when the press lands on a plate in edit mode. Pivot behaviour is unchanged (`graph3dDesktopPivot`).
- **Alt+drag = drag-to-link** (edit mode only). The drop opens the existing drop menu (`showDropMenu`), unchanged. On touch, today's drag from a line in edit mode stays. On some Linux desktops the window manager grabs Alt+drag; accepted.
- **Ctrl/Cmd+drag = pan** (OrbitControls, as before).
- **Shift+drag = reserved for box select** (the next ticket). It no longer pans. Shift+click on a plate keeps today's click behaviour for now.
- **Right-drag pans** (OrbitControls, as before). A **right-click that never moved** (under 4 px, the shared slop) opens the plate context menu on release.

**2D mind map**

- **Right-drag pans**, through the existing middle-drag / background pan path.
- A **right-click that never moved** opens the node or background menu on release (it selects the node first, as before). Touch is unchanged (long press, ribbon's More actions). Left-drag and Shift+drag rubber band are unchanged.

## What problem does this solve?

In edit mode a press on a line plate started a link drag, so you could not orbit around a node you were editing. Shift, Ctrl and Cmd all panned. The right button did not pan in the 2D map, and its menu opened on press.

## What's your current workaround?

Orbit from empty space; use the toolbar.

## Final gesture map (for the Controls docs)

| Input | 3D view | 2D mind map |
|---|---|---|
| Left drag | Orbit (pivot per setting); in edit mode too, from a plate | Pan on background, move a node (as before) |
| Alt + left drag | Drag-to-link from a line plate (edit mode), drop menu on release; plain orbit outside edit mode | none |
| Ctrl/Cmd + left drag | Pan | as before |
| Shift + left drag | Reserved for box select; does nothing now | Rubber band (as before) |
| Right drag | Pan | Pan |
| Right click, no drag (under 4 px) | Plate menu, on release | Node/background menu, on release |
| Middle drag | Zoom (OrbitControls, as before) | Pan (as before) |
| Touch drag | Orbit; in edit mode from a line it drags a link; hold on a plate opens the menu | as before |
| F, WASD etc. | Fly / mouse-look during a drag (unchanged), F refocuses | as before |

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

**Approach.** One pure module, `src/pointer-gesture.ts`, holds the shared drag-versus-click rule (`CLICK_SLOP_PX` = 4, `movedPastSlop`) and `gestureFor()`, which maps (button, pointer type, modifiers, edit mode) to `orbit | pan | link | boxSelect | panOrMenu | none`. The 3D scene's `onPointerDown` now switches on that instead of testing `linkMode` and the modifier keys inline.

**Why Shift needed a capture listener.** OrbitControls pans on left + Shift/Ctrl/Cmd, and its `pointerdown` listener on the canvas runs before ours (it is registered first). Our own handler returning early could not stop it. `onPointerDownCapture` sits on the container in the capture phase; for a Shift press on the canvas it calls `stopPropagation()` (so OrbitControls never sees it) and runs `onPointerDown` itself.

**Where the box-select ticket hooks in.** `Graph3DScene.beginBoxSelect(e)` is an empty method, called from `onPointerDown` when the gesture is `boxSelect` (a Shift + left mouse press on the canvas). `this.press` is already set to the press point, so a Shift+click still reaches `click()` as before; fill in the drag in `beginBoxSelect` and the move/up handlers (`onPointerMove`, `onPointerUp`). Remember a new handler should call `cancelFlight()`.

**2D right button.** `handlePointerDown` takes a mouse/pen right press (not while a node is being edited, so the native text menu stays) and starts the same pan state as middle-drag, with `panPending` so the map does not move for a click-sized wobble. `contextPress` remembers the node under the press. In `handlePointerUp`, a `pointerup` with button 2 and `panCommitted` still false opens `showNodeMenu` at the pointer. `handleContextMenu` now ignores the browser event while a right press is down (Linux and macOS fire it on press) and for 250 ms after a release-open (Windows fires it after release). It still opens the menu at once when neither applies, which keeps the keyboard menu key and macOS Ctrl+click working.

**Decisions worth remembering**

- Precedence for the left button is Shift, then Ctrl/Cmd, then Alt. Ctrl+Alt must be a pan, or OrbitControls (which sees the Ctrl) would pan under a link drag.
- The shared 4 px slop applies to the right-click menu in both views. The 3D left-click slop stays at 6 px (`CLICK_SLOP_PX` in `Graph3DScene.ts`), and 2D node drags and touch keep `mindmap-gesture.ts` (5 / 10 px): tightening them was not asked for. The 2D right-press pan uses the 4 px slop while pending, not 5.
- Touch in edit mode still maps to `link` (today's behaviour); the scene falls back to orbit when the press is not on a line.
- 3D right-click was already on release (previous ticket, `menuPress` / `onPointerUp`) and cancelled by moving, and `onContextMenuEvent` already suppresses the native event on the canvas. I only aligned its slop (6 to 4) and dropped the "edit mode" wording (it works in any mode).
- No background menu exists in 3D, so a right-click on empty space opens nothing there.

## Surface map

| File | Change |
|---|---|
| `src/pointer-gesture.ts` | New: shared slop, `gestureFor` |
| `src/pointer-gesture.test.ts` | New: 11 unit tests |
| `src/views/Graph3DScene.ts` | Gesture switch in `onPointerDown`, Shift capture listener, `beginBoxSelect` stub, right-click slop |
| `src/views/MindMapView.ts` | Right-drag pan, right-click menu on release, `contextmenu` dedupe |

## Test fixture

None (gesture behaviour, no file content). Use `vault/tests/graph3d/` fixtures, edit mode on a sailing note.

## Manual test steps

3D view (open a note in the 3D graph; for edit-mode steps turn edit mode on):

1. Edit mode on: left-drag starting on a line plate. Expect the view to orbit around it (no rubber band).
2. Edit mode on: hold Alt, drag from a line plate onto another plate and release. Expect the rubber band, highlight, and the existing drop menu. Esc during the drag cancels.
3. Alt+drag on empty space: orbits. Edit mode off, Alt+drag: orbits.
4. Ctrl (Cmd on Mac) + left-drag: pans. Ctrl+click a link in a panel still opens it.
5. Shift + left-drag: nothing moves. Shift+click a plate: selects as a plain click does.
6. Right-drag: pans, and no menu appears on release. Right-click on a plate without moving: the plate menu opens when you let go, not on press. Moving 2-3 px still opens it; moving 5+ px pans instead.
7. Middle-drag still zooms. Wheel zoom unchanged.
8. Regressions: F key refocuses the selected note; holding W/A/S/D during a left-drag gives mouse-look; touch: long-press on a plate opens the menu, in edit mode a finger drag from a line links, a one-finger drag elsewhere orbits.

2D mind map:

9. Right-drag on the background and on a node: the map pans, no menu.
10. Right-click a node without moving: the node menu opens on release, node selected. Right-click the background: the background menu. Reading mode: the reading menu.
11. Left-drag background pans; Shift+left-drag on background draws the rubber band; left-drag a node moves it (all as before).
12. Touch: long-press selects (no menu), ribbon "More actions" opens the menu.
13. While editing a node's text, right-click shows the browser's own menu (as before).

## What I could not verify

Everything in Obsidian: I cannot see it. Specifically unverified: that the capture-phase `stopPropagation` fully keeps OrbitControls from panning on Shift (it should: its listener is on the canvas, below the container); that Obsidian's `Menu` opens cleanly from a `pointerup` event on all platforms; the Windows/macOS `contextmenu` ordering assumptions behind the 250 ms dedupe.
