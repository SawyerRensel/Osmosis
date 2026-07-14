/**
 * Pure logic for contextual progressive-reveal study (reading view).
 *
 * The reveal processor hides line-card lines in reading view and reveals
 * them top-down during a study session. These helpers map Obsidian's
 * metadata-cache positions (blocks, list items) onto the rendered
 * sections so the DOM layer stays thin. See
 * notes/02_planning/notes_as_flashcards_plan.md §5 "Contextual (Note View)".
 */

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
