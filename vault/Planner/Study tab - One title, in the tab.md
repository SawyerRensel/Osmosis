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
status: To-Do
batch: 12
priority:
progress:
date_created: 2026-11-20T12:00:00.000Z
date_modified: 2026-11-20T12:00:00.000Z
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
- Batch 12 ticket (added in round 3): commit `fix(T109): …`, then one `docs(T109)` note commit setting `status: In-Review` and adding a "Batch implementation notes (awaiting manual test)" section.
- Stage by explicit path, and run `git diff --cached --stat` before each commit. Never `git stash`. Don't push.
- T91 round 2: the study tab's buttons sit in one floating panel. Display rules must not outrank `.osmosis-hidden.osmosis-hidden`. T92 round 2: the counts use `--osmosis-count-*`.
- Run lint, test and build one at a time (7 GB RAM).
