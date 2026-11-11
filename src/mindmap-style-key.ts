/**
 * Choosing the key a node's style override is stored under.
 *
 * A style is keyed by the node's block ID (`^os-a1b2c3`), which stays with the
 * line when its text is edited. The old fallback, `_n:<content hash>`, does
 * not: editing the text changes the hash and orphans the style. So styling a
 * node reuses the line's own `^id`, or stamps a new `^os-` one onto it first.
 *
 * Pure logic, no `obsidian` import, so it is unit-tested.
 */

import { generateBlockId } from "./block-id";
import { canStamp, findNodeById, insertAll, stampInsertion, type Insertion } from "./graph3d/edit";
import { collectBlockIds } from "./mindmap-edit";
import { buildPreferredSelector } from "./styles";
import type { OsmosisNode } from "./types";

/** The result of {@link planStyleKeys}. */
export interface StyleKeyPlan {
	/** The note's text with every needed block ID stamped (unchanged when none was). */
	content: string;
	/** Node (parse) ID → the selector its style is stored under. */
	selectors: Map<string, string>;
	/** The stamps made, at their offsets in the original content. */
	insertions: Insertion[];
}

/**
 * Pick the style selector for each of `nodes` (nodes of the map's current
 * tree) and stamp a block ID onto each line that needs one.
 *
 * - A line with a block ID: reuse it. No edit.
 * - A line without: stamp ` ^os-xxxxxx` (a `^os-xxxxxx` line after a code
 *   block, table or quote) and use it.
 * - A line that cannot carry an ID keeps `buildPreferredSelector`'s answer
 *   (`_n:` hash): a card fence, an embed, a paragraph line that runs on into
 *   the next, the root, a node pulled in by transclusion (its line is in
 *   another file), or a line `root`/`content` no longer contain.
 *
 * `root` is the parse of `content`, the bytes about to be edited.
 */
export function planStyleKeys(content: string, root: OsmosisNode, nodes: readonly OsmosisNode[]): StyleKeyPlan {
	const selectors = new Map<string, string>();
	const taken = collectBlockIds(content);
	const edits: Insertion[] = [];

	for (const node of nodes) {
		const line = node.type === "root" || node.isTranscluded ? null : findNodeById(root, node.id);
		if (line === null) {
			selectors.set(node.id, buildPreferredSelector(node));
		} else if (line.blockId !== undefined) {
			selectors.set(node.id, `^${line.blockId}`);
		} else if (canStamp(content, line)) {
			const id = generateBlockId(taken);
			taken.add(id);
			edits.push(stampInsertion(line, id));
			selectors.set(node.id, `^${id}`);
		} else {
			selectors.set(node.id, buildPreferredSelector(node));
		}
	}

	return { content: edits.length === 0 ? content : insertAll(content, edits), selectors, insertions: edits };
}

/** Where a line that started at `start` in the original content starts once `plan`'s stamps are in (each lands at the end of a line). */
export function stampedStart(plan: StyleKeyPlan, start: number): number {
	let shift = 0;
	for (const insertion of plan.insertions) if (insertion.offset < start) shift += insertion.text.length;
	return start + shift;
}
