---
icon: lucide/pencil
---

# Editing

Double-click a node (or press ++f2++) to enter edit mode. Press ++escape++ to cancel.

!!! note "Editing mode required"
    Everything on this page needs the map to be in **editing** mode. If nodes won't move or edit, the map is probably in [reading mode](index.md#reading-mode) — press ++ctrl+e++ or click the :lucide-book-open: header icon to switch back.

![Drag and drop node repositioning](../assets/media/osmosis_mind_map_drag_and_drop_node_repositioning.png)

## Toolbar

The toolbar is a sticky action bar at the bottom of the mind map view. It provides quick access to all major actions — hover over any button for a tooltip.

| Icon | Action | Requires Selection |
|------|--------|--------------------|
| :lucide-maximize: | Fit to view | No |
| :lucide-zoom-in: | Zoom in | No |
| :lucide-zoom-out: | Zoom out | No |
| :lucide-home: | Center on root | No |
| :lucide-chevrons-down-up: | Collapse all | Yes |
| :lucide-chevrons-up-down: | Expand all | Yes |
| :lucide-arrow-right-to-line: | Insert parent | Yes |
| :lucide-arrow-down-from-line: | Add sibling | Yes |
| :lucide-arrow-right-from-line: | Add child | Yes |
| :lucide-arrow-up: | Move up | Yes |
| :lucide-arrow-down: | Move down | Yes |
| :lucide-arrow-left: | Move left (outdent) | Yes |
| :lucide-arrow-right: | Move right (indent) | Yes |
| :lucide-trash-2: | Delete | Yes |
| :lucide-copy: | Copy | Yes |
| :lucide-scissors: | Cut | Yes |
| :lucide-clipboard-paste: | Paste | Yes |
| :lucide-pipette: | Copy style | Yes |
| :lucide-paint-bucket: | Paste style | Yes |
| :lucide-undo-2: | Undo | No |
| :lucide-redo-2: | Redo | No |
| :lucide-refresh-cw: | Refresh mind map | No |
| :lucide-paintbrush: | Map properties | No |

Buttons that require a selection are dimmed when no node is selected. The toolbar hides automatically when you're editing a node's text.


## Structure Operations

| Action | Keyboard | Context Menu |
|--------|----------|--------------|
| Add child | ++tab++ | Add child |
| Add sibling | ++enter++ | Add sibling |
| Insert parent | ++ctrl+enter++ | Insert parent |
| Delete | ++delete++ or ++backspace++ | Delete |
| Duplicate | ++ctrl+d++ | — |
| Indent | ++alt+right++ | — |
| Outdent | ++alt+left++ | — |
| Move up | ++alt+up++ | — |
| Move down | ++alt+down++ | — |

!!! tip
    **Indent** makes the node a child of its previous sibling. **Outdent** moves it up to its parent's level. These mirror the standard outliner operations.

## Clipboard

| Action | Keyboard |
|--------|----------|
| Copy | ++ctrl+c++ |
| Cut | ++ctrl+x++ |
| Paste as child | ++ctrl+v++ |

Copy and paste preserve the full subtree structure. You can also copy and paste node styles separately via the context menu.

## Undo / Redo

| Action | Keyboard |
|--------|----------|
| Undo | ++ctrl+z++ |
| Redo | ++ctrl+shift+z++ or ++ctrl+y++ |

The mind map keeps its **own** undo history, independent of the Markdown editor's. Each map operation is one undo step — a move, a paste, a delete, a style change, or a map-level change like switching theme or layout. Undo works whether focus is on the map or on the properties sidebar, and a color-picker drag collapses into a single step rather than one per shade you passed through.

Two consequences worth knowing:

- History is **per map** and lives in memory. It clears when you switch files, and it doesn't survive a restart.
- The map is deliberately blind to edits you make in a separate Markdown pane. Undo in the map undoes *map* operations; use the editor's own undo for edits typed there.

### History Limits

Under **Settings > Osmosis > Undo history**:

| Setting | Default | What it does |
|---------|---------|--------------|
| Undo steps | 50 | Maximum operations kept per map |
| Undo memory cap (MB) | 20 | Ceiling on memory used by that history |

Whichever limit is hit first drops the oldest edits; the most recent edit is always kept. Changes take effect on the next edit — no reload needed. Raise the memory cap if you work with very large maps and want deeper history.

## Multi-Line Blocks

Code blocks, tables, and callouts/blockquotes are **atomic** — each is one node, and structure operations treat it as a single unit. Moving, indenting, or copying such a node carries the whole block, including its trailing block ID line, so [line card](../flashcards/line-cards.md) history follows it.

The same applies across a transclusion boundary: a node containing an `![[embed]]` moves, copies, and deletes as one unit, and the embedded content re-renders in place after the edit (or after undo).

## Context Menus

**Right-click a node** for:

- Add child, Add sibling, Insert parent
- Cut, Copy, Paste
- Copy style, Paste style
- Collapse all, Expand all
- Delete

**Right-click empty canvas** for:

- Fit to view
- Center on root
- Paste
- Collapse all, Expand all
- Refresh mind map
- Map properties
