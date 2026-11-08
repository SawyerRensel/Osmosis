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
date_modified: "2026-11-08T21:10:00.000Z"
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

## Remaining (not built)

- **Move / indent / outdent together:** Alt+drag of a selection through the drop menu (Move under / to end of note / after) for every selected line in document order, and Alt+←/→ on the selection. The 2D helpers `indentSiblings` / `outdentSiblings` / `moveSiblings` in `src/mindmap-edit.ts` only take adjacent sibling runs; a general selection needs either a per-line sequence re-found by ID after each write, or a new multi-line splice.
- **Link all to one target:** "Add link" in the drop menu for each selected line, the target stamped once. `linkLines` writes and reloads per call and opens its own edit group, so it needs splitting into a plan step (text per file) and one grouped write.
