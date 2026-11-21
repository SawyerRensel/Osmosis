import type { Card, StudyMode } from "../database/types";

/** A card ready for study. */
export interface StudyCard {
	card: Card;
	/** True if this card has never been reviewed (no schedule data). */
	isNew: boolean;
}

/** Deck scoping for study sessions. */
export type DeckScope =
	| { type: "single"; deck: string }
	| { type: "parent"; deck: string } // deck + all sub-decks
	| { type: "all" };

/**
 * What a flashcard study session covers: a deck scope, or the cards of one
 * note. Kept apart from `DeckScope` because stats, the dashboard and the deck
 * pickers only ever deal in decks and need no case for a note.
 */
export type StudyScope = DeckScope | { type: "note"; notePath: string };

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
