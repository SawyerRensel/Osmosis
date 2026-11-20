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
status: In-Review
batch: 14
priority:
progress:
date_created: 2026-11-20T12:00:00.000Z
date_modified: 2026-11-20T12:00:00.000Z
date_start_scheduled: 2026-11-20T23:05:49.000Z
date_start_actual: 2026-11-20T23:05:49.000Z
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

## Batch implementation notes (awaiting manual test)

**Approach.** A behaviour-neutral rename done with whole-word scripts (`(?<![\w-])...(?![\w-])`, byte-level), then `tsc`, lint, the full suite (148 files, 3503 tests) and the build. `styles.css` stayed 158 KB. Code commit `4b5ba4d`.

**Mapping.**
- Files (`git mv`): `views/SequentialStudyView.ts` -> `FlashcardStudyView.ts`; `views/ContextualStudyProcessor.ts` (+ `.dom.test.ts`) -> `NoteStudyProcessor.ts`; `study/spatial-study.ts` (+ test) -> `mindmap-study.ts`. e2e fixtures `contextual-reveal-test` -> `note-reveal-test`, `sequential-context-test` -> `flashcard-context-test`, `spatial-study-test` -> `mindmap-study-test` (their `osmosis-deck:` values renamed too).
- Classes and fields: `SequentialStudyView` -> `FlashcardStudyView`, `ContextualStudyProcessor` -> `NoteStudyProcessor`, `ContextualUndoEntry` -> `NoteUndoEntry`, `plugin.contextualStudy` -> `plugin.noteStudy`, `SpatialMode` -> `MindmapStudyMode`, `SpatialNodeLike` -> `MindmapNodeLike`, `spatialMode` (gesture opts) -> `mindmapStudyMode`.
- mindmap-study exports: `spatialStudyKeys` -> `mindmapStudyKeys`, `cardIdsForSpatialKey` -> `cardIdsForMindmapKey`, `spatialSessionCards` -> `mindmapSessionCards`.
- MindMapView (~210 identifiers): prefix `spatialX` -> `mindmapStudyX` (`spatialTargets` -> `mindmapStudyTargets`, `spatialStripEl` -> `mindmapStudyStripEl`, ...); methods `enterSpatialStudy/Peek` -> `enterMindmapStudy/Peek`, `toggleSpatialStudy/Peek` -> `toggleMindmapStudy/Peek`, `exitSpatialMode` -> `exitMindmapStudyMode`, `applySpatialState/Hidden` -> `applyMindmapStudyState/Hidden`, `rateSpatialCard` -> `rateMindmapStudyCard`, `handleSpatialClick` -> `handleMindmapStudyClick`, `setSpatialTargets` -> `setMindmapStudyTargets`, `ensureSpatialStrip` -> `ensureMindmapStudyStrip`.
- CSS: `osmosis-contextual-rating` -> `osmosis-rating` (shared row; both rule blocks in styles.css keep the same rules), `-rating-slot` -> `osmosis-note-rating-slot`, other `osmosis-contextual-*` (bottom, card, draft, excluded, exclude-toggle, front, hidden, progress, rated, revealed, start-btn, step, undo) -> `osmosis-note-*`; `osmosis-spatial-{hidden,placeholder,rating,rating-fo,revealed}` -> `osmosis-mindmap-study-*`. Mind map nodes reuse the note's `osmosis-note-front/-revealed` classes, as they reused the contextual ones before.

**Decisions.**
- Camel-case spelling is `Mindmap` (matches the stored key `mindmap`), not `MindMap`.
- Comments and doc-comments in touched files were reworded to the new mode names ("note study", "flashcard study", "mind map study"). Tests and fixture prose in other e2e fixtures (e.g. `occlusion-surfaces.md`, `fence-card-types.md`) still say "sequential/contextual" in their user-facing text; left alone because renaming a fixture's text while it may be open in Obsidian risks the reset hazard.
- Graph3D files (`graph3d/study.ts`, `trails.ts`, `near.ts`, `Graph3DStudy.ts`) were touched only for the imports/identifiers they share with the renamed modules and the `osmosis-rating` class; no Graph3D naming was changed (T108).
- `aggregate.test.ts` local `const spatial` -> `mindmapScope`.
- `docs/studying/study-modes.md`: the Note study paragraph now describes the progress bar with counts above the note title and stopping with the header icon, instead of the pill and Stop button. Also updated the stale `study/spatial-study.ts` path in `notes/02_planning/notes_as_flashcards_plan.md`.

**Residual grep (kept on purpose).** `src/study/mode-names.ts` (legacy-name maps) and its test; `settings.ts` / `main.ts:1768` / `ReviewLog.ts:1183` / `ReviewLog.test.ts` (old setting keys and log values, T105 migration); `charts.ts:397` ("sequential" colour ramp) and `styles.css:3397` (same); `mindmap-edit.ts:1418` and `MindMapView.ts:8572` ("numbered sequentially", the adverb); `mindmap-study.ts:5` ("spatial context" = the map's layout, not the mode); plan-doc heading quotes at `mindmap-study.ts:7`, `line-reveal.ts:8`, `MindMapView.ts:524` ("Spatial (Mind Map View)", "Contextual (Note View)" are headings in the plan doc).

**Surface map.**
| File | Change |
|---|---|
| `src/views/FlashcardStudyView.ts`, `NoteStudyProcessor.ts` (+ `.dom.test.ts`), `src/study/mindmap-study.ts` (+ test) | `git mv` + identifier/comment rename |
| `src/views/MindMapView.ts`, `LineRevealProcessor.ts`, `Graph3DStudy.ts`, `src/main.ts`, `src/mindmap-gesture.ts` (+ test), `src/graph3d/{study,trails,near}.ts`, `src/card-gen/explicit.ts` | imports, fields, CSS class references |
| `styles.css` | CSS class rename and section headings |
| ~25 other `src/` files | comment wording only |
| `e2e/fixtures/{note-reveal,flashcard-context,mindmap-study}-test.md` | `git mv` + deck name |
| `docs/studying/study-modes.md`, `notes/02_planning/notes_as_flashcards_plan.md` | Note study paragraph; path |

**Fixture.** Reused the renamed e2e fixtures above; none are copied into `vault/tests/` (there were no old copies there).

**Not verified.** Nothing run in Obsidian. The CSS class rename is only checked by grep and by the DOM tests; a missed class would show as lost styling, so the smoke test below checks it.

**Smoke test (Obsidian, reload first).** Use `note-reveal-test.md`, `flashcard-context-test.md`, `mindmap-study-test.md` copied to `vault/tests/`, with cards back-dated.
- Flashcard study: open a deck, rate with 1-4, undo with Ctrl+Z, end with the header cap. The rating row colours and the fixed bar look unchanged.
- Note study: start from the note header cap, reveal, rate (coloured rating bubble), Ctrl+Z, end with the cap. Fence styling (hidden/revealed/start/exclude toggle) unchanged.
- Mind map study: click the cap, tap a `?` node, rate with the bubble and with 1-4, Ctrl+Z, click the cap to end. Placeholder, revealed highlight and rating bubble unchanged; the strip shows counts.
- Cosmos (3D) study rating row still coloured.

**For T108.** Graph3D code still imports `mindmapStudyKeys`, `cardIdsForMindmapKey`, `dueOrNewFenceCardKeys`, `dueOrNewLineCardIds`, `fenceKeyFromNode` from `study/mindmap-study`, and mentions `MindMapView.mindmapStudyNodeStep` / `applyMindmapStudyHidden` in comments. Its rating row uses the shared `osmosis-rating` class.
