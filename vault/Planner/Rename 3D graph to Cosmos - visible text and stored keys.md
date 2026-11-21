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
status: Done
batch: 14
priority:
progress: 100
date_created: 2026-11-20T12:00:00.000Z
date_modified: 2026-11-21T06:37:55.000Z
date_start_scheduled: 2026-11-20T23:06:52.000Z
date_start_actual: 2026-11-20T23:06:52.000Z
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

## What was implemented

**Where it shipped:** [PR #52](https://github.com/SawyerRensel/Osmosis/pull/52) (batch 14, branch `batch/14-study-polish-renames`), merged into `release/0.0.6`. Sawyer tested it by hand on 2026-11-21 and passed it on the first test of its round.

The batch worker wrote this record when the code was committed.

Code commit: `0c3a7cb` on `batch/14-study-polish-renames`.

### Approach
- **Visible text** is a set of exact string swaps: "3D graph" → "Cosmos" wherever the user sees it (command name, file-menu item, settings heading, style-sidebar heading, ribbon/2D-3D toggle command name, header pill aria-labels, controls-help title and one help row, tab display-text fallback, empty state, both notices). The `console.error`/`console.warn` "Osmosis: 3D graph …" messages say "Cosmos" too.
- **View type** `VIEW_TYPE_GRAPH3D` is now `"osmosis-cosmos"`. Only the new type is registered. On `onLayoutReady`, `reopenLegacyCosmosLeaves()` (main.ts) finds leaves of `"osmosis-graph3d"` and `setViewState`s each one to the new type, keeping its saved state and pin.
  - **How Obsidian keeps an unknown type** (read in `ref/obsidian-core/app.js`, grep only): `setViewState` with no registered creator builds an "unknown pane" view (`Rp extends EmptyView`). Its `getViewType()` returns the saved type string, so `getLeavesOfType("osmosis-graph3d")` finds it. Its `setState` stores the saved state and `getState` returns it, so `getViewState().state` still holds focus, depth and backlinks. Its icon is `lucide-ghost`, and its title is the type string.
  - When `setViewState` gets an icon and a title for a leaf that is not on show, Obsidian builds a deferred placeholder (the same thing it does at startup). The migration therefore passes Cosmos's icon and the focus note's file name. Background tabs then stay deferred instead of building a WebGL scene while hidden. The ghost icon and type-string title are not carried over.
  - Leaf back/forward history is in memory only. `serialize()` on the leaf writes `state` and `pinned`, not history (history is serialized only for duplicate-tab and reopen-closed-tab), so it does not survive a restart.
- **Settings keys** `graph3dDesktopPivot` → `cosmosDesktopPivot` and `graph3dOneFingerDrag` → `cosmosOneFingerDrag` are added to T105's `RENAMED_SETTING_KEYS` map in `src/study/mode-names.ts`. The rule is the same: copy if the new key is absent, always delete the old one, before the defaults merge.
- **localStorage keys** `osmosis-graph3d-sticks`, `-click-selects-only`, `-near-tier-mobile` and `-near-tier-desktop` → `osmosis-cosmos-*`. They move once in `onload`, before any view can read them: the value is copied if the new key is absent (a new value wins), then the old key is cleared with `saveLocalStorage(key, null)`. Both near-tier platform keys are moved, so a desktop that emulates mobile keeps both pairs.
- The new pure module `src/cosmos-legacy.ts` holds the legacy view type, the new storage keys (Graph3DView imports them, so there is one source), the rename table, `migrateStorageKeys`, `cosmosViewStateFrom` and `cosmosTabTitle`. It has unit tests.

### Decisions
- **The command ID stays `open-graph3d`.** Obsidian has no alias for command IDs, and hotkeys are stored by full ID (`osmosis:open-graph3d`) in `.obsidian/hotkeys.json`. A new ID would silently drop a user's binding. Only the name changed. `mindmap-toggle-3d` is unchanged for the same reason.
- **localStorage moves once at load rather than as a read fallback.** The ticket asked to read the old key as a fallback, write the new one and remove the old one. Doing that once before any view opens has the same result with one code path, and the view code only ever sees the new keys.
- **The 2D | 3D pill text stays "2D" / "3D".** It names a dimension, not the view, and "Mind map | Cosmos" would widen the header. Its aria-labels are now "Mind map or Cosmos" and "Cosmos view". The ribbon command is "Toggle between mind map and Cosmos".
- **"Cosmos" was added to `ignoreWords` in `eslint.config.mts`** (next to `"3D"`). Without it, sentence-case flagged "Open Cosmos for current note" and both "Open a note in Cosmos first" notices. The rule stays on; the only warnings left are the two accepted ones (DecksView/StatsView).
- **The `graph3dOverlays` and `graph3dSettingsCollapsed` settings keys were not renamed.** The ticket names only the two control keys, and these two are invisible. If T108 wants them, it can add them to `RENAMED_SETTING_KEYS` too.
- **`docs/studying/study-modes.md` is unchanged.** No sentence in it names the 3D graph. It says "Three surfaces" and documents three; Cosmos study has no docs section anywhere. That gap is separate from the naming, so it is left as a follow-up rather than adding a pointer to a page that doesn't describe Cosmos study.
- **The docs page is renamed** to `docs/mind-mapping/cosmos.md` with `git mv`, its nav entry is now "Cosmos", and nothing else linked to it. No graph3d image files exist in `docs/assets`, so the T105 image rule had nothing to apply to. A changelog bullet was added under Unreleased.
- **Text that still says 3D, on purpose:** "Off: every branch spreads in 3D." (Overlays, a dimension); the "2D/3D toggle failed" console message; the new migration error "could not reopen a 3D graph tab as Cosmos" (it names the old tab); all code comments, test names, identifiers, CSS classes and file names (T108).

### Surface map
| File | Change |
|---|---|
| `src/cosmos-legacy.ts` (new) | Legacy view type, Cosmos icon and storage keys, the storage rename table, `migrateStorageKeys`, `cosmosViewStateFrom`, `cosmosTabTitle` |
| `src/cosmos-legacy.test.ts` (new) | Storage move (move, new wins, idempotent, keys match the view's), view-state build, tab title |
| `src/main.ts` | Command name and file-menu title; storage move after `registerView`; `reopenLegacyCosmosLeaves` on layout-ready; loadSettings comments |
| `src/study/mode-names.ts` / `.test.ts` | Two Cosmos keys added to `RENAMED_SETTING_KEYS`, with a test |
| `src/settings.ts` | Keys renamed to `cosmos*`; heading "Cosmos" |
| `src/views/Graph3DView.ts` | View type value; storage keys and icon from `cosmos-legacy`; display-text fallback, empty state, notices, console messages |
| `src/views/Graph3DScene.ts`, `Graph3DNear.ts`, `Graph3DEdit.ts` | Console messages |
| `src/views/Graph3DHelp.ts`, `src/graph3d/controls-help.ts` | "Cosmos controls"; one help row; docs path in a comment |
| `src/views/ViewHeader.ts` | Pill aria-labels |
| `src/views/PropertiesSidebarView.ts` | Sidebar heading "Cosmos" |
| `src/views/ToolRibbon.ts` | Toggle command name |
| `eslint.config.mts` | `"Cosmos"` in sentence-case `ignoreWords` |
| `docs/mind-mapping/cosmos.md` (was `graph-3d.md`), `mkdocs.yml`, `docs/mind-mapping/editing.md`, `docs/changelog.md` | Docs rename, nav, text, changelog |

### Fixture
No new fixture. Reuse `vault/tests/graph3d/` (for example `Crew Drills.md` or `Depth Zero.md`). The ticket moves no schedules.

### Not verified
- No Obsidian run. The upgrade path (old build with a 3D tab open → new build) is checked only against the core source. Specifically unchecked: the deferred background tab, a pinned tab, and a 3D tab in a popout window.
- Within one session, the plugin can be updated and reloaded without restarting Obsidian. In that case a back-history entry or a "reopen closed tab" entry from before the update still names `osmosis-graph3d` and would open as an unknown pane. After a restart those entries are gone.
- The old build reading the new keys after a downgrade: not handled, by design.
