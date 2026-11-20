---
title: Note study - Counts and progress bar replace the Stop pill
summary: "T102. Note study shows the Flashcard tab's progress bar and new/learn/due counts above the file name; the '0/X rated Stop' pill goes."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
status: In-Review
batch: 14
priority:
progress:
date_created: 2026-11-20T12:00:00.000Z
date_modified: 2026-11-20T12:00:00.000Z
date_start_scheduled: 2026-11-20T17:25:57Z
date_start_actual: 2026-11-20T17:25:57Z
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

# Note study - Counts and progress bar replace the Stop pill (T102)

## What Sawyer asked
> Use the same new/learn/due and progress bar in contextual (Note) study mode. Insert above filename. Get rid of the "0/X rated Stop".

## Current state
- The pill: `LineRevealProcessor.ts` `ensureBanner` ~986, `renderBanner` ~997–1010 (`.osmosis-reveal-progress` "done/total rated" + Stop button), `studyProgress` ~1019–1039 (counts questions: occlusion steps and fence steps), `syncBanners` ~1045–1062 (mounts in `.markdown-reading-view`, class `osmosis-reveal-host`).
- The Flashcard tab's strip: `SequentialStudyView.ts` `buildLayout()`/`updateProgress()`/`updateCounts()` (`.osmosis-study-progress`, `.osmosis-study-counts`); pure `src/study/session-counts.ts` (`bucketOf(StudyCard)`, `countSession(queue, currentIndex, deferred)`). Colours: `--osmosis-count-*` on `.osmosis-dashboard, .osmosis-study-view`. **Add the Note-study host to that selector.**
- Note mode tracks block IDs / fence keys, not a `StudyCard[]` queue. Map the note's card IDs to `StudyCard`s via `cardStore` and bucket each with `bucketOf`. Counts = cards not yet rated this session, by bucket; a card rated Again moves to learn.

## Design (settled with Sawyer)
- Same visuals as the Flashcard tab: progress bar with the three counts to its right, same classes or a shared builder (extract the DOM builder rather than copy it).
- Placed **above the file name** (the inline title) in the reading view. Nothing in src locates the inline title yet: find `.inline-title` inside the reading view's sizer and insert before it; fall back to the top of `.markdown-preview-sizer` when the inline title is hidden.
- Remove the pill and its Stop button. Ending study is the header cap toggle (and the existing command); make sure nothing else depended on Stop (e.g. the flush on stop — keep that flush on toggle-off). Keep the progress bar as rated/total.
- Underline the bucket of the card being answered if that is knowable; otherwise no underline. Say which in the notes.

## Acceptance criteria
- Note study shows bar + counts above the file name, updating on every rating and undo; colours match the dashboard.
- The "x/y rated" pill and Stop are gone; toggling the cap off ends and flushes the session.
- Counts are unit-tested (pure function).

## Test plan
`tests/flashcard/study-counts.md` in Note study: counts match the dashboard row; rate Again/Good and watch them move; end via the cap. Inline title hidden (setting off) → strip still shows at the top. Phone.

## Context budget (~40k tokens)
- `LineRevealProcessor.ts` 560–640 and 980–1065; `src/study/session-counts.ts` (44 lines); `SequentialStudyView.ts` grep `updateCounts|buildLayout|osmosis-study-progress` ±40 lines; styles.css grep `osmosis-study-count|osmosis-reveal`.

## Conventions
- Batch 14 ticket: commit `feat(T102): …`/`fix(T102): …` plus one `docs(T102)` note commit setting `status: In-Review` with a "Batch implementation notes (awaiting manual test)" section. Stage by explicit path; `git diff --cached --stat` before each commit; never `git stash`; don't push.
- Batch 12 (T91/T92) round-2 facts: the study tab's buttons sit in one floating panel; every mode's rating row uses the shared class `osmosis-contextual-rating` (colour rules only at `.osmosis-contextual-rating button.osmosis-rate-*` in styles.css); deck-count colours come from `--osmosis-count-new/learn/due`, declared on `.osmosis-dashboard, .osmosis-study-view`.
- Lint → test → build, one at a time (7 GB RAM). Pure logic goes in `src/study/` or similar (vitest cannot import obsidian) and gets unit tests.

## Batch implementation notes (awaiting manual test)

Code commit: `43beb74` on `batch/14-study-polish-renames`.

