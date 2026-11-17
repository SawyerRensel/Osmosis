---
title: "Mind Map - Shift+Enter adds a sibling above"
summary: "With a node selected (not editing), Shift+Enter inserts a sibling before it in 2D and 3D; Enter keeps adding after."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Toolbar - Mind map toolbar sizing, buttons and icons]]"
status: Done
priority:
progress:
date_created: "2026-11-12T17:00:00.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-12T16:32:47.000Z"
date_start_actual: "2026-11-12T16:32:47.000Z"
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

# Mind Map - Shift+Enter adds a sibling above (T71)

## Request (Sawyer, 2026-11-12, verbatim)
> Shift enter when a node is selected in 2d/3d mind map view should add a sibling above the selected node instead of below.

## Design
- Applies only with a node selected and **not** editing. Inside the node editor Shift+Enter still inserts a newline (`MindMapView.ts:~7131`, `enterSavesEdit`) — don't touch that.
- 3D: `Graph3DView.ts:312` registers Enter → `structuralKey("sibling")`; add `["Shift"], "Enter"` → a "sibling before" action. 2D: grep -a `case "Enter"` (~6632) and the Scope registrations (~550).
- Reuse the existing create-sibling write path with an insert-before position (look at `src/graph3d/edit.ts` and the 2D create code). Same result in both views: the new node becomes the previous sibling, selected and in edit mode, exactly like Enter does for after.
- Root node: Shift+Enter does what Enter does on the root today (likely nothing or a child) — keep consistent, record it.
- Update the controls help text (`src/graph3d/controls-help.ts`) and docs keyboard reference if it lists Enter.

## Acceptance criteria
- 2D and 3D: select a middle sibling, Shift+Enter → new sibling appears above it and opens for editing; Enter still adds below. Undo removes it in one step.
- Unit test for the pure insert-before plan.

## Context budget
Under ~120k. edit.ts, controls-help.ts whole; views by grep/range.

## Conventions
- Batch ticket (round 9). Follow `batch/subagent-brief.md`: own branch stacked on the previous ticket, code commit by path + separate note commit, `status: In-Review`, "Batch implementation notes (awaiting manual test)" section with phone/desktop retest steps. No push, no PR.
- Keys in map views need the view `Scope` (memory: mind map keys need the view Scope). Toolbar buttons come from `TOOLBAR_GROUPS` in `src/views/ToolRibbon.ts`.
- Pure logic goes in modules outside `src/views/` so Vitest can import it (Vitest cannot import `obsidian`).
- `src/views/MindMapView.ts` is ~84k tokens with NUL bytes: never read it whole, use `grep -a -n` and read ranges. Graph3DScene.ts (~37k), Graph3DView.ts (~30k), styles.css (~33k): ranges only.

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

Code commit `1758a11` on `feature/shift-enter-sibling-above`. Not pushed, no PR.

### Approach
- New pure `insertSiblingBefore(content, src)` in `src/mindmap-edit.ts`, the mirror of `insertSibling`: same placeholder rules (checkbox sibling is `[ ] `, paragraph/code/table/blockquote get a zero-width space and a blank line). It inserts at `src.range.start` (the line start, indentation included), so the new line takes the node's own type and depth.
- 3D: `StructuralAction` gains `"siblingBefore"`; `planStructural` handles it like `"sibling"` (fresh line, editor opens on it, one write through `commitLines`, so one undo step). `Graph3DView` registers `["Shift"], "Enter"` on the view Scope with the same edit-mode guard as Enter.
- 2D: `addSiblingNode(node, before = false)`; `handleKeyDown`'s `case "Enter"` passes `e.shiftKey`. Plain Enter in 2D is handled by the container `keydown`; Shift+Enter is additionally registered on the view Scope (per the "keys need the view Scope" rule) so a user hotkey on Shift+Enter cannot eat it. The Scope handler calls `handleKeyDown` only if `e.defaultPrevented` is false, so a key that reaches both paths cannot add two nodes.
- The node editor's Shift+Enter newline (`enterSavesEdit`) is untouched; the Scope handler returns undefined while `editingNodeId` is set or the find bar has focus.

### Decisions
- Root node: the virtual root has nothing above it, so `insertSiblingBefore` on a `root` node delegates to `insertSibling` (what Enter does today). In 3D a note's core never reaches `planStructural` with a parent, so it still does nothing, as with Enter.
- A paragraph needs a blank line above its placeholder or it would merge into the previous line (lazy continuation); `insertSiblingBefore` adds the lead blank line when the text before does not already end in one. `normalizeWrite` handles the rest.
- No toolbar button and no context-menu item ("Add sibling above"): the ticket asks only for the key. Easy follow-up if wanted (`TOOLBAR_GROUPS` icons exist for after only).
- Known pre-existing limitation shared with Enter: 2D `startEditingNewNode` opens the first empty node in the map, so with another empty node earlier in the map it would open that one.

### Surface map
| File | Change |
|---|---|
| `src/mindmap-edit.ts` | `insertSiblingBefore` |
| `src/graph3d/edit.ts` | `siblingBefore` action in `StructuralAction` and `planStructural` |
| `src/views/Graph3DView.ts` | Shift+Enter Scope registration |
| `src/views/MindMapView.ts` | Shift+Enter Scope registration; `addSiblingNode(node, before)`; Enter case passes `shiftKey` |
| `src/graph3d/controls-help.ts`, `docs/mind-mapping/graph-3d.md`, `docs/mind-mapping/editing.md` | key listed |
| `src/mindmap-edit.test.ts`, `src/graph3d/edit.test.ts` | unit tests (bullet, nested, checkbox, paragraph, heading under heading, root fallback, plan) |

### Fixture
`e2e/fixtures/sibling-above.md`, copied to `vault/tests/mindmap/sibling-above.md`. New file, so no reset hazard, but reload Obsidian (Ctrl+R) after the build.

### Manual test (desktop; Ctrl+R first)
1. Open `tests/mindmap/sibling-above.md` in the mind map (2D). Select "Genoa", press Shift+Enter: a new empty bullet appears between "Mainsail" and "Genoa" and opens for editing. Type "Jib", Enter. Source shows `- Mainsail`, `- Jib`, `- Genoa`.
2. Select "Genoa", press Enter: new node after Genoa's subtree (unchanged behaviour).
3. Select "Sheet" (nested) and press Shift+Enter: new nested bullet above it. Select "Sails" (heading): a new empty heading above it. Select "Halyards": a new paragraph placeholder above it.
4. While editing a node, Shift+Enter still inserts a newline.
5. Ctrl+Z after step 1 removes the new node in one step.
6. Select the root node and press Shift+Enter: same as Enter (a sibling at the end).
7. 3D: open the same note in the 3D graph, turn edit mode on, select "Genoa", Shift+Enter: new line above it with the editor open; Enter still adds below; undo removes it in one step. The "?" help lists Shift + Enter.

### Could not verify
No Obsidian here: the Scope-plus-container double-fire guard and the 2D root behaviour were reasoned from the code, not observed.
