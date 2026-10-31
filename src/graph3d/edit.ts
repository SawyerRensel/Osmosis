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
