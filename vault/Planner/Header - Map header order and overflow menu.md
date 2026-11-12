---
title: Header - Map header order and overflow menu
summary: "2D and 3D headers become [Note] [2D | 3D pill] [Study] [Edit] [⋯]; Style, Pin, Peek and Follow move into the ⋯ pane menu; the ribbon's Map properties brush goes."
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
  - "[[Graph - Shared header for 2D and 3D]]"
  - "[[Header - Note header gateway and overflow menu]]"
  - "[[3D Graph - Settings in the style sidebar]]"
  - "[[3D Graph - Shared toolbar ribbon]]"
status: To-Do
priority:
progress:
date_created: "2026-11-12T12:00:00.000Z"
date_modified: "2026-11-12T12:00:00.000Z"
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
  - "[[Graph - Shared header for 2D and 3D]]"
cover:
color:
pull_request:
---

# Optimization

## What tool or process needs improvement?

The 2D mind map and 3D graph view headers. Since [[Graph - Shared header for 2D and 3D]] they share an order, but they still carry seven icons in 2D (`pill, Note view, Reading, Style, Study, Pin, Peek`) and six in 3D (`… Follow`). On a phone that is crowded, and the view-specific extras shift the row between 2D and 3D.

## What's slow or frustrating about it?

Too many header icons, Reading sits left of Study (Sawyer wants it right of Study), and Style exists twice (header 🖌 and the ribbon's "Map properties" 🖌).

## What would "better" look like?

Both map views show exactly, in this order:

`[📄 Note view] [2D | 3D pill] [Study] [Reading/Edit] [⋯]`

Everything else lives in Obsidian's ⋯ pane menu.

## Decisions (settled with Sawyer, 2026-11-12 UI feedback grilling; not to be re-decided)

- Header order above, identical in 2D and 3D. Note view is a **separate icon button left of the pill**; the pill stays **2D | 3D only** ("the 2D/3D feel like a toggle between mind maps").
- Reading/Edit moves to the **right of Study**.
- **⋯ menu** (override `onPaneMenu` on both views, add items before Obsidian's defaults):
  - Style (both views) — opens the style sidebar, same as the header 🖌 did.
  - Pin, Peek — 2D only. Follow — 3D only. Show checked state where the item is a toggle (`setChecked`).
- **Style lives only in ⋯.** Remove the ribbon's `open-properties` (🖌 "Map properties") button from `TOOLBAR_GROUPS`. Keep its command (`mindmap-open-properties`) registered so hotkeys still work — check whether the command is derived from the ribbon entry; if so, register it separately.
- The note header is a separate ticket: [[Header - Note header gateway and overflow menu]].

## Code facts (scout, 2026-11-12 — spot-check line numbers)

- Order lives in `src/view-header.ts`: `SHARED_HEADER = ["switch","note-view","reading","style","study"]`, `HEADER_EXTRAS = { "2d": ["pin","peek"], "3d": ["follow"] }`. `arrangeViewHeader()` in `src/views/ViewHeader.ts:29` reorders `addAction` elements; `createViewSwitch` (`ViewHeader.ts:5`) builds the pill.
- 2D actions: `src/views/MindMapView.ts:1964-2010`. Pin at ~`:770`, Peek `toggleSpatialPeek` ~`:1112`, Style `activatePropertiesSidebar()`.
- 3D actions: `src/views/Graph3DView.ts:425-438`. Follow ~`:651`.
- Neither view overrides `onPaneMenu` today.
- Ribbon: `TOOLBAR_GROUPS` in `src/views/ToolRibbon.ts:56`, group 9 holds `refresh` + `open-properties`. Commands `mindmap-<id>` are registered from ribbon entries at `main.ts:335`.

## Context budget

`MindMapView.ts` is ~338 KB (~84k tokens) and contains NUL bytes — **never read it whole**; use `grep -a -n` and read line ranges. `Graph3DView.ts` is ~30k tokens; read ranges too.

## Acceptance criteria

- 2D and 3D headers show exactly `[Note view] [2D | 3D] [Study] [Reading/Edit] [⋯]`, same positions in both.
- ⋯ in 2D has Style, Pin, Peek; ⋯ in 3D has Style, Follow; toggles show their state and work.
- The ribbon no longer shows a 🖌 button; the Style command still works from the palette.
- Header still fits on a phone without overflow.

## Test plan

Unit: update the `view-header.ts` tests for the new `SHARED_HEADER` order and empty header extras (extras now feed the pane menu — consider moving the per-view menu list into the same pure module and testing it).

Manual (Ctrl+R after build):
1. Open any note in 2D, then 3D: same five header items, same positions; pill switches views.
2. ⋯ in 2D: Style opens the sidebar; Pin and Peek toggle and show checked state. ⋯ in 3D: Style, Follow.
3. Ribbon has no brush; palette "Map properties" still opens the sidebar.
4. Phone: header fits.

## Out of scope

- Note header (separate ticket). Study button behaviour in 2D/3D is unchanged.
