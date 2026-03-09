/** Card types that Osmosis can generate from markdown. */
export type CardType =
	| "explicit"
	| "explicit_bidi"
	| "explicit_cloze";

/** FSRS card states. */
export type CardState = "new" | "learning" | "review" | "relearning";

/** Study modes for review tagging. */
export type StudyMode = "sequential" | "contextual" | "spatial";

/** A card with content and optional scheduling data. */
export interface Card {
	id: string;
	notePath: string;
	deck: string;
	cardType: CardType;
	front: string;
	back: string;
	typeIn: boolean;
	sourceLine: number;

	// Schedule fields (all optional — absent means new/unreviewed card)
	stability?: number;
	difficulty?: number;
	due?: number;        // epoch ms
	lastReview?: number; // epoch ms
	reps?: number;
	lapses?: number;
	state?: CardState;
}

/**
 * FSRS schedule data used internally by the scheduler.
 * Epoch-ms for timestamps. All fields required (new cards use defaults).
 */
export interface ScheduleData {
	stability: number;
	difficulty: number;
	due: number;           // epoch ms
	lastReview: number | null; // epoch ms, null = never reviewed
	reps: number;
	lapses: number;
	state: CardState;
}
