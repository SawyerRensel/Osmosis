---
title: Sidecar files - Move commands and docs
summary: "T128. Commands move a note's (or every note's) Osmosis data into or out of its sidecar; changing the sidecar folder moves the files; the storage docs describe sidecars."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Sidecar files - Core store and line-card schedules]]"
  - "[[Sidecar files - Fence schedules]]"
  - "[[Sidecar files - Mind map styles]]"
status: Done
batch: 17
priority:
progress:
date_created: 2026-11-27T01:00:00.000Z
date_modified: 2026-11-27T01:00:00.000Z
date_start_scheduled: 2026-11-27T08:17:42Z
date_start_actual: 2026-11-27T08:17:42Z
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
# Sidecar files - Move commands and docs (T128)

Part 4 of 4 of [[Sidecar files for flashcard data]]. It needs T125–T127: `NoteData`, the sidecar index, `osmosis-schedule` / `osmosis-fences` / `osmosis-styles` in sidecars, and the FenceWriter sidecar path. Read T125's *Design* first.

## What Sawyer asked
> with operators that can export/import them as well (move them in and out)

Settled at intake: a global default (T125's `dataLocation`) plus commands.

## Design
**Commands** (in `main.ts`, next to the others, L351–1633; check `docs/reference/commands.md` for naming):

| Command | What it does |
|---|---|
| *Move Osmosis data to sidecar* | Active note. |
| *Move Osmosis data into note* | Active note. |
| *Move all Osmosis data to sidecars* | Whole vault. A confirm modal first, then a Notice with counts. |
| *Move all Osmosis data into notes* | Whole vault. A confirm modal first, then a Notice with counts. |

The commands are `checkCallback`, hidden when there is nothing to move.

**One move**, for a note in either direction:
1. Flush the pending writers for that path: `scheduleStore.flushPath`, `fenceWriter.flushPath`, and the mind map's pending edits if it has the note open. See the memory `rapid-flashcard-mode-feature.md`: flush the editor before `processFrontMatter`.
2. **To sidecar:**
   - Copy `osmosis-schedule` and `osmosis-styles` from the note's frontmatter into the sidecar (create it if needed; merge, with the sidecar winning on conflict).
   - Extract every fence header's review state into `osmosis-fences` and strip it from the headers. Review state means the schedule fields, the `r:`/`cN:` blocks, `buriedUntil`, `exclude` and the occlusion data. Keep `id`, `deck`, `bidi` and `type-in`.
   - Then remove the moved keys from the note.
   - Do it as **one `vault.process` on the note** (frontmatter plus fences, editor-safe) after the sidecar write succeeds, so a failure part-way through never loses data.
3. **Into note:**
   - The reverse: frontmatter keys back into the note, and `osmosis-fences` back into each fence header in the canonical layout `FenceWriter` writes.
   - Entries for fence ids that no longer exist in the note are dropped. Report their count in the Notice.
   - Then trash the sidecar.
4. Pure helpers in `src/store/sidecar-move.ts`: `extractFenceState(content) → {content, fences}` and `injectFenceState(content, fences) → content`. Unit-test them round-trip: extract then inject gives the original for canonical fences.

**Mode after a move:** a note moved into the note has no sidecar, so `modeOf` reads `"note"` (it has keys). An *empty* note follows the setting. That is consistent with T125.

**Changing the sidecar folder** moves the existing sidecars there. This mirrors the review log folder, whose docs say "Changing it moves the existing files" (`docs/reference/settings.md` L43). Changing `dataLocation` moves nothing; the setting's description points at the commands.

**Docs**
- `docs/reference/data-storage.md`: a *Sidecar files* section covering the shape, the hash name, the `osmosis-note` link, which keys move, the modes and the commands. Update the "Osmosis has no database" framing at L7 and the table at L15–24.
- `docs/reference/settings.md`: the two new settings, plus the *Excluded files* tip that L47 gives for the review folder.
- `docs/reference/commands.md`: the four commands.
- `docs/flashcards/image-occlusion.md` L102: drop "no sidecar files".
- `docs/changelog.md`: an entry if the file has an unreleased section.

## Context budget (~80k)
- `src/store/NoteData.ts`, `sidecar.ts` (T125), plus the FenceWriter sidecar functions T126 added (grep `osmosis-fences`).
- `src/store/FenceWriter.ts`: the header layout helpers (`writeNestedSchedule` and friends, L520–660; `SCHEDULE_KEYS` and `METADATA_KEYS` L765–800).
- `src/card-gen/explicit.ts` `splitFenceHeader` L585–660.
- `src/main.ts`: one existing `checkCallback` command for the pattern (grep `checkCallback`), plus the review-log folder-move code (grep `reviewLogFolder`).
- The docs files listed above, the relevant sections only.

## Acceptance criteria
- *To sidecar* on a heavily studied note leaves the note with no `osmosis-schedule` and no `osmosis-styles`, and fences with only id/deck/bidi/type-in. All due dates, bury, suspend, occlusion and styles are unchanged afterwards: compare Browse or the deck counts before and after.
- *Into note* restores the note to the in-note layout, trashes the sidecar, and gives the same counts.
- Round trip on `e2e/fixtures/fence-card-types.md` and `e2e/fixtures/occlusion.md`: card schedules are identical. The unit test proves the pure round trip.
- The vault commands report counts and touch only notes that have Osmosis data.
- Moving the sidecar folder in settings moves the files, and the links keep resolving.
- The docs are updated. lint, test and build pass.

## Test plan
1. Copy `e2e/fixtures/fence-card-types.md` and `occlusion.md` into `vault/tests/sidecar/` (the worker does this; Ctrl+R after it). Note the deck counts.
2. Open each note and run *Move Osmosis data to sidecar*. Source view shows a short frontmatter and lean fences, and the counts are unchanged.
3. Study one card, then run *Move Osmosis data into note*. The data is back in the note, the sidecar is in the trash, and the counts are unchanged.
4. Run *Move all Osmosis data to sidecars*: confirm, check the Notice counts, spot-check a styled mind map note.
5. Change the sidecar folder to `Osmosis/Data`: the files move, and studying still works after Ctrl+R.

## What was implemented

**Where it shipped:** [PR #55](https://github.com/SawyerRensel/Osmosis/pull/55) (batch 17) into `release/0.0.6`, from `batch/17-sidecars-cosmos-styles`. Main commits bd6dba2, fix round 1 6e9b2b4. Manual test: round 1, fix round 1 in round 2.

Fix round 1 replaced "sidecar wins" with most-recent-wins in the move commands only; reads stay sidecar-first. Sawyer accepted: styles by mtime (any text edit makes the note newer), and a reset card (no review date) losing to an older review in the other copy. Not handled: merging a real sidecar with a `-1` clash file (not ticketed).

The cause, fix, decisions, surface map and fixtures are in *Implementation notes* below and the *Fix round 1* section.

## Implementation notes

Code commit `bd6dba2` on `batch/17-sidecars-cosmos-styles`.

### Approach
- **Pure planner** `src/store/sidecar-move.ts`: `extractFenceState(content) → {content, fences}` and `injectFenceState(content, fences)` as specced, plus whole-note plans `planToSidecar(note, sidecarFm, yaml) → {note, sidecar, moved}` and `planIntoNote(note, sidecarFm, yaml) → {note, dropped}`. The YAML codec is passed in (Obsidian's `parseYaml`/`stringifyYaml` at runtime, JSON in tests).
- **Header primitives** in `FenceWriter.ts`: `listFenceIds`, `stripFenceReviewState` (drops flat/legacy/nested schedules, buries, `exclude`, `occlude*` blocks; keeps `id`, `deck`, `bidi`, `type-in`, `hint`), and `writeFenceReviewState` (strip, then write an entry in one layout: `exclude` after `id`, own card flat, shape blocks, then `r:`, `c1:`, `c2:`…).
- **File side** `src/store/DataMover.ts`. *To sidecar*: flush, read the note, probe the plan, create the sidecar if needed, re-plan inside `processFrontMatter` on the sidecar's fresh frontmatter, wait for the metadata cache, then **one `vault.process` on the note**, which writes only if the note text is still the text that was planned (otherwise re-plan, up to 3 tries). *Into note*: flush, read the sidecar, one `vault.process` on the note (frontmatter and headers together), wait for the note's cache, then trash the sidecar only if its text did not change meanwhile (otherwise re-plan).
- **Folder move**: `changeSidecarFolder` flushes, lists `*.osmosis.md` files in the old folder, switches the setting, then `fileManager.renameFile`s each into the new folder (NoteData's rename listener re-indexes each one), rebuilds the index, saves, and shows a Notice with counts.

### Decisions worth remembering
- **The merge rule for half-in-both notes is "keep what Osmosis reads today"** (`mergeNoteData` semantics): the sidecar wins per `osmosis-schedule` card and per `osmosis-fences` fence; sidecar `osmosis-styles` replaces the note's whole; a fence with an entry takes nothing from its header (the stale header is stripped going out and overwritten coming in). When moving to the sidecar, fence entries are taken from the sidecar first, then a hand-written `osmosis-fences` in the note, then the header.
- **Self-check.** Both plans compare every fence card before and after (id, type, text, deck, type-in, suspension, masks, schedule to the second and 4 decimal places, bury) and the merged `osmosis-schedule` / `osmosis-styles`. The after-state is re-read from the **text the plan produced**, so a lossy YAML round trip is caught too. If anything differs, the plan throws `MoveCheckError` and nothing is written. Do not remove the check: it is what makes "never lose review state" checkable.
- **"Into note" pins note mode.** A note left with no `SIDECAR_KEYS` (fence-only data) gets `osmosis-schedule: {}`. Without it, `modeOf` falls back to the default `dataLocation: sidecar`, and the next review would quietly create a new sidecar. *To sidecar* removes the pin with the other keys.
- **Command names drop "Osmosis"**: *Move data to sidecar*, *Move data into note*, *Move all data to sidecars*, *Move all data into notes*. The obsidianmd lint rule forbids the plugin name in command names, since the palette already shows "Osmosis:". The docs use these names.
- **Visibility.** *To sidecar* is shown when the note's own frontmatter has a data key or the store has a fence card for it. A fence header's state cannot be read synchronously, so the command can appear and then report "nothing to move". *Into note* is shown when the note has a sidecar; *Move all into notes* when any sidecar is indexed; *Move all to sidecars* always.
- **The vault-wide move to sidecars** pre-filters from the metadata cache (data keys, or any code section) and then lets the plan decide. A note with no Osmosis data is never written, even if its properties do not parse: that case returns "nothing" before the YAML is parsed.
- **Orphans.** Orphan header blocks (an `r:` on a fence that is no longer bidi, a `cN:` for a group that no longer exists) are dropped when moving to the sidecar: they describe no card, and the check confirms no card changes. `osmosis-fences` entries for fences no longer in the note are dropped when moving into the note, and the Notice counts them. On *Move all into notes*, a sidecar whose note no longer exists is left alone and counted.
- **Precision.** Moving to the sidecar truncates header timestamps to whole seconds (`formatLocalTimestamp`), as T126's seeding already did. The check compares to the second.
- **Folder move.** A file whose name is already taken in the destination gets `-1`, `-2`… before `.osmosis.md`. The old folder is left in place, even when empty, as the review-log move does. Only `*.osmosis.md` files move.
- **Mind map flush.** The mind map writes its edits as they are made (`EditPipeline`), so a move flushes only the open Markdown editors (`view.save()`), `scheduleStore.flushPath` and `fenceWriter.flushPath`.
- `fenceEntryFromContent` takes an optional pre-generated card list, so a note with many fences is parsed once per move.

### Surface map
| File | Change |
|---|---|
| `src/store/sidecar-move.ts` | New. Pure planner: extract/inject fence state, frontmatter split/join, `planToSidecar`, `planIntoNote`, self-check |
| `src/store/sidecar-move.test.ts` | New. 23 tests: byte round trip of canonical fences (cloze + bury, bidi + deck, excluded type-in, new, occlusion with two labelled sets), stripping, card parity, note→sidecar→note byte round trip, half-moved merge, dropped entries, pinning, check firing, refusal of non-mapping properties |
| `src/store/DataMover.ts` | New. File side: `toSidecar`, `intoNote`, `allToSidecars`, `allIntoNotes`, `moveSidecars` |
| `src/store/FenceWriter.ts` | `listFenceIds`, `stripFenceReviewState`, `writeFenceReviewState` |
| `src/store/fence-sidecar.ts` | `fenceEntryFromContent(content, id, cards?)` |
| `src/store/NoteData.ts` | `ensureSidecar(file)`, `notesWithSidecars()`; comments |
| `src/main.ts` | `dataMover`, four commands, `runNoteMove` / `runVaultMove` Notices, `flushNoteData`, `changeSidecarFolder` now moves files, `plural` |
| `src/settings.ts` | Data location and Sidecar folder descriptions |
| `docs/reference/data-storage.md` | Intro, two-column *What Lives Where* table, new *Sidecar Files* section (shape, name, link, what moves, modes, merge rule, commands, Excluded files tip) |
| `docs/reference/settings.md` | *Data Storage* table + Excluded files tip |
| `docs/reference/commands.md` | *Data Storage* commands |
| `docs/flashcards/image-occlusion.md` | Dropped "no sidecar files"; points at sidecar mode |
| `docs/changelog.md` | Unreleased *Added*: Sidecar files (covers T125–T128) |

### Fixture
`vault/tests/sidecar/move.md` (master `e2e/fixtures/sidecar/move.md`), deck **Testing/Sidecar move**. Starts in note mode: one reviewed line card plus a new one, `osmosis-styles` filling both lines, a two-group cloze, a bidi fence with its own sub-deck and a reverse **buried until 2026-12-31**, an **excluded** type-in fence, an occlusion fence with two labelled sets (`c1` reviewed), and a new fence. Every due date is in August 2026. I did not copy the `fence-card-types.md` / `occlusion.md` fixtures as the test plan asked: their fence ids (`fct-*`, `bridge-parts`) already exist in `vault/tests/` and would collide in the card store. This fixture carries the same fence shapes under unique `sdmov-*` ids, and the unit tests round-trip both originals' headers. I also ran a throwaway check, not committed, with a real YAML parser over `move.md`, `fence-card-types.md`, `occlusion.md` and `sidecar/fences.md`: all four round-tripped through both plans with the check passing.

### Not verified (needs Obsidian)
- Nothing ran in Obsidian: the commands, Notices, confirm modals, the open-editor flush, the metadata-cache waits, trashing, and the folder move with link resolution after Ctrl+R.
- Whether Obsidian's `stringifyYaml` re-serializes a note's other properties differently from `processFrontMatter`. It should not, since both use the same serializer. The note's frontmatter is rewritten only when it loses or gains data keys.
- **Mind map undo across a move:** a style edit recorded against the sidecar (`processFrontMatterTracked`) and undone after *Move data into note* has trashed that sidecar is not handled.
- **Race:** a review written during a folder move, to a note whose sidecar has not moved yet, could create a second sidecar in the new folder (the old one then lands as `<hash>-1`). The window is the duration of the renames, after a flush.

## Fix round 1: most recent copy wins

Code commit `6e9b2b4`. Sawyer passed the first test and then changed the requirement: when a note has data in both places, a move keeps the most recent copy, not the sidecar's.

### Approach
- New pure `mergeMostRecent(note, headerFences, sidecar, times)` in `src/store/sidecar-move.ts`. Both plans build the result from it, and `planToSidecar` / `planIntoNote` now take `times: FileTimes` (`{note, sidecar}` mtimes). `DataMover` passes `TFile.stat.mtime`.
- Each entry is split into its **cards** (line card: the whole entry, or one per group block when occluded; fence: the flat own card, `r:`, `cN:`) and the **rest** (`exclude`, shape sets). Each card is taken from its winning copy. The rest comes from the copy holding the entry's latest review.
- `check` now compares the files the move writes with the merge result, so `MoveCheckError` still means that a card would not read as its winning copy, and nothing is written.

### Decisions worth remembering
- **Cards** are compared on `lastReview`, to the second. A reviewed copy beats one that was never reviewed. A **tie**, including two copies that were never reviewed, goes to the **sidecar**, because that is what Osmosis reads today, so a tie changes nothing on screen. A card that only one copy has is kept. A schedule that has no `lastReview` counts as never reviewed.
- **The flags `disabled` and `buriedUntil` travel with the card's winning copy**, because they belong to that card's entry. A suspend or bury leaves no timestamp, so a card's flags cannot be dated on their own.
- **Fence `exclude` and occlusion shapes (T133) follow the copy holding the fence's latest review of any card**, not "sidecar wins". Shapes define which `cN` cards exist and are what those schedules were studied against. Taking them from the copy that was studied last keeps masks and schedules together. Shapes cannot follow one card's winner because a fence's cards can have mixed winners. Occluded line cards' `occlude` sets follow the same rule. When one copy of a line card is occluded and the other is not, the copy with the later review is taken whole.
- **The note's copy of a fence** is its own `osmosis-fences` entry if the note has one, otherwise the header. This matches the read rule.
- **Styles**: the whole `osmosis-styles` set comes from the file with the later mtime. A tie goes to the sidecar. If only one file has styles, that file's set is used. During a retry the mover keeps the pre-move mtime of the file it already wrote (the sidecar for *to sidecar*, the note for *into note*), so the move's own write does not count as an edit.
- **Into note** rewrites only the headers of fences that have an entry in the sidecar or in the note's `osmosis-fences`. A header that only the note had stays byte for byte.

### Reads were investigated and left as sidecar-first
Changing `NoteData.frontmatter` / `overlayFenceCards` to most-recent-wins would be wrong while writes go to the sidecar (every note that has a sidecar is in sidecar mode):
- Suspending, burying or resetting a card writes the sidecar copy and leaves no review date. If the note's copy had a later review, the read would keep showing the note's copy, and the toggle would look as if it did nothing.
- Styles by mtime would flip back to the note's stale set every time the note's text was edited, which bumps the note's mtime.
- Cost: a per-card timestamp compare on every frontmatter read, plus header-versus-entry for each fence on every sync. That is cheap, but not free on a hot path.

The only time the sidecar's copy is not the newer one is when data arrives from outside Osmosis: Sync, hand edits, or a `-1` orphan matched back. Settling that at move time is the right place. A follow-up could offer a "merge" command for such notes.

### Surface map
| File | Change |
|---|---|
| `src/store/sidecar-move.ts` | `FileTimes`, `mergeMostRecent` (with the cut/merge helpers); both plans take `times` and check against the merge; `mergeEntries` removed |
| `src/store/DataMover.ts` | Passes mtimes, taken before its own write for retries |
| `src/store/sidecar-move.test.ts` | Two old sidecar-wins tests rewritten; new `mergeMostRecent` suite (newer in note, newer in sidecar, tie to the second, reviewed vs never, one-sided cards, occluded line groups, mixed fence winners with exclude and shapes, note's own entry, styles by mtime both ways) |
| `docs/reference/data-storage.md` | Merge rule table for moves; reads stay sidecar-first |

### Fixture
`vault/tests/sidecar/merge/Tide merge.md` (master `e2e/fixtures/sidecar/merge/Tide merge.md`), deck **Testing/Sidecar merge**, with the hand-written sidecar `vault/Osmosis/Schedule/Tide merge.osmosis.md` (gitignored; master `e2e/fixtures/sidecar/merge/schedule-folder/`). Note copies carry reps 11–19, sidecar copies reps 21–29. All dates are in August 2026, except one bury that runs until 2026-12-31. Run through the real planner with js-yaml, *Move data into note* gives: l1 11, l2 22 (no `disabled`), l3 23 (tie), l4 24, bidi own 25, r 15 (still buried), the bidi `exclude` gone, cloze c1 16, c2 28, and fill `#ee5253` (sidecar newer). *To sidecar* gives the same cards, and the styles are `#2e86de` when the note is newer.

### Not verified (needs Obsidian)
- No occlusion fence in the fixture. Shapes are covered only by unit tests.
- Real `TFile.stat.mtime` behaviour, including whether Obsidian Sync preserves mtimes.
- **Known gap:** a reset leaves no review date, so a reset copy loses to the other copy's older review. Stale fence headers in sidecar mode (T126 leaves them) therefore bring back the pre-reset schedule when the note is moved. This is inherent in the rule.
- Merging two sidecars (a `-1` clash file and the real one) is not handled. Only note-versus-sidecar is merged.
