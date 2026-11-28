---
icon: lucide/orbit
---

# Cosmos

Cosmos shows a note and the notes around it, line by line, as plates floating in space. Open it with the command **Open Cosmos for current note**, or **Cosmos** in a note's file menu. The header has the same Style, Note view, Study and Reading/Editing buttons as the mind map's; in Cosmos the ⋯ menu holds Follow active note, the walk and fly joysticks on a touch screen, and Controls help, which also stay on the toolbar.

## Layout

Each note has a **layout**: *Mindmap*, *Organic* or *Planets*. Mindmap draws the note as a mind map; Organic and Planets draw it in Cosmos, shaped by forces or with each note on a globe. A note without a layout of its own uses **Settings > Osmosis > Default layout** (Mindmap unless you change it).

- The brain button in a note's header, and **Map view** in its file menu, open the note in its layout.
- Pick a layout for the focus note in the style sidebar's **Layout** dropdown. It is saved in the note's styles, so it survives a reload and travels with the note. Picking Mindmap turns the tab into the note's mind map on the spot, centred on the line you were at; your undo history comes along.
- Cosmos draws in its focus note's layout. Opened on a Mindmap note with **Open Cosmos for current note**, it draws Organic.
- With **Follow active note** on, moving to a Mindmap note turns the tab into its mind map, and an unpinned mind map that moves to an Organic or Planets note turns into Cosmos.

## Controls

!!! note "Also in the view"
    The **?** button at the end of the toolbar in Cosmos opens this list. It is written by hand in two places (`src/cosmos/controls-help.ts` for the view, this page for the site), so update both together.

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
| Two-finger swipe | Zoom toward the cursor, like the wheel: swiping up zooms in, down zooms out |
| Pinch | Zoom toward the cursor |

The view tells a touchpad from a mouse wheel by itself, with no setting: a swipe that moves sideways at all, or in steps finer than a wheel's notches, is a touchpad. A mouse wheel always zooms, and a swipe zooms more finely than a notch does. Orbiting and panning are by drag only.

### Navigation gizmos

On a desktop with no touch screen, three faint round buttons sit at the top right of Cosmos. Press one and drag anywhere on screen; the view turns until you let go. They always act on the centre of the view, not on whatever is under the pointer. Clicking one without dragging does nothing.

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
| ++ctrl+up++ / ++ctrl+down++ | Move the selection to the previous / next sibling in the outline, stopping at the ends |
| ++ctrl+left++ / ++ctrl+right++ | Move the selection to the parent / first child in the outline, wherever they are on screen |
| ++ctrl+shift+arrow++ | Add that outline neighbour to the selection as the new primary |
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

Double-click a node to edit it; in Cosmos this turns edit mode on.

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
To link or move lines on a touch screen, select them, tap the toolbar's
:lucide-link: **Add link**, then tap the target plate. The same menu as the
++alt++ + drag drop opens there: **Add link**, **Move under**, **Move after**,
or **Move to end of note** for a note. Drags, pinches and holds on the way
there move the camera as usual and keep Add link armed.

### Overlays menu settings

| Setting | Effect |
|---------|--------|
| Color by (Show) | What colors the plates. **Mind map style** (the default) draws each note's mind map theme, `baseStyle` and node styles, level by level as the mind map does, and a scene of a single note takes its map background. **Note**, **Memory strength**, **Tag** and **Node type** color the outlines instead, leaving out the themes; a node's own style still wins in every mode. A theme's colored branches are not drawn, as the mind map does not draw them either |
| Click selects only (Camera) | A click selects a plate without moving the camera |
| Panel detail, Live panels (Lookdev) | How much text turns into a live panel; kept per device. Panel detail runs ×¼ to ×4, Live panels 4 to 128 (default 24 on desktop, 12 on mobile) |
