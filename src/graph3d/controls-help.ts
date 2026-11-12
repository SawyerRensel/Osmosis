/**
 * The 3D graph's controls, as data. The in-view "?" help renders this list
 * (Graph3DHelp.ts); docs/mind-mapping/graph-3d.md ("Controls") is the same
 * list written by hand, so change both together. Pure, so a test can hold
 * every group to at least one entry.
 */

/** One control: what the user does, and what happens. */
export interface ControlEntry {
	input: string;
	action: string;
}

export type ControlGroupId = "mouse" | "touchpad" | "gizmos" | "keys" | "edit-keys" | "editing" | "touch" | "settings";

export interface ControlGroup {
	id: ControlGroupId;
	title: string;
	entries: readonly ControlEntry[];
}

export const CONTROL_GROUPS: readonly ControlGroup[] = [
	{
		id: "mouse",
		title: "Mouse",
		entries: [
			{ input: "Left-drag", action: "Orbit" },
			{ input: "Right-drag, or Ctrl/Cmd + drag", action: "Pan" },
			{ input: "Wheel", action: "Zoom toward the cursor" },
			{ input: "Shift + drag", action: "Box-select plates" },
			{ input: "Shift + click", action: "Add a plate to the selection, or take it out" },
			{ input: "Alt + drag from a line (edit mode)", action: "Link or move: the drop menu opens on release" },
			{ input: "Right-click without dragging", action: "Plate context menu" },
			{ input: "Hold a mouse button while flying", action: "The drag becomes eased mouse-look; the wheel then sets flight speed" },
			{ input: "Mouse back / forward", action: "Step back or forward through your visits" },
		],
	},
	{
		id: "touchpad",
		title: "Touchpad",
		entries: [
			{ input: "Two-finger swipe", action: "Orbit, like a drag from under the cursor" },
			{ input: "Shift + two-finger swipe", action: "Pan" },
			{ input: "Ctrl + two-finger swipe", action: "Zoom like the wheel: scrolling down zooms out" },
			{ input: "Pinch", action: "Zoom toward the cursor" },
		],
	},
	{
		id: "gizmos",
		title: "Navigation gizmos (mouse, no touch screen)",
		entries: [
			{ input: "Drag the rotate gizmo (top right)", action: "Orbit about the view's centre" },
			{ input: "Drag the hand gizmo", action: "Pan" },
			{ input: "Drag the magnifier gizmo up / down", action: "Zoom in / out toward the view's centre" },
		],
	},
	{
		id: "keys",
		title: "Keys",
		entries: [
			{ input: "W A S D, Q / E", action: "Fly: forward, left, back, right, down, up" },
			{ input: "F", action: "Make the selected plate's note the focus note (loads its surroundings)" },
			{ input: "Arrow keys", action: "Move the selection to the related plate nearest that direction on screen" },
			{ input: "Shift + arrow keys", action: "Add that plate to the selection as the new primary" },
			{ input: "Alt + Left / Right", action: "Back / forward (in edit mode with a line selected, these re-level instead)" },
			{ input: "Esc", action: "Cancel a link drag, close the help, cancel the editor, else clear the selection" },
			{ input: "Ctrl/Cmd + C", action: "Copy the selection as Markdown" },
			{ input: "Ctrl/Cmd + Z, Ctrl/Cmd + Shift + Z", action: "Undo, redo an edit" },
		],
	},
	{
		id: "edit-keys",
		title: "Keys in edit mode",
		entries: [
			{ input: "F2", action: "Edit the selected line" },
			{ input: "Enter", action: "Add a sibling after the selected line" },
			{ input: "Shift + Enter", action: "Add a sibling before the selected line" },
			{ input: "Tab", action: "Add a child under the selected line" },
			{ input: "Ctrl/Cmd + Enter", action: "Add a parent above the selected line" },
			{ input: "Delete or Backspace", action: "Delete the selected line, or every selected line" },
			{ input: "Alt + Up / Down", action: "Move the line among its siblings" },
			{ input: "Alt + Left / Right", action: "Outdent / indent the line, or every selected line" },
		],
	},
	{
		id: "editing",
		title: "Editing a node",
		entries: [
			{ input: "Double-click a node", action: "Edit it (turns edit mode on in 3D)" },
			{ input: "Enter, or Ctrl/Cmd + Enter", action: "Save" },
			{ input: "Shift + Enter", action: "Add a line" },
			{ input: "Double-click the node, or click away", action: "Save" },
			{ input: "Esc", action: "Cancel" },
		],
	},
	{
		id: "touch",
		title: "Touch",
		entries: [
			{ input: "One finger drag", action: "Orbit (what the drag does is a setting)" },
			{ input: "Two finger drag, pinch", action: "Pan and zoom" },
			{ input: "Joystick button", action: "Show the walk and fly joysticks" },
			{ input: "Hold a finger on a plate", action: "Add it to the selection; taps then add or remove plates, until a tap on empty space" },
			{ input: "Toolbar ⋮", action: "The selected plate's menu, with Open link for each link in its text (a tap on a link is a tap on its plate)" },
			{ input: "Toolbar Add link, then tap a plate", action: "Link the selected lines to it (edit mode); drags on the way keep it armed" },
		],
	},
	{
		id: "settings",
		title: "Settings (style sidebar)",
		entries: [
			{ input: "Click selects only (Camera)", action: "A click selects a plate without moving the camera" },
			{ input: "Panel detail, Live panels (Look)", action: "How much text turns into a live panel; kept per device" },
		],
	},
];
