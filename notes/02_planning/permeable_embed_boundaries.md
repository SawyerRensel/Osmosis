# Feature Plan: Permeable Embed Boundaries (Part B)

**Branch**: `feature/permeable-embed-boundaries` (from `release/0.0.4`)
**Created**: 2026-07-27
**Status**: Design — open questions O1–O6 resolved 2026-07-27; awaiting go-ahead
to build. No implementation yet.
**Builds on**: Part A, commit `53506e2` ("Keep mind map structural edits intact
across the transclusion boundary"). Part A made edits *near* the seam correct;
Part B makes edits *through* the seam possible.

**Location note**: this doc lives in `notes/02_planning/` (not `reviews/`) to sit
beside `mindmap_reading_mode_plan.md` and `notes_as_flashcards_plan.md`, which
follow the same decisions-table → matrix → phasing shape.

---

## Goal

> "We want a smooth, seamless experience. Editing transcluded notes and their
> hosts in a mind map should feel seamless, as if there were no distinctions
> between files at all."

A student pulls a tidbit *out* of an embedded note to rearrange it in the host,
or drops host content *into* an embed to contribute it back — without leaving the
mind map and without thinking about files. Today every such gesture hits a bail:

```
Osmosis: can't move a node across an embed boundary
```

Part B replaces that bail with real routing. The bail survives only where a write
is genuinely impossible (destination file gone, write rejected).

---

## Settled decisions (from Sawyer — design to these, not around them)

| # | Decision | Consequence baked into this design |
|---|---|---|
| 1 | **Out of embed → host is a TRUE MOVE.** The source note *loses* the tidbit. | Because every embed site renders the same source file, removing the line from the source removes it from **every** place that file is embedded, and from the note itself. That is the intended semantics, stated plainly here so it is not a surprise later. |
| 2 | **Host → into embed is ALLOWED with NO CONFIRMATION.** | No modal, no confirm step — the other note is edited silently. A non-blocking *visual* cue is designed in (§7) but never interrupts the gesture. |
| 3 | **Block-ID / card identity FOLLOWS THE FILE.** | `^os-…` bytes are preserved through the move (Part A's invariant); the `(notePath, blockId)` schedule key is migrated to the new path so the card keeps its FSRS history instead of dying as an orphan and being reborn as new (§6). |
| 4 | **"Which instance" does not matter for the destination file.** | All embeds of a note resolve to one source file, so an insert "into the embed" writes to that file. *Where within* that file is defined by the insert-site rule in §4.2. |

---

## What Part A already gives us (do not rebuild)

- `src/mindmap-edit.ts` — the pure, unit-tested transform layer. `serializeLine`,
  `subtreeEnd`, `nodeHostStart`, `subtreeHostEnd`, `reindentSubtree`,
  `adjustPasteDepth`, `renumberOrderedLists`, `sameEditTarget`.
- `embedHostRange` on every top-level expanded child — the `![[…]]` line's span
  **in the containing file**. Note this generalizes: for a *nested* embed, the
  "containing file" is the outer source file, so `embedHostRange` is always in
  the coordinates of whatever file contains that embed line. Part B leans on this.
- Every write path (`writeMarkdown`, `writeTranscludedMarkdown`,
  `processFrontMatterTracked`, both `applySnapshot` branches) already rebuilds
  `currentTree` **and re-expands transclusions**. Part B adds one more write path
  and must keep that contract.

### Two facts discovered while reading the code that shape this design

1. **Style overrides do not need migrating.** Every style write goes to
   `this.currentFile` frontmatter (`osmosis-styles.styles`), keyed by the
   *preferred selector* — `^blockId` when the node has one
   ([styles.ts:480](src/styles.ts#L480)) — and `lookupNodeStyleByPath` resolves
   **every** node in the map, local or transcluded, against that one host
   frontmatter ([MindMapView.ts:6688](src/views/MindMapView.ts#L6688)). A node
   moving across the seam stays in the same map, so its `^os-…` override keeps
   matching with zero work. See §6.3 for the one pre-existing limitation.

2. **The reload guard is a single boolean.** `suppressNextReload` covers exactly
   one `vault.on("modify")` on `currentFile`
   ([MindMapView.ts:1182](src/views/MindMapView.ts#L1182)). A cross-boundary move
   can write the host twice (content + frontmatter), so it needs the
   session-scoped gate that `liveEditActive` already demonstrates
   ([MindMapView.ts:1173](src/views/MindMapView.ts#L1173)). §5 generalizes that
   mechanism rather than adding a second one.

---

## 1. Vocabulary

- **Containing file** of a node = the file whose coordinates its `range` indexes
  = `node.sourceFile ?? currentFile.path`. This is the single concept the whole
  design turns on.
- **Seam** = an adjacency in the rendered tree where two nodes have different
  containing files.
- **Local** = containing file is the host map file. **Embedded** = anything else.
- **Cross-boundary move** = origin containing file ≠ destination containing file.

---

## 2. Semantics matrix

Rows are operations; columns are the seam a gesture crosses. **M** = routed
through the new N-file move primitive (§4). **✅** = already works today,
unchanged. **🚫** = bail with a notice.

| Operation | host → embed | embed → host | source A → source B | same source, two embed sites | nested embed (outer → inner) |
|---|---|---|---|---|---|
| **Drag & drop** | **M** — inserts into source file at the mapped site | **M** — true move; line leaves the source everywhere | **M** | ✅ already works (one file, two views of it) | **M** |
| **Alt+↑/↓ reorder** | **M** (degrades swap → move-past, see §3.1) | **M** (same) | n/a — never siblings | ✅ | **M** |
| **Alt+→ indent** | **M** — appends into the previous sibling's source file | n/a | n/a | ✅ | **M** |
| **Alt+← outdent** | n/a | **M** — top-level embed child promotes into the host, after the embed's host node | n/a | ✅ | **M** |
| **Copy (Ctrl+C)** | read-only → **allow mixed selection** (read each file) | same | same | ✅ | same |
| **Cut + Paste** | ✅ already permeable (paste routes via `writeNodeFile`); identity migration added in **Phase 6** (§6.4) | same | same | ✅ | same |
| **Delete** | **allow mixed selection** — per-file splices, one undo group (§5) | same | same | ✅ | same |
| **Duplicate** | 🚫 keep bail on mixed selection | 🚫 | 🚫 | ✅ | 🚫 |
| **Insert parent** | 🚫 keep bail on mixed selection | 🚫 | 🚫 | ✅ | 🚫 |
| **Move the embed container** (a local node holding `![[…]]`) | ✅ Part A — moves as one atomic unit, carrying the `![[…]]` line | — | — | — | — |

### Cells that stay 🚫, and why

| Case | Behavior |
|---|---|
| Destination file no longer resolves to a `TFile` (deleted/renamed between render and drop) | Notice: *"Osmosis: the destination note is no longer available"*. Nothing written. |
| Destination write rejected (read-only, sync lock, disk error) | Notice: *"Osmosis: couldn't write \<note\> — move cancelled"*. Nothing removed from the origin (§4.3 ordering guarantees this). |
| **Unresolved** `![[Missing]]` | Never expands → has no expanded children → **there is no seam to cross**. The node stays a local `transclusion` node and moves as ordinary host content. No new bail needed. |
| **Cyclic** embed | Same: `expandTransclusion` returns `null` and keeps the node unexpanded. No seam, no bail. |
| Duplicate/insert-parent across a mixed selection | Keep `ensureSameFileEdit` — these are not moves, and a mixed selection has no coherent single-file result. |

**Recommendation to approve:** the two "allow mixed selection" cells (copy,
delete) are cheap and remove two more places the seam is visible. Delete is the
one with teeth — deleting a mixed host+embedded selection now edits the source
note too. That is consistent with decisions #1/#2 (silent cross-note edit) and is
one grouped undo away from reversal.

---

## 3. Operation-level details

### 3.1 Alt+↑/↓ at the seam: swap degrades to move-past

`moveNodeUpDown` today **swaps** the selected block with its neighbor
([MindMapView.ts:3521](src/views/MindMapView.ts#L3521)). A swap across the seam
would drag the *neighbor* across the boundary too — two moves in opposite
directions from one keypress, and a line silently leaving a note the user never
touched.

**Recommended default:** at a seam, Alt+↑/↓ **moves the selection past the
neighbor**; the neighbor stays where it is. Visually identical (the node advances
one position), semantically minimal. Within a single file, the existing swap is
untouched.

### 3.2 Indent / outdent at the seam

- **Alt+→ on a host node whose previous sibling is the last expanded child of an
  embed** → move into that source file, appended after the sibling's subtree, at
  the sibling's *source* depth + 1.
- **Alt+← on a top-level expanded child** (its tree parent is the local node that
  contained the `![[…]]`) → true move out into the host, inserted after that
  parent's subtree end (host coords, `subtreeHostEnd`).
- **Alt+→ on a host node whose previous sibling is a local node that *contains*
  an embed** → unchanged host-local edit; Part A's `subtreeEnd` already folds the
  embed to its host span.

---

## 4. The N-file edit primitive

### 4.1 Split: pure core vs. orchestration

New **pure** logic in `src/mindmap-edit.ts` (unit-tested, no Obsidian):

```ts
/** The file whose coordinates a node's `range` indexes. */
export function containingFile(node: OsmosisNode, hostPath: string): string;

/** Where an insertion at (parent, index) actually lands. */
export interface InsertSite {
    path: string;      // destination file
    offset: number;    // offset in THAT file's coordinates
    type: OsmosisNode["type"];
    depth: number;
}
export function resolveInsertSite(
    targetParent: OsmosisNode,
    index: number,
    hostPath: string,
): InsertSite;

/** Extraction span for a subtree, in its own containing file's coordinates. */
export function subtreeSpan(node: OsmosisNode): { start: number; end: number };

/** Splice a subtree out of one file's text, consuming surrounding blank lines. */
export function removeSpan(text: string, span: {start:number; end:number}): string;

/** Splice text in at an offset with exactly one newline of separation. */
export function insertAt(text: string, offset: number, block: string): string;
```

`removeSpan` / `insertAt` are the blank-line-hygiene halves of today's
`executeDrop` body, lifted verbatim so single-file drag keeps byte-identical
behavior and gains test coverage it lacks today.

**Orchestration** stays in `MindMapView.ts`:

```ts
private async moveAcrossFiles(opts: {
    originNodes: OsmosisNode[];   // contiguous siblings, one containing file
    site: InsertSite;             // from resolveInsertSite
}): Promise<boolean>;             // false = bailed, nothing written
```

### 4.2 The insert-site rule (decision #4, refined)

Given a drop at `(targetParent, index)`, let `before = children[index-1]` and
`after = children[index]`:

| Situation | Destination | Offset |
|---|---|---|
| `before` and `after` both embedded from the **same** source | that source | `after.range.start` |
| `after` embedded, `before` absent (index 0) and `targetParent` embedded from the same source | that source | `after.range.start` |
| **Boundary gap** — one side local, one side embedded | **host** | Part A's `nodeHostStart(after)` / `subtreeHostEnd(before)` |
| Reparent-onto an embedded node (`index === node.children.length`) | that node's source | `subtreeEnd(node)` — "append inside the embed" |
| `targetParent` embedded, no children | that source | `targetParent.range.end` |
| everything else | host | today's Part A logic, unchanged |

**Why the boundary gap resolves to the host.** The gap above the first embedded
child and the gap below the previous host sibling are the *same visual gap* — the
drop detector generates both candidates and whichever is nearer wins
([MindMapView.ts:4620-4655](src/views/MindMapView.ts#L4620-L4655)). Something has
to break the tie deterministically. Resolving the edge to the host keeps "place a
node immediately before/after an embed" reachable; every *interior* gap between
embedded lines routes into the source, which is the case the feature is for.

**Type/depth at the destination — a real trap.** `inferDropType` /
`inferDropDepth` derive from `targetParent`, whose depth is in *host* terms. An
embed nested under a host bullet at depth 2 renders its children at visual depth
3, but their real depth in the source file is 0. Feeding host depth into
`reindentSubtree` would indent the line wrongly inside the source note.

> **Rule: when the destination file differs from `targetParent`'s containing
> file, infer type and depth from the destination-side *neighbor* (prefer
> `after`, else `before`), using that neighbor's own `type`/`depth`.** Only when
> the destination has no neighbor at all does it fall back to the parent's child
> context. `resolveInsertSite` returns `type`/`depth` so this is decided in one
> tested pure function, not at three call sites.

### 4.3 Write ordering and failure handling

```
1. read origin text, read destination text          (both may fail → bail, nothing written)
2. extract   = origin.slice(subtreeSpan)             (bytes preserved verbatim — ^os-… intact)
3. reindent  = reindentSubtree(extract, node, site.type, site.depth)
4. destAfter = insertAt(destText, site.offset, reindent)
5. WRITE destination                                 ← fails → bail, origin untouched, clean abort
6. verify: re-read destination, confirm the write landed
7. origAfter = removeSpan(originText, span)
8. WRITE origin                                      ← fails → content is DUPLICATED, not lost
9. migrate identity (§6)
10. ONE re-sync: invalidate all touched paths → re-read host → rebuild currentTree
    → expandTree → render → reselect by content
```

**Why insert-first.** The dangerous failure is losing the user's content. With
insert-first, a step-5 failure leaves the vault exactly as it was; a step-8
failure leaves the line in *both* notes — visible, non-destructive, and already
undoable because the undo group (§5) contains the destination edit. The notice
for that case says so: *"Osmosis: moved into \<dest\> but couldn't update
\<origin\> — undo to revert."*

**Same-file short circuit.** If `site.path` equals the origin's containing file,
`moveAcrossFiles` returns `false` immediately and the caller uses today's
single-file splice (which must handle removal shifting the insert offset — logic
the two-file path is free of, since the files are disjoint).

**Normalization parity.** Each file's new content goes through
`normalizeHeadingSpacing` + `renumberOrderedLists` before writing, exactly as
`writeNodeFile` does today, so a cross-file move produces the same spacing and
numbering a same-file move would.

---

## 5. Multi-file undo: one gesture, one Ctrl+Z

### The change

```ts
// before
interface MapEditSnapshot { path: string; before: string; after: string }

// after
interface FileEdit { path: string; before: string; after: string }
interface MapEditSnapshot { edits: FileEdit[] }   // length 1 for every existing edit
```

`undoStack` / `redoStack` hold `MapEditSnapshot`. Then:

- **`recordEdit(path, before, after)` keeps its exact signature** and pushes a
  one-element group. Every existing call site — including every
  `processFrontMatterTracked` style write — is untouched.
- **`applySnapshot(edits: FileEdit[], direction)`** replaces
  `applySnapshot(path, content)`: writes each file, then does **one** rebuild +
  re-expand + render at the end instead of one per file. Undo applies the group
  **in reverse order**, redo in forward order — mirroring §4.3's ordering
  guarantee so a mid-undo failure also duplicates rather than deletes.
- **`snapshotBytes`** sums across `edits`; `enforceUndoLimits` is otherwise
  unchanged.

### The grouping mechanism

Generalize the existing live-edit coalescing rather than inventing a parallel
one. `beginLiveEdit`/`endLiveEdit` already prove the shape; Part B adds:

```ts
private editGroup: Map<string, FileEdit> | null = null;   // insertion-ordered
private beginEditGroup(): void;
private endEditGroup(): void;   // pushes ONE MapEditSnapshot, drops no-op files
```

While a group is open, `recordEdit` merges into it per path — **keep the first
`before`, overwrite `after`** — so the host being written twice (content splice,
then schedule frontmatter) collapses into one entry with correct endpoints. The
open group also gates the `vault.on("modify")` reload check the way
`liveEditActive` does, which is what makes multiple host writes safe.

Every cross-boundary operation is then:
`beginEditGroup()` → writes → identity migration → `endEditGroup()`.
Single-file edits never open a group and behave identically to today.

---

## 6. Identity migration (decision #3)

### 6.1 Schedules — the only thing that genuinely must move

`ScheduleStore` keys on `(notePath, blockId)` and persists into that note's
`osmosis-schedule` frontmatter. `generateLineCards` parses one file's own bytes
and **skips transcluded nodes** ([line-cards.ts:67](src/card-gen/line-cards.ts#L67)),
so a line's card always belongs to the file that physically holds it — exactly
the semantics decision #3 asks for. Without migration, the debounced re-sync
2 s later would orphan `origin#^os-x` and mint `dest#^os-x` as a brand-new card
with no FSRS history.

Collect every `blockId` in the moved subtree (walk the extracted nodes; include
`blockIdLineEnd`-style standalone IDs), then:

```ts
await this.plugin.scheduleStore.flushPath(originPath);   // force pending ratings out first
// read origin frontmatter osmosis-schedule via parseScheduleFrontmatter + parseDisabledFrontmatter
await this.processFrontMatterTracked(destFile,   fm => /* add entries verbatim   */);
await this.processFrontMatterTracked(originFile, fm => /* delete moved entries   */);
```

Both calls run **inside the open edit group**, so the frontmatter changes are
part of the same undo step as the content move — and `processFrontMatterTracked`
already handles the tree rebuild + re-expand.

Going through `processFrontMatterTracked` (not `scheduleStore.setSchedule`) is
deliberate: `ScheduleStore` writes via its own debounce and bypasses
`recordEdit`, so its writes would fall outside the undo group. The `flushPath`
first is what makes that safe — it forces any unflushed rating into frontmatter
before we read it.

Entries are copied **verbatim**, including `disabled: true` and any hand-added
keys, so an excluded card stays excluded.

### 6.2 In-memory card store

Mirror the existing rename handler with a block-scoped sibling in
`CardSyncService`:

```ts
handleBlockMove(oldPath: string, newPath: string, blockIds: Set<string>): void
```

For each block ID: `removeCard(lineCardId(oldPath, id))`, re-add with
`id: lineCardId(newPath, id), notePath: newPath`, all other fields intact. This
mirrors `handleRename` ([CardSyncService.ts:157](src/card-gen/CardSyncService.ts#L157))
and keeps the dashboard from flickering the card out of existence for the 2 s
until the debounced `syncFile` catches up. Call it after the writes land, then
`refreshDashboard()`.

### 6.3 Styles — no migration needed

Per the finding above: overrides live in the **host map's** frontmatter and
`lookupNodeStyleByPath` matches `^blockId` for local and transcluded nodes alike.
A node crossing the seam within an open map keeps its override with zero work.

Two things worth stating rather than fixing:

- A `_n:<id>` (stable-ID) override does **not** survive a cross-boundary move —
  ids are content-position hashes, and transcluded clones carry a `~<siteId>`
  suffix. This is pre-existing: `_n:` overrides already break on ordinary moves,
  which is exactly why `buildPreferredSelector` prefers `^blockId`.
- A host-file override never applied to the source note opened as its own map,
  before or after the move. Unchanged.

### 6.4 Cut/paste — closed in Phase 6

Paste already routes through `writeNodeFile`, so pasting onto an embedded node
writes into the source file — cut/paste across the seam has quietly worked all
along. But the clipboard round-trip carries the `^os-…` bytes into the new file
**without** migrating the schedule, so a cut+paste across the seam orphans the
card. Phase 6 closes that gap:

- `copySelectedNodes` records `clipboardSourcePath` (the containing file of the
  copied nodes) and `clipboardBlockIds` alongside the existing clipboard fields.
- `pasteNodes` resolves the destination's containing file; when it differs from
  `clipboardSourcePath` **and** the paste was a cut, it runs §6.1's migration and
  §6.2's `handleBlockMove` for `clipboardBlockIds`, inside one edit group with
  the paste write.

Two asymmetries with the drag path, worth naming rather than papering over:

- **The cut already happened.** Cut deletes immediately, so the origin's
  `osmosis-schedule` entries must be *captured at cut time* (into
  `clipboardSchedules`) rather than read from the origin at paste time — by then
  the line is gone and, if the user has since edited that note, the frontmatter
  may have been rewritten. Capture on cut, replay on paste.
- **A copy (not cut) is a genuine duplicate.** Two lines now carry the same
  `^os-…` in two files. Recommended: on paste into a *different* file after a
  **copy**, strip the block IDs from the pasted text — a duplicated line is a new
  line, and Osmosis regenerates an ID on demand. Cut keeps its IDs (identity
  moves); copy drops them (identity stays with the original). This also fixes a
  pre-existing paper cut where copy/paste within one file duplicates a block ID.
- If the clipboard came from an external app or a previous session
  (`clipboardSourcePath` unset), paste behaves exactly as today — no migration,
  no ID stripping.

---

## 7. UX

### Cross-note drop indicator

Decisions #1/#2 forbid a modal, so the cue must live entirely in the drag
gesture. The current indicator is a dashed accent line
(`.osmosis-drop-indicator`, [styles.css:249](styles.css#L249)).

**Recommended default:** when `resolveInsertSite` returns a path ≠ the dragged
node's containing file, add `.osmosis-drop-indicator--cross-note` — same line,
switched to `var(--text-accent)` with a solid stroke, plus a small text label at
the indicator's end reading the destination note's basename (e.g. *"→ Bike Lane
Standards"*). Nothing blocks, nothing waits; the label reads as an answer to
"where is this going?" and disappears on drop.

Rationale for a *label* rather than only a color change: the destructive-feeling
half of this feature is decision #1 (the line leaves the source note everywhere),
and the only honest way to make that non-surprising without a modal is to name
the file the bytes are landing in, in the half-second before the user commits.

Fallbacks if the label proves noisy in practice: colour-only, or label only when
the destination is *not* the file the drag started in and the drag has hovered
>300 ms. Cheap to tune after manual testing.

### Other UX behaviors

| Situation | Behavior |
|---|---|
| Reading mode | Unchanged — `assertEditable()` already gates every mutation method; the new primitive is called only from already-guarded ops. |
| Destination unresolvable / write refused | Notices from §2's bail table. Indicator does **not** pre-emptively hide — the file can vanish between render and drop, and pre-checking every hover is wasted I/O. |
| Moving the embed **container** (local node holding `![[…]]`) | Unchanged Part A behavior: atomic host-local move, ordinary indicator, no cross-note cue. Distinguishable in code by `node.type === "transclusion"` (container) vs. `node.isTranscluded` (contents). |
| Selection after the move | `reselectMultiAfterMove` matches by **content** across the whole `nodeMap` ([MindMapView.ts:3577](src/views/MindMapView.ts#L3577)), so it survives the node's id changing (gaining/losing the `~siteId` suffix). No change needed. |
| Wikilinks inside a moved subtree | Bytes preserved verbatim (Part A invariant). A moved `![[…]]` or `[[…]]` keeps resolving via Obsidian's shortest-path matching in the overwhelming majority of vaults. **Open question O2.** |

---

## 8. Test plan

### Vitest (pure — `src/mindmap-edit.test.ts`, `src/transclusion.test.ts`)

| Area | Cases |
|---|---|
| `containingFile` | local node → host path; transcluded → sourceFile; nested → inner source |
| `resolveInsertSite` | interior gap between two embedded siblings → source path + `after.range.start`; boundary gap (local ↔ embedded) → host path + `nodeHostStart`; reparent-onto-embedded → source + `subtreeEnd`; empty embedded parent → `range.end`; nested embed → inner source, not outer |
| `resolveInsertSite` type/depth | embed nested under a depth-2 host bullet returns the **neighbor's source depth (0)**, not host depth 3 — the §4.2 trap, as a regression test |
| `subtreeSpan` | multiline block carries its standalone `^id` line; subtree containing an embed folds to `embedHostRange` |
| `removeSpan` / `insertAt` | blank-line hygiene matches today's `executeDrop` byte-for-byte (lift the existing drag cases as the baseline) |
| Extraction + reindent across a boundary | bullet depth 2 in host → depth 0 in source and back; heading → bullet crossing; `^os-…` survives both directions; ordered-list renumbering on both sides |
| Undo group | `recordEdit` × 2 paths inside a group → one snapshot with 2 edits; same path twice → 1 edit keeping first `before` + last `after`; a no-op file is dropped; `snapshotBytes` sums; `enforceUndoLimits` counts a group as one step |
| Schedule migration | pure helper `partitionScheduleEntries(fm, blockIds)` → moved vs. retained; `disabled: true` and unknown keys copied verbatim; a block ID with no entry is a no-op |
| Clipboard identity (Phase 6) | `collectBlockIds(text)` finds inline and standalone `^id`s; `stripBlockIds(text)` removes both forms without disturbing code-fence contents, table pipes, or indentation |

### Manual (Obsidian — fixtures in `e2e/fixtures/`, copied to `vault/`)

Neutral-domain fixtures (a host map about city transit embedding a note about
bicycle infrastructure — no biology).

1. Drag an embedded line out to a host branch → appears in host, **gone from the
   source note**, gone from a second embed of the same note in another map.
2. Drag a host line into the middle of an embedded region → lands in the source
   note between the right two lines, at the right indent, no modal.
3. Repeat both with an embed **nested two levels deep**.
4. Alt+↓ a host node past the first embedded sibling; Alt+← a top-level embedded
   child out to the host. Confirm the neighbor did **not** move (§3.1).
5. Move a line carrying `^os-…` with a review history → after the move, its card
   appears under the destination note with **the same due date and reps**, and no
   duplicate/orphan in the dashboard.
6. Ctrl+Z after each of the above → **one** undo restores both files *and* the
   schedule frontmatter. Ctrl+Y redoes it.
7. Move a subtree that itself contains an `![[embed]]` → the `![[…]]` line goes
   with it and still renders expanded (Part A regression).
8. Make the source note read-only, attempt a drop → notice, host unchanged.
9. Drag into an unresolved and a cyclic embed → normal host-local behavior, no
   crash, no bail notice.
10. Reading mode → every gesture above is inert.
11. **Cut** an embedded line carrying `^os-…` with review history, paste onto a
    host node → schedule follows, same due date and reps, no orphan. Then
    **copy** (not cut) a host line into an embedded region → the pasted line has
    **no** block ID and the original keeps both its ID and its card.

No Playwright, per the working agreement.

---

## 9. Risks, open questions, phasing

### Risks

| Risk | Mitigation |
|---|---|
| **Silent edits to notes the user isn't looking at** — the core of decisions #1/#2 | Insert-first ordering, single-step grouped undo, and the destination label in the drop indicator (§7). |
| **A true move out of a source removes it from every embed site** (decision #1) | Intended. Called out in the doc and, at the moment of the gesture, in the indicator label. |
| Partial write (destination succeeded, origin failed) | Content duplicated, never lost; explicit notice pointing at undo. |
| Two-file writes racing the debounced `CardSyncService` (2 s) | Migration writes frontmatter before the debounce fires; `handleBlockMove` also updates the store synchronously. |
| Double host write triggering a spurious reload | Group-scoped reload gate (§5), the mechanism `liveEditActive` already validates. |

### Open questions — RESOLVED 2026-07-27

| # | Question | Decision |
|---|---|---|
| **O1** | Boundary-gap tie-break | **Edge gaps belong to the host** (§4.2). Interior gaps between embedded lines route into the source; only the first/last gap resolves to the host, keeping "place a node immediately before/after an embed" reachable by drag. |
| **O2** | Wikilinks in a moved subtree | **Preserve bytes, rewrite nothing.** Part A's invariant holds; Obsidian's shortest-path resolution keeps most links working. Link rewriting stays a separate feature. |
| **O3** | Alt+↑/↓ at the seam | **Move-past, not swap** (§3.1). One line changes files; the neighbor stays put. Same-file swap untouched. |
| **O4** | Mixed-selection delete | **Allow**, as one undo group. |
| **O5** | Drop-cue verbosity | **Always label cross-note drops** with the destination note's basename (§7). |
| **O6** | Cut/paste identity migration | **In scope — Phase 6** (§6.4), not deferred. Cut migrates the schedule and keeps block IDs; copy into a different file strips them. |

### Suggested build order

| Phase | Scope | Ships when |
|---|---|---|
| **1. Foundation** | Pure helpers in `mindmap-edit.ts` (`containingFile`, `resolveInsertSite`, `subtreeSpan`, `removeSpan`, `insertAt`) + full Vitest coverage. `executeDrop` refactored to call them for the *existing* single-file path — **zero behavior change**, proven by the existing suite. | Suite green, manual smoke of ordinary drag |
| **2. Undo group** | `MapEditSnapshot { edits[] }`, `beginEditGroup`/`endEditGroup`, `applySnapshot` group form, reload gate. Still no cross-file writes. | Existing undo/redo behavior unchanged |
| **3. The primitive + drag** | `moveAcrossFiles`, wire `executeDrop`, drop `sameEditTarget` bail there. Cross-note indicator. | Manual tests 1–3, 6–9 |
| **4. Keyboard ops** | Alt+↑/↓, Alt+→/←, mixed-selection copy/delete. | Manual tests 4, 10 |
| **5. Identity migration** | Schedule frontmatter move, `handleBlockMove`, dashboard refresh. | Manual test 5 |
| **6. Cut/paste identity** | `clipboardSourcePath` / `clipboardBlockIds` / `clipboardSchedules` on cut; migration + block-ID stripping on cross-file paste (§6.4). | Manual test 11 |

Phases 1 and 2 are behavior-preserving refactors that stand on their own — if the
feature is ever paused, they leave the codebase better, not half-migrated.
Phase 6 is likewise independent: it touches only the clipboard path and can slip
without affecting phases 1–5.

**Deferred:** wikilink rewriting (O2), and any cross-*vault* or non-markdown
embed handling.

---

## Sign-off

O1–O6 are answered and folded in above. What remains is approval of the design
as a whole — the semantics matrix (§2), the N-file primitive (§4), the undo model
(§5), and the six-phase build order. Implementation follows the project loop —
lint (0/0) → `npm test` → `npm run build` → manual test instructions → **wait for
confirmation** → commit — one phase at a time.
