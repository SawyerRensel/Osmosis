import type { Card } from "../database/types";
import { isBuried } from "./bury";

/**
 * Single-note study scope. Pure so it can be unit-tested without a store.
 *
 * Mirrors the `CardStore` deck queries: opted-out and disabled cards never
 * surface, buried ones not until their bury ends, a card with no `due` is new, and due cards come oldest first.
 */

function studyable(card: Card): boolean {
	return !card.excludeFromDecks && !card.disabled;
}

/** A note's reviewed cards that are due at `now`, oldest due first. */
export function dueCardsInNote(cards: readonly Card[], now: number): Card[] {
	return cards
		.filter((c) => studyable(c) && !isBuried(c, now) && c.due !== undefined && c.due <= now)
		.sort((a, b) => (a.due ?? 0) - (b.due ?? 0));
}

/** A note's cards that have never been reviewed. */
export function newCardsInNote(cards: readonly Card[], now: number = Date.now()): Card[] {
	return cards.filter((c) => studyable(c) && !isBuried(c, now) && c.due === undefined);
}

/**
 * The decks a note's studyable cards belong to, de-duplicated and sorted.
 * Cards excluded from decks don't contribute, matching `CardStore.getAllDecks`.
 */
export function decksOfNote(cards: readonly Card[]): string[] {
	return [...new Set(cards.filter(studyable).map((c) => c.deck))].sort();
}
