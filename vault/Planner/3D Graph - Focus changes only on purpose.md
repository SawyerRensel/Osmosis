---
title: 3D Graph - Focus changes only on purpose
summary: "Following a link and clicking another note's plate only fly the camera and select the node; the focus note (and the loaded area) changes only on purpose: the plate menu's \"Focus this note\", the F key, or a panel link to a note that is not loaded."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Develop Mind-Map Graph View]]"
  - "[[3D Graph - Follow a link]]"
  - "[[3D Graph - One H1 is the note's root]]"
status: Done
priority:
progress:
date_created: "2026-11-08T19:48:00.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-08T19:48:00.000Z"
date_start_actual: "2026-11-08T19:48:00.000Z"
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

Settled with Sawyer in the round 3 grill (2026-11-08); do not re-decide.

- **Following a link** (clicking an edge) and **clicking a plate of another note** only fly the camera and select (focus) that node. They do not change the focus note, do not reload, and do not recompute the loaded area.
- **Refocus is deliberate:**
  1. a plate context-menu item **"Focus this note"**, and
  2. a hotkey in the view's Scope (`F`), acting on the selected node's note.
- A **panel link** to a note that is **not loaded** still refocuses, as today (a deliberate request). To a loaded note it only flies.
- Following a link must keep its rule that a hidden study card stays hidden on edge arrival (only a click on the plate reveals it).
- Every caller that relied on hops refocusing gets a recorded decision: depth 0, due-driven study, search/go-to, Mod-click "new 3D tab".
- `GLOSSARY.md`: **Hop** = making another note the focus note on purpose; **Follow a link** = travelling along an edge, camera only. Fix any entry that says clicking or arriving hops.
- A later ticket adds back/forward history (camera visits and focus changes) on top of this, so the fly-to and the refocus stay two separate entry points it can hook.

## What problem does this solve?

Every edge ride and plate click into another note recentred the loaded area: notes left and arrived, the layout re-heated, and the place you were looking at changed under you. Exploring by following links should feel like travelling through a fixed map; changing what the map is centred on should be something you ask for.

## What's your current workaround?

None: every click into another note refocuses.

## Reference Attachments/Screenshots

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

Code commit `ceca2e8` on `feature/3d-graph-focus-on-purpose` (stacked on `fix/3d-graph-flatten-spread`). Not pushed, no PR.

### Cause

`Graph3DView.hop` did two things at once: fly the camera to the node, and `setFocus` its note when it was another note. Every travel path went through it: a plate click (`clickNode`), an edge ride's arrival (`onNodeArrived`), a panel link to a loaded node (`followLink`), free study's Next and a study stop in a loaded note (`goTo`). So every arrival in another note re-ran the horizon, reloaded and re-heated the layout.

### Approach

Two entry points in `Graph3DView`, kept apart on purpose so the back/forward ticket can hook each:

- **`visit(node)`: travel, camera only.** `scene.flyTo(node.id)`, which also selects the node (`focusId`). Plate clicks, edge arrivals, panel links whose target is loaded, free study's Next, and study stops whose node is loaded all come here. The focus note, the header title and the loaded area stay as they are.
- **`hop(node)`: a deliberate refocus.** Fly to the node, then `setFocus(path, false)` when `refocusPath(node, focusPath)` (new pure `src/graph3d/refocus.ts`) names another note. Called only by the plate menu's **Focus this note** and the **F** key.
- **`setFocus(path, flyToFocus, subpath)`** is now the single place a focus change happens after the view opens, and returns the reload's promise. `goTo` (study stops in unloaded notes) now calls it instead of setting `focusPath` by hand, so the follow-active-note toggle, a panel link to an unloaded note, a study stop in an unloaded note and `hop` all pass through it.

### Decisions worth remembering

