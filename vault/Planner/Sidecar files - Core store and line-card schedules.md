---
title: Sidecar files - Core store and line-card schedules
summary: "T125. A note's Osmosis data can live in a hashed sidecar file in one settings folder instead of its frontmatter; this ticket builds the store and moves line-card schedules onto it."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Sidecar files - Fence schedules]]"
  - "[[Sidecar files - Mind map styles]]"
  - "[[Sidecar files - Move commands and docs]]"
status: In-Review
batch: 17
priority:
progress:
date_created: 2026-11-27T01:00:00.000Z
date_modified: 2026-11-27T02:20:00.000Z
date_start_scheduled: 2026-11-27T01:51:15.000Z
date_start_actual: 2026-11-27T01:51:15.000Z
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
  - "[[Sidecar files for flashcard data]]"
children:
blocked_by:
cover:
color:
pull_request:
---
# Sidecar files - Core store and line-card schedules (T125)

Part 1 of 4 of [[Sidecar files for flashcard data]]. The other parts are T126 (fence schedules), T127 (mind map styles) and T128 (move commands and docs).

## What Sawyer asked
> Toggling Source view is jarring because you lose your place with lots of frontmatter.

Sawyer wants Osmosis data to live in sidecar files, with operators that move it in and out of the note. A heavily studied note carries about 9 YAML lines per studied line card in `osmosis-schedule`, so 50 cards come to about 450 lines.

## Settled at intake (2026-11-27)
- **One folder**, set in settings, default `Osmosis/Schedule`. It is flat, with no mirrored subfolders.
- **File name is a hash**, `<hash>.osmosis.md` (for example `a3f9c2e1.osmosis.md`). It is not the note's name: Sawyer does not want mirrored names cluttering Ctrl+O. A sidecar is **never renamed** after it is created.
- **The link property finds the note.** The sidecar's frontmatter carries `osmosis-note: "[[path/to/Note]]"`, and Osmosis matches sidecars to notes by that property alone.
- **What moves** (over T125–T127): line-card schedules (`osmosis-schedule`, including `disabled`, `buriedUntil` and the `occlude` shapes nested in it), fence schedules, occlusion shapes, and mind map styles (`osmosis-styles`). Block IDs (`^os-…`) and fence `id:` lines stay in the note.
- **Switching:** a global setting chooses where *new* data goes. T128 adds commands that move one note, or the whole vault, in or out. Each note is read from wherever its data actually is.

## Design (T125 owns the shared pieces; T126–T127 build on them)

**Sidecar file shape.** It is Markdown with frontmatter only. The body is empty, or one fixed sentence with no wikilinks.
```yaml
---
osmosis-note: "[[Folder/Note]]"   # full vault path without .md
osmosis-schedule: { … }           # exactly today's note-frontmatter shape (T125)
osmosis-fences: { <fenceId>: { … } }  # T126
osmosis-styles: { … }             # T127, today's shape
---
```

**Modules**
- `src/store/sidecar.ts` (pure, unit-tested):
  - `sidecarName(notePath, taken)` is a short hash of the note path at creation (8 hex characters, FNV-1a or similar). It re-salts when the name is taken by a sidecar for another note.
  - `parseNoteLink(value)` and `noteLink(path)`.
  - `isSidecarPath(path, folder)` mirrors `isReviewLogPath` (`src/store/ReviewLog.ts:367-380`).
  - `SIDECAR_KEYS`.
- `src/store/NoteData.ts` (Obsidian-facing, a thin adapter) is the **one seam** every Osmosis data read and write goes through:
  - `frontmatter(file)`: the note's Osmosis keys. These are merged from the note's own frontmatter and its sidecar, sidecar winning key by key (per card entry for `osmosis-schedule`).
  - `process(file, fn)`: has the same signature as `fileManager.processFrontMatter`. It runs `fn` on the sidecar when the note is in sidecar mode, otherwise on the note.
  - `modeOf(file)`: `"sidecar"` when a sidecar is indexed for the note. Otherwise `"note"` when the note has any Osmosis key, else the setting.
  - `process` creates the sidecar lazily (folder too) on the first write in sidecar mode.
  - `sidecarOf(file)`: TFile or null.
- **Index:** a map from note path to sidecar path, built from `metadataCache` for files under the folder. It is maintained on `changed`, `rename` and `delete`. Build it at layout-ready, before `syncAll`.

**Following the note**
- *Note renamed or moved:* rewrite the sidecar's `osmosis-note` link and re-key the index. Do this even if Obsidian's auto-update-links already did, so it is idempotent.
- *Note deleted:* move the sidecar to the trash with `fileManager.trashFile`, which respects the user's trash setting.
- *Sidecar edited* (sync from another device, or a hand edit): re-sync its note's cards (`CardSyncService.syncFile(note)`).

**Exclusion.** The sidecar folder is never card-sync input, never a Cosmos note, and never counted in Stats or Browse. Pass an `isSidecarPath` predicate wherever `isLogPath` is passed today (`CardSyncService` ctor arg, `src/card-gen/CardSyncService.ts:25-40`). Grep `isReviewLogPath` and `isLogPath` for every site. Check Cosmos model building (`src/cosmos/model.ts`, `CosmosView.getMarkdownFiles` around L2324) separately.

