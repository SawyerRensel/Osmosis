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
status: To-Do
priority:
progress:
date_created: "2026-11-15T21:50:00.000Z"
date_modified: "2026-11-15T21:50:00.000Z"
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
