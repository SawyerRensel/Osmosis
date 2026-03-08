import type { CardRow } from "../database/types";
import type { GeneratedCard } from "./types";

/**
 * Detect orphaned cards — cards in the database that no longer have
 * corresponding source content in the note.
 *
 * Returns the IDs of cards that should be soft-deleted.
 */
export function detectOrphanedCards(
	existingCards: CardRow[],
	generatedCards: GeneratedCard[],
): string[] {
	const generatedIds = new Set(generatedCards.map((c) => c.id));

	return existingCards
		.filter((c) => c.deleted_at === null && !generatedIds.has(c.id))
		.map((c) => c.id);
}

/**
 * Detect cards that were previously orphaned (soft-deleted) but whose
 * source content has been restored.
 *
 * Returns the IDs of cards that should be restored.
 */
export function detectRestoredCards(
	allCards: CardRow[],
	generatedCards: GeneratedCard[],
): string[] {
	const generatedIds = new Set(generatedCards.map((c) => c.id));

	return allCards
		.filter((c) => c.deleted_at !== null && generatedIds.has(c.id))
		.map((c) => c.id);
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
	newCards: CardRow[],
	dueCards: CardRow[],
	quotas: SessionQuotas,
): { newCards: CardRow[]; dueCards: CardRow[] } {
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
