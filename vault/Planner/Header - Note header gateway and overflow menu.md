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
status: In-Review
priority:
progress:
date_created: "2026-11-12T12:00:00.000Z"
date_modified: "2026-11-12T12:00:00.000Z"
date_start_scheduled: "2026-11-12T05:18:04.000Z"
date_start_actual: "2026-11-12T05:18:04.000Z"
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

## Batch implementation notes (awaiting manual test)

**Approach.**
- *Last-used memory.* `src/last-map-view.ts` (pure, tested) holds the key `osmosis-last-map-view` and `cleanLastMapView` (only the string `"3d"` means 3D; anything else is 2D). `main.ts` reads and writes it with `app.loadLocalStorage` / `saveLocalStorage` (vault-scoped, per device, so it survives a restart; the same mechanism as `osmosis-graph3d-sticks`). It is written from two places: `swapLeafView` (the 2D | 3D pill) and `rememberActiveMapView()`, called on `active-leaf-change` and `layout-change`, which records whichever map view is the active view (tab clicks, file-menu opens, a restored workspace). The write is skipped when the value is unchanged.
- *Brain button.* The click handler in `addMindMapActionToMarkdownLeaves` opens `VIEW_TYPE_GRAPH3D` with `{ focus: path }` or `VIEW_TYPE_MINDMAP` with `{ file: path }` in the same leaf, depending on the memory. It stays an icon button; its position is unchanged (leftmost, or before the reading toggle).
- *Study.* Click behaviour untouched. The header Peek button is no longer created, and `updateHeaderActions` removes a stale `.osmosis-line-peek-action` left by an older build. Study is still anchored right of the brain, so the order is brain, Study, Edit, then Obsidian's own ⋯.
- *Peek in the ⋯ menu.* The note view is not an Osmosis view, so there is no `onPaneMenu` to override. A second `file-menu` handler (registered ahead of the "Mind map view" one) checks `source === "more-options"`, a markdown file, a `MarkdownView` in the passed `leaf`, and `lineReveal.hasCards(path)`; it adds "Peek mode" with `setSection("pane")` and a check mark from `isPeeking`. `peekNote(view)` is the old button's click logic (switch to reading view first, then toggle peek). I chose `file-menu` over `view.onPaneMenu` monkey-patching because it is the public API, the same route the existing Rapid flashcard mode entry uses, and it fires on desktop and mobile.

**Decisions worth remembering**
- Peek uses `setSection("pane")` (the group holding Rapid flashcard mode and Source mode) as the best available way to sit near the top; the order inside the section follows registration order, and the Peek handler is registered before the others in `main.ts`. Obsidian's own entries may still sit above it. This was not seen on screen.
- The map memory records "last map view that was active", not only "last pill press", so opening the 3D graph from the file menu also counts. A restored workspace whose active tab is a 2D map will also set it to 2D.
- The peek header button's `is-active` state is gone; the menu check mark replaces it.
- Docs updated: `docs/reference/commands.md` (note header row), `docs/studying/study-modes.md` (Peek is in the menu).

| File | Change |
|---|---|
| `src/last-map-view.ts` (+test) | New: storage key and `cleanLastMapView` |
| `src/main.ts` | Brain opens the last-used view; `lastMapView` / `rememberMapView` / `rememberActiveMapView`; recorded on swap, `active-leaf-change`, `layout-change`; Peek `file-menu` entry |
| `src/views/LineRevealProcessor.ts` | Header Peek button removed (stale one cleaned up); public `hasCards`, `isPeeking`, `peekNote` |
| `docs/reference/commands.md`, `docs/studying/study-modes.md` | Wording |

**Fixture.** None new; any note with cards, e.g. one under `vault/tests/` (and one without cards for the Peek-absent check).

**Not verified (cannot see Obsidian).** That the Peek item lands near the top of the ⋯ menu; that Obsidian passes the leaf as the fourth `file-menu` argument for `more-options` in the version in use (if not, Peek would silently be missing; the existing Rapid entry does not need the leaf); that `layout-change` / `active-leaf-change` fire in time to record a pill swap (the explicit write in `swapLeafView` covers it anyway); the header order on a phone.
