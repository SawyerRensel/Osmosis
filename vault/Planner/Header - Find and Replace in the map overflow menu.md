---
title: "Header - Find and Replace in the map overflow menu"
summary: "Add Find and Replace items to the header ⋯ menu of the 2D and 3D mind map views; they open the existing find bar."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Header - Map header order and overflow menu]]"
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

# Header - Find and Replace in the map overflow menu (T69)

## Request (Sawyer, 2026-11-12, verbatim)
> Let's add "Find" and "Replace" as buttons in the header ellipse menu in 2D and 3D mind map views.

## What exists
- Both views already have the shared find bar `src/views/FindBar.ts` (Ctrl/Cmd+F), with a query row and an always-visible Replace row (Replace / Replace all). 2D: `MindMapView.findBar` (grep -a `findBar`). 3D: `Graph3DView.findBar` (`:148`, `:447`).
- The ⋯ menus came from T54 (2D: Style, Pin, Peek; 3D: Style, Follow, Walk and fly joysticks, Controls help).

## Design
- **Find** item (icon `search`): opens the find bar and focuses the query box (same as Ctrl+F).
- **Replace** item (icon `replace`): opens the find bar and focuses the Replace box. Add a small `FindBar` method for that if none exists. If replace is blocked (`replaceBlocked()`: reading mode, study session), still open the bar; the bar already explains why.
- Put both near the top of the ⋯ menu, in a group of their own; same order in 2D and 3D.

## Acceptance criteria
- 2D and 3D, desktop and phone: ⋯ → Find opens the bar with the query focused; ⋯ → Replace opens it with the Replace box focused.
- Ctrl+F unchanged.

## Context budget
Under ~100k. FindBar.ts whole; grep the ⋯ menu builders (`addItem`, `Menu`) in MindMapView.ts (grep -a) and Graph3DView.ts and read by range.

## Conventions
- Batch ticket (round 9). Follow `batch/subagent-brief.md`: own branch stacked on the previous ticket, code commit by path + separate note commit, `status: In-Review`, "Batch implementation notes (awaiting manual test)" section with phone/desktop retest steps. No push, no PR.
- Keys in map views need the view `Scope` (memory: mind map keys need the view Scope). Toolbar buttons come from `TOOLBAR_GROUPS` in `src/views/ToolRibbon.ts`.
- Pure logic goes in modules outside `src/views/` so Vitest can import it (Vitest cannot import `obsidian`).
- `src/views/MindMapView.ts` is ~84k tokens with NUL bytes: never read it whole, use `grep -a -n` and read ranges. Graph3DScene.ts (~37k), Graph3DView.ts (~30k), styles.css (~33k): ranges only.
