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
status: Done
priority:
progress:
date_created: "2026-11-12T17:00:00.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-12T16:25:59.000Z"
date_start_actual: "2026-11-12T16:25:59.000Z"
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

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

Branch `feature/header-find-replace`, code commit b55cc94.

### Approach
`PANE_MENU` (`src/view-header.ts`) gained `find` and `replace` entries at the top of both views' lists, so the order is the same in 2D and 3D. Entries now carry a `group`; `addPaneMenuItems` puts a separator wherever the group changes among the entries a view actually supplies, so Find and Replace form their own group above Style and the rest. `FindBar.open()` takes `"query" | "replace"` (default `"query"`, so Ctrl+F is untouched) and focuses and selects that box. Each view has a small `openFind(focus)` that the menu handlers call.

### Decisions worth remembering
- **Deferred a tick** (`window.setTimeout(..., 0)`): the menu closes after the click handler, and on a phone closing it can hand focus back to the view, which would steal it from the box. The same guards as Ctrl+F apply when the timer fires (2D: not while a node is being edited; 3D: not while the editor is open). `window.setTimeout` rather than `activeWindow` because the lint rule `prefer-window-timers` demands it.
- **Replace while blocked** (reading mode, study session): the bar still opens and the Replace box takes focus; the bar's own scope line explains why the buttons are disabled. No special casing in the menu.
- **No keyboard shortcut hints** in the menu; Ctrl+F stays the only key.

### Surface map
| File | Change |
|---|---|
| `src/view-header.ts` | `find`/`replace` ids, `group` field, Find and Replace first in both `PANE_MENU` lists |
| `src/view-header.test.ts` | New order, Find/Replace-first-in-own-group test, toggle expectation |
| `src/views/ViewHeader.ts` | Separator between groups in `addPaneMenuItems` |
| `src/views/FindBar.ts` | `open(focus)` |
| `src/views/MindMapView.ts` | `openFind`, `find`/`replace` handlers in `onPaneMenu` |
| `src/views/Graph3DView.ts` | Same |

### Fixture
None new; any map works (e.g. `vault/tests/graph3d/` sailing notes in 3D, any mind map note in 2D).

### Not verified
Cannot see Obsidian: the phone focus/keyboard behaviour (the deferred focus) is untested. Lint, 3188 unit tests and build pass.

### Manual retest
Desktop and phone, in 2D and in 3D (switch with the 2D | 3D pill):
1. Open a map, tap the header ⋯. Expect Find, Replace, a separator, then Style/Pin/Peek (2D) or Style/Follow/(Walk and fly joysticks on touch)/Controls help (3D), then Obsidian's entries.
2. Find: the find bar opens, the query box is focused (keyboard appears on phone).
3. Close the bar, ⋯ then Replace: bar opens with the Replace box focused.
4. In reading mode, ⋯ then Replace: bar still opens; the line under it says why replacing is blocked.
5. Ctrl+F still opens the bar with the query selected.
