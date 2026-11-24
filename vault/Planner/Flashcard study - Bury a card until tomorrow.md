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
status: In-Review
batch: 16
priority:
progress:
date_created: 2026-11-24T23:17:08.000Z
date_modified: 2026-11-25T00:20:00.000Z
date_start_scheduled: 2026-11-24T23:47:50.000Z
date_start_actual: 2026-11-24T23:47:50.000Z
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

## Batch implementation notes (awaiting manual test)

Code commit `8741c79` on `batch/16-bury-zoom-trees`. Not built (the orchestrator builds the batch).

### Approach
A bury is one more per-card dimension stored beside the schedule, like `disabled`: `Card.buriedUntil` (epoch ms in memory). `isBuried(card, now)` (`buriedUntil > now`) is the single test every study filter now applies, so a past value behaves as absent and nothing has to wake at midnight. Flashcard study's Bury mirrors exclude: it sets the store at once, persists, pushes a `{type: "bury"}` undo entry and advances, so the strip counts drop the same way. `StudySessionManager.setBuried(card, until | null)` routes the write by carrier. It is not a review, so nothing reaches the review log and the schedule is untouched.

### Storage format
- **Line cards** (osmosis-schedule frontmatter): `buriedUntil: 2026-11-25T00:00:00` (local time, the same format as `due`) on the card's entry, nested under the group for an occluded line card. A new line card gets an entry holding only `buriedUntil`; un-burying removes the key and the stub. Staged through `ScheduleStore.setBuried` (the same debounce as ratings), overlaid with pending changes in `main.ts`, and read by `parseBuriedFrontmatter` into `CardSyncService`.
- **Fence cards**: `buriedUntil: 2026-11-25T05:00:00.000Z` (UTC ISO, the fence's `due` format). The fence's own card has it flat. A derived card (`-r`, `-cN`) has it inside its `r:`/`c1:` block, which is created holding only the bury when the card is still new, and dropped again when un-burying empties it. Written by `FenceWriter.writeBuried` through `updateFenceBuried`.

### Decisions
- **Any schedule write drops the bury** (a review, an undone review, a schedule removal), on disk and in `CardStore.updateSchedule`/`clearSchedule`. This is the lazy clearing of expired values the design allowed. A bury staged in the same flush window as a schedule write is applied after it, so undoing a rating and then burying the card keeps the bury. In the fence carrier, `buriedUntil` was added to the schedule key set for this reason. It also makes every header scanner recognize the line, which matters: an unrecognized key ends the metadata scan, and the scan would then put the separator blank line in the wrong place.
- **The deck keeps its row.** `getAllDecks` and the folder-deck list still include buried cards. `getCardCountsByDeck` creates the deck's row before it skips a buried card, so a deck whose only due card is buried shows `0 0 0` instead of vanishing. This matches Anki.
- **`writeBuried` uses `vault.process` inside the per-note write chain**, unlike `writeExclude`, which silently returns while the file is being written. Pressing `-` on two cards of one note in quick succession would otherwise drop the second bury.
- **Filters patched:** the `CardStore` due/new/count getters (`getNewCards*` gained an optional `now`), `note-scope` (note study), `mindmap-study.isDueOrNew` (mind map study and Cosmos route stops), `occlusion-steps.isDueOrNew`, and the line-reveal session plan. Stats and Browse are not filtered. A buried card is still a card with its schedule.
- Icon `archive`, tooltip "Bury until tomorrow (-)". No Notice, the same as exclude.
- `nextDayStart(now)` lives in `src/study/bury.ts`. The private `startOfDay` copies were left alone.

### Surface map
| File | Change |
|---|---|
| `src/study/bury.ts` | New: `nextDayStart`, `isBuried` |
| `src/database/types.ts` | `Card.buriedUntil` |
| `src/store/CardStore.ts` | Getters skip buried cards; `setBuried`; schedule writes drop the bury |
| `src/store/ScheduleStore.ts` | `ScheduleEntryYaml.buriedUntil`, `pendingBuried`/`setBuried`/`getPendingBuried`, 5th `applyScheduleEntries` dimension, `parseBuriedFrontmatter` |
| `src/store/FenceWriter.ts` | `updateFenceBuried`, `writeBuried`, `buriedUntil` counted as a schedule key |
| `src/card-gen/explicit.ts`, `types.ts` | Parse fence `buriedUntil` (flat and nested) into the generated card |
| `src/card-gen/CardSyncService.ts` | `getLineBuried` dependency; copy the bury onto the card; header scan recognizes the key |
| `src/main.ts` | Wire `getLineBuried` with the pending overlay |
| `src/study/StudySessionManager.ts` | `setBuried`; `LineScheduleWriter.setBuried`; passes `now` to the new-card queries |
| `src/study/note-scope.ts`, `mindmap-study.ts`, `occlusion-steps.ts`, `src/views/LineRevealProcessor.ts` | Skip buried cards |
| `src/views/FlashcardStudyView.ts` | Bury header action, `-` key, `bury` undo entry |
| `src/study/bury.test.ts`, `StudySessionManager.test.ts` | Tests: day start, store filters, frontmatter and fence round trips, routing |

### Fixture
`vault/tests/flashcard/bury.md` (master `e2e/fixtures/bury.md`), deck **Testing › Bury**. It has 2 line cards (one due, one new), a due basic fence card, and a bidi fence (forward due, reverse new), so the expected counts are **2 | 0 | 3**. Every date is in the past.

### Not verified
- Nothing was run in Obsidian: the button, the `-` key, header refresh, and the frontmatter or fence write landing on disk.
- Whether Obsidian's Scope matches `"-"` on every keyboard layout. Some layouts may report a different `key` value for that key.
- The Decks dashboard refreshing on its own at midnight. A buried card comes back the next time counts are computed, not on a timer.
- Occluded line and cloze-group buries are covered by unit tests only. The fixture has no image.

