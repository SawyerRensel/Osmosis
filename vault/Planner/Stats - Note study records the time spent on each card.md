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
status: Done
batch: 15
priority:
progress:
date_created: 2026-11-24T23:17:08.000Z
date_modified: 2026-11-26T18:46:00.000Z
date_start_scheduled: 2026-11-24T23:46:37.000Z
date_start_actual: 2026-11-24T23:46:37.000Z
date_end_scheduled: 2026-11-26T18:46:00.000Z
date_end_actual: 2026-11-26T18:46:00.000Z
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/53
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

## What was implemented

Shipped in [PR #53](https://github.com/SawyerRensel/Osmosis/pull/53) → `release/0.0.6` (batch 15, commit `17e082f`).

### The cause

Note study timed each rating from when the answer was *revealed* to when it was rated, not from when the card became the question. Measured from `ref/screenshots/2026-11.mobile-android.md`: today's log runs 06:43 to 07:11 (about 27 minutes), and of 76 entries the 35 flashcard-mode reviews log `e` of 2 to 42 s, matching the gaps between timestamps, while the 41 note-mode reviews log only about 0.6 to 12 s (mostly 1 to 2 s) while being 10 to 40 s apart. The sum is the 10.2 min Stats showed. Mind map study had the same reveal-anchored bug (`mindmapStudyPendingRatingAt`). Separately, Flashcard study had no cap, so a card left open logged the whole gap.

### The fix

A new pure module `src/study/study-clock.ts`: `MAX_CARD_MS` (60 s), `capElapsed`, and `StudyClock`, anchored when a session starts and advanced at each rating (`lap()` returns the capped time since the anchor, then re-anchors). Note fences, note lines, mind map study and Cosmos study each own one and call `lap()` where they used to subtract the reveal time. The cap itself sits in `StudySessionManager.recordReview`, so every surface that logs a review is capped.

### Decisions worth remembering

- **Anchor = session start or the previous rating**, not "drawn". A fence redraws on every reveal and rating (and T119's undo redraws one fence), so a per-draw timestamp would reset on redraws. The previous-rating anchor needs no redraw handling and sums to roughly wall-clock study time.
- **One clock per note, shared by fences and lines** (one session, owned by `LineRevealProcessor`); `NoteStudyProcessor` reaches it through `lineReveal.lapStudyClock(path)`. Outside a session that returns `null` and the fence falls back to the old reveal-to-rate gap.
- **Undo restarts the clock** (`unmarkFenceRated` calls `clock.start()`); T119's redraw does not touch it, so an open bar is unaffected.
- **60 s cap**, in `recordReview` so one place fixes every surface. Anki's default is also 60 s.
- **Cosmos:** `start()`/`stop()` bracket the clock and `rate()` laps it. Anchoring at `arrive()` was rejected because free exploration picks cards by clicking, and the browsing before the click is study time.
- **Past review-log entries are not rewritten.**

### Surface map

| File | Change |
|---|---|
| `src/study/study-clock.ts` | New: `MAX_CARD_MS`, `capElapsed`, `StudyClock` |
| `src/study/study-clock.test.ts` | New: cap and clock (anchor, lap, cap, undo restart, no session) |
| `src/study/StudySessionManager.ts` | `recordReview` logs `capElapsed(elapsedMs)` |
| `src/views/LineRevealProcessor.ts` | `pendingRatingAt` replaced by a per-note `clock`; started in `toggleStudy`, stopped in `endStudy`, restarted on a fence undo; new `lapStudyClock` |
| `src/views/NoteStudyProcessor.ts` | Fence rating takes its elapsed time from `lapStudyClock`, reveal gap as fallback |
| `src/views/MindMapView.ts` | `mindmapStudyPendingRatingAt` replaced by `mindmapStudyClock` |
| `src/views/CosmosStudy.ts` | `revealedAt` replaced by `clock` |
| `src/views/NoteStudyProcessor.dom.test.ts` | Mock gains `lapStudyClock`; one test that the logged time comes from the clock |

### Test fixture

None. Any note with due cards works (for example the existing fixtures under `vault/tests/`), since the check is the Stats Time figure, not card content.

### Follow-ups

- **A rating that covers several cards logs the full elapsed time on each card** (a line with several cards, a Cosmos node), so the day's Time over-counts there. Pre-existing and left alone: splitting the time across cards is a separate decision.
- The clock and the fence path have unit tests; the mind map and Cosmos paths do not, and the Stats figure after a real session was checked only by Sawyer's manual test.
- A fence rating outside a study session is not expected (the bar only appears in study); it uses the reveal fallback if it happens.
