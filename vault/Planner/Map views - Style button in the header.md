---
title: Map views - Style button in the header
summary: "T135. The Style (paintbrush) button moves out of the ⋯ menu into the mind map and Cosmos headers, leftmost, left of the Note view button."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Map views - Layout per note replaces 2D-3D]]"
status: To-Do
batch: 18
priority:
progress:
date_created: 2026-11-28T03:39:06.000Z
date_modified: 2026-11-28T03:39:06.000Z
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
# Map views - Style button in the header (T135)

## Settled at intake (don't re-ask)
- The paintbrush **Style** button (it calls `plugin.activatePropertiesSidebar()`) becomes a header action in **both** the mind map and Cosmos views.
- It is placed **all the way to the left, left of the Note view button**.
- It is removed from the ⋯ pane menu (`PANE_MENU` in `src/view-header.ts:41-57`, both the 2D and 3D lists). The rest of the ⋯ menu is unchanged.
- Use the same icon and label the menu item uses today.

## Today
- `PANE_MENU` (`src/view-header.ts:41-57`): 2D has Find, Replace | Style, Pin, Peek; 3D has Find, Replace | Style, Follow, Sticks, Help. `addPaneMenuItems` is in `src/views/ViewHeader.ts:55` and is called from `onPaneMenu` (MindMapView.ts:730-738, CosmosView.ts:362-371).
- Header actions are made with `addAction`: Cosmos at CosmosView.ts:440-448 (note view, pencil, cap); the mind map at MindMapView.ts:2169-2196 (reading toggle, note view, cap, 2D/3D switch).
- `arrangeViewHeader` (`src/views/ViewHeader.ts`) orders them by `SHARED_HEADER`: note-view, the 2D|3D pill, study, reading/edit, ⋯. Add `style` first.
- T138 later removes the 2D|3D pill from this same header. Don't touch the pill here.

## Context budget (~25k)
- `src/view-header.ts` (whole, 70 lines) and `src/views/ViewHeader.ts` (whole, 66 lines).
- `src/views/MindMapView.ts` (use `grep -a`; NUL bytes): L725–740 and L2165–2200 only.
- `src/views/CosmosView.ts` L355–375 and L435–450.
- Any test of `view-header.ts` (`grep -l PANE_MENU src`).

## Acceptance criteria
- Both headers show the paintbrush as the leftmost action, and clicking it opens or reveals the style sidebar.
- The ⋯ menu no longer lists Style in either view.
- Header order unit test (if `SHARED_HEADER` has one) is updated. lint, test and build pass.

## Test plan
1. Open any note in the mind map: the paintbrush is leftmost, left of Note view. Click it: the style sidebar opens. The ⋯ menu has no Style.
2. Switch to Cosmos: the same.
