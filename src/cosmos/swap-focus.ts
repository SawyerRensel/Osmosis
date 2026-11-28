/**
 * What the mind map and Cosmos hand each other when a leaf swaps between
 * them (a note's layout changed, or Follow active note moved to a note drawn
 * by the other view): the focused node, so the incoming view centres on it.
 * The swap has no animation; see `docs/adr/0001-layout-replaces-2d-3d-toggle.md`.
 *
 * The focus rides in view state (`leaf.setViewState`) as `swapFocus`, so it
 * is plain data, read back with a check rather than trusted.
 *
 * Pure: no `obsidian` import, so it is unit-tested directly.
 */

import { buildContainingFileMap } from "../mindmap-edit";
import type { OsmosisNode } from "../types";
import { isNoteRoot, noteNodeId, type GraphModel } from "./model";

/** A node named by where it is: a line by its note and start, or a note (`root`). */
export interface MapFocus {
	path: string;
	start: number;
	root: boolean;
}

/** The node `focus` names in `model`; null when it names none, or it isn't there. */
export function focusNodeId(model: GraphModel, focus: MapFocus | null): string | null {
	if (focus === null) return null;
	for (const node of model.nodes) {
		if (node.path !== focus.path) continue;
		if (focus.root ? isNoteRoot(node) && node.id === noteNodeId(focus.path) : node.kind === "line" && node.source?.range.start === focus.start) return node.id;
	}
	return null;
}

/**
 * The focused line in the map's tree, with its ancestors: root first, the
 * line last. A line is matched by the note its range indexes
 * (`buildContainingFileMap`, so an embedded note's line is found inside the
 * host's map) and its start. Empty when the focus is a note, or not there.
 */
export function focusChain(root: OsmosisNode, hostPath: string, focus: MapFocus | null): OsmosisNode[] {
	if (focus === null || focus.root) return [];
	const fileOf = buildContainingFileMap(root, hostPath);
	const chain: OsmosisNode[] = [];
	const walk = (node: OsmosisNode): boolean => {
		chain.push(node);
		if (node.type !== "root" && node.range.start === focus.start && fileOf.get(node.id) === focus.path) return true;
		if (node.children.some(walk)) return true;
		chain.pop();
		return false;
	};
	return walk(root) ? chain : [];
}

/** A `MapFocus` read back from view state; null when it is missing or malformed. */
export function readMapFocus(value: unknown): MapFocus | null {
	if (typeof value !== "object" || value === null) return null;
	const { path, start, root } = value as Record<string, unknown>;
	if (typeof path !== "string" || typeof start !== "number" || !Number.isFinite(start)) return null;
	return { path, start, root: root === true };
}
