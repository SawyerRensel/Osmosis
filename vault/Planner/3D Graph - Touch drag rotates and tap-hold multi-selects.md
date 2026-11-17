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
status: Done
priority:
progress:
date_created: "2026-11-12T11:52:00.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-12T12:08:17.000Z"
date_start_actual: "2026-11-12T12:08:17.000Z"
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

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

Code commit: `78b118f` on `fix/3d-touch-drag-multiselect`.

### The cause

`gestureFor` (`src/pointer-gesture.ts`) returned `"link"` for every touch press in edit mode, so a finger that landed on a line started a `LinkDrag` instead of an orbit. The long press (500 ms) then opened the node's context menu, with "Open link" first (`cae29c1`).

### The fix

- **Touch never links.** `gestureFor` returns `"orbit"` for touch whatever the mode, so a finger drag from a node orbits, pivots or grabs a Planets surface exactly as in reading mode. Mouse and pen are unchanged: Alt+drag from a line in edit mode still links.
- **Tap-hold multi-selects, mirroring 2D** (`MindMapView` touch selection mode). A finger held still for 400 ms on any plate (2D uses 400 ms, and 3D's old 500 ms is gone) in reading or edit mode does the following: it adds the plate to the selection (`heldInto`: a hold on an already-selected plate leaves it in, as 2D does), makes it the primary, turns `touchSelecting` on and buzzes (`navigator.vibrate(50)`, as 2D does). The release is no tap and the finger no longer orbits. While the mode is on, a tap on a plate toggles it like Shift+click (`tapToggles`), with no flight and no double-tap. A tap on empty space ends the mode and clears the selection, as a plain tap always did. The mode also ends when the last plate is toggled out, or on `clearSelection` (Escape). A hold on empty space does nothing (2D starts its timer only on a node).
- **The long-press menu is gone on touch.** The toolbar's ⋮ (`openNodeMenu`) passes `menuLinks(node)` on touch devices (`hasTouch()`). These are the links written in the primary line's text (`textLinks`: wikilinks, Markdown links and bare URLs; embeds, images and inline code skipped; deduped; capped at `MENU_LINKS_MAX` = 5). They are listed first as "Open link "…"" items (`openLinkTitle`), then a separator and the usual plate menu. Each item calls `followLink(link, "follow" | "external")`, the same path the old long-press item used. Right-click on desktop is unchanged and gets no link items.
- The Touch group of the in-view help and `docs/mind-mapping/graph-3d.md` now describe the hold, the ⋮ links and the fact that a finger drag orbits in edit mode too.

### Decisions worth remembering

- **Pen is treated like a mouse.** It keeps Alt+drag-to-link, since a pen is precise and has no hold-select path of its own. Only `pointerType === "touch"` is gated.
- **Links come from the line's Markdown, not the panel DOM.** The ⋮ menu works for a selected plate that has no live near-tier panel. A note, tag or file node has no link items.
- **⋮ link items appear on any touch-capable device** (`hasTouch()`, the joystick rule), including a touchscreen laptop. That is harmless, and it matches where the joysticks show.
- **No 2D change.** 2D renders clickable links in nodes, and `handleTouchTap` already follows a link on a plain tap. A long press there is selection or drag, never a menu, so 2D has no stranded "Open link". The ⋮ link items are 3D only.
- The `LinkDrag.touch` field and the touch branch of `dropTarget` remain. They are now always false or unreached, and were left in place for the toolbar "Add link" ticket.

### For "Toolbar - Add link button for touch"

The drop menu's "Add link" calls `Graph3DView.linkLines(from: GraphNode, to: GraphNode): Promise<void>` (private, `src/views/Graph3DView.ts` ~line 1033). It appends a link to `to` at the end of `from`'s line, stamping a block ID on `to` if needed, with one undo step. For a dragged multi-selection it calls `linkSelection(group: readonly GraphNode[], to: GraphNode)`. Both bail out on `editBlocked()`. `showDropMenu(from, to, x, y)` is the menu that chooses between them and also offers the move choices.

### Surface map

| File | Change |
|---|---|
| `src/pointer-gesture.ts` (+test) | Touch always `orbit`; docs |
| `src/graph3d/selection.ts` (+test) | `heldInto`, `tapToggles` |
| `src/graph3d/links.ts` (+test) | `textLinks`, `TextLink`, `MENU_LINKS_MAX`; `openLinkTitle` doc |
| `src/views/Graph3DScene.ts` | Hold on any plate selects (400 ms, vibrate); `touchSelecting` mode in `click()`; touch long-press menu and link-drag long press removed; `onContextMenu` loses its `link` argument |
| `src/views/Graph3DView.ts` | `menuLinks`; `showNodeMenu(..., links[])`; ⋮ passes links on touch |
| `src/views/Graph3DNear.ts` | `PanelLink.text` doc |
| `src/graph3d/controls-help.ts`, `docs/mind-mapping/graph-3d.md` | Touch controls |

### Fixture

Existing: `vault/tests/graph3d/Harbour Links.md` (heading, block, note, external, unresolved and file links) and `Sailing Basics.md`.

### Not verified

Nothing was run in Obsidian or on a phone. Not verified: whether `navigator.vibrate` buzzes in Obsidian's mobile WebView (iOS has no vibrate, and the call is a no-op there), whether 400 ms feels the same as 2D, and whether the ⋮ menu shows at the button on iOS. Also unverified: `docs/reference/mobile.md` and `docs/mind-mapping/index.md` say a 2D long-press opens a context menu, but the 2D code reads as hold-to-select. That was not checked and not changed, since it is out of scope.
