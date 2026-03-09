import type { TFile } from "obsidian";
import type { FSRSScheduler, FSRSRating } from "../database/FSRSScheduler";
import type { Card, ScheduleData } from "../database/types";
import type { CardStore } from "../store/CardStore";
import type { FenceWriter } from "../store/FenceWriter";
import type { DeckScope, StudyCard, DeckCounts } from "./types";

/**
 * Pure logic for managing study sessions. Handles queue building,
 * review recording, and deck scoping. Used by all three study modes.
 */
export class StudySessionManager {
	constructor(
		private readonly store: CardStore,
		private readonly scheduler: FSRSScheduler,
		private readonly fenceWriter: FenceWriter,
		private readonly resolveFile: (notePath: string) => TFile | null,
	) {}

	/**
	 * Build a study queue for the given scope.
	 * Due cards first (oldest due first), then new cards.
	 * Respects daily limits.
	 */
	buildQueue(
		scope: DeckScope,
		options?: { newLimit?: number; reviewLimit?: number },
		now?: number,
	): StudyCard[] {
		const ts = now ?? Date.now();
		const newLimit = options?.newLimit ?? 0; // 0 = unlimited
		const reviewLimit = options?.reviewLimit ?? 0;

		// Get due cards (have schedule, due <= now)
		let dueCards = this.getDueCards(scope, ts);
		if (reviewLimit > 0) {
			dueCards = dueCards.slice(0, reviewLimit);
		}

		// Get new cards (no schedule entry)
		let newCards = this.getNewCards(scope);
		if (newLimit > 0) {
			newCards = newCards.slice(0, newLimit);
		}

		// Build queue: due cards first, then new cards
		const queue: StudyCard[] = [];

		for (const card of dueCards) {
			queue.push({ card, isNew: false });
		}

		for (const card of newCards) {
			queue.push({ card, isNew: true });
		}

		return queue;
	}

	/**
	 * Process a rating for a card. Updates store + writes schedule to markdown.
	 * Returns the new schedule.
	 */
	async recordReview(
		cardId: string,
		rating: FSRSRating,
		now?: number,
	): Promise<ScheduleData> {
		const ts = now ?? Date.now();
		const card = this.store.getCard(cardId);

		// Build current schedule from card data
		const currentSchedule: ScheduleData = card && card.due !== undefined
			? {
				stability: card.stability ?? 0,
				difficulty: card.difficulty ?? 0,
				due: card.due,
				lastReview: card.lastReview ?? null,
				reps: card.reps ?? 0,
				lapses: card.lapses ?? 0,
				state: card.state ?? "new",
			}
			: this.scheduler.createNewSchedule(ts);

		// Process through FSRS
		const update = this.scheduler.review(currentSchedule, rating, ts);

		// Update in-memory store
		this.store.updateSchedule(cardId, {
			stability: update.schedule.stability,
			difficulty: update.schedule.difficulty,
			due: update.schedule.due,
			lastReview: update.schedule.lastReview ?? ts,
			reps: update.schedule.reps,
			lapses: update.schedule.lapses,
			state: update.schedule.state,
		});

		// Write schedule back to markdown file
		if (card) {
			const file = this.resolveFile(card.notePath);
			if (file) {
				void this.fenceWriter.writeSchedule(file, cardId, {
					stability: update.schedule.stability,
					difficulty: update.schedule.difficulty,
					due: update.schedule.due,
					lastReview: update.schedule.lastReview ?? ts,
					reps: update.schedule.reps,
					lapses: update.schedule.lapses,
					state: update.schedule.state,
				});
			}
		}

		return update.schedule;
	}

	/**
	 * Get counts for a deck scope.
	 */
	getCounts(scope: DeckScope, now?: number): DeckCounts {
		const ts = now ?? Date.now();
		const dueCards = this.getDueCards(scope, ts);
		const newCards = this.getNewCards(scope);

		// Count learning cards from due cards
		const learnCount = dueCards.filter(
			(c) => c.state === "learning" || c.state === "relearning",
		).length;
		const reviewDueCount = dueCards.length - learnCount;

		return {
			new: newCards.length,
			learn: learnCount,
			due: reviewDueCount,
		};
	}

	// ── Private Helpers ───────────────────────────────────────

	private getDueCards(scope: DeckScope, now: number): Card[] {
		switch (scope.type) {
			case "single":
				return this.store.getDueCards(now, scope.deck);
			case "parent":
				return this.store.getDueCardsByDeckPrefix(now, scope.deck);
			case "all":
				return this.store.getDueCards(now);
		}
	}

	private getNewCards(scope: DeckScope): Card[] {
		switch (scope.type) {
			case "single":
				return this.store.getNewCards(scope.deck);
			case "parent":
				return this.store.getNewCardsByDeckPrefix(scope.deck);
			case "all":
				return this.store.getNewCards();
		}
	}
}
