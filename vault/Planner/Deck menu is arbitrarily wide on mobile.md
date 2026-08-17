---
title: Deck menu is arbitrarily wide on mobile
summary: The deck menu expands as wide as the longest deck title even if it's not currently selected, taking up a lot of space in the Osmosis Browser.  Let's force a fixed width and simply truncate a long title with ellipses.
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
status: Done
priority:
progress_current:
progress_total:
date_created: 2026-08-13T07:28:21.605Z
date_modified: 2026-08-13T22:28:32.587Z
date_start_scheduled: 2026-08-13T22:35:36.000Z
date_start_actual: 2026-08-13T22:35:36.000Z
date_end_scheduled: 2026-08-13T22:43:05.000Z
date_end_actual: 2026-08-13T22:43:05.000Z
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/23
---
# Optimization 

## What tool or process needs improvement?

*Which existing tool, script, or workflow are you referring to? Include the name if you know it.*

![](Screenshot_20260813-083531%201.png)
![](Screenshot_20260813-083505%201.png)

## What's slow or frustrating about it?

The deck dropdown sized itself to the longest deck name in the collection, not
to the deck currently selected. On a phone that pushed the control past the edge
of the screen, and the damage did not stop at the dropdown — the oversized field
widened the whole scope bar, which set the **entire stats view** scrolling
sideways. The second screenshot is the view scrolled right: the panel labels,
the Mode buttons and the chart axes are all off-screen.

## What would "better" look like?

A fixed-width deck control that truncates a long name with an ellipsis, so the
scope bar's width no longer depends on what happens to be in the collection.

---

## What was implemented

**Where it shipped** — [PR #23](https://github.com/SawyerRensel/Osmosis/pull/23),
branch `fix/deck-menu-width-on-mobile`, merged into `release/0.0.4`.

**The cause** — a native `<select>` takes its intrinsic width from its **widest
`<option>`**, not from the option currently on show. The deck list is built from
every deck in the collection, so one long deck path set the width of the closed
control forever after. The horizontal scrolling followed from a second fact:
flex items default to `min-width: auto`, so they refuse to shrink below their
intrinsic width. The over-wide select therefore could not be compressed, and it
forced `.osmosis-stats-scopebar` — and with it the whole view — wider than the
viewport.

That second half is the part worth remembering. The visible symptom was a wide
dropdown, but the reason the *panels* were clipped is the flex min-width rule,
which is invisible in the markup and easy to miss when reading the CSS.

**The fix** — pin the deck select's width and let the closed control ellipsise:

- `min-width: 0` on `.osmosis-stats-scope-field`, so the field can shrink inside
  the flex scope bar rather than acting as a floor on its width.
- A new `.osmosis-stats-deck-select` class carrying `width: 14em`,
  `min-width: 0`, `overflow: hidden` and `text-overflow: ellipsis`.

**Decisions worth remembering**

- **Fixed width, not `flex: 1`.** Letting the select grow into the available
  space would also have stopped the overflow, but the width would then still
  vary with the viewport. A fixed `14em` makes the scope bar's geometry
  independent of both the deck list and the screen.
- **`min-width: 0` on the select as well as the field.** The fixed width alone
  is not enough on a very narrow phone: the select is itself a flex item of the
  field, and without `min-width: 0` its automatic minimum size would again
  refuse to shrink below the intrinsic width. Do not delete this as redundant
  with `width` — it governs a different axis of the layout.
- **The popup was left alone.** Only the closed control is truncated. The
  dropdown list is drawn by the OS, outside the element's box, so it still shows
  full deck names with their hierarchy indentation — which is where the user
  actually needs to read them.
- **No unit test.** This is CSS with no logic behind it; `src/styles.test.ts`
  covers mind-map node styling, not the stylesheet. Verified manually on mobile
  instead.

**Surface map**

| File | Change |
|---|---|
| `src/views/StatsView.ts` | Added `osmosis-stats-deck-select` to the deck `<select>`'s class list |
| `styles.css` | `min-width: 0` on `.osmosis-stats-scope-field`; new `.osmosis-stats-deck-select` rule with the fixed width and ellipsis |
| `e2e/fixtures/long-deck-name.md` | New fixture (copied to `vault/tests/flashcard/`) |

**Test fixture** — `e2e/fixtures/long-deck-name.md` declares
`osmosis-deck: architecture/late-medieval-cathedral-construction`. The long leaf
name is the whole point: without a deck that long in the collection the bug does
not reproduce in the dev vault, only on the user's phone.

**Follow-ups** — none. The other scope-bar controls are segmented buttons with
fixed labels, so they cannot grow with the collection the way the deck select
did.