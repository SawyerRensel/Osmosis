---
title: Sidecar files - Mind map styles
summary: "T127. In sidecar mode, a note's osmosis-styles (map settings, classes, variants, per-node styles) lives in its sidecar; mind map, properties sidebar, Cosmos and branch moves read and write it there, with undo intact."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Sidecar files - Core store and line-card schedules]]"
  - "[[Sidecar files - Move commands and docs]]"
status: Done
batch: 17
priority:
progress:
date_created: 2026-11-27T01:00:00.000Z
date_modified: 2026-11-27T02:40:00.000Z
date_start_scheduled: 2026-11-27T02:16:50.000Z
date_start_actual: 2026-11-27T02:16:50.000Z
date_end_scheduled: 2026-11-28T02:12:42Z
date_end_actual: 2026-11-28T02:12:42Z
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/55
---
# Sidecar files - Mind map styles (T127)

Part 3 of 4 of [[Sidecar files for flashcard data]]. It needs **T125** ([[Sidecar files - Core store and line-card schedules]]), which provides `NoteData` (`frontmatter(file)`, `process(file, fn)`, `modeOf`), the index and the sidecar shape. Read T125's *Design* first.

## What Sawyer asked
At intake Sawyer chose to move `osmosis-styles` too. It is not flashcard data, but it bloats the frontmatter just as much. It follows the note's mode: a note is in sidecar mode for all its Osmosis data or for none.

## Today
- **One write choke point:** `EditPipeline.processFrontMatter` (`src/edit-pipeline.ts` L57–68). It reads before and after and records an undo entry keyed by `file.path`.
  - `MindMapView.processFrontMatterTracked` (L7930–7965) calls it, and every map style write goes through that: around 13 sites, L2534–3214.
  - The properties sidebar routes through it as well when a mind map is open (`PropertiesSidebarView.ts` L320–330). Otherwise it calls `fileManager.processFrontMatter` directly.
  - Cosmos uses `this.edits.processFrontMatter` (`CosmosView.ts` L1229, L1959, L2169).
- **Reads:**
  - `MindMapView` L3284–3335 (`getFileCache(currentFile).frontmatter`) and L884.
  - Several writes patch an in-memory cache directly because the metadataCache lags (L2821, L3106, L3154).
  - `CosmosView` L516 (invalidates `styleFrontmatter` on `changed`) and L2041.
  - `src/cosmos/node-style.ts` `noteStyleReader` takes the raw mapping.
- **Moves between notes:**
  - `convert-branch.ts` L160–210 uses `frontmatterValue(content, "osmosis-styles")`, which parses raw note content, plus `ctx.processFrontMatter` on both files.
  - `branch-to-note.ts` L334+ splits the styles.
- **Legacy migration:** `main.ts` L1852–1870 (data.json `mapSettings` → frontmatter).

## Design
- `EditPipeline.processFrontMatter` resolves its target through `NoteData`. In sidecar mode it reads, writes and **records the undo entry against the sidecar path**, so Ctrl+Z restores the sidecar. Check that `edit-history` and the undo restore path accept a file that is not open in any view. It should, since entries are keyed by path, but verify it.
- When `fn` touches both sidecar keys and note keys, split the result: sidecar keys go to the sidecar, the rest to the note. Grep each site to see which keys it touches. If T125 already built `NoteData.process` to split keys, just use it.
- **Every `osmosis-styles` read** goes through `noteData.frontmatter(file)`. Every view that re-renders on `metadataCache` `changed` for its note must also re-render when that note's **sidecar** changes. Have NoteData emit a `changed(notePath)` event, or map the sidecar path back to the note in the existing handlers.
- **Moves** (convert-branch, branch-to-note, edit-moves context): read styles through the seam, not from raw content. Write the source and the target each in its own mode. A new note created by branch-to-note follows `dataLocation`.
- The sidebar's direct `fileManager.processFrontMatter` path (no mind map open) goes through `NoteData.process`.
- The `mapSettings` migration writes through the seam.
- `osmosis-cards`, `osmosis-deck` and `osmosis-line-cards` **stay in the note**. They are settings the user edits, not data.

