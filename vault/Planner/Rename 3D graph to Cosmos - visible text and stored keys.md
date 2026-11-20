---
title: Rename 3D graph to Cosmos - visible text and stored keys
summary: "T107. The 3D graph view becomes Cosmos everywhere the user sees it; its view type and settings/localStorage keys migrate."
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

# Rename 3D graph to Cosmos - visible text and stored keys (T107)

## Naming (settled with Sawyer, 2026-11-20)
| Old | New (label) | New (key) |
|---|---|---|
| Sequential | Flashcard | `flashcard` |
| Contextual | Note | `note` |
| Spatial | Mind map | `mindmap` |
| Relational | Cosmos | `cosmos` |
The whole 3D graph view becomes **Cosmos** (T107, T108).

## Scope (code identifiers are T108)
- **Visible text:**
  - the command `open-graph3d` "Open 3D graph for current note" (main.ts 369–370; its name becomes "Open Cosmos for current note")
  - file-menu "3D graph" (main.ts:477)
  - settings heading (settings.ts:398)
  - ToolRibbon.ts:58 "Toggle between 2D mind map and 3D graph"
  - Graph3DView display text (:373), empty state (:445) and notices (:2471, :2495)
  - docs `mind-mapping/graph-3d.md` → the Cosmos doc (rename it with its nav and links), `editing.md`, README
  - Dev-facing `console.error("Osmosis: 3D graph…")` messages become "Cosmos" too.
- **Command IDs:** decide whether `open-graph3d` becomes `open-cosmos`. A changed command ID loses the user's hotkey binding for it, so keep the old ID unless Obsidian offers an alias. Record the decision.
- **View type:** `VIEW_TYPE_GRAPH3D = "osmosis-graph3d"` (Graph3DView.ts:59) becomes `"osmosis-cosmos"`. Saved workspaces still hold `osmosis-graph3d` leaves. Migrate them: on layout-ready, find leaves of the old type (Obsidian keeps an unknown view type as an empty leaf, so check how it is exposed) and `setViewState` them to the new type with their state. Alternatively, register the old type as a thin alias that converts itself. Read how the codebase handled earlier view-type changes, if there were any.
- **Settings keys:** `graph3dDesktopPivot` and `graph3dOneFingerDrag` become `cosmos*`, migrated in `loadSettings` (copy if absent, then delete). **localStorage keys** `osmosis-graph3d-*` (Graph3DView.ts :73/:79/:85): read old as a fallback, write new, remove old.
- Out of scope: file, class and CSS names (T108).

## Acceptance criteria
- No user-visible "3D graph" is left.
- A vault with a 3D graph tab open before the update reopens it as Cosmos after the update.
- Settings and localStorage preferences carry over.
- Lint, test and build pass.

## Test plan
On the old build, open a 3D graph tab and set a pivot and one-finger-drag preference. Install the new build and restart. The tab opens as Cosmos with the same note, and the preferences hold. Check the command palette, file menu, settings heading, ribbon toggle and docs.

## Context budget (~40k tokens)
main.ts 360–380 and 470–485; settings.ts 140–230 and 390–410; Graph3DView.ts 50–90, 365–450, 2465–2500; ToolRibbon.ts 50–65; docs by grep.

## Conventions
- Batch 14 ticket: commit `feat(T107): …`/`fix(T107): …` plus one `docs(T107)` note commit setting `status: In-Review` with a "Batch implementation notes (awaiting manual test)" section. Stage by explicit path; `git diff --cached --stat` before each commit; never `git stash`; don't push.
- Batch 12 (T91/T92) round-2 facts: the study tab's buttons sit in one floating panel; every mode's rating row uses the shared class `osmosis-contextual-rating` (colour rules only at `.osmosis-contextual-rating button.osmosis-rate-*` in styles.css); deck-count colours come from `--osmosis-count-new/learn/due`, declared on `.osmosis-dashboard, .osmosis-study-view`.
- Lint → test → build, one at a time (7 GB RAM). Pure logic goes in `src/study/` or similar (vitest cannot import obsidian) and gets unit tests.
