---
title: "Header - Map tab titles, header spacing and 3D overflow items"
summary: "Both map views use the brain-circuit tab icon with no 'Mind Map:' / '3D graph:' prefix; fix the header button spacing (🧠 and 📄); the 3D header ⋯ menu gains the joystick toggle and Help."
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
  - "[[Header - Map header order and overflow menu]]"
  - "[[Header - Note header gateway and overflow menu]]"
  - "[[Ribbon - Osmosis toolbar styled as Obsidian's mobile toolbar]]"
status: Done
priority:
progress:
date_created: "2026-11-12T11:52:00.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-12T11:54:00.000Z"
date_start_actual: "2026-11-12T11:54:00.000Z"
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

# Optimization

## Sawyer's feedback (round 8 retest, 2026-11-12)

> Let's use the brain circuit icon for both 2D and 3D mind map views and remove the prefix text "Mind Map:" and "3D graph:"

> I don't think we've fixed the spacing of the brain-circuit button in the header. It's still too far from the graduation cap to its right and too close to the header pill border on its left. Same thing for the note button in the header when in mind map views.

> Let's add the fly joystick toggle to the ellipsis menu in the header. Let's show the help button in there too (keep in mobile toolbar too)

Screenshots: ![[r9-tab-2d.png]] ![[r9-tab-3d.png]] (tabs today), ![[r9-3d-phone-toolbar.png]] (phone header: `[📄] [2D|3D] [🎓] [📖] [⋮]` inside Obsidian's rounded header pill. 📄 sits too close to the pill's left edge).

## What to build

