---
title: "3D Graph - Opening a map fits it to view"
summary: "Opening a 3D mind map should frame the whole map (the toolbar's Fit) instead of zooming to the root note."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[3D Graph - Navigation gizmos]]"
status: In-Review
priority:
progress:
date_created: "2026-11-12T17:00:00.000Z"
date_modified: "2026-11-12T16:21:57.000Z"
date_start_scheduled: "2026-11-12T16:18:09.000Z"
date_start_actual: "2026-11-12T16:18:09.000Z"
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

# 3D Graph - Opening a map fits it to view (T67)

## Request (Sawyer, 2026-11-12, verbatim)
> Opening a 3D mind map should zoom to fit, not zoom to root note

## Design
- The initial camera framing when a 3D map opens (first load of the view, and re-opening a note in the view) uses the same framing as the toolbar's Fit (`fitToView` → `this.scene?.fitAll()`, `src/views/Graph3DView.ts:746`; pure framing in `src/graph3d/fit.ts` / `framing.ts`).
- Don't change hop-to-another-note flights (following a link, history back/forward) unless they share the exact same code path as "open". If they do, keep their current behaviour and only change the open case; record which path you found.
- A restored view state (e.g. Obsidian restoring a workspace) that carries a camera, if any exists, may keep it; record what you find.

## Acceptance criteria
- Opening any note in 3D (from the note header's 3D pill, the command, or the file menu) shows the whole map framed exactly as pressing Fit would.
- Link hops and back/forward behave as before.
- Unit test for any pure helper you add or change.

## Context budget
Under ~130k. Read Graph3DView.ts by range around `onOpen`/`setState`/`loadFile` and the first-frame camera code in Graph3DScene.ts (grep `fitAll`, `focus`, `frame`). fit.ts/framing.ts whole.

## Conventions
- Batch ticket (round 9). Follow `batch/subagent-brief.md`: own branch stacked on the previous ticket, code commit by path + separate note commit, `status: In-Review`, "Batch implementation notes (awaiting manual test)" section with phone/desktop retest steps. No push, no PR.
- Keys in map views need the view `Scope` (memory: mind map keys need the view Scope). Toolbar buttons come from `TOOLBAR_GROUPS` in `src/views/ToolRibbon.ts`.
- Pure logic goes in modules outside `src/views/` so Vitest can import it (Vitest cannot import `obsidian`).
- `src/views/MindMapView.ts` is ~84k tokens with NUL bytes: never read it whole, use `grep -a -n` and read ranges. Graph3DScene.ts (~37k), Graph3DView.ts (~30k), styles.css (~33k): ranges only.

## Batch implementation notes (awaiting manual test)

Code commit `e29009f` on `feature/3d-open-fits-view`.

### Cause
Every open went through `setState` → `reload(true, subpath, node)`, and with no plate or line named, `reload`'s `flyToFocus` branch did `scene.flyTo(noteNodeId(focus), true)`: a flight to the focus note's core (root), waiting for the layout to spread out first.

### Paths found
- **Open** (note header's map button when the last map view was 3D, the "Open 3D graph for current note" command, the file menu): the *first* `setState` (`this.placed` false) with `{ focus }` only.
- **Link hops, back/forward, Follow active note**: a later `setState` → `travel`, or `setFocus` → `reload(true, …)`. They never reach the first-`setState` code, so the change cannot touch them.
- **Restored workspace / a forward step re-creating the view**: the first `setState` carrying `node` (the plate `getState` saved). No camera is saved, only that plate; it still lands on it.
- **Mod-click a link into a new tab** (`follow-tab`): first `setState` with a `subpath`; still lands on that line.
- **The mind map's 2D | 3D pill**: first `setState` with `liftOff`; still the lift-off (camera stands where the 2D map was looking).

### Fix
- `opensFitted(state)` (`src/graph3d/fit.ts`, unit-tested): true unless the state names a `node`, a non-empty `subpath`, or a `liftOff`.
- The first `setState` sets `fitOnOpen`; `reload` consumes it once (next to `liftOff`) and, instead of the root flight, calls `scene.setFocusId(root)` and `scene.fitAll(true)`.
- `Graph3DScene.fitAll(afterLayout)`: with `afterLayout`, it parks a `pendingFit` until `ticksSinceData >= SETTLE_TICKS` (the same wait `flyTo(id, true)` uses), then runs the ordinary Fit from `startPendingFlight` in `tick()`. `camera.fov` is read live at that moment (T66 keep-scale). Any user move (`cancelFlight`), a `flyTo` or a link ride drops the pending fit.

### Decisions worth remembering
- **The 2D | 3D pill keeps its lift-off.** The ticket names "the note header's 3D pill", but that pill is the mind map's toggle, whose whole point is the camera standing where the 2D map was looking at the same scale (and the 3D→2D toggle hands back that scale). Turning it into a Fit would undo that design. If Sawyer wants the pill to fit too, drop the `state?.liftOff == null` clause in `opensFitted` *and* the `standOver` branch, or call `fitAll(true)` after it.
- **A restored workspace still lands on its saved plate.** It names a place the user was at, which is what the ticket allows. Since a fitted open keeps the root as the focused node, the plate saved by `getState` is the root. So restoring a workspace after an open shows the root, not the fit. If that should be a fit too, `opensFitted` could ignore `node` on the first `setState`, but forward steps that re-create the view would then lose their plate.
- **The focused node stays the root** after a fitted open (`setFocusId`), as the old flight left it, so arrow keys, history entries and `getState` behave as before.
- **The fit waits for 80 ticks**, as the root flight did, so the view does not frame a mid-explosion layout. The layout may spread a little more after that. The fit is a fixed glide that does not track the layout (as the toolbar Fit does not), so plates at the edge could drift slightly out of the margin.

### Surface map
| File | Change |
|---|---|
| `src/graph3d/fit.ts` | `opensFitted(state)` |
| `src/graph3d/fit.test.ts` | Tests for `opensFitted` |
| `src/views/Graph3DScene.ts` | `pendingFit`; `fitAll(afterLayout)`; `startPendingFlight` runs it; `flyTo`, `cancelFlight` and `rideAlong` clear it |
| `src/views/Graph3DView.ts` | `fitOnOpen` set on the first `setState`, consumed in `reload` |

### Fixture
Reuses `vault/tests/graph3d/Sailing Basics.md` (any note with links works).

### Not verified
Not seen in Obsidian. lint, vitest (125 files, 3187 tests) and build all pass.

### Manual retest
**Desktop**
1. Open `tests/graph3d/Sailing Basics.md` and run "Open 3D graph for current note". After about a second, the camera should glide out or in to frame the whole map. Then press the toolbar Fit: the camera should barely move.
2. Right-click the note in the file explorer and open it in 3D: same result. Do the same from the note header's map button, after you last used 3D.
3. In the 3D view, click a link plate or follow a link to another note. Then use back/forward. You should fly to the plate or root as before, with no fit.
4. Start dragging before the fit happens (in the first second). The fit should not snap you away afterward.
5. In a 2D mind map, press the 2D | 3D pill. The lift-off should behave as before (no fit).
6. Mod-click a heading link in a near panel to open a new tab. It should land on that heading.
7. Restart Obsidian with a 3D tab open. It should land on its saved plate, as before.

**Phone**
1. Open a note in 3D from the note's menu or the command. The map should be framed whole in portrait. Rotate to landscape and press Fit: it should frame the whole map again.
2. Open a note in 3D with the keyboard closed. Then tap a plate to edit (keyboard opens). The scale should hold (T66) and nothing should re-fit.
