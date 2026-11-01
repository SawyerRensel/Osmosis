---
title: 3D Graph Phase 7 - Editing
summary: "Full editing in 3D: extract the edit pipeline and a per-file shared undo history from MindMapView, then inline editing, drag-to-link, and the four structural edits."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
status: In-Review
priority:
progress:
date_created: "2026-10-29T01:03:06.000Z"
date_modified: "2026-11-01T02:38:30.000Z"
date_start_scheduled: "2026-10-31T22:05:13.000Z"
date_start_actual: "2026-10-31T22:05:13.000Z"
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
parent: "[[Develop Mind-Map Graph View]]"
children:
blocked_by:
  - "[[3D Graph Phase 4 - Near tier]]"
cover:
color:
pull_request:
---

# Feature Request

## What do you need built?

*Describe the new tool, script, or capability you're requesting.*

One phase of [[Develop Mind-Map Graph View]]. **Read that note's `# Spec` section first:** it holds the decisions, the world model, the conventions and the full test plan. This note only scopes this phase.

1. **Refactor (behaviour-neutral):**
   - Move edit application out of `MindMapView.ts` into a shared module: `applySnapshot`, the undo/redo history, and the `vault.modify` / `processFrontMatter` paths around lines 7660–7990.
   - The module owns **one undo/redo history per file**, shared by both views.
   - 2D edit mode must behave exactly as before. Use `grep -a`, because the file contains NUL bytes.
2. **Inline editing** in the near tier, using the same `raw` bytes and `nodeEditText` / `restoreEditedLine` / `reattachBlockId` helpers as 2D.
3. **Drag-to-link:**
   - Drag line A onto line B to insert a link to B at the end of A.
   - Stamp a block ID on B with `generateBlockId` if it has none.
   - Build the link text with `app.fileManager.generateMarkdownLink`.
4. **Structural edits:** add child or sibling, delete, move or reparent (within a note and across notes), and retype. These reuse the `src/mindmap-edit.ts` helpers.

**Acceptance:**
- Every 2D edit operation still works after the refactor.
- Each 3D edit writes the correct bytes.
- Undo in either view undoes the other view's edits to that file.
- Unit tests cover the shared history.

**Every phase:**
- Add or extend the fixture web in `e2e/fixtures/graph3d/`, copy it to `vault/tests/graph3d/`, and reload Obsidian.
- Run lint, test and build, then stop for Sawyer's manual test before committing.
- Work on the `feature/3d-graph-view…` branch, cut from the current release branch.

## Slice plan

*Written 2026-10-31 by the batch sub-agent that built slice 1. Each slice is one session: build, `npm run lint`, `npx vitest run --maxWorkers=2`, `npm run build`, add a batch section to this note, set `In-Review`. Slices are in dependency order; each can be manually tested on its own. Read the "Decisions for every slice" list before starting any of them.*

### Decisions for every slice

- **Edit mode in 3D (decided, slice 2).** Node drag is off in 3D, and a press on a node orbits it (see the 3D memory and `Graph3DScene.onPointerDown`). Drag-to-link therefore needs either a modifier or a mode. **Chosen: an "Edit mode" header action (`pencil` icon) in `Graph3DView`, off by default, not persisted.** Reasons: phones have no modifier keys; Shift/Ctrl/Cmd+left-drag already belong to OrbitControls' pan, and Mod/Mod+Alt-click to the link actions; and a mode also scopes the structural keys (Enter, Tab, Delete, Backspace), which must never fire while someone is flying with WASD. Outside edit mode the 3D view behaves exactly as it does today. Checkbox ticks and undo/redo work outside edit mode (Obsidian's reading view ticks checkboxes too).
- **Editing is blocked during a relational study session.** `Graph3DStudy.active` → every edit entry point (edit-mode toggle, undo/redo, checkbox, inline edit, drop) shows `new Notice("Relational study: editing is off")` and does nothing, mirroring 2D's reading-mode notice. Starting a session turns edit mode off. Reasons: the session hides due nodes' text in place (`decorate`), so an inline editor on a hidden node would reveal the card; and the session's `targets` map is keyed by node ID, which content-derived IDs change on every edit.
- **The edit target is the focused node**: `Graph3DScene.focusId` (the node last flown to; see the clickable-links notes). Add a `Graph3DScene.focusedNode(): GraphNode | null` getter and a `setFocusId(id)` that sets it without flying (for re-selecting a node after its ID changed).
- **Every 3D write goes through an `EditPipeline`** (`src/edit-pipeline.ts`, slice 1) owned by `Graph3DView`. Owner key = the edited node's note path (`GraphNode.path`). Multi-file gestures use `pipeline.recorder.beginGroup()` / `endGroup()` in `try/finally`.
- **Splice against fresh bytes.** The 3D model is built from `vault.cachedRead`, and a schedule flush can move every offset. Before every write: `vault.read(file)`, parse it with the view's `ParseCache`, and re-find the node by `OsmosisNode.id` (content-derived, so a frontmatter-only change keeps it). If it is gone, drop the edit. This is the 3D equivalent of 2D's `assertEditableNode`.
- **3D lines are never transcluded.** Embedded content lives once, in its own note (spec), so a line node's `range` always indexes `GraphNode.path`. No `nodeHostStart`/`resolveInsertSite` seam logic is needed except for the cross-note move.
- **After a 3D write**: `cache.invalidate(path)`, `prefetched.delete(path)`, then `void this.reload()` at once (the existing `metadataCache` `resolve` reload still follows and refreshes edges). Re-focus the edited node by `range.start` in the same note (its ID changed), as 2D does with `pendingSelectionRangeStart`.
- **Pure logic goes in `src/graph3d/edit.ts`** (new; no `obsidian` import) or `src/mindmap-edit.ts` when 2D shares it; tests beside it. When a slice moves a computation out of `MindMapView`, write the test against the current 2D behaviour first, then make 2D call the extracted function. Use `grep -a` on `src/mindmap-edit.ts`.

### Slice 1: Extract the edit pipeline and a shared per-file history (built, see batch notes below)

### Slice 2: 3D edit plumbing, undo/redo, panel checkboxes, edit-mode toggle (built, see "Slice 2" in the batch notes below)

*Corrections made while building, for later slices:* (1) a checkbox line's `content` keeps its `[ ] ` / `[x] `, so **ticking changes the line's parse ID** (and its graph node ID, unless it has a `^id`); every edit therefore re-selects and re-places its line by `range.start`, which `Graph3DView.commitEdit` and `place()` now do for all later slices. (2) `pipeline.owner` is a field (`editOwner`), set per write, not derived. (3) A toggle writes the one-line splice without `renumberOrderedLists`/`normalizeBlockSpacing`, so it can't touch other bytes; slice 3 introduces `normalizeWrite` for content edits.

- `Graph3DView`:
  - Build `this.edits = new EditPipeline(app, plugin.editHistory, () => this.editOwner, (path) => { this.cache.invalidate(path); this.prefetched.delete(path); })`. No suppress flag: the 3D view *wants* to reload after its own writes.
  - **Holds**: keep `holds = new Map<string, () => void>()`. After each `reload()` settles `horizon.loaded`, hold newly loaded notes and release notes that left (`plugin.editHistory.hold(path)`). Release all in `onClose`. So a note's history lives while it is loaded in some 3D view or shown in some mind map.
  - **Undo/redo**: register `Mod+Z`, `Mod+Shift+Z`, `Mod+Y` on the view's `Scope` (return `false`; skip when the target is editable, see below). Key = the focused node's note (`focusedNode()?.path ?? focusPath`). Call `edits.step(key, isRedo)`, then the post-write refresh above for each restored path.
  - **Typing check**: the current `typing(e)` only knows `<input>`/`<textarea>`; make it `isEditableTarget(e.target)` that also accepts `isContentEditable` (CodeMirror), and use it for flight and study keys too.
  - **Edit-mode toggle**: `addAction("pencil", "Edit mode", …)`, `is-active` class like the study action; `this.editMode` flag; `toggleStudy()` turns it off; refuse while studying (see decisions).
