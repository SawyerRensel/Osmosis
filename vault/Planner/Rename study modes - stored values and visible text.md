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
