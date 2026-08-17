---
title: Mind Map Permeable Embed Boundaries
summary: Enable moving/copying/pasting nodes between transcluded notes
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
status: Done
priority:
progress_current:
progress_total:
date_created: 2026-07-31T22:38:30.824Z
date_modified: 2026-08-03T19:19:35.061Z
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
---

You are working on **Osmosis**, an Obsidian plugin (mind map + spaced repetition
over Markdown), on branch `fix/obsidian-review-remediation`. Your job is to
**produce a design document** for **Part B: permeable embed boundaries** — moving
nodes *across* the `![[embed]]` transclusion seam inside the mind map — and get
the user's sign-off **before** implementing. This is design-first. Do **not**
start a large build until the user approves the design.

## The north star (quote from the user — treat as the governing principle)

> "We want a smooth, seamless experience. Editing transcluded notes and their
> hosts in a mind map should feel seamless, as if there were no distinctions
> between files at all."

A student pulls a tidbit *out* of an embedded note to rearrange it in the host,
or drops host content *into* an embed to contribute it back — **without leaving
the mind map and without thinking about files**. The user frames this as a
novel, differentiating feature. The current behavior is a safe *bail* (a notice:
"Osmosis: can't move a node across an embed boundary"); Part B replaces that bail
with real, seamless routing.

## Decisions already made by the user (SETTLED — do not re-litigate; design to these)

1. **Out of embed → host = TRUE MOVE.** The source note *loses* the tidbit; it is
   removed from the embedded file and inserted into the host. (Consequence to
   state plainly in the doc, not to prevent: because every embed site shows the
   same source file, a true move out of the source removes that line from the
   source *everywhere* it is embedded. That is the correct, intended semantics.)
2. **Host → into embed = ALLOWED, NO CONFIRMATION.** Dragging local content into
   an embed edits the *other* note silently. No modal, no confirm — seamless.
   (You may still design an unobtrusive *visual* cue that a drop lands in another
   note, but it must not interrupt flow.)
3. **Block-id / card identity FOLLOWS THE FILE.** When a line carrying `^os-…`
   moves files, its line-card schedule (and any block-id-anchored style override)
   must migrate to the new file so the card's source of truth relocates with it.
4. **"Which instance" does not matter for the destination file.** All embeds of a
   note resolve to the *same* source file, so an insert "into the embed" writes to
   that one file. (You still must define *where within* the destination file the
   inserted node lands — see the position question below — and handle
   nested/cyclic/unresolved embeds gracefully.)

## Orientation — read first (Part A already shipped; build on it, don't redo it)

- `git log --oneline` — Part A landed as commit **53506e2** ("fix: Keep mind map
  structural edits intact across the transclusion boundary"). Read that diff.
- `src/mindmap-edit.ts` + `src/mindmap-edit.test.ts` — the **pure, unit-tested
  tree→markdown transform layer** every structural edit funnels through
  (`serializeLine`, `subtreeEnd`, `reindentSubtree`, `adjustPasteDepth`,
  `renumberOrderedLists`, `sameEditTarget`, and the Part A additions
  `nodeHostStart` / `subtreeHostEnd`). New pure logic belongs here, tested.
- `src/transclusion.ts` — `TransclusionResolver.expandTree` / `expandTransclusion`
  replaces an `![[embed]]` node with the source file's parsed children (cloned,
  ids suffixed `~<siteId>`, `isTranscluded=true`, `sourceFile=<path>`, ranges in
  **source** coordinates). Part A added **`embedHostRange`** on each top-level
  expanded child: the `![[…]]` line's span in the *containing* file.
- `src/views/MindMapView.ts` — all edit ops. Key entities:
  - `getNodeFile(src)` / `writeNodeFile(src, updated)` route reads/writes to the
    node's file (host for local, `sourceFile` for embedded).
  - `writeMarkdown`, `writeTranscludedMarkdown`, `processFrontMatterTracked`, and
    both branches of `applySnapshot` each rebuild `currentTree` **and re-expand
    transclusions** after a write (Part A made this consistent).
  - `ensureSameFileEdit(nodes)` / `edit.sameEditTarget(a,b)` — the current
    cross-file **bail**. It guards `executeDrop`, `moveNodeUpDown`, `indentNode`,
    `outdentNode`, `copySelectedNodes`, `deleteSelectedNodes`, `duplicateNode`,
    `insertParentNode`. **Part B replaces this bail with routing** for the
    supported cases; keep the bail only for genuinely unsupportable ones.
  - Undo: `MapEditSnapshot { path, before, after }`, `recordEdit(path, before,
    after)`, `undoStack` / `redoStack`. **One file path per edit** today.
- `src/store/ScheduleStore.ts` — schedules are keyed by **`(notePath, blockId)`**
  (`setSchedule` / `removeSchedule` / `getPendingEntry`). A cross-file move must
  migrate `(oldPath, blockId) → (newPath, blockId)`.
- `src/card-gen/*` (esp. `line-cards.ts`, `note-processor.ts`,
  `CardSyncService.ts`) and `src/store/CardStore.ts` / `FenceWriter.ts` — trace
  how line-card identity/state is persisted per note, and what a path change
  implies. Also find where **block-id-anchored style overrides** live (frontmatter
  keyed by block id) and whether they must migrate too.
