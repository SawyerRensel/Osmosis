---
title: Mind map study - Counts and progress bar replace the Stop pill
summary: "T110. Mind map study gets the same progress bar and new/learn/due counts as Note and Flashcard study; the Stop pill goes."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Note study - Counts and progress bar replace the Stop pill]]"
status: In-Review
batch: 14
priority:
progress:
date_created: 2026-11-20T19:00:00.000Z
date_modified: 2026-11-20T19:00:00.000Z
date_start_scheduled: 2026-11-20T22:25:26.000Z
date_start_actual: 2026-11-20T22:25:26.000Z
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

# Mind map study - Counts and progress bar replace the Stop pill (T110)

## What Sawyer asked
> Let's apply the same study mode header (progress bar + new/learn/due) we use for note study mode and flashcard study mode to mind map study mode.

## Current state
- **The pill.** Mind map study shows a floating pill, built by `MindMapView.ensureSpatialBanner()` (~1955):
  - `.osmosis-reveal-banner.osmosis-spatial-banner` in `contentEl`;
  - text "x/N due reviewed", from `spatialRated.size` / `spatialTargets.size`;
  - a **Stop** button that calls `exitSpatialMode()`.
- **Ratings** are recorded around ~1936 through `spatialSessionManager` (`createSessionManager("mindmap")`).
- **The cap** is `spatialStudyActionEl`, class `osmosis-study-cap`, `is-active` while studying (T100).
- **T102 did the same job for Note study.** Reuse its pieces; don't copy them:
  - The shared DOM builder `StudyProgressStrip` in src/views/StudyProgressStrip.ts: `new StudyProgressStrip(parent)`, `setProgress(percent)`, `setCounts(SessionCounts)`.
  - The pure `countNoteSession` in src/study/session-counts.ts. Cards are fixed at session start in their starting bucket. Again moves a card to learn; Hard, Good and Easy remove it. Reuse or generalise it; don't fork it.
  - The count colours `--osmosis-count-*`, declared on `.osmosis-dashboard, .osmosis-study-view, .osmosis-note-study-strip`. Add the mind map strip to that rule.
- **The study tab (T109)** pins its strip at the top with a gradient fade (`.osmosis-study-status`, `--osmosis-study-strip-height/-fade`).

## Design
- In mind map study, show the progress bar and new/learn/due counts **pinned at the top of the map view**, matching the study tab's strip. A map has no title to sit above. The bar shows rated/total targets, as the pill does now.
- Remove the pill and its Stop button. The header cap, and the existing command, end study. Keep whatever flush or cleanup `exitSpatialMode` does.
- Check that nothing else depended on the pill. The `.osmosis-reveal-banner` CSS is shared with something else, so keep what is still used.
- The counts update on every rating, and on undo if mind map study has undo.
- Underline the current card's bucket only if it is knowable, and say which in the notes.
- The strip must not take pointer events from the map's pan and select, except where it needs them.

## Acceptance criteria
- Mind map study shows the bar and new/learn/due counts at the top, in the dashboard's colours, updating on each rating.
- The "x/N due reviewed" pill and Stop are gone. Toggling the cap off ends the session cleanly.
- The counting logic stays pure and unit-tested.

## Test plan
1. Use a mind map of a note with new, learning and due cards, in a back-dated fixture.
2. Start study from the cap and compare the counts with the dashboard.
3. Rate Again and Good, then end via the cap.
4. Do this on desktop and on a phone.

## Context budget (~45k tokens)
- **MindMapView.ts has NUL bytes.** Use `grep -a`, never read it whole, and edit it with byte-level Python exact replaces that assert the count. Read only the spatial-study ranges: run `grep -an spatial` and read ±30 lines around `ensureSpatialBanner`, `exitSpatialMode`, the rating path (~1930) and where study starts (~1450).
- Read `src/views/StudyProgressStrip.ts` and `src/study/session-counts.ts` whole.
- In `LineRevealProcessor.ts`, grep `StudyProgressStrip|countNoteSession` and read ±25 lines.
- In styles.css, grep `osmosis-spatial-banner|osmosis-reveal-banner|osmosis-note-study-strip|osmosis-study-status`.

## Conventions
- This is a batch 14 ticket. Commit `feat(T110): …`, plus one `docs(T110)` note commit that sets `status: In-Review` and adds a "Batch implementation notes (awaiting manual test)" section.
- Stage by explicit path, and run `git diff --cached --stat` before each commit. Never `git stash`. Don't push.
- T105 has already run, so use the new mode names (Mind map) in any visible text. Don't rename the existing `spatial*` identifiers; T106 does that sweep next.
- Run lint, test and build one at a time (7 GB RAM).

