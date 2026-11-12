---
title: "Mind Map - Ctrl+arrow keys navigate the hierarchy"
summary: "Plain arrows keep moving by screen direction; Ctrl+arrows move strictly by hierarchy (sibling, parent, first child) and Ctrl+Shift+arrows extend the multi-selection the same way. 2D and 3D."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Toolbar - Mind map toolbar sizing, buttons and icons]]"
status: To-Do
priority:
progress:
date_created: "2026-11-12T17:00:00.000Z"
date_modified: "2026-11-12T17:00:00.000Z"
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

# Mind Map - Ctrl+arrow keys navigate the hierarchy (T72)

## Request (Sawyer, 2026-11-12, verbatim)
> Navigate a mind map using the Ctrl key as a modifier to the arrow keys that strictly follows the hierarchy instead of relative to the screen … keep the default but add Ctrl as a modifier. Ctrl+Shift + arrow keys should also work to multiselect.

## Decided
- Plain arrows: unchanged (screen direction; 3D `src/graph3d/arrow-nav.ts`, 2D MindMapView ~6490).
- Ctrl (Mod on macOS? use Obsidian's `Mod` = Ctrl/Cmd) + Up/Down = previous/next sibling (stop at the ends, no wrap); Ctrl+Left = parent; Ctrl+Right = first child (or the last-visited child if such memory already exists for screen nav; otherwise first).
- **No mirroring** on the left side of a balanced 2D map (grill, 2026-11-12): Left is always parent, Right always first child, matching T63's semantic outdent/indent.
- Ctrl+Shift+arrow extends the multi-selection along the same hierarchy moves (look at how plain Shift+arrow multi-select works today, if it does; otherwise add the selected node to the selection and move the cursor).
- Alt+arrows (move/structural) unchanged. Check conflicts: Ctrl+arrow while editing text is word-jump — gate on not editing. Check whether Obsidian core or the plugin already binds Mod+arrows in these views (grep `"Mod"` registrations).
- Collapsed/hidden children: Ctrl+Right on a collapsed node — expand or do nothing? Pick what plain navigation does with collapsed nodes and record it.

## Acceptance criteria
- 2D and 3D: Ctrl+arrows walk siblings/parent/child regardless of layout direction; Ctrl+Shift+arrows grow the selection; plain arrows unchanged; editing a node's text, Ctrl+arrows jump words as before.
- Pure helper `hierarchyStep(tree, id, dir)` (or similar) with unit tests, shared by both views.
- Controls help and docs keyboard reference updated.

## Context budget
Under ~130k. arrow-nav.ts, selection.ts whole; views by grep/range.

## Conventions
- Batch ticket (round 9). Follow `batch/subagent-brief.md`: own branch stacked on the previous ticket, code commit by path + separate note commit, `status: In-Review`, "Batch implementation notes (awaiting manual test)" section with phone/desktop retest steps. No push, no PR.
- Keys in map views need the view `Scope` (memory: mind map keys need the view Scope). Toolbar buttons come from `TOOLBAR_GROUPS` in `src/views/ToolRibbon.ts`.
- Pure logic goes in modules outside `src/views/` so Vitest can import it (Vitest cannot import `obsidian`).
- `src/views/MindMapView.ts` is ~84k tokens with NUL bytes: never read it whole, use `grep -a -n` and read ranges. Graph3DScene.ts (~37k), Graph3DView.ts (~30k), styles.css (~33k): ranges only.
