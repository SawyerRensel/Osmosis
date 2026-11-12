---
title: Header - Note header gateway and overflow menu
summary: "The note header becomes [🧠] [Study] [Edit] [⋯]: the brain opens the last-used map view (2D or 3D) and Peek moves into the ⋯ menu."
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
  - "[[Header - Map header order and overflow menu]]"
  - "[[Study - Note view study menu]]"
  - "[[Graph - Shared header for 2D and 3D]]"
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
cover:
color:
pull_request:
---

# Optimization

## What tool or process needs improvement?

The header of a plain markdown note, where Osmosis injects its own buttons.

## What's slow or frustrating about it?

Today it shows Peek, 🧠 Mind map view, Study, then Obsidian's reading toggle and ⋯. The 🧠 always opens 2D, even if Sawyer lives in 3D, and Peek adds clutter.

## What would "better" look like?

`[🧠] [Study] [Edit] [⋯]` — matching the map headers' right-hand half ([[Header - Map header order and overflow menu]]).

## Decisions (settled with Sawyer, 2026-11-12 UI feedback grilling; not to be re-decided)

- 🧠 stays an **icon button, not a pill**. "The brain circuit is the gateway from the note to mind mapping view."
- 🧠 opens the **last-used map view** (2D or 3D), remembered **per device** (localStorage, like `osmosis-graph3d-sticks`). Update the memory whenever a leaf becomes a 2D or 3D map view (including via the pill), not only from this button.
- Peek moves into the note's **⋯ menu** (shown only when the note has cards, as the button is today). Hook it via the `file-menu` event with `source === "more-options"` or the markdown view's pane menu — pick whichever puts it near the top.
- Study stays in the header right of 🧠; [[Study - Note view study menu]] changes what it does.
- "Edit" is Obsidian's own reading/editing toggle; we only ensure our buttons sit to its left in the order above.

## Code facts (scout, 2026-11-12 — spot-check line numbers)

- Osmosis injects into `.view-actions` directly (not `addAction`): `addMindMapActionToMarkdownLeaves` at `main.ts:960` adds `.osmosis-mindmap-action` (`brain-circuit`).
- Study + Peek buttons: `LineRevealProcessor.updateHeaderActions` (`src/views/LineRevealProcessor.ts:727-799`); shown only when the note has cards; anchored right of the 🧠.
- View swapping: `plugin.swapLeafView` (`main.ts`); 3D toggle command `mindmap-toggle-3d` (`main.ts:350`).
- File menu already adds "Mind map view", "3D graph", "Generate flashcards" (`main.ts:431`).

## Context budget

Small: `main.ts` (~16k tokens) and `LineRevealProcessor.ts` (~10k) — read ranges. No need to open `MindMapView.ts`.

## Acceptance criteria

- Note header shows `[🧠] [Study] [Edit] [⋯]` (Study only when the note has cards, as now).
- 🧠 opens 3D if the last map view used on this device was 3D, else 2D; survives an app restart.
- Peek is in ⋯ for notes with cards and works as before; the header Peek button is gone.

## Test plan

Unit: if the last-used logic is non-trivial, put it in a pure helper and test it.

Manual (Ctrl+R after build):
1. Open a note with cards: header is 🧠, Study, Edit, ⋯.
2. Tap 🧠 → 2D. Switch to 3D with the pill. Go back to the note (📄). Tap 🧠 → opens 3D. Restart Obsidian, repeat → still 3D.
3. ⋯ → Peek starts peek mode; a note without cards has no Peek item.
