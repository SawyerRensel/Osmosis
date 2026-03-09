import { describe, it, expect, beforeEach } from "vitest";
import { CardStore } from "./CardStore";
import type { Card } from "../database/types";

let store: CardStore;

function makeCard(overrides: Partial<Card> & { id: string }): Card {
	return {
		notePath: "test.md",
		deck: "",
		cardType: "explicit",
		front: "Front",
		back: "Back",
		typeIn: false,
		sourceLine: 0,
		...overrides,
	};
}

beforeEach(() => {
	store = new CardStore();
});

describe("CardStore", () => {
	describe("addCard / getCard", () => {
		it("adds and retrieves a card", () => {
			store.addCard(makeCard({ id: "a" }));
			expect(store.getCard("a")).toBeDefined();
			expect(store.getCard("a")!.id).toBe("a");
		});

		it("overwrites card with same id", () => {
			store.addCard(makeCard({ id: "a", front: "Old" }));
			store.addCard(makeCard({ id: "a", front: "New" }));
			expect(store.getCard("a")!.front).toBe("New");
			expect(store.size).toBe(1);
		});
	});

	describe("removeCard", () => {
		it("removes a card", () => {
			store.addCard(makeCard({ id: "a" }));
			store.removeCard("a");
			expect(store.getCard("a")).toBeUndefined();
			expect(store.size).toBe(0);
		});

		it("no-op for non-existent card", () => {
			store.removeCard("nonexistent");
			expect(store.size).toBe(0);
		});
	});

	describe("removeCardsByNote", () => {
		it("removes all cards for a note", () => {
			store.addCard(makeCard({ id: "a", notePath: "note1.md" }));
			store.addCard(makeCard({ id: "b", notePath: "note1.md" }));
			store.addCard(makeCard({ id: "c", notePath: "note2.md" }));

			store.removeCardsByNote("note1.md");
			expect(store.size).toBe(1);
			expect(store.getCard("c")).toBeDefined();
		});
	});

	describe("getCardsByNote", () => {
		it("returns cards for a specific note", () => {
			store.addCard(makeCard({ id: "a", notePath: "note1.md" }));
			store.addCard(makeCard({ id: "b", notePath: "note1.md" }));
			store.addCard(makeCard({ id: "c", notePath: "note2.md" }));

			const cards = store.getCardsByNote("note1.md");
			expect(cards).toHaveLength(2);
		});

		it("returns empty for unknown note", () => {
			expect(store.getCardsByNote("unknown.md")).toHaveLength(0);
		});
	});

	describe("getAllDecks", () => {
		it("returns distinct sorted decks", () => {
			store.addCard(makeCard({ id: "a", deck: "math" }));
			store.addCard(makeCard({ id: "b", deck: "science" }));
			store.addCard(makeCard({ id: "c", deck: "math" }));

			expect(store.getAllDecks()).toEqual(["math", "science"]);
		});
	});

	describe("getDueCards", () => {
		it("returns due cards sorted by due date", () => {
			const now = Date.now();
			store.addCard(makeCard({ id: "a", due: now - 2000, state: "review" }));
			store.addCard(makeCard({ id: "b", due: now - 1000, state: "review" }));
			store.addCard(makeCard({ id: "c", due: now + 1000, state: "review" })); // not yet

			const due = store.getDueCards(now);
			expect(due).toHaveLength(2);
			expect(due[0]!.id).toBe("a"); // older first
		});
	});

	describe("updateSchedule", () => {
		it("updates schedule fields on a card", () => {
			store.addCard(makeCard({ id: "a" }));
			store.updateSchedule("a", {
				stability: 5.0,
				difficulty: 3.0,
				due: 1000,
				lastReview: 500,
				reps: 2,
				lapses: 1,
				state: "review",
			});

			const card = store.getCard("a")!;
			expect(card.stability).toBe(5.0);
			expect(card.difficulty).toBe(3.0);
			expect(card.due).toBe(1000);
			expect(card.reps).toBe(2);
			expect(card.state).toBe("review");
		});
	});

	describe("clear", () => {
		it("removes all cards", () => {
			store.addCard(makeCard({ id: "a" }));
			store.addCard(makeCard({ id: "b" }));
			store.clear();
			expect(store.size).toBe(0);
		});
	});
});