- **The plate menu now opens outside edit mode too**, on line *and* note plates (right-click that stays put; touch long-press of 500 ms). Before, it existed only in edit mode on lines, so a reader (or a phone, which has no F key) had no way to refocus. Outside edit mode it holds only "Focus this note"; in edit mode "Focus this note" comes first, then a separator and the existing edit items. Tags, attachments and ghosts have no menu (they belong to no note).
- **"Focus this note" is greyed out, not hidden, on a plate of the focus note**, so a right-click there still shows that the menu exists.
- **The long press outside edit mode also drops the drag** (`press = drag = null` when the menu opens), so a finger that moves after the menu appears does not orbit behind it. A finger that moves past the 6 px slop before 500 ms cancels the menu and orbits as before.
- **The browser context menu is now prevented on the canvas in both modes** (was edit mode only). OrbitControls already prevents it, so nothing visible changes.
- **F** (not Shift+F) in the view Scope, skipped while typing; when the selected node is in the focus note (or there is none), F is passed on to any global hotkey. Free of W/A/S/D/Q/E, Space, 1–4, F2, Tab, Enter, Delete, Backspace, Mod+Z/Y.
- **The menu and F fly to the node too**, exactly as the old click-hop did: `flyTo` makes the camera follow the node while the reload re-heats the layout. With F the camera is normally there already, so the flight is a no-op.
- **Panel links:** to a loaded target (note, heading/block line, attachment, ghost) → `visit`. To a note that is not loaded → `setFocus(file, true, subpath)` as before. Mod-click "new 3D tab" and Mod+Alt "open note" are unchanged (they never touched this view's focus).
- **Depth 0:** the Depth 0 ticket's "a click or edge ride recentres on the clicked note" is **superseded**: clicking a plate in an embedded section, or riding the embed edge into it, now only flies. Use F or the menu to recentre on the embedded note.
- **Due-driven study:** a stop whose node is loaded flies only; a stop in a note not loaded refocuses (as before, through `goTo` → `setFocus`), so the route still reaches cards beyond the loaded area. Because flying no longer moves the focus note, `nextOnRoute` now measures "fewest hops from where you stand" from **the stop you are on** (falling back to the focus note at the start), which keeps the route order the old refocusing gave. Unit-tested in `Graph3DStudy.dom.test.ts`. Trail steps behave the same way (loaded → fly, not loaded → refocus).
- **Search results:** the 3D view has no search of its own; the only "go to" flight is study's `goTo`, covered above. The travel-speed tooltip and glossary still mention search results as originally written.
- **Renamed `LinkClick`'s `"hop"` action to `"node"`** (`src/graph3d/links.ts`): it means "an ordinary click on the node", which is no longer a hop. No behaviour change.
- The study panel's "No due cards here: hop on to look further." still reads correctly under the new meaning (refocus to load more), so it was left as is.

### Hooks for the back/forward ticket

- Camera visits: `Graph3DView.visit(node)` (every travel; note `onNodeArrived` arrives here after an edge ride, `clickNode` after `study.clicked`).
- Focus changes: `Graph3DView.setFocus(path, flyToFocus, subpath)` (every focus change after the view opens; the initial `setState` → `reload` does not pass through it). `hop(node)` is `flyTo` + `setFocus`, so recording in `setFocus` alone avoids a duplicate visit entry only if `hop` does not also call `visit` (it doesn't).

### Surface map

| File | Change |
|---|---|
| `src/graph3d/refocus.ts` (new) | `refocusPath(node, focusPath)`: the note a deliberate refocus makes the focus note, or null |
| `src/graph3d/refocus.test.ts` (new) | Its cases: another note's line/core, the focus note, no focus yet, tags/attachments/ghosts |
| `src/views/Graph3DView.ts` | `visit` (fly only) split from `hop` (fly + refocus); clicks, edge arrivals, loaded panel links and `goTo` use `visit`; F key in the Scope; `showNodeMenu` gains "Focus this note" and works outside edit mode and on note plates; `setFocus` returns its reload, `goTo` uses it; comments |
| `src/views/Graph3DScene.ts` | Right-click menu and touch long-press on line and note plates in both modes (`hasMenu`); long press drops the drag; canvas context menu always prevented; comments |
| `src/views/Graph3DStudy.ts` | Host `hop` → `visit`; `nextOnRoute` measures from the current stop's note |
| `src/views/Graph3DStudy.dom.test.ts` | Harness `visit`; new test: next stop measured from the stop you are on, focus unchanged |
| `src/graph3d/links.ts`, `links.test.ts` | `LinkClick` `"hop"` → `"node"`; wording |
| `src/views/Graph3DOverlays.ts` | Travel speed tooltip: "fly to a plate" |
| `GLOSSARY.md` | **Focus note**, **Hop**, **Follow a link**, **Travel speed** |

### Fixture

Reused, none new: `vault/tests/graph3d/Sailing Basics.md` (links to Knots, Points of Sail, Rigging), `Depth Zero.md` (embeds of Weather, Knots, Sail Care), `Crew Drills.md` / `Harbour Rules.md` (due cards for study). No fixture was written, so no reload is needed for the reset hazard; reload Obsidian (Ctrl+R) once to load the new build.

### Manual test steps

1. Open `Sailing Basics`, open its 3D graph at depth 1. **Edge ride:** click the edge from "Every sailor learns Knots first" towards `Knots`. The camera rides to the Knots plate and stops. The tab title still reads "3D graph: Sailing Basics", nothing loads or unloads, and no other plate moves.
2. **Plate click:** click a plate in `Points of Sail`. The camera flies there; title unchanged, nothing reloads.
3. **Menu:** right-click (without dragging) a `Knots` plate outside edit mode: a menu with "Focus this note". Choose it: the title becomes "3D graph: Knots" and the loaded area recentres. Right-click a plate of the focus note: the item is greyed out. Right-click a tag plate: no menu. In edit mode, right-click a line: "Focus this note", a separator, then the usual edit items, all working.
4. **F key:** click a plate of another note, press F: same refocus as the menu. Press F on a plate of the focus note: nothing. Press F while typing in the inline editor: types an "f".
5. **Touch (phone):** long-press a plate of another note (outside edit mode): the menu opens and the view does not orbit. A short tap still flies; a drag still orbits. In edit mode long-press on a line still opens the menu, and drag-to-link still works.
6. **Panel links:** in a near-tier panel, click a link to a note that is loaded: the camera flies, title unchanged. Click a link to a note not loaded (set depth 1 in `Knots` and click a link out of the area, or use `Depth Zero`'s "Plain links" lines at depth 0): the graph refocuses on it, as before. Ctrl/Cmd-click still opens a new 3D tab.
7. **Depth 0:** open `Depth Zero` at depth 0. Click a plate in the Weather section, and ride the embed edge into "Bends": the camera flies only, the graph stays `Depth Zero`. Press F there: the graph becomes `Weather` (or `Knots`) at depth 0.
8. **Study, due-driven:** from `Harbour Rules` start Relational study, choose Due-driven, press Next repeatedly. Stops in loaded notes fly only (title unchanged); a stop in a note not loaded refocuses and lands on the card. Ride an edge onto a hidden card: it stays hidden until you click it.
9. **Regressions:** 2D⟷3D toggle (lands on the selected line's note, which may now differ from the focus note), Follow active note, edit mode (F2, Tab, Enter, drag-to-link), flight keys, Overlays sliders.

### Not verified

Everything interactive above: I cannot run Obsidian. In particular the menu outside edit mode (that nothing else in Obsidian claims the right-click on the canvas), the touch long-press feeling on a phone, and how far the camera "flies" after the menu/F when it is already at the plate. Lint, the full vitest suite (2516 tests) and the build pass.
