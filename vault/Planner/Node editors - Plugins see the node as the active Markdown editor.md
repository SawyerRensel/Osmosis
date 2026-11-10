---
title: Node editors - Plugins see the node as the active Markdown editor
summary: "A QuickAdd template choice run while text is selected in a node editor (2D mind map edit mode, 3D graph) fails with \"File name is empty after formatting\": QuickAdd looks for the active MarkdownView to read the selection, and the active leaf is the mind map or 3D graph. While a node editor is focused, Osmosis answers that lookup with a stand-in MarkdownView whose editor is the node's."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[3D Graph Phase 7 - Editing]]"
  - "[[Expose all Markdown elements in Mind Map Edit Mode]]"
status: In-Review
priority:
progress:
date_created: "2026-11-10T09:09:20.000Z"
date_modified: "2026-11-10T09:19:23.000Z"
date_start_scheduled: "2026-11-10T09:09:20.000Z"
date_start_actual: "2026-11-10T09:09:20.000Z"
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

# Bug Report

## Environment

| Field            | Value |
| ---------------- | ----- |
| Platform         | Obsidian desktop |
| Operating System | Linux |

## What happened?

Sawyer's report (relayed): he uses a QuickAdd template choice, "Create Topic Note", which creates a new note named from the selected text and replaces the selection with a link to that note. He triggers it from the command palette or a hotkey while text is selected in a node editor, in the 2D mind map (edit mode) or in the 3D graph. It fails:

```
QuickAdd: (ERROR) Error running template choice "Create Topic Note": File name is empty after formatting. ...
    at Rk.normalizeTemplateFilePath / resolveNewNotePath / run / onChooseTemplateType ...
```

## What should have happened?

The choice should work in a node editor as it does in a note tab: a new note named from the selection, and the selection in the node replaced with a link to it, saved to the node's source note.

Cause, from QuickAdd's source (`src/utils/activeMarkdownEditor.ts`, `currentFile.ts`, `editorInsertion.ts`): QuickAdd reads the selection and inserts the link through `app.workspace.getActiveViewOfType(MarkdownView)` and its `editor`. The node editor (`src/editor/EmbeddableMarkdownEditor.ts`) already sets `workspace.activeEditor` on focus, but the active leaf's view is MindMapView or Graph3DView, so that lookup returns null and the selection reads as "".

Sawyer's decision: an Osmosis stand-in. While a node editor has focus, `getActiveViewOfType(MarkdownView)` answers with an object that passes `instanceof MarkdownView`, whose `editor` is the node editor's real Editor, `file` the node's note, `getMode()` "source", `leaf` the real active leaf.

## Where is this file located?

`vault/tests/mindmap/quickadd-standin.md`

## Steps to Reproduce

### 1. Start from

Any note opened as a mind map (edit mode), or in the 3D graph.

### 2. Prep/settings

A QuickAdd template choice that names the new note from the selection and links it in place of the selection.

### 3. Do this

Start editing a node and select a word in it.

### 4. Trigger

Run the QuickAdd choice from the command palette or its hotkey.

## Batch implementation notes (awaiting manual test)

Code commit: `4d94b8a` on `fix/node-editor-markdownview-standin` (stacked on e536e2f).

### Cause

QuickAdd reads the selection through `getActiveViewOfType(MarkdownView)?.editor` and inserts the link the same way. The node editor (`EmbeddableMarkdownEditor`) set `workspace.activeEditor` on focus, which is enough for Obsidian's own editor commands. But the active leaf's view is `MindMapView` or `Graph3DView`, both `ItemView`s, so the lookup returned null and the selection read as `""`, which gives "File name is empty after formatting".

A second cause sat behind the first, on the command-palette path. Opening the palette blurs the node editor, and both node editors save and close on blur, 100 ms later. So by the time a palette command ran, the editor was already gone.

### Approach

