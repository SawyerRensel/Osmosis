import { describe, it, expect } from "vitest";
import {
	detectOrphanedCards,
	detectRestoredCards,
	applySessionQuotas,
} from "./orphans";
import type { Card } from "../database/types";
import type { GeneratedCard } from "./types";

function makeCard(id: string): Card {
	return {
		id,
		notePath: "test.md",
		deck: "",
		cardType: "explicit",
		front: "Front",
		back: "Back",
		typeIn: false,
		sourceLine: 0,
	};
}

function makeGenerated(id: string): GeneratedCard {
	return {
		id,
		card_type: "explicit",
		front: "Front",
		back: "Back",
		deck: "",
		sourceLine: 0,
		typeIn: false,
	};
}

describe("detectOrphanedCards", () => {
	it("detects cards no longer in source", () => {
		const existing = [makeCard("a"), makeCard("b"), makeCard("c")];
		const generated = [makeGenerated("a"), makeGenerated("c")];
		const orphans = detectOrphanedCards(existing, generated);
		expect(orphans).toEqual(["b"]);
	});

	it("returns empty when all cards match", () => {
		const existing = [makeCard("a"), makeCard("b")];
		const generated = [makeGenerated("a"), makeGenerated("b")];
		expect(detectOrphanedCards(existing, generated)).toHaveLength(0);
	});

	it("returns all cards when none match", () => {
		const existing = [makeCard("a"), makeCard("b")];
		const generated = [makeGenerated("x")];
		expect(detectOrphanedCards(existing, generated)).toEqual(["a", "b"]);
	});
});

describe("detectRestoredCards", () => {
	it("returns empty (no soft-delete in in-memory store)", () => {
		const allCards = [makeCard("a"), makeCard("b")];
		const generated = [makeGenerated("a"), makeGenerated("b")];
		const restored = detectRestoredCards(allCards, generated);
		expect(restored).toHaveLength(0);
	});
});

describe("applySessionQuotas", () => {
	const cards = [
		makeCard("a"),
		makeCard("b"),
		makeCard("c"),
		makeCard("d"),
		makeCard("e"),
	];

	it("limits new cards to daily quota", () => {
		const result = applySessionQuotas(cards, [], {
			newCardsToday: 3,
			reviewsToday: 0,
			dailyNewLimit: 5,
			dailyReviewLimit: 100,
		});
		expect(result.newCards).toHaveLength(2);
	});

	it("limits review cards to daily quota", () => {
		const result = applySessionQuotas([], cards, {
			newCardsToday: 0,
			reviewsToday: 97,
			dailyNewLimit: 20,
			dailyReviewLimit: 100,
		});
		expect(result.dueCards).toHaveLength(3);
	});

	it("returns zero when quota exhausted", () => {
		const result = applySessionQuotas(cards, cards, {
			newCardsToday: 20,
			reviewsToday: 200,
			dailyNewLimit: 20,
			dailyReviewLimit: 200,
		});
		expect(result.newCards).toHaveLength(0);
		expect(result.dueCards).toHaveLength(0);
	});

	it("unlimited when limit is 0", () => {
		const result = applySessionQuotas(cards, cards, {
			newCardsToday: 999,
			reviewsToday: 999,
			dailyNewLimit: 0,
			dailyReviewLimit: 0,
		});
		expect(result.newCards).toHaveLength(5);
		expect(result.dueCards).toHaveLength(5);
	});
});
