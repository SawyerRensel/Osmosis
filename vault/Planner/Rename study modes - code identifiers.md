---
title: Rename study modes - code identifiers
summary: "T106. Files, classes, CSS classes and identifiers named sequential/contextual/spatial take the new mode names; no behaviour change."
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

# Rename study modes - code identifiers (T106)

## Naming (settled with Sawyer, 2026-11-20)
| Old | New (label) | New (key) |
|---|---|---|
| Sequential | Flashcard | `flashcard` |
| Contextual | Note | `note` |
| Spatial | Mind map | `mindmap` |
| Relational | Cosmos | `cosmos` |
The whole 3D graph view becomes **Cosmos** (T107, T108).

## Scope (behaviour-neutral refactor; runs after T105)
- Files: `views/SequentialStudyView.ts` → `FlashcardStudyView.ts`, `views/ContextualStudyProcessor.ts` (+ `.dom.test.ts`) → `NoteStudyProcessor.ts`, `study/spatial-study.ts` (+ test) → `mindmap-study.ts`. Use `git mv` so history follows.
- Classes and fields: `SequentialStudyView` (main.ts 18/296/1311), `ContextualStudyProcessor` (main.ts 25/145/608), `plugin.contextualStudy`, `SpatialMode` (mindmap-gesture.ts:6), the spatial-study exports (`spatialStudyKeys`, `cardIdsForSpatialKey`, … imported by graph3d/trails.ts, graph3d/study.ts, Graph3DStudy, LineReveal, MindMapView, ContextualStudyProcessor).
- MindMapView has about 150 `spatial*` identifiers (`spatialMode`, `spatialTargets`, `spatialPendingRating`, `spatialStudyActionEl`, …) that become `mindmapStudy*` or similar. **That file has NUL bytes and is about 84k tokens: never read it whole.** Rename with `sed -i` on exact identifiers, then check with `grep -a` and `tsc`.
- CSS: `osmosis-contextual-*` (15 classes; `-rating` is now the shared rating row, so name it `osmosis-rating`), `osmosis-spatial-*` (5). Change styles.css (45 lines) and every TS reference together.
- e2e fixtures `contextual-reveal-test`, `sequential-context-test` and `spatial-study-test`, plus their vault copies: rename them with their references.
- Out of scope: stored values (T105, already done) and Graph3D/relational code (T108). `VIEW_TYPE_STUDY = "osmosis-study"` stays.

## Acceptance criteria
- `grep -rniE "sequential|contextual|spatial" src styles.css` finds no study-mode identifiers. Note: the word "spatial" can mean something else (e.g. a spatial index); keep those uses and list them.
- No behaviour change. Lint, the full test suite and the build pass.

## Test plan
A smoke test of each study mode: start, rate, undo and end. The mind map's study styling and the Note fence styling look unchanged.

## Context budget (~45k tokens)
Mechanical: grep for counts, `git mv`, scripted `sed` on whole identifiers, then `tsc`. Read only the lines `tsc` or the tests complain about.

## Conventions
- Batch 14 ticket: commit `feat(T106): …`/`fix(T106): …` plus one `docs(T106)` note commit setting `status: In-Review` with a "Batch implementation notes (awaiting manual test)" section. Stage by explicit path; `git diff --cached --stat` before each commit; never `git stash`; don't push.
- Batch 12 (T91/T92) round-2 facts: the study tab's buttons sit in one floating panel; every mode's rating row uses the shared class `osmosis-contextual-rating` (colour rules only at `.osmosis-contextual-rating button.osmosis-rate-*` in styles.css); deck-count colours come from `--osmosis-count-new/learn/due`, declared on `.osmosis-dashboard, .osmosis-study-view`.
- Lint → test → build, one at a time (7 GB RAM). Pure logic goes in `src/study/` or similar (vitest cannot import obsidian) and gets unit tests.
