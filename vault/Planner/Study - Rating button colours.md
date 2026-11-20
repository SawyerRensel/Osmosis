---
title: Study - Rating button colours
summary: "T99. Easy takes the accent purple, Good becomes blue, in every study mode."
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
status: In-Review
batch: 14
priority:
progress:
date_created: 2026-11-20T12:00:00.000Z
date_modified: 2026-11-20T17:30:00.000Z
date_start_scheduled: 2026-11-20T17:20:00.000Z
date_start_actual: 2026-11-20T17:20:00.000Z
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

# Study - Rating button colours (T99)

## What Sawyer asked
> Better rating button color scheme. Keep the Obsidian purple but make it the "Easy" button instead of "Good". "Good" gets a blue color.

## Design
- Easy → `var(--interactive-accent)` (default Obsidian purple, follows the user's accent). Good → a blue. Prefer `var(--color-blue)` if it reads well on the button with white text in both themes; otherwise a fixed hsl blue. Again (red) and Hard (orange) are unchanged.
- One place: the colour rules are only `.osmosis-contextual-rating button.osmosis-rate-again/hard/good/easy` (styles.css ~1948–1966 at time of writing). Every mode (study tab, Note fence/line-reveal, mind map, 3D graph) shares that class, so one edit covers all.
- Check the hover filter (~1922/1934), the `.is-suggested` outline (~2045) and the occlusion anchor (~2555/2564) still look right on the new colours.
- Declare the four colours as CSS variables (e.g. `--osmosis-rate-again/hard/good/easy`) so later surfaces reuse them.

## Acceptance criteria
- In all four study modes, Easy is the accent colour and Good is blue; Again/Hard unchanged.
- Text stays readable in light and dark themes; changing the accent colour recolours Easy.

## Test plan
Study one card in each mode (Flashcard tab, Note study, mind map study, 3D graph study) in light and dark themes; change the accent colour once.

## Context budget (~10k tokens)
- `styles.css`: grep `osmosis-rate-` and read only those rule blocks (±10 lines each).
- No TypeScript should need to change.

## Conventions
- Batch 14 ticket: commit `feat(T99): …`/`fix(T99): …` plus one `docs(T99)` note commit setting `status: In-Review` with a "Batch implementation notes (awaiting manual test)" section. Stage by explicit path; `git diff --cached --stat` before each commit; never `git stash`; don't push.
- Batch 12 (T91/T92) round-2 facts: the study tab's buttons sit in one floating panel; every mode's rating row uses the shared class `osmosis-contextual-rating` (colour rules only at `.osmosis-contextual-rating button.osmosis-rate-*` in styles.css); deck-count colours come from `--osmosis-count-new/learn/due`, declared on `.osmosis-dashboard, .osmosis-study-view`.
- Lint → test → build, one at a time (7 GB RAM). Pure logic goes in `src/study/` or similar (vitest cannot import obsidian) and gets unit tests.

## Batch implementation notes (awaiting manual test)

Code commit: `3967291` on `batch/14-study-polish-renames`. CSS only.

- **Palette as variables.** `.osmosis-contextual-rating` declares `--osmosis-rate-again/hard/good/easy`, and the four `button.osmosis-rate-*` rules read them. Again and Hard keep their hsl values. Good is `var(--color-blue, hsl(212, 90%, 44%))` with white text. Easy is `var(--interactive-accent)` with `--text-on-accent`, so changing the accent recolours it.
- **Suggested outline.** `.osmosis-study-rating-bar button.is-suggested` drew its outline in the accent colour, which was invisible on Good before and would be invisible on Easy now. It now uses `--text-normal`.
- Hover (`filter: brightness(1.1)`) and the occlusion anchor set no colours, so they need no change.
- No TypeScript changed. Lint and build pass.
