---
title: Rename study modes - stored values and visible text
summary: "T105. Sequential/Contextual/Spatial/Relational become Flashcard/Note/Mind map/Cosmos in every label, doc and stored value; old review logs still read."
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
date_start_scheduled: 2026-11-20T17:50:20.000Z
date_start_actual: 2026-11-20T17:50:20.000Z
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

# Rename study modes - stored values and visible text (T105)

## Naming (settled with Sawyer, 2026-11-20)
| Old | New (label) | New (key) |
|---|---|---|
| Sequential | Flashcard | `flashcard` |
| Contextual | Note | `note` |
| Spatial | Mind map | `mindmap` |
| Relational | Cosmos | `cosmos` |
The whole 3D graph view becomes **Cosmos** (T107, T108).

## Scope of this ticket (the code identifiers are T106)
- **Stored values:**
  - `StudyMode` (`src/database/types.ts:107`) becomes `"flashcard"|"note"|"mindmap"|"cosmos"`.
  - The review log field `m` (`src/store/ReviewLog.ts`: :86, serialised :132, parsed :171 via `parseStudyMode` :1181–1183, `STUDY_MODES` :475, `byMode` :485/545) writes the new keys.
  - **Migration decision (Sawyer): read both, write new.** `parseStudyMode` maps legacy values to the new ones, and existing review-log files are never rewritten. Unit-test the legacy mapping.
  - Also update `createSessionManager("…")` call sites (SequentialStudyView:241, ContextualStudyProcessor:999/1033, LineReveal:589, MindMapView:1936, Graph3DStudy:246) and the `mode === "contextual"` branches (StudySessionManager:314/329).
  - Stats keys: `stats/aggregate.ts` 361–368 (and its scope `mode` filter) and `stats/detail.ts` 74–77.
