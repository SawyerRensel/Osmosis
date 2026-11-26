---
title: Flashcard study - Progress bar tracks cards left accurately
summary: "T117. The Flashcard study progress bar jumps ahead early in a session, and the waiting screen still counts learning cards the Decks tab doesn't. Make the bar proportional to cards studied vs. left, and match the Decks tab while waiting."
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
date_created: 2026-11-24T00:20:16.000Z
date_modified: 2026-11-26T18:46:00.000Z
date_start_scheduled: 2026-11-24T01:05:27.000Z
date_start_actual: 2026-11-24T01:05:27.000Z
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

# Flashcard study - Progress bar tracks cards left accurately (T117)

## What Sawyer asked
> It doesn't feel accurate. It feels like it progresses too quickly at the start of a study (not proportional to the number of cards studied vs. what I have left), and when I hit the "Waiting for the next card..." it still shows I have cards to study when the deck tab does not.

Screenshots: `ref/screenshots/Screenshot_20261123-061848.png` (counts 0 7 51, bar ~10%), `…060339.png` (1 2 2, bar ~33%), `…060457.png` (waiting screen: counts 0 3 0, bar ~80%, "3 cards still in learning").

## Settled with Sawyer
- **While waiting, match the Decks tab.** The counts show only cards due now (so 0 0 0 while every remaining card is a not-yet-due learning card), and the bar reads full. The "N cards still in learning" text keeps the pending ones. When a learning card comes due, it reappears in the counts and the bar.

## Current state
- `src/views/FlashcardStudyView.ts` (1198 lines):
  - `updateProgress` 694–700: `pct = (reviewed+1)/(reviewed + remaining + deferred)`. The +1 persists on the waiting screen.
  - `updateCounts` 703–709.
  - `renderWaiting` 1025–1063, reached from `renderCard` 495–505.
  - `deferLearningCard` 968; rate path 823–870.
- `src/study/session-counts.ts` (89 lines): `bucketOf` 17, `countSession` 33–46 (counts `queue[currentIndex..]` plus deferred), `countNoteSession` 70–89.
- `src/views/StudyProgressStrip.ts` (60 lines) is the shared strip.
- Queue construction: `StudySessionManager.ts` (new-card limit ~55–75).
- Decks tab counts: `CardStore.getCardCountsByDeck` (`src/store/CardStore.ts` 132–157). New means no `due`; learn and due count only `due <= now`; excluded and disabled cards are skipped. No daily limits.
- **Diagnose "too fast at start":**
  - Check whether `reviewed` counts ratings (including Again repeats) while the denominator counts cards, so each Again inflates progress.
  - Check whether the session total is smaller than the Decks tab's total (the daily new limit), and how the +1 skews small sessions.
  - Decide on a definition and record it. Suggested: progress = cards finished for this session / (finished + cards still due now, counting pending repeats of due-now cards). A card that is due again counts as not finished.
- Put the progress math in `src/study/` as a pure function with unit tests; the view only calls it. If Note study / mind map study (`LineRevealProcessor.ensureStrip` 1037–1055, `MindMapView.ensureMindmapStudyStrip` 1977–1990) share the flaw, report it and don't change those surfaces in this ticket.

## Acceptance criteria
- Studying 10 due cards where every rating is Good: the bar advances 10% per card. With an Again in the mix, the bar does not run ahead of the cards left.
- On the waiting screen, the counts equal the Decks tab's counts for that deck (0 0 0 when nothing is due) and the bar is full. When a learning card comes due, its count returns.
- Session counts at the start of a session match what the queue will actually present.
- Unit tests cover the progress function, including Again repeats and the waiting state.

## Test plan
Fixture deck with ~6 back-dated due cards. Study: rate Good on each and watch the bar step evenly. Rate Again on one: the bar does not jump. When only learning cards remain, the waiting screen shows counts matching the Decks tab and a full bar; wait for the countdown and the card returns with learn 1.

## Context budget (~50k tokens)
- `FlashcardStudyView.ts` 480–520, 680–720, 820–1070; `src/study/session-counts.ts` whole; `StudyProgressStrip.ts` whole; `StudySessionManager.ts` 1–120; `CardStore.ts` 125–160.

