---
icon: lucide/orbit
---

# 3D Graph

The 3D graph shows a note and the notes around it, line by line, as plates floating in space. Open it with the command **Open 3D graph for current note**, and switch back to the flat map with the 2D | 3D pill in the header (the mind map's header has the same pill, and the same Note view, Study and Reading/Editing buttons; Style, and Follow active note in 3D, are in the ⋯ menu).

## Controls

!!! note "Also in the view"
    The **?** button in the bottom-left corner of the 3D view opens this list. It is written by hand in two places (`src/graph3d/controls-help.ts` for the view, this page for the site), so update both together.

### Mouse

| Input | Action |
|-------|--------|
| Left-drag | Orbit |
| Right-drag, or ++ctrl++ / ++cmd++ + drag | Pan |
| Wheel | Zoom toward the cursor |
| ++shift++ + drag | Box-select plates |
| ++shift++ + click | Add a plate to the selection, or take it out |
| ++alt++ + drag from a line (edit mode) | Link or move: a menu opens where you let go |
| Right-click without dragging | Plate context menu |
| Hold a mouse button while flying | The drag becomes eased mouse-look; the wheel then sets flight speed |
| Mouse back / forward | Step back or forward through your visits |

### Touchpad

| Input | Action |
|-------|--------|
| Two-finger swipe | Orbit, like a drag from under the cursor |
| ++shift++ + two-finger swipe | Pan |
| ++ctrl++ + two-finger swipe up / down | Zoom in / out at the wheel's rate |
| Pinch | Zoom toward the cursor |

The view tells a touchpad from a mouse wheel by itself, with no setting: a swipe that moves sideways at all, or in steps finer than a wheel's notches, is a touchpad. A mouse wheel always zooms.

### Keys

| Key | Action |
|-----|--------|
| ++w++ ++a++ ++s++ ++d++ , ++q++ / ++e++ | Fly: forward, left, back, right, down, up |
| ++f++ | Make the selected plate's note the focus note, which loads its surroundings |
| ++left++ ++up++ ++right++ ++down++ | Move the selection to the related plate nearest that direction on screen |
| ++shift+arrow++ | Add that plate to the selection as the new primary |
| ++alt+left++ / ++alt+right++ | Back / forward. In edit mode with a line selected, these outdent and indent instead |
| ++escape++ | Cancel a link drag, close a menu or the editor, else clear the selection |
| ++ctrl+c++ | Copy the selection as Markdown |
| ++ctrl+z++ / ++ctrl+shift+z++ | Undo / redo an edit |

Back and forward also work from Obsidian's own tab buttons. Plain travel (clicks, arrow keys) is camera only; the focus note changes only when you ask, with ++f++ or **Focus this note** in the plate menu. There is no separate command or default hotkey for it.

### Keys in edit mode

Turn edit mode on from the header's Reading/Editing button (the pencil, shown while reading), then select a line.

| Key | Action |
|-----|--------|
| ++f2++ | Edit the line |
| ++enter++ | Add a sibling after the line |
| ++tab++ | Add a child under the line |
| ++ctrl+enter++ | Add a parent above the line |
| ++delete++ / ++backspace++ | Delete the line, or every selected line |
| ++alt+up++ / ++alt+down++ | Move the line among its siblings |
| ++alt+left++ / ++alt+right++ | Outdent / indent the line, or every selected line |

### Editing a node

Double-click a node to edit it; in 3D this turns edit mode on.

| Input | Action |
|-------|--------|
| ++enter++ or ++ctrl+enter++ | Save |
| ++shift+enter++ | Add a line |
| Double-click the node, or click away | Save |
| ++escape++ | Cancel |

### Touch

| Input | Action |
|-------|--------|
| One-finger drag | Orbit (what it does is a setting) |
| Two-finger drag, pinch | Pan and zoom |
| Joystick button | Show the walk and fly joysticks |
| Hold a finger on a line or note plate | Plate context menu |
| Drag from a line (edit mode) | Link or move: a menu opens where you let go |

### Overlays menu settings

| Setting | Effect |
|---------|--------|
| Click selects only (Camera) | A click selects a plate without moving the camera |
| Panel detail, Live panels (Lookdev) | How much text turns into a live panel; kept per device. Panel detail runs ×¼ to ×4, Live panels 4 to 128 (default 24 on desktop, 12 on mobile) |