### Approach
- The study tab's bar + counts DOM is now one builder, `StudyProgressStrip` in `src/views/StudyProgressStrip.ts` (`new StudyProgressStrip(parent)`, `setProgress(percent)`, `setCounts(SessionCounts)`). `SequentialStudyView` uses it; so does note study.
- Note study (`LineRevealProcessor`) replaces `ensureBanner`/`renderBanner` with `ensureStrip`: a `div.osmosis-note-study-strip` holding the strip, placed by `mountAboveInlineTitle(sizer, el)` directly before `.inline-title` in the reading view's `.markdown-preview-sizer`, or at the top of the sizer when no inline title is in the DOM. It is re-placed on every `syncBanners` (each rating, undo, file-open, layout-change, leaf change), so a rebuilt header gets it back.
- Counts: at session start `planSessionCards` lists every card the session asks (an occluded line's due shape groups, an ordinary line's due-or-new cards, a fence's due cards) with the bucket each starts in (`noteSessionCard`, the dashboard's rule). Ratings are kept by card ID in `sessionRatings`. The pure `countNoteSession` (in `src/study/session-counts.ts`) counts unrated cards in their bucket and Again-rated cards in learn; Hard/Good/Easy take a card out.
- Fence ratings reach the counts through `markFenceRated(notePath, fenceKey, cardId, rating)`. Undoing a fence rating (Ctrl+Z / undo button) now calls the new `unmarkFenceRated`, which steps the bar and counts back. Before this, undo never moved the pill.
- The bar stays rated/total in questions (`studyProgress`, unchanged).
- Stop is gone. Ending study is the header cap toggle or the command. Both go through `toggleStudy` → `endStudy`, which still flushes the schedule store, fence writer and review log. Nothing else called the Stop button.

### Decisions
- **Underline:** set for line cards only, while a line's rating bubble is showing (the shape group being asked on an occluded line). Fence questions are owned by `ContextualStudyProcessor` and are not tracked here, so answering a fence underlines nothing. Before a line is revealed nothing is underlined either, because fences can be answered in any order and there is no single "next" card.
- **Again → learn:** followed the note literally. A card rated Again leaves its bucket and is counted in learn, as in the study tab. Note study does not ask it again, though, so the learn count can stay above 0 until the session ends. That matches the dashboard (the card really is in learning). If Sawyer would rather counts drain to 0, drop the `rating === 1` branch in `countNoteSession`.
- **Line card with several cards** (for example a bidirectional line): each due-or-new card counts once, so counts are in cards, like the dashboard, while the bar is in questions. One rating takes all of them out.
- **Not sticky:** the strip sits in the note's flow above the title and scrolls away with it, as asked ("insert above filename"). The old pill floated. Making it sticky would mean moving it out of the header, so I didn't.
- **CSS:** `.osmosis-note-study-strip` joins the `--osmosis-count-*` palette selector. It declares `--osmosis-study-strip-height: 28px` and `--osmosis-study-column: none` (the sizer already sets the column). The orphaned `.markdown-reading-view.osmosis-reveal-host` rule went. `.osmosis-reveal-banner`/`-progress`/`-btn` stay because the mind map's spatial banner still uses them.

### Surface map
| File | Change |
|---|---|
| `src/views/StudyProgressStrip.ts` | New: shared bar + counts builder, `mountAboveInlineTitle` |
| `src/views/StudyProgressStrip.dom.test.ts` | New: builder and placement (jsdom) |
| `src/views/SequentialStudyView.ts` | Uses `StudyProgressStrip`; `COUNT_BUCKETS` moved into it |
| `src/views/LineRevealProcessor.ts` | Pill → strip above inline title; `sessionCards`/`sessionRatings`; `planSessionCards`; `markFenceRated` takes card + rating; new `unmarkFenceRated` |
| `src/views/ContextualStudyProcessor.ts` | Passes card + rating to `markFenceRated`; undo entry carries `fenceKey`, undo calls `unmarkFenceRated` |
| `src/study/session-counts.ts` (+ test) | `NoteSessionCard`, `noteSessionCard`, `countNoteSession` |
| `styles.css` | `.osmosis-note-study-strip` vars + palette selector; removed `.osmosis-reveal-host` rule |

### Fixture
Reused `vault/tests/flashcard/study-counts.md` (master `e2e/fixtures/study-counts.md`, unchanged; all fences, back-dated, 2 | 2 | 3). It has no line cards, so check the underline on a line-card note such as `vault/tests/flashcard/line-card-toggle-test.md`.

### Not verified
- Nothing was run in Obsidian. The real reading-view DOM (`.inline-title` inside the sizer's header, present but hidden when the inline-title setting is off) is assumed; the fallback covers its absence.
- Whether Obsidian ever rebuilds the header mid-session and drops the strip until the next sync.
- Phone layout.
