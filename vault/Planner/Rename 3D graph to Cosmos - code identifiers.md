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
status: Done
batch: 14
priority:
progress: 100
date_created: 2026-11-20T12:00:00.000Z
date_modified: 2026-11-21T06:37:55.000Z
date_start_scheduled: 2026-11-20T23:18:02.000Z
date_start_actual: 2026-11-20T23:18:02.000Z
date_end_scheduled: 2026-11-21T06:37:55.000Z
date_end_actual: 2026-11-21T06:37:55.000Z
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/52
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

## What was implemented

**Where it shipped:** [PR #52](https://github.com/SawyerRensel/Osmosis/pull/52) (batch 14, branch `batch/14-study-polish-renames`), merged into `release/0.0.6`. Sawyer tested it by hand on 2026-11-21 and passed it on the first test of its round.

The batch worker wrote this record when the code was committed.

**Approach.** A scripted, behaviour-neutral rename (`git mv` for files, a byte-level Python pass with whole-word patterns), then tsc, lint, the full suite and the build. Code commit `1327e30`.

### Old to new
| Old | New |
|---|---|
| `src/graph3d/` (all modules and tests) | `src/cosmos/` |
| `src/views/Graph3D*.ts` (View, Scene, Study, Plates, Near, Overlays, Sticks, Ribbons, Perf, Hints, Help, Gizmos, Boundaries, Shells, Edit, TrailPicker, and tests) | `src/views/Cosmos*.ts` |
| `Graph3DView`, `Graph3DScene`, `Graph3DOverlays` (type) and every other `Graph3D*` identifier | `Cosmos*` |
| `VIEW_TYPE_GRAPH3D`, `GRAPH3D_HIDDEN_BUTTONS`, `GRAPH3D_DEFAULT_DEPTH` | `VIEW_TYPE_COSMOS` (value `"osmosis-cosmos"`, unchanged), `COSMOS_HIDDEN_BUTTONS`, `COSMOS_DEFAULT_DEPTH` |
| `plugin.openGraph3D`, `setGraph3DOverlays`, `setGraph3DSettingsCollapsed`, `refreshOpenGraph3DControls` | `openCosmos`, `setCosmosOverlays`, `setCosmosSettingsCollapsed`, `refreshOpenCosmosControls` |
| `MindMapView.graph3dState` | `cosmosState` |
| CSS `osmosis-graph3d-*` (classes and `--osmosis-graph3d-*` custom properties) | `osmosis-cosmos-*`, in `styles.css` and every TS reference together |
| Relational-study identifiers | None were left in code after T106; only comments said "relational study", now "Cosmos study". |

### Decisions
- **Kept: stored keys.** `graph3dOverlays` and `graph3dSettingsCollapsed` (settings), and the `graph3d` key in the leaf view state that the 2D/3D toggle hands between `CosmosView` and `MindMapView`. Renaming them would lose users' stored values, and the ticket said stored keys are out of scope. Keeping them is the simpler route; the settings keys can be added to `RENAMED_SETTING_KEYS` with a test later if wanted.
- **Kept: command ids** `open-graph3d` and `mindmap-toggle-3d`, so users' hotkeys survive.
- **Kept: legacy migration names** in `src/cosmos-legacy.ts(.test)` and `src/study/mode-names.ts(.test)`, plus `graph3dTouchDrag` and `graph3dPositions` in `main.ts`, which `loadSettings` deletes. Those two files were excluded from the script.
- **Kept: fixture directories** `e2e/fixtures/graph3d/`, `vault/tests/graph3d/` and the e2e script names `generate-graph3d-stress.mjs` and `measure-graph3d-ticks.ts`. `vault/tests/` is Sawyer's live vault copy and notes link to those paths. Only the scripts' `src/` imports were updated. Test strings such as `"tests/graph3d/Crew Drills.md"` match the real fixture dir.
- **Kept: Planner note titles** quoted in comments (`vault/Planner/3D Graph - ... .md`): closed notes keep their names.
- **Kept: `ForceGraph3D`**, the `3d-force-graph` library's own names.
- Prose "3D graph" in comments and CSS comments became "Cosmos". One image file name in `e2e/generate-perf-notes.mjs` was caught by the pass and restored.

### Surface map
| File | Change |
|---|---|
| `src/graph3d/**` | `git mv` to `src/cosmos/**`, identifiers and comments renamed |
| `src/views/Graph3D*.ts` | `git mv` to `src/views/Cosmos*.ts`, renamed |
| `src/main.ts`, `src/settings.ts`, `src/views/MindMapView.ts`, `PropertiesSidebarView.ts`, `ToolRibbon.ts`, other `src/*` importers | Imports, class names, plugin method names, comment wording |
| `styles.css` | `osmosis-graph3d-*` to `osmosis-cosmos-*` (size unchanged, about 158 KB) |
| `docs/mind-mapping/cosmos.md` | Path `src/cosmos/controls-help.ts` |
| `e2e/measure-near-panels.ts`, `e2e/measure-graph3d-ticks.ts` | `src/` import paths |

### Fixture
None new. Reuse `vault/tests/graph3d/` (for example `Sailing Basics.md`) for the smoke test.

### Results
`tsc` clean for `src/`, lint 0 errors (2 accepted sentence-case warnings), vitest 149 files / 3512 tests pass, build passes.

### Could not verify
Nothing was run in Obsidian. A CSS selector typo would show as an unstyled Cosmos; the rename was one global pattern applied to `styles.css` and TS together, so a mismatch is unlikely.
