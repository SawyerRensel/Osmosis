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
status: In-Review
batch: 15
priority:
progress:
date_created: 2026-11-24T00:20:16.000Z
date_modified: 2026-11-24T00:20:16.000Z
date_start_scheduled: 2026-11-24T00:58:59.000Z
date_start_actual: 2026-11-24T00:58:59.000Z
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

## Batch implementation notes (awaiting manual test)

Code commit: `2a0b90a` on `batch/15-plates-study-polish`.

### Approach
The back-side `░░░░░░` placeholder (`.osmosis-note-hidden`) and the bottom row (`.osmosis-note-bottom` / `.osmosis-note-rating-slot`) are gone. Each fence card in reading view now has:
- **`.osmosis-note-top`**, a right-aligned row above the front. It holds the step counter (`i/n`) or "Rated", then undo, then the eye (exclude) toggle.
- **`.osmosis-note-actions`**, a full-width row under the back. While the back is hidden it holds `button.osmosis-study-flip.osmosis-note-show-answer`. After a reveal in study it holds the rating bar `.osmosis-rating.osmosis-study-rating-bar`. It collapses (`:empty`) when it has nothing to show.

Both rows are rebuilt on every `draw()`, as the bottom row was. Each card's reveal state is still keyed per card and step in `revealedCardIds`, so each card reveals on its own.

The styling is shared through classes. The study tab's selector lists for the flip button, the rating bar, button height, padding and touch font size gained `.osmosis-note-actions` / `.osmosis-note-card .osmosis-note-actions` entries. No rules were copied.

### Decisions
- **"Rated" and `i/n` go in the top row, left of undo.** They stay visible but off the full-width rows, and they are muted small text (the same rule as `.osmosis-note-step`).
- **Interval labels are included.** `StudySessionManager.previewIntervals` costs four FSRS evaluations per reveal, which is cheap. `showRating` fills `.osmosis-rate-interval` with `formatInterval`, as the study tab does. The session manager is now built lazily by a `session()` helper, which `recordRating` and `undo` also use.
- **The button height is 40px on desktop and 48px on tablet and phone**, through `--osmosis-study-button-height` on `.osmosis-note-actions`. The study tab uses 56px on phone. I used 48px there because a note can hold many of these bars inline, while the tab has one bar at the bottom of the screen.
- **Clearing `</>`:** the edit button only exists in live preview, where `renderPreviewCard` draws the card. That card's eye now sits in the same top row. In reading view the row sits in the card's corner. Inside `.cm-embed-block` it gets `margin-inline-end: 28px` to stay left of Obsidian's absolutely positioned `.edit-block-button`. The preview card's duplicated exclude-toggle code now calls `addExcludeToggle`.
- **The top row is in normal flow, not absolutely positioned or floated.** That costs about 16px of height (it is pulled 8px into the card's padding), but it can never overlap a front that starts with a code block and its copy button. A float would have slid under a `pre` block's background.
- **Occlusion cards** get the same Show answer row and top row. A revealed group's rating still floats under the revealed shape: that anchoring was settled in PR #44 and is not reverted. The floating bar now has the study-bar look with intervals. A scattered group falls back to the full-width row. Occlusion cards still have no undo button, as before.
- **The cloze blanks in the front (`░` via `CLOZE_BLANK`) are unchanged**, as specified.
- **Nothing moved out of `FlashcardStudyView.ts`.** No shared code was extracted, so T117 has no overlap.

### Surface map
| File | Change |
|---|---|
| `src/views/NoteStudyProcessor.ts` | `renderCard`/`renderOcclusionCard`: top row plus full-width action row in place of the placeholder and bottom row. New `addShowAnswerButton`. `showRating` builds the study-bar buttons with intervals. New `session()` helper. `renderPreviewCard` puts the eye in the top row. |
| `styles.css` | Study-tab flip, rating-bar, height, padding and font rules extended to `.osmosis-note-actions`. New `.osmosis-note-actions` and `.osmosis-note-top` (with the `.cm-embed-block` offset). Placeholder and bottom-row rules removed. The exclude toggle gets padding to match undo. |
| `src/views/NoteStudyProcessor.dom.test.ts` | Tests click `.osmosis-note-show-answer`. The session mock gains `previewIntervals`. The harness gains `renderAnother`. Four new tests cover Show answer replacing the placeholder, the bar with intervals, the top-row controls, and revealing one card at a time. |

### Fixtures
These existing fixtures are reused. None was modified.
- `vault/tests/flashcard/fence-card-types.md`: basic, three-group cloze (1/3), bidirectional, and a not-due control.
- `vault/tests/flashcard/code-cloze-study.md`: code cloze, like the screenshots.
- `vault/tests/flashcard/occlusion-surfaces.md`: an occluded fence.

### Manual test
1. Open `fence-card-types.md` in reading view and start note study (cap icon). Every asked card shows a full-width **Show answer** under its rule, with no `░░░` placeholder. The eye sits at the top right, and the cloze fence shows `1/3` beside it.
2. Press Show answer on one card. Only that card reveals, and a four-button bar appears across the card's width, with intervals over the labels and the study tab's colours. The other cards stay hidden.
3. Rate. The cloze steps to `2/3` and an undo arrow appears at the top right. Undo reverts the rating. After the last group the top row reads "Rated".
4. Toggle the eye. The card dims and the icon turns to eye-off. Toggle it back.
5. Switch to live preview. On hover, the eye sits just left of `</>` with no overlap.
6. Check the same at phone width, and on `code-cloze-study.md` and `occlusion-surfaces.md` (the rating floats under the shape).

### Not verified
I have not run anything in Obsidian. The `</>` clearance (28px) is estimated from Obsidian's default `.edit-block-button` size, not measured. I have not checked the phone layout, the button heights against real themes, or how the floating occlusion bar looks with intervals.

### Fix round 1
Sawyer: on desktop the Show answer button and rating bar stretched across the whole card. They are now capped at the study tab's own button width. The study tab does not use its 700px column for these: its panel (`.osmosis-study-actions`) is 340px wide on desktop and 420px on tablet, less 4px of padding each side. That width is now one variable, `--osmosis-study-panel-width`, set for both `.osmosis-study-actions` and `.osmosis-note-actions`. The note row's `max-width` is that value minus the panel padding, so the buttons match the tab's. The row is **centred** in the card, because the tab centres its panel. On the phone it spans the card, as the tab's panel does (`max-width: none`). Not verified in Obsidian.
