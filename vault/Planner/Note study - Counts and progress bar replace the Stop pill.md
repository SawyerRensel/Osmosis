---
title: Note study - Counts and progress bar replace the Stop pill
summary: "T102. Note study shows the Flashcard tab's progress bar and new/learn/due counts above the file name; the '0/X rated Stop' pill goes."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
status: To-Do
batch: 14
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

# Note study - Counts and progress bar replace the Stop pill (T102)

## What Sawyer asked
> Use the same new/learn/due and progress bar in contextual (Note) study mode. Insert above filename. Get rid of the "0/X rated Stop".

## Current state
- The pill: `LineRevealProcessor.ts` `ensureBanner` ~986, `renderBanner` ~997–1010 (`.osmosis-reveal-progress` "done/total rated" + Stop button), `studyProgress` ~1019–1039 (counts questions: occlusion steps and fence steps), `syncBanners` ~1045–1062 (mounts in `.markdown-reading-view`, class `osmosis-reveal-host`).
- The Flashcard tab's strip: `SequentialStudyView.ts` `buildLayout()`/`updateProgress()`/`updateCounts()` (`.osmosis-study-progress`, `.osmosis-study-counts`); pure `src/study/session-counts.ts` (`bucketOf(StudyCard)`, `countSession(queue, currentIndex, deferred)`). Colours: `--osmosis-count-*` on `.osmosis-dashboard, .osmosis-study-view`. **Add the Note-study host to that selector.**
- Note mode tracks block IDs / fence keys, not a `StudyCard[]` queue. Map the note's card IDs to `StudyCard`s via `cardStore` and bucket each with `bucketOf`. Counts = cards not yet rated this session, by bucket; a card rated Again moves to learn.

## Design (settled with Sawyer)
- Same visuals as the Flashcard tab: progress bar with the three counts to its right, same classes or a shared builder (extract the DOM builder rather than copy it).
- Placed **above the file name** (the inline title) in the reading view. Nothing in src locates the inline title yet: find `.inline-title` inside the reading view's sizer and insert before it; fall back to the top of `.markdown-preview-sizer` when the inline title is hidden.
- Remove the pill and its Stop button. Ending study is the header cap toggle (and the existing command); make sure nothing else depended on Stop (e.g. the flush on stop — keep that flush on toggle-off). Keep the progress bar as rated/total.
- Underline the bucket of the card being answered if that is knowable; otherwise no underline. Say which in the notes.

## Acceptance criteria
- Note study shows bar + counts above the file name, updating on every rating and undo; colours match the dashboard.
- The "x/y rated" pill and Stop are gone; toggling the cap off ends and flushes the session.
- Counts are unit-tested (pure function).

## Test plan
`tests/flashcard/study-counts.md` in Note study: counts match the dashboard row; rate Again/Good and watch them move; end via the cap. Inline title hidden (setting off) → strip still shows at the top. Phone.

## Context budget (~40k tokens)
- `LineRevealProcessor.ts` 560–640 and 980–1065; `src/study/session-counts.ts` (44 lines); `SequentialStudyView.ts` grep `updateCounts|buildLayout|osmosis-study-progress` ±40 lines; styles.css grep `osmosis-study-count|osmosis-reveal`.

## Conventions
- Batch 14 ticket: commit `feat(T102): …`/`fix(T102): …` plus one `docs(T102)` note commit setting `status: In-Review` with a "Batch implementation notes (awaiting manual test)" section. Stage by explicit path; `git diff --cached --stat` before each commit; never `git stash`; don't push.
- Batch 12 (T91/T92) round-2 facts: the study tab's buttons sit in one floating panel; every mode's rating row uses the shared class `osmosis-contextual-rating` (colour rules only at `.osmosis-contextual-rating button.osmosis-rate-*` in styles.css); deck-count colours come from `--osmosis-count-new/learn/due`, declared on `.osmosis-dashboard, .osmosis-study-view`.
- Lint → test → build, one at a time (7 GB RAM). Pure logic goes in `src/study/` or similar (vitest cannot import obsidian) and gets unit tests.
