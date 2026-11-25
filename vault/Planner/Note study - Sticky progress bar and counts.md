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
status: In-Review
batch: 16
priority:
progress:
date_created: 2026-11-24T23:17:08.000Z
date_modified: 2026-11-25T00:20:00.000Z
date_start_scheduled: 2026-11-24T23:59:32Z
date_start_actual: 2026-11-24T23:59:32Z
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

## Batch implementation notes (awaiting manual test)

Code commit: `3a4e136` on `batch/16-bury-zoom-trees`.

### Why the bar and counts weren't visible
The strip was mounted inside `.markdown-preview-sizer`, directly before `.inline-title`. Obsidian virtualizes the sizer: its `updateVirtualDisplay` (read in `ref/obsidian-core/app.js`) runs on scroll and calls `sizerEl.setChildrenInPlace([pusher, ...sections in view])`. So:
- The strip lived inside the header section (`.mod-header`), and that section is detached once it scrolls out of the render window. In a long note the strip was gone as soon as you scrolled.
- When there was no inline title, the fallback prepended the strip to the sizer itself, and the next virtual-display pass removed it outright.
- `position: sticky` could not have worked in either place: in `.mod-header` it is confined to that section's height, and as a sizer child it gets removed.

The counts were not the problem: they came from `countNoteSession` and were correct.

### Fix
- `mountAtScrollerTop` (replaces `mountAboveInlineTitle` in `src/views/StudyProgressStrip.ts`) makes the strip the first child of the reading view's scroller (`.markdown-reading-view > .markdown-preview-view`), just before the sizer. Obsidian never resets the scroller's children. A full `rerender(true)` empties only the sizer.
- In CSS, `.osmosis-note-study-strip` is `position: sticky`, uses `--background-primary`, has `z-index: 5`, and uses padding instead of margin below it, so no text shows in the gap. With readable line length on, it takes the sizer's column (`max-width: var(--file-line-width)`, auto margins).
- The bar and counts come from the new `noteSessionStatus()` in `src/study/session-counts.ts`. It applies T117's rule (`finished / (finished + left)`) through a `progressPercent` helper that it shares with `sessionStatus`.

### Decisions
- **The strip is mounted outside the sizer, and sticky is kept.** The note's preferred option was sticky. The sizer rules that out, so the strip sticks within the scroller instead. I didn't mount it outside the scroller (as a sibling in `.markdown-reading-view`) for two reasons. On a phone the view header floats over the scroller, so a sibling would sit behind it. And when in-note search is open, the reading view switches to `flex-direction: column-reverse`, which would push a sibling to the bottom.
- **Phone offset.** `top: calc(var(--view-top-spacing-markdown, 8px) - 8px)` gives 0 on desktop, where the variable is unset, and 0 on a phone without a floating header. With a floating header (`.is-phone.is-floating-nav` / `auto-full-screen`) it gives `safe-area + header height + 8px`, so the strip sticks just under the floating header with about 8px of content visible between them. I haven't seen this on a device.
- **The bar counts cards, not questions**, following T117. Previously the bar counted questions and moved on every rating, Again included. Now an Again leaves the bar where it was, because the card sits in learn in the counts, the same as in the study tab. Note study never asks an Again card a second time, so once every card has a rating the bar reads full. That matches the study tab's waiting screen. The Again cards stay in the Learn count; I didn't filter by due time.
- **`sessionStatus` was not changed to take a note-scoped input.** Its input is a queue with an index, and note study has neither. Instead `noteSessionStatus` sits beside it and shares the fill rule. `countNoteSession`'s buckets come from the same `bucketOf`. Mind map study still uses `countNoteSession` directly with its own bar, which I left alone because it is out of scope.
- **Orphans removed.** `studyProgress`, `planFenceSteps` and the `fenceSteps`/`ratedFences` state fed only the old question-count bar, so I deleted them. `unmarkFenceRated` keeps its `fenceKey` parameter, which is now unused, so the `NoteStudyProcessor` call site doesn't change.
- **Bury.** Note study has no bury action. A card buried in Flashcard study is left out when the next note session starts (`planSessionCards` already filters with `isBuried`, from T121). A bury done during a running note session doesn't change that session's counts.
- **Not touched.** `NoteStudyProcessor.progressWidget` / `updateProgress` were already dead (never assigned) before this ticket, and this change didn't orphan them, so I left them.

### Surface map
| File | Change |
|---|---|
| `src/study/session-counts.ts` | New `noteSessionStatus`; `progressPercent` shared with `sessionStatus` |
| `src/study/session-counts.test.ts` | `noteSessionStatus` tests: start, Good, Again, all rated, undo, empty |
| `src/views/StudyProgressStrip.ts` | `mountAboveInlineTitle` replaced by `mountAtScrollerTop` |
| `src/views/StudyProgressStrip.dom.test.ts` | Test for the new mount |
| `src/views/LineRevealProcessor.ts` | `ensureStrip` mounts in the scroller and uses `noteSessionStatus`; question-count bar state removed |
| `styles.css` | `.osmosis-note-study-strip` is sticky, opaque, uses padding; readable-width column rule |
| `e2e/fixtures/note-study-sticky-strip.md`, `vault/tests/flashcard/note-study-sticky-strip.md` | New long fixture |

### Fixture
`vault/tests/flashcard/note-study-sticky-strip.md` (master copy in `e2e/fixtures/`). It is a long sailing note with 14 cards: 6 line cards (3 scheduled in `osmosis-schedule`) and 8 fences (6 scheduled). All 9 scheduled cards were due between 2026-11-05 and 2026-11-13, and 5 are new. The strip should read **5 | 0 | 9** at the start. Reload Obsidian (Ctrl+R) before testing.

### Not verified
- Nothing has been run in Obsidian. I haven't checked sticky behaviour, opacity over images and callouts, or the phone floating-header offset on a device.
- Clicking an outline heading may scroll it to just under the strip, partly hidden behind its 36px. Untested.
- `npm run build` was not run (the orchestrator said not to). `tsc -noEmit` passes.
