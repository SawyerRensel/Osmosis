import {
	fsrs,
	createEmptyCard,
	State,
	type FSRS,
	type Card as TsFsrsCard,
	type Grade,
	type RecordLogItem,
} from "ts-fsrs";
import type { CardScheduleRow, CardState } from "./types";

/** Maps our string-based state to ts-fsrs State enum. */
const STATE_TO_FSRS: Record<CardState, State> = {
	new: State.New,
	learning: State.Learning,
	review: State.Review,
	relearning: State.Relearning,
};

/** Maps ts-fsrs State enum to our string-based state. */
const FSRS_TO_STATE: Record<State, CardState> = {
	[State.New]: "new",
	[State.Learning]: "learning",
	[State.Review]: "review",
	[State.Relearning]: "relearning",
};

/** FSRS ratings: 1=Again, 2=Hard, 3=Good, 4=Easy */
export type FSRSRating = 1 | 2 | 3 | 4;

/** Result of processing a review through FSRS. */
export interface ScheduleUpdate {
	schedule: CardScheduleRow;
	reviewLog: {
		rating: FSRSRating;
		reviewed_at: number;
		elapsed_days: number;
		scheduled_days: number;
	};
}

/**
 * Wraps ts-fsrs to provide schedule computations for Osmosis cards.
 * Converts between our epoch-ms / string-state types and ts-fsrs Date / enum types.
 */
export class FSRSScheduler {
	private readonly f: FSRS;

	constructor(params?: { requestRetention?: number; maximumInterval?: number }) {
		this.f = fsrs({
			enable_fuzz: false,
			enable_short_term: true,
			request_retention: params?.requestRetention ?? 0.9,
			maximum_interval: params?.maximumInterval ?? 36500,
		});
	}

	/**
	 * Create a default schedule for a new card (never reviewed).
	 */
	createNewSchedule(cardId: string, now?: number): CardScheduleRow {
		const ts = now ?? Date.now();
		return {
			card_id: cardId,
			stability: 0,
			difficulty: 0,
			due: ts,
			last_review: null,
			reps: 0,
			lapses: 0,
			state: "new",
		};
	}

	/**
	 * Process a review rating and return the updated schedule + review log data.
	 * This is the core function: rating → new schedule.
	 */
	review(
		currentSchedule: CardScheduleRow,
		rating: FSRSRating,
		now?: number,
	): ScheduleUpdate {
		const reviewTime = now ?? Date.now();
		const nowDate = new Date(reviewTime);

		// Convert our schedule to a ts-fsrs Card
		const fsrsCard: TsFsrsCard = this.scheduleToFSRSCard(currentSchedule);

		// Compute next state
		const result: RecordLogItem = this.f.next(
			fsrsCard,
			nowDate,
			rating as Grade,
		);

		const newCard = result.card;

		const newSchedule: CardScheduleRow = {
			card_id: currentSchedule.card_id,
			stability: newCard.stability,
			difficulty: newCard.difficulty,
			due: newCard.due.getTime(),
			last_review: newCard.last_review?.getTime() ?? reviewTime,
			reps: newCard.reps,
			lapses: newCard.lapses,
			state: FSRS_TO_STATE[newCard.state],
		};

		// Compute elapsed_days ourselves since the log field is deprecated
		const elapsedMs = currentSchedule.last_review
			? reviewTime - currentSchedule.last_review
			: 0;
		const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);

		const reviewLog = {
			rating: rating,
			reviewed_at: reviewTime,
			elapsed_days: elapsedDays,
			scheduled_days: result.log.scheduled_days,
		};

		return { schedule: newSchedule, reviewLog };
	}

	/**
	 * Convert our CardScheduleRow (epoch-ms, string state) to a ts-fsrs Card (Date, enum state).
	 */
	private scheduleToFSRSCard(schedule: CardScheduleRow): TsFsrsCard {
		if (schedule.state === "new" && schedule.reps === 0) {
			return createEmptyCard(new Date(schedule.due));
		}

		const lastReview = schedule.last_review
			? new Date(schedule.last_review)
			: undefined;
		const dueDate = new Date(schedule.due);
		const elapsedDays = lastReview
			? Math.max(0, (dueDate.getTime() - lastReview.getTime()) / (1000 * 60 * 60 * 24))
			: 0;

		return {
			due: dueDate,
			stability: schedule.stability,
			difficulty: schedule.difficulty,
			elapsed_days: elapsedDays,
			scheduled_days: 0,
			learning_steps: 0,
			reps: schedule.reps,
			lapses: schedule.lapses,
			state: STATE_TO_FSRS[schedule.state],
			last_review: lastReview,
		};
	}
}
