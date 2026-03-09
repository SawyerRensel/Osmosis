import type { CardRow, CardScheduleRow, StudyMode } from "../database/types";

/** A card ready for study, combining card content with schedule data. */
export interface StudyCard {
	card: CardRow;
	schedule: CardScheduleRow | null; // null = new card (never reviewed)
}

/** Deck scoping for study sessions. */
export type DeckScope =
	| { type: "single"; deck: string }
	| { type: "parent"; deck: string } // deck + all sub-decks
	| { type: "all" };

/** A node in the hierarchical deck tree. */
export interface DeckNode {
	/** Leaf name (e.g., "functions"). */
	name: string;
	/** Full deck path (e.g., "python/functions"). */
	fullPath: string;
	newCount: number;
	learnCount: number;
	dueCount: number;
	children: DeckNode[];
}

/** Counts for a deck scope. */
export interface DeckCounts {
	new: number;
	learn: number;
	due: number;
}

/** Active study session state. */
export interface StudySessionState {
	mode: StudyMode;
	scope: DeckScope;
	queue: StudyCard[];
	currentIndex: number;
	reviewed: number;
	total: number;
}
