---
title: "Toolbar - Link button offers Add link, Move under or Move after"
summary: "Round 11 (T83). After the Link button's target tap, show a menu (Add link / Move under / Move after / Move to end of note) at the target, in 3D and 2D, like 3D's Alt-drag drop menu."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Toolbar - Add link button for touch]]"
status: Done
priority:
progress:
date_created: "2026-11-15T21:50:00.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-15T21:58:51.000Z"
date_start_actual: "2026-11-15T21:58:51.000Z"
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

# Toolbar - Link button offers Add link, Move under or Move after (T83)

## Request (Sawyer, 2026-11-15)
> Link button should prompt to `Add link`, `Move under`, or `Move after` like Alt+Click+drag does on desktop

Decisions (Sawyer, 2026-11-15): **both 3D and 2D**; the menu appears **at the tapped target**.

## Where the code is
- Toolbar entry `add-link`, `src/views/ToolRibbon.ts` ~88, action `addLink`. Arm/pick logic: `src/link-pick.ts`.
- 3D: `Graph3DView.ts` ~1125–1200: `toggleLinkPick`, the pick handler (~1151, links at once) and `showDropMenu` (~1170–1200) with Add link / Move under / Move after (not for a note root) / Move to end of note (roots) and group variants via `linkSelection` / `moveSelection`.
- 2D: `MindMapView.ts` pick at ~8219 (`pick.kind === "link"` → `linkNodes` ~8230), tap handling ~4068 and ~4574. 2D has no such menu today. 2D drag-drop moves exist; find the 2D move path (grep `edit-moves`, `moveNode`, drop handling) and reuse it.
- Moves: `src/edit-moves.ts`, `src/graph3d/selection-edit.ts`.

## Probable shape
On a pick that lands on a node, show the menu at the target's screen position (Obsidian `Menu.showAtPosition`) instead of linking at once. Share one pure menu-item builder (which items apply for this source set/target: root, same node, ancestor-into-descendant moves forbidden, cross-note) used by the 3D drop menu, the 3D pick and the 2D pick. Disarm after a choice; dismissing the menu also disarms (record the call). Undo must work for each choice as it does for the existing actions.

## Conventions
- Round 11 batch ticket. Follow `batch/subagent-brief.md`: stay on the branch the orchestrator checked out, commit code by path and the note separately, set `status: In-Review`, add "Batch implementation notes (awaiting manual test)" with desktop and phone retest steps. No push, no PR.
- `vault/Bases/Osmosis Project Board.base` has an uncommitted edit of Sawyer's. Never stage, revert or touch it; "clean tree" means clean apart from that file.
- Pure logic goes outside `src/views/` (Vitest cannot import `obsidian`). Run vitest with `--maxWorkers=2`.
- Never read whole: `src/views/MindMapView.ts` (~84k tokens, NUL bytes, use `grep -a -n`), `Graph3DScene.ts`, `Graph3DView.ts`, `Graph3DNear.ts`, `styles.css`.

## Done when
Link button → tap target → menu in both views; each item does what the 3D drop menu's same item does; 3D Alt-drag drop menu unchanged. Unit tests for the item builder.

## Context budget
~130k. `Graph3DView.ts` ~1100–1260 by range; `MindMapView.ts` by grep/range only; `link-pick.ts`, `edit-moves.ts`, `selection-edit.ts` whole.

## Test plan (Sawyer)
Desktop and phone, 2D and 3D: select a node, tap Link, tap another node → menu. Try each item, then Ctrl+Z. Multi-select variant. Target = note root: no "Move after", "Move to end of note" offered. 3D Alt-drag drop still shows its menu.

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

Code: commit `a9d4387` on `feature/link-button-menu`. The whole ticket shipped.

