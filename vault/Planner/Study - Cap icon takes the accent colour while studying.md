---
title: Study - Cap icon takes the accent colour while studying
summary: "T100. The graduation-cap header action is accent-coloured while its view is in study mode, in every mode."
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

# Study - Cap icon takes the accent colour while studying (T100)

## What Sawyer asked
> Color the study cap icon in the header menus for all study modes the theme accent color (default is Obsidian purple) when study mode is activated.

## Design
- Every study cap action already toggles `is-active` while studying:
  - Mind map: `MindMapView.ts` ~2119 `addAction("graduation-cap", …)`, `is-active` add ~1453 / remove ~1518. **MindMapView.ts has NUL bytes: use `grep -a`, and read only these ranges.**
  - 3D graph: `Graph3DView.ts` ~436, `toggleClass("is-active", …)` ~694 and ~2263.
  - Note study: `LineRevealProcessor.ts` ~849–899 (hand-made `.osmosis-line-study-action`, toggled ~873).
  - Flashcard study tab gets its cap action in T103; that ticket must set `is-active` the same way, so this CSS covers it.
- Add one CSS rule: the study cap action with `is-active` gets `color: var(--interactive-accent)` (icon stroke follows `currentColor`). Give the caps a shared class (e.g. `osmosis-study-cap`) so the rule doesn't hit other `is-active` header actions.
- Check the mobile header/nav where Obsidian may restyle view actions.

## Acceptance criteria
- In each mode, the cap is accent-coloured while studying and returns to normal when study ends; no other header icon changes colour.

## Test plan
Toggle study on/off in Note, mind map and 3D graph views (desktop and phone); change the accent colour once.

## Context budget (~15k tokens)
- The three line ranges above (±30 lines each), styles.css grep `view-action` / `is-active`.

## Conventions
- Batch 14 ticket: commit `feat(T100): …`/`fix(T100): …` plus one `docs(T100)` note commit setting `status: In-Review` with a "Batch implementation notes (awaiting manual test)" section. Stage by explicit path; `git diff --cached --stat` before each commit; never `git stash`; don't push.
- Batch 12 (T91/T92) round-2 facts: the study tab's buttons sit in one floating panel; every mode's rating row uses the shared class `osmosis-contextual-rating` (colour rules only at `.osmosis-contextual-rating button.osmosis-rate-*` in styles.css); deck-count colours come from `--osmosis-count-new/learn/due`, declared on `.osmosis-dashboard, .osmosis-study-view`.
- Lint → test → build, one at a time (7 GB RAM). Pure logic goes in `src/study/` or similar (vitest cannot import obsidian) and gets unit tests.
