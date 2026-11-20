---
title: Sequential study - New, learn and due counts
summary: "Batch 12 (T92). Anki-style new|learn|due counts strip in the sequential study tab, with the current card's bucket underlined."
tags:
  - task
calendar:
  - Feature
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
date_start_scheduled: 2026-11-19T03:35:41Z
date_start_actual: 2026-11-19T03:35:41Z
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

# Sequential study - New, learn and due counts (T92)

## What do you need built?

A slim counts strip in the sequential study tab, under the view header and above
the card, as in AnkiDroid (Sawyer's screenshot: `0 5 7`). It shows three
numbers:

- **new** (blue): new cards still to come in this session
- **learn** (red): learning/relearning cards still to come, including deferred ones waiting on their timer
- **due** (green): review cards still to come

The bucket the **card on screen** belongs to is underlined. This follows Anki:
the current card counts in its own bucket.

It replaces or absorbs whatever "remaining" counter the study header shows today
(`remaining` at `SequentialStudyModal.ts:~399` before T91's port). Don't show
two counters.

## Behaviour

- The counts update after every rating, exclude, undo, and when a deferred learning card's timer releases it.
- A card rated Again moves from new/due into learn.
- Use theme-aware colours (CSS variables such as `--color-blue`, `--color-red`, `--color-green`), not hard-coded hex.
- Same strip on desktop and mobile.

## Depends on

**T91** (study as a view) must land first. This builds into the view T91
creates. Read T91's "Batch implementation notes" in its Planner note before
starting.

## Acceptance criteria

- [ ] The three counts are correct at session start for a deck mixing new, learning and review cards (it matches the dashboard's deck counts for that deck, given the same daily limits).
- [ ] The counts move correctly through rate / Again / exclude / undo / deferred-release.
- [ ] The current card's bucket is underlined.
- [ ] The count logic is a pure function with unit tests (classify a card → bucket; count a queue + deferred list).

## Test plan

- Unit: as above.
- Manual: open a deck with all three kinds of card (a fixture with back-dated cards: memory `manual-test-fixture-dates`). Check the numbers against the dashboard row. Rate a new card Again → new −1, learn +1. Undo → it reverts. Exclude a review card → due −1.

## Context budget (~15k tokens)

| Read | Range | ~Tokens |
|---|---|---|
| The study view file T91 produced | whole (~7k) | ~7.5k |
| `src/study/types.ts` | whole | 0.3k |
| `src/study/DeckTreeBuilder.ts` | whole (how the dashboard counts new/learn/due) | 0.8k |
| `src/study/StudySessionManager.ts` | queue building only | ~1.5k |
| `styles.css` | the study-view rules T91 wrote | ~1k |

## What was implemented

**Where it shipped:** [PR #50](https://github.com/SawyerRensel/Osmosis/pull/50) (batch 12, branch `batch/12-study-tab`), merged into `release/0.0.6`. Sawyer tested it by hand on 2026-11-20. It failed the first test and passed after the round-2 fix described in the *Round 2 fix* subsection below.

The batch worker wrote this record when the code was committed. It covers the cause, the fix, the decisions and the surface map.

Code commit: `2b1b577` on `batch/12-study-tab`.

### Approach

A pure module, `src/study/session-counts.ts`, does the counting:

- `bucketOf(studyCard)`: `isNew` → **new**; state `learning`/`relearning` →
  **learn**; any other scheduled card → **due**. These are the dashboard's rules
  (`CardStore.getCardCountsByDeck`), so with the same daily limits the strip at
  session start matches the deck row.
- `countSession(queue, currentIndex, deferred)` counts `queue[currentIndex..]`
  (the card on screen counts in its own bucket, as in Anki) plus the deferred
  learning copies, and returns `current` = the on-screen card's bucket, or
  `null` while waiting or once the session is done.

`SequentialStudyView` builds three spans (`.osmosis-study-count-new|learn|due`)
in the progress row and fills them from `updateCounts()`, which
`updateProgress()` calls (and so renderCard and renderWaiting call it). The
completion screen calls it too, so it ends on `0 0 0` with nothing underlined.

### Decisions worth remembering

- **The counts replace the `n / total` text; the progress bar stays.** The
  ticket said not to show two counters. The bar is not a number, and it is the
  only cue for how far through the session you are, so I kept it with the
  counts to its right in the same row. To make the strip match AnkiDroid
  exactly, drop the bar. The `Session complete` screen already says how many
  cards were reviewed, so the old `N reviewed` text went too.
- **A queued card's bucket comes from the `isNew` flag, not from `card.due`.**
  The queue holds the store's card objects, and a rating mutates them in place.
  `isNew` is fixed when the queue is built, so a new card shown again after an
  undo still counts as new.
- **No refresh when a deferred card's timer fires while a card is on screen.**
  The card moves from `deferredCards` into the queue and stays in learn, so the
  three numbers cannot change. A unit test pins this. While waiting, the release
  calls `renderCard`, which refreshes anyway.
- **Deferred learning cards count in learn however long their step is.** Anki
  counts only the learn cards inside its learn-ahead limit. This session shows
  every deferred card eventually (on the waiting screen), so it counts them all,
  which matches the ticket's "including deferred ones waiting on their timer".
- **Colours**: the dashboard's deck-count palette (changed in round 2, see
  below; round 1 used `--color-blue/red/green`), with semibold tabular
  numbers. The current bucket gets a 2px underline. The same
  CSS applies on desktop and phone. Each span has an `aria-label` such as
  `Due: 3`.
- **New fixture instead of reusing `study-tab.md`.** T91's fixture has no
  learning card, and its prose (and Sawyer's pending T91 test) says "6 waiting",
  so I left it alone.

### Surface map

| File | Change |
|---|---|
| `src/study/session-counts.ts` | New: `bucketOf`, `countSession`, `CountBucket`, `SessionCounts` |
| `src/study/session-counts.test.ts` | New: 13 tests covering classify, start, Good, Again (new and review), exclude/undo, undo after fired copy, release, waiting, done |
| `src/views/SequentialStudyView.ts` | `progressText` replaced by `countEls` + `COUNT_BUCKETS`; `updateCounts()` called from `updateProgress()` and `renderComplete()` |
| `styles.css` | `.osmosis-study-progress-text` replaced by `.osmosis-study-counts` / `.osmosis-study-count-*` / `.is-current` |
| `e2e/fixtures/study-counts.md`, `vault/tests/flashcard/study-counts.md` | New fixture |

### Fixture

`vault/tests/flashcard/study-counts.md` (master copy:
`e2e/fixtures/study-counts.md`), deck **Testing › Study Counts**: 3 review
(due), 1 learning, 1 relearning, 2 new, all dated in the past. I parsed it and
confirmed the buckets come out 2 new / 2 learn / 3 due. The strip and the
dashboard row should both read **2 | 2 | 3**.

### Not verified before the manual test

- Nothing was checked in Obsidian: not the visual result (colours under each
  theme, the underline, the fit beside the bar on a phone), and not the live
  flow through the view's handlers. The unit tests model the view's queue
  operations; they do not run the view.

### Round 2 fix

Code commit: `36290d6`. Sawyer's test: "Flashcard study mode new/learn/due
colors should match our deck dashboard colors." The strip showed blue, red and
green.

- **Cause:** the ticket asked for `--color-blue/red/green`, so the strip used
  Obsidian's palette. The dashboard pills never did: new is
  `--interactive-accent`, learn is `hsl(30, 75%, 50%)` (orange) and due is
  `hsl(140, 50%, 42%)`, the same values in light and dark.
- **Fix:** three variables, `--osmosis-count-new`, `--osmosis-count-learn` and
  `--osmosis-count-due`, declared once on `.osmosis-dashboard,
  .osmosis-study-view`. The dashboard pills and the study strip both read them,
  so the two cannot drift apart. They are declared on the two containers and
  not on `body`, so the accent resolves where a theme might override it. A new
  surface that shows these counts joins that selector.
- The dashboard's learn and due pill tints now come from the same variables
  through `color-mix(in srgb, <var> 12%, transparent)`. That gives the same
  pixels as the old `hsla(..., 0.12)` literals. The new pill's tint is
  unchanged (`--interactive-accent-rgb`).
- No TypeScript changed, and the counting logic is untouched. The underline
  rule (`.osmosis-study-count.is-current`) is as before.
- **Zero counts left as they were:** the dashboard greys a 0 (`--text-faint`)
  and the strip still colours it. Greying it would need a class toggle in
  `updateCounts()`, and the feedback was about the hues. If Sawyer wants
  matching greyed zeros, that is a one-line follow-up.
- **Not converted:** the card browser's state badges
  (`.osmosis-browse-state-*`) are a third copy of the same values. Their
  comment says to change them alongside the dashboard. They could join the
  variables later; I left them alone to keep this fix to the study strip.

| File | Change |
|---|---|
| `styles.css` | New `--osmosis-count-*` variables on `.osmosis-dashboard, .osmosis-study-view`; `.osmosis-dash-new/learn/due` and `.osmosis-study-count-new/learn/due` read them |
