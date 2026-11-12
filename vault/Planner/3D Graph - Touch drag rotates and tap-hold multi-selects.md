---
title: "3D Graph - Touch drag rotates and tap-hold multi-selects"
summary: "On touch, a one-finger drag starting on a node in 3D edit mode rotates instead of drawing a link line; tap-hold multi-selects nodes (as in 2D); Open link moves from the long-press menu to the node menu (⋮)."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[3D Graph - Tap-drag opens a link instead of rotating]]"
  - "[[Toolbar - Add link button for touch]]"
status: To-Do
priority:
progress:
date_created: "2026-11-12T11:52:00.000Z"
date_modified: "2026-11-12T11:52:00.000Z"
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

# Bug Report

## Sawyer's feedback (round 8 retest, 2026-11-12)

> When in 3d mind map edit mode (but not editing a node) tap-drag on a node is still activating the "draw link" line instead of rotating the view as it should. Link lines on mobile should only trigger from a new "Add link" button in the mobile toolbar menu.

> Tap-hold on touchscreens should activate multi-node select in both 2D and 3D mind map views. (2D already does this).

## What to build (touch only; desktop mouse unchanged)
1. **3D edit mode, touch:** a one-finger drag that starts on a node rotates or orbits (Planets: grabs the surface) exactly as it does in reading mode. It never draws a link line. Find the edit-mode drag-to-link code in `Graph3DScene.ts` / `Graph3DView.ts` (grep `link`, `connect`, `drawLink`, `pendingLink`, `editMode`) and gate it on non-touch pointers (`pointerType !== "touch"`; also pen? decide and record). Desktop mouse drag-to-link stays.
2. **3D tap-hold = multi-select**, matching 2D's behaviour. Read how 2D does it first (`MindMapView.ts` is **~84k tokens with NUL bytes**: `grep -a -n "long\|hold\|multi\|selected"`, small ranges) and mirror the feel: hold duration, haptic or visual cue, toggling a node in or out of the selection, what a later plain tap does. Check what multi-selection 3D already supports (desktop Ctrl/Shift-click?) and reuse it. Tap-hold on empty space does nothing (or what 2D does; mirror 2D).
3. **The long-press menu is gone on touch**, since tap-hold now selects. Today a long-press opens the node menu with "Open link …" first (commit `cae29c1`, see the linked note). Move "Open link "…"" into the **⋮ node menu** (toolbar button `node-menu`) on touch, one item per link in the selected node's text (cap at ~5; label as `openLinkTitle` does). Desktop right-click menu stays as it is.
4. Update the 3D help's Touch group (`Graph3DHelp`) and `docs/` for the new gestures.

Keep pure decisions (e.g. what a touch press on a node in edit mode becomes) in `src/graph3d/` with unit tests.

## Context budget
Under ~130k tokens. Read `Graph3DScene.ts` (~37k) and `Graph3DView.ts` (~30k) by range.

## Acceptance criteria (phone, 3D, `vault/tests/graph3d/Sailing Basics.md` and `Harbour Links.md`)
- Edit mode: dragging from a node rotates; no link line ever appears from a touch drag.
- Tap-hold a node → it joins the multi-selection; tap-hold another → both selected; behaves like 2D.
- ⋮ with a node that has links lists "Open link "…"" items that work.
- Desktop: drag-to-link and right-click menu unchanged.