- **Settings keys** (data.json): rename `contextualAutoActivate`, `contextualInlineCloze` and `sequentialContextLines` (`settings.ts` 143–149, defaults 219–222, UI 520; consumer SequentialStudyView:240) to the new names. Migrate in `loadSettings`: copy the old key to the new key when the new key is absent, then delete the old one. Unit-test this if the logic is pure.
- **Visible text:**
  - StatsView 82–85 and 817–820
  - the Graph3DView tooltip/notices "Relational study" (:436, :730, :999)
  - LineReveal:618 "Contextual study complete"
  - MindMapView:1946 "Spatial study complete"
  - settings descriptions 465/512/517
  - docs: about 148 hits across docs/*.md, README, and `docs/assets/javascripts/home-media.js`
  - The changelog's past entries stay as written: history is history. Add a new entry noting the rename.
- Image file names `docs/assets/media/osmosis_sequential_*`: rename them only together with every reference to them, or leave them all alone. Say which you chose.

## Acceptance criteria
- No user-visible "Sequential/Contextual/Spatial/Relational" is left in the plugin UI or docs (check with grep, excluding the changelog history).
- New reviews log the new keys. Stats count old and new logs under the same new mode names.
- Old settings values carry over.
- Lint, test and build pass.

## Test plan
- With existing review history, open Stats. The mode filter and legend show Flashcard/Note/Mind map/Cosmos, and the old reviews are counted.
- Rate one card in each mode. The new log lines carry the new keys.
- Settings: the three renamed settings keep their values after reload.

## Context budget (~60k tokens)
Use grep + sed rather than reading whole files. Read: ReviewLog.ts at the lines above (±20), settings.ts 140–230 and 455–525, stats/aggregate.ts 350–375, stats/detail.ts 70–80, StatsView.ts 75–90 and 810–825. **MindMapView.ts has NUL bytes: use `grep -a`, and touch only line ~1946.** For the docs, edit by grep hit.

## Conventions
- Batch 14 ticket: commit `feat(T105): …`/`fix(T105): …` plus one `docs(T105)` note commit setting `status: In-Review` with a "Batch implementation notes (awaiting manual test)" section. Stage by explicit path; `git diff --cached --stat` before each commit; never `git stash`; don't push.
- Batch 12 (T91/T92) round-2 facts: the study tab's buttons sit in one floating panel; every mode's rating row uses the shared class `osmosis-contextual-rating` (colour rules only at `.osmosis-contextual-rating button.osmosis-rate-*` in styles.css); deck-count colours come from `--osmosis-count-new/learn/due`, declared on `.osmosis-dashboard, .osmosis-study-view`.
- Lint → test → build, one at a time (7 GB RAM). Pure logic goes in `src/study/` or similar (vitest cannot import obsidian) and gets unit tests.

## What was implemented

**Where it shipped:** [PR #52](https://github.com/SawyerRensel/Osmosis/pull/52) (batch 14, branch `batch/14-study-polish-renames`), merged into `release/0.0.6`. Sawyer tested it by hand and passed it on the first test, on 2026-11-20.

The batch worker wrote this record when the code was committed.

Code commit: `6984924` on `batch/14-study-polish-renames`.

### Approach
- `StudyMode` is now `"flashcard" | "note" | "mindmap" | "cosmos"`. Every `createSessionManager(…)` call and the two `mode === "note"` staging branches in `StudySessionManager` use the new values, so new review-log lines carry them.
- **Read both, write new.** `parseStudyMode` (`src/store/ReviewLog.ts`, now exported) maps `sequential/contextual/spatial/relational` to the new values via `LEGACY_STUDY_MODES` in the new pure module `src/study/mode-names.ts`. Log files are never rewritten. A legacy line re-serialised (e.g. by a shard merge) comes out with the new key.
- **The rollup cache was the hidden third reader.** `normalizeRollup` reads the persisted per-shard `byMode` counts, which a pre-rename cache keys by the old names. It now sums `byMode[new] + byMode[old]` (via `LEGACY_KEY_FOR_MODE`), so old caches keep counting without a rebuild.
- **Settings:** `contextualAutoActivate → noteAutoActivate`, `contextualInlineCloze → noteInlineCloze`, `sequentialContextLines → flashcardContextLines`. `migrateRenamedSettingKeys` (pure, in `mode-names.ts`) runs on the raw `loadData()` result **before** the `Object.assign` with defaults, or the new key's default would shadow the old value. The old value is copied only when the new key is absent, and the old key is always deleted.
- Visible text: Stats legend and mode filter, the line-reveal and mind map completion notices, the Graph3D cap tooltip and the two "editing is off" notices ("Cosmos study"), two settings descriptions, and every docs/README hit. `docs/changelog.md` gets an `[Unreleased]` entry; past entries stay as written.

### Decisions
- **Cache: sum legacy keys rather than bump `CACHE_VERSION`.** The cache is derived, so a bump would also work, but it costs a full re-read of every shard on first open. Summing is free and covered by a unit test. Don't remove the legacy half of the sum: caches written before the rename stay valid indefinitely, because a shard's cache entry is only rebuilt when its mtime or size changes.
- **Image file names left alone** (`docs/assets/media/osmosis_sequential_*`, `osmosis_spatial_mode_line_card.png`). README loads them by absolute `raw.githubusercontent.com/.../main/` URL, and the plugin directory renders that README, so renaming would break images until merge and any outside links for good. The docs' Markdown alt text still repeats those file names (e.g. `![osmosis_sequential_mode_card_basic](…)`). That alt text is only read by screen readers and was left with the file names.
- **Heading anchors changed:** `#sequential-study → #flashcard-study`, `#contextual-study → #note-study`, `#spatial-study → #mind-map-study`. Every in-repo link was updated, including T101's `[flashcard](#flashcard-study)`.
- Landing-page swap keys (`data-osmosis-swap-key` in `docs/index.md`, plus the comment in `home-media.js`) renamed to `mindmap/note/flashcard`. These aren't user-visible but were renamed for consistency, every reference together.
- Generic English left as is: "spatial context", "spatial memory associations" (study-modes.md) and "spatial understanding" (use-cases.md) describe space, not the mode.
- The "sequential modal" phrasing became "flashcard study" or "flashcard study tab", because the same doc already describes flashcard study as its own tab. Choosing a Mode's Context column now says "Its own study tab" instead of "Modal dialog".
- `data-storage.md` documents the four `m` values and that old lines with the old names are read but never rewritten.
- Not done (out of scope): CSS classes (`osmosis-contextual-*`, `osmosis-spatial-*`), class and file names (`SequentialStudyView`, `ContextualStudyProcessor`, `spatial-study.ts`, `spatialSessionManager`, …) and comments are T106. The Graph3D view's own naming is T107/T108. The study-modes doc still describes three modes; a Cosmos section belongs with T107/T108.

### Surface map
| File | Change |
|---|---|
| `src/study/mode-names.ts` (new) | `LEGACY_STUDY_MODES`, `LEGACY_KEY_FOR_MODE`, `migrateRenamedSettingKeys` |
| `src/study/mode-names.test.ts` (new) | settings-key migration tests |
| `src/database/types.ts` | `StudyMode` values |
| `src/store/ReviewLog.ts` | `STUDY_MODES`, empty bucket, legacy-aware `parseStudyMode` (exported), cache `byMode` sums legacy keys |
| `src/store/ReviewLog.test.ts` | new values; legacy parse, re-serialise, prototype-key and legacy-cache tests |
| `src/stats/aggregate.ts`, `src/stats/detail.ts` | mode totals keyed by new values |
| `src/study/StudySessionManager.ts` | `mode === "note"` staging branches |
| `src/views/{SequentialStudyView,ContextualStudyProcessor,LineRevealProcessor,MindMapView,Graph3DStudy}.ts` | `createSessionManager` values; notices "Note study complete" / "Mind map study complete" |
| `src/views/Graph3DView.ts` | "Cosmos study" tooltip and notices |
| `src/views/StatsView.ts` | legend and mode-filter keys and labels |
| `src/settings.ts`, `src/main.ts` | renamed keys and defaults; descriptions; `loadSettings` migrates before merging defaults |
| `src/graph3d/study.ts` | doc comment's stored value |
| `src/stats/*.test.ts`, `src/study/{StudySessionManager,note-scope}.test.ts` | new values |
| `README.md`, `docs/**/*.md`, `docs/assets/javascripts/home-media.js` | renamed prose, headings, anchors, swap keys; changelog `[Unreleased]` entry |

### Fixture
No new fixture. The dev vault already holds the right data: `vault/Osmosis/Reviews/*.fixture.md` (gitignored) are review-log shards written with the old `m` values, and `vault/.obsidian/plugins/Osmosis/data.json` has `"sequentialContextLines": 5` (not the default 2).

### Not verified
- Nothing ran in Obsidian. Stats rendering, the migrated slider value and the new log lines are covered only by unit tests and `tsc`.
- Whether a stale rollup cache from before the rename sums correctly in the live vault. This is unit-tested, not observed.

