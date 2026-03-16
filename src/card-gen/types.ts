import type { CardState, CardType } from "../database/types";

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
