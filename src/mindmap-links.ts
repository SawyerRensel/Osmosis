import type { OsmosisNode } from "./types";

/**
 * The chain of nodes from a top-level node down to the deepest node whose
 * source range contains `offset` — how a resolved link target (a heading's or
 * block's start offset in the map's own file) becomes a node to reveal.
 *
 * Transcluded nodes are skipped: their ranges index the embedded file, so an
 * offset into the map's file could land on one by coincidence. Returns an empty
 * array when nothing contains the offset.
 */
export function nodePathAt(root: OsmosisNode, offset: number): OsmosisNode[] {
	for (const child of root.children) {
		if (child.isTranscluded) continue;
		const below = nodePathAt(child, offset);
		if (below.length > 0) return [child, ...below];
		if (offset >= child.range.start && offset <= child.range.end) return [child];
	}
	return [];
}
