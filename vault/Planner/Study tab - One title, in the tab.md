---
title: Study tab - One title, in the tab
summary: "T109. Study tab shows its title once, as the tab title (deck name, or note H1/file name); the in-content titles go and the status strip becomes a slim sticky gradient."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[Sequential study as a view instead of a modal]]"
  - "[[Sequential study - New, learn and due counts]]"
status: In-Review
batch: 14
priority:
progress:
date_created: 2026-11-20T12:00:00.000Z
date_modified: 2026-11-20T12:00:00.000Z
date_start_scheduled: 2026-11-20T13:31:05.000Z
date_start_actual: 2026-11-20T13:31:05.000Z
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

# Study tab - One title, in the tab (T109)

## What Sawyer reported (2026-11-20, round-3 test of the study tab)
> In Flashcard study mode for a note with the filename "Anatomy" and deck "Anatomy", I'm seeing "Anatomy" like three times. And then when I click "Show answer", the last one disappears, which is jarring. I only want to see one header title. If I'm studying the deck, I want to see the deck title. If I'm studying the note, I want to see the note h1 (or filename if multiple h1's or no h1). The title should be the tab title (no prefix) instead of "Osmosis study" (since it's obvious from the tab icon), so we can remove the title from the header altogether.
>
> The Flashcard study mode header takes up way too much vertical space as well. It should be a gradient over top of the content when we need to scroll - enough that the header is readable.

Screenshots show the three copies, from top to bottom:
1. "Anatomy" above the progress bar (the note name in `statusEl`).
2. "Anatomy" below the bar (the deck breadcrumb).
3. "Anatomy" at the top of the card front, above the occlusion image. It is gone once the answer shows, so the image jumps up.

The header block (title, bar, breadcrumb) takes about 110px and scrolls away with the content, while the tab header still says "Osmosis study".

## Design
- **Tab title** (`getDisplayText()` in `src/views/SequentialStudyView.ts`; refresh it when the scope changes, e.g. via `leaf.updateHeader()` or the codebase's existing pattern):
  - Deck scope: the deck's name, meaning its last path segment, with no prefix.
  - "Study all decks": "All decks".
  - Note scope: the note's H1 if it has exactly one, otherwise the file name without extension. Use `metadataCache.getFileCache(file).headings` at level 1.
  - No session (picker, empty or complete screens): "Study". T103 in batch 14 replaces the picker with a Decks page later.
- **Remove both title lines from the content.** The note name above the bar and the breadcrumb below it both go. The status area keeps only the progress bar and the new/learn/due counts.
- **Third copy:** find what renders the "Anatomy" line on the occlusion card's front but not its back. Likely candidates are `renderOcclusionSide` (~627–663, the `.osmosis-occlusion-prose` split at the embed) or a heading-context line. Fix it so that:
  - front and back show the same lead-in, so nothing moves on reveal;
  - a context line that only repeats the tab title is not shown.
  If the line is real card content (the card's own prose), keep it on both sides instead. Record which it was.
- **Compact status strip:**
  - The bar and counts sit in a slim strip pinned to the top of the scroll area (sticky), over the content.
  - Its background is a gradient from the view background to transparent, deep enough that the bar and counts stay readable as content scrolls under them. Mirror the floating bottom panel from T91 round 2.
  - The first line of content must not start hidden under the strip: pad the top by the strip's solid part.
  - The strip should take roughly 28–36px instead of about 110px.
- Leave the rating panel and colours alone.

## Acceptance criteria
- "Anatomy" appears once: in the tab title. "Osmosis study" is gone, and no title shows in the content.
- The tab title follows the scope rules above.
- Nothing shifts vertically between the front and back of a card.
- The status strip is slim and sticky, with a readable gradient over scrolled content.
- Lint, test and build pass. The title rule is a pure, unit-tested helper in `src/study/` (vitest cannot import obsidian).

## Test plan
- An Anatomy-style note whose deck and file name share one name, studied by deck and then by note: one title, in the tab.
- A note with one H1 that differs from its file name: the tab shows the H1. A note with two H1s, or none: the tab shows the file name.
- "Study all decks": the tab shows "All decks".
- Scroll a tall card: the strip stays, and the content fades under it.
- Show answer on an occlusion card: nothing jumps.
- Repeat on a phone.

## Context budget (~35k tokens)
- `SequentialStudyView.ts`:
  - `getDisplayText`/`getIcon` (~165–180)
  - `buildLayout` and `updateProgress`/`updateCounts` (grep them, ±40 lines)
  - `renderCard`/`renderOcclusionSide` (~560–670)
- `styles.css`: grep `osmosis-study-status|osmosis-study-progress|osmosis-study-breadcrumb|osmosis-study-note`.
- `OcclusionRenderer.ts`: only if the third copy comes from there.

## Conventions
- Batch 14 ticket (raised in batch 12 round 3, deferred so 12 could land): commit `fix(T109): …`, then one `docs(T109)` note commit setting `status: In-Review` and adding a "Batch implementation notes (awaiting manual test)" section.
- Stage by explicit path, and run `git diff --cached --stat` before each commit. Never `git stash`. Don't push.
- T91 round 2: the study tab's buttons sit in one floating panel. Display rules must not outrank `.osmosis-hidden.osmosis-hidden`. T92 round 2: the counts use `--osmosis-count-*`.
- Run lint, test and build one at a time (7 GB RAM).

## Batch implementation notes (awaiting manual test)

Code commit: `acafb8c` on `batch/14-study-polish-renames`. Started from the interrupted worker's `.claude/batch/14/T109-partial.patch`, reviewed and kept with the changes below.

### Cause
- **Copies 1 and 2** were the `osmosis-study-scope` note name and the opt-in `osmosis-study-breadcrumb`, both inside `.osmosis-study-status`, above and below the bar.
- **Copy 3 was not card prose.** It was the breadcrumb of an *occluded line card*. `occludeLineCard` keeps the line card's `front` (`noteName › ancestors`, e.g. "Anatomy › Anatomy") and `back` (the line holding the embed). `renderOcclusionSide("front")` rendered `card.front` as prose: there is no embed in it, so the whole breadcrumb printed above the masked image. The back rendered `card.back`, with no breadcrumb, so the image jumped up on reveal.

### Approach
- **Tab title.** `studyTabTitle(scope, h1s)` is a pure helper in `src/study/study-view.ts`. With no session it returns "Study". The other cases are "All decks", the deck's last path segment, or the note's only H1, falling back to the file name. `setTitleScope()` in the view reads the H1s from `metadataCache` and calls `leaf.updateHeader()` (the MindMapView/Graph3DView pattern) only when the title changes. It is called from `startSession` (empty queue gives "Study"), `renderCard` (so undo off the complete screen restores the title), `renderComplete` and `renderPicker`.
- **Occluded line cards.** Detected by `card.blockId !== undefined`. Both sides now draw the same lead-in (`renderBreadcrumb(front, false)`), then the line (`card.back`) split around the masked image. Nothing moves on reveal.
- **Breadcrumb trimming.** `crumbsBelowTitle(crumbs, titles)` drops *leading* segments that match the tab title or the note session's file name, case-insensitively. A later segment that happens to match is kept.
- **Strip.** `.osmosis-study-status` is absolutely positioned over the top of `.osmosis-study-card`, like the floating bottom panel. Its background is `linear-gradient(--background-primary 28px, transparent)` over 28 + 8 px, and it has `pointer-events: none`.

### Decisions
- **Removed the `showStudyBreadcrumb` setting.** This covers the field, the default, the toggle and its two docs lines. The ticket removes the breadcrumb it controlled, so the toggle would have done nothing. A stale key in an existing `data.json` is harmless. *Lost:* in "All decks" there is no longer any on-screen hint of which deck a card belongs to. Say so if you want it back somewhere.
- **The line-card front breadcrumb is trimmed too.** It used the same "only repeats the tab title" rule as the occlusion lead-in, so "Anatomy › Anatomy › Heart › ?" now reads "Heart › ?". A line straight under a same-named H1 now shows just "?" plus its context lines. This goes slightly beyond the ticket's occlusion case, but it is the same repeated title, and it is easy to revert: `renderLineCardFront` would pass the untrimmed crumbs.
- **An occluded line's front now shows the line's own text around the image**, which the back always showed. This keeps both sides identical. The masks still carry the question.
- **The card's top padding is the whole strip (28px solid + 8px fade = 36px), not just the solid part.** The ticket said to pad by the solid part. Padding by the whole strip means the first line starts clear of the fade instead of half-dimmed at rest. It is still about 90px less than before (about 126px).
- **Kept the "Study" idle title.** T103 replaces the picker, so revisit the title there.

### Surface map
| File | Change |
|---|---|
| `src/study/study-view.ts` | `STUDY_TAB_IDLE_TITLE`, `studyTabTitle`, `crumbsBelowTitle` |
| `src/study/study-view.test.ts` | Tests for both helpers |
| `src/views/SequentialStudyView.ts` | `tabTitle`/`getDisplayText`/`setTitleScope`; removed scope line, deck breadcrumb, `noteTitle`, `updateBreadcrumb`; shared `renderBreadcrumb`; occluded-line rendering |
| `src/settings.ts` | Removed `showStudyBreadcrumb` (field, default, toggle) |
| `styles.css` | `--osmosis-study-strip-height`/`-fade`; absolute gradient strip; progress row sized to the strip; card top padding; removed `.osmosis-study-scope`/`-breadcrumb*` rules |
| `docs/reference/settings.md`, `docs/studying/study-modes.md` | Dropped the setting; described the tab title and strip |
| `e2e/fixtures/study-title/`, `vault/tests/study-title/` | New fixture |

### Fixture
`vault/tests/study-title/` (master copy in `e2e/fixtures/study-title/`):
- `Rigging.md`: deck, file and H1 are all "Rigging". It has 5 cards: an occluded line straight under the H1 (no lead-in), an occluded line under `## Mast` (lead-in "Mast"), a line card, a due card and a due tall-chart card.
- The three notes in deck `Testing/Study Title`:
  - `Galley Basics.md`: one H1, "Knife skills".
  - `Passage Plan.md`: two H1s.
  - `Tide Tables.md`: no H1.

All cards are new or overdue.

### Not verified
- Nothing has been seen in Obsidian, and there was no phone run.
- That `--background-primary` is the study leaf's background in every theme. Some themes paint the main area with another variable, which would show as a band behind the strip.
- The strip spans the full width, so on desktop it sits over the top ~36px of the card's scrollbar track. It takes no pointer events, so dragging still works, but the thumb is hidden at scrollTop 0.
- Occluded line cards in the contextual and spatial study surfaces are untouched; this change covers only the sequential tab.

### Round-2 fixes (2026-11-20)
- **F4: the view header title said "Study"** (dd54e52). Cause: `ItemView` sets its `titleEl` once, at load, from `getDisplayText()`, before the session starts. `leaf.updateHeader()` refreshes only the tab header. The view header, which is the only title on a phone, kept the idle title. Fix: `setTitleScope` now also sets `titleEl`. `titleEl` is not in the public typings, so it is reached through a cast, as `updateHeader` already is.
- **F3: no fade under the strip** (d44465f). `.osmosis-study-status` is a plain band in the solid `--background-primary`. `--osmosis-study-strip-fade` is gone, and the card's top padding is just `--osmosis-study-strip-height`. This also covers mind map study's strip (T110), which reuses the class.
