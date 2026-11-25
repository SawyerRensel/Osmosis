import { describe, it, expect } from "vitest";
import type { Card, CardState } from "../database/types";
import type { StudyCard } from "./types";
import type { FSRSRating } from "../database/FSRSScheduler";
import {
	bucketOf, countNoteSession, countSession, noteSessionCard, noteSessionStatus, sessionStatus,
	type NoteSessionCard, type PendingStudyCard,
} from "./session-counts";
import { stepBackQueue } from "./undo-queue";

function mk(id: string, state?: CardState): StudyCard {
	const card: Card = {
		id,
		notePath: "tests/sailing.md",
		deck: "Sailing",
		cardType: "explicit",
		front: `Knot ${id}`,
		back: "Bowline",
		typeIn: false,
		sourceLine: 1,
	};
	if (!state) return { card, isNew: true };
	return { card: { ...card, state, due: 0 }, isNew: false };
}

/** The deferred copy a rating that lands in learning creates. */
const learningCopy = (sc: StudyCard): StudyCard => ({
	card: { ...sc.card, state: sc.isNew ? "learning" : "relearning", due: 1 },
	isNew: false,
});

const plain = (c: ReturnType<typeof countSession>) => [c.new, c.learn, c.due, c.current];

describe("bucketOf", () => {
	it("classifies new, learning, relearning and review cards", () => {
		expect(bucketOf(mk("a"))).toBe("new");
		expect(bucketOf(mk("b", "learning"))).toBe("learn");
		expect(bucketOf(mk("c", "relearning"))).toBe("learn");
		expect(bucketOf(mk("d", "review"))).toBe("due");
	});

	it("puts a scheduled card with no state in due, as the dashboard does", () => {
		const sc = mk("e", "review");
		delete sc.card.state;
		expect(bucketOf(sc)).toBe("due");
	});

	it("keeps a new card new even after the store gave it a schedule", () => {
		// The queue holds the store's card object, which a rating mutates.
		const sc = mk("f");
		sc.card.state = "learning";
		sc.card.due = 5;
		expect(bucketOf(sc)).toBe("new");
	});
});

describe("countSession", () => {
	const session = () => [mk("r1", "review"), mk("r2", "review"), mk("l1", "learning"), mk("n1"), mk("n2")];

	it("counts the card on screen in its own bucket at session start", () => {
		const queue = session();
		expect(plain(countSession(queue, 0, []))).toEqual([2, 1, 2, "due"]);
	});

	it("rating a card Good removes it from its bucket", () => {
		const queue = session();
		expect(plain(countSession(queue, 1, []))).toEqual([2, 1, 1, "due"]);
	});

	it("rating a new card Again moves it from new to learn", () => {
		const queue = session();
		const before = countSession(queue, 3, []);
		expect(plain(before)).toEqual([2, 0, 0, "new"]);
		const deferred = [learningCopy(queue[3]!)];
		expect(plain(countSession(queue, 4, deferred))).toEqual([1, 1, 0, "new"]);
	});

	it("rating a review card Again moves it from due to learn", () => {
		const queue = session();
		const deferred = [learningCopy(queue[0]!)];
		expect(plain(countSession(queue, 1, deferred))).toEqual([2, 2, 1, "due"]);
	});

	it("excluding a review card drops due by one, and undo restores it", () => {
		const queue = session();
		expect(plain(countSession(queue, 1, []))).toEqual([2, 1, 1, "due"]);
		const back = stepBackQueue({ queue, currentIndex: 1 });
		expect(plain(countSession(back.queue, back.currentIndex, []))).toEqual([2, 1, 2, "due"]);
	});

	it("undoing an Again on a new card puts it back in new", () => {
		const queue = session();
		const copy = learningCopy(queue[3]!);
		expect(plain(countSession(queue, 4, [copy]))).toEqual([1, 1, 0, "new"]);
		// Undo cancels the timer (copy leaves `deferred`) and steps back.
		const back = stepBackQueue({ queue, currentIndex: 4 }, copy);
		expect(plain(countSession(back.queue, back.currentIndex, []))).toEqual([2, 0, 0, "new"]);
	});

	it("undo after the deferred copy fired removes the copy from learn", () => {
		const queue = session();
		const copy = learningCopy(queue[3]!);
		// Timer fired while n2 was on screen: copy spliced in after it.
		const fired = [...queue.slice(0, 5), copy];
		expect(plain(countSession(fired, 4, []))).toEqual([1, 1, 0, "new"]);
		// Rate n2 Good, then undo twice (n2, then n1's Again).
		const once = stepBackQueue({ queue: fired, currentIndex: 5 });
		const twice = stepBackQueue(once, copy);
		expect(plain(countSession(twice.queue, twice.currentIndex, []))).toEqual([2, 0, 0, "new"]);
	});

	it("a deferred card's release leaves the counts unchanged", () => {
		const queue = session();
		const copy = learningCopy(queue[0]!);
		const waiting = countSession(queue, 2, [copy]);
		const released = [...queue.slice(0, 3), copy, ...queue.slice(3)];
		expect(plain(countSession(released, 2, []))).toEqual(plain(waiting));
	});

	it("waiting on a timer shows only the deferred cards, with nothing underlined", () => {
		const queue = session();
		const copy = learningCopy(queue[4]!);
		expect(plain(countSession(queue, 5, [copy]))).toEqual([0, 1, 0, null]);
	});

	it("is all zero with nothing underlined when the session is done", () => {
		expect(plain(countSession(session(), 5, []))).toEqual([0, 0, 0, null]);
		expect(plain(countSession([], 0, []))).toEqual([0, 0, 0, null]);
	});
});