- **Checkboxes** (deferred here by the near-tier and clickable-links tickets): panels are `pointer-events: none`, so hit-test like links. `Graph3DNear.checkboxAt(x, y): { node: GraphNode } | null` (front panel via `frontPanelAt`, then `input.task-list-item-checkbox` client rects). In `Graph3DScene.click()`, check it before `linkAt` and call a new option `onCheckboxClick(node)`. View: fresh-read, toggle, write.
- Extract the toggle from `MindMapView.toggleCheckboxNode` into `mindmap-edit.ts` as `toggleCheckboxLine(lineText: string, checked: boolean): string` (pin its current replace behaviour in `mindmap-edit.test.ts` first), and make 2D call it.
- **Tests**: `toggleCheckboxLine` cases; a pure `heldDiff(prev: ReadonlySet<string>, next: ReadonlySet<string>)` if the hold diff isn't trivial inline.
- **Manual test**: tick a checkbox in `Deck Checklist`-style content (needs a `- [ ]` line in a 3D fixture; add one to a new fixture note rather than editing an existing one); undo it in 3D with Ctrl+Z; open the same note in a mind map, edit there, undo from 3D and vice versa; blocked during study.

### Slice 3: Inline editing in the near tier (and retype) (built, see "Slice 3" in the batch notes below)

*Corrections made while building:* (1) the trigger is not a `dblclick` listener: `Graph3DScene.click()` remembers the last click's node and treats a second click within 400 ms and 8 px (32 px for a finger) as the double, so a double tap works on touch and the first click's camera flight cannot make the second land on another node. (2) `normalizeWrite` is extracted and tested but 2D does not call it (it already composes the same two steps in `writeNodeFile` + `writeMarkdown`; rewiring it was a 2D change for no gain). (3) The editor is on `document.body`, fixed, on desktop too, not in the view root, so it has one coordinate system and clears the corner controls. Slice 4 onwards: `renameInFile` and the editor are reusable; a new line from slice 5 opens the editor via `Graph3DView.beginEdit(node)`.

- Trigger, in edit mode only: F2 or Enter on the focused line node, or a double-click / double-tap on a line plate or panel (`dblclick` on the canvas → `nodeNear`).
- Editor: `EmbeddableMarkdownEditor` (`src/editor/EmbeddableMarkdownEditor.ts`), the same one 2D uses, in an overlay `div.osmosis-graph3d-edit` absolutely positioned in the view root at the node's projected screen position (unscaled, readable size; width ≈ the panel's on-screen width, clamped). The panel stays under it; hide the panel's body while editing. Ctrl/Cmd+Enter or blur saves, Escape cancels (2D: `startEditing` / `stopEditing`).
- While the editor is open: `cancelFlight()`, ignore flight keys (the typing check), and skip `reload()` passes that would remove the node (queue one for after save).
- Text in: `edit.nodeEditText(source)`. Save: extract 2D's `renameNode` body into a pure `renameInFile(content, src, ancestors, newLine): { text: string; retyped: boolean }` in `mindmap-edit.ts` (it wraps `restoreEditedLine` + `retypeInFile`; pin current behaviour with tests first, then make `MindMapView.renameNode` call it). In 3D, ancestors come from a pure walk of the fresh tree (`ancestorsOf(root, id)` in `src/graph3d/edit.ts`). Write through `edits.write` after `renumberOrderedLists` + `normalizeBlockSpacing`, exactly as `MindMapView.writeNodeFile` → `writeMarkdown` does (put that normalisation in one shared pure function `normalizeWrite(content)` so both views call it).
- **Retype** is covered here, as in 2D: changing a line's markers (`- ` → `## `) in the editor retypes the subtree via `retypeInFile`. A "Turn into…" menu is not needed for parity.
- Mobile: the 2D editor's VirtualKeyboard handling (`overlaysContent`, fixed positioning) applies; reuse it.
- **Manual test**: edit a bullet, a heading, a line with a `^id` (the ID must survive), a `- ` → `## ` retype; undo each in 3D and in 2D.

### Slice 4: Drag-to-link (built, see "Slice 4" in the batch notes below)

*Corrections made while building:* (1) only a **line** starts a link drag; a note core, tag or file still orbits, since a note has no line to append to. Notes are valid *targets*. (2) Stamping a block ID changes the target's **graph node ID** (`line:path#^id` replaces `line:path#hash`; the parse ID does not change), so `Graph3DView.edited` is now a list and `place()` carries the placement of both ends, selecting the first (the dragged line). (3) A heading falls back to a block ID when its text has link syntax or markdown punctuation, or an earlier heading shares it; a card fence, an embed and a paragraph line that runs on into the next cannot carry an ID and are refused with a Notice. (4) The drop is by a `LinkDrag` in the scene, not by `dblclick` or the click path, so slice 3's double-click and slice 2's checkbox tick are untouched: a press that never moves past the 6 px click slop is still a click.

- In edit mode, `Graph3DScene.onPointerDown` on a line or note node (`nodeNear`, mouse or one finger) starts a `linkDrag` instead of a rotation; on empty space it still orbits. While dragging: a temporary `THREE.Line` from A to the pointer's aim point (depthTest off, the outline colour), and the hovered drop target highlighted (`nodeNear` each move). Release on B ≠ A → `options.onLinkDrop(a, b)`. Escape or release on nothing cancels. `cancelFlight()` on start.
- View, `linkLines(a, b)`, with pure helpers in `src/graph3d/edit.ts` (tests for each):
  - `linkSubpath(b)`: a heading → `#Heading text`; a note node → none; any other line → `#^id`, stamping one with `generateBlockId(collectBlockIds(content))` if B has none. *Proposed:* headings link by heading, not by a stamped ID, because that is the idiomatic Obsidian link and the graph already resolves it; change it if Sawyer wants IDs everywhere.
  - `stampBlockId(content, node, id): string`: ` ^id` at the end of a single-line node (before nothing); on its own line after a multiline node (code block, table, blockquote), as the parser expects.
  - `appendToLine(content, node, text): string`: insert ` ${text}` at the end of A's line but *before* a trailing ` ^id`. Refuse (Notice) for multiline A (code block, table, fence).
  - Link text from `app.fileManager.generateMarkdownLink(fileB, aPath, subpath)`, so the user's wikilink/Markdown setting is honoured.
  - Same note: compute both splices on one string, later offset first, one `edits.write`. Different notes: an edit group: stamp B's note first, then write A's.
- **Manual test**: drag a bullet onto a bullet in another note (gets `^id`, link appears in A, edge appears after reload), onto a heading, onto a note core, within one note; one Ctrl+Z undoes both files; desktop and touch.

### Slice 5: Structural edits within a note (built, see "Slice 5" in the batch notes below)

