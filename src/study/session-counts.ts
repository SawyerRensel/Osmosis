/**
 * Anki-style new | learn | due counts for the flashcard study tab and note
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

/** A card rated into learning this session, waiting for `dueAt` to come back. */
export interface PendingStudyCard {
	studyCard: StudyCard;
	/** Epoch ms when the card is due again. */
	dueAt: number;
}

export interface SessionStatus {
	counts: SessionCounts;
	/** How far through the session the bar reads, 0–100. */
	percent: number;
}

/**
 * The study tab's progress bar and counts (T117).
 *
 * Progress is cards finished / (finished + cards left). A card is finished once
 * it has been answered (or excluded) and is not coming back this session; a card
 * rated into learning is still left until it graduates, so an Again never moves
 * the bar forward. The card on screen is left, so the first card reads 0%.
 *
 * With nothing left to show but learning cards on their timers (the waiting
 * screen), the counts match the Decks tab — only cards due by `now` — and the
 * bar reads full. A learning card that comes due counts again.
 */
export function sessionStatus(
	queue: readonly StudyCard[],
	currentIndex: number,
	deferred: readonly PendingStudyCard[],
	now: number,
): SessionStatus {
	const start = Math.max(0, currentIndex);
	const waiting = start >= queue.length;
	const left = waiting ? deferred.filter((d) => d.dueAt <= now) : deferred;
	const counts = countSession(queue, start, left.map((d) => d.studyCard));

	// Everything shown so far, by card: a card answered Again and then Good
	// sits in the queue twice but finishes once.
	const pendingIds = new Set<string>();
	for (let i = start; i < queue.length; i++) pendingIds.add(queue[i]!.card.id);
	for (const d of deferred) pendingIds.add(d.studyCard.card.id);
	const finishedIds = new Set<string>();
	for (let i = 0; i < start && i < queue.length; i++) {
		const id = queue[i]!.card.id;
		if (!pendingIds.has(id)) finishedIds.add(id);
	}

	const finished = finishedIds.size;
	const remaining = (queue.length - Math.min(start, queue.length)) + left.length;
	return { counts, percent: progressPercent(finished, remaining) };
}

/** T117's fill rule, shared by both studies: finished / (finished + left), full with nothing left. */
function progressPercent(finished: number, remaining: number): number {
	return remaining === 0 ? 100 : (finished / (finished + remaining)) * 100;
}

/**
 * Note study's progress bar and counts (T122), by the study tab's rule
 * (`sessionStatus`): the counts are `countNoteSession`'s, and the bar reads the
 * cards finished out of finished + the cards those counts still hold.
 *
 * A card rated Again is not finished — it sits in learn, as in the study tab —
 * so an Again never moves the bar forward. Note study does not ask it again,
 * though, so once every card has a rating there is nothing left to show and the
 * bar reads full, as the study tab's waiting screen does. A session with no
 * cards to count reads empty rather than full.
 */
export function noteSessionStatus(
	cards: readonly NoteSessionCard[],
	ratings: ReadonlyMap<string, FSRSRating>,
	answering: readonly string[],
): SessionStatus {
	const counts = countNoteSession(cards, ratings, answering);
	if (cards.length === 0) return { counts, percent: 0 };
	let finished = 0;
	let unrated = 0;
	for (const { id } of cards) {
		const rating = ratings.get(id);
		if (rating === undefined) unrated++;
		else if (rating !== 1) finished++;
	}
	const remaining = unrated === 0 ? 0 : counts.new + counts.learn + counts.due;
	return { counts, percent: progressPercent(finished, remaining) };
}
