/**
 * Anki-style new | learn | due counts for the sequential study tab, kept out
 * of `src/views/` so they can be unit-tested without Obsidian.
 *
 * Buckets match the dashboard's deck counts (`CardStore.getCardCountsByDeck`):
 * a card with no schedule is new, a scheduled card in learning or relearning
 * is learn, any other scheduled card is due.
 */

import type { DeckCounts, StudyCard } from "./types";

export type CountBucket = keyof DeckCounts;

/** Which count a card belongs to. */
export function bucketOf(studyCard: StudyCard): CountBucket {
	if (studyCard.isNew) return "new";
	const state = studyCard.card.state;
	return state === "learning" || state === "relearning" ? "learn" : "due";
}

export interface SessionCounts extends DeckCounts {
	/** The bucket of the card on screen, or null when none is (waiting, done). */
	current: CountBucket | null;
}

/**
 * What is still to come in a session: the card on screen (`queue[currentIndex]`,
 * which counts in its own bucket, as in Anki), every card after it, and the
 * learning cards waiting on their timers.
 */
export function countSession(
	queue: readonly StudyCard[],
	currentIndex: number,
	deferred: readonly StudyCard[],
): SessionCounts {
	const counts: SessionCounts = { new: 0, learn: 0, due: 0, current: null };
	for (let i = Math.max(0, currentIndex); i < queue.length; i++) {
		counts[bucketOf(queue[i]!)]++;
	}
	for (const studyCard of deferred) counts[bucketOf(studyCard)]++;
	const onScreen = queue[currentIndex];
	if (onScreen) counts.current = bucketOf(onScreen);
	return counts;
}
