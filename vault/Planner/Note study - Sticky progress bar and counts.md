---
title: Note study - Sticky progress bar and counts
summary: "T122. Note study shows the Flashcard study view's progress bar and New/Learn/Due counts in a strip that sticks under the note header while scrolling."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
status: Done
batch: 16
priority:
progress:
date_created: 2026-11-24T23:17:08.000Z
date_modified: 2026-11-26T18:47:06.000Z
date_start_scheduled: 2026-11-24T23:59:32Z
date_start_actual: 2026-11-24T23:59:32Z
date_end_scheduled: 2026-11-26T18:47:06.000Z
date_end_actual: 2026-11-26T18:47:06.000Z
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/54
---

# Note study - Sticky progress bar and counts (T122)

## What Sawyer asked
> should see progress bar and new/learn/due when studying in note view. Should stick below header menu so it's there even when scrolling.

Settled at intake: same content as Flashcard study, meaning the progress bar plus New/Learn/Due counts from T117's `sessionStatus()`.

## Current state (from a code read)
- Note study already mounts a strip (`StudyProgressStrip`, 60 lines) in `LineRevealProcessor.ensureStrip` L1038–1055. It sits inside `.markdown-preview-sizer` above the inline title, so it scrolls away with the note.
- Its percentage comes from `studyProgress` (done/total, L1078–1098), and its counts come from `countNoteSession`, not T117's `sessionStatus`.
- `NoteStudyProcessor.progressWidget` L59 and `updateProgress` L1083–1087 are dead (never assigned). Mention them; remove them only if this ticket's changes make them orphans.
- Find out why Sawyer doesn't see the bar and counts today, then fix that first. Possible reasons: the strip only shows in some cases, the counts are empty, or it scrolled away.

## Design
- The strip stays visible at the top of the note's scrolling area, just below the view header, while the note scrolls. Prefer `position: sticky; top: 0` with the theme background and a z-index on `.osmosis-note-study-strip`. If the sizer breaks sticky, mount the strip outside the sizer in the leaf's view content. Check both reading view and live preview if note study runs in both.
- Use the same bar fill rule and counts as Flashcard study: `sessionStatus()` from `src/study/session-counts.ts` L116–142, fed with the note's cards, so the bar tracks cards left exactly as T117 does. If `sessionStatus` needs a note-scoped input, adapt it there rather than keeping two count paths.
- Ratings, undo (T119) and bury (T121) must update it.

## Context budget (~55k)
- `src/study/session-counts.ts` (142, whole file).
- `src/views/StudyProgressStrip.ts` (60, whole file).
- `src/views/LineRevealProcessor.ts` (1337 lines). Read: `strips` L142, `toggleStudy` L690–760, `ensureStrip` L1038–1055, `studyProgress` L1078–1098, `syncBanners` L1104–1120, `markFenceRated` L1189–1215.
- `src/views/FlashcardStudyView.ts`: `buildLayout` L432–438, `updateProgress` L695–704.
- `styles.css`: `.osmosis-study-progress*` / `.osmosis-study-counts` L1711–1760, count palette L2236–2245, `.osmosis-note-study-strip` L2419–2423, sticky precedents L3010, L3152.

## Acceptance criteria
- Entering note study shows the progress bar plus New/Learn/Due counts styled like Flashcard study.
- Scrolling a long note keeps the strip pinned just under the header, opaque, with content not visible through it, on desktop and phone.
- Rating, undo and bury update the bar and counts, and the bar follows T117's rule.
- Leaving study mode removes the strip.

## Test plan
Open a long note with many fences and lines and enter note study. The strip shows bar and counts. Scroll to the bottom: the strip stays pinned. Rate a few cards: counts and bar move. Undo one: they move back. Leave study: the strip is gone. Repeat on the phone.

## What was implemented

Shipped in [PR #54](https://github.com/SawyerRensel/Osmosis/pull/54) → `release/0.0.6` (batch 16, commits `3a4e136` and the fix round `4dfac70`).

### The cause

**Why the strip vanished.** It was mounted inside `.markdown-preview-sizer`, directly before `.inline-title`. Obsidian virtualizes the sizer: its `updateVirtualDisplay` (read in `ref/obsidian-core/app.js`) runs on scroll and calls `sizerEl.setChildrenInPlace([pusher, ...sections in view])`. The strip lived in the header section (`.mod-header`), which is detached once it scrolls out of the render window, so in a long note it was gone as soon as you scrolled. With no inline title, the fallback prepended it to the sizer itself and the next pass removed it outright. `position: sticky` could not have worked in either place. The counts were not the problem: `countNoteSession` was correct.

**Why it sat too low (fix round 1).** Sawyer: on desktop the strip sat about 45px below the view header and the note scrolled through the gap. Chromium pins a sticky box inside its scroll container's padding, not at the scroller's top edge, and the reading view scroller has `padding: var(--file-margins)` (32px on top on desktop), so `top: 0` pinned it 32px down. On a phone the earlier offset stacked on top of the padding: with a floating header the strip sat 55px below the header's bottom edge (headless Chromium with Obsidian's `app.css`, scrolled 400px).

