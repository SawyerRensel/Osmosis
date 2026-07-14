/** Card types that Osmosis can generate from markdown. */
export type CardType =
	| "explicit"
	| "explicit_bidi"
	| "explicit_cloze"
	| "code_cloze"
	| "line";

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
	/** Block ID for line cards (e.g. "os-a1b2c3") — routes schedule writes to frontmatter. */
	blockId?: string;
	/**
	 * Excluded from deck totals and the sequential study queue (line-card
	 * opt-out). The card stays in the store for in-place study modes.
	 */
	excludeFromDecks?: boolean;

	// Schedule fields (all optional — absent means new/unreviewed card)
	stability?: number;
	difficulty?: number;
	due?: number;        // epoch ms
	lastReview?: number; // epoch ms
	reps?: number;
	lapses?: number;
	state?: CardState;
	learningSteps?: number; // current learning step index (0-based)
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
	learningSteps: number; // current learning step index (0-based)
}