**Settings** (`src/settings.ts`: interface L84, defaults L188, definitions L279+, next to `reviewLogFolder`):
- `dataLocation: "note" | "sidecar"`. The default is **`"sidecar"`**; it is a decision for Sawyer, see below.
- `sidecarFolder: string`, default `"Osmosis/Schedule"`, with a FolderSuggest.
- Changing either setting moves nothing; that is T128's job.

**Line-card schedules onto the seam**
- `main.ts` L255–290 (the four `getFileCache(file)?.frontmatter?.[SCHEDULE_FRONTMATTER_KEY]` reads) and L825 read through `noteData.frontmatter(file)`.
- `ScheduleStore` takes `NoteData` (or a `process`-shaped dep) in place of `fileManager` (L104, L294). It keeps `isWriting(path)` true for the note while its sidecar is being written, so the self-write suppression still works.
- `edit-moves.ts` `readMovedScheduleEntries` / `migrateBlockIdentity` (L197–263) reads and writes both source and target through the seam. Note that `frontmatterValue(content, key)` (L48) parses raw note content, which has no sidecar data. Replace it with the seam for sidecar-mode notes.
- `main.ts:306` builds a `processFrontMatter` move context. Route it through the seam.
- Other `processFrontMatter` sites in main.ts (L922, L1451, L1729, L1863): leave any that write note-level keys (`osmosis-cards`, `osmosis-deck`), because those stay in the note. Route only ones that write `osmosis-schedule`.

## Decisions for Sawyer (put these at the top of the test queue)
- Is the `dataLocation` default `"sidecar"`? Existing notes keep their in-note data either way, until T128's command moves it.
- Is a deleted note's sidecar trashed, rather than left orphaned?

## Context budget (~85k)
- `src/store/ScheduleStore.ts` (622 lines): L1–120, L200–330, L340–420.
- `src/main.ts` (1894 lines): L230–320, L700–770, L815–835, plus a grep for `processFrontMatter` with ±10 lines at each hit.
- `src/card-gen/CardSyncService.ts` (354 lines): L20–140, L200–250.
- `src/edit-moves.ts` (277 lines): L1–100, L190–277.
- `src/settings.ts`: L84–240, and the `reviewLogFolder` definition (grep).
- `src/store/ReviewLog.ts` L360–380, as the pattern.
- `docs/reference/data-storage.md` L1–80, for the vocabulary only. T128 writes the docs.
- Memories: `rapid-flashcard-mode-feature.md` (flush the editor before processFrontMatter), `vault-is-live-in-obsidian.md`, `vitest-cannot-import-obsidian.md`.

## Acceptance criteria
- With `dataLocation: sidecar`, rating a line card in a note with no Osmosis data creates `Osmosis/Schedule/<hash>.osmosis.md` holding `osmosis-note` and `osmosis-schedule`. The note's frontmatter is untouched.
- A note that already has in-note `osmosis-schedule` keeps writing in-note, whatever the setting.
- Due counts, study, bury, disable and line-card occlusion all work from sidecar data. Reloading Obsidian keeps them.
- Renaming or moving the note keeps its schedules, and the sidecar's link follows. Deleting the note trashes the sidecar.
- Moving a branch between two notes (edit-moves) carries schedules for both modes.
- Sidecars never appear as decks, cards, Cosmos notes or Stats rows.
- Unit tests cover `sidecarName` (stable, collision re-salt), `parseNoteLink`, `isSidecarPath`, and the merge rule (the sidecar wins per entry).
- `npm run lint`, `npm test` and `npm run build` pass.

## Test plan
1. Settings → Osmosis: the new *Data location* (Sidecar) and *Sidecar folder* (`Osmosis/Schedule`) settings are there.
2. Create a new note with a `^os-` line card (or use the fixture the worker adds under `vault/tests/sidecar/`). Study it once. A hashed sidecar appears in `Osmosis/Schedule`; the note's frontmatter has no `osmosis-schedule`.
3. Ctrl+O and type the note's name: the sidecar is not offered under that name.
4. Rename the note, and move it to another folder. Its due date survives (Browse or the deck counts), and the sidecar's `osmosis-note` points at the new path.
5. Bury and disable a card in that note: both stick after Ctrl+R.
6. An old note with in-note `osmosis-schedule` still writes in-note.
7. Delete the note: the sidecar goes to the trash.

## Batch implementation notes (awaiting manual test)

Code commit: `d3d8685` on `batch/17-sidecars-cosmos-styles`.

**Approach.** One seam, `NoteData` (`src/store/NoteData.ts`), sits between Osmosis and a note's data keys. Reads merge the note's frontmatter with its sidecar's (sidecar wins per card entry). Writes go to the sidecar when the note is in sidecar mode and to the note otherwise. `ScheduleStore` now takes NoteData as its writer and still calls it with the *note*, so `isWriting(notePath)` and the per-note write chain behave as before. An index (note path to sidecar path, both directions) is built from the metadata cache at layout-ready, before `syncAll`, and kept current by NoteData's own `changed`/`rename`/`delete` listeners. Those listeners are registered in `onload`, before main.ts's vault listeners. A sidecar change fires `onChange(notePath)`; main.ts subscribes it to the debounced card sync.

