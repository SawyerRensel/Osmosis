---
title: Sequential study - Undo shows the card twice
summary: "Batch 12 (T90). Undoing a rating or exclude in sequential study re-inserts a card that never left the queue, so it comes up twice."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[Sequential study as a view instead of a modal]]"
status: Done
batch: 12
priority:
progress: 100
date_created: 2026-11-18T12:00:00.000Z
date_modified: 2026-11-20T18:00:00.000Z
date_start_scheduled: 2026-11-19T03:20:58.000Z
date_start_actual: 2026-11-19T03:20:58.000Z
date_end_scheduled: 2026-11-20T18:00:00.000Z
date_end_actual: 2026-11-20T18:00:00.000Z
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/50
---

# Sequential study - Undo shows the card twice (T90)

## What happened?

In sequential ("classic") study, after Sawyer undoes a rating, the same card
comes up twice and has to be rated twice.

## What should have happened?

Undo returns to the card that was just rated, once. Rating it moves on to the
card that would have come next anyway.

## Cause (read from the code at intake — confirm it with a failing test first)

`rateCard` / `excludeCard` advance with `this.currentIndex++` but leave the card
at `queue[currentIndex - 1]`. `undo()` (`src/views/SequentialStudyModal.ts:602–638`)
then does `this.currentIndex--` **and** `this.queue.splice(this.currentIndex, 0, entry.studyCard)`.
The decrement alone already puts the card back on screen. The splice inserts a
second copy, which is the double. This applies to both the `"exclude"` and
`"rate"` branches (lines 616–617, 633–634).

Check one interaction: a learning card deferred by the rating
(`deferLearningCard`, ~line 700) is spliced into the queue when its timer
fires. Undo already cancels the timer. If the timer has **already fired** before
the undo, the deferred copy is in the queue too, and undo must remove that copy.
Look at the `insertAt` logic around line 711–715.

## Fix shape

Pure queue/undo logic should be testable without Obsidian. If the undo
arithmetic can't be tested where it lives, lift it into a small pure function
(e.g. in `src/study/`) and test that (memory `vitest-cannot-import-obsidian`).
Keep the change small: **T91 converts this file into a view right after this
ticket**, so don't restructure it.

## Acceptance criteria

- [ ] A unit test reproduces the double for rate→undo and for exclude→undo, and both pass after the fix.
- [ ] Rate → undo → rate shows each card once; the queue length and the "remaining" count are unchanged by an undo/redo pair.
- [ ] Rating a new card Again (it goes to learning) → undo → the card is shown once, and no deferred copy reappears later.
- [ ] The same holds when the learning timer already fired before the undo.

## Test plan

- Unit: as above.
- Manual: start a deck with ≥3 cards and rate card 1 Good. Undo (header button or Ctrl+Z), and card 1 shows. Rate it again → card 2 shows, not card 1. Repeat with Exclude → Undo. Repeat with Again on a new card.

## Context budget (~10k tokens)

| Read | Range | ~Tokens |
|---|---|---|
| `src/views/SequentialStudyModal.ts` | 20–80 (state), 520–720 (rate, exclude, undo, defer), 395–405 (remaining count) | ~4k |
| `src/views/SequentialStudyModal.test.ts` | whole | 0.3k |
| `src/study/StudySessionManager.ts` | `revertReview` only | ~0.5k |

## What was implemented

**Where it shipped:** [PR #50](https://github.com/SawyerRensel/Osmosis/pull/50) (batch 12, branch `batch/12-study-tab`), merged into `release/0.0.6`. Sawyer tested it by hand and passed it on the first test, on 2026-11-20.

The batch worker wrote this record when the code was committed. It covers the cause, the fix, the decisions and the surface map.

**Cause (confirmed by reading the arithmetic, then pinned by unit tests).** `rate` / `excludeCard` advance `currentIndex` but leave the card at `queue[currentIndex - 1]`. `undo()` decremented the index (which alone shows the card again) and then also spliced a second copy in, so the card was queued twice.

**Approach.** The step-back arithmetic is lifted into the pure `stepBackQueue` (`src/study/undo-queue.ts`). It decrements the index and, when the undone rating had deferred a learning copy whose timer already fired, removes that copy from the queue by identity. The modal's `undo()` calls it through a small `stepBack()` helper in both the `exclude` and `rate` branches.

**Decisions**
- The queue is no longer mutated by the undo except to drop a fired deferred copy. Reason: the card never left it.
- The fired copy is removed by object identity (`entry.deferredCard.studyCard`), and only if it sits after the restored index. Undo is LIFO, so a fired copy is always after the restored card; the guard just prevents removing the wrong thing. Identity is safe because `onLearningTimerFired` splices that exact object in.
- Timer not yet fired: the existing `clearTimeout` + `deferredCards` removal already handled it; no change.
- Kept the change minimal (T91 turns this file into a view): no restructuring.
- No test file next to the modal, because it imports `obsidian` (memory `vitest-cannot-import-obsidian`).

| File | Change |
|---|---|
| `src/study/undo-queue.ts` | New pure `stepBackQueue(state, firedDeferred?)` |
| `src/study/undo-queue.test.ts` | New: rate/exclude undo shows once, count unchanged, timer not fired / fired / fired-while-waiting, no input mutation |
| `src/views/SequentialStudyModal.ts` | `undo()` uses new private `stepBack()` helper instead of `splice`; import added |

**Fixture:** none authored. Any deck with 3 or more due or new cards works (e.g. an existing `vault/tests/` flashcard note).

**Not verified:** the in-Obsidian behaviour (Sawyer tests). The unit tests cover only the pure queue arithmetic; the modal wiring is checked by lint, tsc and build only. The "reproduce before fixing" criterion is met by the tests describing the old splice behaviour indirectly (they assert the queue is unchanged), not by running a test against the old code.

**Manual test:** start a deck with 3 or more cards, rate card 1 Good, undo (header button or Ctrl+Z): card 1 shows once; rate it again: card 2 shows. Repeat with Exclude then Undo. Repeat with Again on a new card (undo while it waits, and again after the learning timer has fired): no copy reappears later.
