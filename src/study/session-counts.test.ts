import { describe, it, expect } from "vitest";
import type { Card, CardState } from "../database/types";
import type { StudyCard } from "./types";
import type { FSRSRating } from "../database/FSRSScheduler";
import { bucketOf, countNoteSession, countSession, noteSessionCard, type NoteSessionCard } from "./session-counts";
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
