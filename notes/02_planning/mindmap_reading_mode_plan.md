# Feature Plan: Mind Map Reading Mode

**Branch**: `feature/mindmap-reading-mode` (from `feature/notes-as-flashcards`)
**Created**: 2026-07-15
**Status**: Shipped — design signed off, implemented, and manually verified 2026-07-15

---

## Goal

A reading/editing toggle for the Mind Map View, mirroring the markdown Note
view's reading mode. Motivation: on mobile, a tap-drag meant to **pan**
instead moves a branch. In reading mode the map is safe to explore — it
cannot be mutated through the map surface — while study and peek stay fully
available.

---

## Decisions (agreed 2026-07-15)

| Question | Decision |
|---|---|
| Enforcement | **Guard the ~16 mutation methods, not the ~30 event handlers.** Every mutating action from every surface (keyboard, ribbon, context menu, dblclick, drag) funnels into a mutation method; a one-line `assertEditable()` guard there is the leak-proof safety net. Surface-level hiding (ribbon, menus, resize handles) is cosmetic UX on top. |
| Node drag | Becomes a **pan** in reading mode (the mobile pain point fix) — for both mouse and touch, even after long-press. `startDrag` is also guarded (defense in depth). |
| Study & peek | **Fully allowed.** Ratings write `osmosis-schedule` frontmatter via ScheduleStore — study metadata, not note content. Precedent: Obsidian's reading view permits checkbox toggles (file writes) and editable properties. Reading mode is arguably the ideal study surface. |
| Properties sidebar | **Stays live in reading mode.** Reading mode guards accidental map gestures; sidebar edits are deliberate panel actions (same Obsidian precedent). Map-surface style writes (resize drag, paste style) are still blocked. |
| Tool ribbon | Edit buttons **hidden** (not greyed) via an `editOnly` flag — ribbon shrinks to fit/zoom/center/fold/copy/refresh/properties. Orphaned group dividers collapse too. |
| Context menu | Node menu keeps Copy / Collapse all / Expand all / **Study this branch**; drops Add/Insert/Cut/Paste/styles/Delete. Canvas menu keeps everything except Paste. |
| Blocked-attempt feedback | Explicit attempts (dblclick, F2, Delete, Ctrl+V…) show a quiet `Notice`; drags are silent (they pan — desired behavior, not an error). |
| Toggle UX | Header action (`addAction`): `book-open` icon in editing mode, `pencil` in reading mode (markdown-view convention). Plus **Ctrl/Cmd+E** in the view scope and a command-palette command (`instanceof`-guarded). |
| Persistence | Per-leaf `readingMode` key via `getState`/`setState` (like markdown's mode). The new `getState` returns **only** super state + `readingMode` — never `file`, because `setState` auto-pins when `state.file` is present. `collapsedIds` stay unpersisted. |
| Global default | New setting **"Default mind map mode"**: Editing / Reading / Reading on mobile only. **Default: Editing** (fully opt-in — chosen by Sawyer over reading-on-mobile). Resolution is a pure helper (`resolveDefaultReadingMode`) so it's unit-testable. |

## Blocked vs. allowed matrix

| Interaction | Reading mode |
|---|---|
| Pan (background, middle-drag, **node-drag**), wheel/pinch zoom | ✅ |
| Select / multi-select / rubber-band / Ctrl+A, cursor sync (both ways) | ✅ |
| Collapse/expand, Space, fold/unfold one level & all, fit, center, refresh | ✅ |
| Link clicks, lazy transclusion expand | ✅ |
| Copy (Ctrl+C / ribbon / menu), Copy style (Ctrl+Shift+C, keyboard only) | ✅ |
| **Spatial study + peek, rating bubble, keys 1–4, Study this branch** | ✅ |
| Node drag/move | 🚫 → pans instead |
| In-place edit (dblclick, double-tap, F2) | 🚫 Notice |
| Add child/sibling/parent, duplicate (Tab/Enter/Ctrl+Enter/Ctrl+D) | 🚫 Notice |
| Delete, cut, paste (keys, ribbon, menu) | 🚫 Notice |
| Undo/redo forwarding (mutates the note via linked editor) | 🚫 Notice |
| Node resize | 🚫 handle hidden + silent guard |
| Paste style (Ctrl+Shift+V is scope-registered — bypasses `handleKeyDown`) | 🚫 Notice (method guard) |

Guarded methods: `startEditing`, `addChildNode`, `addSiblingNode`,
`insertParentNode`, `duplicateNode`, `deleteNode`, `deleteSelectedNodes`,
`indentNode`, `outdentNode`, `moveNodeUpDown`, `pasteNodes`,
`copySelectedNodes` (cut only), `forwardUndoRedo`, `pasteNodeStyle`;
silent: `startDrag`, resize entry points.

## Edge cases

- Toggling to reading while editing a node → `stopEditing(save)` first.
- Toggling mid-gesture → `cleanupAllInteractions()`.
- Spatial study/peek sessions survive mode toggling.
- Container gets `osmosis-reading-mode` CSS class (hides resize handles).
- `setState` (workspace restore) applies persisted mode after the
  settings-derived default.

## Out of scope

- Blocking the Properties sidebar's public style API (deliberate edits).
- Per-map (frontmatter) mode override — global setting + per-leaf state only.
