---
title: 3D Graph Phase 8 - 2D-3D toggle
summary: "A 2D/3D toggle in the Mind Map view with a lift-off transition: the 2D layout seeds positions at z = 0, then the forces are released."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
status: Done
priority:
progress:
date_created: "2026-10-29T01:03:06.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-03T17:36:48.000Z"
date_start_actual: "2026-11-03T17:36:48.000Z"
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
parent: "[[Develop Mind-Map Graph View]]"
children:
blocked_by:
  - "[[3D Graph Phase 3 - Streaming and stability]]"
cover:
color:
pull_request: https://github.com/SawyerRensel/Osmosis/pull/48
---

# Feature Request

## What do you need built?

*Describe the new tool, script, or capability you're requesting.*

One phase of [[Develop Mind-Map Graph View]]. **Read that note's `# Spec` section first:** it holds the decisions, the world model, the conventions and the full test plan. This note only scopes this phase.

- **The toggle:** a 2D/3D toggle in the Mind Map view toolbar, also registered as a command (toolbar groups drive both).
- **Lift-off transition:** the 2D `computeLayout` positions seed the 3D nodes at z = 0, then the forces are released. If the note already has saved 3D positions, the nodes animate to those instead.
- **Handover:** the focused node and camera carry across in both directions. **Proposed:** the toggle swaps the leaf's view type.

**Acceptance:**
- Toggling in either direction keeps the same note and focused node.
- The transition is smooth on desktop and mobile.

**Every phase:**
- Add or extend the fixture web in `e2e/fixtures/graph3d/`, copy it to `vault/tests/graph3d/`, and reload Obsidian.
- Run lint, test and build, then stop for Sawyer's manual test before committing.
- Work on the `feature/3d-graph-view…` branch, cut from the current release branch.

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

**Built** on `feature/3d-graph-phase-8` (stacked on the Phase 7 tip), code commit `b401351`. Not pushed, no PR, not tested in Obsidian. The whole phase is in one slice.

*Obsolete in the ticket:* "if the note already has saved 3D positions, the nodes animate to those" — positions are never saved (Sawyer, 2026-10-30), so a lift-off always seeds from the map and releases the forces.

### What it does

- **2D → 3D.** A new first toolbar group in the mind map holds one button, **Switch to 3D graph** (`orbit` icon). It is a `TOOLBAR_GROUPS` entry, so it is also the command **Toggle between 2D mind map and 3D graph** (`mindmap-toggle-3d`). The leaf's view type is swapped (`plugin.swapLeafView` → `leaf.setViewState`); the 3D graph opens on the map's note with the map's picture handed over in view state (`liftOff`): every drawn node's box (its note, line start, position and size), the viewport, and the selected node.
- **Lift-off.** On its first load the 3D view seeds every node the map drew at its box centre (`liftOffSeeds`): relative to the viewport's centre, scaled so the median box height becomes a line plate's height, y flipped so up stays up, z = 0 give or take one plate height, and free. The camera stands square over the origin, far enough back to see the viewport's height edge to edge (`standOver`, `frameDistance`), with the mist set for that distance at once. The forces then lift the flat map into its 3D shape, and the camera rides along with the selected node (else the note's core) until it settles, the way the forces slider's `reshape` does. Nothing the map didn't draw (collapsed branches, the other notes in reach) is seeded from the map: `placeNodes` seeds them as usual.
- **3D → 2D.** A **Switch to 2D mind map** header action (`brain-circuit`) and the same command, run while a 3D graph is active. The mind map opens on the focused node's note (else the focus note), selects the focused line (expanding collapsed ancestors), and centres on it at the zoom that draws a line as tall as its plate was on screen there (`linePlatePixels` → `landingZoom`, clamped to the map's 0.1–5). A note core focused: no selection, the zoom still carries, centred on the root.
- **Round trip.** Each view keeps the other's own state in memory and hands it back: 3D keeps the map's `pinned` and reading mode; 2D keeps the 3D graph's depth, backlinks and follow. Neither is persisted (after a restart, pinned defaults to on, depth to 2).
- **Undo across the toggle.** `holdAcross(history, keys, swap)` (`src/edit-history.ts`) holds the note's history while `setViewState` runs, so it survives whichever of "old view releases" and "new view holds" happens first. The 3D view now also holds its focus note in `setState`, before its first reload (which can wait on the engine loading). 2D already holds synchronously at the top of `loadFile`.

