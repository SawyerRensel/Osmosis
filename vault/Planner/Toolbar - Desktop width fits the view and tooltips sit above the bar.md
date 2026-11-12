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
