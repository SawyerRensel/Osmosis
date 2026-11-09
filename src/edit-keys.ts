/**
 * Keys and gestures of the inline node editor, shared by the 2D mind map and
 * the 3D graph. Pure, so a test can hold the decisions (no `obsidian` import).
 */

/**
 * Whether Enter in the node editor saves it. Plain Enter saves; Shift+Enter
 * goes on to CodeMirror, which adds a line; Ctrl/Cmd+Enter saves through
 * `onSubmit`, a binding of its own.
 */
export function enterSavesEdit(mod: boolean, shift: boolean): boolean {
	return !mod && !shift;
}

/** What a double click on a node does. */
export type DoubleClickEdit = "open" | "enable" | "none";

/**
 * A double click on a line opens its editor. In the 3D graph, with edit mode
 * off, it turns edit mode on first (`enable`). Nothing for a node that is not
 * a line, or while a study session forbids editing.
 */
export function doubleClickEdit(node: { isLine: boolean; hasSource: boolean }, editMode: boolean, blocked: boolean): DoubleClickEdit {
	if (!node.isLine || !node.hasSource || blocked) return "none";
	return editMode ? "open" : "enable";
}