*Corrections made while building:* (1) **Enter is now "add sibling", not "edit"**: slice 3 bound F2 and Enter to the inline editor, but this slice's key list (the mind map's) gives Enter to add sibling, so F2 alone edits in edit mode. (2) The structural functions take a *run* of sibling nodes (the mind map's multi-select) and return `{ text, start }`; 3D passes one. (3) A long press on a line is 500 ms within the 6 px click slop; right-click is handled from the pointer events, not the `contextmenu` event.

- Keys in edit mode, on the focused node: Tab = add child, Enter = add sibling, Ctrl/Cmd+Enter = insert parent, Delete/Backspace = delete subtree, Alt+Up/Down = move among siblings, Alt+Left/Right = outdent/indent. A new node opens the slice-3 inline editor at once (2D: `startEditingNewNode`).
- Plus a node context menu (right-click without drag; long-press on touch in edit mode) listing the same actions, so phones can reach them.
- Extract each content computation from `MindMapView` into pure functions in `mindmap-edit.ts`, test-first against today's 2D output, then make 2D call them: `addChildNode` → `insertChild(content, src)`, `addSiblingNode` → `insertSibling(content, src)`, `deleteNode` → `deleteSubtree(content, src)`, `moveNodeUpDown` / `indentNode` / `outdentNode` / `insertParentNode` likewise. `inferChildContext`, `childInsertOffset`, `subtreeEnd`, `insertAt`, `reindentSubtree` already exist there.
- **Manual test**: each action in 3D and the matching one in 2D (regression), undo across views.

### Slice 6: Move or reparent, within a note and across notes

- Gesture: in edit mode, drop A on B with Shift held (desktop), or pick from a small `Menu` that opens on drop when the drag lasted longer than a long-press on touch: "Link to B" / "Move under B" / "Move after B". *Proposed;* record the final choice.
- Same note: the slice-5 move functions. Across notes: extract `moveAcrossFiles`, `readMovedScheduleEntries` and `migrateBlockIdentity` from `MindMapView` into a shared obsidian-side module (`src/edit-moves.ts`) that takes an `EditPipeline` (for `write` / `processFrontMatter` and the group) plus `scheduleStore` and the card store, then make 2D's `executeDrop` / `pasteNodes` call it. This is the second-riskiest change after slice 1: the write order (destination first) and the identity migration are safety properties; keep their comments.
- **Manual test**: move a carded line into another note in 3D (its schedule follows: check `osmosis-schedule` in both notes), undo restores both; repeat in 2D across an embed seam (`vault/tests/mindmap/seam-*`).


## Batch implementation notes (awaiting manual test)

**Slice 1 of 6 built** on `feature/3d-graph-phase-7` (cut from `feature/3d-graph-mobile-polish`), code commit `e2329d5`. Not pushed, no PR, not tested in Obsidian. **Slices 2–6 remain** (see the slice plan): nothing in the 3D view edits yet.

### Approach

The 2D map kept its own `undoStack` / `redoStack` of `{ path, before, after }` snapshots, wrote with `vault.modify` / `processFrontMatter` in five places, and cleared both stacks when it switched notes. Slice 1 splits that into:

- **`EditHistory`** (`src/edit-history.ts`, pure): one instance on the plugin (`plugin.editHistory`). An entry is filed under its *owner* (the note the editing view is built on) and every file it wrote. `undo(key)` takes the newest entry filed under `key`, whichever view recorded it. Step and memory limits (`undoMaxSteps`, `undoMaxMemoryMB`) apply per file, with the same maths as before (oldest first, newest always kept, redo not trimmed).
- **`EditRecorder`** (same file): one per view; the live-edit coalescing (colour-picker drags) and edit groups (moves across an embed seam) that used to be `MindMapView` fields.
- **`EditPipeline`** (`src/edit-pipeline.ts`, imports `obsidian`): `write(file, content)`, `processFrontMatter(file, fn)`, and `step(key, isRedo)`, which takes the entry and restores its files (reverse order on undo, forward on redo, missing files skipped, as `applySnapshot` did). A `beforeWrite(path)` hook lets each view mark the write as its own; for 2D that is `suppressNextReload = true` plus `cache.invalidate(path)`, in the same order as before.
- **`MindMapView`**: `writeMarkdown`, `writeTranscludedMarkdown`, `writeFileTracked`, `processFrontMatterTracked` and `applySnapshot` now call the pipeline; everything after the write (re-parse, transclusion re-expansion, render) stays in the view. `undo()`, `redo()`, `beginLiveEdit()`, `endLiveEdit()` and `processFrontMatterTracked()` keep their public signatures for the properties sidebar.

### Decisions worth remembering

- **Lifetime by holds.** A view *holds* a file's history while it shows it (`editHistory.hold(path)` returns a release). When the last holder lets go, the history and every entry touching that file are dropped. The 2D map holds its note from `loadFile` and releases it on switching notes or `onClose`, so with 2D alone this is exactly the old "cleared on file switch / dies with the view". It also lets Phase 8's toggle keep the history: acquire in 3D before 2D releases.
- **No staleness check on undo.** Undo still writes `before` blindly, as 2D always did. A check ("refuse if the file isn't what the entry left") looked attractive, but the plugin's own sync stamps `id:` onto fences and the schedule store rewrites frontmatter seconds after edits, so it would refuse ordinary undos. Holds keep the exposure the same as before.
- **Cross-view ordering is enforced.** An entry spanning files (2D through an embed, or a cross-note move) is refused while a newer entry shares any of its files: a Notice says the later edit has to be undone first. This cannot happen with a single view (every entry shares its owner), so 2D alone never sees it.
- **2D through an embed:** an edit to an embedded note is filed under the map's note *and* the embedded note, so the map's Ctrl+Z still undoes it (as before), and a 3D view on the embedded note will be able to undo it too.
- **Two mind map tabs on the same note now share one history** (before, each tab had its own). That is the spec's "one history per file".
- **Owner key is the path held at load time** (`MindMapView.historyKey`), not `currentFile.path` read at write time, so a rename mid-session keeps recording and undoing under one key and the release clears it.
- **No 3D consumer yet.** Wiring Ctrl+Z into the 3D view needs holds on the loaded notes, the study gate and the typing check, which is slice 2's plumbing; doing half of it here would ship an undo that can't be tested against any 3D edit.

### Surface map

| File | Change |
|---|---|
| `src/edit-history.ts` (new) | `EditHistory` (per-file entries, holds, limits, cross-view ordering), `EditRecorder` (live edits, groups) |
| `src/edit-history.test.ts` (new) | 23 tests: the 2D map's old single-view behaviour pinned (LIFO, redo cleared, step and memory limits, live-edit coalescing, groups, release clears), then sharing across views (undo the other view's edit, blocked undo/redo, per-file limits, holds) |
| `src/edit-pipeline.ts` (new) | `EditPipeline`: tracked `write`, `processFrontMatter`, undo/redo `step` with the restore loop |
| `src/main.ts` | `plugin.editHistory`, limits read from settings at each push |
| `src/views/MindMapView.ts` | Stacks, live-edit and group fields, `recordEdit`, `enforceUndoLimits`, `snapshotBytes`, `MapEditSnapshot` removed; writes and undo/redo go through `this.edits`; hold/release in `loadFile` / `onClose` |

### Fixture

None new: slice 1 changes no 3D behaviour. The 2D regression pass uses existing fixtures: `vault/tests/mindmap/move-nodes.md` (structural edits), `vault/tests/mindmap/map-style-undo.md` (style writes and the colour-picker live edit), `vault/tests/mindmap/seam-transit-map.md` (a move across an embed seam, which is an edit group over two notes plus the schedule migration).

### Not verified

Nothing has run in Obsidian. Lint, the full unit suite (2,240 tests) and the build pass. Unverified: every 2D undo path end to end (text, structure, style, colour-picker drag, cross-seam move), and two map tabs on one note sharing a history.

## Slice 2 (3D edit plumbing, undo/redo, checkboxes, edit mode)