## Context budget (~95k)
Use `grep -a` on MindMapView; see the memory `mindmap-edit-grep-blind-spot.md`.
- `src/edit-pipeline.ts`: the whole file (it is short), plus `src/edit-history.ts` skimmed for how a restore writes files.
- `src/views/MindMapView.ts`: L870–900, L2470–2560, L2760–2830, L3080–3160, L3280–3340, L7920–7970, L8120–8140. **Do not read beyond these.** Edit the remaining `processFrontMatterTracked` sites by grep only; they go through the choke point and need no change.
- `src/views/PropertiesSidebarView.ts`: L300–380, then grep `osmosis-styles` with ±15 lines at each hit.
- `src/views/CosmosView.ts`: L505–550, L1220–1240, L1950–1965, L2030–2050, L2160–2175.
- `src/convert-branch.ts` L150–215, `src/branch-to-note.ts` L320–351, `src/main.ts` L1850–1875.
- `src/store/NoteData.ts` and `sidecar.ts` from T125.

## Acceptance criteria
- In a sidecar-mode note, every style edit lands in the sidecar's `osmosis-styles`, and the note's frontmatter stays unchanged. That covers fill, shape, border, branch line, boundary, class, variant, theme, layout, background and reset, from the mind map, the properties sidebar and Cosmos (width).
- Ctrl+Z and Ctrl+Shift+Z in the mind map undo and redo style edits made on a sidecar note.
- The mind map and Cosmos re-render when the sidecar changes, whether by a hand edit or by sync.
- Branch to note and Convert branch carry styles between notes in any mix of modes.
- Note mode behaves exactly as before.
- lint, test and build pass. Add unit tests for any pure split or merge helper you add.

## Test plan
1. Open a sidecar-mode note in the mind map (the worker adds `vault/tests/sidecar/styles.md`; Ctrl+R after it is written).
2. Style a few nodes (fill, shape, border, boundary) and change the theme and layout. The note's frontmatter has no `osmosis-styles`; the sidecar has it.
3. Ctrl+Z twice: the last two style edits revert.
4. Open Cosmos on the note: the styles show, and resizing a plate's width writes to the sidecar.
5. Edit the sidecar's `fill` by hand: the open mind map updates.
6. Run Branch to note on a styled branch: the new note's styles follow `dataLocation`, and the source keeps the rest.
7. A note-mode note still styles in-note.

## What was implemented

