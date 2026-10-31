/**
 * Pure helpers for editing from the 3D graph (`Graph3DView`): no `obsidian`
 * import, so they are unit-tested. See `vault/Planner/3D Graph Phase 7 -
 * Editing.md` for the plan.
 */

import type { OsmosisNode } from "../types";
import type { GraphModel } from "./model";

/**
 * The node with parse ID `id` under `root`, depth first. The 3D model is built
 * from a cached read, so an edit re-parses fresh bytes and finds its node again
 * by ID (content-derived: it survives a change elsewhere in the file) before it
 * splices by offset. Null when the line has gone.
 */
export function findNodeById(root: OsmosisNode, id: string): OsmosisNode | null {
	const stack: OsmosisNode[] = [root];
	while (stack.length > 0) {
		const node = stack.pop()!;
		if (node.id === id) return node;
		for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]!);
	}
	return null;
}

/**
 * The graph node for the line of `path` that starts at `start`, or null. An
 * edit changes a line's ID, but not where it starts, so this re-selects it.
 */
export function lineNodeAt(model: GraphModel, path: string, start: number): string | null {
	for (const node of model.nodes) {
		if (node.kind === "line" && node.path === path && node.source?.range.start === start) return node.id;
	}
	return null;
}

/**
 * What changes when the notes a view shows go from `prev` to `next`: the ones
 * to start holding the history of, and the ones to let go. Both lists are in
 * the order the sets iterate.
 */
export function heldDiff(prev: ReadonlySet<string>, next: ReadonlySet<string>): { acquire: string[]; release: string[] } {
	return {
		acquire: [...next].filter((path) => !prev.has(path)),
		release: [...prev].filter((path) => !next.has(path)),
	};
}

/**
 * Whether keys pressed on `target` belong to the thing being typed into: a
 * text box, or an editor (CodeMirror is a `contenteditable`). The view's key
 * handlers (flight, study, undo) pass those on.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
	if (target === null) return false;
	const { tagName, isContentEditable } = target as { tagName?: unknown; isContentEditable?: unknown };
	return tagName === "INPUT" || tagName === "TEXTAREA" || isContentEditable === true;
}

/**
 * The nodes above `id` in a tree: its parent first, the root last. Empty when
 * `id` is the root or is not in the tree. What `renameInFile` needs to retype a
 * line, taken from a fresh parse because the 3D model keeps no parent links.
 */
export function ancestorsOf(root: OsmosisNode, id: string): OsmosisNode[] {
	const trail: OsmosisNode[] = [];
	const walk = (node: OsmosisNode): boolean => {
		if (node.id === id) return true;
		trail.push(node);
		for (const child of node.children) if (walk(child)) return true;
		trail.pop();
		return false;
	};
	if (!walk(root)) return [];
	return trail.reverse();
}

/**
 * Where `line` starts in `text` after an edit was written, so the edited line
 * can be selected again: normalising spacing can push it down, and retyping can
 * move it. The occurrence nearest `hint` (where it started before), or `hint`
 * when the line no longer appears verbatim (a renumbered list item).
 */
export function locateLine(text: string, line: string, hint: number): number {
	if (line === "") return hint;
	let best = -1;
	for (let at = text.indexOf(line); at !== -1; at = text.indexOf(line, at + 1)) {
		if (best === -1 || Math.abs(at - hint) < Math.abs(best - hint)) best = at;
	}
	return best === -1 ? hint : best;
}

/** A rectangle in client pixels. */
export interface Box {
	left: number;
	top: number;
	width: number;
	height: number;
}

/** The room the inline editor may use, in client pixels. */
export interface EditBounds {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

const EDIT_MIN_WIDTH = 240;
const EDIT_MAX_WIDTH = 560;
const EDIT_MARGIN = 8;
/** Above the box: the save and cancel buttons float 32 px over it. */
const EDIT_BUTTON_ROOM = 36;
const EDIT_MIN_HEIGHT = 48;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

/**
 * Where the inline editor sits over a node. It is not scaled with the camera:
 * the text has to be readable however far the node is, so it only takes the
 * node's on-screen left, top and width (within a readable range) and is kept
 * inside `bounds`, with room above for its buttons.
 */
export function editBoxGeometry(anchor: Box, bounds: EditBounds): { left: number; top: number; width: number; maxHeight: number } {
	const room = bounds.right - bounds.left - 2 * EDIT_MARGIN;
	const width = clamp(anchor.width, Math.min(EDIT_MIN_WIDTH, room), Math.min(EDIT_MAX_WIDTH, room));
	const left = clamp(anchor.left, bounds.left + EDIT_MARGIN, bounds.right - EDIT_MARGIN - width);
	const top = clamp(anchor.top, bounds.top + EDIT_MARGIN + EDIT_BUTTON_ROOM, bounds.bottom - EDIT_MARGIN - EDIT_MIN_HEIGHT);
	return { left, top, width, maxHeight: bounds.bottom - EDIT_MARGIN - top };
}

/**
 * The top of an editor `height` tall that was placed at `top`, moved up if it
 * now runs past `bounds` (it grew as text was typed, or the on-screen keyboard
 * shrank the visible area), but never above the room its buttons need.
 */
export function fitEditTop(top: number, height: number, bounds: EditBounds): number {
	return Math.max(bounds.top + EDIT_MARGIN + EDIT_BUTTON_ROOM, Math.min(top, bounds.bottom - EDIT_MARGIN - height));
}