**Built** on `feature/3d-graph-phase-7`, code commit `396f711`, on top of slice 1. Not pushed, no PR, not tested in Obsidian. **Slices 3-6 remain.**

### What it does

- **Undo/redo in 3D.** `Mod+Z`, `Mod+Shift+Z`, `Mod+Y` on the view's `Scope`. The key into the shared history is the focused node's note (`scene.focusedNode()?.path`), else the note last edited (`lastEditPath`), else the focus note. Restored files reload the loaded area. Typing in a text box or editor keeps its own undo (`isEditableTarget`).
- **Holds.** After each `reload()`, `syncHolds(horizon.loaded)` holds the history of every loaded note and releases notes that left (`heldDiff`); `onClose` releases all. With the mind map also holding a note the count is 2, so the history lives until both let go.
- **Panel checkboxes.** Panels are inert, so `Graph3DNear.checkboxAt(x, y, slop)` hit-tests `input.task-list-item-checkbox` inside the front panel (`panelAt`, extracted from `linkAt`); only a checkbox line's own panel counts. `Graph3DScene.click()` tries it before `linkAt` (plain taps only; a held Shift/Ctrl/Cmd stays pan and link behaviour) and calls `onCheckboxClick`. The view fresh-reads the file, re-parses with its `ParseCache`, finds the line again by `OsmosisNode.id`, splices `toggleCheckboxLine`, and writes through the `EditPipeline`. Works outside edit mode.
- **Edit-mode toggle.** Pencil header action, `is-active` like study, `editMode` flag, off by default, not saved. It gates nothing yet (slices 3-6 read it); turning it on has no visible effect in this slice.
- **Study gate.** While `Graph3DStudy.active`: edit-mode toggle, checkbox ticks, undo and redo each show `Notice("Relational study: editing is off")` and do nothing. Starting a session (`toggleStudy`, or any `redraw()` while active) turns edit mode off.
- **Typing check** widened to `isEditableTarget` (INPUT, TEXTAREA, `isContentEditable`), used for flight keys, study keys and undo.

### Decisions worth remembering

