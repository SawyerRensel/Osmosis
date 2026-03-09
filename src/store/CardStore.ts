import type { Card, CardState } from "../database/types";

/**
 * In-memory card store. Replaces the SQLite CardDatabase.
 * Populated by CardSyncService on vault load and updated incrementally.
 * All operations are synchronous — no I/O.
 */
export class CardStore {
	private cards = new Map<string, Card>();
	private noteIndex = new Map<string, Set<string>>();

	addCard(card: Card): void {
		this.cards.set(card.id, card);
		let noteCards = this.noteIndex.get(card.notePath);
		if (!noteCards) {
			noteCards = new Set();
			this.noteIndex.set(card.notePath, noteCards);
		}
		noteCards.add(card.id);
	}

	removeCard(id: string): void {
		const card = this.cards.get(id);
		if (!card) return;
		this.cards.delete(id);
		const noteCards = this.noteIndex.get(card.notePath);
		if (noteCards) {
			noteCards.delete(id);
			if (noteCards.size === 0) {
				this.noteIndex.delete(card.notePath);
			}
		}
	}

	removeCardsByNote(notePath: string): void {
		const noteCards = this.noteIndex.get(notePath);
		if (!noteCards) return;
		for (const id of noteCards) {
			this.cards.delete(id);
		}
		this.noteIndex.delete(notePath);
	}

	getCard(id: string): Card | undefined {
		return this.cards.get(id);
	}

	getCardsByNote(notePath: string): Card[] {
		const noteCards = this.noteIndex.get(notePath);
		if (!noteCards) return [];
		const result: Card[] = [];
		for (const id of noteCards) {
			const card = this.cards.get(id);
			if (card) result.push(card);
		}
		return result;
	}

	getAllDecks(): string[] {
		const decks = new Set<string>();
		for (const card of this.cards.values()) {
			decks.add(card.deck);
		}
		return [...decks].sort();
	}

	/** Get cards that are due for review (have schedule data, due <= now). */
	getDueCards(now: number, deck?: string): Card[] {
		const result: Card[] = [];
		for (const card of this.cards.values()) {
			if (card.due === undefined) continue; // no schedule = new card
			if (card.due > now) continue;
			if (deck !== undefined && card.deck !== deck) continue;
			result.push(card);
		}
		// Sort by due date ascending (oldest due first)
		result.sort((a, b) => (a.due ?? 0) - (b.due ?? 0));
		return result;
	}

	/** Get due cards matching a deck prefix (deck + all sub-decks). */
	getDueCardsByDeckPrefix(now: number, prefix: string): Card[] {
		const result: Card[] = [];
		for (const card of this.cards.values()) {
			if (card.due === undefined) continue;
			if (card.due > now) continue;
			if (!matchesDeckPrefix(card.deck, prefix)) continue;
			result.push(card);
		}
		result.sort((a, b) => (a.due ?? 0) - (b.due ?? 0));
		return result;
	}

	/** Get new cards (no schedule data). */
	getNewCards(deck?: string): Card[] {
		const result: Card[] = [];
		for (const card of this.cards.values()) {
			if (card.due !== undefined) continue; // has schedule = not new
			if (deck !== undefined && card.deck !== deck) continue;
			result.push(card);
		}
		return result;
	}

	/** Get new cards matching a deck prefix. */
	getNewCardsByDeckPrefix(prefix: string): Card[] {
		const result: Card[] = [];
		for (const card of this.cards.values()) {
			if (card.due !== undefined) continue;
			if (!matchesDeckPrefix(card.deck, prefix)) continue;
			result.push(card);
		}
		return result;
	}

	/** Get card counts grouped by deck. */
	getCardCountsByDeck(now: number): Map<string, { new: number; learn: number; due: number }> {
		const counts = new Map<string, { new: number; learn: number; due: number }>();

		for (const card of this.cards.values()) {
			let entry = counts.get(card.deck);
			if (!entry) {
				entry = { new: 0, learn: 0, due: 0 };
				counts.set(card.deck, entry);
			}

			if (card.due === undefined) {
				// New card (no schedule)
				entry.new++;
			} else if (card.due <= now) {
				// Due card — classify as learn or review
				if (isLearning(card.state)) {
					entry.learn++;
				} else {
					entry.due++;
				}
			}
		}

		return counts;
	}

	/** Update schedule fields on a card in-memory. */
	updateSchedule(cardId: string, schedule: {
		stability: number;
		difficulty: number;
		due: number;
		lastReview: number;
		reps: number;
		lapses: number;
		state: CardState;
	}): void {
		const card = this.cards.get(cardId);
		if (!card) return;
		card.stability = schedule.stability;
		card.difficulty = schedule.difficulty;
		card.due = schedule.due;
		card.lastReview = schedule.lastReview;
		card.reps = schedule.reps;
		card.lapses = schedule.lapses;
		card.state = schedule.state;
	}

	/** Total number of cards in the store. */
	get size(): number {
		return this.cards.size;
	}

	/** Clear all cards. */
	clear(): void {
		this.cards.clear();
		this.noteIndex.clear();
	}
}

function matchesDeckPrefix(deck: string, prefix: string): boolean {
	return deck === prefix || deck.startsWith(prefix + "/");
}

function isLearning(state?: CardState): boolean {
	return state === "learning" || state === "relearning";
}
