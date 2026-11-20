/**
 * Pure logic for note progressive-reveal study (reading view).
 *
 * The reveal processor hides line-card lines in reading view and reveals
 * them top-down during a study session. These helpers map Obsidian's
 * metadata-cache positions (blocks, list items) onto the rendered
 * sections so the DOM layer stays thin. See
 * notes/02_planning/notes_as_flashcards_plan.md §5 "Contextual (Note View)".
 */

import { OsmosisParser } from "../parser";
import { isLineGroup } from "../line-groups";
import type { OsmosisNode } from "../types";

/** A block ID's line span in the note (from the metadata cache `blocks` map). */
export interface BlockRef {
	id: string;
	startLine: number;
	endLine: number;
}

/** A list item's start line and optional block ID (from the cache `listItems`). */
export interface ListItemRef {
	startLine: number;
	id?: string;
}

/**
 * Document-order reveal sequence: the note's line-card block IDs sorted
 * by their current source position. Recomputed from the live cache so
 * frontmatter writes that shift line numbers can't stale the order.
 */
export function computeRevealOrder(blocks: readonly BlockRef[], lineCardIds: ReadonlySet<string>): string[] {
	return blocks
		.filter((b) => lineCardIds.has(b.id))
		.sort((a, b) => a.startLine - b.startLine)
		.map((b) => b.id);
}

/** The next card to reveal in top-down order, or null when all are revealed. */
export function nextToReveal(order: readonly string[], revealed: ReadonlySet<string>): string | null {
	for (const id of order) {
		if (!revealed.has(id)) return id;
	}
	return null;
}

/**
 * Line-card blocks whose span intersects a rendered section's line range,
 * in document order. A standalone `^id` line after a code block/table has
 * a span covering the block, so it intersects the block's section.
 */
export function blocksInRange(
	blocks: readonly BlockRef[],
	lineCardIds: ReadonlySet<string>,
	lineStart: number,
	lineEnd: number,
): BlockRef[] {
	return blocks
		.filter((b) => lineCardIds.has(b.id) && b.startLine <= lineEnd && b.endLine >= lineStart)
		.sort((a, b) => a.startLine - b.startLine);
}

/**
 * Block IDs of the list items inside a rendered list section, in source
 * order — index-aligned with the section's `<li>` elements in document
 * order (both are pre-order traversals of the same list). Items without
 * a block ID yield `undefined` so alignment is preserved.
 */
export function listItemIdsInRange(
	items: readonly ListItemRef[],
	lineStart: number,
	lineEnd: number,
): (string | undefined)[] {
	return items
		.filter((i) => i.startLine >= lineStart && i.startLine <= lineEnd)
		.sort((a, b) => a.startLine - b.startLine)
		.map((i) => i.id);
}

/**
 * The line span of every carded line group (T75) in a note, by block ID, from
 * Osmosis's own parse. Obsidian's metadata cache cannot give it: it makes a
 * heading its own block, so for `![[cover.png]]` + `## Title ^os-x` the
 * block covers only the heading line, and for `## Title` + `caption ^os-x` only
 * the caption. A group hides as the one node it is, so its span comes from here.
 */
export function lineGroupSpans(markdown: string, notePath: string): Map<string, BlockRef> {
	const spans = new Map<string, BlockRef>();
	const lineOf = (offset: number): number => {
		let line = 0;
		for (let i = markdown.indexOf("\n"); i !== -1 && i < offset; i = markdown.indexOf("\n", i + 1)) line++;
		return line;
	};
	const visit = (node: OsmosisNode): void => {
		if (node.blockId !== undefined && !node.isTranscluded && isLineGroup(node)) {
			// `range.end` is exclusive and may sit on the newline after the last line.
			const end = Math.max(node.range.start, node.range.end - 1);
			spans.set(node.blockId, { id: node.blockId, startLine: lineOf(node.range.start), endLine: lineOf(end) });
		}
		for (const child of node.children) visit(child);
	};
	visit(new OsmosisParser().parse(markdown, notePath).root);
	return spans;
}

/** `blocks` with each line group's span (`lineGroupSpans`) in place of Obsidian's block span. */
export function withGroupSpans(blocks: readonly BlockRef[], spans: ReadonlyMap<string, BlockRef>): BlockRef[] {
	return blocks.map((b) => spans.get(b.id) ?? b);
}
