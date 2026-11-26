---
title: Flashcard study - Bury a card until tomorrow
summary: "T121. Anki-style manual Bury in Flashcard study: a header button and the - key hide the current card from every deck until the next day starts."
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
date_start_scheduled: 2026-11-24T23:47:50.000Z
date_start_actual: 2026-11-24T23:47:50.000Z
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

# Flashcard study - Bury a card until tomorrow (T121)

## What Sawyer asked
> Let's add an ability to bury a card in flashcard mode just like how Anki does it

Settled at intake:
- Manual bury only: a button plus the `-` hotkey, as in Anki.
- No automatic sibling burying.
- Flashcard study mode only.

## Design
- **Action:** add a header action in `FlashcardStudyView` beside exclude, go-to and undo. Use a Lucide icon such as `archive` or `calendar-x` and the tooltip "Bury until tomorrow". The `-` key does the same.
- **Behaviour:** the card leaves the current session at once, as `excludeCard` does, and is hidden from every deck, count and queue until the next local midnight. That matches Anki's "until next day". Osmosis has no day-rollover setting, so local midnight is the day start.
- **Storage:** add a `buriedUntil` timestamp (epoch ms or ISO) to the card's schedule entry in the same place `disabled` lives (`ScheduleEntryYaml`, `ScheduleStore`, fence schedules through `FenceWriter`). This keeps it per card and synced, like the rest of the schedule. An expired `buriedUntil` behaves as absent and may be cleared lazily the next time that entry is written. Only cards Osmosis already schedules can be buried (the ones in the queue).
- **Filtering:** `CardStore` getters (L67/82/97/111/123/136) already skip `excludeFromDecks || disabled`. Add `buriedUntil > now` there so the decks tab, counts, the study queue and the other study modes all agree.
- **Undo:** push an undo entry `{type: "bury"}`. Undo clears `buriedUntil` and puts the card back, like exclude's undo.
- **Day-start helper:** extract one pure `nextDayStart(now)` helper. Private `startOfDay` copies already live in `src/stats/aggregate.ts` L772–776 and `src/browse/cards.ts` L362; leave those alone.
- No Notice is needed beyond what exclude shows. Mirror exclude's feedback.

## Context budget (~70k)
- `src/views/FlashcardStudyView.ts` (1192 lines). Read: `onOpen` L203–233, `updateHeaderActions` L379–384, `excludeCard` L867–890, `undo` L893–931, `registerKeyboard` L1122–1174.
- `src/study/StudySessionManager.ts`: `buildQueue` L57–90, `setLineCardDisabled` L269–274.
- `src/store/CardStore.ts` (239, whole file).
- `src/database/types.ts` `Card` L110–135.
- `src/store/ScheduleStore.ts`: `ScheduleEntryYaml` L44–54, `setDisabled` ~L117, merge ~L296–345, disabled reader L463–487.
- `src/store/FenceWriter.ts`: grep `writeExclude` / `disabled` and read only those functions.
- Unit tests: a schedule round-trip of `buriedUntil`, `CardStore` filtering, `nextDayStart`.

## Acceptance criteria
- In Flashcard study, the Bury button or `-` removes the current card and moves to the next one. Counts drop.
- The buried card doesn't appear in any deck count or study session (Flashcard, note, mind map, Cosmos) until local midnight, then returns as it was, with the schedule otherwise untouched.
- Undo un-buries it.
- Works for line, fence and frontmatter-schedule cards.
- Unit tests pass.

## Test plan
Study a deck and bury one card with `-`. The next card shows and the deck count drops by one. Close and reopen study: the card is still gone. Undo: it is back. To check expiry without waiting a day, set the `buriedUntil` the worker documents to a past time, reload (Ctrl+R), and the card returns.

## What was implemented