### Decisions worth remembering

- **An open 3D edit saves, as a blur does**, before the swap, and the toggle waits for the write (`this.saved`, the last `finishEdit` promise). **A relational study session ends** (`toggleStudy` → `stop`, which flushes schedule writes and the review log). A link drag is dropped. **On the 2D side a peek/study session ends via `exitSpatialMode`** (2D's `onClose` alone would not flush its ratings). A 2D edit cannot be open at toggle time: the toolbar hides and its commands refuse while a node is edited (`canRunToolbarAction`).
- **Only the note itself is held across the swap**, not the map's embedded notes. Nothing holds those before the toggle, and an entry is dropped only when the last holder of one of its files lets go, so holding them for the swap could only drop entries (at depth 1, a nested embed is not loaded in 3D). Going 3D → 2D, the 3D view's other loaded notes are released when it closes, as closing a 3D tab always did: an entry spanning two notes (a cross-note move) is dropped then.
- **Seeds are not exactly flat.** Nodes exactly on one plane stay on it: every force between them lies in the plane. ±1 plate height of z is invisible from straight on (about ±3% size at the hand-over distance) and lets the many-body force lift them.
- **The note's core starts 4 plate heights behind the map.** The map lays its root out as an undrawn point under the first line, which the core plate would cover.
- **Scale by median box height**, not a fixed px→world constant, so a map with a larger font still matches plates; the same median sets the landing zoom, so 2D → 3D → 2D without moving comes back at about the same zoom (`liftoff.test.ts`, "round-trips").
- **The map's picture rides in view state**, plain JSON, read back with a check (`readLiftOff`, `readLanding`) and never written by `getState`, so history and workspace saves don't carry it.
- **Lift-off nodes still fade in** over the scene's 500 ms, while the layout starts to move. I did not add a no-fade path: the map vanishes in one frame when the leaf swaps, and a fade from the background reads softer than plates popping in. Easy to change in `setData` if Sawyer wants the plates at full strength from the first frame.
- **The 2D view state is now built by one pure pair** (`writeMapState` / `readMapState`, `src/mindmap-state.ts`), pinned by tests before `MindMapView.getState` / `setState` were switched to it; the toggle back to 2D uses the same function, so it hands over exactly what the map would have saved.
- **For [[3D Graph - Flatten branches]]:** `liftOffSeeds(model, liftOff, plateHeight)` turns any 2D layout (boxes from `computeLayout`'s nodes, as `liftoff.test.ts` builds them) into free 3D seeds by note and line start. It centres on a viewport and puts a plane at z = 0; flattening will need its own plane and origin per note, so it is a starting point, not a drop-in.
- **Camera flight on edit is untouched** (the "trusting the view" ticket owns that).

### Surface map

| File | Change |
|---|---|
| `src/graph3d/liftoff.ts` (new) | `MapBox`, `MapFocus`, `LiftOff`, `Landing`; `mapLineHeight`, `liftOffScale`, `liftOffSeeds`, `liftOffFocus`, `liftOffFrame`, `frameDistance`, `landingZoom`, `landingChain`, `readLiftOff`, `readLanding` |
| `src/graph3d/liftoff.test.ts` (new) | 19 tests, seeding a real parse + `computeLayout` (positions, flip, flat, core behind, scale, stale boxes), focus, camera and zoom maths, the zoom round trip, state reading, the landing chain |
| `src/mindmap-state.ts` (new), `src/mindmap-state.test.ts` (new) | `writeMapState` / `readMapState`, 4 tests pinning the old `getState` / `setState` behaviour |
| `src/edit-history.ts`, `src/edit-history.test.ts` | `holdAcross`, 3 tests (the swap order that would drop the history, and that it lets go after a failure) |
| `src/views/ToolRibbon.ts`, `src/views/ToolRibbon.test.ts` | `toggle-3d` button and `toggle3D` action; a test pinning every group, id and command name (written before the button was added) |
| `src/views/MindMapView.ts` | `getState` / `setState` via `mindmap-state`; `switchTo3D`, `land`, `graph3dState`; `landing` and `graph3d` read in `setState` |
| `src/views/Graph3DView.ts` | `switchTo2D` + header action; `liftOff` / `mapState` read in `setState`; early hold of the focus note; `place()` takes seeds; `reload` lifts off once; `saved` |
| `src/views/Graph3DScene.ts` | `linePlateHeight`, `standOver`, `linePlatePixels` |
| `src/main.ts` | `swapLeafView`; the toolbar command loop also runs the toggle on an active 3D graph |

### Fixture

None new; the existing ones cover it. Reload Obsidian (Ctrl+R) first. `vault/tests/graph3d/Watch Bill.md` (headings, nested bullets, a checkbox, an ordered list) for the lift-off and undo; `vault/tests/mindmap/heading-links/Link Source.md` for heading links after a toggle; `vault/tests/mindmap/move-nodes.md` for the 2D regression; `vault/tests/mindmap/seam-transit-map.md` for a map with an embed.

### Manual test (Sawyer)

**2D regression first** (`getState` / `setState` and the toolbar changed):
1. Open `vault/tests/mindmap/move-nodes.md` as a mind map. The toolbar's first button is a new orbit icon, then Fit / Zoom / … as before; every other button still works. Double-click a node, edit, Ctrl+Enter; Alt+Up a node; Ctrl+Z twice undoes both, Ctrl+Shift+Z redoes.
2. Pin the map (header pin), open another note in the editor: the map stays. Click Back and Forward in the map's tab: it comes back on the right note, not blank, and stays pinned. Unpin, restart Obsidian: the map reopens on its note, unpinned.
3. `vault/tests/mindmap/heading-links/Link Source.md` as a mind map: a plain click on a heading link loads the target's map in the same tab, centred on the heading; Mod-click opens a new map tab; Back returns.

**2D → 3D:**
4. Open `vault/tests/graph3d/Watch Bill.md` as a mind map, zoom in a little and select "Log the wind". Click the orbit button. Expected: the tab becomes "3D graph: Watch Bill"; for a moment the plates sit where the map drew its nodes, flat, seen straight on, about the size the map drew them; then they drift apart into depth while the view stays on "Log the wind" (the camera rides along until it settles). It should feel like one picture becoming 3D, not a cut. Linked notes appear around it as usual.
5. Run the command "Toggle between 2D mind map and 3D graph" from the palette in a mind map: the same.
6. Phone or tablet: the same with a tap on the toolbar button; it should be smooth there too.

**3D → 2D:**
7. In the 3D view click "Gusts over twenty knots" (it is focused), zoom so its plate is clearly readable, then click the brain-circuit header action (or run the command). Expected: back to the mind map of Watch Bill, "Gusts over twenty knots" selected and centred, drawn at about the size its plate was. Collapse "Log the wind" in 2D first, toggle to 3D, focus "Gusts…", toggle back: the branch expands to show it.
8. Focus a line in another loaded note, toggle to 2D: the map opens on that note, that line selected. Focus a note core: the map opens on that note, centred on its root.
9. Pinned and reading mode survive a round trip: unpin (or switch to reading mode) in 2D, toggle to 3D and back: still unpinned (still reading). Set depth 3 in 3D, toggle to 2D and back: still depth 3.

**Undo across the toggle:**
10. In the Watch Bill mind map, edit a node's text. Toggle to 3D; click a line in Watch Bill; Ctrl+Z: the 2D edit is undone (the file in a note tab shows it). Ctrl+Shift+Z redoes.
11. In 3D, pencil on, edit a line (F2, type, Ctrl+Enter). Toggle to 2D, Ctrl+Z: the 3D edit is undone.
12. In 3D, pencil on, open the editor on a line, type, and without saving click the brain-circuit action: the text is saved (check the note), then the map opens; Ctrl+Z in 2D undoes it.

**Sessions:**
13. Start Relational study in 3D, rate one card, toggle to 2D: the session ends (no panel), the rating is kept (review log / dashboard). Start Spatial study in 2D, rate one, toggle to 3D: the session ends and the rating is kept.

### Not verified

Nothing has run in Obsidian. Lint, the full suite (2,394 tests) and the build pass. Unverified: Obsidian's order of `onClose`, `onOpen` and `setState` during `setViewState` (both orders are covered by the hold, but not observed); whether 3d-force-graph's default camera re-aim (`onUpdate`, which fires while the camera is still at x = y = 0) ever overrides `standOver` (it should not: it also needs z at its own default); how the lift-off looks (scale match, the first ticks at alpha 1 with overlapping plates, the 500 ms fade); `linePlatePixels` against real plate sizes; the 2D landing zoom on a phone; a fifth header action's fit in the 3D view's header on a phone; and Back/Forward history across a toggle (the swap may or may not record a history step, depending on Obsidian).
