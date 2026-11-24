---
title: Stats - Note study records the time spent on each card
summary: "T120. Note study (fences and lines) and Cosmos study time each card from when it becomes the current question, not from reveal, so Stats shows real study time."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
status: In-Review
batch: 15
priority:
progress:
date_created: 2026-11-24T23:17:08.000Z
date_modified: 2026-11-24T23:46:37.000Z
date_start_scheduled: 2026-11-24T23:46:37.000Z
date_start_actual: 2026-11-24T23:46:37.000Z
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

# Stats - Note study records the time spent on each card (T120)

## What Sawyer asked
> stats is not accurately recording time elapsed. I studied for about 22 minutes today but it's showing 10 min

Screenshot: `ref/screenshots/Pasted image 20261124180109.png` (Today: 76 reviews, Time 10m).

## Evidence (measured from `ref/screenshots/2026-11.mobile-android.md`)
Today's log runs 06:43–07:11, about 27 minutes. Of the 76 entries:
- 35 flashcard-mode reviews log `e` of 2–42 s, which matches the gaps between their timestamps.
- 41 note-mode reviews log `e` of only about 0.6–12 s, mostly 1–2 s, while they are 10–40 s apart.

The sum of `e` is 10.2 min, the figure Stats shows.

## Cause
Note study starts the timer at **reveal**, so `e` is only the reveal-to-rate time:
- `NoteStudyProcessor.showRating` sets `revealedAt = Date.now()` at L953 and calls `recordRating(cardId, rating, Date.now() - revealedAt)` at L992.
- `LineRevealProcessor` sets `pendingRatingAt` at reveal (`onPlaceholderClick` L544) and uses it in `rate` L610.
- `CosmosStudy.ts` L231/L241 has the same reveal-anchored pattern.

Flashcard study anchors at question shown (`FlashcardStudyView.renderCard` L511 `cardShownAt`, used at L839).

## Design
- Anchor the elapsed time at the moment the card became the current question. In note study that is the later of when study mode started, when the fence/line was drawn, and when the previous rating in this note happened.
- Cap one card's elapsed time the way Anki does: count at most 60 s per card, so a card left open while away doesn't inflate Stats. If FlashcardStudyView has no cap today, add the same cap there and record the decision.
- Apply this to fences, lines and Cosmos study. Check whether mind-map study has the same issue and fix it if it is the same one-liner.
- Past logs are not rewritten.

## Context budget (~40k)
- `src/views/NoteStudyProcessor.ts`: `showRating` L940–1006, `recordRating` L1014–1023.
- `src/views/LineRevealProcessor.ts`: `pendingRatingAt` L103/L1239, `onPlaceholderClick` L532–552, `rate` L592–647.
- `src/views/CosmosStudy.ts` around L220–250.
- `src/views/FlashcardStudyView.ts`: `cardShownAt` L122/L511/L839.
- `src/study/StudySessionManager.ts` `recordReview` L125–201.
- grep for `revealedAt` and `elapsedMs` in the mind map study code to find the mind-map path.
- Put the anchor and cap in a small pure helper with a unit test.

## Acceptance criteria
- A note-study rating logs `e` ≈ the time since the previous rating (or since study started), capped at 60 s.
- Flashcard, note, line and Cosmos study all apply the same cap.
- Unit test on the helper.

## Test plan
In note study, wait about 15 s on a card, then reveal and rate it. Open Stats: Today's Time rises by about 15 s, not 1 s. Leave a card open 2 minutes, then rate it: Time rises by at most 1 minute.

## Batch implementation notes (awaiting manual test)

### Approach
A new pure module `src/study/study-clock.ts` holds `MAX_CARD_MS` (60 s), `capElapsed` and `StudyClock`. A `StudyClock` is anchored when a session starts and moves on at each rating (`lap()` returns the capped time since the anchor, then re-anchors). Note fences, note lines, mind-map study and Cosmos study each own one and call `lap()` where they used to subtract the reveal time. The cap itself sits in `StudySessionManager.recordReview`, so every surface that logs a review is capped.

