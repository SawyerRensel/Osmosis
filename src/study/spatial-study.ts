/**
 * Pure logic for spatial study (Mind Map View).
 *
 * Entering study mode hides only the map nodes whose line card is due or
 * new — the rest of the map stays fully expanded because spatial context
 * is the point. Nodes are matched to line cards exactly via block ID.
 * See notes/02_planning/notes_as_flashcards_plan.md §5 "Spatial (Mind Map
 * View)".
 *
 * Two key shapes coexist:
 * - Block-ID keys (`os-xxxxxx`) — used by the reading view, which always
 *   operates on a single note, so bare block IDs are unambiguous.
 * - Card keys (`${notePath}#^${blockId}`, i.e. the line card's ID) — used
 *   by the mind map, where transcluded nodes from other notes share the
 *   canvas and the same block-ID string can legitimately exist in both
 *   host and source files.
 */

import type { Card } from "../database/types";
import { lineCardId } from "../card-gen/line-cards";

/**
 * Structural view of a laid-out map node — matches `LayoutNode` so the
 * mind map can pass its nodes directly while tests build plain objects.
 */
export interface SpatialNodeLike {
	source: { blockId?: string; isTranscluded: boolean; sourceFile?: string };
	children: SpatialNodeLike[];
}

/** A card that participates in line study: line type with a block ID. */
function isLineCard(card: Card): boolean {
	return card.cardType === "line" && card.blockId !== undefined;
}

/**
 * Whether the scheduler would study this card now: due, or new (never
 * reviewed). "Due" always means due-or-new (plan §5).
 */
function isDueOrNew(card: Card, now: number): boolean {
	return card.due === undefined || card.due <= now;
}

/**
 * Block IDs of every line card in the set, regardless of schedule —
 * peek mode hides all tagged lines. Deck-excluded cards are included:
 * opt-out only removes cards from decks/sequential, not in-place study.
 */
export function allLineCardBlockIds(cards: readonly Card[]): Set<string> {
	const ids = new Set<string>();
	for (const card of cards) {
		if (isLineCard(card)) ids.add(card.blockId!);
	}
	return ids;
}

/**
 * Block IDs of the line cards the scheduler would study now: due, or new
 * (never reviewed). Deck-excluded cards are included: opt-out only
 * removes cards from decks/sequential, not from in-place study.
 */
export function dueOrNewLineCardBlockIds(cards: readonly Card[], now: number): Set<string> {
	const ids = new Set<string>();
	for (const card of cards) {
		if (isLineCard(card) && isDueOrNew(card, now)) ids.add(card.blockId!);
	}
	return ids;
}

/**
 * Card IDs of every line card in the set, regardless of schedule.
 * Same filter as `allLineCardBlockIds`, keyed collision-safely for maps
 * that mix cards from several notes (transclusion).
 */
export function allLineCardIds(cards: readonly Card[]): Set<string> {
	const ids = new Set<string>();
	for (const card of cards) {
		if (isLineCard(card)) ids.add(card.id);
	}
	return ids;
}

/**
 * Card IDs of the line cards the scheduler would study now. Same filter
 * as `dueOrNewLineCardBlockIds`, keyed collision-safely for maps that
 * mix cards from several notes (transclusion).
 */
export function dueOrNewLineCardIds(cards: readonly Card[], now: number): Set<string> {
	const ids = new Set<string>();
	for (const card of cards) {
		if (isLineCard(card) && isDueOrNew(card, now)) ids.add(card.id);
	}
	return ids;
}

/**
 * Card keys carried by a node and its laid-out descendants ("Study this
 * branch" scope). Local nodes key against the host note; transcluded
 * nodes key against their origin note, so their ratings and schedules
 * stay with the note that owns the line. Transcluded nodes lacking a
 * resolved `sourceFile` are skipped — a key can't be attributed.
 */
export function collectSubtreeCardKeys(root: SpatialNodeLike, hostPath: string): Set<string> {
	const keys = new Set<string>();
	const visit = (node: SpatialNodeLike): void => {
		const { blockId, isTranscluded, sourceFile } = node.source;
		if (blockId !== undefined) {
			const path = isTranscluded ? sourceFile : hostPath;
			if (path !== undefined) keys.add(lineCardId(path, blockId));
		}
		for (const child of node.children) {
			visit(child);
		}
	};
	visit(root);
	return keys;
}
