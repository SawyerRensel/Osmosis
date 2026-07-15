/**
 * Pure logic for spatial study (Mind Map View).
 *
 * Entering study mode hides only the map nodes whose line card is due or
 * new — the rest of the map stays fully expanded because spatial context
 * is the point. Nodes are matched to line cards exactly via block ID.
 * See notes/02_planning/notes_as_flashcards_plan.md §5 "Spatial (Mind Map
 * View)".
 */

import type { Card } from "../database/types";

/**
 * Structural view of a laid-out map node — matches `LayoutNode` so the
 * mind map can pass its nodes directly while tests build plain objects.
 */
export interface SpatialNodeLike {
	source: { blockId?: string; isTranscluded: boolean };
	children: SpatialNodeLike[];
}

/**
 * Block IDs of every line card in the set, regardless of schedule —
 * peek mode hides all tagged lines. Deck-excluded cards are included:
 * opt-out only removes cards from decks/sequential, not in-place study.
 */
export function allLineCardBlockIds(cards: readonly Card[]): Set<string> {
	const ids = new Set<string>();
	for (const card of cards) {
		if (card.cardType === "line" && card.blockId !== undefined) {
			ids.add(card.blockId);
		}
	}
	return ids;
}

/**
 * Block IDs of the line cards the scheduler would study now: due, or new
 * (never reviewed). Shared by contextual and spatial study — "due" always
 * means due-or-new (plan §5). Deck-excluded cards are included: opt-out
 * only removes cards from decks/sequential, not from in-place study.
 */
export function dueOrNewLineCardBlockIds(cards: readonly Card[], now: number): Set<string> {
	const ids = new Set<string>();
	for (const card of cards) {
		if (card.cardType !== "line" || card.blockId === undefined) continue;
		if (card.due === undefined || card.due <= now) {
			ids.add(card.blockId);
		}
	}
	return ids;
}

/**
 * Block IDs carried by a node and its laid-out descendants ("Study this
 * branch" scope). Transcluded nodes are skipped — their block IDs belong
 * to other notes, so they can never match this note's line cards.
 */
export function collectSubtreeBlockIds(root: SpatialNodeLike): Set<string> {
	const ids = new Set<string>();
	const visit = (node: SpatialNodeLike): void => {
		if (node.source.blockId !== undefined && !node.source.isTranscluded) {
			ids.add(node.source.blockId);
		}
		for (const child of node.children) {
			visit(child);
		}
	};
	visit(root);
	return ids;
}
