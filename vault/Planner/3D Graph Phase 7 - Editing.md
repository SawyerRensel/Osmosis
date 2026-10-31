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
date_modified: "2026-10-31T22:30:00.000Z"
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

### Slice 3: Inline editing in the near tier (and retype)

- Trigger, in edit mode only: F2 or Enter on the focused line node, or a double-click / double-tap on a line plate or panel (`dblclick` on the canvas → `nodeNear`).
- Editor: `EmbeddableMarkdownEditor` (`src/editor/EmbeddableMarkdownEditor.ts`), the same one 2D uses, in an overlay `div.osmosis-graph3d-edit` absolutely positioned in the view root at the node's projected screen position (unscaled, readable size; width ≈ the panel's on-screen width, clamped). The panel stays under it; hide the panel's body while editing. Ctrl/Cmd+Enter or blur saves, Escape cancels (2D: `startEditing` / `stopEditing`).
- While the editor is open: `cancelFlight()`, ignore flight keys (the typing check), and skip `reload()` passes that would remove the node (queue one for after save).
- Text in: `edit.nodeEditText(source)`. Save: extract 2D's `renameNode` body into a pure `renameInFile(content, src, ancestors, newLine): { text: string; retyped: boolean }` in `mindmap-edit.ts` (it wraps `restoreEditedLine` + `retypeInFile`; pin current behaviour with tests first, then make `MindMapView.renameNode` call it). In 3D, ancestors come from a pure walk of the fresh tree (`ancestorsOf(root, id)` in `src/graph3d/edit.ts`). Write through `edits.write` after `renumberOrderedLists` + `normalizeBlockSpacing`, exactly as `MindMapView.writeNodeFile` → `writeMarkdown` does (put that normalisation in one shared pure function `normalizeWrite(content)` so both views call it).
- **Retype** is covered here, as in 2D: changing a line's markers (`- ` → `## `) in the editor retypes the subtree via `retypeInFile`. A "Turn into…" menu is not needed for parity.
- Mobile: the 2D editor's VirtualKeyboard handling (`overlaysContent`, fixed positioning) applies; reuse it.
- **Manual test**: edit a bullet, a heading, a line with a `^id` (the ID must survive), a `- ` → `## ` retype; undo each in 3D and in 2D.

### Slice 4: Drag-to-link

- In edit mode, `Graph3DScene.onPointerDown` on a line or note node (`nodeNear`, mouse or one finger) starts a `linkDrag` instead of a rotation; on empty space it still orbits. While dragging: a temporary `THREE.Line` from A to the pointer's aim point (depthTest off, the outline colour), and the hovered drop target highlighted (`nodeNear` each move). Release on B ≠ A → `options.onLinkDrop(a, b)`. Escape or release on nothing cancels. `cancelFlight()` on start.
- View, `linkLines(a, b)`, with pure helpers in `src/graph3d/edit.ts` (tests for each):
  - `linkSubpath(b)`: a heading → `#Heading text`; a note node → none; any other line → `#^id`, stamping one with `generateBlockId(collectBlockIds(content))` if B has none. *Proposed:* headings link by heading, not by a stamped ID, because that is the idiomatic Obsidian link and the graph already resolves it; change it if Sawyer wants IDs everywhere.
  - `stampBlockId(content, node, id): string`: ` ^id` at the end of a single-line node (before nothing); on its own line after a multiline node (code block, table, blockquote), as the parser expects.
  - `appendToLine(content, node, text): string`: insert ` ${text}` at the end of A's line but *before* a trailing ` ^id`. Refuse (Notice) for multiline A (code block, table, fence).
  - Link text from `app.fileManager.generateMarkdownLink(fileB, aPath, subpath)`, so the user's wikilink/Markdown setting is honoured.
  - Same note: compute both splices on one string, later offset first, one `edits.write`. Different notes: an edit group: stamp B's note first, then write A's.
- **Manual test**: drag a bullet onto a bullet in another note (gets `^id`, link appears in A, edge appears after reload), onto a heading, onto a note core, within one note; one Ctrl+Z undoes both files; desktop and touch.

### Slice 5: Structural edits within a note

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
