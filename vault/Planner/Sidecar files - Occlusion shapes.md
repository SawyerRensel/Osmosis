---
title: Sidecar files - Occlusion shapes
summary: "T133. In sidecar mode, a fence's occlude-* shape blocks live in the sidecar's osmosis-fences entry instead of the fence header. Remainder of T126."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Sidecar files - Fence schedules]]"
  - "[[Sidecar files - Move commands and docs]]"
status: In-Review
batch: 17
priority:
progress:
date_created: 2026-11-26T12:00:00.000Z
date_modified: 2026-11-26T12:00:00.000Z
date_start_scheduled: 2026-11-27T02:27:34Z
date_start_actual: 2026-11-27T02:27:34Z
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

# Sidecar files - Occlusion shapes (T133)

## What do you need built?

T126 moved fence schedules, buries and `exclude` into the sidecar's
`osmosis-fences.<id>` entry, but stopped short of the occlusion **shapes**.
`writeOcclusion` still writes `occlude-*:` blocks into the fence header in both
modes; only the occlusion groups' schedules (`cN:`) moved.

In sidecar mode, the shapes must live in the fence's sidecar entry too, so the
fence header keeps only `id` / `deck` / `bidi` / `type-in` (plus the image).
Note mode is unchanged.

## What problem does this solve?

The epic's promise is that a note in sidecar mode carries no Osmosis review
data. Occlusion shapes are the last piece left in the note, and T128's *move to
sidecar / move to note* commands expect to move them.

## State of the tree (after T126, commit 7b07bcd)

- `src/store/fence-sidecar.ts` — pure: `FENCES_FRONTMATTER_KEY`,
  `parseFencesFrontmatter`, `parseFenceEntry`, `overlayFenceCards`,
  `applyFenceEdits(fm, noteContent, edits)` (edits: `schedule` / `buried` /
  `exclude` by card id), `fenceEntryFromContent(content, fenceId)`.
- **An entry owns its fence**: once `osmosis-fences.<id>` exists, the header's
  schedules/buries/exclude are ignored, and the first sidecar write copies the
  header into the entry. Shapes must follow the same rule — and the first copy
  must include the header's shapes.
- `FenceWriter` takes optional `FenceNoteData` (`modeOf`, `process`); in sidecar
  mode writes go to `noteData.process(note, …)`, chained per note.
- `CardSyncService` takes `getFenceOverlays` (last ctor arg) = `plugin.fenceOverlays(file)`.
- NoteData API (T125): `plugin.noteData.frontmatter(file)`, `process(file, fn)`,
  `targetFor(file)`, `modeOf(file)`, `onChange(listener)`. Always pass the NOTE.

## Design

Readers that take shapes from the fence text today, all of which must prefer the
sidecar entry's shapes when the entry has them:

1. **Card generation** — a hook inside `generateExplicitCards` (shapes decide
   which `cN` cards exist). Keep generation pure: pass the shapes in (e.g. via
   the overlay), don't read the vault from inside it.
