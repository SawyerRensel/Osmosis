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
				learningSteps: card.learningSteps ?? 0,
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
			learningSteps: update.schedule.learningSteps,
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
					learningSteps: update.schedule.learningSteps,
				});
			}
		}

		return update.schedule;
	}

	/**
	 * Revert a review by restoring the previous schedule data.
	 * If previousSchedule is null, the card was new — clear all schedule fields.
	 */
	async revertReview(
		cardId: string,
		previousSchedule: ScheduleData | null,
	): Promise<void> {
		const card = this.store.getCard(cardId);

		if (previousSchedule) {
			// Restore old schedule
			this.store.updateSchedule(cardId, {
				stability: previousSchedule.stability,
				difficulty: previousSchedule.difficulty,
				due: previousSchedule.due,
				lastReview: previousSchedule.lastReview ?? Date.now(),
				reps: previousSchedule.reps,
				lapses: previousSchedule.lapses,
				state: previousSchedule.state,
				learningSteps: previousSchedule.learningSteps,
			});

			if (card) {
				const file = this.resolveFile(card.notePath);
				if (file) {
					void this.fenceWriter.writeSchedule(file, cardId, {
						stability: previousSchedule.stability,
						difficulty: previousSchedule.difficulty,
						due: previousSchedule.due,
						lastReview: previousSchedule.lastReview ?? Date.now(),
						reps: previousSchedule.reps,
						lapses: previousSchedule.lapses,
						state: previousSchedule.state,
						learningSteps: previousSchedule.learningSteps,
					});
				}
			}
		} else {
			// Card was new — clear schedule entirely
			this.store.clearSchedule(cardId);

			if (card) {
				const file = this.resolveFile(card.notePath);
				if (file) {
					void this.fenceWriter.removeSchedule(file, cardId);
				}
			}
		}
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