describe("noteSessionCard", () => {
	it("buckets a stored card by its schedule, as the dashboard does", () => {
		expect(noteSessionCard(mk("a").card)).toEqual({ id: "a", bucket: "new" });
		expect(noteSessionCard(mk("b", "learning").card)).toEqual({ id: "b", bucket: "learn" });
		expect(noteSessionCard(mk("c", "review").card)).toEqual({ id: "c", bucket: "due" });
	});
});

describe("countNoteSession", () => {
	const cards: NoteSessionCard[] = [
		{ id: "tack", bucket: "new" },
		{ id: "jibe", bucket: "new" },
		{ id: "reef", bucket: "learn" },
		{ id: "heave", bucket: "due" },
	];
	const noteCounts = (c: ReturnType<typeof countNoteSession>) => [c.new, c.learn, c.due, c.current];

	it("counts every card before anything is rated", () => {
		expect(noteCounts(countNoteSession(cards, new Map(), []))).toEqual([2, 1, 1, null]);
	});

	it("takes a card out on Hard, Good or Easy", () => {
		const ratings = new Map<string, FSRSRating>([["tack", 3], ["reef", 2], ["heave", 4]]);
		expect(noteCounts(countNoteSession(cards, ratings, []))).toEqual([1, 0, 0, null]);
	});

	it("moves a card rated Again to learn", () => {
		const ratings = new Map<string, FSRSRating>([["tack", 1], ["heave", 1], ["reef", 1]]);
		expect(noteCounts(countNoteSession(cards, ratings, []))).toEqual([1, 3, 0, null]);
	});

	it("puts an undone card back in the bucket it started in", () => {
		const ratings = new Map<string, FSRSRating>([["heave", 1]]);
		expect(noteCounts(countNoteSession(cards, ratings, []))).toEqual([2, 2, 0, null]);
		ratings.delete("heave");
		expect(noteCounts(countNoteSession(cards, ratings, []))).toEqual([2, 1, 1, null]);
	});

	it("marks the bucket of the first unrated card being answered", () => {
		expect(countNoteSession(cards, new Map(), ["heave", "tack"]).current).toBe("due");
		const ratings = new Map<string, FSRSRating>([["heave", 3]]);
		expect(countNoteSession(cards, ratings, ["heave", "tack"]).current).toBe("new");
	});

	it("marks nothing for a card outside the session", () => {
		expect(countNoteSession(cards, new Map(), ["bowline"]).current).toBeNull();
	});
});

describe("noteSessionStatus (T122)", () => {
	const cards: NoteSessionCard[] = [
		{ id: "tack", bucket: "new" },
		{ id: "jibe", bucket: "new" },
		{ id: "reef", bucket: "learn" },
		{ id: "heave", bucket: "due" },
	];

	it("reads empty before anything is rated, with every card counted", () => {
		const { percent, counts } = noteSessionStatus(cards, new Map(), ["tack"]);
		expect(percent).toBe(0);
		expect([counts.new, counts.learn, counts.due, counts.current]).toEqual([2, 1, 1, "new"]);
	});

	it("moves a card's worth for each Hard, Good or Easy", () => {
		const ratings = new Map<string, FSRSRating>([["tack", 3]]);
		expect(noteSessionStatus(cards, ratings, []).percent).toBe(25);
		ratings.set("heave", 2);
		expect(noteSessionStatus(cards, ratings, []).percent).toBe(50);
	});

	it("does not move forward on Again: the card is still left, in learn", () => {
		const ratings = new Map<string, FSRSRating>([["tack", 3], ["jibe", 1]]);
		const { percent, counts } = noteSessionStatus(cards, ratings, []);
		expect(percent).toBe(25);
		expect([counts.new, counts.learn, counts.due]).toEqual([0, 2, 1]);
	});

	it("reads full once every card has a rating, Agains included", () => {
		const ratings = new Map<string, FSRSRating>([["tack", 3], ["jibe", 1], ["reef", 4], ["heave", 1]]);
		const { percent, counts } = noteSessionStatus(cards, ratings, []);
		expect(percent).toBe(100);
		expect(counts.learn).toBe(2);
	});

	it("moves back when a rating is undone", () => {
		const ratings = new Map<string, FSRSRating>([["tack", 3], ["reef", 3]]);
		expect(noteSessionStatus(cards, ratings, []).percent).toBe(50);
		ratings.delete("reef");
		expect(noteSessionStatus(cards, ratings, []).percent).toBe(25);
	});

	it("reads empty for a session with no cards to count", () => {
		expect(noteSessionStatus([], new Map(), []).percent).toBe(0);
	});
});

