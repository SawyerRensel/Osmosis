import type { CardDatabase } from "../database/CardDatabase";
import type { FSRSScheduler, FSRSRating } from "../database/FSRSScheduler";
import type { CardRow, CardScheduleRow, StudyMode } from "../database/types";
import type { DeckScope, StudyCard, DeckCounts } from "./types";

/**
 * Pure logic for managing study sessions. Handles queue building,
 * review recording, and deck scoping. Used by all three study modes.
 */
export class StudySessionManager {
	constructor(
		private readonly db: CardDatabase,
		private readonly scheduler: FSRSScheduler,
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
			const schedule: CardScheduleRow = {
				card_id: card.id,
				stability: card.stability,
				difficulty: card.difficulty,
				due: card.due,
				last_review: card.last_review,
				reps: card.reps,
				lapses: card.lapses,
				state: card.state,
			};
			queue.push({ card: this.extractCardRow(card), schedule });
		}

		for (const card of newCards) {
			queue.push({ card, schedule: null });
		}

		return queue;
	}

	/**
	 * Process a rating for a card. Updates DB schedule + inserts review log.
	 * Returns the new schedule.
	 */
	recordReview(
		cardId: string,
		rating: FSRSRating,
		studyMode: StudyMode,
		now?: number,
	): CardScheduleRow {
		const ts = now ?? Date.now();

		// Get or create schedule
		let currentSchedule = this.db.getSchedule(cardId);
		if (!currentSchedule) {
			currentSchedule = this.scheduler.createNewSchedule(cardId, ts);
			this.db.upsertSchedule(currentSchedule);
		}

		// Process through FSRS
		const update = this.scheduler.review(currentSchedule, rating, ts);

		// Persist
		this.db.upsertSchedule(update.schedule);
		this.db.insertReviewLog({
			card_id: cardId,
			rating: update.reviewLog.rating,
			study_mode: studyMode,
			reviewed_at: update.reviewLog.reviewed_at,
			elapsed_days: update.reviewLog.elapsed_days,
			scheduled_days: update.reviewLog.scheduled_days,
		});

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

	private getDueCards(scope: DeckScope, now: number): Array<CardRow & CardScheduleRow> {
		switch (scope.type) {
			case "single":
				return this.db.getDueCards(now, scope.deck);
			case "parent":
				return this.db.getDueCardsByDeckPrefix(now, scope.deck);
			case "all":
				return this.db.getDueCards(now);
		}
	}

	private getNewCards(scope: DeckScope): CardRow[] {
		switch (scope.type) {
			case "single":
				return this.db.getNewCards(scope.deck);
			case "parent":
				return this.db.getNewCardsByDeckPrefix(scope.deck);
			case "all":
				return this.db.getNewCards();
		}
	}

	/** Extract just the CardRow fields from a joined card+schedule row. */
	private extractCardRow(joined: CardRow & CardScheduleRow): CardRow {
		return {
			id: joined.id,
			note_path: joined.note_path,
			deck: joined.deck,
			card_type: joined.card_type,
			front: joined.front,
			back: joined.back,
			created_at: joined.created_at,
			updated_at: joined.updated_at,
			deleted_at: joined.deleted_at,
			type_in: joined.type_in ?? 0,
		};
	}
}
