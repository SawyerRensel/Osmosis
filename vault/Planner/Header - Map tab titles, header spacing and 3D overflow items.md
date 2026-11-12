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