**Where it shipped:** [PR #55](https://github.com/SawyerRensel/Osmosis/pull/55) (batch 17) into `release/0.0.6`, from `batch/17-sidecars-cosmos-styles`. Main commits 57ec364. Manual test: round 1.

Sawyer accepted no seeding: a note half in both modes has its in-note styles hidden whole by the first sidecar style write; the move commands resolve it.

The cause, fix, decisions, surface map and fixtures are in *Implementation notes* below.

## Implementation notes

Code commit: `57ec364` on `batch/17-sidecars-cosmos-styles`.

### Approach
- **Writes resolve their target, not the pipeline.** `EditPipeline.processFrontMatter` is unchanged: it writes, and records undo against, exactly the file it is handed. Style writers resolve that file first with `noteData.targetFor(note)`:
  - Mind map: a new public `MindMapView.processStylesTracked(file, fn)` = `processFrontMatterTracked(await noteData.targetFor(file), fn)`. All 13 style sites and the sidebar's `writeMapFrontMatter` call it. `processFrontMatterTracked` itself stays "write this exact file", because `edit-moves` and `convert-branch` hand it sidecars and notes explicitly through `MoveContext.processFrontMatter`.
  - Sidebar with no map open: `noteData.process(file, fn)`.
  - Cosmos: `resizeNode` and `writeStyles` write `targetFor(file)`. The offset growth they add to `edited` is 0 for a sidecar write, because the note's body did not move.
  - Legacy `mapSettings` migration: `noteData.process`. `rebuildIndex()` now runs **before** it at layout-ready. Before this change the migration's synchronous `modeOf` saw an empty index and could create a second sidecar.
- **Undo works as is.** An entry is filed under the owner (the note path) plus each file written, so Ctrl+Z on the note finds the sidecar entry, and `restore` writes the sidecar with `vault.modify` by path. `applySnapshot` now recognises a restored sidecar and re-reads the styles from note plus sidecar content.
- **Reads:**
  - `reloadFrontmatterFromContent(noteContent, sidecarFm?)` merges with `mergeNoteData`. The sidecar is read fresh from disk (`sidecarFrontmatter()`), on load and after undo.
  - `loadOsmosisStyleFrontmatter` uses `noteData.frontmatter`.
  - Cosmos `getNodeStyleContext` uses `noteData.frontmatter`. The model's `NoteInput.cache` gets `frontmatter` replaced by the merged copy, only for notes that have a sidecar.
- **Redraw on sidecar change:**
  - Mind map: subscribes to `noteData.onChange`. `reloadSidecarStyles()` re-reads styles from disk and re-renders only when they differ from what is shown, so our own writes and schedule flushes redraw nothing. It is skipped during a live drag, a grouped move or an open node editor.
  - Cosmos: `onChange` drops `styleFrontmatter[notePath]` and calls `scheduleReload()` for notes in the horizon, which is what `resolve` already does for an in-note edit.
- **Moves:** `convert-branch.moveStyles` reads the source's styles from the file that holds them: the sidecar when its `osmosis-styles` is set, else the note, matching NoteData's whole-key merge. It removes them from that same file and writes the new note's styles to `targetFor(newNote)`, which follows `dataLocation`. `branch-to-note.ts` holds only pure helpers and needed no change. `edit-moves` moves no styles.

### Decisions
- **`suppressNextReload` and sidecar writes.** Every style site sets the flag for the note's `modify`. A sidecar write never modifies the note, so `processStylesTracked` clears the flag when the target is a sidecar. The map's `modify` handler also consumes the flag on the open note's sidecar and returns. Without that, a stale flag would swallow the next real edit to the note (for example after a colour-picker drag, whose live gate used to return before clearing it).
- **No seeding from in-note styles.** If a note has a sidecar but keeps `osmosis-styles` in its own frontmatter (hand-added, or a half-finished move), the first style write creates the sidecar's styles from scratch. Those then shadow the note's whole mapping, and a Reset falls back to showing the note's. This only happens when a note is in two modes at once, which T128's move commands exist to resolve. Seeding would make Reset unreliable instead.
- **`frontmatterOf(content)`** is extracted in `edit-moves.ts`, and `frontmatterValue` is now a one-liner over it. The mind map uses it in place of its own inline YAML regex.
- `normalizePath` was added to the vitest obsidian stub, so `convertBranchToNote` can be tested.

### Surface map
| File | Change |
|---|---|
| `src/views/MindMapView.ts` | Adds `processStylesTracked`, used by the 13 style sites. `processFrontMatterTracked` skips the tree rebuild for sidecar paths. Sidecar-aware `reloadFrontmatterFromContent`, `sidecarFrontmatter`, `reloadSidecarStyles`, `loadOsmosisStyleFrontmatter` and `applySnapshot`. Adds the `noteData.onChange` subscription and the sidecar branch in the `modify` handler. |
| `src/views/PropertiesSidebarView.ts` | `writeMapFrontMatter` calls `processStylesTracked`, or `noteData.process` when no map is open. |
| `src/views/CosmosView.ts` | `onChange` invalidates and reloads. Width and style writes go to `targetFor`, with zero growth for a sidecar. Style context and model frontmatter are merged. |
| `src/convert-branch.ts` | `moveStyles` reads from and removes in the source's style home, and writes the new note via `targetFor`. |
| `src/edit-moves.ts` | Adds `frontmatterOf`; `frontmatterValue` is built on it. |
| `src/main.ts` | `rebuildIndex` runs before the `mapSettings` migration, which writes through `noteData.process`. |
| `src/convert-branch.test.ts` | New: 5 cases covering note↔note, sidecar↔sidecar, the mixed pairs, and a sidecar with no styles. |
| `src/test/obsidian-stub.ts` | Adds `normalizePath`. |
| `e2e/fixtures/sidecar/styles.md`, `styles in note.md` (+ `vault/tests/sidecar/` copies) | Fixtures. |

### Fixture
- `vault/tests/sidecar/styles.md`: no Osmosis data, so it becomes a sidecar-mode note on its first style write when *Data location* is Sidecar file, the default. It has no cards, so it has no dates to back-date.
- `vault/tests/sidecar/styles in note.md`: the note-mode control, with two pre-styled `^os-anch0N` lines held in-note.

### Not verified
- Nothing was run in Obsidian.
- The mind map, Cosmos and sidebar paths are covered by lint, typecheck and build only. Only `convertBranchToNote` is unit-tested.
- Whether Cosmos's extra `scheduleReload` on our own sidecar writes is visible as a second redraw. It mirrors the `resolve`-driven reload that note mode already gets.