### Decisions
- **Anchor = session start or the previous rating**, not "drawn". A fence redraws on every reveal and rating (and T119's undo redraws one fence), so a per-draw timestamp would reset on redraws. The previous-rating anchor needs no redraw handling and sums to roughly wall-clock study time.
- **One clock per note, shared by fences and lines.** They are one session (`LineRevealProcessor` owns the mode), so a fence rating followed by a line rating times from the fence rating. The clock lives on the note's reveal state and `NoteStudyProcessor` reaches it through `lineReveal.lapStudyClock(path)`. Outside a session that returns `null` and the fence falls back to the old reveal-to-rate gap.
- **Undo restarts the clock** (`unmarkFenceRated` calls `clock.start()`), so an undone card is timed from the undo. T119's redraw does not touch the clock, so an open bar is unaffected.
- **60 s cap: Flashcard study had none before.** Its `cardShownAt` anchor was already right, but a card left open logged the whole gap. Capping in `recordReview` fixes it there and for every other surface in one place. Anki's cap is also 60 s by default.
- **Mind-map study had the same bug** (reveal-anchored `mindmapStudyPendingRatingAt`), and the same fix applied: a `StudyClock` started in `enterMindmapStudy`, stopped in `exitMindmapStudyMode`.
- **Cosmos**: `start()`/`stop()` bracket the clock; `rate()` laps it. Anchoring at `arrive()` was rejected because free exploration picks cards by clicking, and the browsing before the click is study time.
- Past review-log entries are not rewritten.
- Not changed: one rating that reaches several cards (a line with several cards, a Cosmos node) logs the full elapsed time on each card, so the day's Time over-counts there. That is pre-existing; splitting it is a separate decision.
- A fence rating outside a study session is not expected (the bar only appears in study), and uses the reveal fallback if it happens.

### Surface map
| File | Change |
|---|---|
| `src/study/study-clock.ts` | New: `MAX_CARD_MS`, `capElapsed`, `StudyClock` |
| `src/study/study-clock.test.ts` | New: unit tests for the cap and clock (anchor, lap, cap, undo restart, no session) |
| `src/study/StudySessionManager.ts` | `recordReview` logs `capElapsed(elapsedMs)` |
| `src/views/LineRevealProcessor.ts` | `pendingRatingAt` replaced by a per-note `clock`; started in `toggleStudy`, stopped in `endStudy`, restarted on a fence undo; new `lapStudyClock` |
| `src/views/NoteStudyProcessor.ts` | Fence rating takes its elapsed time from `lapStudyClock`, reveal gap as fallback |
| `src/views/MindMapView.ts` | `mindmapStudyPendingRatingAt` replaced by `mindmapStudyClock` |
| `src/views/CosmosStudy.ts` | `revealedAt` replaced by `clock` |
| `src/views/NoteStudyProcessor.dom.test.ts` | Mock gains `lapStudyClock`; one test that the logged time comes from the clock |

### Fixture
None needed: any note with due cards (for example the existing fixtures under `vault/tests/`) works. A new fixture would add nothing, since the check is the Stats Time figure, not card content.

### Could not verify
Nothing was run in Obsidian. The Stats figure after a real session, and the mind-map and Cosmos paths, are covered by unit tests only for the clock and the fence path. Lint and the full vitest suite pass; no build was run (per the batch instructions for this ticket).

### Manual test
1. Open a note with several due fence or line cards, start Note study, and note Stats' Today Time.
2. Wait about 15 s, reveal and rate a card. Time rises by about 15 s, not 1-2 s.
3. Rate the next card after 5 s: Time rises by about 5 s.
4. Leave a card open for 2 minutes and rate it: Time rises by 60 s at most.
5. Undo a fence rating, wait 10 s, reveal and rate again: that review logs about 10 s.
6. Repeat 2 and 4 in mind-map study and Cosmos study; in Flashcard study check 4 only (it had no cap).
