---
title: Note study - Show answer and rating bar inside flashcard blocks
summary: "T116. Note study flashcard fences use the Flashcard study view's full-width Show answer button and rating bar instead of the blurred placeholder; hide and undo move to the top right beside the </> button."
tags:
  - task
calendar:
  - Feature
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

# Note study - Show answer and rating bar inside flashcard blocks (T116)

## What Sawyer asked
> Let's improve the note study mode flashcard blocks. Let's use the same "Show answer" button and rating buttons we use for flashcard study mode. Instead of the blurred ascii text, let's use the "Show answer" button. They should still live inside each card such that cards can be revealed independently. They should extend the full width of the flashcard. Let's move the hide button and undo button to the left of the `</>` "Edit this code block" button at the top right of a flashcard so the "Show answer" and rating buttons can expand the full width of the flashcard.

Screenshots: `ref/screenshots/Screenshot_20261123-061230.png`, `…061250.png`, `…061358.png` (phone). They show:
- the `░░░` placeholder under the divider, with the eye button at the bottom right;
- small left-aligned Again/Hard/Good/Easy buttons;
- the undo arrow and a "Rated" label in the bottom row.

## Design
- **Hidden state:** the `░░░░░░` back-side placeholder is replaced by a full-width "Show answer" button that looks the same as the Flashcard study view's `.osmosis-study-flip`. Clicking it reveals that card only, as the placeholder click does now. Each card keeps its own state.
- **Revealed state:** a full-width rating bar with the same look as the Flashcard study view's `.osmosis-study-rating-bar`: four equal buttons spanning the card. Include the interval labels if the fence path can compute them cheaply; otherwise drop them and say so.
- **Top-right controls:** the hide (eye / eye-off exclude toggle) and undo buttons move to the card's top-right corner, to the left of Obsidian's own `</>` "Edit this code block" button, and must not overlap it on desktop or phone.
- Where the "Rated" status and the "i/n" step counter go is the worker's call. Keep them visible, keep them off the full-width rows, and record the choice.
- Cloze masks inside the front (dotted blanks) are unchanged; only the back-side placeholder goes.
- Occlusion cards (`renderOcclusionCard`) should get the same Show answer and rating rows where they have a reveal and rating step.

## Current state
- `src/views/NoteStudyProcessor.ts` (1255 lines):
  - `renderCard` 291–429: front, divider, `░░░` placeholder, revealed side, and a bottom row with undo, "Rated", step "i/n" and the rating slot.
  - `addUndoButton` 439–450, `renderOcclusionCard` 539–688, `addExcludeToggle` 690–713.
  - `showRating` 931–992: Again/Hard/Good/Easy, then "Rated: X", the undo push and `lineReveal.markFenceRated`. `undo` 1023.
- `src/views/FlashcardStudyView.ts` (1198 lines):
  - `RATINGS` 52–57.
  - `buildLayout` 432–484: "Show answer" `.osmosis-study-flip` at 453–457; rating bar `.osmosis-rating.osmosis-study-rating-bar` with interval spans at 473–482.
  - `updateRatingIntervals` 486.
- `styles.css`:
  - `.osmosis-note-card` / `hidden` / `revealed` / `.osmosis-rating` 2295–2331; `.osmosis-note-bottom` / `step` / `exclude-toggle` / `excluded` 2421–2470; `.osmosis-note-undo` 1873–1890.
  - Study-view flip and rating bar 1820–1970, per-rating colours 1945–1970.
  - Every mode's rating row uses the shared class `osmosis-contextual-rating`; colour rules sit only at `.osmosis-contextual-rating button.osmosis-rate-*`.
- Share styling through classes (one CSS source), not by copying rules. The `</>` button is Obsidian's `.edit-block-button`, absolutely positioned at the block's top right.
- Tests: `src/views/NoteStudyProcessor.dom.test.ts`. Update the assertions that look for the placeholder.

## Acceptance criteria
- A hidden card shows a full-width Show answer button; the `░` placeholder is gone.
- Show answer reveals only that card; then a full-width four-button rating bar appears with the study view's look. Rating and undo work as before.
- Hide and undo sit at the top right, left of `</>`, with no overlap on desktop or phone.
- Excluded, draft, preview, multi-step (i/n) and occlusion cards still work.
- DOM tests updated and passing.

## Test plan
Use the existing note-study fixtures under `vault/tests/` (and an HTML-elements note like the screenshots). Study mode on: each card shows Show answer; reveal one and the others stay hidden; rate with each button; undo; hide or unhide a card; a multi-step card steps through. Check the phone width.

## Context budget (~60k tokens)
- `NoteStudyProcessor.ts` 280–460, 530–720, 920–1030; `FlashcardStudyView.ts` 40–60, 430–500; `styles.css` 1820–1970, 2290–2470, 1870–1890; the DOM test, skimmed.

## Conventions
- Batch 15 ticket: commit `feat(T116): …`/`fix(T116): …` plus one `docs(T116)` note commit setting `status: In-Review` with a "Batch implementation notes (awaiting manual test)" section (approach, decisions, surface map, fixture, test steps, what was not verified). Stage by explicit path; `git diff --cached --stat` before each commit; never `git stash`; don't push.
- Lint → test → build, one at a time (7 GB RAM). Pure logic goes outside `src/views/` (vitest cannot import obsidian) and gets unit tests.
- Fixtures: master copy in `e2e/fixtures/`, copied to `vault/tests/`; back-date every fixture card; neutral subject domains (no biology).
