---
title: Decks page tab and the Flashcard study toggle
summary: "T103. A Decks page in the main area, identical to the sidebar dashboard; the ribbon opens it in a new tab, and the Flashcard study tab's cap action toggles back to it."
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

# Decks page tab and the Flashcard study toggle (T103)

## What Sawyer asked
> In Flashcard study mode, we need a study icon button in the header like other study modes have it. Toggling it off takes you back to a new Decks main page area. It's identical to the Decks dashboard in the sidebar. Clicking the Osmosis `brain-circuit` button in the Obsidian ribbon opens this Decks page in a new Obsidian tab.

## Settled with Sawyer
- The sidebar dashboard stays, opened by the existing `open-dashboard` command. The ribbon now opens the Decks page in a **new tab**.

## Current state
- `src/views/DashboardSidebarView.ts` (175 lines): `render()` 49–100 builds into `contentEl` (Browse/Stats bar, column headers, "Study all", deck tree via `renderDeckTree` 117–158, `renderCounts` 160–168); 60 s refresh at :36. Nothing sidebar-specific except the view type.
- `main.ts`: `registerView` ~294; ribbon ~312–314 → `activateDashboard` (~1225–1245, `getLeftLeaf`); `refreshDashboard` ~1215–1223 (must refresh both views); `activateMainView` ~1251; `openStudySession` ~1305–1312.
- `SequentialStudyView.ts`: header actions ~176–178 (Exclude, Open note, Undo); `updateHeaderActions` ~349; its own deck picker `renderPicker` ~364–420 duplicates the dashboard's tree/counts.

## Design
- Extract the dashboard's rendering into one shared renderer (e.g. `src/views/deck-dashboard.ts`, `renderDecksDashboard(containerEl, plugin)`), used by the sidebar view and a new main-area `DecksView` (`VIEW_TYPE_DECKS`, icon `brain-circuit`, title "Decks").
- Ribbon → open `DecksView` in a new tab (`getLeaf("tab")`).
- Flashcard study tab: add a `graduation-cap` header action with the shared study-cap class from T100, `is-active` while a session runs. Toggling it off ends the session (`endSession()`, which flushes) and turns **this same tab** into the Decks page (`leaf.setViewState({type: VIEW_TYPE_DECKS})`). Starting a deck from the Decks page reuses the tab (`openStudySession`).
- Replace the study tab's own deck picker (`renderPicker`) with the Decks page: wherever it showed the picker (empty state, restart with no session, "Choose a deck"), switch the leaf to the Decks view. Remove the then-dead picker code.
- Dashboard refresh must reach every open Decks tab as well as the sidebar.

## Acceptance criteria
- The ribbon opens a Decks tab identical in content and behaviour to the sidebar dashboard.
- In the Flashcard study tab, the cap is accent-coloured while studying; clicking it ends the session (ratings saved) and shows the Decks page in that tab.
- Studying from the Decks page opens/reuses the study tab; counts on both dashboards update after a session.

## Test plan
Ribbon → Decks tab; study a deck; cap off mid-session → Decks page, counts updated; restart Obsidian with a study tab open → Decks page; sidebar dashboard still opens via command; phone.

## Context budget (~55k tokens)
- `DashboardSidebarView.ts` whole (175); `main.ts` 285–320, 380–395, 1210–1320; `SequentialStudyView.ts` 160–260, 340–430, 1020–1100.

## Conventions
- Batch 14 ticket: commit `feat(T103): …`/`fix(T103): …` plus one `docs(T103)` note commit setting `status: In-Review` with a "Batch implementation notes (awaiting manual test)" section. Stage by explicit path; `git diff --cached --stat` before each commit; never `git stash`; don't push.
- Batch 12 (T91/T92) round-2 facts: the study tab's buttons sit in one floating panel; every mode's rating row uses the shared class `osmosis-contextual-rating` (colour rules only at `.osmosis-contextual-rating button.osmosis-rate-*` in styles.css); deck-count colours come from `--osmosis-count-new/learn/due`, declared on `.osmosis-dashboard, .osmosis-study-view`.
- Lint → test → build, one at a time (7 GB RAM). Pure logic goes in `src/study/` or similar (vitest cannot import obsidian) and gets unit tests.