describe("sessionStatus (T117)", () => {
	const NOW = 1_000_000;
	const reviews = (n: number) => Array.from({ length: n }, (_, i) => mk(`r${i}`, "review"));
	const pending = (sc: StudyCard, dueAt: number): PendingStudyCard => ({ studyCard: learningCopy(sc), dueAt });

	it("steps 10% per card through ten due cards rated Good", () => {
		const queue = reviews(10);
		const percents = Array.from({ length: 11 }, (_, i) => sessionStatus(queue, i, [], NOW).percent);
		percents.forEach((pct, i) => expect(pct).toBeCloseTo(i * 10));
	});

	it("reads 0% on the first card, not 1/total", () => {
		expect(sessionStatus(reviews(3), 0, [], NOW).percent).toBe(0);
	});

	it("does not move the bar when a card is rated Again", () => {
		const queue = reviews(10);
		const before = sessionStatus(queue, 4, [], NOW).percent;
		// Card r4 rated Again: index advances, the card waits on its timer.
		const after = sessionStatus(queue, 5, [pending(queue[4]!, NOW + 60_000)], NOW).percent;
		expect(before).toBeCloseTo(40);
		expect(after).toBeCloseTo(40);
	});

	it("counts a card answered Again then Good as one finished card", () => {
		const queue = reviews(3);
		// r0 Again, r1 Good, r2 Good; r0's copy came back and was rated Good.
		queue.push(learningCopy(queue[0]!));
		expect(sessionStatus(queue, 3, [], NOW).percent).toBeCloseTo(2 / 3 * 100);
		expect(sessionStatus(queue, 4, [], NOW).percent).toBe(100);
	});

	it("keeps a pass of new cards at 0% while every one waits in learning", () => {
		// The diagnosed bug: the old (rated+1)/(rated+left) read 3/4 here.
		const queue = [mk("n1"), mk("n2"), mk("n3"), mk("n4")];
		const deferred = queue.slice(0, 2).map((sc) => pending(sc, NOW + 600_000));
		const { percent, counts } = sessionStatus(queue, 2, deferred, NOW);
		expect(percent).toBe(0);
		expect(plain(counts)).toEqual([2, 2, 0, "new"]);
	});

	it("matches the Decks tab while waiting: 0 0 0 and a full bar", () => {
		const queue = reviews(3);
		const deferred = queue.map((sc) => pending(sc, NOW + 60_000));
		const { percent, counts } = sessionStatus(queue, 3, deferred, NOW);
		expect(percent).toBe(100);
		expect(plain(counts)).toEqual([0, 0, 0, null]);
	});

	it("counts a waiting learning card again once it is due", () => {
		const queue = reviews(3);
		const deferred = [pending(queue[0]!, NOW - 1), pending(queue[1]!, NOW + 60_000)];
		const { percent, counts } = sessionStatus(queue, 3, deferred, NOW);
		expect(plain(counts)).toEqual([0, 1, 0, null]);
		// r2 finished; r0 due again; r1 not due yet, so neither finished nor left.
		expect(percent).toBeCloseTo(50);
	});

	it("brings a fired learning card back into the bar and the counts", () => {
		const queue = reviews(3);
		// r0 Again; r1, r2 Good; r0's timer fired and its copy is on screen.
		queue.push(learningCopy(queue[0]!));
		const { percent, counts } = sessionStatus(queue, 3, [], NOW);
		expect(plain(counts)).toEqual([0, 1, 0, "learn"]);
		expect(percent).toBeCloseTo(2 / 3 * 100);
	});

	it("reverts with the queue on undo, since it is derived from it", () => {
		const queue = reviews(4);
		const rated = sessionStatus(queue, 2, [], NOW).percent;
		const undone = stepBackQueue({ queue, currentIndex: 2 });
		expect(rated).toBeCloseTo(50);
		expect(sessionStatus(undone.queue, undone.currentIndex, [], NOW).percent).toBeCloseTo(25);
	});

	it("reads full with 0 0 0 when the session is complete", () => {
		const { percent, counts } = sessionStatus(reviews(2), 2, [], NOW);
		expect(percent).toBe(100);
		expect(plain(counts)).toEqual([0, 0, 0, null]);
	});
});
