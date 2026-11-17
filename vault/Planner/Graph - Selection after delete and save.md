---
title: Graph - Selection after delete and save
summary: "Which node is selected after a delete (the previous sibling, else the parent) and after a save (the saved node, new or not), in the 2D mind map and the 3D graph."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[Develop Mind-Map Graph View]]"
  - "[[3D Graph - Multi-select]]"
  - "[[3D Graph - Arrow-key navigation]]"
status: Done
priority:
progress:
date_created: "2026-11-09T13:01:03.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-09T13:01:03.000Z"
date_start_actual: "2026-11-09T13:01:03.000Z"
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

## What happened?

Sawyer, 2026-11-09. After a delete the new selection was arbitrary: in 3D the parent was only *focused* (no selection border), in 2D the parent or, failing that, the first node was selected. After saving a node's editor, 3D did not select the node.

## What should have happened?

1. **After deleting** the selected node(s), select the **previous sibling** of the first deleted node in document order; with no previous sibling, its **parent**. Applies to a single Delete, a multi-delete and the right-click "Delete N selected lines". In 3D the camera tracks the new selection as the B1 re-settle tracks the edited node.
2. **After saving** a node's editor, that node is selected, including a node just added (Enter/Tab, type, commit).

Not changed: keys, the A1 focus rules, history.

## Where is this file located?

`vault/tests/graph3d/Dock Chores.md` (source: `e2e/fixtures/graph3d/Dock Chores.md`).

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

**What each view did before.**

| Case | 2D (`MindMapView.ts`) before | 3D (`Graph3DView.ts`) before |
|---|---|---|
| Single delete | Selected the parent, or the first non-root node when the parent was the root. Did not pan. | `planStructural` picked the parent (or the note core) and the reload only **focused** it (`setFocusId`): no selection border. |
| Multi-delete | First surviving parent among the selected nodes' parents, else the first node. | Cleared the selection, then focused the primary's parent (or the note core), skipping if the primary was not a line. |
| Save | `stopEditing(true)` stores `pendingSelectionRangeStart`; `render()` re-selects the node there. So a changed save already selected the node, new or not. An unchanged save leaves the selection as it was (still the edited node unless the user clicked elsewhere). | Focus moved to the edited line (`place`), but the selection did not follow: nothing was selected after a save unless it already was. |

**So 2D needed only the delete rule; 3D needed both.**

**Cause (3D).** The reload (`Graph3DView.place`) set the *focus* to the line an edit landed on, and the scene's selection is a separate set. A delete cleared it and a save never put anything into it.

**What was built.**

- Pure `selectAfterDelete(root, deletedIds)` in `src/select-after-delete.ts` (no `obsidian`, shared by both views): previous sibling of the first deleted node in document (pre-order) order, else its parent, else `null` when that parent is the tree root. Ignores the root's own id and unknown ids; never returns a deleted node.
- 3D delete: `planStructural("delete")` and `deleteSelection` use it. A new `selectLanded` flag (set when the write lands, consumed in `place`) makes the reload `scene.select([id])` the line `edited[0]` names (or `selectAfter`, the note core). The camera tracking is the existing focus-based B1 re-settle, since `place` still sets the focus to the same id.
- 3D save: `finishEdit` (the one place every editor close ends: blur, Ctrl/Cmd+Enter, check button, a click on the canvas, leaving edit mode, switching to 2D) selects the edited node at once, and `saveEdit` -> `commitEdit(..., select = true)` sets `selectLanded` so the reload selects the node under its new ID. Cancel (Escape, the x button) selects nothing.
- 2D delete: `deleteNode` and `deleteSelectedNodes` compute `selectAfterDelete` on the parse tree before the write and select it after (`selectNodeAfterDelete`).

**Decisions worth remembering**

- **Deleted line with nothing before it under the root.** 3D selects the note core (as before). 2D cannot select the root (it is never rendered or navigable), so it keeps its old fallback: the first non-root node.
- **A deleted sole-H1 root.** 3D still skips it in delete, as before. In the pure function it is an ordinary top-level node, so it returns `null`.
- **Multi-delete across notes (3D)** anchors on the primary's note (the first selected plate); if the primary is not a line, the first note written. Previously a non-line primary selected nothing.
- **2D still does not pan** to the new selection (the existing comment says a delete must leave the viewport where it was). The previous sibling or parent is next to the deleted node, so it is normally in view.
- **Save selects after a click elsewhere too.** If a save is triggered by clicking another plate, the click selects that plate first, and the reload then selects the saved node (same as 2D, and as the 3D reload already moved the focus to the edited line). Not special-cased.
- **Unchanged save** (3D) selects the node straight away; no write happens. 2D leaves the selection alone in that case.
- **Undo after a delete** is not special-cased in either view. 3D: `step()` sets only `edited`, so the previous sibling or parent stays selected and the restored lines come back unselected. 2D: the selection stays on the node that was selected when undo ran, if it still exists. (Read from code, not observed.)
- The brief named the multi-delete's current behaviour as "parent selected, skip a sole-H1 root". The skip is unchanged.

