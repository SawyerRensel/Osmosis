import type { CardType } from "../database/types";

/** A generated card before it's inserted into the database. */
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
}

/** Metadata parsed from explicit osmosis fence headers. */
export interface FenceMetadata {
	id: string;
	exclude: boolean;
	bidi: boolean;
	typeIn: boolean;
	deck: string;
	hint: string;
}
