/**
 * Anki-style new | learn | due counts for the sequential study tab and note
 * study, kept out of `src/views/` so they can be unit-tested without Obsidian.
 *
 * Buckets match the dashboard's deck counts (`CardStore.getCardCountsByDeck`):
 * a card with no schedule is new, a scheduled card in learning or relearning
 * is learn, any other scheduled card is due.
 */

import type { Card } from "../database/types";
import type { FSRSRating } from "../database/FSRSScheduler";
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

/** A card a note study session asks, with the bucket it was in when study started. */
export interface NoteSessionCard {
	id: string;
	bucket: CountBucket;
}

/**
 * The bucket a stored card starts a note study session in. Same rule as the
 * dashboard (`CardStore.getCardCountsByDeck`): no schedule is new.
 */
export function noteSessionCard(card: Card): NoteSessionCard {
	return { id: card.id, bucket: bucketOf({ card, isNew: card.due === undefined }) };
}

/**
 * Note study's new | learn | due counts (T102): each card not yet rated this
 * session, in the bucket it started in, plus each card rated Again, which moves
 * to learn as it does in the study tab. Any other rating takes a card out.
 *
 * `answering` is the cards whose rating is on screen — a line can carry several,
 * all rated at once — and the first of them still unrated sets `current`.
 */
export function countNoteSession(
	cards: readonly NoteSessionCard[],
	ratings: ReadonlyMap<string, FSRSRating>,
	answering: readonly string[],
): SessionCounts {
	const counts: SessionCounts = { new: 0, learn: 0, due: 0, current: null };
	for (const { id, bucket } of cards) {
		const rating = ratings.get(id);
		if (rating === undefined) counts[bucket]++;
		else if (rating === 1) counts.learn++;
	}
	for (const id of answering) {
		const card = cards.find((c) => c.id === id);
		if (card && !ratings.has(id)) {
			counts.current = card.bucket;
			break;
		}
	}
	return counts;
}