- **Stand-in.** `EmbeddableMarkdownEditor.markdownViewStandIn()` makes `Object.create(MarkdownView.prototype)` once per editor and gives it own data properties: `editor` (the node's real Obsidian `Editor`), `file` (the editor's `file` option, which is the embedded note for a transcluded 2D node and the line's note in 3D), `getMode() → "source"`, `app`, `leaf` (the host view's leaf), and `containerEl`/`contentEl` (the editor's box). It uses `defineProperty` because own data properties shadow any accessor the prototype has for the same names.
- **Patch.** `installMarkdownViewStandIn(app)` is registered in `main.ts` `onload` via `this.register(...)`, so unload removes it. It wraps `workspace.getActiveViewOfType` and `workspace.getActiveFile` with `wrapMethod`, a hand-rolled monkey-around: on undo it restores the original, or deletes the own property when the method came from the prototype. If another plugin has wrapped ours since, ours becomes a pass-through instead. No new dependency.
- **Who answers** is decided by the pure `NodeEditorFocus` (`src/editor/active-node-editor.ts`). It records the last-focused node editor on `focusin`, forgets it on `destroy`, and at each lookup answers only while `workspace.activeEditor` is still that editor's owner and the active leaf's view is still its host view. So another editor or leaf becoming active ends it without any event listener, the same way Obsidian keeps `activeEditor`. A blur does not end it, so the palette or a QuickAdd modal doesn't either.
- **Modal hold.** In `EmbeddableMarkdownEditor`'s blur handler: when a `.modal-container` is open in the editor's document, the caller's `onBlur` (save and close) is held, and a 100 ms poll waits. It runs `heldBlurStep`, which is pure and tested. If the focus comes back to the editor, the edit simply resumes. While the modal is still open, it keeps waiting. If the modal closed and left the focus on nothing, the editor is refocused. If the focus went somewhere else, the held `onBlur` runs and the edit saves as before. The poll is cleared on focusin and on destroy.
- **Change path.** The stand-in's `editor` is the same `Editor` that typing goes through. `replaceSelection` dispatches a CodeMirror transaction, and ScrollableMarkdownEditor's update listener calls our `onUpdate(update, changed=true)` → `options.onChange`. That is the path the 3D editor's `fitWidth` already rides on every keystroke. Both views save on commit from `editor.value` (the CodeMirror doc), so the link saves when the edit commits, like typed text. This is verified by reading the code, not by running it.

### Decisions worth remembering

- **Only the exact `MarkdownView` lookup is answered.** A lookup for a superclass (`View`, `ItemView`, `FileView`) passes through untouched. For `View`/`ItemView` the real mind map or graph view already answers, and answering `FileView` lookups would put the stand-in in front of many core file commands that QuickAdd doesn't need.
- **`getActiveFile()` is patched too**, under the same condition, so it returns the node's note. I couldn't confirm in Obsidian whether it already returns `activeEditor.file` (the asar is outside the repo). If it does, the patch is a no-op. If it doesn't, the 3D graph would otherwise report whichever note was opened last, which is often not the node's. So QuickAdd's link source path is right either way. Side effect: while a node edit is open, Osmosis's own `getActiveFile()` users (for example "Open 3D graph for current note" and the 3D follow toggle) see the node's note.
- **Which editors expose it:** only editors given the new `view` option, and both node editors pass it: `MindMapView` (`view: this`) and `Graph3DEditor` (the view is now a constructor argument, passed by `Graph3DView`). `grep EmbeddableMarkdownEditor src` finds no other users. The properties sidebar doesn't use it (its fields are plain inputs), and the textarea fallbacks have no `Editor` to offer. Both are excluded.
- **The modal hold is in the shared editor**, not in each view, so 2D and 3D behave the same. It only applies when a caller passes `onBlur`, which both node editors do.
- **The stand-in is minimal**, with the fields listed in the ticket. It is not a working view. A core command whose check uses `getActiveViewOfType(MarkdownView)` can now show in the palette while a node is being edited. Running one that reaches into view internals (`currentMode`, `getViewData`, toggling reading view) may throw in the console. Whatever such a command does to the editor still lands in the node.

### Known trade-off (behaviour change)

Before, any modal (palette, quick switcher, a plugin prompt) saved and closed the node edit 100 ms after opening. Now the edit stays open until the modal closes. Pressing Escape in the palette returns you to the edit, which was not possible before. But if the modal's action then closes or replaces the view in the same tab (quick switcher opening a note in this tab, "Close current tab" from the palette), the open edit is lost. The 3D view drops an open edit on close by design, and the 2D view never saved one on close. A hotkey that closes the tab already did the same before this change. A possible follow-up is to save a held node edit when its view closes. That is not done, because 3D's drop-on-close was a deliberate earlier decision.

### Surface map

| File | Change |
| --- | --- |
| `src/editor/active-node-editor.ts` | New, pure: `NodeEditorFocus` (who answers), `heldBlurStep` (modal hold), `wrapMethod` (reversible patch) |
| `src/editor/active-node-editor.test.ts` | New: 17 tests for the three |
| `src/editor/EmbeddableMarkdownEditor.ts` | `view` option; focus tracking on focusin, forgotten on destroy; `markdownViewStandIn()`; blur held while a modal is open; `installMarkdownViewStandIn(app)` |
| `src/main.ts` | `this.register(installMarkdownViewStandIn(this.app))` at the start of `onload` |
| `src/views/MindMapView.ts` | Node editor passes `view: this` |
| `src/views/Graph3DEdit.ts` | `Graph3DEditor` takes its view, passes it to the editor |
| `src/views/Graph3DView.ts` | `new Graph3DEditor(this.app, this)` |

### Fixture

`vault/tests/mindmap/quickadd-standin.md` (master: `e2e/fixtures/quickadd-standin.md`), a harbour guide with a few bullet nodes, and `quickadd-standin-embed.md`, which it transcludes. Use the embedded note to check that the link lands in the embedded note's file.

### Could not verify

- QuickAdd itself, or anything in Obsidian.
- Whether Obsidian restores focus to the node editor when the palette closes. Either way the hold keeps the editor alive, and refocuses it if the focus was left on nothing.
- Whether QuickAdd opening the new note in the same tab drops the edit (see the trade-off above). A new tab or no open is fine: the blur then saves the node with the link.
