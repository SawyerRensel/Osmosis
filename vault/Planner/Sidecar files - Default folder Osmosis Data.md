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
status: In-Review
batch: 18
priority:
progress:
date_created: 2026-11-28T03:39:06.000Z
date_modified: 2026-11-28T03:39:06.000Z
date_start_scheduled: 2026-11-28T03:30:00.000Z
date_start_actual: 2026-11-28T03:30:00.000Z
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

## Batch implementation notes (awaiting manual test)

**Approach.** `DEFAULT_SETTINGS.sidecarFolder` now reads `DEFAULT_SIDECAR_FOLDER` (`Osmosis/Data`, exported from `src/store/sidecar.ts`). The pure decision `migratedSidecarFolder(saved)` returns `Osmosis/Data` only for the exact string `Osmosis/Schedule`, else null. `main.ts` `migrateSidecarFolderDefault()` runs it in the `onLayoutReady` startup callback.

**Decisions**
- **Migration runs before the startup `syncAll`, `excludeSidecarFolderOnce` and `migrateMapSettingsToFrontmatter`.** Those are now chained after it. Otherwise the scan could stamp fence ids and create sidecars into the folder being vacated while the move is under way. `migrateSidecarFolderDefault` never rejects (try/catch + console.error), so the chain always reaches `syncAll` and `resolveCardStoreReady`.
- **Folder present on disk goes through `changeSidecarFolder`** (moves files, rebuilds index, swaps the Excluded entry, Notice). **No folder on disk** only updates the setting and saves, so a fresh-but-saved vault gets no stray Excluded entry and no Notice, and `excludeSidecarFolderOnce` still excludes the folder when it is first created.
- **Fresh vault:** no saved value gives `Osmosis/Data` from the defaults, and `migratedSidecarFolder` returns null, so it never migrates.
- **Cost accepted:** `changeSidecarFolder` ends in `saveSettings`, which fires its own `syncAll`. On a migrating load that is a second full scan, once.
- **An old build wrote the default into data.json for every vault**, so a deliberate `Osmosis/Schedule` choice looks identical and is moved too. That follows the intake rule (exact match).
- Prose in the sidecar fixtures (`e2e/fixtures/sidecar/**` and the `vault/tests/sidecar/**` copies) that mentioned `Osmosis/Schedule/` now says `Osmosis/Data/`. Only text changed. The `schedule-folder` directories inside the fixtures are unchanged.

| File | Change |
|---|---|
| `src/store/sidecar.ts` | `DEFAULT_SIDECAR_FOLDER`, `migratedSidecarFolder` |
| `src/settings.ts` | default uses the constant |
| `src/main.ts` | `migrateSidecarFolderDefault`; startup chain reordered |
| `src/store/sidecar.test.ts` | `migratedSidecarFolder` tests; folder strings renamed |
| `src/store/NoteData.test.ts`, `src/convert-branch.test.ts`, `src/browse/mutate.test.ts`, `src/cosmos/horizon.test.ts` | folder strings renamed |
| `docs/reference/settings.md`, `docs/reference/data-storage.md` | new default |
| `e2e/fixtures/sidecar/**`, `vault/tests/sidecar/**` | prose path renamed |

**Fixture.** None new; `vault/Osmosis/Schedule` (dev data, untracked) is the test subject. `vault/tests/graph3d/` for the styles check.

**Not verified.** Nothing in Obsidian: the migration itself (file move, Excluded swap, Notice) is untested end to end. Unit tests cover only the decision and the renamed paths. Lint: 0 errors (2 pre-existing warnings). Vitest 3792 pass. Build OK.
