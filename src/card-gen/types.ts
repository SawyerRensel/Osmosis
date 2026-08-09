import type { CardOcclusion, CardState, CardType, OcclusionSet } from "../database/types";

/** A generated card parsed from an osmosis code fence. */
export interface GeneratedCard {
	/** Stable ID from fence id: metadata or newly generated. */
	id: string;
	card_type: CardType;
	front: string;
	back: string;
	/** Deck override from metadata, or empty string for default. */
	deck: string;
	/** Source line number (0-based) for ID injection back into markdown. */
	sourceLine: number;
	/** Whether this card requires typed answer input. */
	typeIn: boolean;
	/** Block ID for line cards (e.g. "os-a1b2c3"). */
	blockId?: string;
	/** Excluded from deck totals and sequential study (line-card opt-out). */
	excludeFromDecks?: boolean;
	/**
	 * Suspended: fully out of study, FSRS state preserved. Set by `exclude: true`
	 * in fence metadata. Line cards carry the same flag, but source it from
	 * osmosis-schedule frontmatter rather than from the markdown.
	 */
	disabled?: boolean;
	/**
	 * Line cards: contents of up to MAX_CONTEXT_LINES immediately preceding
	 * sibling lines (document order), shown as front context in sequential study.
	 */
	contextBefore?: string[];
	/** Occlusion cards: the image, its masks, and the group being asked. */
	occlusion?: CardOcclusion;
	/**
	 * Occluded *line* cards: the shape group this card asks about. Routes the
	 * card's schedule to a per-group entry nested under its block ID, since one
	 * block ID now backs several cards.
	 */
	occlusionGroup?: string;

	// Schedule data parsed from fence metadata (optional — absent means new card)
	stability?: number;
	difficulty?: number;
	due?: number;        // epoch ms (parsed from ISO string in fence)
	lastReview?: number; // epoch ms
	reps?: number;
	lapses?: number;
	state?: CardState;
	learningSteps?: number;
}

/** Metadata parsed from explicit osmosis fence headers. */
export interface FenceMetadata {
	id: string;
	exclude: boolean;
	bidi: boolean;
	typeIn: boolean;
	deck: string;
	hint: string;

	// Schedule fields for the base card
	stability?: number;
	difficulty?: number;
	due?: number;        // epoch ms
	lastReview?: number; // epoch ms
	reps?: number;
	lapses?: number;
	state?: CardState;
	learningSteps?: number;

	// Schedule fields for derived cards (bidi reverse, cloze deletions)
	// Keyed by suffix: "r" for reverse, "c1"/"c2"/etc. for cloze
	derivedSchedules?: Map<string, DerivedSchedule>;

	/**
	 * Shape sets declared by `occlude-<label>:` header blocks, keyed by the
	 * `{label}` that binds each to its image embed. The bare `occlude:` form
	 * uses the empty-string key.
	 */
	occlusions?: Map<string, OcclusionSet>;
}

/** Schedule data for a derived card (bidi reverse or cloze deletion). */
export interface DerivedSchedule {
	stability?: number;
	difficulty?: number;
	due?: number;
	lastReview?: number;
	reps?: number;
	lapses?: number;
	state?: CardState;
	learningSteps?: number;
}
