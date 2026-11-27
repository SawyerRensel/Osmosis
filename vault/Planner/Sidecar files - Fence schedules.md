---
title: Sidecar files - Fence schedules
summary: "T126. In sidecar mode, osmosis fence headers keep only id/deck/bidi/type-in; their schedules, r:/cN: blocks, bury, exclude and occlusion shapes live in the sidecar's osmosis-fences."
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
status: In-Review
batch: 17
priority:
progress:
date_created: 2026-11-27T01:00:00.000Z
date_modified: 2026-11-27T02:40:00.000Z
date_start_scheduled: 2026-11-27T02:05:29.000Z
date_start_actual: 2026-11-27T02:05:29.000Z
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
# Sidecar files - Fence schedules (T126)

Part 2 of 4 of [[Sidecar files for flashcard data]]. It needs **T125** ([[Sidecar files - Core store and line-card schedules]]), which provides `NoteData`, the sidecar index, `modeOf(file)` and the sidecar file shape. Read T125's *Design* section before you start.

## What Sawyer asked
Fence schedules (and fence occlusion shapes) move into the sidecar with everything else. They clutter Source view inside the note body, not just in the frontmatter. A 3-group cloze fence carries about 27 header lines.

## Today
- A fence header (above the blank line) holds `id`, `deck`, `bidi`, `type-in` and `exclude`, plus the card's schedule fields flat. Derived cards nest theirs under `r:` / `c1:` …. See `docs/reference/data-storage.md` L50–79.
- Writer: `src/store/FenceWriter.ts`, with `writeSchedule` L40, `writeBuried` L94, the staged map L152–290 (note study), `updateFenceOcclusion` L307, `updateFenceBuried` L376, `updateFenceSchedule` L438 and `updateFenceExclude` L686. It writes with `vault.modify` on the note body.
- Reader: `generateExplicitCards` (`src/card-gen/explicit.ts` L659) parses the schedule out of the header (`applyScheduleField` L81, `parseDerivedScheduleBlock` L129, `spreadSchedule` L1050). `CardSyncService.syncFile` (L84–140) overlays the staged schedules (L111).

## Design
- **Sidecar key** `osmosis-fences`, keyed by fence base `id`. The value is the same structure the header holds today, in YAML: the card's own fields flat, `r:` / `cN:` blocks, `buriedUntil`, `exclude` and the occlusion data. Reuse `ScheduleFields`, `parseCardIdParts` (L508) and the field canonicaliser, so nothing gets a second spelling.
- **Writes in sidecar mode** (`noteData.modeOf(file) === "sidecar"`). Every FenceWriter write goes to `noteData.process(file, fm => …osmosis-fences…)` instead of `vault.modify` on the note: schedule, remove, buried, exclude and occlusion, plus the staged flush. The note body is not touched.
  - This also sidesteps the reset hazard: an open note no longer gets rewritten by a flush.
  - `isWriting(path)` stays true for the note while its sidecar write is in flight.
- **Writes in note mode:** unchanged.
- **Reads:** `CardSyncService.syncFile` overlays `noteData.frontmatter(file)["osmosis-fences"]` onto the parsed fence cards, keyed by base id plus derived suffix. The sidecar wins per card. Stale header fields are left in place and are shadowed (T128 strips them when it moves data).
- **`exclude`** moves too. It is review state, like `disabled` for line cards, which T125 moves. `deck`, `bidi` and `type-in` define the card, so they stay in the fence.
- **Fence id rename or delete:** an `osmosis-fences` entry whose id no longer exists in the note is left alone (it is harmless). No cleanup in this ticket. Note that in *What was implemented*.

## Context budget (~90k)
- `src/store/FenceWriter.ts` (1049 lines): L1–300, then L300–520 skimmed, then the helpers as needed (L520–800).
- `src/card-gen/explicit.ts` (1065 lines): L40–160, L585–700, L960–1065.
- `src/card-gen/CardSyncService.ts`: L84–200.
- `src/store/NoteData.ts` and `src/store/sidecar.ts` from T125 (whole files).
- Call sites, read only around the hit: `src/study/StudySessionManager.ts` L285–360, `src/browse/mutate.ts` L250–330, `src/main.ts` L870–880.
- Fixtures: `e2e/fixtures/fence-card-types.md`, `e2e/fixtures/cloze-schedule-migration.md`.

## Acceptance criteria
- In sidecar mode, rating, burying, suspending or occluding a fence card writes to `osmosis-fences.<id>` in the sidecar. The fence text in the note is byte-for-byte unchanged.
- Bidi reverse, cloze groups and occlusion groups each keep their own schedule.
- Note study (the staged writes) works in sidecar mode and flushes to the sidecar.
- Note mode behaves exactly as before. The existing FenceWriter tests still pass unchanged.
- New unit tests cover the pure merge (header plus sidecar → card schedules, the sidecar wins) and the `osmosis-fences` writer for flat, `r:`, `cN:`, buried and exclude.
- lint, test and build pass.

## Test plan
1. Use a sidecar-mode note with a basic fence, a bidi fence and a 2-group cloze fence (the worker adds `vault/tests/sidecar/fences.md`; Ctrl+R after it is written). Study each card once.
2. The note's fences show no schedule lines in Source view. The sidecar's `osmosis-fences` holds each id, with `r:` / `c1:` / `c2:`.
3. Ctrl+R: the due counts still reflect the ratings.
4. Suspend a fence card from Browse, and bury one in Flashcard study. Both stick after Ctrl+R.
5. Note study on the same note: rate cards, leave the note, and check that the sidecar was updated.
6. A note-mode note with fences still writes into the fence headers.

