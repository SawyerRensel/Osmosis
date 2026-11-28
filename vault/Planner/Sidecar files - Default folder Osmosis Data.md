---
title: Sidecar files - Default folder Osmosis/Data
summary: "T134. The default sidecar folder becomes Osmosis/Data (it holds styles as well as schedules); a vault still on the old default Osmosis/Schedule moves on load."
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
status: To-Do
batch: 18
priority:
progress:
date_created: 2026-11-28T03:39:06.000Z
date_modified: 2026-11-28T03:39:06.000Z
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
# Sidecar files - Default folder Osmosis/Data (T134)

## Why
Sidecar files hold a note's styles as well as its schedules, so the default folder name `Osmosis/Schedule` is misleading. The new default is `Osmosis/Data`.

## Settled at intake (don't re-ask)
- The default `sidecarFolder` becomes `Osmosis/Data` (`src/settings.ts:232`).
- **Auto-migrate on load:** a vault whose saved setting is *exactly* `Osmosis/Schedule` is moved to `Osmosis/Data` through the existing folder-change path, `changeSidecarFolder` (`src/main.ts:1113`). That path moves the files, rebuilds the index and swaps the Excluded-files entry. Any other folder the user chose is left alone.
  - A vault with no saved value already gets the new default from `DEFAULT_SETTINGS`. Check that a fresh vault does not try to migrate, and that a vault with `Osmosis/Schedule` saved but no folder on disk just updates the setting. `changeSidecarFolder` handles zero files: it shows no Notice.
  - Order on load: migrate after `noteData` / `dataMover` exist and the vault layout is ready (`onLayoutReady`), not inside `loadSettings`. Also check how it fits with `excludeSidecarFolderOnce`.
- Update the docs: `docs/reference/settings.md:56` and `docs/reference/data-storage.md:162`. Update the tests that hard-code `Osmosis/Schedule`: `src/convert-branch.test.ts`, `src/store/sidecar.test.ts`, `src/browse/mutate.test.ts`, `src/store/NoteData.test.ts`, `src/cosmos/horizon.test.ts`. Use `grep -rn "Osmosis/Schedule" src docs e2e`.
- `vault/` may hold an `Osmosis/Schedule` folder from dev use. Leave it alone: the migration moves it on the next load, which is part of the manual test.

## Context budget (~35k)
- `src/settings.ts` L220–240 and L540–560.
- `src/main.ts` L185–260 (onload), L1100–1150 (`changeSidecarFolder`, `excludeSidecarFolderOnce`), L2025–2060 (`loadSettings`).
- The `grep -n "Osmosis/Schedule"` hits in the tests and docs listed above: read ±10 lines around each.

## Acceptance criteria
- A fresh vault creates sidecars in `Osmosis/Data`.
- A vault saved with `Osmosis/Schedule` has its files moved to `Osmosis/Data` on the next load. The setting reads `Osmosis/Data`, and Excluded files lists `Osmosis/Data` instead of `Osmosis/Schedule`. Schedules and styles still read correctly afterwards.
- A custom folder (for example `Sidecars`) is untouched.
- The migration is a pure, unit-tested decision (`migratedSidecarFolder(saved): string | null` or similar).
- Docs and tests are updated. lint, test and build pass.

## Test plan
1. In `vault/`, Settings → Osmosis shows the sidecar folder. If it reads `Osmosis/Schedule`, reload Obsidian (Ctrl+R). A Notice reports the move, the folder reads `Osmosis/Data`, and `Osmosis/Data/` holds the files.
2. Settings → Files and links → Excluded files lists `Osmosis/Data` and not `Osmosis/Schedule`.
3. Open a note with sidecar styles (for example one in `vault/tests/graph3d/`) in the mind map: its styles still apply.
4. Set the folder to `Sidecars`, reload: nothing moves back.