### The fix

- `mountAtScrollerTop` (replaces `mountAboveInlineTitle` in `src/views/StudyProgressStrip.ts`) makes the strip the first child of the reading view's scroller (`.markdown-reading-view > .markdown-preview-view`), before the sizer. Obsidian never resets the scroller's children, and a full `rerender(true)` empties only the sizer.
- `.osmosis-note-study-strip` is `position: sticky`, opaque (`--background-primary`), `z-index: 5`, with padding rather than margin below it so no text shows in the gap; with readable line length on it takes the sizer's column.
- Bar and counts come from the new `noteSessionStatus()` in `src/study/session-counts.ts`, applying T117's rule (`finished / (finished + left)`) through a `progressPercent` helper shared with `sessionStatus`.
- Round 1 (CSS only): while the strip is mounted, `.markdown-preview-view:has(> .osmosis-note-study-strip)` sets `padding-top: 0` and the strip uses `top: 0`, so it is flush under the header at every scroll position (measured offset 0 on desktop and phone). A `box-shadow: 0 0 0 100vmax` plus `clip-path: inset(0 -100vmax)` paints the strip's background across the scroller's full width at the strip's height only, adding no scrollable overflow. On a phone with a floating header the strip gets `padding-top` of the header's offset plus height, and the scroller `isolation: isolate` so `z-index: 5` cannot rise above the header.

### Decisions worth remembering

- **Mounted outside the sizer, sticky kept, but not as a sibling of the scroller.** On a phone the view header floats over the scroller, so a sibling would sit behind it, and with in-note search open the reading view becomes `flex-direction: column-reverse`, which would push a sibling to the bottom.
- **Zero the scroller's top padding rather than `top: calc(-1 * padding)`.** The padding differs between desktop (`--file-margins`), sidebars, phones and themes, and measuring it in JS goes stale when a phone rotates. No `!important`: the selector repeats Obsidian's phone padding rule chain and adds `:has()`, one class heavier.
- **At scroll 0 the strip is also at the top.** The 32px that used to sit above it is gone, so the inline title starts 8px under the strip. If Sawyer wants breathing room above the title, add it below the strip as sizer margin, not above.
- **The bar counts cards, not questions**, following T117. An Again leaves the bar where it was (the card sits in learn), and note study never asks an Again card twice, so once every card has a rating the bar reads full, like the study tab's waiting screen. Again cards stay in Learn; the filter is not by due time.
- **`sessionStatus` was not changed**: its input is a queue with an index, which note study lacks. `noteSessionStatus` sits beside it and shares the fill rule; `countNoteSession`'s buckets come from the same `bucketOf`.
- **Orphans removed:** `studyProgress`, `planFenceSteps` and the `fenceSteps`/`ratedFences` state, which fed only the old question-count bar. `unmarkFenceRated` keeps its now-unused `fenceKey` parameter so its call site is unchanged. `NoteStudyProcessor.progressWidget` / `updateProgress` were already dead before this ticket and are left in place.

### Surface map

| File | Change |
|---|---|
| `src/study/session-counts.ts` | New `noteSessionStatus`; `progressPercent` shared with `sessionStatus` |
| `src/study/session-counts.test.ts` | `noteSessionStatus` tests: start, Good, Again, all rated, undo, empty |
| `src/views/StudyProgressStrip.ts` | `mountAboveInlineTitle` replaced by `mountAtScrollerTop` |
| `src/views/StudyProgressStrip.dom.test.ts` | Test for the new mount |
| `src/views/LineRevealProcessor.ts` | `ensureStrip` mounts in the scroller and uses `noteSessionStatus`; question-count bar state removed |
| `styles.css` | Strip is sticky, opaque, padded; readable-width column rule; round 1: scroller `padding-top: 0` and `isolation: isolate`, `top: 0`, full-width shadow paint, floating-phone padding |
| `e2e/fixtures/note-study-sticky-strip.md` | New long fixture (copy in `vault/tests/flashcard/`) |

### Test fixture

`vault/tests/flashcard/note-study-sticky-strip.md` (master `e2e/fixtures/note-study-sticky-strip.md`): a long sailing note with 14 cards, 6 line cards (3 scheduled in `osmosis-schedule`) and 8 fences (6 scheduled). The 9 scheduled cards were due between 2026-11-05 and 2026-11-13 and 5 are new, so the strip starts at **5 | 0 | 9**.

### Follow-ups

- **An outline-heading jump may land behind the strip.** Clicking a heading in the outline may scroll it to just under the top, partly hidden by the strip's ~36px. Never tested.
- **Mind map study still uses its own bar** (`MindMapView.ensureMindmapStudyStrip` with `countNoteSession` directly), left alone as out of scope; it does not share `noteSessionStatus`.
- Phone behaviour was measured on a hand-built DOM, not on a device: with the floating header plus in-note search open the extra top padding may leave a blank band of about 56px under the search bar, and `auto-full-screen` hides the header on scroll while the strip keeps its header-height padding, so a blank band may sit where the header was. Both would be cosmetic.
- A bury done during a running note session does not change that session's counts (a note session leaves out cards buried before it starts).
