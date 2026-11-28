// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import "../test/obsidian-stub";
import type { Card } from "../database/types";
import { previewCardId, renderRatingBar } from "./rating-bar";

const MIN = 60_000;
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 27, 12);
const PREVIEW = { 1: MIN, 2: 6 * MIN, 3: DAY, 4: 4 * DAY };

function card(id: string, due?: number): Card {
	return {
		id,
		notePath: "Sailing/Knots.md",
		deck: "Sailing",
		cardType: "explicit_cloze",
		front: "",
		back: "",
		typeIn: false,
		sourceLine: 0,
		due,
	};
}

describe("renderRatingBar", () => {
	it("draws the four buttons, each with its interval above its label", () => {
		const parent = document.createElement("div");
		const bar = renderRatingBar(parent, { onRate: () => undefined, intervals: PREVIEW });
		expect(parent.firstElementChild).toBe(bar.el);
		expect(bar.el.className).toBe("osmosis-rating");
		expect(bar.buttons.map((b) => b.className))
			.toEqual(["osmosis-rate-again", "osmosis-rate-hard", "osmosis-rate-good", "osmosis-rate-easy"]);
		expect(bar.buttons.map((b) => Array.from(b.children, (c) => c.className)))
			.toEqual(Array(4).fill(["osmosis-rate-interval", "osmosis-rate-label"]));
		expect(Array.from(bar.el.querySelectorAll(".osmosis-rate-interval"), (s) => s.textContent))
			.toEqual(["1m", "6m", "1d", "4d"]);
		expect(Array.from(bar.el.querySelectorAll(".osmosis-rate-label"), (s) => s.textContent))
			.toEqual(["Again", "Hard", "Good", "Easy"]);
		expect(bar.buttons[0]!.getAttribute("aria-label")).toBe("Again (1)");
	});

	it("adds the panel and the surface's classes", () => {
		const bar = renderRatingBar(document.createElement("div"), {
			onRate: () => undefined,
			panel: true,
			cls: "osmosis-line-rating",
		});
		expect(bar.el.className).toBe("osmosis-rating osmosis-rating-panel osmosis-line-rating");
	});

	it("rates without letting the click reach the surface under it", () => {
		const parent = document.createElement("div");
		const rated: number[] = [];
		let reachedParent = false;
		parent.addEventListener("click", () => (reachedParent = true));
		const bar = renderRatingBar(parent, { onRate: (r) => rated.push(r) });
		bar.buttons[2]!.click();
		bar.buttons[0]!.click();
		expect(rated).toEqual([3, 1]);
		expect(reachedParent).toBe(false);
	});

	it("fills the intervals later, and blanks them", () => {
		const bar = renderRatingBar(document.createElement("div"), { onRate: () => undefined });
		const labels = (): string[] => Array.from(bar.el.querySelectorAll(".osmosis-rate-interval"), (s) => s.textContent ?? "");
		expect(labels()).toEqual(["", "", "", ""]);
		bar.setIntervals(PREVIEW);
		expect(labels()).toEqual(["1m", "6m", "1d", "4d"]);
		bar.setIntervals(null);
		expect(labels()).toEqual(["", "", "", ""]);
	});
});

describe("previewCardId", () => {
	it("is the one card when there is one", () => {
		expect(previewCardId([card("a")], ["a"], NOW)).toBe("a");
	});

	it("picks the due card that has waited longest over a new one", () => {
		const cards = [card("c1"), card("c2", NOW - DAY), card("c3", NOW - 3 * DAY)];
		expect(previewCardId(cards, ["c1", "c2", "c3"], NOW)).toBe("c3");
	});

	it("picks the first new card, in the item's order, when nothing scheduled is due", () => {
		const cards = [card("c3"), card("c1", NOW + DAY), card("c2")];
		expect(previewCardId(cards, ["c1", "c2", "c3"], NOW)).toBe("c2");
	});

	it("falls back to the card due soonest when none is due or new", () => {
		const cards = [card("c1", NOW + 3 * DAY), card("c2", NOW + DAY)];
		expect(previewCardId(cards, ["c1", "c2"], NOW)).toBe("c2");
	});

	it("ignores cards outside the item, and is null when none of them is known", () => {
		const cards = [card("other", NOW - 9 * DAY), card("c1")];
		expect(previewCardId(cards, ["c1"], NOW)).toBe("c1");
		expect(previewCardId(cards, ["missing"], NOW)).toBeNull();
	});
});
