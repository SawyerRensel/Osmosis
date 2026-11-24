---
title: Note study - Undo restores the Show answer button
summary: "T119. The undo button on a rated flashcard fence in note study reverts the rating and brings back that card's Show answer button."
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
date_modified: 2026-11-24T23:40:21.000Z
date_start_scheduled: 2026-11-24T23:34:28.000Z
date_start_actual: 2026-11-24T23:34:28.000Z
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

# Note study - Undo restores the Show answer button (T119)

## What Sawyer asked
> undo buttons on a flashcard in note study mode don't work. Clicking the button does nothing and doesn't bring back the "Show answer" button as expected.

T116 (this batch) moved undo into the card's top-right controls.

## Cause (hypothesis from a code read, verify first)
`NoteStudyProcessor.undo()` (L1040–1072) reverts the schedule, decrements the count and calls `unmarkFenceRated`. It then tries to re-render with `vault.modify(file, sameContent)`, and identical content probably triggers no re-render. Even if it did, `stepAt` still holds index+1 (set by `advance` L391–395), so `draw()` would land on the next step or on "Rated". Nothing restores the previous step.

## Design
- The undo entry (`NoteUndoEntry` L34–46) records the fence and its step index. Undo restores the schedule, sets `stepAt` back to that step, and redraws that fence directly through its `trackedFences` entry, leaving it in the hidden state with Show answer. Add a redraw hook rather than reusing `restart` / `resetFenceState`, which wipe all state.
- Make the same fix for occlusion cards (`renderOcclusionCard` L539–692) and for Ctrl+Z (L135–145), which goes through the same `undo()`.
- Drop the `vault.modify(sameContent)` trick if it becomes unnecessary.

## Context budget (~50k)
- `src/views/NoteStudyProcessor.ts` (1268 lines). Read: L34–174 (state, register, Ctrl+Z), `trackFence`/`refresh`/`resetFenceState` L225–271, `renderCard` L292–449, `showRating` L940–1006, `recordRating`/`undo` L1014–1072. Skim `renderOcclusionCard` L539–692 for the `advance`/`reveal` pattern.
- `src/views/LineRevealProcessor.ts`: `markFenceRated` L1189, `unmarkFenceRated` L1202.
- Tests: `src/views/NoteStudyProcessor.dom.test.ts`. Add a DOM test: rate, then undo, then the Show answer button is back and the schedule is restored.

## Acceptance criteria
- Rate a card, then click its undo: the card returns to hidden with the Show answer button, and the rating is reverted (schedule, review log entry as today's `undo` does, progress count).
- Works for multi-step (i/n) fences: undo returns to the step just rated.
- Ctrl+Z does the same for the most recent rating.
- Occlusion cards behave the same.
- DOM test passes.

## Test plan
Open a note with flashcard fences in note study. Reveal a card and rate it Good, then click undo: Show answer returns and the progress strip count drops. Repeat on a multi-step card and an occlusion card. Rate, then Ctrl+Z.

## Batch implementation notes (awaiting manual test)

Code commit: `ee95c9f` on `batch/15-plates-study-polish`.

### Cause
Confirmed from the code. `undo()` reverted the schedule, the review count and the strip's count (`unmarkFenceRated`), then tried to force a redraw with `vault.modify(file, sameContent)`. An unchanged file triggers no re-render. And even a re-render would not have helped: rating calls `advance`, which moves `stepAt` past the rated question. `stepAt` is processor state, not DOM, so any redraw lands on the next question or on "Rated". Nothing ever moved the step back. On occlusion fences there was no undo button at all, only Ctrl+Z.

### Fix
- `rewindFence(sourcePath, fenceKey, cardId)` runs after a rating undo. It finds the rated card's index in the session's pinned plan (`fencePlan` for cloze, bidi and basic fences, `occlusionPlan` for occluded ones). It sets `stepAt` back to that index and clears the fence's `#step` reveal keys. It then calls a new `redraw` hook, which each `trackedFences` entry now carries next to `restart`. The hook is the card's own `draw`, so nothing else is reset.
- The `vault.modify(sameContent)` trick is removed. The redraw is direct, and `revertReview`'s own schedule write still re-renders the block. Either way the block draws from the rewound `stepAt`.
- Occlusion cards now get the same undo button in their top row.

### Decisions
- **A card's undo button undoes that card's latest action, not the note's latest.** Before this, every card's button popped the global stack. Rating A, then B, then pressing A's undo would have reverted B, which reads as "the button does nothing" on A. The ticket asks for "that card's Show answer button". Ctrl+Z still undoes the most recent action of any card. Taking an entry out of the middle of the stack is safe: each entry restores one card's schedule, and `revertReview` discards that card's buffered log entry by card ID. A card's button is now visible only when that fence has something to undo (rating or hide toggle), not whenever the stack is non-empty.
- **The step is looked up, not recorded.** The step index comes from the pinned plan, so `showRating`'s signature is untouched (T120 edits its timing). The step is rewound only when the fence is exactly one step past the rated card. The undo stack outlives a session, and a fence restarted by a new session has its own sequence that an old rating must not move. In that stale case the schedule is still reverted, but the fence is not redrawn.
- **Later reveal keys are cleared too.** If you rate step 1, reveal step 2 and then undo, step 2 is hidden again when you come back to it. It was not answered.
- **Redraw only the undone fence.** Redrawing every card on the note would rebuild any open rating bar and reset its `revealedAt`, which is T120's timing anchor.

### Surface map
| File | Change |
|---|---|
| `src/views/NoteStudyProcessor.ts` | `redraw` on tracked fences; `rewindFence`; per-fence `lastUndoFor` drives the undo button; `undo(at)` takes an index (default latest); undo button on occlusion cards; removed `vault.modify(sameContent)` |
| `src/views/NoteStudyProcessor.dom.test.ts` | Harness gains `revertReview` and `unmarkFenceRated`; 5 tests: cloze undo to Show answer, finished fence undo back to last step, later reveal cleared, per-card undo isolation, occlusion undo |
| `e2e/fixtures/note-study-undo.md`, `vault/tests/flashcard/note-study-undo.md` | New fixture |

### Fixture
`vault/tests/flashcard/note-study-undo.md` (master `e2e/fixtures/note-study-undo.md`), deck `Testing/Note Study Undo`. Eight questions: basic, three-group cloze, bidi pair (all back-dated to 2026-11-08..11) and a two-group occlusion fence (new) on `bridge-cross-section.svg`. The strip should start at 0/8. Reload Obsidian (Ctrl+R) before testing.

### Not verified
- Nothing was run in Obsidian, and no build was run (the orchestrator asked for lint and test only).
- The interplay between the direct redraw and the re-render from `revertReview`'s schedule write is covered by reasoning only: both read the rewound `stepAt`.
- Ctrl+Z only fires when focus or target is inside a reading view or card, which is unchanged.