Shipped in [PR #54](https://github.com/SawyerRensel/Osmosis/pull/54) → `release/0.0.6` (batch 16, commit `8741c79`).

### The cause

There was no bury concept. Settled at intake: manual bury only (a button plus the `-` hotkey, as in Anki), no automatic sibling burying, Flashcard study only.

### The fix

A bury is one more per-card dimension stored beside the schedule, like `disabled`: `Card.buriedUntil` (epoch ms in memory). `isBuried(card, now)` (`buriedUntil > now`) is the single test every study filter applies, so a past value behaves as absent and nothing has to wake at midnight. Flashcard study's Bury mirrors exclude: it sets the store at once, persists, pushes a `{type: "bury"}` undo entry and advances, so the strip counts drop the same way. `StudySessionManager.setBuried(card, until | null)` routes the write by carrier. A bury is not a review: nothing reaches the review log and the schedule is untouched.

Storage format:

- **Line cards** (osmosis-schedule frontmatter): `buriedUntil: 2026-11-25T00:00:00` (local time, the same format as `due`) on the card's entry, nested under the group for an occluded line card. A new line card gets an entry holding only `buriedUntil`; un-burying removes the key and the stub. Staged through `ScheduleStore.setBuried` (same debounce as ratings), overlaid with pending changes in `main.ts`, read by `parseBuriedFrontmatter` into `CardSyncService`.
- **Fence cards**: `buriedUntil: 2026-11-25T05:00:00.000Z` (UTC ISO, the fence's `due` format). The fence's own card has it flat; a derived card (`-r`, `-cN`) has it inside its `r:`/`c1:` block, created holding only the bury when the card is still new and dropped again when un-burying empties it. Written by `FenceWriter.writeBuried` through `updateFenceBuried`.

### Decisions worth remembering

- **Any schedule write drops the bury** (a review, an undone review, a schedule removal), on disk and in `CardStore.updateSchedule`/`clearSchedule`: the lazy clearing of expired values. A bury staged in the same flush window as a schedule write is applied after it, so undoing a rating and then burying keeps the bury. In the fence carrier `buriedUntil` was added to the schedule key set for this reason; it also makes every header scanner recognize the line, which matters because an unrecognized key ends the metadata scan and puts the separator blank line in the wrong place.
- **The deck keeps its row.** `getAllDecks` and the folder-deck list still include buried cards, and `getCardCountsByDeck` creates the deck's row before it skips a buried card, so a deck whose only due card is buried shows `0 0 0` instead of vanishing. This matches Anki.
- **`writeBuried` uses `vault.process` inside the per-note write chain**, unlike `writeExclude`, which silently returns while the file is being written. Otherwise pressing `-` on two cards of one note in quick succession would drop the second bury.
- **Filters patched:** the `CardStore` due/new/count getters (`getNewCards*` gained an optional `now`), `note-scope` (note study), `mindmap-study.isDueOrNew` (mind map study and Cosmos route stops), `occlusion-steps.isDueOrNew`, and the line-reveal session plan.
- Icon `archive`, tooltip "Bury until tomorrow (-)". No Notice, the same as exclude. `nextDayStart(now)` lives in `src/study/bury.ts`; the private `startOfDay` copies were left alone.

### Surface map

| File | Change |
|---|---|
| `src/study/bury.ts` | New: `nextDayStart`, `isBuried` |
| `src/database/types.ts` | `Card.buriedUntil` |
| `src/store/CardStore.ts` | Getters skip buried cards; `setBuried`; schedule writes drop the bury |
| `src/store/ScheduleStore.ts` | `ScheduleEntryYaml.buriedUntil`, `pendingBuried`/`setBuried`/`getPendingBuried`, a fifth `applyScheduleEntries` dimension, `parseBuriedFrontmatter` |
| `src/store/FenceWriter.ts` | `updateFenceBuried`, `writeBuried`; `buriedUntil` counted as a schedule key |
| `src/card-gen/explicit.ts`, `src/card-gen/types.ts` | Parse fence `buriedUntil` (flat and nested) into the generated card |
| `src/card-gen/CardSyncService.ts` | `getLineBuried` dependency; copies the bury onto the card; header scan recognizes the key |
| `src/main.ts` | Wires `getLineBuried` with the pending overlay |
| `src/study/StudySessionManager.ts` | `setBuried`; `LineScheduleWriter.setBuried`; passes `now` to the new-card queries |
| `src/study/note-scope.ts`, `src/study/mindmap-study.ts`, `src/study/occlusion-steps.ts`, `src/views/LineRevealProcessor.ts` | Skip buried cards |
| `src/views/FlashcardStudyView.ts` | Bury header action, `-` key, `bury` undo entry |
| `src/study/bury.test.ts`, `src/study/StudySessionManager.test.ts` | Day start, store filters, frontmatter and fence round trips, routing |
| `e2e/fixtures/bury.md` | New fixture (copy in `vault/tests/flashcard/`) |

### Test fixture

`vault/tests/flashcard/bury.md` (master `e2e/fixtures/bury.md`), deck **Testing › Bury**: 2 line cards (one due, one new), a due basic fence card, and a bidi fence (forward due, reverse new). Expected counts **2 | 0 | 3**. Every date is in the past.

### Follow-ups

- **Stats and Browse do not filter buried cards.** A buried card is still a card with its schedule, so both still show it; only study queues and deck counts skip it. Deliberate, but Sawyer may want a "buried" marker in Browse.
- **The Decks dashboard does not refresh at midnight.** A buried card comes back the next time counts are computed, not on a timer.
- Occluded line and cloze-group buries are covered by unit tests only; the fixture has no image.
- Whether Obsidian's Scope matches `"-"` on every keyboard layout was not checked; some layouts may report a different `key` for it.
- Note study has no bury action. Burying in Flashcard study is respected when a note session next starts, but a bury made during a running note session does not change that session.
