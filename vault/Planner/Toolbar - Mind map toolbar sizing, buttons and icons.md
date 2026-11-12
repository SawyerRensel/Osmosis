---
title: "Toolbar - Mind map toolbar sizing, buttons and icons"
summary: "Polish the Osmosis mobile toolbar: navbar height, eight buttons wide, even spacing, drop zoom and navbar toggle, Obsidian's move/indent icons and circle-chevron create icons; left/right become outdent/indent."
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
  - "[[Ribbon - Osmosis toolbar styled as Obsidian's mobile toolbar]]"
  - "[[Ribbon - Osmosis bar takes the mobile navbar slot in edit mode]]"
status: In-Review
priority:
progress:
date_created: "2026-11-12T11:52:00.000Z"
date_modified: "2026-11-12T11:52:00.000Z"
date_start_scheduled: "2026-11-12T12:00:46.000Z"
date_start_actual: "2026-11-12T12:00:46.000Z"
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

## Sawyer's feedback (round 8 retest, 2026-11-12)

> The mobile toolbar is looking much better. That's the style and behavior I'm going for. However, the mind map mobile toolbar is slightly smaller than the navbar on mobile. And it would be nice to make the mobile toolbar a full 8 buttons wide to match the width of the Note text editing mobile toolbar. Let's remove the zoom-in and zoom-out buttons from the mind map toolbar. Let's also audit the spacing of icons in the toolbar. They should all be evenly spaced instead the current extra space from the way we used to group them. Let's remove the navbar toggle button because that's not relevant anymore. What's the point of the ellipsis in the mobile toolbar? [Kept, see Decisions.]

> Can we come up with a more intuitive, consistent group of lucide icons for creating nodes and moving them? I get confused sometimes.

Screenshots: ![[r9-3d-phone-toolbar.png]] (our bar, phone), ![[r9-3d-keyboard-zoomout.png]] (Obsidian's own note editing toolbar above the keyboard, which is the size reference: 8 buttons across), ![[r9-create-move-icons.png]] (today's confusing create/move icons).

## Decisions (settled with Sawyer 2026-11-12, not to be re-decided)
- **Size:** match Obsidian's navbar height on phones exactly, and make the bar a full **8 buttons wide**, the same width as Obsidian's note editing toolbar. Read both from `ref/obsidian-core/app.css` (`grep -o` only; `.mobile-navbar`, `.mobile-toolbar`, `.mobile-toolbar-option`). If there are more than 8 buttons, scroll sideways as now. Use the same width on desktop for consistency, unless Obsidian's numbers only make sense on phones; record the call.
- **Even spacing:** no group gaps at all. Every button is evenly spaced, like Obsidian's toolbar. The `TOOLBAR_GROUPS` group structure can remain for commands, but must not show up as spacing.
- **Remove:** zoom-in and zoom-out buttons. Keep their commands and hotkeys: drop them from the bar, not from the command palette; check how `TOOLBAR_GROUPS` drives commands (`main.ts`) so commands survive. Also remove the **navbar toggle**: on phones in edit mode the navbar is always hidden. The `osmosis-hide-navbar-edit` pref and toggle code become dead, so remove them.
- **Keep ⋮ (node menu):** it is the only touch route to the node's menu, since tap-hold becomes multi-select (see [[3D Graph - Touch drag rotates and tap-hold multi-selects]]). Keep its icon.
- **Move icons:** use **Obsidian's own default icons** for the editor commands "Move line up" / "Move line down" (`editor:swap-line-up` / `swap-line-down`) and "Indent list" / "Unindent list" (`editor:indent-list` / `unindent-list`). Find the exact icon names Obsidian registers for those commands in `ref/obsidian-core/app.js` (grep the command ids) and use the same names.
- **Move left/right become Outdent/Indent** (tree depth, not screen side), so the icons tell the truth on both sides of a balanced map. Labels "Outdent node" / "Indent node". Check what `executeDirectionalAction("ArrowLeft")` does today in 2D (`MindMapView.ts` ~:1947) and the 3D equivalent, and wire the toolbar buttons and their commands to semantic outdent/indent. Keyboard Alt+Arrow behaviour stays as it is unless it is the same code path; record what you did. Command ids may stay (hotkeys bound to them keep working) while names change.
- **Create icons:** `circle-chevron-left` = Insert parent, `circle-chevron-down` = Add sibling, `circle-chevron-right` = Add child (Sawyer wants to try these). Verify that each exists in Obsidian's bundled lucide (`grep -c '"circle-chevron-left"' ref/obsidian-core/app.js`).
- **Order:** Sawyer didn't specify. Suggested: create ×3, move up/down, outdent/indent, then the rest as now, so the first 8 are the editing core. Record it.