- **Ticking changes a line's ID** (`[x] ` is part of `content`), so the node would respawn beside its parent and lose focus. `commitEdit` records `{ path, start, from }` and the next `reload()` (`place()`) copies the old node's placement to the new ID and re-focuses it via `setFocusId(lineNodeAt(...))`. `edited` is set only after the write resolves, so a reload already in flight can't consume it. The old node still cross-fades out as any departing node does. This is general: slices 3-6 reuse `commitEdit`.
- **Ticks are not reach-gated** like links (`LINK_REACH`): a panel only exists when its text is readable, and undo exists. Easy to add if Sawyer finds stray ticks.
- **No `normalizeBlockSpacing` on a toggle** (2D's `writeNodeFile` does it): a tick is a single in-line splice, so there is nothing to normalise, and rewriting other bytes on a tick would be a surprise.
- **Touch slop** for the checkbox is 14 px, mouse 4 px, since the box is a few pixels wide at panel scale.
- **Undo does not restore the camera or the selection**; it re-selects the focused line by its start offset when its note was restored.
- **Edit mode is a flag only** in this slice, so the manual test cannot show it doing anything.

### Surface map

| File | Change |
|---|---|
| `src/mindmap-edit.ts` | `toggleCheckboxLine(lineText, checked)` extracted from `MindMapView.toggleCheckboxNode` |
| `src/mindmap-edit.test.ts` | 4 `toggleCheckboxLine` cases (tick, untick either case, first box only, no-op) |
| `src/views/MindMapView.ts` | `toggleCheckboxNode` calls `edit.toggleCheckboxLine` |
| `src/graph3d/edit.ts` (new) | `findNodeById`, `lineNodeAt`, `heldDiff`, `isEditableTarget` |
| `src/graph3d/edit.test.ts` (new) | 13 tests, including a toggle spliced against shifted fresh bytes and a parent checkbox with a `^id` and children |
| `src/views/Graph3DNear.ts` | `panelAt` (shared), `checkboxAt` |
| `src/views/Graph3DScene.ts` | `onCheckboxClick` option, `focusedNode()`, `setFocusId()`, checkbox hit before link in `click()` |
| `src/views/Graph3DView.ts` | `EditPipeline`, holds, undo/redo keys, edit-mode action, study gate, `freshLine`, `commitEdit`, `toggleCheckbox`, `place()` |

### Fixture

`e2e/fixtures/graph3d/Dock Tasks.md` and `Haul-out Tasks.md` (copied to `vault/tests/graph3d/`): task lines (open, done, nested, one with a `^nav-lights` ID), plain bullets, and a link from Dock Tasks to Haul-out Tasks. Reload Obsidian (Ctrl+R) before testing.

### Manual test (Sawyer)

1. **2D sanity.** Open `vault/tests/mindmap/move-nodes.md` as a mind map, move a node (Alt+Up), Ctrl+Z restores it, Ctrl+Shift+Z redoes it. Close the map.
2. **Tick.** Open `vault/tests/graph3d/Dock Tasks.md`, run "Open 3D graph for current note", depth 2. Fly up to "Check the fenders" until its live panel shows. Click the checkbox. Expected: the box ticks, the file now has `- [x] Check the fenders` (open it in a note tab to check), and the node stays where it was and stays selected. Click again: unticks. Try a fingertip-sized tap on a phone. Also the `^nav-lights` line: the `^nav-lights` ID must survive and the two nested tasks must be untouched.
3. **Undo.** Tick two boxes in Dock Tasks, press Ctrl+Z twice (both revert, in order), Ctrl+Shift+Z (or Ctrl+Y) redoes one. Tick a box in Haul-out Tasks (a different loaded note), then Ctrl+Z: it reverts and is not mixed up with Dock Tasks' edits.
4. **Across views.** Open `Dock Tasks.md` as a mind map in a second tab (note view), tick a checkbox there, switch to the 3D tab and press Ctrl+Z: it reverts the mind map's tick (the 3D view reloads). Then tick in 3D and press Ctrl+Z in the mind map tab: it reverts the 3D tick.
5. **Typing keeps its undo.** Open the Overlays menu, type in a slider's number field if any, or any text box; Ctrl+Z there must not undo a note edit.
6. **Edit-mode toggle.** The pencil header action highlights when on, off again on a second click. Start Relational study: the pencil turns off; clicking it shows "Relational study: editing is off"; clicking a checkbox and pressing Ctrl+Z show the same notice and change nothing.
7. **Normal navigation unchanged.** WASD flight, clicks that hop, Mod-clicking links, still as before. Clicking a checkbox with Shift held does not tick it.

### Not verified

Nothing has run in Obsidian: the checkbox hit-test against real rendered panels (checkbox element class and rect under the panel's CSS scale), the placement carry (whether the new node really lands on the old one's spot), and every cross-view undo path. Lint, the full suite (2,257 tests) and the build pass.

## Slice 3 (inline editing and retype)

**Built** on `feature/3d-graph-phase-7`, code commit `8433d61`, on top of slice 2. Not pushed, no PR, not tested in Obsidian. **Slices 4-6 remain.**

*Overturned later:* this slice's editor-placement decision (placed once on `document.body`, unscaled, a camera move blurs and saves) was reversed by [[3D Graph - Editor anchoring and overlays fixes]]: the editor now lives in the scene stage and tracks its plate every frame.

### What it does

- **Edit mode now gates.** In edit mode, a double click or double tap on a line plate or panel, or F2 / Enter with a line focused, opens the editor. Outside edit mode nothing changes (two clicks are still two hops). Notes, tags, attachments and ghosts are not editable. While Relational study runs, `beginEdit` shows the study notice and does nothing.
- **The editor** (`src/views/Graph3DEdit.ts`, `Graph3DEditor`) is the same `EmbeddableMarkdownEditor` the mind map uses, in `div.osmosis-edit-overlay.osmosis-graph3d-edit` on `document.body`, `position: fixed`, so the mind map's CSS for the box, the CodeMirror resets and the save and cancel buttons all apply. It opens on `nodeEditText(line)` (markers in; indentation and trailing `^id` out), selecting from `editSelectionStart`. Ctrl/Cmd+Enter or the check button or a blur (100 ms later, as in 2D) saves; Escape or the x button cancels. A textarea fallback exists as in 2D.
- **Placement** is pure (`editBoxGeometry`): the node's on-screen left, top and width (from `Graph3DScene.nodeScreenBox`: the live panel's rect, else the projected plate), width clamped to 240-560 px, kept inside the view's box (desktop) or the visible viewport (phone), with 36 px above for the buttons. The text is `--font-text-size`, unscaled. The panel under it is hidden (`.is-editing` on the panel box) while editing.
- **While open:** `setEditing` cancels any flight (and the pending one); the flight keys already ignore a CodeMirror target (`isEditableTarget`); `reload()` returns at once and stores one `queuedReload` (merged `flyToFocus` / `subpath`) that runs when the editor closes, so a hop made by clicking the canvas (which also blurs the editor) saves first, then moves.
- **Save** (`saveEdit`): `freshLine` re-reads the file and finds the line by ID (gone: Notice, edit dropped), then `renameInFile(content, line, ancestorsOf(root, id), text)`, then `normalizeWrite`, then `commitEdit`. No write when the bytes did not change. `commitEdit` re-selects the line at its new start, found with `locateLine` (the restored line's nearest occurrence in the written text, since spacing normalisation or a retype can move it) rather than the old offset.
- **Retype** is the same code path: changing `- ` to `## ` in the editor makes `renameInFile` return `retyped: true` with the subtree moved by `retypeInFile`. No "Turn into..." menu.
- **Mobile.** On a phone the box is clamped to `visualViewport`, `navigator.virtualKeyboard.overlaysContent` is switched on for the edit and off after (the mind map's recipe), and `visualViewport` resize and VirtualKeyboard `geometrychange` re-run `fitEditTop`, so the box rises above the keyboard. Save and cancel are on-screen buttons, since there is no Ctrl+Enter or Escape. The box is above the joysticks and corner toggles (`z-index: 10000`). A double tap is detected with a 32 px slop.

### Pure functions extracted or added

- `renameInFile(content, src, ancestors, newLine): { text, retyped }` and `normalizeWrite(content)` in `src/mindmap-edit.ts`. `MindMapView.renameNode` now calls `renameInFile` (same bytes, same `retyped` branch; the post-retype re-selection stays in the view). Pinned in `mindmap-edit.test.ts` before and after: replaces only the line and keeps `^id`, nested indentation, no-op when unchanged, retype equals `retypeInFile`. `normalizeWrite` equals `normalizeBlockSpacing(renumberOrderedLists(x))`, idempotent.
- `ancestorsOf`, `locateLine`, `editBoxGeometry`, `fitEditTop` in `src/graph3d/edit.ts`, with tests (including a list item retyped to a heading from a fresh parse).

### Decisions worth remembering

- **Double click is detected in the scene's `click()`, not a `dblclick` listener**, and it uses the node of the *first* click. The first click flies the camera, so the second would land elsewhere; this also makes double tap work on touch where `dblclick` is unreliable. `onNodeDoubleClick` returns whether the view took it; only then does the scene skip the normal click.
- **A reload waits while the editor is open** instead of rebuilding under it. Cost: a schedule flush or metadata `resolve` during a long edit shows at the next close.
- **Closing the view drops an open edit** (`close(false)`); an edit that already blurred away has its save in flight. Leaving edit mode, or starting study, saves it.
- **`normalizeWrite` on a content edit can rewrite other bytes** (blank lines around headings, ordered numbering), exactly as every 2D edit does, so an undo of a content edit restores the whole file. A tick (slice 2) still writes the bare splice.
- **The editor is not scaled or tracked to the camera.** It is placed once at open; moving the camera (orbit, wheel) blurs it and saves. The same as the mind map's blur behaviour.
- **`freshLine` now also returns the parse root**, because `retypeInFile` compares the ancestors by identity with the siblings, so both must come from one tree.

### Surface map

| File | Change |
|---|---|
| `src/mindmap-edit.ts` | `renameInFile`, `normalizeWrite` (imports `markdown-spacing`) |
| `src/mindmap-edit.test.ts` | 6 tests for them |
| `src/views/MindMapView.ts` | `renameNode` calls `renameInFile` |
| `src/graph3d/edit.ts` | `ancestorsOf`, `locateLine`, `editBoxGeometry`, `fitEditTop` |
| `src/graph3d/edit.test.ts` | 13 tests for them |
| `src/views/Graph3DEdit.ts` (new) | `Graph3DEditor`: the overlay, buttons, textarea fallback, phone viewport and keyboard handling |
| `src/views/Graph3DNear.ts` | `nodeAt`, `panelRect`, `setEditing` (hides the panel) |
| `src/views/Graph3DScene.ts` | `onNodeDoubleClick` option, double-click detection in `click()`, `nodeScreenBox`, `setEditing` |
| `src/views/Graph3DView.ts` | F2 and Enter keys, `beginEdit` / `openEditor` / `finishEdit` / `saveEdit`, reload queueing, `freshLine` returns `root` |
| `styles.css` | `.osmosis-graph3d-edit` (fixed, z-index, readable type vars), `.osmosis-graph3d-near-panel.is-editing` |

### Fixture

`e2e/fixtures/graph3d/Chart Table Notes.md` (copied to `vault/tests/graph3d/`): a bullet list with nested items, a line with `^wind-shift`, an ordered list, and a heading to retype under. It links to `Tide Cards`. Reload Obsidian (Ctrl+R) before testing.

### Manual test (Sawyer)

1. **2D sanity.** Open `vault/tests/mindmap/move-nodes.md` as a mind map. Double-click a node, change its text, Ctrl+Enter: saved. Retype one (`- ` to `## `): the subtree moves with it. Ctrl+Z undoes each. Alt+Up still moves a node, and Ctrl+Z restores it.
2. **Open the editor.** Open `Chart Table Notes.md`, run "Open 3D graph for current note". Without edit mode, double-clicking a line just hops twice. Turn on the pencil, fly close to "Anchored in the lee of the island", double-click it. Expected: an editor box opens over it with `- Anchored in the lee of the island`, the label selected, the panel hidden under it, Save and Cancel buttons above. Type, press Ctrl+Enter: the box closes, the node shows the new text, stays selected and in place. Open the note in a tab: only that line changed.
3. **Keys.** Click a line (it becomes focused), press F2 and then, after Escape, Enter: the editor opens each time. Escape cancels and writes nothing. WASD must not fly while typing. Outside edit mode, F2 and Enter do nothing.
4. **Block ID.** Edit "Wind veered north-west by noon": the `^wind-shift` must still be at the end of the line in the file, and the two nested children untouched.
5. **Retype.** Edit "Fresh water" and change `- ` to `### `: the heading and its two children move so the children stay under it (open the note to check), and the 3D node keeps its place and focus. Change it back.
6. **Ordered list.** Edit "Rest: third watch": numbers stay 1, 2, 3.
7. **Undo.** Ctrl+Z in the 3D view undoes each edit above in turn (the file in a tab matches); Ctrl+Shift+Z redoes. Open the note as a mind map in another tab, edit a node there, then Ctrl+Z from the 3D tab: the mind map's edit reverts. Edit in 3D and Ctrl+Z in the mind map tab: reverts.
8. **Blur and hop.** Open the editor, change the text, then click empty space or another node: it saves, then the hop happens.
9. **Study gate.** Start Relational study: the pencil turns off; double-click does nothing as edit.
10. **Phone.** On a phone (or tablet), turn on the pencil and double-tap a line. The editor opens above the on-screen keyboard and not under the joysticks or the toolbar toggle; the check button saves, the x cancels.

### Not verified

Nothing has run in Obsidian: the `EmbeddableMarkdownEditor` mounted on `document.body` outside any view (the mind map does the same on a phone but not on a desktop); `nodeScreenBox` against real panel rects; the double-tap threshold on a real touch screen; the VirtualKeyboard and `visualViewport` fitting on Android and iOS (iOS has no VirtualKeyboard API, so it relies on `visualViewport` alone); that Enter/F2 on the view `Scope` reach the handler while the 3D canvas has focus; the placement carry after a retype. Lint, the full suite (2,276 tests) and the build pass.

## Slice 4 (drag-to-link)

**Built** on `feature/3d-graph-phase-7`, code commit `b91c98d`, on top of slice 3. Not pushed, no PR, not tested in Obsidian. **Slices 5-6 remain.**

### What it does

- **Gesture.** In edit mode, a mouse press (no modifier) or a one-finger touch on a **line** (its front panel, else the nearest plate within the pick slop) starts a `LinkDrag` instead of an orbit; on empty space, a note core, a tag or a file it still orbits. Until the pointer moves 6 px it is still a press that may be a click, so single click (hop), double click (edit, slice 3) and checkbox tick (slice 2) behave as before. Past 6 px it is a drag: `press` is cleared and nothing hops.
- **While dragging** (`stepLinkDrag`, each frame): a `THREE.Line` from the dragged line to the pointer (at the dragged line's depth) or, over a target, to its centre; depth test off, colour = the dragged plate's outline colour. The hovered drop target (a line or a note, not the dragged line) is highlighted: its plate outline turns the theme text colour (`layoutDirty`, restored on end) and its near-tier panel gets `.is-link-target` (an accent inset ring, `!important` because the outline is an inline `box-shadow`). Cursor is `crosshair`.
- **Drop.** Release on a different line or note: `onLinkDrop(from, to)` to the view. Release on nothing, on itself, on a tag or file, a second finger landing (pinch), `pointercancel`, leaving edit mode or Escape (a view-`Scope` key that only acts while a drag is active) all cancel with no write.
- **Write** (`Graph3DView.linkLines`): fresh-read A (`freshLine`), find B again (same note: in A's tree; other note: `freshLine`). `linkSubpath` decides the link (heading text, existing `^id`, or a new unique `os-xxxxxx` to stamp); the link text is `app.fileManager.generateMarkdownLink(fileB, A's path, subpath)`, so the user's wikilink/Markdown setting is honoured. Same note: `linkInNote` takes both splices on one string, later offset first, one `edits.write`. Different notes: `recorder.beginGroup()`, write B's note (stamp) first, then A's, `endGroup()` in `finally`, filed under A's note, so one Ctrl+Z restores both.
- After the write: `edited` carries A (selected again) and, if it was stamped, B to their new IDs, then `reload()`; the new edge appears after the metadata `resolve` reload.
- **Gates.** `editBlocked()` (relational study) at the drop. Study already turns edit mode off, which cancels a drag. A drag cannot start while the inline editor is open (the press is the editor's blur).

### Pure functions (`src/graph3d/edit.ts`, 20 new tests)

`linkSubpath(target | null, root, content)`, `stampBlockId(content, node, id)`, `appendToLine(content, node, text)`, `linkInNote(content, a, b, linkText, stamp)` (also returns the final starts of both lines, since either insert can push the other down). `normalizeHeading` (model.ts), `OSMOSIS_FENCE_REGEX` and `STRUCTURAL_LINE_REGEX` (generate-ids.ts) are now exported, unchanged otherwise.

### Judgment calls for Sawyer

- **PROPOSED, kept as the plan says:** headings link by heading text (`[[Note#Heading]]`), not a stamped ID. Change `linkSubpath` if you want IDs everywhere. A heading with punctuation (`#|^[]\*_`~=$<>%:`) or a duplicate title falls back to an ID anyway.
- **Only lines start a drag.** A note core cannot be dragged to link (no line to append to); it orbits. The plan's wording ("a line or note node") was ambiguous; notes are targets only.
- **A line dropped on its own note's core** shows "that line is already in that note" and writes nothing.
- **No alias on the link** (`[[Note#^os-abc123]]`, not `[[Note#^os-abc123|text]]`), and no duplicate check: dragging the same pair twice appends the link twice.
- **Multiline source lines** (code block, table, blockquote) and embeds cannot take a link: Notice, no write. As targets, a blockquote or table gets its `^id` on its own line right after (no blank line), as "Generate IDs" does.
- **Pointer highlight uses plate colour, not an extra mesh**, so on a large graph the highlight toggle rewrites all plate attributes once per target change.

### Surface map

| File | Change |
|---|---|
| `src/graph3d/edit.ts` | `linkSubpath`, `stampBlockId`, `appendToLine`, `linkInNote` |
| `src/graph3d/edit.test.ts` | 20 tests for them (heading, existing ID, duplicate heading, refusals, multiline stamp read back by the parser, forward and backward same-note offsets) |
| `src/graph3d/model.ts`, `src/card-gen/generate-ids.ts` | exports only |
| `src/views/Graph3DScene.ts` | `LinkDrag`, `setLinkMode`, `cancelLinkDrag`, `onLinkDrop`, `pickedNode`, `dropTarget`, `stepLinkDrag`, `endLinkDrag`; pointer down/move/up/pinch hooks; `editingId` |
| `src/views/Graph3DNear.ts` | `setLinkTarget` |
| `src/views/Graph3DView.ts` | `linkLines`; `edited` is a list; `setLinkMode` on edit-mode change; Escape key |
| `styles.css` | `.is-link-target` |

### Fixture

`e2e/fixtures/graph3d/Mooring Plan.md` and `Harbour Berths.md` (copied to `vault/tests/graph3d/`), linked to each other: bullets with and without `^id` (`^spring-line`, `^berth-fifteen`), headings, a three-line blockquote (multiline), nested bullets. Reload Obsidian (Ctrl+R) before testing.

### Manual test (Sawyer)

1. **Setup.** Open `Mooring Plan.md`, run "Open 3D graph for current note", depth 2 (both notes load). Turn on the pencil. Zoom close enough that lines are readable.
2. **Bullet without ID to a bullet in the other note.** Drag "Doubled bow line" onto "Berth fourteen has a short finger". While dragging: a line follows the pointer, the target highlights, cursor is a crosshair. Release. Expected: "Doubled bow line" now ends with `[[Harbour Berths#^os-xxxxxx]]` and "Berth fourteen..." ends with ` ^os-xxxxxx` (open both notes to check). Both nodes keep their place, the dragged one is selected, and a link edge appears after a second or so.
3. **Onto a bullet with an ID.** Drag "Hold the bow until the engine is warm" onto "Berth fifteen takes a long keel": the link uses `#^berth-fifteen`, the target is not changed. Drag a line with `^spring-line` onto something: the link goes before its `^spring-line`.
4. **Onto a heading.** Drag a bullet onto "Visitor pontoon": the link is `[[Harbour Berths#Visitor pontoon]]` and the heading is untouched.
5. **Onto a note core.** Drag a bullet onto the "Harbour Berths" core: `[[Harbour Berths]]`. Drag a bullet onto its own note's core: Notice, no change.
6. **Within one note.** Drag "Doubled bow line" onto "Fender boards on the quay side", then the reverse; check offsets (both lines intact, ID stamped on the target).
7. **Multiline.** Drag a bullet onto the blockquote: `^os-xxxxxx` on its own line after the quote, link `#^os-xxxxxx`. Drag the blockquote onto a bullet: Notice, no change.
8. **Undo.** After step 2, one Ctrl+Z (3D view focused) restores both files; Ctrl+Shift+Z redoes. Also undo from a mind map tab on `Mooring Plan`.
9. **Cancel.** Start a drag and press Escape; start one and release on empty space, on the dragged line, on a tag or file. Nothing written.
10. **No collisions.** In edit mode: a plain click on a node still hops; a double click still opens the editor; clicking a checkbox still ticks it; orbit on empty space and on a note core still works; Shift-drag still pans; WASD and the joysticks still fly. Outside edit mode a press on a line still orbits.
11. **Touch.** One-finger drag from a line onto another links; a drag from empty space orbits; a second finger during a link drag cancels it into a pinch; a tap on a line still hops.
12. **Study.** Starting Relational study turns edit mode off; no drag.

### Not verified

Nothing has run in Obsidian: the real `generateMarkdownLink` output (same-note links, the user's Markdown-links setting), the plate highlight and the band's look and draw order against real plates and panels (DOM panels always draw over the band), the 6 px slop on a real touch screen, and the placement carry after a stamp changes the target's graph ID. Lint, the full suite (2,296 tests) and the build pass.

## Slice 5 (structural edits within a note)

**Built** on `feature/3d-graph-phase-7-structural` (stacked on `fix/3d-graph-editor-anchoring`, which sits on `feature/3d-graph-phase-7`), code commit `95613e5`. Not pushed, no PR, not tested in Obsidian. **Slice 6 remains.**

### What it does

In edit mode, with a line focused (click it first; `Graph3DScene.focusedNode()`), the mind map's keys act on it:

| Key | Action |
|---|---|
| Tab | Add child |
| Enter | Add sibling (**Enter no longer opens the editor; F2 does**) |
| Ctrl/Cmd+Enter | Insert parent |
| Delete / Backspace | Delete the line and its subtree |
| Alt+Up / Alt+Down | Move among siblings |
| Alt+Left / Alt+Right | Outdent / indent |

The same actions (plus "Edit text") are in a context menu on a line: **right-click** without dragging on desktop, **long press** on touch. A new line (child, sibling, parent) opens the slice-3 editor on it at once, and the camera flies in if its text would be unreadably small (`Graph3DScene.setEditing`). Keys pass through to Obsidian outside edit mode, in a text box or editor, or with a button focused. The study gate (`editBlocked()`) applies; one structural edit is in flight at a time (`structuring`), so a held key does not stack writes.

### Approach

- **Extracted from `MindMapView`, test-first against 2D.** The same-file branch of each action became a pure function in `src/mindmap-edit.ts`: `insertChild`, `insertSibling`, `deleteSubtree`, `moveSiblings`, `indentSiblings`, `outdentSiblings` (also the root-child promotion list item → paragraph → heading) and `insertParent`, with the type rules they need (`inferChildType/Depth`, `inferIndentType/Depth`, `outdentContext`, `inferRootHeadingLevel`, `indentSubtreeHeadings`). Before touching 2D I copied today's logic verbatim into a throwaway module and checked the extracted functions against it for every node of every markdown file under `vault/tests/mindmap`, `vault/tests/graph3d` and `e2e/fixtures` (4,275 nodes, 138 files, each action, single and two-node selections): identical output. The throwaway was deleted; the permanent tests in `mindmap-edit.test.ts` pin 25 of those outputs as literals (captured from the 2D code, not hand-written). Then `MindMapView` was made to call them. The cross-file branches (a move across an embed seam), the selection and the writes stay in the view; the 2D private `inferChildType`, `inferChildDepth`, `inferIndentType`, `inferIndentDepth` and `outdentContext` remain as one-line delegates because the drop code and the cross-file branches still call them.
- **Each function returns where its line starts** (`Spliced.start`; insert parent also `moved`, where the block went), because 3D has to find the line again.
- **`planStructural(action, content, root, line)`** (`src/graph3d/edit.ts`) wraps them for one node: it finds the parent and siblings from a fresh parse (`ancestorsOf`) and returns `{ text, select, fresh, moved }` or null where 2D does nothing (no sibling to move past, nothing to indent under, a heading at the root).
- **Following lines through normalisation.** The result goes through `normalizeWrite`, which adds and drops blank lines and renumbers, so every offset shifts. `mapStart(before, after, start)` maps a line start by counting non-blank lines (normalisation never adds or removes one).
- **Keeping placement.** Indent, outdent and insert parent change a subtree's depth, and a parse ID contains depth, so every descendant gets a new graph ID and would respawn beside its parent. `carryPairs(old, root, start)` pairs the old subtree with the re-parsed one in document order (the same lines, so they zip; if the counts differ only the subtree's own line is paired) and `Graph3DView.edited` gets one entry per pair; `place()` copies each old position (and pinned state) to its successor. Up/down keep their IDs.
- **Selection after.** New line: selected and edited. Moves: the moved line. Delete: the parent line, or the note's core when the parent was the root (`selectAfter`).
- **A new line opens its editor from `reload()`**: `pendingEdit` is set after the write lands, and once `scene.setData` has put the node in the scene the view calls `openPending` → `scene.seedClear(id)` → `beginEdit(node)`.

### Decisions worth remembering

- **`seedClear`.** `placeNodes` seeds a new line 10 units from its parent, inside the parent's plate, and `setEditing` pins the edited node where it is (the anchoring fix), so a new line would have been pinned overlapping its parent for good. `Graph3DScene.seedClear` moves a just-arrived free node to `linkDistance("hierarchy", parent.extent, node.extent)` from its parent in a random direction before the editor pins it. Only new lines opened this way; no other node moves.
- **Context menu: 500 ms (`LONG_PRESS_MS`) and the 6 px click slop**, the same slop that turns a press into a link drag (slice 4), so the two are mutually exclusive: a finger that creeps past 6 px becomes a link drag and cancels the timer; one that holds still opens the menu, clears `press` (so the release is no click or double click) and ends the pending link drag. Only touch long-presses on a **line**; a note core, tag or empty space still orbits. A second finger (pinch), a lift, a pointer cancel, leaving edit mode and the editor opening all cancel it.
- **Right-click** is read from the pointer events (button 2 down, up without moving 6 px, same line under the press), not the `contextmenu` event, because on macOS and Linux that event fires on press, before we know whether it is a pan (OrbitControls pans with the right button). The native context menu is suppressed on the canvas in edit mode only.
- **The menu's target is the line pressed**, which also becomes the focused node (`setFocusId`, no flight). Menu items that cannot apply (move up on a first child) show a Notice; the same key presses do nothing silently, as in 2D.
- **Direction keys are fixed**: Alt+Left outdents and Alt+Right indents, as the plan says. The 2D map flips them by its layout direction.
- **An empty line left by cancel stays** (as in 2D): a new bullet whose editor is cancelled is an empty `- ` in the file, and its plate has zero width, so it is invisible in 3D. Undo (Ctrl+Z) removes it. I did not add a delete-on-cancel; say if you want one.
- **Reordering is invisible in space.** Moving a line among its siblings changes the file but not the picture (settled nodes never move, and sibling order is not spatial). Indent/outdent change the hierarchy edge only.
- **No multi-select.** The functions take a run of siblings and 2D still passes its multi-selection; 3D passes one line.

### Surface map

| File | Change |
|---|---|
| `src/mindmap-edit.ts` | `Spliced`, `insertChild`, `insertSibling`, `deleteSubtree`, `moveSiblings`, `indentSiblings`, `outdentSiblings`, `insertParent`, `inferChildType`, `inferChildDepth`, `inferRootHeadingLevel`, `inferIndentType`, `inferIndentDepth`, `outdentContext`, `indentSubtreeHeadings` |
| `src/mindmap-edit.test.ts` | 25 literal 2D outputs, `start`/`moved` per function, the type rules (17 tests plus the table) |
| `src/views/MindMapView.ts` | `addChildNode`, `addSiblingNode`, `deleteNode`, `moveNodeUpDown`, `indentNode`, `outdentNode`, `insertParentNode` call the extracted functions; the private infer helpers delegate; `inferRootHeadingLevel`, `indentSubtreeHeadings` removed from the class |
| `src/graph3d/edit.ts` | `StructuralAction`, `StructuralPlan`, `planStructural`, `mapStart`, `nodeAtStart`, `preorder`, `carryPairs` |
| `src/graph3d/edit.test.ts` | 9 tests for those |
| `src/views/Graph3DScene.ts` | `onContextMenu` option, `LONG_PRESS_MS`, `menuPress`, `longPress`, `startLongPress`, `clearLongPress`, `onContextMenuEvent`, `seedClear` |
| `src/views/Graph3DView.ts` | Structural keys (Enter moved off the editor), `structural`, `showNodeMenu`, `commitLines` (`commitEdit` calls it), `pendingEdit` / `openPending`, `selectAfter`, `edited.from` optional |
| `e2e/fixtures/graph3d/Watch Bill.md`, `vault/tests/graph3d/Watch Bill.md` | new fixture |

### Fixture

`Watch Bill.md` (copied to `vault/tests/graph3d/`): headings, a nested bullet list with a `^log-wind` ID, a checkbox, an ordered list, a paragraph. A new file, so there is no reset hazard; still reload Obsidian (Ctrl+R) first. For the 2D regression pass use `vault/tests/mindmap/move-nodes.md` and the same fixture opened as a mind map.

### Manual test (Sawyer)

**2D regression first (every extracted action), on `vault/tests/mindmap/move-nodes.md` as a mind map.** Select "Alpha child 2", then:
1. Tab: an empty child appears under it and the editor opens; type "x", Ctrl+Enter. Ctrl+Z removes it.
2. Enter: an empty sibling below its subtree, editor open. Escape leaves an empty bullet; Ctrl+Z removes it.
3. Ctrl+Enter: an empty parent appears above it, and the node (with "test 1", "test 2") is indented under it. On the "Alpha" heading instead: an empty `## ` above it and Alpha becomes `###`. Undo each.
4. Delete on "test 1": it goes with no blank line left; the parent ("Alpha child 2") is selected. Undo.
5. Alt+Up / Alt+Down on "Beta" (a heading) and on "Alpha child 1": swapped with the neighbour, subtrees intact. Alt+Right on "Alpha child 2": it nests under "Alpha child 1". Alt+Left on "test 1": it comes out beside "Alpha child 2". Alt+Left on a depth-0 bullet under a heading: it becomes a plain paragraph; again: a heading.
6. Select two siblings (Shift+Down) and repeat Alt+Right, Alt+Left, Alt+Down and Ctrl+Enter: both move together. A node under a transcluded note (`vault/tests/mindmap/seam-transit-map.md`): Alt+Up/Alt+Right across the seam still moves it into the other note.
7. Right-click a node: Add child / Add sibling / Insert parent / Delete still work.

**3D.** Open `Watch Bill.md`, run "Open 3D graph for current note", depth 1, turn on the pencil, click "Log the wind" (it becomes focused), fly close enough to read it.
8. Tab: an empty child is created (open the note in a tab: `\t- ` under "Log the wind", after "Shift of more than forty degrees"), the editor opens on its plate, clear of the parent's plate; type "Gust log", Ctrl+Enter: the plate shows it. "Log the wind" keeps its `^log-wind`. Ctrl+Z (3D view focused) removes it; Ctrl+Shift+Z puts it back.
9. Enter on "Log the wind": a sibling after its two children (a bullet at the same level); the editor opens; Escape. The empty bullet stays in the file. Undo removes it. On the checkbox line, Enter makes `- [ ] `. On the "Deck" heading, Enter makes an empty `## ` after the whole section. On "Standing orders for the night watch.", Enter makes a blank-separated paragraph placeholder.
10. Ctrl+Enter on "Check the anchor light": an empty `- ` appears above it, and it is indented under it; its plate has not moved. On "Galley": a new heading above, Galley becomes `###`, and its three items stay put.
11. Delete / Backspace on "Gusts over twenty knots": gone, "Log the wind" selected. On "Deck": the whole section goes. On "Watch Bill" (the top heading): everything below goes, the note core is selected. Undo each.
12. Alt+Down on "Check the anchor light": swaps with "Log the wind" in the file (check the note); the picture does not move. Alt+Up on the first item: nothing. Alt+Right on "Log the wind": nests under "Check the anchor light"; its two children go down with it and the plates stay where they were (only the hierarchy edge changes). Alt+Left on "Gusts over twenty knots": becomes a sibling of "Log the wind". Alt+Left on "Check the anchor light" under "Deck": becomes a plain paragraph; again: a heading. Numbers in "Galley" stay 1, 2, 3 after moving "Light the stove" up.
13. Right-click "Plot a fix every hour" without moving: the menu (Edit text, Add child, Add sibling, Insert parent, Move up/down, Indent, Outdent, Delete) opens at the pointer and the line is focused. Each item does what its key does. Right-drag still pans, with no menu. Right-click on empty space: nothing. Outside edit mode: no menu, the browser's own menu as before.
14. Phone: pencil on, hold a finger still on a line for half a second: the menu opens, and releasing does not hop or open the editor. A tap still hops, a double tap still edits, a drag from a line still links, a drag from empty space still orbits, a second finger cancels the hold.
15. Undo across views: make an Alt+Right in 3D, switch to the mind map of the same note (a second tab), Ctrl+Z there: it reverts. Make an Alt+Down in the mind map, Ctrl+Z in the 3D tab: it reverts, and the 3D view reloads.
16. Keys outside edit mode (Tab, Enter, Delete) do nothing in 3D, and none act while the Overlays menu's text boxes or the editor have focus. Relational study: the menu and keys show the study notice.

### Not verified

Nothing has run in Obsidian. Lint, the full suite (2,345 tests) and the build pass. Unverified: the 2D map in Obsidian after the extraction (only unit-tested; the differential check ran the extracted functions against a verbatim copy of the old logic, not the live view); right-button press/release on macOS and Linux (`pointerup` with `button === 2` after OrbitControls' pointer capture); the 500 ms hold on a real touch screen and Android's own long-press `contextmenu` (suppressed on the canvas); Obsidian `Menu` positioning at a pointer over a WebGL canvas; the icon names `indent-increase`, `indent-decrease` (a missing icon just shows no glyph); `seedClear` placement against dense neighbours; the carried placement after indent/outdent/insert parent; and that `mapStart`'s non-blank-line count holds for every `normalizeBlockSpacing` rule.