**Where the shared commit path is (for B4, Enter = save)**

- 3D: `Graph3DEditor.close(true)` (`src/views/Graph3DEdit.ts`) calls the request's `done`, which is `Graph3DView.finishEdit`; it selects the node, then `saveEdit` -> `commitEdit` -> `commitLines`. Any new Enter-to-save binding only has to call `editor.close(true)` (as `onSubmit` does, deferred with `queueMicrotask`) and it gets selection for free.
- 2D: `MindMapView.stopEditing(save)`; every commit goes through it and re-selects by `pendingSelectionRangeStart`.

## Surface map

| File | Change |
|---|---|
| `src/select-after-delete.ts` | New: `selectAfterDelete` |
| `src/select-after-delete.test.ts` | New: 11 tests (previous sibling, first child to parent, multi-delete anchor, deleted parent and child, root and unknown ids, sole H1) |
| `src/graph3d/edit.ts`, `edit.test.ts` | `planStructural("delete")` selects the previous sibling, else the parent |
| `src/views/Graph3DView.ts` | `selectLanded`; `deleteSelection` anchor; `finishEdit`/`saveEdit`/`commitEdit` select; `place` selects |
| `src/views/MindMapView.ts` | `deleteNode`, `deleteSelectedNodes`, `treeRootOf`, `selectNodeAfterDelete` |
| `e2e/fixtures/graph3d/Dock Chores.md`, `vault/tests/graph3d/Dock Chores.md` | New fixture |

## Test fixture

`vault/tests/graph3d/Dock Chores.md` (reload Obsidian, Ctrl+R, before testing). Outline: H1 "Dock Chores" > Coil the lines, Rinse the deck (> Hose down the cockpit, Scrub the teak, Dry the cushions), Check the fenders, Log the hours, Stow the sails.

## Manual test steps (2D and 3D; for 3D open the note in the 3D graph at depth 0 and turn edit mode on)

1. **Single delete, middle sibling:** select "Check the fenders", press Delete. Expect "Rinse the deck" selected (not its last child). Undo (Ctrl+Z) and note what is selected (expected: "Rinse the deck" stays selected; the restored line is not).
2. **Single delete, first child:** select "Hose down the cockpit", Delete. Expect "Rinse the deck" selected. Also try the right-click "Delete".
3. **Multi-delete:** select "Log the hours" and "Scrub the teak" (Shift+click in 3D, Ctrl/Shift in 2D), Delete. Anchor is the first in document order, "Scrub the teak", so expect "Hose down the cockpit" selected. Repeat with "Check the fenders" + "Rinse the deck" (parent and child anchor on the parent): expect "Coil the lines". In 3D also use the right-click "Delete N selected lines".
4. **First line under the H1:** delete "Coil the lines". Expect the H1 "Dock Chores" selected (it is its parent), in both views. The no-sibling-no-parent case (a top-level line in a note with no sole H1, 3D: the note core; 2D: the first node) needs a note without an H1 and is covered only by the unit tests.
5. **New node then commit:** select "Check the fenders", press Enter (sibling) in 3D or 2D, type text, then commit (click away, Ctrl/Cmd+Enter or the check button). Expect the new node selected with the border, and in 3D the camera following it.
6. **Existing node then commit:** F2 / double-click a node, change the text, commit. Expect it to stay selected. Escape instead: nothing changes.
7. 3D only: after steps 1 to 3 the camera glides to the newly selected plate.

Reset the fixture from `e2e/fixtures/graph3d/Dock Chores.md` between runs, and reload Obsidian before testing it again.

## What I could not verify

Everything in Obsidian: that the reload selects the right plate once the new ID exists (`lineNodeAt` by start offset), the camera tracking after a delete, 2D's undo behaviour, and the 2D "no previous sibling" fallback on screen. The `selectAfterDelete` unit tests and `planStructural` tests pass; the view wiring is untested.
