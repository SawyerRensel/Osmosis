---
title: Rename 3D graph to Cosmos - code identifiers
summary: "T108. Graph3D* files, classes, folders and CSS classes become Cosmos*; no behaviour change."
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

# Rename 3D graph to Cosmos - code identifiers (T108)

## Naming (settled with Sawyer, 2026-11-20)
| Old | New (label) | New (key) |
|---|---|---|
| Sequential | Flashcard | `flashcard` |
| Contextual | Note | `note` |
| Spatial | Mind map | `mindmap` |
| Relational | Cosmos | `cosmos` |
The whole 3D graph view becomes **Cosmos** (T107, T108).

## Scope (behaviour-neutral refactor; runs after T107; Sawyer chose "everything, files too")
- `src/views/Graph3D*.ts` → `Cosmos*.ts`. Covers Graph3DView, Graph3DScene, Graph3DStudy, Graph3DPlates, Graph3DNear, Hints/Ribbons/Shells/Boundaries if prefixed, and their tests. `src/graph3d/` → `src/cosmos/`. Use `git mv`.
- Classes and identifiers: `Graph3DView` → `CosmosView`, `Graph3DScene` → `CosmosScene`, and so on. Also `VIEW_TYPE_GRAPH3D` → `VIEW_TYPE_COSMOS` (the value was already changed in T107), `plugin.openGraph3D` → `openCosmos`, and the relational-study identifiers in the study code (e.g. `relational*`). Settle the cosmos study names here.
- CSS classes `osmosis-graph3d-*` → `osmosis-cosmos-*`, changed in styles.css and every TS reference together.
- Planner/docs links to file paths in `notes/` and closed task notes stay as they are (history). Update links in `docs/` only.
- Out of scope: behaviour, stored keys (T107).

## Acceptance criteria
- `grep -rni "graph3d\|relational" src styles.css` finds nothing, or only items listed with a reason.
- No behaviour change. Lint, the full test suite and the build pass.

## Test plan
A Cosmos smoke test: open it, orbit, pinch and wheel in Planets, run study, use the style sidebar on Cosmos, and edit a node. Everything behaves as before.

## Context budget (~45k tokens)
Mechanical: `git ls-files | grep -i graph3d` for the list, `git mv`, scripted `sed` on whole identifiers, then `tsc`. Never read whole Graph3D files (Graph3DView is 2694 lines). Read only the lines `tsc` or the tests flag.

## Conventions
- Batch 14 ticket: commit `feat(T108): …`/`fix(T108): …` plus one `docs(T108)` note commit setting `status: In-Review` with a "Batch implementation notes (awaiting manual test)" section. Stage by explicit path; `git diff --cached --stat` before each commit; never `git stash`; don't push.
- Batch 12 (T91/T92) round-2 facts: the study tab's buttons sit in one floating panel; every mode's rating row uses the shared class `osmosis-contextual-rating` (colour rules only at `.osmosis-contextual-rating button.osmosis-rate-*` in styles.css); deck-count colours come from `--osmosis-count-new/learn/due`, declared on `.osmosis-dashboard, .osmosis-study-view`.
- Lint → test → build, one at a time (7 GB RAM). Pure logic goes in `src/study/` or similar (vitest cannot import obsidian) and gets unit tests.