2. `NoteStudyProcessor.parseFenceContent`.
3. `MindMapView.parseOsmosisOcclusion` (use `grep -a`, see memory
   mindmap-edit-grep-blind-spot; don't read the whole file).
4. The occlusion editor's `existing` / `usedGroupsInFence` in `main.ts`.

Writer: `writeOcclusion` in sidecar mode writes the shapes into the entry (add a
`shapes` / `occlusion` edit kind to `applyFenceEdits`) and leaves the note text
untouched.

Sidecar shape format: mirror the header's `occlude-*` structure as YAML under the
entry so the move commands (T128) can round-trip it losslessly. Decide and
document the exact keys.

## Context budget (~70k)

- `src/store/fence-sidecar.ts` whole (~4k) and its test (skim, ~3k)
- `src/store/FenceWriter.ts` whole (~4k)
- grep for `writeOcclusion`, `occlude-`, `usedGroupsInFence`, `parseOsmosisOcclusion`,
  `parseFenceContent`, `generateExplicitCards`; read ±60 lines around each hit
  (~25k total). `MindMapView.ts` is ~84k: read only the hit range.
- `src/card-gen/CardSyncService.ts` around `getFenceOverlays` (~3k)
- `docs/flashcards/image-occlusion.md` only if behaviour text changes (T128 owns the docs).

## Acceptance criteria

- In sidecar mode, drawing / editing / deleting occlusion shapes writes them to
  the sidecar entry; the note's fence text is unchanged.
- A fence whose sidecar entry has shapes generates the same `cN` cards, shows
  the same masks in Flashcard study, note study and the mind map, and the
  occlusion editor opens with them, as the header version did.
- First sidecar write on a fence with header shapes copies them into the entry
  (no shapes lost); afterwards the header shapes are ignored.
- Note mode unchanged; existing occlusion tests pass unchanged.
- `fence-sidecar.ts` exposes the extract/inject for shapes that T128 needs.

## Test plan

- Unit: `applyFenceEdits` shape edit; first-write seed includes shapes;
  `fenceEntryFromContent` includes shapes; generation with overlay shapes yields
  same card ids as header shapes.
- Manual: fixture `vault/tests/sidecar/occlusion.md` (copy from
  `e2e/fixtures/occlusion.md` into `e2e/fixtures/sidecar/` first, back-dated per
  memory manual-test-fixture-dates). Draw a new shape → sidecar entry changes,
  note text doesn't; study the card; Ctrl+R, masks still right; mind map shows
  masks.

## Batch implementation notes (awaiting manual test)

Commit `21a7ac2` on `batch/17-sidecars-cosmos-styles`.

**Approach.** The sidecar entry gets the header's own keys for shapes:
`osmosis-fences.<id>.occlude` (unlabelled embed) and `…occlude-<label>` (embed
marked `{label}`). Each holds the same object an occluded line card keeps under
its `occlude:` (`occlusionSetToYamlValue` / `parseOcclusionSet`): `mode`,
`shapes` (block mappings: `group`, `kind`, coordinates, optional `rotation`),
optional `annotations`. `parseFenceEntry` now returns `occlusions` (label →
set) on `FenceOverlay`. The "entry owns its fence" rule covers shapes: a fence
with an entry, even `{}`, uses the entry's shapes only, and the first sidecar
write of any kind seeds the entry from the header, shapes included.

Readers:
1. **Card generation**: `generateExplicitCards(markdown, fenceOcclusions?)` takes
   fence id → label → set overrides, and `processNote` passes them through as
   its 5th argument. `CardSyncService` now reads the overlays *before*
   `processNote` and passes `fenceOcclusionOverrides(overlays)`. Generation
   stays pure.
2. **Note study / live preview**: `parseFenceContent(source, sidecarSets?)`;
   `fenceDiagrams(lines, contentStart, sets?)` takes the sets from outside.
3. **Mind map**: `parseOsmosisOcclusion(content, node.sourceFile)` reads a
   per-note memo (`sidecarShapes`) of the overlays.
4. **Occlusion editor** (`main.ts`): `existing` and reserved groups come from
   the entry when it exists, otherwise from the header. There is a new
   `usedGroups(sets)` helper.

Writer: `FenceWriter.writeOcclusion` in sidecar mode sends a new `occlusion`
`FenceEdit` (`cardId` = fence id, `label`, `set`; no shapes deletes the key)
through the same per-note chain as the other sidecar writes. The note text is
not touched, apart from the `id:` / `{label}` that `ensureFenceIdentity` already
mints when they are missing.

**Redraw.** A sidecar shape write does not re-render the note, so two
listeners on `noteData.onChange` redraw the masks. Each compares the shape sets
it drew with the current ones, and only redraws when they differ, so reviews,
which also write the sidecar, never rebuild a fence. That keeps the no-scroll-jump
property.
- `NoteStudyProcessor` tracks sidecar-mode fence elements (`sidecarFences`,
  pruned by the same superseded-only rule as `trackedFences`), then empties
  each changed one and re-renders it in place, in reading view or live preview.
- `MindMapView.reloadSidecarShapes` calls `render(true)`. It skips the redraw
  mid-gesture, as `reloadSidecarStyles` does.

**Decisions**
- *Header keys reused inside the entry* (`occlude`, `occlude-a`), not a new
  `shapes:` map. The structure is the line-card carrier's, so T128 can move
  shapes losslessly and one parser serves both.
- *Strict ownership.* An entry without shapes hides the header's shapes. The
  alternative, falling back to the header when the entry has no `occlude*`
  key, would make "delete every mask" in sidecar mode bring the stale header
  shapes back. Consequence: an entry created by T126's code *before* this
  commit (schedules only) hides that fence's header shapes. This only matters
  in a vault where T126 was already exercised on an occluded fence. Fix: delete
  that fence's entry, or re-save its shapes from the header with T128's move.
- *The header shapes are not stripped* on the first sidecar write. The ticket
  says the note text stays unchanged, so stripping is T128's *move to sidecar*.
- `parseFenceContent` takes the sets as an argument rather than looking up the
  file itself, so the existing DOM tests that call it on a bare plugin pass
  unchanged.

**For T128** (all pure):
- note → sidecar: `fenceEntryFromContent(content, id)` (now includes shapes),
  then `injectFenceOcclusions(content, id, new Map())` to strip the header
  blocks.
- sidecar → note: `parseFenceEntry(entry).occlusions`, then
  `injectFenceOcclusions(content, id, sets)`, which replaces the header's sets
  with exactly `sets`.
- `readFenceOcclusions(content, id)` (FenceWriter) reads header shapes;
  `occlusionKey(label)` gives the entry key.

| File | Change |
|---|---|
| `src/store/fence-sidecar.ts` | `occlusions` on `FenceOverlay`; `occlusion` edit; shapes in `fenceEntryFromContent`; `occlusionKey`, `fenceOcclusionOverrides`, `injectFenceOcclusions` |
| `src/store/FenceWriter.ts` | `writeOcclusion` routes to the sidecar; `readFenceOcclusions` |
| `src/card-gen/explicit.ts` | `FenceOcclusionOverrides` param on `generateExplicitCards` |
| `src/card-gen/note-processor.ts` | passes overrides through |
| `src/card-gen/CardSyncService.ts` | overlays read before generation, shapes passed in |
| `src/card-gen/occlusion.ts` | `fenceDiagrams` optional `sets`; `usedGroups` |
| `src/views/NoteStudyProcessor.ts` | sidecar sets in `parseFenceContent`; `sidecarFences` + `redrawChangedShapes` |
| `src/views/MindMapView.ts` | sidecar sets in `parseOsmosisOcclusion`; `sidecarShapes` memo + `reloadSidecarShapes` |
| `src/main.ts` | occlusion editor reads entry shapes / groups |
| `src/store/fence-sidecar-occlusion.test.ts` | new: extract, seed, edit/delete, generation parity, strict ownership, `fenceDiagrams` sets, inject round-trip, writer in both modes |

**Fixture:** `vault/tests/sidecar/occlusion.md` (master
`e2e/fixtures/sidecar/occlusion.md`). Fence 1 has header shapes and no entry, to
test the seed. Fence 2 has an image and no shapes. All cards are new, so
nothing needs back-dating. It uses the flag SVGs from `vault/tests/graph3d/`.

**Not verified** (needs Obsidian): the in-place redraw in reading view and live
preview after a save; the mind map redraw; Flashcard study masks from sidecar
shapes. Not handled: a mind map node transcluded from *another* note reads
that note's sidecar shapes, but a change to that sidecar does not redraw the
map until its next render.
