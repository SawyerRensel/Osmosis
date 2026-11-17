---
title: Graph - Edit keys
summary: "Double-click a node to edit it (3D turns edit mode on); while editing, Enter saves, Shift+Enter adds a line, Ctrl/Cmd+Enter saves, a double-click on the node saves; when not editing, Enter adds a sibling. Both the 2D mind map and the 3D graph."
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
  - "[[3D Graph - Multi-select]]"
  - "[[Graph - Selection after delete and save]]"
status: Done
priority:
progress:
date_created: "2026-11-09T13:03:00.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-09T13:03:00.000Z"
date_start_actual: "2026-11-09T13:03:00.000Z"
date_end_scheduled: "2026-11-17T00:43:08.000Z"
date_end_actual: "2026-11-17T00:43:08.000Z"
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/48
---

# Feature Request

## What do you need built?

Sawyer, settled 2026-11-08:

1. **Double-click a node opens its editor**, in both views. In 3D this turns edit mode on if it is off.
2. **While editing:** Enter saves, Shift+Enter adds a new line, Ctrl/Cmd+Enter also saves, and a double-click on the node being edited saves.
3. **When not editing:** Enter adds a sibling, in both views.
4. In 3D the double-click must not fight the plate click: the first click flies and selects (or only selects, with "Click selects only" on), the second opens the editor. Shift+click selection is unchanged.

## What problem does this solve?

Editing needed F2 or a menu in 3D, and a mouse trip to the check button to commit; Enter made a newline, so the keyboard flow "type, Enter, next sibling" was broken.

## What's your current workaround?

F2, Ctrl/Cmd+Enter, the check button.

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

**What each view did before**

| Gesture | 2D | 3D |
|---|---|---|
| Double-click a node | Already opened the editor (`handleDblClick`; double-tap on touch). | Already opened it, but only with edit mode on (`onNodeDoubleClick` -> `beginEdit`); with it off the second click was just another click that flew again. |
| Enter in the editor | Newline (`onEnter: () => false`). | Newline. |
| Enter, not editing | Already added a sibling (`handleKeyDown`, "Enter = add sibling"). Unchanged. | Already added a sibling in edit mode (`structuralKey("sibling")`). Unchanged. |
| Double-click on the node being edited | Nothing useful (the click was swallowed by the overlay, the dblclick reached the map and found no node). | Swallowed by the editor box. |

**What was built**

