import { describe, it, expect } from "vitest";
import { CardStore } from "../store/CardStore";
import { FSRSScheduler } from "../database/FSRSScheduler";
import { StudySessionManager } from "./StudySessionManager";
import { decksOfNote, dueCardsInNote, newCardsInNote } from "./note-scope";
import type { Card } from "../database/types";
import type { FenceWriter } from "../store/FenceWriter";

const NOW = Date.parse("2026-11-12T12:00:00Z");
const DAY = 86_400_000;

function makeCard(overrides: Partial<Card> & { id: string }): Card {
	return {
		notePath: "brewing.md",
		deck: "coffee",
		cardType: "explicit",
		front: "Front",
		back: "Back",
		typeIn: false,
		sourceLine: 0,
		...overrides,
	};
}

describe("note scope helpers", () => {
	const cards: Card[] = [
		makeCard({ id: "new1" }),
		makeCard({ id: "due-old", due: NOW - 3 * DAY, deck: "tea" }),
		makeCard({ id: "due-new", due: NOW - DAY }),
		makeCard({ id: "future", due: NOW + DAY }),
		makeCard({ id: "off", excludeFromDecks: true, deck: "hidden" }),
		makeCard({ id: "disabled", disabled: true, deck: "hidden" }),
	];

	it("returns due cards oldest first, leaving out future and excluded ones", () => {
		expect(dueCardsInNote(cards, NOW).map((c) => c.id)).toEqual(["due-old", "due-new"]);
	});

	it("returns only never-reviewed, studyable cards as new", () => {
		expect(newCardsInNote(cards).map((c) => c.id)).toEqual(["new1"]);
	});

	it("lists decks de-duplicated and sorted, without excluded cards' decks", () => {
		expect(decksOfNote(cards)).toEqual(["coffee", "tea"]);
	});

	it("lists no decks for a note without cards", () => {
		expect(decksOfNote([])).toEqual([]);
	});
});

describe("StudySessionManager with a note scope", () => {
	function setup(): StudySessionManager {
		const store = new CardStore();
		store.addCard(makeCard({ id: "a-new" }));
		store.addCard(makeCard({ id: "a-due", due: NOW - DAY, deck: "tea" }));
		store.addCard(makeCard({ id: "b-new", notePath: "other.md" }));
		store.addCard(makeCard({ id: "b-due", notePath: "other.md", due: NOW - DAY }));
		return new StudySessionManager(
			store,
			new FSRSScheduler(),
			{} as unknown as FenceWriter,
			() => null,
			"sequential",
		);
	}

	it("queues only the note's due then new cards", () => {
		const queue = setup().buildQueue({ type: "note", notePath: "brewing.md" }, undefined, NOW);
		expect(queue.map((q) => q.card.id)).toEqual(["a-due", "a-new"]);
	});

	it("counts only the note's cards", () => {
		const counts = setup().getCounts({ type: "note", notePath: "brewing.md" }, NOW);
		expect(counts).toEqual({ new: 1, learn: 0, due: 1 });
	});
});
