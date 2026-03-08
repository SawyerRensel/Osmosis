import type { CardType } from "../database/types";

/** A generated card before it's inserted into the database. */
export interface GeneratedCard {
	/** Stable ID from <!--osmosis-id:xxx--> or newly generated. */
	id: string;
	card_type: CardType;
	front: string;
	back: string;
	/** Deck override from metadata, or empty string for default. */
	deck: string;
	/** Source line number (0-based) for ID injection back into markdown. */
	sourceLine: number;
}

/** Metadata parsed from explicit osmosis fence headers. */
export interface FenceMetadata {
	bidi: boolean;
	typeIn: boolean;
	deck: string;
	hint: string;
}