## Batch implementation notes (awaiting manual test)

Code commit `7b07bcd` on `batch/17-sidecars-cosmos-styles`.

### Approach
- New pure module `src/store/fence-sidecar.ts` owns the `osmosis-fences` shape: `parseFencesFrontmatter` / `parseFenceEntry` (read), `overlayFenceCards` (the merge), `applyFenceEdits` (the writer, for `schedule` / `buried` / `exclude` edits by card id) and `fenceEntryFromContent` (header → entry).
- `FenceWriter` takes an optional `FenceNoteData` (`modeOf`, `process`; main passes `plugin.noteData`). In sidecar mode `writeSchedule`, `removeSchedule`, `writeBuried`, `writeExclude` and the staged flush (`writePending`) call `noteData.process(note, fm => applyFenceEdits(...))`, chained per note on the same `inflight` chain the buries and flushes use. The note is only read (to seed), never written. `isWriting(note)` is true while the sidecar write is in flight. Note mode is the old code path, untouched.
- `CardSyncService` takes a new last constructor argument `getFenceOverlays(file)` (main: `plugin.fenceOverlays(file)`, which parses `noteData.frontmatter(file)["osmosis-fences"]`) and runs `overlayFenceCards` on the generated cards before building store cards. The staged-review overlay still wins on top of it, as before.
- Reading view (`NoteStudyProcessor`) reads `exclude` from the entry when the fence has one. A sidecar write does not re-render the note, so after toggling or undoing exclude it updates the card in place (icon, class, `parsed.exclude`, redraw of tracked fences). Live preview's toggle updates itself the same way.
- Browse suspend/reset now snapshot the sidecar for fence cards too, so their undo restores it.

### Decisions worth remembering
- **An entry owns its fence.** Once `osmosis-fences.<id>` exists, it is the whole truth about that fence's schedules, buries and `exclude`; the header's copies are ignored, even if the entry is `{}`. The first sidecar write for a fence seeds the entry from its header. Why: a note with only fence data in its headers has no mode key in its frontmatter, so under the default setting it is *already* sidecar mode. With a per-card shadow, a stale header `exclude: true` could never be unsuspended and a reset would bring the header schedule back. An emptied entry is kept on purpose, as the marker.
- **Sidecar fields use the `osmosis-schedule` spelling** (`serializeScheduleEntry`: local timestamps, 4-decimal numbers, camelCase). `buriedUntil` uses `formatLocalTimestamp`. The shape mirrors the header: own card flat, derived cards under `r:` / `cN:`, `exclude: true` on the fence.
- **The header is parsed only by the card generator.** `fenceEntryFromContent` runs `generateExplicitCards` rather than adding a second header parser.
- **`exclude` moves to the sidecar** along with the schedules (the ticket's default). **Open for Sawyer to confirm.**
- **Occlusion shapes are not moved (slice boundary).** `writeOcclusion` still writes `occlude-*:` blocks into the fence header in both modes, and neither seeding nor the overlay touches them. Occlusion **group schedules** (`cN`) do move. Moving the shapes means changing every reader that takes them from the fence text: the generator (shapes decide which cards exist, so it needs a hook inside `generateExplicitCards`, not a post-merge), `NoteStudyProcessor.parseFenceContent`, `MindMapView.parseOsmosisOcclusion`, and the occlusion editor's `existing` / `usedGroupsInFence` in `main.ts`. That is left as follow-up work.
- **Orphan entries:** an `osmosis-fences` entry whose fence id no longer exists in the note is left alone. It is harmless, and this ticket does no cleanup.
- **Stale header fields** in a sidecar-mode note are left in place and shadowed. T128 strips them when it moves data.

### Surface map
| File | Change |
|---|---|
| `src/store/fence-sidecar.ts` | New: `osmosis-fences` parse, overlay merge, edits writer, header extract |
| `src/store/fence-sidecar.test.ts` | New: 13 tests (flat / `r:` / `cN:` / buried / exclude writes, seeding, owner semantics, merge, FenceWriter routing + staged flush + note-mode control) |
| `src/store/FenceWriter.ts` | `FenceNoteData`; sidecar routing for schedule, remove, buried, exclude, staged flush |
| `src/card-gen/CardSyncService.ts` | `getFenceOverlays` constructor arg; overlay before card build |
| `src/main.ts` | FenceWriter built after NoteData, with it; `fenceOverlays(file)`; passed to CardSyncService |
| `src/browse/mutate.ts` | Suspend/reset snapshot the sidecar for fence cards too (undo) |
| `src/views/NoteStudyProcessor.ts` | Sidecar `exclude` read; in-place exclude display after sidecar writes |
| `src/views/NoteStudyProcessor.dom.test.ts` | Fake plugin's vault gains `getFileByPath` |

### Fixtures
- `vault/tests/sidecar/fences.md` (master: `e2e/fixtures/sidecar/fences.md`), a sidecar-mode note: basic `sdfen001`, bidi `sdfen002`, two-group cloze `sdfen003`, and `sdfen004`, an old fence with a back-dated header review.
- `vault/tests/sidecar/fences in note.md`, the note-mode control: an in-note `osmosis-schedule` line card plus bidi fence `sdfen101`.

### Not verified
- Nothing has been run in Obsidian, so these are untested: the in-place exclude redraw, how quickly the metadata cache picks up a sidecar write (a sync that lands before the reparse reads the old sidecar), and the Browse undo restoring the sidecar for fence cards.