## Batch implementation notes (awaiting manual test)

Code commit: `36e0c0a` on `batch/14-study-polish-renames`.

### Approach
- The pill (`ensureSpatialBanner`) is gone. `ensureSpatialStrip()` replaces it. It builds a `.osmosis-study-status.osmosis-mindmap-study-strip` wrapper in the map's `contentEl` and fills it with T102's `StudyProgressStrip`. `applySpatialState` keeps calling it after every render pass, and it rebuilds the strip when a render has detached it, exactly as the pill was rebuilt.
- The strip reuses the study tab's `.osmosis-study-status` rule: pinned at the top, solid band then gradient fade, `pointer-events: none`. `.osmosis-mindmap-study-strip` only declares the strip height, the fade and `--osmosis-study-column: none`, and it joins the `--osmosis-count-*` colour rule.
- Counting reuses `countNoteSession` unchanged. A new pure `spatialSessionCards(cards, targets)` in `src/study/spatial-study.ts` turns the session's target keys into `NoteSessionCard`s, fixed at session start (it resolves keys with `cardIdsForSpatialKey`, dedupes, then calls `noteSessionCard`). `rateSpatialCard` records each rated card's rating in `spatialCardRatings`. Again moves a card to learn; Hard, Good and Easy take it out.
- Ending study: `exitSpatialMode` is untouched apart from removing the strip and clearing the count state, so the schedule and review-log flush still runs. The cap, the existing command, file switch and completion all go through it.

### Decisions
- **The bar counts targets; the counts count cards.** The bar is rated targets out of all targets, as the pill was. The counts are per card, as the dashboard's are. After `spatialStudyKeys` splits nodes, a target is one card in nearly every case. The only exception is an unsplit node key that carries several cards. That case is rare, and its single rating reaches all of them anyway.
- **The underlined bucket is the card whose rating bubble is open.** Before a reveal you can tap any hidden node, so no "next card" is knowable and nothing is underlined. Between ratings the underline is therefore absent.
- **No undo.** Mind map study has no undo, so the counts change only when you rate.
- **The strip is pointer-transparent everywhere.** Without the Stop button nothing in it needs a click, so the map pans and selects through the whole band. The old `stopPropagation` listeners went with the pill.
- **Dead CSS removed.** `.osmosis-reveal-banner`, `.osmosis-reveal-progress` and `.osmosis-reveal-btn` had no other user after T102, so they are deleted.
- **New identifiers named for T106.** The new CSS class is `osmosis-mindmap-study-strip`, which already uses the new name, so T106 does not need to rename it. The new fields sit with their neighbours and use the old prefix: `spatialCountCards`, `spatialCardRatings`, `spatialStripEl`, `spatialStrip`, plus the methods `ensureSpatialStrip` and `spatialSessionCards()`. T106's spatial sweep should catch them.
- **Docs.** `docs/studying/study-modes.md` mind map step 6 now describes the strip and the cap. The note-study paragraph (~line 85) still describes the old pill and Stop button. T102 left it stale, and this ticket did not touch it.

### Surface map
| File | Change |
|---|---|
| `src/study/spatial-study.ts` | New `spatialSessionCards()`; a comment now says "progress bar" instead of "banner" |
| `src/study/spatial-study.test.ts` | 4 tests: bucketing, unsplit node key, unknown key, round trip through `countNoteSession` |
| `src/views/MindMapView.ts` | Pill and Stop replaced by `ensureSpatialStrip()`; count state set at study start, on rating, at exit and on close |
| `styles.css` | `.osmosis-mindmap-study-strip` rule plus the colour-rule selector; dead reveal-banner rules removed |
| `docs/studying/study-modes.md` | Mind map study step 6 |

### Fixture
Reuses `vault/tests/flashcard/study-counts.md`, whose master is `e2e/fixtures/study-counts.md`. The fixture is unchanged and identical to the master at commit time. All its cards are fences, back-dated, and should read 2 | 2 | 3. If T102 testing already rated cards in it, restore it from the master and reload Obsidian (Ctrl+R).

### Not verified
- Nothing has been seen in Obsidian, desktop or phone. In particular, check that the gradient band reads well over a map, and that it does not clash with the phone's view header.
- Underline behaviour on a split node (an occlusion, cloze or bidirectional node): the underline should follow each step's card.

