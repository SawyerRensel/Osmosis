import type { Card } from "../database/types";
import type { GeneratedCard } from "./types";

/**
 * Detect orphaned cards — cards in the store that no longer have
 * corresponding source content in the note.
 *
 * Returns the IDs of cards that should be removed.
 */
export function detectOrphanedCards(
	existingCards: Card[],
	generatedCards: GeneratedCard[],
): string[] {
	const generatedIds = new Set(generatedCards.map((c) => c.id));

	return existingCards
		.filter((c) => !generatedIds.has(c.id))
		.map((c) => c.id);
}

/**
 * Detect cards that were previously removed but whose
 * source content has been restored.
 *
 * Note: With the in-memory store (no soft-delete), this is a no-op.
 * Kept for API compatibility.
 */
export function detectRestoredCards(
	_allCards: Card[],
	_generatedCards: GeneratedCard[],
): string[] {
	return [];
}

/** Session quota state for limiting daily new/review cards. */
export interface SessionQuotas {
	newCardsToday: number;
	reviewsToday: number;
	dailyNewLimit: number;
	dailyReviewLimit: number;
}

/**
 * Apply session quotas to filter available cards.
 *
 * @param newCards Cards without schedule (never studied)
 * @param dueCards Cards with schedule that are due
 * @param quotas Current session quota state
 * @returns Filtered arrays respecting daily limits (0 = unlimited)
 */
export function applySessionQuotas(
	newCards: Card[],
	dueCards: Card[],
	quotas: SessionQuotas,
): { newCards: Card[]; dueCards: Card[] } {
	const remainingNew =
		quotas.dailyNewLimit === 0
			? newCards.length
			: Math.max(0, quotas.dailyNewLimit - quotas.newCardsToday);

	const remainingReview =
		quotas.dailyReviewLimit === 0
			? dueCards.length
			: Math.max(0, quotas.dailyReviewLimit - quotas.reviewsToday);

	return {
		newCards: newCards.slice(0, remainingNew),
		dueCards: dueCards.slice(0, remainingReview),
	};
}
