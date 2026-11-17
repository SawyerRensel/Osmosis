---
title: "Toolbar - Desktop width fits the view and tooltips sit above the bar"
summary: "On desktop the Osmosis bar grows to fit all its buttons, capped at the view width minus margins (scrolling when narrower). Tooltips appear above the bar, not over the button."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Toolbar - Mind map toolbar sizing, buttons and icons]]"
status: Done
priority:
progress:
date_created: "2026-11-12T17:00:00.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-12T16:22:28.000Z"
date_start_actual: "2026-11-12T16:22:28.000Z"
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

# Toolbar - Desktop width fits the view and tooltips sit above the bar (T68)

## Request (Sawyer, 2026-11-12, verbatim)
> Ribbon should shrink/grow to fit the width of the screen on desktop.

> Ribbon tooltips are appearing over the button instead of above the ribbon on mouse hover.

## Decided (grill, 2026-11-12)
- **Width rule:** the bar is as wide as all its buttons need; when the view is narrower it is capped at the view width minus margins and scrolls horizontally (as the phone bar already does). Slots stay 48 px on desktop/tablet.
- Phone sizing from T63 is unchanged (52 px tall, exactly 8 slots of 1/8 of Obsidian's toolbar width).
- This replaces T63's fixed 8-slot desktop width, so desktop reading mode no longer leaves empty slots.

## Tooltips
- Buttons currently set `aria-label` (and `title` in one path, `src/views/ToolRibbon.ts:240` and `:266`). Obsidian shows `aria-label` tooltips at the element by default. Use Obsidian's `setTooltip(el, text, { placement: "top" })` (or `data-tooltip-position="top"`), with enough offset that the tooltip clears the top of the bar rather than covering the button. Remove a native `title` if it double-shows. Check the tooltip CSS in `ref/obsidian-core/app.css` (`grep -o`).

## Acceptance criteria
- Desktop, 2D and 3D, edit and reading mode: the bar shows all buttons with no empty slots when the view is wide; dragging the view narrower shrinks the bar to the view width minus margins and it scrolls.
- Hovering a button shows its tooltip above the bar, not over the button.
- Phone unchanged.
- Measure in headless Chromium against `app.css` + `styles.css` (desktop body classes and phone classes `theme-dark is-mobile is-phone is-android is-floating-nav`).

## Context budget
Under ~130k. `src/views/ToolRibbon.ts` whole; `styles.css` by range (grep `osmosis-toolbar`).

## Conventions
- Batch ticket (round 9). Follow `batch/subagent-brief.md`: own branch stacked on the previous ticket, code commit by path + separate note commit, `status: In-Review`, "Batch implementation notes (awaiting manual test)" section with phone/desktop retest steps. No push, no PR.
- Keys in map views need the view `Scope` (memory: mind map keys need the view Scope). Toolbar buttons come from `TOOLBAR_GROUPS` in `src/views/ToolRibbon.ts`.
- Pure logic goes in modules outside `src/views/` so Vitest can import it (Vitest cannot import `obsidian`).
- `src/views/MindMapView.ts` is ~84k tokens with NUL bytes: never read it whole, use `grep -a -n` and read ranges. Graph3DScene.ts (~37k), Graph3DView.ts (~30k), styles.css (~33k): ranges only.

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

Code commit `bc96ee8` on `feature/toolbar-desktop-width`.

### Cause
- **Width:** T63 set `.osmosis-toolbar-list` to a fixed `8 × 48 px + padding` (392 px) on every device. Desktop showed 22 buttons in a 392 px strip, and reading mode left empty space beside its 7 buttons.
- **Tooltips:** buttons set `aria-label` and a native `title`. Obsidian's `aria-label` tooltip defaults to `placement: "bottom"` (app.js `gt()`: `top = rect.bottom + gap`). For a bar at the bottom of the window, that runs off the body, and Obsidian clamps it back with `top = bodyHeight - tooltipHeight - gap`, which puts it on top of the button. The native `title` showed a second tooltip at the cursor.

### Fix
- `styles.css`: the list is now `width: max-content; max-width: 100%`. The outer `.osmosis-toolbar` already had `max-width: calc(100% - var(--size-4-4))` in 2D, and the 3D bar keeps its `calc(100% - 2 × (--size-4-2 + 48px))`, which avoids the status bar corner. So the bar is exactly as wide as its visible buttons. When the view is narrower it is capped and scrolls, like the phone bar. Hidden reading-mode buttons are `display: none`, so they take no width. The phone's 8-slot width moved into a new `.is-phone .osmosis-toolbar-list` rule and is unchanged.
- `ToolRibbon.ts`: action buttons and toggles use `setTooltip(btn, label, { placement: "top" })` (`BAR_TOOLTIP`), which also sets `aria-label`. The native `title` is gone. Each button is the bar's full 52 px height, so "top of the button" is the top of the bar, and Obsidian's default 8 px gap plus the arrow clears it. No extra `gap` was needed.

### Decisions worth remembering
- Tablets follow the desktop rule (fit to buttons, 48 px slots), as the ticket says "desktop/tablet". Only `.is-phone` keeps the 8-slot width.
- The 3D desktop margin (48 px + 8 px each side, for the status bar) counts as the "margins" in "view width minus margins". It was not changed.

### Measurements (headless Chromium, app.css + styles.css)
| Case | View | Bar width | Visible buttons | Scrolls |
|---|---|---|---|---|
| Desktop 2D edit | 1400 | 1064 (22 × 48 + 8) | 22 | no |
| Desktop 2D reading | 1400 | 344 | 7 | no |
| Desktop 3D edit | 1400 | 1016 | 21 | no |
| Desktop 3D reading | 1400 | 296 | 6 | no |
| Desktop 2D edit | 600 | 584 (8 px margins) | 22 | yes (1064) |
| Desktop 3D edit | 600 | 488 (56 px margins) | 21 | yes (1016) |
| Desktop 2D reading | 300 | 284 | 7 | yes (344) |
| Phone 2D / 3D edit (412 px) | 412 | 396, 48.5 px slots | 22 / 21 | yes, unchanged from T63 |

### Surface map
| File | Change |
|---|---|
| `styles.css` | `.osmosis-toolbar-list` width is `max-content`; new `.is-phone .osmosis-toolbar-list` keeps 8 slots; header comment updated |
| `src/views/ToolRibbon.ts` | `BAR_TOOLTIP`; `setTooltip(..., { placement: "top" })` for buttons and toggles; native `title` removed |

### Fixture
No new fixture. Any mind map works, for example the sailing fixtures in `vault/tests/graph3d/`.

### Not verified
- The tooltip position in real Obsidian. It was worked out from app.js's `gt()` positioning code and not seen on screen.

### Manual retest
**Desktop**
1. Open a mind map in 2D edit mode with the window wide. The bar shows all buttons with no empty slots, from create through ⋮.
2. Switch to reading mode. The bar shrinks to its 7 buttons with no empty slots.
3. Drag the pane narrower. The bar shrinks to the pane width minus about 8 px each side, and the mouse wheel scrolls it sideways.
4. Hover any button. One tooltip appears above the bar with its arrow pointing down, and nothing covers the button. There is no second native tooltip.
5. Repeat steps 1 to 4 in 3D (toggle 2D | 3D). The bar ends with ?, and when narrow it stops 56 px short of each side.

**Phone**
1. Open a map in edit mode. The bar is unchanged: 8 slots across the toolbar width, the rest scroll, and it sits in the navigation bar's slot.
