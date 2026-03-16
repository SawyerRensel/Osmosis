import {
	fsrs,
	createEmptyCard,
	State,
	type FSRS,
	type Card as TsFsrsCard,
	type Grade,
	type RecordLogItem,
	type StepUnit,
} from "ts-fsrs";
import type { CardState, ScheduleData } from "./types";

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
	schedule: ScheduleData;
}

/**
 * Wraps ts-fsrs to provide schedule computations for Osmosis cards.
 * Converts between our epoch-ms / string-state types and ts-fsrs Date / enum types.
 */
export class FSRSScheduler {
	private readonly f: FSRS;

	constructor(params?: {
		requestRetention?: number;
		maximumInterval?: number;
		learningSteps?: string;
		relearningSteps?: string;
	}) {
		this.f = fsrs({
			enable_fuzz: false,
			enable_short_term: true,
			request_retention: params?.requestRetention ?? 0.9,
			maximum_interval: params?.maximumInterval ?? 36500,
			learning_steps: parseSteps(params?.learningSteps ?? "1m, 10m"),
			relearning_steps: parseSteps(params?.relearningSteps ?? "10m"),
		});
	}

	/**
	 * Create a default schedule for a new card (never reviewed).
	 */
	createNewSchedule(now?: number): ScheduleData {
		const ts = now ?? Date.now();
		return {
			stability: 0,
			difficulty: 0,
			due: ts,
			lastReview: null,
			reps: 0,
			lapses: 0,
			state: "new",
			learningSteps: 0,
		};
	}

	/**
	 * Process a review rating and return the updated schedule.
	 */
	review(
		currentSchedule: ScheduleData,
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

		const newSchedule: ScheduleData = {
			stability: newCard.stability,
			difficulty: newCard.difficulty,
			due: newCard.due.getTime(),
			lastReview: newCard.last_review?.getTime() ?? reviewTime,
			reps: newCard.reps,
			lapses: newCard.lapses,
			state: FSRS_TO_STATE[newCard.state],
			learningSteps: newCard.learning_steps,
		};

		return { schedule: newSchedule };
	}

	/**
	 * Convert our ScheduleData (epoch-ms, string state) to a ts-fsrs Card (Date, enum state).
	 */
	private scheduleToFSRSCard(schedule: ScheduleData): TsFsrsCard {
		if (schedule.state === "new" && schedule.reps === 0) {
			return createEmptyCard(new Date(schedule.due));
		}

		const lastReview = schedule.lastReview
			? new Date(schedule.lastReview)
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
			learning_steps: schedule.learningSteps,
			reps: schedule.reps,
			lapses: schedule.lapses,
			state: STATE_TO_FSRS[schedule.state],
			last_review: lastReview,
		};
	}
}

/**
 * Parse a comma-separated step string (e.g., "1m, 10m") into ts-fsrs StepUnit[].
 * Valid units: m (minutes), h (hours), d (days).
 */
export function parseSteps(input: string): StepUnit[] {
	const STEP_REGEX = /^\d+[mhd]$/;
	return input
		.split(",")
		.map((s) => s.trim())
		.filter((s) => STEP_REGEX.test(s)) as StepUnit[];
}
