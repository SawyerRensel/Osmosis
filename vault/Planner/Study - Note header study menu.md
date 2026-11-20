---
title: Study - Note header study menu
summary: "T101. The note header's graduation-cap menu offers: study this note in note view, in flashcard view, and each deck in flashcard view."
tags:
  - task
calendar:
  - Optimization
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

# Study - Note header study menu (T101)

## What Sawyer asked
> Launching study mode from a note by clicking the `graduation-cap` icon - we need to update this menu
> - "Study this note in note view"
> - "Study this note in flashcard view"
> - "Study the deck in flashcard view: {Deck}"

## Current state
`showStudyMenu` in `src/views/LineRevealProcessor.ts` (~918–981): "Study here" → `ensurePreview` + `toggleStudy`; "This note (popup)" → `plugin.openStudySession({type:"note", notePath})`; one deck → "Deck: X (popup)", several → submenu (on mobile, one item per deck). "(popup)" is stale since T91 made the session a tab. `decksOfNote` is `src/study/note-scope.ts:30`.

## Design
- Item 1 "Study this note in note view" = old "Study here". Item 2 "Study this note in flashcard view" = old "This note (popup)". Item 3, per deck: "Study the deck in flashcard view: {Deck}" (deck shown with its full path as today). Several decks → one such item per deck (no submenu needed; keep it flat on all platforms unless there are more than ~5, then keep the existing submenu behaviour).
- Keep icons (graduation-cap / file-text / layers).
- Batch 14's rename (T105) relabels modes "Note" and "Flashcard"; these strings already use the new names.

## Acceptance criteria
- The menu shows exactly those items with that wording; each does what its predecessor did.

## Test plan
A note with cards in one deck, and one with cards in two decks; desktop and phone.

## Context budget (~8k tokens)
- `LineRevealProcessor.ts` 900–985.

## Conventions
- Batch 14 ticket: commit `feat(T101): …`/`fix(T101): …` plus one `docs(T101)` note commit setting `status: In-Review` with a "Batch implementation notes (awaiting manual test)" section. Stage by explicit path; `git diff --cached --stat` before each commit; never `git stash`; don't push.
- Batch 12 (T91/T92) round-2 facts: the study tab's buttons sit in one floating panel; every mode's rating row uses the shared class `osmosis-contextual-rating` (colour rules only at `.osmosis-contextual-rating button.osmosis-rate-*` in styles.css); deck-count colours come from `--osmosis-count-new/learn/due`, declared on `.osmosis-dashboard, .osmosis-study-view`.
- Lint → test → build, one at a time (7 GB RAM). Pure logic goes in `src/study/` or similar (vitest cannot import obsidian) and gets unit tests.