- `EmbeddableMarkdownEditor`'s `onEnter(editor, mod, shift)` hook already existed, with `Enter` and `Shift+Enter` both routed to it, and "return false" meaning "default CodeMirror behaviour". Both callers now pass an `onEnter` that returns `true` and saves (`queueMicrotask`, like `onSubmit`) for plain Enter, and `false` for Shift+Enter, so Shift+Enter behaves exactly as Enter did before (Obsidian's default newline and list continuation; not changed).
- Pure `enterSavesEdit(mod, shift)` and `doubleClickEdit(node, editMode, blocked)` in `src/edit-keys.ts` (11 lines of logic, 8 tests).
- 3D: `Graph3DView.editOnDoubleClick` asks `doubleClickEdit`; `"enable"` calls `setEditMode(true)` then `beginEdit`. Saving still goes `Graph3DEditor.close(true)` -> `finishEdit`, so the node is selected after an Enter save (E4's rule) with no extra code.
- Double-click on the node being edited: a `dblclick` listener on the editor anchor (3D, `Graph3DEdit.ts`) and on the edit container (2D, `MindMapView.startEditing`) saves and stops the event.
- The fallback textarea in both views follows (Enter or Ctrl/Cmd+Enter saves, Shift+Enter is a newline).

**Decisions worth remembering**

- **The Enter binding has `stopPropagation: true`** (`EmbeddableMarkdownEditor`). When `onEnter` consumes the key, the editor is destroyed in a microtask, before the key would bubble to the view behind it. The 2D map's `handleKeyDown` listens on `contentEl` and, finding `editingNodeId` already null, would have taken that same Enter as "add a sibling". Ctrl/Cmd+Enter does not need this: the embedded scope handles it before CodeMirror. When `onEnter` returns false (Shift+Enter, default), nothing is stopped.
- **An open suggestion popup keeps Enter** (`suggestOpen()`: `.suggestion-container` exists), so `[[` and `[[#` completion still picks a suggestion instead of saving. Probably redundant (Obsidian's suggest scope most likely runs first) but cheap; I could not check it.
- **Callers of `EmbeddableMarkdownEditor`:** only the 2D `MindMapView` node editor and the 3D `Graph3DEditor`. Both want Enter-saves, so no per-caller flag was needed beyond `onEnter` itself, which is the opt-in and still defaults to `() => false` for any future caller.
- **3D Enter when not editing still needs edit mode on** (as before). Only double-click turns edit mode on. Enter with it off would clash with buttons, study mode and the focus keys, and the spec only said edit mode turns on for double-click.
- **Enter in a multi-line node** (code block, callout, anything whose edit text has newlines) now saves; Shift+Enter adds the line. Not special-cased inside a code fence.
- **Double-click on a note plate / non-line, or during a relational study session** does nothing new (study silent: it never toasts on a double click, as before).
- The 3D double-click needs no change in `Graph3DScene.ts`: `doubleClicked()` already runs before the plate-click code and returns true when the view takes the second click, so no second flight or select happens; the first click already flew and selected (or only selected, "Click selects only"). Shift/Ctrl/Meta clicks skip it, so Shift+click is untouched.
- A double-click that selects a word in the editor also saves (the dblclick fires after the word is selected). That is the spec.

## Surface map

| File | Change |
|---|---|
| `src/edit-keys.ts`, `src/edit-keys.test.ts` | New: `enterSavesEdit`, `doubleClickEdit`, tests |
| `src/editor/EmbeddableMarkdownEditor.ts` | Enter binding `stopPropagation`; `suggestOpen()` |
| `src/views/Graph3DEdit.ts` | `onEnter` saves; dblclick saves; fallback textarea Enter |
| `src/views/Graph3DView.ts` | `editOnDoubleClick` (turns edit mode on) |
| `src/views/MindMapView.ts` | `onEnter` saves; dblclick on the edit container saves; fallback textarea Enter |

## Test fixture

`vault/tests/graph3d/Dock Chores.md` and `vault/tests/graph3d/Sailing Basics.md` (existing; reload Obsidian, Ctrl+R, first).

## Manual test steps

Each in 2D (open the note as a mind map) and in 3D (open the note in the 3D graph at depth 0).

1. **Double-click edits.** 3D: with edit mode **off** (pencil not lit), double-click "Rinse the deck". Expect edit mode to turn on and the editor to open on that node. 2D: double-click opens it (unchanged).
2. **Enter saves.** Change the text, press Enter. Expect the edit saved, the editor closed, the node selected (border), and no sibling added.
3. **Shift+Enter** adds a line in the editor and does not save. Then Enter saves the two lines.
4. **Ctrl/Cmd+Enter** saves. (Check no parent is inserted.)
5. **Double-click while editing saves.** Open an editor, type something, double-click inside the box. Expect it saved.
6. **Enter, not editing, adds a sibling.** Select "Check the fenders", press Enter. Expect a new sibling after it, open for editing. 3D needs edit mode on. Then type and press Enter: it saves, and no further sibling appears.
7. **3D click then double-click.** Edit mode off, then on; "Click selects only" off: click a far plate (camera flies, selects), click again within about half a second (editor opens, no second flight). Repeat with the toggle **on**: first click only selects, second opens the editor.
8. **Link autocomplete.** In the editor, type `[[Sa`, press Enter on a suggestion: it picks the suggestion and does not save. Enter again then saves.
9. **Regressions:** Esc cancels the editor; Esc with no editor clears the selection (3D); F2 opens the editor; plain arrows and Shift+arrows move/extend the selection (3D) and are ignored while the editor is focused; Alt+arrows re-level; Shift+click toggles selection; clicking the canvas, the check button, and leaving edit mode still save.

## What I could not verify

I cannot run Obsidian. In particular: that Obsidian's own suggest popup still wins Enter (step 8), and that no stray sibling appears after an Enter save (steps 2 and 6; the `stopPropagation` is the guard).