## Code facts
- `src/views/ToolRibbon.ts` (`TOOLBAR_GROUPS`, `barToggles`, `navbarHidden`, `syncNavbar`, `toggleNavbarPref`), tested in `ToolRibbon.test.ts`. Commands from `TOOLBAR_GROUPS` are in `main.ts`. CSS: `styles.css` (`osmosis-toolbar`). See T61's implementation notes.
- `MindMapView.ts` is **~84k tokens with NUL bytes**: `grep -a -n`, small ranges only.
- The "Add link" button is NOT this ticket; it comes later in [[Toolbar - Add link button for touch]]. Leave room for it.

## Context budget
Under ~130k tokens. Read `styles.css` and `Graph3DView.ts` by range.

## Acceptance criteria
- Phone: the bar's height equals the navbar's, its width is 8 buttons, and the spacing is even.
- No zoom buttons, no navbar toggle. Zoom commands still exist.
- New icons. Outdent/indent buttons act on tree depth in 2D and 3D.

## Batch implementation notes (awaiting manual test)

Code: commit `f7d3f55` on `feature/toolbar-sizing-icons`. The whole ticket shipped.

### Approach
- **Size, read from `ref/obsidian-core/app.css`.** On a floating-nav phone `.mobile-navbar` is `height: var(--navbar-height)`, and `.is-mobile.is-floating-nav` sets `--navbar-height: var(--touch-size-l)` = **52 px** (the classic, non-floating navbar is 80 px including its safe-area padding, so it has no pill to match). Obsidian's editing toolbar (`.mobile-toolbar-options-list`) is `--touch-size-m` = 44 px tall, `calc(100% - var(--size-4-4))` wide on floating nav, with `.mobile-toolbar-option` at `min-width: var(--toolbar-option-width)` (40 px phone, 50 px tablet, unset on desktop) and no flex-grow. Our bar is now `--touch-size-l` tall (radius too), and its list is `8 × --osmosis-toolbar-btn-width + 2 × --size-4-1` wide. On phones the button width is `max(--toolbar-option-width, (100vw − safe-area insets − --size-4-4 − 2 × --size-4-1) / 8)`, so the eight buttons span exactly the width of Obsidian's editing toolbar. More than eight scroll sideways, as before.
- **Computed in headless Chromium** (Playwright's Chromium, DPR 2, body `theme-dark is-mobile is-phone is-android is-floating-nav`, app.css + styles.css):

  | Viewport | Obsidian navbar h | Obsidian toolbar pill w × h | Obsidian option w (visible) | Our pill w × h | Our button w (visible) |
  |---|---|---|---|---|---|
  | 412 px phone | 52 | 396 × 44 | 40 (9) | 396 × 52 | 48.5 (8) |
  | 360 px phone | 52 | 344 × 44 | 40 (8) | 344 × 52 | 42 (8) |
  | 320 px phone | 52 | 304 × 44 | 40 (7) | 304 × 52 | 40 (7, floor) |
  | desktop 1200 | none | none | unset | 392 × 52 | 48 (8) |
  | tablet 1000 | hidden | | 50 | 392 × 52 | 48 (8) |
- **Even spacing.** No divider elements at all now: buttons sit edge to edge at the same width. `TOOLBAR_GROUPS` keeps its groups, but they only organise the list. The reading-mode divider collapse in `updateState` and the `.osmosis-toolbar-divider` CSS are gone.
- **Zoom off the bar, still commands.** `ButtonDef.noButton` marks zoom in/out: the ribbon draws no button, `main.ts` still registers `mindmap-zoom-in`/`-out` (it loops over every def), and `trigger()` runs a `noButton` def without a button (anchor = the bar), while a def the bar left out (3D fold/unfold) still refuses, as before.
- **Navbar toggle removed.** `BarToggle` is now `"sticks" | "help"`; `NAVBAR_STORAGE_KEY`, `readNavbarPref`, `toggleNavbarPref`, `hidesNavbar` and both views' `toggleNavbar`/`showNavbar` are deleted. `navbarHidden(isPhone, editMode)` = `isPhone && editMode`; the views call `syncNavbar(this.app)` directly. `barToggles` takes `{ touch }` only.
- **Icons.** Obsidian registers `editor:swap-line-up` / `-down` with `lucide-corner-right-up` / `lucide-corner-right-down`, and `editor:indent-list` / `unindent-list` with `lucide-indent` / `lucide-outdent` (grepped from `app.js`). We use those exact strings. `circle-chevron-left` / `-down` / `-right` each occur once as keys in app.js's lucide table, so they exist.
- **Outdent/indent by tree depth.** 3D already wired the buttons to `structural("outdent"/"indent")`. In 2D they went through `executeDirectionalAction("ArrowLeft"/"ArrowRight")`, which on the left side of a balanced map turned Left into *indent*. That function became `runMoveAction(action)`, which the toolbar calls with the semantic action. The actions are renamed `moveLeft`/`moveRight` → `outdent`/`indent`; the button ids `move-left`/`move-right` (and so the command ids `mindmap-move-left`/`-right`, and any hotkeys on them) stay, with the names "Outdent node" / "Indent node". **Alt+Arrow keys are untouched**: `handleKeyDown` has its own `resolveArrowAction` switch, a separate code path, and still moves by screen direction.

### Decisions worth remembering
- **Order:** create ×3, move up/down, outdent/indent, **delete**, then fit, center, fold, unfold, copy, cut, paste, copy/paste style, undo, redo, refresh, ⋮, then the 3D toggles. Delete was pulled forward from "the rest as now" so slot 8 is editing, not Fit. The upcoming "Add link" button would naturally go after indent or delete; the bar scrolls, so there is room.
- **Desktop and tablet use the same 52 px height and a fixed 48 px button (392 px bar).** The phone width is viewport-relative, which only makes sense on a phone, so desktop takes what a typical 412 px phone gets. Tablets use 48 px, not Obsidian's tablet 50 px, so the bar looks the same on every non-phone device.
- **The bar is always eight slots wide, even with fewer buttons** (desktop reading mode shows 6–7), and the buttons sit at the left, as in Obsidian's own toolbar. I did not centre them: centring a scrolling flex row clips its start when it overflows.
- **Toolbar Move up / Move down also became semantic** (previous / next sibling). Before, in a top-down layout they changed depth, because they went through screen arrows. Their swap-line icons now say sibling order in every layout.
- **The 3D bar spans the phone's width** (`.is-phone` drops its 56 px desktop side margins, which only make room for the desktop status bar).
- `--osmosis-graph3d-above-bar` now adds `--touch-size-l`, so the joysticks, speed readout and help panel still clear the taller bar.
- The old `osmosis-hide-navbar-edit` localStorage value is just no longer read; it is not deleted.
- The `.is-phone .osmosis-toolbar { bottom: 80px }` rule stays for the case where the navbar shows under a shown bar, which edit mode no longer leaves it doing.

### Surface map
| File | Change |
|---|---|
| `src/views/ToolRibbon.ts` | new order and icons; `outdent`/`indent` actions; `noButton` (zoom); no dividers; navbar toggle, pref and helpers removed; `navbarHidden(isPhone, editMode)`; `barToggles(view, { touch })`; `trigger` runs command-only defs |
| `src/views/ToolRibbon.test.ts` | layout and command names, first eight slots, zoom commands, icons, semantic outdent/indent, toggles without navbar, navbarHidden |
| `src/views/MindMapView.ts` | toolbar moves call `runMoveAction` (was `executeDirectionalAction`); navbar toggle removed; `syncNavbar` direct |
| `src/views/Graph3DView.ts` | `outdent`/`indent` action keys; navbar toggle removed; `syncNavbar` direct |
| `styles.css` | bar 52 px tall, eight buttons wide (`--osmosis-toolbar-btn-width`), dividers gone, 3D above-bar line and phone width |
| `docs/mind-mapping/editing.md` | toolbar table (order, icons, zoom note), size, no navbar toggle |

### Fixture
None new. Any mind map note for 2D (a balanced map shows outdent/indent on both sides), `vault/tests/graph3d/Sailing Basics.md` for 3D.

### Could not verify
- Everything on a real device: whether the eight buttons line up with Obsidian's editing toolbar edge to edge on Sawyer's phone, and how the circle-chevron icons read.
- On Sawyer's phone, Obsidian's toolbar showed 8 options spread across, while app.css gives 40 px options (9.7 visible at 412 px). Our bar matches the toolbar's **width**, so the exact per-button spacing may differ slightly from that screenshot.
- The bar's vertical position is unchanged (the navbar slot, `--navbar-bottom-offset`); this ticket only changed its height.