1. **Tab titles:** 2D and 3D views both use the `brain-circuit` icon (`getIcon()`), and their display text is just the note name (`getDisplayText()`): no "Mind Map: " or "3D graph: " prefix. Check every place the prefix is built (pinned-tab marker from T54 included), and check that commands or menus which relied on the prefixed title still read well.
2. **Header spacing, for real this time.** This is the third report. The previous fix (`102a10e`, see the T55 note's follow-up) re-anchored 🧠 but couldn't reproduce the gap. This time, measure:
   - Build the phone header DOM (`body.is-mobile.is-phone`; Obsidian's newer mobile UI puts header actions in a rounded pill) against `ref/obsidian-core/app.css` (one minified line, so `grep -o` only) plus `styles.css`, in headless Chromium the way the last agent did, and compare the computed box of every action.
   - Note header: `[🧠][🎓][Edit][⋯]`. 🧠 must have the same left inset from the pill edge, and the same gap to 🎓, as Obsidian's own actions have to each other.
   - Map headers: `[📄][2D|3D][🎓][Reading/Edit][⋯]`. 📄 has the same problem.
   - Suspects: our buttons are `<a>` or lack the `view-action` class, so Obsidian's phone padding/margin rules skip them; a `margin-inline-end` on our element; the pill's first-child padding rule targeting `.view-action:first-child`.
   - Fix the cause so our buttons are indistinguishable from Obsidian's.
3. **3D header ⋯ menu:** add "Walk and fly joysticks" (a check-mark toggle, same state as the toolbar 🎮 via `toggleSticks`, shown only where 🎮 is: 3D + touch) and "Controls help" (opens the same help panel as the toolbar ?). Both stay in the toolbar too. Put them with Style/Follow (`PANE_MENU` / `addPaneMenuItems` in `src/views/ViewHeader.ts`; 3D's `onPaneMenu`). On phones in reading mode the toolbar is hidden, so this is now how a phone reaches joysticks and help while exploring. Check that the help panel opens and is positioned sensibly when the toolbar isn't shown.

## Code facts
- Header: `src/view-header.ts` (`SHARED_HEADER`), `src/views/ViewHeader.ts`. Note-header 🧠/Study: `src/main.ts` (`addMindMapActionToMarkdownLeaves`, `createHeaderAction`), `findModeToggle` in `src/views/LineRevealProcessor.ts`.
- Help panel: owned by `Graph3DView` since T61. Joysticks: `sticksShown`/`toggleSticks` in `Graph3DView.ts`.
- 2D view class in `src/views/MindMapView.ts`: **~84k tokens with NUL bytes. Never read it whole.** Use `grep -a -n "getDisplayText\|getIcon"` and small ranges.

## Context budget
Under ~130k tokens. Read `styles.css`, `Graph3DView.ts` and `main.ts` by range.

## Acceptance criteria
- Both tabs show the brain-circuit icon and the bare note name.
- On a phone (computed in headless Chromium, and stated in the notes) our header buttons have the same box, padding and gaps as Obsidian's own actions, in the note header and in both map headers.
- 3D ⋯ shows the joystick toggle (touch only) and Controls help; both work in reading mode on a phone.

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

Code: commit `252e13f` on `feature/map-tab-and-header-polish`. The whole ticket shipped.

### 1. Tab titles
- `MindMapView.getDisplayText()` returns the bare basename (still `… (pinned)` when pinned, T54's marker kept); `Graph3DView.getDisplayText()` returns the bare basename. With no file they still say "Mind Map" / "3D graph" so an empty tab isn't blank.
- `Graph3DView` tab icon `orbit` → `brain-circuit` (the 2D view already used it).
- Nothing read the prefixed title: no command, menu, test or doc matched on "Mind Map:" / "3D graph:". The `orbit` icon stays on the "3D graph" file-menu item and the toggle-3D command, since those name the 3D view among other actions.

### 2. Header spacing: measured
**Method.** Built the phone header DOM (Obsidian's own markup from `app.js`: `div.view-actions.mod-raised`, actions are `button.clickable-icon.view-action`, prepended by `addAction`) with body `theme-dark is-mobile is-phone is-android is-floating-nav`. Rendered it against `ref/obsidian-core/app.css` + `styles.css` in Playwright 1.62.1's headless Chromium (412 px wide, DPR 2) with Obsidian's real lucide paths, extracted from `app.js`. Three headers: stock note `[📖][⋮]`, our note `[🧠 a][🎓 a][bookmark (hidden)][📖][⋮]`, and the map `[📄][2D|3D][🎓][📖][⋮]`.

**Computed (before the fix), x relative to the pill's left edge:**

| Header | Pill | Each action |
|---|---|---|
| Stock note | h 44, padding 0, gap 2 px | 📖 0–44, ⋮ 46–90; every box 44 × 44, padding 4/6 px, margin 0, icon at +10 |
| Our note | same | 🧠 0–44, 🎓 46–90, 📖 92–136, ⋮ 138–182; identical boxes. The `<a>` tag makes no difference. |
| Map | same | 📄 0–44, pill 48–119.6 (2 px margins), 🎓 123.6–167.6, 📖 169.6–213.6, ⋮ 215.6–259.6 |

**Compared with Sawyer's screenshot** (`r9-3d-phone-toolbar.png`, pill 243–677 image px, which is ×1.672 of the 259.6 px render): the predicted centres for 📄, pill, 🎓, 📖 and ⋮ are 280, 323–443, 486, 563 and 640. Sawyer's are 280, ~325–435, 484, 562 and 640. **The render reproduces the phone pixel for pixel, so our buttons already have Obsidian's box, padding and gap.** None of the ticket's suspects apply: a missing `view-action` class, a margin, the `<a>` tag, or a first-child rule (app.css has none).

**The real cause is optical, and it comes from Obsidian's pill.** `.is-phone .view-header .view-actions` has `padding: 0`, so the first icon sits only its box's 10 px from the rounded end. Ink extents (lucide, 24 px): brain-circuit 1–21.5, file-text 3–21, graduation-cap and book-open 1–23, more-vertical 10–14. So:
- leading inset, edge to ink: 🧠 11 px, 📄 13 px
- neighbouring icons, ink to ink: 24–26 px (🧠→🎓 25.5, 🎓→📖 24)
- trailing inset, ⋮ ink to edge: **20 px**, because ⋮ is thin

The wide first icon therefore looks pressed against the edge, and by contrast farther from its neighbour. Obsidian's own rows hide this because they end in ⋮ and usually have only one wide icon.

**Fix.** `.is-phone .view-header .view-actions:has(> .osmosis-mindmap-action, > .osmosis-view-switch) { padding-inline-start: var(--size-4-2) }`, which is 8 px. After the fix: 🧠 inset 19 px and 📄 21 px, matching ⋮'s 20 px. Boxes and gaps are unchanged (verified re-render: 🧠 8–52, 🎓 54–98, …). The pill is right-aligned (`margin-inline-start: auto`), so it grows to the left and nothing else moves.

### 3. 3D ⋯ menu
`PANE_MENU["3d"]` is now Style, Follow active note, **Walk and fly joysticks** (check mark, `gamepad-2`), **Controls help** (`help`). The view passes the joystick handler only when `hasTouch()` is true (the same gate as the toolbar 🎮, now one helper in `Graph3DView.ts`). It calls `toggleSticks()`, so the menu and 🎮 share one state and storage key. Controls help calls `help.toggle(true)`, which always opens the panel and never closes it: the ⋯ tap's pointerdown already closes an open panel as an outside click, and a toggle would then shut it again. Both entries also stay on the toolbar.

**Help with no toolbar** (phone reading mode): the panel sits on `--osmosis-graph3d-above-bar`. With the bar hidden, the existing `:has(.osmosis-toolbar-hidden)` rule drops that to `--size-4-2` + the navbar lift, so the panel is centred just above Obsidian's navbar, and `max-height` keeps it under the header. No CSS change was needed. It closes on any outside tap or Escape, as before.

### Decisions worth remembering
- **The spacing fix is padding on the pill, not a change to our buttons.** Our buttons were measured identical to Obsidian's. Don't "fix" them toward Obsidian; they already are. The padding applies only to pills that hold our buttons, so plain Obsidian headers (canvas, other views) are untouched.
- **Leading end only.** The trailing end is Obsidian's ⋮, which already reads as 20 px.
- **🧠→🎓 is 1.5 px wider in ink than 🎓→📖** (25.5 vs 24), because brain-circuit's right half is thin circuit lines. This was left alone: changing the gap would make our boxes differ from Obsidian's.

### Surface map
| File | Change |
|---|---|
| `src/views/MindMapView.ts` | `getDisplayText` drops the "Mind Map: " prefix |
| `src/views/Graph3DView.ts` | tab icon `brain-circuit`; `getDisplayText` drops "3D graph: "; `hasTouch()` helper; ⋯ menu passes `sticks` (touch only) and `help` |
| `src/view-header.ts` | `PaneMenuId` + `PANE_MENU["3d"]` gain `sticks` and `help` |
| `src/view-header.test.ts` | 3D menu order; `help` is not a toggle |
| `styles.css` | phone pill `padding-inline-start` when it holds our buttons |
| `docs/mind-mapping/graph-3d.md` | ⋯ menu contents |

### Fixture
None new. Use `vault/tests/graph3d/Sailing Basics.md`, and any note with cards for the 🎓 in the note header.

### Could not verify
- The real phone. The render reproduced Sawyer's map screenshot exactly, but the note header has no screenshot to compare against.
- `:has()` needs Android WebView 105+ / iOS 15.4+. Older WebViews simply keep today's look.
- The menu tap opening help on a real touch device: the pointerdown/click ordering was reasoned through, not observed.