- `src/types.ts` (`OsmosisNode`: `range`, `blockId`, `blockIdLineEnd`,
  `sourceFile`, `isTranscluded`, `embedHostRange`), `src/parser.ts`.

## Why it is hard — the design doc MUST resolve all of these

1. **An N-file (two-file) edit primitive.** A cross-boundary move = *remove
   subtree from origin file* + *insert its markdown at the destination in the
   destination file*. Every op today is a single-file splice. Design a primitive
   that performs both writes with safe ordering — **prefer: insert-at-destination
   → verify → remove-from-origin**, so a failed second write never loses content —
   and re-syncs **both** trees (rebuild + re-expand) afterward. Note the origin
   and destination can be host↔source or source↔source.
2. **Multi-file, single-step undo.** Extend the snapshot model so one
   cross-boundary move is undone/redone as **one** step spanning two files (a
   snapshot *group* or a `{path,before,after}[]`). Specify how `undoStack` /
   `recordEdit` / `applySnapshot` change, and keep single-file edits unchanged.
3. **Coordinate correctness both directions.** Extraction from the origin uses
   that file's coordinates; insertion into the destination uses the destination's.
   For a drop *into* an embed, the destination position maps to **source-file
   offsets** — the embed's expanded children already carry source `range`s, so the
   neighbor at the drop index gives the insert offset directly (the inverse of
   Part A, which folded to host coords). Reuse `reindentSubtree` to adapt the
   moved subtree from its old depth/type context to the new one.
4. **Position within the destination note (decision #4 refined).** Define the rule
   for *where* an inserted node lands in the destination file: mapped from the
   drop index among the embed's expanded children (→ neighbor's source offset),
   appended at end when dropped on the embed as a whole, etc. Handle **nested
   embeds** (destination is a deeper source), **duplicate embeds** (same file —
   fine), and **cyclic / unresolved / read-only sources** (bail with a clear
   notice — these remain the only refused cases).
5. **Block-id / card / style migration (decision #3).** Specify the migration:
   `ScheduleStore` entry `(oldPath, blockId) → (newPath, blockId)`; any
   block-id-anchored style override; and whether `card-gen` / `CardSyncService`
   need a hook so the relocated card is not treated as an orphan+new pair. Preserve
   the `^os-…` line bytes through the move (Part A's invariant) so identity is
   stable; only the *file* key changes.
6. **UX / safety within "seamless."** Decisions #1/#2 forbid confirmation modals.
   Design the drop indicator so a cross-note drop is *perceptible* but not
   interruptive; define behavior when the source is unresolved/read-only; and
   distinguish **moving the embed container** (a local node holding `![[…]]` —
   already correct after Part A) from **moving the embed's contents across the
   seam** (new in Part B).

## Deliverable — the design document

Write `notes/02_planning/permeable_embed_boundaries.md` (or `reviews/DESIGN_…`;
pick one and say which). It must contain, with a **recommended default for every
open sub-decision** so the user can approve or redline quickly:

- **Semantics matrix**: every direction (host→embed, embed→host, source→source,
  nested) × operation (drag drop, Alt-move reorder, indent/outdent, cut/paste,
  delete) — what happens, with decisions #1–#4 baked in, and which cells remain
  *bail* (unresolvable/read-only/cyclic).
- **The N-file edit primitive**: signature, write ordering, failure handling,
  both-tree re-sync. Where it lives (pure core in `mindmap-edit.ts` vs.
  orchestration in `MindMapView.ts`).
- **Multi-file undo model**: concrete change to `MapEditSnapshot` / `recordEdit` /
  `undo` / `redo` / `applySnapshot`.
- **Identity migration**: schedule + style + card-gen, with the exact store calls.
- **UX**: drop-indicator design for cross-note drops; edge-case behaviors.
- **Test plan**: which pure pieces get Vitest coverage (subtree extraction +
  reindent across a boundary, undo-group apply, schedule migration) and the manual
  steps for the interactive parts.
- **Risks / open questions / phasing**: a suggested build order (primitive +
  multi-file undo first, then wire drag/Alt-move, then identity migration), and
  anything you recommend deferring.

Then **stop and get the user's approval** before implementing. When you do build,
follow the loop below and extend Part A's patterns rather than reworking them.

## Conventions (override CLAUDE.md where they conflict)

- Beads (`bd`) is NOT installed — skip it. **Do not use TodoWrite.**
- **Do not run Playwright** (`npm run e2e`). Vitest unit tests ARE expected; the
  user does UI testing manually.
- Loop (when building): implement → `npm run lint` (0/0) → `npm test` (all pass) →
  `npm run build` (clean) → give step-by-step manual test instructions → **STOP
  and wait for the user's confirmation** → only then commit.
- Commit messages end with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Never commit `package-lock.json` churn. Surgical changes; match surrounding
  style. Stay inside `/home/user/Osmosis`. Neutral (non-biology) examples in
  fixtures/tests.

## Commands

```bash
npm run lint     # eslint . — expect 0 errors, 0 warnings
npm test         # vitest — full suite
npm run build    # tsc -noEmit && esbuild -> vault/.obsidian/plugins/Osmosis
```
