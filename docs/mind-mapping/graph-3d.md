---
icon: lucide/orbit
---

# 3D Graph

The 3D graph shows a note and the notes around it, line by line, as plates floating in space. Open it with the command **Open 3D graph for current note**, and switch back to the flat map with the 2D | 3D pill in the header (the mind map's header has the same pill, and the same Note view, Study and Reading/Editing buttons; Style is in the ⋯ menu, and in 3D so are Follow active note, the walk and fly joysticks on a touch screen, and Controls help, which also stay on the toolbar).

## Controls

!!! note "Also in the view"
    The **?** button at the end of the 3D view's toolbar opens this list. It is written by hand in two places (`src/graph3d/controls-help.ts` for the view, this page for the site), so update both together.

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
| ++ctrl++ + two-finger swipe | Zoom at the wheel's rate, the way the page would scroll: scrolling down zooms out |
| Pinch | Zoom toward the cursor |

The view tells a touchpad from a mouse wheel by itself, with no setting: a swipe that moves sideways at all, or in steps finer than a wheel's notches, is a touchpad. A mouse wheel always zooms.

### Navigation gizmos

On a desktop with no touch screen, three faint round buttons sit at the top right of the 3D view. Press one and drag anywhere on screen; the view turns until you let go. They always act on the centre of the view, not on whatever is under the pointer. Clicking one without dragging does nothing.

| Gizmo | Drag | Action |
|-------|------|--------|
| Rotate | Any direction | Orbit about the centre of the view |
| Pan | Any direction | Slide the view |
| Zoom (magnifier) | Up / down | Zoom in / out toward the centre of the view |

Rotate and Pan coast on when you let go mid-motion, like a drag. Phones and touch-screen laptops don't show the gizmos; they have the walk and fly joysticks instead.

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
| ++shift+enter++ | Add a sibling before the line |
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
| Hold a finger on a plate | Add it to the selection; taps then add or remove plates, until a tap on empty space |
| Toolbar :lucide-more-vertical: | The selected plate's menu, with **Open link** for each link in its text |

A one-finger drag orbits in edit mode too, even from a line: dragging to link
or move is for the mouse (++alt++ + drag).
To link lines on a touch screen, select them, tap the toolbar's :lucide-link:
**Add link**, then tap the plate to link to. Drags, pinches and holds on the
way there move the camera as usual and keep Add link armed.

### Overlays menu settings

| Setting | Effect |
|---------|--------|
| Click selects only (Camera) | A click selects a plate without moving the camera |
| Panel detail, Live panels (Lookdev) | How much text turns into a live panel; kept per device. Panel detail runs ×¼ to ×4, Live panels 4 to 128 (default 24 on desktop, 12 on mobile) |
