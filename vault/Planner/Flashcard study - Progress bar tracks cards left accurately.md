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
status: To-Do
batch: 15
priority:
progress:
date_created: 2026-11-24T00:20:16.000Z
date_modified: 2026-11-24T00:20:16.000Z
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
