/** Card types that Osmosis can generate from markdown. */
export type CardType =
	| "heading"
	| "cloze_highlight"
	| "cloze_bold"
	| "explicit"
	| "explicit_bidi";

/** FSRS card states. */
export type CardState = "new" | "learning" | "review" | "relearning";

/** Study modes for review tagging. */
export type StudyMode = "sequential" | "contextual" | "spatial";

/** A row in the cards table. */
export interface CardRow {
	id: string;
	note_path: string;
	deck: string;
	card_type: CardType;
	front: string;
	back: string;
	created_at: number;
	updated_at: number;
	deleted_at: number | null;
	/** Whether this card uses type-in answer mode. 0 = false, 1 = true. */
	type_in: number;
}

/** A row in the card_schedule table. */
export interface CardScheduleRow {
	card_id: string;
	stability: number;
	difficulty: number;
	due: number;
	last_review: number | null;
	reps: number;
	lapses: number;
	state: CardState;
}

/** A row in the review_log table. */
export interface ReviewLogRow {
	id: number;
	card_id: string;
	rating: 1 | 2 | 3 | 4;
	study_mode: StudyMode;
	reviewed_at: number;
	elapsed_days: number;
	scheduled_days: number;
}
