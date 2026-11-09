---
title: 3D Graph - Multi-select
summary: "3D: Shift+click toggles a plate in a selection, Shift+drag draws a box that selects the plates inside it, and every selected plate (and its panel) wears the mind map's 2px accent selection border. A selection can be copied as Markdown and, in edit mode, deleted in one undo step."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Develop Mind-Map Graph View]]"
  - "[[Graph pointer gestures - orbit, pan, link, menu]]"
  - "[[3D Graph - Re-settle after structural edits]]"
status: In-Review
priority:
progress:
date_created: "2026-11-08T20:35:12.000Z"
date_modified: "2026-11-09T12:49:17.000Z"
date_start_scheduled: "2026-11-08T20:35:12.000Z"
date_start_actual: "2026-11-08T20:35:12.000Z"
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

# Feature Request

## What do you need built?

Sawyer: "Need a way to select multiple nodes. Need to see selection border."

Spec (settled in the grill):

- **Gestures (3D):** Shift+click a plate toggles it in the selection; Shift+drag draws a screen-space box (rubber band) that selects plates inside it. A plain click on a plate replaces the selection with that plate (today's single focus). A click on empty space, or Esc, clears it. Selection works in and out of edit mode; destructive and structural actions are edit mode only.
- **Visible selection border** on every selected plate and its near-tier panel, matching the 2D look (`.osmosis-node-group.osmosis-node-selected > .osmosis-node`: 2px `--interactive-accent` stroke). Distinct from the link-drag target highlight and the focus dimming.
- **Actions on a selection** (the plate menu when right-clicking a selected plate, plus keys):
  1. Move / indent / outdent together (edit mode), via the Alt+drag drop menu and Alt+arrows.
  2. Delete (edit mode): every selected line with its children, one undo step.
  3. Copy as Markdown: re-levelled so the shallowest is top level, document order, grouped per note; Ctrl/Cmd+C.
  4. Link all to one target (edit mode): Alt+drag the selection onto a plate, "Add link" links every selected line (target stamped once).
- Non-line plates (tags, attachments, ghosts, note cores) can be selected for copy but are skipped by line actions.

## What problem does this solve?

The 3D graph could only act on one plate at a time, and nothing showed which plate was selected.

## What's your current workaround?

One plate at a time, or the 2D mind map.

## Reference Attachments/Screenshots

## Batch implementation notes (awaiting manual test)

**Shipped in this slice:** selection, box select, the selection border, Copy as Markdown, and Delete. **Not built:** action 1 (move / indent / outdent together) and action 4 (link all to one target). The brief allowed shipping these first; nothing of 1 or 4 is half-built. Today an Alt+drag from a selected plate still moves or links only the dragged line, and Alt+arrows still act on the primary line alone.

**Approach.** The scene owns the selection (`Graph3DScene.selection`, a set of node IDs) beside `focusId`, which stays the *primary*: the plate last clicked, the one F, back/forward, F2 and the single-line keys act on. A plain click does `select([id])` and then the old `onNodeClick` path (flight, history). Shift+click toggles the plate and, if it was added, makes it the primary without flying, so no history step is recorded. `beginBoxSelect` (the gestures ticket's stub) records the press; past the click slop (6 px) a fixed-position `.osmosis-graph3d-box` div draws the band, and the release adds `boxHits(screenCentres(), rect)` to the selection. The plate shader gets a per-instance `aSelected` and a `uAccent` uniform (the theme's `--interactive-accent`, read through the probe's `border-bottom-color`); near panels get `is-selected`. The view's copy and delete read each note fresh, find the lines by parse ID, and use the pure `src/graph3d/selection.ts`.

**Decisions worth remembering**

- **Box hit rule: the plate's centre is inside the box** (edges count), not any overlap: a big near plate the box only grazes, or a far plate behind the ones aimed at, would otherwise come along. Plates behind the camera, past the mist (`2 / fog.density`) or faded out are never boxed.
- **The box adds to the selection** (Shift is already held, so it reads as "add"); it does not replace it. Esc during the drag drops it.
- **A plain click selects the plate alone**, so a single clicked plate now wears the border (as in 2D). On load nothing is selected and no border shows, though the focus line still exists for F and the keys.
- **Clicking empty space clears the selection but not the primary** (`focusId`), so F and the edit keys keep working on the last plate.
- **Right-clicking a selected plate (with 2+ selected) opens a selection menu**: "Focus this note", "Copy N selected as Markdown", and in edit mode "Delete N selected lines". Right-clicking an unselected plate keeps its usual menu (plus a new "Copy as Markdown" for that plate) and leaves the selection alone.
- **Delete with 2+ selected deletes them all** (Delete/Backspace in edit mode, or the menu): each line with its subtree, as a single delete does; a selected line inside another selected line's subtree is dropped (`topmostLines`) so nothing is cut twice. Across notes the writes are one edit group, so one undo restores all. The note's root (a sole H1) is skipped, since deleting it would empty the note. After, the primary's parent is selected (its note's core if it was top level), and the B1 re-settle runs (`editLanded`), the camera tracking that parent.
- **Copy re-levelling:** list lines lose the smallest indent the selected list lines start at; headings shift so the shallowest selected heading is an H1. With more than one note, each note's group is headed by a `[[Note]]` line and groups are separated by a blank line; with one note there is no header. Non-line plates follow as `[[label]]` (notes, files, unresolved links) or `#tag`. The primary's note comes first. Ctrl/Cmd+C only takes the key when plates are selected, no text box has focus, no editor is open, and no text is selected in a panel.
- **An edit keeps its lines selected:** `place()` maps each `edited` entry's old ID to its new one (`carrySelection`); nodes gone from the model drop out of the selection in `setData`.
- **Touch has no box select** (Shift is a mouse modifier); a tap still selects one plate.
- **Selected border vs other highlights:** a selected plate's outline is the accent, at least 2 px (`max(stroke × 1.5, 2 px)`); the link-drag target recolours the outline to the theme's text colour; panels: selected is an inset 2px accent ring, the link target an inset 0.25em ring declared after it, so it wins while a drag is over a selected panel.

## Surface map

| File | Change |
|---|---|
| `src/graph3d/selection.ts` | New: `boxRect`, `boxHits`, `toggled`, `topmostLines`, `deleteLines`, `linesMarkdown`, `selectionMarkdown` |
| `src/graph3d/selection.test.ts` | New: 11 unit tests |
| `src/views/Graph3DScene.ts` | Selection set and API (`selectedNodes`, `select`, `clearSelection`, `carrySelection`), box select, Shift+click toggle, plain-click select, empty-click clear, `accent` in the theme |
| `src/views/Graph3DPlates.ts` | `aSelected` attribute and `uAccent` uniform: the selection border |
| `src/views/Graph3DNear.ts` | `setSelected`: `is-selected` on panels |
| `src/views/Graph3DView.ts` | Esc clears, Ctrl/Cmd+C copies, multi Delete, selection menu, `copySelection`, `deleteSelection`, selection carried across edits, theme accent |
| `styles.css` | Probe accent, `.is-selected` panel ring, `.osmosis-graph3d-box` rubber band |

## Test fixture

No new fixture: `vault/tests/graph3d/Sailing Basics.md` and `vault/tests/graph3d/Galley Handbook.md` (both loaded at depth 1 or more).

## Manual test steps

Open `vault/tests/graph3d/Sailing Basics.md` in the 3D graph.

1. Click a line plate. It flies as before and now wears a 2px accent border. Click another: the border moves.
2. Shift+click two more plates: each gets the border; nothing flies. Shift+click one again: its border goes.
3. Shift+drag a box over several plates: a dashed accent box follows the pointer, and on release the plates whose centres were inside are added. Esc during the drag: the box goes, nothing is selected.
4. Zoom in until a selected plate becomes a near panel: the panel shows the accent ring too.
5. Esc clears the selection. Select again, click empty space: cleared.
6. Select lines in Sailing Basics and in another note, press Ctrl/Cmd+C, paste into a note: each note's lines appear under a `[[Note]]` line, in document order, with the shallowest selected line at top level and children kept. Select a tag plate too: `#tag` comes last.
7. Right-click a selected plate: "Copy N selected as Markdown". Right-click an unselected plate: its usual menu plus "Copy as Markdown", and the selection stays.
8. Edit mode on: select three lines (one of them a child of another, one in a second note), press Delete. All go with their children; the parent of the primary is selected; the loaded nodes re-settle with the camera following it. Ctrl/Cmd+Z once restores every note.
9. Edit mode on: right-click a selected plate → "Delete N selected lines": same as step 8.
10. Regressions: plain click flies and records history; ← (back) returns to the previous plate; F refocuses the primary (last clicked) plate's note; Alt+drag from a single line still shows the drop menu and links; right-click menu opens on release; Enter/Tab/Delete on a single selected line still work; F2 edits; undo/redo; Esc inside the line editor still cancels the edit; selecting text in a panel and pressing Ctrl+C still copies the text.

## What I could not verify

Everything in Obsidian (I cannot see it): the border's look and thickness at distance, that `border-bottom-color` on the probe resolves the accent in every theme, that the fixed-position box lines up with the pointer inside a split pane, that Obsidian's Scope delivers Mod+C to the view while the canvas has focus, and the clipboard write on mobile.

### Part 2: move and link a selection

Commit c204286 on `feature/3d-graph-multi-select-actions` (cut from `feature/3d-graph-multi-select` at dcd93fe). Builds actions 1 and 4, so the whole spec is built now.

**Cause and constraints.** Part 1 left Alt+drag and Alt+←/→ acting on one line, because the edit helpers each handle one line or a run. The mind map's `indentSiblings`, `outdentSiblings`, `moveSiblings` and `moveWithinFile` only take a run of adjacent siblings, and so does `moveAcrossFiles` (one span cut from one origin). `linkLines` writes, reloads and opens its own edit group on every call. A selection can be non-adjacent, nested, and spread over several notes, and it still has to land as one undo step with one re-settle.

**Design.** A pure planner, `src/graph3d/selection-edit.ts`. It takes each note's fresh text and parse, the selected lines (found again by ID) and the target, and returns every changed note's new text plus where each acted-on line now starts. The view (`commitSelection`) normalises each text and writes them all in one edit group, the target's note first. For a cross-note move it then moves the block IDs' review history (`readMovedScheduleEntries` and `migrateBlockIdentity`, as `moveAcrossFiles` does), sets `edited` with the primary first, and sets `editLanded`, so the reload re-settles once with the camera on the primary.

- One splice engine (`splice`) works on each note against its *original* offsets. It cuts every moved line with its subtree (adjacent cuts merge, and each swallows its blank lines, as a move's does) and cuts in-place replacements exactly. Then it makes every insertion, each on its own line, with an offset inside a cut mapped to where the cut was. At one offset, a deeper new parent's lines go first, because they close its subtree. So the planner never re-parses between steps.
- **Move** (`planSelectionMove`): each line gets `moveGap`, `dropContext` and `resolveInsertSite`, exactly as one line's `moveInNote` / `moveLine` does. So the drop rules re-level it (for example, a list line dropped between headings becomes a heading).
- **Indent / outdent** (`planSelectionRelevel`): the single-line rules applied to every selected line at once (`inferIndentType/Depth`, `outdentContext`, root promotion as `outdentSiblings` does it).
- **Link** (`planSelectionLink`): `linkSubpath` once, `appendInsertion` per line, `stampInsertion` on the target once, and `insertAll` per note. `linkLines` itself is untouched; single-line links still use it.

**Decisions worth remembering**

- **The drop menu keeps its exact look:** same items, titles and icons, including the H1-root rule (no "Move after" onto a sole-H1 root). It acts on the selection when the dragged plate is selected and 2+ plates are selected. Dragging an unselected plate still moves or links only that line, and the selection stays. "Add link" is hidden only if no selected line could link (all of them are the target, or sit in the target's own note when the target is the note).
- **Order:** notes in the order they first appear in the selection (the primary's note first, as Copy does), and each note's lines in document order (`orderedLines`).
- **A selected line inside another selected line's subtree moves and re-levels once, with its ancestor** (`topmostLines`). **Link is the exception:** every selected line gets its own link, because a link belongs to its line, not its subtree. This departs from the brief's general dedupe rule on purpose.
- **Skipped, silently:** plates that are not lines (tags, files, ghosts, note cores), and a sole-H1 root, in move and re-level (moving the root would empty the note, as Delete already rules). For links, the target line itself, lines in the target's note when the target is the note, and lines that cannot take a link (code block, table, quote, embed). A notice appears only when nothing at all could be linked.
- **Move refusal:** if the target, or the gap, is inside a moving line or is one (including dropping onto another selected plate), the whole move is refused: "a line can't move under itself". It does not move the other lines.
- **Indent:** a run of adjacent selected siblings goes under the sibling before the run, as in 2D. A run that starts at a first child stays put as a whole, and the other runs still indent. **Outdent:** a parent's selected children (adjacent or not) go after its subtree in document order. Under the note root, a list line becomes a paragraph and a paragraph becomes a heading, in place. A heading at the root stays. Alt+↑/↓ (move up/down) still act on the primary alone; the spec asked only for indent and outdent.
- **The selection menu** (right-click a selected plate, edit mode) gained "Indent N selected lines" and "Outdent N selected lines" above Delete.
- **Moved lines keep their selection and start where they were** (`edited` carries `from` for each line and its subtree, via `carryPairs`), then the B1 re-settle carries them to their new parents. A single-line move omits `from`, so the line appears beside its new parent. For a selection, keeping it selected was worth the difference.
- `mapStart` follows each line through `normalizeWrite`. A cross-note move's destination entries shift by the frontmatter growth from the migrated history, as `moveLine` does.
- A cut that reached the end of a note restores the trailing newline.

**Surface map (part 2)**

| File | Change |
|---|---|
| `src/graph3d/selection-edit.ts` | New: `orderedLines`, `planSelectionMove`, `movedOut`, `planSelectionRelevel`, `planSelectionLink`, and the `splice` engine |
| `src/graph3d/selection-edit.test.ts` | New: 15 unit tests (move under/after/end, within one note and across notes, subtree carry, nested dedupe, document order, the inside refusal, mixed heading and list moves to the end, indent/outdent of non-adjacent lines and runs, a first-child skip, cross-note outdent, root promotion, link-all with one stamp, reuse of an existing ID, a note target) |
| `src/graph3d/edit.ts` | Exports `Insertion`, `stampInsertion`, `appendInsertion`, `insertAll` (doc comments) |
| `src/views/Graph3DView.ts` | `showDropMenu` routes to `moveSelection` / `linkSelection` for a selection; Alt+←/→ with 2+ selected → `relevelSelection`; selection menu Indent/Outdent; `readNotes`, `pickLines`, `commitSelection` (one group, history migration, `edited` primary first) |

**Test fixture:** no new fixture: `vault/tests/graph3d/Sailing Basics.md` and `vault/tests/graph3d/Galley Handbook.md`. Galley Handbook's long lists and nested Fresh food branch suit non-adjacent selections. Load at depth 1+ for cross-note cases (Sailing Basics plus a linked note).

**Manual test steps (part 2)**, in edit mode:

1. Open `Galley Handbook.md`. Shift+click "Lentils", "Tea bags" and "Sweetcorn" (Tins). Alt+drag "Tea bags" onto the "Stove" heading plate. The menu looks as it always has: Add link, Move under, Move after. Choose **Move under**: all three end up as the last items under Stove, in document order (Lentils, Tea bags, Sweetcorn). The Tins list renumbers. They stay selected, the graph re-settles **once**, and the camera follows the primary (the plate clicked last). Ctrl/Cmd+Z once: everything is back.
2. Same selection, Alt+drag onto "Cleaning" → **Move after**: they become H2 headings after Cleaning (the drop rules, as for one line). Undo.
3. Select "Fruit that keeps" (which has children) and "Apples" (inside it), then Alt+drag onto "Water" → Move under. Fruit that keeps moves once, with Apples, Oranges and Lemons under it.
4. Cross-note: load Sailing Basics at depth 1+. Select a line in Sailing Basics and a line in another loaded note, then Alt+drag onto a Galley/other-note plate → **Move to end of note** (on the core) or Move under. Both notes change, and one undo restores both. If a moved line was a card with review history, its history follows it.
5. Select "Apples", "Carrots" and the "Tools" heading, then press **Alt+←**: Apples goes after Fruit that keeps, Carrots after Vegetables that keep, and Tools becomes an H2 after Cooking gear. One undo restores all of it. Press **Alt+→** on "Pasta, four packets" plus "Salt and pepper": each goes under the line before it. Select "Rice…" (a first child) with another line and press Alt+→: Rice stays, and the other indents.
6. Right-click a selected plate: "Indent N selected lines" and "Outdent N selected lines" do the same.
7. Link all: select three lines across two notes, Alt+drag one onto a plain list line in a third note → **Add link**. Each selected line ends with the same `[[Note#^id]]`, and the target got **one** ` ^id`. Repeat onto a line that already has a block ID: it is reused, and nothing new is stamped. Onto a heading: `[[Note#Heading]]`. Onto a note core: `[[Note]]`, and lines in that note are skipped. One undo removes every link and the stamp.
8. The H1-root rule: with a selection, Alt+drag onto a note's sole-H1 root plate. "Move after" is **not** offered; Move under and Move to end of note are.
9. Regressions: Alt+drag from an **unselected** line (or with only one plate selected) moves or links just that line, exactly as before, and the selection is left alone. Alt+↑/↓ move only the primary. Single-line Alt+←/→ (one plate or none selected) unchanged. Delete, Copy and the other part 1 steps unchanged.

**What I could not verify (part 2):** everything in Obsidian. That includes the history migration on a real cross-note card move, and that the re-settle and camera tracking look right with several lines landing at once.

## Remaining (not built)

Nothing from the spec. Possible follow-ups, not filed: Alt+↑/↓ on a selection (move each run up/down), and a count in the drop menu's titles if acting on the selection without one proves surprising.
