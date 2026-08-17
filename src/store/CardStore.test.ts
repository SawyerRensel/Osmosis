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
				learningSteps: 0,
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

	describe("deck exclusion (line-card opt-out)", () => {
		beforeEach(() => {
			store.addCard(makeCard({ id: "in-new", deck: "bio" }));
			store.addCard(makeCard({ id: "in-due", deck: "bio", due: 500, state: "review" }));
			store.addCard(makeCard({
				id: "out-new", deck: "bio", cardType: "line", excludeFromDecks: true,
			}));
			store.addCard(makeCard({
				id: "out-due", deck: "bio", cardType: "line", due: 500, state: "review", excludeFromDecks: true,
			}));
		});

		it("filters excluded cards from deck queries", () => {
			expect(store.getNewCards("bio").map((c) => c.id)).toEqual(["in-new"]);
			expect(store.getDueCards(1000, "bio").map((c) => c.id)).toEqual(["in-due"]);
			expect(store.getNewCardsByDeckPrefix("bio").map((c) => c.id)).toEqual(["in-new"]);
			expect(store.getDueCardsByDeckPrefix(1000, "bio").map((c) => c.id)).toEqual(["in-due"]);
		});

		it("filters excluded cards from deck counts", () => {
			const counts = store.getCardCountsByDeck(1000);
			expect(counts.get("bio")).toEqual({ new: 1, learn: 0, due: 1 });
		});

		it("keeps excluded cards reachable for in-place study", () => {
			expect(store.getCard("out-due")).toBeDefined();
			expect(store.getCardsByNote("test.md").map((c) => c.id).sort()).toEqual(
				["in-due", "in-new", "out-due", "out-new"],
			);
			expect(store.getAllCards()).toHaveLength(4);
		});

		it("a deck with only excluded cards does not appear in getAllDecks", () => {
			store.clear();
			store.addCard(makeCard({
				id: "x", deck: "hidden", cardType: "line", excludeFromDecks: true,
			}));
			expect(store.getAllDecks()).toEqual([]);
		});
	});

	/**
	 * Suspended cards are held but never studied. The card browser leans on
	 * exactly this split — it lists them so they can be unsuspended, while every
	 * count and queue behaves as though they were not there.
	 */
	describe("suspended (disabled) cards", () => {
		const NOW = 1_000_000;

		beforeEach(() => {
			store.addCard(makeCard({ id: "live-new", deck: "geography" }));
			store.addCard(makeCard({
				id: "live-due", deck: "geography", due: NOW - 1, state: "review",
			}));
			store.addCard(makeCard({ id: "off-new", deck: "architecture", disabled: true }));
			store.addCard(makeCard({
				id: "off-due", deck: "architecture", due: NOW - 1, state: "review", disabled: true,
			}));
		});

		it("keeps them in getAllCards, which is what the browser lists", () => {
			expect(store.getAllCards()).toHaveLength(4);
			expect(store.getCard("off-due")).toBeDefined();
			expect(store.getCardsByNote("test.md")).toHaveLength(4);
		});

		it("drops them from the study queues", () => {
			expect(store.getDueCards(NOW).map((c) => c.id)).toEqual(["live-due"]);
			expect(store.getNewCards().map((c) => c.id)).toEqual(["live-new"]);
			expect(store.getDueCardsByDeckPrefix(NOW, "architecture")).toEqual([]);
			expect(store.getNewCardsByDeckPrefix("architecture")).toEqual([]);
		});

		it("drops them from deck counts and deck lists", () => {
			const counts = store.getCardCountsByDeck(NOW);
			expect(counts.get("geography")).toEqual({ new: 1, learn: 0, due: 1 });
			expect(counts.has("architecture")).toBe(false);
			expect(store.getAllDecks()).toEqual(["geography"]);
		});

		it("restores a card to every queue when unsuspended", () => {
			store.setDisabled("off-due", false);
			expect(store.getDueCards(NOW).map((c) => c.id).sort()).toEqual(["live-due", "off-due"]);
			expect(store.getAllDecks()).toEqual(["architecture", "geography"]);
		});

		it("preserves FSRS state across a suspend and unsuspend", () => {
			store.updateSchedule("live-due", {
				stability: 12, difficulty: 5, due: NOW + 500,
				lastReview: NOW, reps: 4, lapses: 1, state: "review", learningSteps: 0,
			});
			store.setDisabled("live-due", true);
			store.setDisabled("live-due", false);

			expect(store.getCard("live-due")).toMatchObject({
				stability: 12, difficulty: 5, reps: 4, lapses: 1, state: "review",
			});
		});
	});
});
