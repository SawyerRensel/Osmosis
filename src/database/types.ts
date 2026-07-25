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
	/**
	 * Disabled (line-card "exclude"): fully out of study — not hidden by peek
	 * or study in either surface, skipped by the sequential queue, and dropped
	 * from dashboard counts. FSRS schedule is preserved so enabling restores
	 * history. Stored as `disabled: true` on the card's osmosis-schedule entry.
	 */
	disabled?: boolean;
	/**
	 * Line cards: contents of the immediately preceding sibling lines
	 * (document order), rendered as front context in sequential study.
	 */
	contextBefore?: string[];

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