## Conventions
- Batch 15 ticket: commit `feat(T117): …`/`fix(T117): …` plus one `docs(T117)` note commit setting `status: In-Review` with a "Batch implementation notes (awaiting manual test)" section (approach, decisions, surface map, fixture, test steps, what was not verified). Stage by explicit path; `git diff --cached --stat` before each commit; never `git stash`; don't push.
- Lint → test → build, one at a time (7 GB RAM). Pure logic goes outside `src/views/` (vitest cannot import obsidian) and gets unit tests.
- Fixtures: master copy in `e2e/fixtures/`, copied to `vault/tests/`; back-date every fixture card; neutral subject domains (no biology).

## What was implemented

Shipped in [PR #53](https://github.com/SawyerRensel/Osmosis/pull/53) → `release/0.0.6` (batch 15, commit `f85873c`).

### The cause

The old formula was `pct = (reviewed + 1) / (reviewed + queueLeft + deferred)`, with two faults:

1. **`reviewed` counts ratings, but `deferred` still holds the same cards.** A rating that sends a card into learning adds 1 to the numerator and leaves the card in the denominator, so it is counted as done and as left. New cards rated Good always go into learning (steps 1m, 10m), so a pass of new cards drives the bar up while nothing is finished: with 20 new cards rated Good the old bar read 21/40 = 52% after the first pass, with 0 cards finished.
2. **The `+1` counts the card on screen as done.** The first card of a 3-card session already read 33%. The waiting screen kept the +1 as well.

The three screenshot bar widths fit the old formula (inferred from pixel widths, not measured in the app): 1 2 2 at about 33% is 2/6, 0 7 51 at about 10.8% is 7/64, and the waiting screen 0 3 0 at about 75% is 6/8. The session queue was not the cause: start-of-session counts equal `buildQueue`'s output. They differ from the Decks tab only by the daily new and review limits (20 and 200 by default), which the Decks tab ignores.

### The fix

`sessionStatus(queue, currentIndex, deferred, now)` in `src/study/session-counts.ts` is a pure function returning both the counts and the percent; `FlashcardStudyView.updateProgress` only calls it.

- Progress = finished / (finished + left). *Finished* is distinct card ids before `currentIndex` that are neither later in the queue nor waiting in `deferred`. *Left* is the card on screen, the rest of the queue, and the deferred learning cards.
- **Waiting screen** (queue exhausted): left counts only deferred cards with `dueAt <= now`, so the counts match the Decks tab (0 0 0), and the bar reads full whenever left is 0. This was settled with Sawyer; the "N cards still in learning" text keeps the pending ones, and a card that comes due reappears in the counts and bar.
- The complete screen goes through the same path (100%, 0 0 0).

### Decisions worth remembering

- **A card rated into learning is not finished until it graduates.** An Again leaves the bar exactly where it was, and a first pass of new cards rated Good keeps the bar at 0% until their 10-minute repeats come back. Accurate under this definition; Sawyer's test passed on it.
- **The bar visibly jumps at the waiting screen**, by the settled decision. With 10 cards and one Again: about 80% on the last card, 100% while waiting, then 90% when the card returns.
- **Progress is derived from queue state, not the `reviewed` counter**, so undo is correct automatically. `reviewed` remains only for the "You reviewed N cards" text.
- **Excluded cards count as finished** for the session.
- Counts during study (not waiting) are unchanged: deferred learning cards still count in learn.

### Surface map

| File | Change |
|---|---|
| `src/study/session-counts.ts` | `PendingStudyCard`, `SessionStatus`, `sessionStatus()` |
| `src/study/session-counts.test.ts` | 10 tests: 10% steps, 0% first card, Again does not move the bar, Again-then-Good counts once, new-card pass, waiting 0 0 0 and full, due learning card counts again, fired card, undo, complete |
| `src/views/FlashcardStudyView.ts` | `updateProgress` calls `sessionStatus`; `updateCounts` removed; complete screen uses `updateProgress` |
| `e2e/fixtures/study-progress.md` | New fixture (copy in `vault/tests/flashcard/`) |

### Test fixture

`vault/tests/flashcard/study-progress.md` (master `e2e/fixtures/study-progress.md`), deck **Testing › Study Progress**: 10 sailing review cards, all due between 2026-11-10 and 2026-11-19 (back-dated). The Decks row should read 0 | 0 | 10.

### Follow-ups

- Note study (`LineRevealProcessor.studyProgress`) and mind map study (`MindMapView.ensureMindmapStudyStrip`) use rated / total with no +1 and no in-session repeats, so they do not have this flaw. One small mismatch left alone: a card rated Again counts as done in their bar while `countNoteSession` moves it to learn.
- The first-pass-of-new-cards-stays-at-0% behaviour is a deliberate consequence of the definition; revisit only if it reads badly in practice.