### Approach
- **One pure item builder:** `linkMenuItems({ canLink, canMove, line, root })` in `src/link-pick.ts` (tested in `link-pick.test.ts`) returns the ordered items with the drop menu's titles and icons: Add link (if `canLink`), then, if `canMove`, Move under (a line), Move after (a line that is not a root), Move to end of note (a root). Each view judges the four flags its own way.
- **3D:** `showDropMenu` now only works out the group (the selection, if the dragged plate is in a larger one) and calls the new `showLinkMenu(sources, to, x, y)`, which holds the old menu body built from `linkMenuItems`. The Alt-drag drop menu therefore behaves as before (same items, same conditions, same actions). The pick (`pickLinkTarget`) calls `showLinkMenu` with the armed lines instead of linking at once; the scene's `onLinkPick` now also passes the release's client point.
- **2D:** `pickLinkTarget(nodeId, x, y)` → `showLinkMenu`, an Obsidian `Menu` at the tap/click point. Add link → the existing `linkNodes`. Moves → `moveNodesBy` → `moveNodesTo`, which is `executeDrop`'s old body split out (the drag and drop's own write path: same-file splice or `moveAcrossFiles`, then the moved nodes reselected). `executeDrop` now just snapshots, settles and calls `moveNodesTo`. Under = end of the target's children; After = right after the target in its parent; the 2D root (the note) offers Move to end of note = end of the root's children.
- Undo: every choice writes through exactly the path its existing gesture uses (3D `linkLines`/`linkSelection`/`moveLine`/`moveSelection`; 2D `linkNodes` and the drag's move), so Ctrl+Z behaves as for those.

### Decisions worth remembering
- **The mode ends at the pick.** `LinkPicker.tap` already disarms on a target, so dismissing the menu (Escape, a tap elsewhere) writes nothing and the button is off. Press Link again to retry. Simpler than re-arming on dismiss, and Obsidian's `Menu` close does not tell us whether an item was chosen.
- **Menu at the tap point**, not the target's centre: the tap is on the target, and it is the point the 3D drop menu uses too.
- **2D moves only for siblings.** A 2D drag moves only the selected siblings of the dragged node, and `moveNodesTo` keeps that rule. When the armed nodes are not all siblings (or a target is inside a source's subtree, or a source is the root), the move items are hidden and only Add link shows. If no item applies at all a Notice says so.
- **2D Add link hidden where `linkNodes` would refuse:** target an embed line; every source the root or an embed line; target the root with every source in the map's own note.
- **3D keeps `canMove: true`** as before: its own refusals (`moveRefusal` / "a line can't move under itself") still give the Notice after the choice, so the drop menu is unchanged.
- 2D Move under a collapsed node appends at the end of its (hidden) children, from the parse tree rather than the layout.

### Surface map
| File | Change |
|---|---|
| `src/link-pick.ts` (+test) | `LinkChoice`, `LinkMenuItem`, `LinkMenuTarget`, `linkMenuItems` |
| `src/views/Graph3DScene.ts` | `onLinkPick(node, x, y)` passes the click's client point |
| `src/views/Graph3DView.ts` | `showLinkMenu` (from `showDropMenu`'s body, built on `linkMenuItems`); `showDropMenu` delegates; `pickLinkTarget` shows the menu |
| `src/views/MindMapView.ts` | `executeDrop` split into `moveNodesTo`; new `showLinkMenu`, `moveNodesBy`; `pickLinkTarget` takes the tap point |
| `src/graph3d/controls-help.ts`, `docs/mind-mapping/graph-3d.md`, `docs/mind-mapping/editing.md` | Menu documented |

### Fixture
None new. 3D: `vault/tests/graph3d/Sailing Basics.md` (+ `Harbour Links.md`). 2D: the same note in the mind map.

### Could not verify
Nothing was run in Obsidian or on a device. Not verified: that a phone's tap release doesn't close the menu immediately (it opens on a 0 ms timeout, as the 3D drop menu does); 2D moves into or out of a transcluded section via the menu (same code as the drag).

### Retest (desktop and phone, 2D and 3D)
1. Edit mode, select a line, tap Link, tap another line: a menu at the tap with Add link / Move under / Move after. Try each, Ctrl+Z after each (phone: the undo button).
2. Multi-select two sibling lines, Link, tap a third line: each item acts on both.
3. 2D: multi-select non-siblings (e.g. a heading and a bullet in another heading): only Add link shows.
4. Target the note root (3D note plate or sole-H1, 2D root): no Move after; Move to end of note is offered (3D sole H1 also offers Move under).
5. Tap Link, tap a target, then dismiss the menu: nothing written, button off.
6. 3D desktop: Alt-drag a line onto another: the drop menu is as before.