**Public API for T126–T128** (documented in the module header):
- `frontmatter(file): Record<string, unknown>` returns the merged copy.
- `process(file, fn): Promise<void>` writes. Always pass the note.
- `targetFor(file): Promise<TFile>` returns the file a write lands in, creating the sidecar if needed. Use it when the write must go through the edit pipeline for undo.
- `modeOf(file): "note" | "sidecar"`, `sidecarOf(file): TFile | null`, `isSidecar(path): boolean`.
- `onChange(listener: (notePath) => void): () => void`.
- `rebuildIndex()` and `attach(host)`, which main.ts calls.
- On the plugin: `isOsmosisDataPath(path)` (review log or sidecar) and `changeSidecarFolder(folder)`.

**Decisions**
- **The `dataLocation` default is `"sidecar"`, and a deleted note's sidecar is trashed.** These are the note's stated defaults, still open for Sawyer (see the test steps).
- **`modeOf` counts only data keys** (`osmosis-schedule`, `osmosis-fences`, `osmosis-styles`), not `osmosis-cards` or `osmosis-deck`. Every carded note has `osmosis-cards`, so counting it would put every note in note mode. A note with in-note `osmosis-styles` but no schedules is therefore **note mode**: its new schedules join its styles in the note. That keeps one location per note, ready for T127/T128.
- **Merge:** `osmosis-schedule` and `osmosis-fences` merge per entry. `osmosis-styles` is replaced whole. T127 can revisit this.
- **Hash:** FNV-1a over the note path, re-salted (`path#1`, …) while the name is held by another note's sidecar. Because the name is deterministic on the path, two devices that rate the same new note produce the same file, not two. A candidate file whose metadata isn't parsed yet counts as taken. That risks a duplicate sidecar on a cold cache, which I judged safer than writing into another note's sidecar.
- **The sidecar body** is one fixed sentence with no wikilinks.
- **Changing `sidecarFolder`** rebuilds the index and runs a full re-sync, but moves no files (T128). Its setting description says to move the folder by hand.
- **Edit-moves:** `readMovedScheduleEntries` merges the note's raw bytes with the sidecar's raw bytes. `migrateBlockIdentity` writes the destination through `ctx.processFrontMatter(await noteData.targetFor(dest))` and the origin through `sidecarOf(origin) ?? origin`. The edit pipeline therefore records the sidecar, and one Ctrl+Z reverts it.
- **Browse undo** (an extra beyond the ticket text): suspend and reset now snapshot the note's sidecar alongside the note, through the new optional `NoteFiles.scheduleFile`. Without this, undoing either one on a sidecar-mode note would have restored nothing.
- **Cosmos:** `noteAdjacency` takes an `exclude` predicate. Without it, a sidecar's `osmosis-note` link would make it its note's backlinker.

| File | Change |
|---|---|
| `src/store/sidecar.ts` (+test) | New, pure: `sidecarName`, `noteLink`, `parseNoteLink`, `isSidecarPath`, `mergeNoteData`, `hasSidecarKeys`, `sidecarContent`, `SIDECAR_KEYS` |
| `src/store/NoteData.ts` (+test) | New: the seam, the index, follow-the-note (rename relink, delete trashes), `onChange` |
| `src/store/ScheduleStore.ts` (+test) | Constructor takes a `process`-shaped writer instead of `fileManager` |
| `src/main.ts` | Builds NoteData, schedule reads through `noteData.frontmatter`, `rebuildIndex` before `syncAll`, sidecar change queues sync, `isOsmosisDataPath` replaces the log-only checks, `changeSidecarFolder` |
| `src/settings.ts` | `dataLocation` and `sidecarFolder` settings in a new "Data storage" group |
| `src/edit-moves.ts` (+test) | `MoveContext.plugin.noteData`; schedule read and migrate through the seam |
| `src/browse/mutate.ts` (+test) | Sidecar snapshot in suspend/reset undo records |
| `src/cosmos/horizon.ts` (+test), `src/views/CosmosView.ts` | Sidecars and log shards excluded from note adjacency |

**Fixture:** `vault/tests/sidecar/` (master copy in `e2e/fixtures/sidecar/`):
- `Galley knives.md` has no data and embeds `Pantry`.
- `Pantry.md` has no data.
- `Old harbour log.md` has in-note `osmosis-schedule`, back-dated to 2026-11-20.

**Not verified** (no Obsidian here):
- Whether Obsidian fires `rename`/`delete` for each child file when a whole folder of notes is moved or deleted. Sidecar relinking and trashing for folder moves depend on it.
- How the link updater and our relink interact on rename. The intended final state is our full-path link or Obsidian's shortest form; either resolves.
- First launch on a device whose metadata cache is cold. The index fills in as `changed` events arrive.
