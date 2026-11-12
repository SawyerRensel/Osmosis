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
