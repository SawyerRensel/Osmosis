import { describe, it, expect } from "vitest";
import { isBuried, nextDayStart } from "./bury";
import { CardStore } from "../store/CardStore";
import { applyScheduleEntries, parseBuriedFrontmatter, parseScheduleFrontmatter, SCHEDULE_FRONTMATTER_KEY } from "../store/ScheduleStore";
import { updateFenceBuried, updateFenceSchedule, removeFenceSchedule, type ScheduleFields } from "../store/FenceWriter";
import { generateExplicitCards } from "../card-gen/explicit";
import { dueCardsInNote, newCardsInNote } from "./note-scope";
import { dueOrNewLineCardBlockIds } from "./mindmap-study";
import type { Card, ScheduleData } from "../database/types";

const NOW = new Date(2026, 10, 24, 15, 30).getTime();
const TOMORROW = new Date(2026, 10, 25).getTime();

function makeCard(overrides: Partial<Card> & { id: string }): Card {
	return {
		notePath: "sailing.md",
		deck: "Sailing",
		cardType: "explicit",
		front: "Front",
		back: "Back",
		typeIn: false,
		sourceLine: 0,
		...overrides,
	};
}

const schedule: ScheduleData = {
	stability: 3,
	difficulty: 5,
	due: NOW - 86_400_000,
	lastReview: NOW - 4 * 86_400_000,
	reps: 2,
	lapses: 0,
	state: "review",
	learningSteps: 0,
};

const fenceSchedule: ScheduleFields = { ...schedule, lastReview: schedule.lastReview! };

describe("nextDayStart", () => {
	it("is the next local midnight", () => {
		expect(nextDayStart(NOW)).toBe(TOMORROW);
	});

	it("moves a full day forward from midnight itself", () => {
		expect(nextDayStart(TOMORROW)).toBe(new Date(2026, 10, 26).getTime());
	});

	it("rolls over a month end", () => {
		expect(nextDayStart(new Date(2026, 10, 30, 23, 59).getTime())).toBe(new Date(2026, 11, 1).getTime());
	});
});

describe("isBuried", () => {
	it("is true only before the bury ends", () => {
		expect(isBuried({ buriedUntil: TOMORROW }, NOW)).toBe(true);
		expect(isBuried({ buriedUntil: TOMORROW }, TOMORROW)).toBe(false);
		expect(isBuried({}, NOW)).toBe(false);
	});
});

describe("CardStore with buried cards", () => {
	function storeWith(...cards: Card[]): CardStore {
		const store = new CardStore();
		for (const card of cards) store.addCard(card);
		return store;
	}

	it("leaves a buried card out of due, new and counts, but keeps its deck", () => {
		const store = storeWith(
			makeCard({ id: "due", due: NOW - 1000, state: "review", buriedUntil: TOMORROW }),
			makeCard({ id: "new", buriedUntil: TOMORROW }),
		);
		expect(store.getDueCards(NOW)).toEqual([]);
		expect(store.getDueCardsByDeckPrefix(NOW, "Sailing")).toEqual([]);
		expect(store.getNewCards(undefined, NOW)).toEqual([]);
		expect(store.getNewCardsByDeckPrefix("Sailing", NOW)).toEqual([]);
		expect(store.getCardCountsByDeck(NOW).get("Sailing")).toEqual({ new: 0, learn: 0, due: 0 });
		expect(store.getAllDecks()).toEqual(["Sailing"]);
	});

	it("returns a card whose bury has ended", () => {
		const store = storeWith(makeCard({ id: "new", buriedUntil: TOMORROW }));
		expect(store.getNewCards(undefined, TOMORROW).map((c) => c.id)).toEqual(["new"]);
	});

	it("setBuried buries and un-buries; a schedule write drops the bury", () => {
		const store = storeWith(makeCard({ id: "c", due: NOW - 1000, state: "review" }));
		store.setBuried("c", TOMORROW);
		expect(store.getDueCards(NOW)).toEqual([]);
		store.setBuried("c", null);
		expect(store.getDueCards(NOW)).toHaveLength(1);

		store.setBuried("c", TOMORROW);
		store.updateSchedule("c", { ...schedule, lastReview: NOW });
		expect(store.getCard("c")?.buriedUntil).toBeUndefined();
	});
});

describe("other study surfaces skip buried cards", () => {
	it("note scope", () => {
		const cards = [
			makeCard({ id: "due", due: NOW - 1000, buriedUntil: TOMORROW }),
			makeCard({ id: "new", buriedUntil: TOMORROW }),
		];
		expect(dueCardsInNote(cards, NOW)).toEqual([]);
		expect(newCardsInNote(cards, NOW)).toEqual([]);
		expect(newCardsInNote(cards, TOMORROW)).toHaveLength(1);
	});

	it("mind map study", () => {
		const cards = [makeCard({ id: "sailing.md#^os-sail01", blockId: "os-sail01", cardType: "line", buriedUntil: TOMORROW })];
		expect(dueOrNewLineCardBlockIds(cards, NOW).size).toBe(0);
		expect(dueOrNewLineCardBlockIds(cards, TOMORROW).size).toBe(1);
	});
});

describe("osmosis-schedule buriedUntil", () => {
	it("round-trips on a scheduled card without touching its schedule", () => {
		const fm: Record<string, unknown> = {};
		applyScheduleEntries(fm, new Map([["os-sail01", schedule]]), new Map());
		applyScheduleEntries(fm, new Map(), new Map(), undefined, new Map([["os-sail01", TOMORROW]]));

		const raw = fm[SCHEDULE_FRONTMATTER_KEY];
		expect(parseBuriedFrontmatter(raw).get("os-sail01")).toBe(TOMORROW);
		expect(parseScheduleFrontmatter(raw).get("os-sail01")?.due).toBe(schedule.due);
	});

	it("stores a new card's bury as a schedule-less stub, and un-burying removes it", () => {
		const fm: Record<string, unknown> = {};
		applyScheduleEntries(fm, new Map(), new Map(), undefined, new Map([["os-sail02", TOMORROW]]));
		const raw = fm[SCHEDULE_FRONTMATTER_KEY];
		expect(parseBuriedFrontmatter(raw).get("os-sail02")).toBe(TOMORROW);
		expect(parseScheduleFrontmatter(raw).size).toBe(0);

		applyScheduleEntries(fm, new Map(), new Map(), undefined, new Map([["os-sail02", null]]));
		expect(fm[SCHEDULE_FRONTMATTER_KEY]).toBeUndefined();
	});

	it("nests an occluded group's bury under its group", () => {
		const fm: Record<string, unknown> = {
			[SCHEDULE_FRONTMATTER_KEY]: { "os-dock01": { occlude: { shapes: [] }, c2: {} } },
		};
		applyScheduleEntries(fm, new Map(), new Map(), undefined, new Map([["os-dock01/c2", TOMORROW]]));
		expect(parseBuriedFrontmatter(fm[SCHEDULE_FRONTMATTER_KEY]).get("os-dock01/c2")).toBe(TOMORROW);
	});

	it("is dropped by a schedule write, unless a bury is staged with it", () => {
		const fm: Record<string, unknown> = {};
		applyScheduleEntries(fm, new Map(), new Map(), undefined, new Map([["a", TOMORROW], ["b", TOMORROW]]));
		applyScheduleEntries(fm, new Map([["a", schedule], ["b", schedule]]), new Map(), undefined, new Map([["b", TOMORROW]]));
		const buried = parseBuriedFrontmatter(fm[SCHEDULE_FRONTMATTER_KEY]);
		expect(buried.has("a")).toBe(false);
		expect(buried.get("b")).toBe(TOMORROW);
	});
});

describe("fence buriedUntil", () => {
	const basic = [
		"```osmosis",
		"id: knot0001",
		"bidi: true",
		"due: 2026-11-20T00:00:00.000Z",
		"stability: 3.0000",
		"state: review",
		"",
		"Bowline",
		"***",
		"A fixed loop",
		"```",
	].join("\n");

	const until = TOMORROW;

	it("round-trips flat for the fence's own card, schedule intact", () => {
		const written = updateFenceBuried(basic, "knot0001", until);
		const [own, reverse] = generateExplicitCards(written);
		expect(own?.buriedUntil).toBe(until);
		expect(own?.due).toBe(Date.parse("2026-11-20T00:00:00.000Z"));
		expect(own?.front).toBe("Bowline");
		expect(reverse?.buriedUntil).toBeUndefined();

		expect(updateFenceBuried(written, "knot0001", null)).toBe(basic);
	});

	it("creates a derived card's block holding only the bury, and removes it again", () => {
		const written = updateFenceBuried(basic, "knot0001-r", until);
		expect(written).toContain("r:\n  buriedUntil: ");
		const [own, reverse] = generateExplicitCards(written);
		expect(reverse?.buriedUntil).toBe(until);
		expect(reverse?.due).toBeUndefined();
		expect(own?.buriedUntil).toBeUndefined();

		expect(updateFenceBuried(written, "knot0001-r", null)).toBe(basic);
	});

	it("adds the bury to an existing derived block without touching its schedule", () => {
		const scheduled = updateFenceSchedule(basic, "knot0001-r", fenceSchedule);
		const written = updateFenceBuried(scheduled, "knot0001-r", until);
		const reverse = generateExplicitCards(written)[1];
		expect(reverse?.buriedUntil).toBe(until);
		expect(reverse?.due).toBe(schedule.due);
	});

	it("is dropped by a review or a schedule removal", () => {
		const own = updateFenceBuried(basic, "knot0001", until);
		expect(generateExplicitCards(updateFenceSchedule(own, "knot0001", fenceSchedule))[0]?.buriedUntil).toBeUndefined();
		expect(generateExplicitCards(removeFenceSchedule(own, "knot0001"))[0]?.buriedUntil).toBeUndefined();

		const reverse = updateFenceBuried(basic, "knot0001-r", until);
		expect(generateExplicitCards(updateFenceSchedule(reverse, "knot0001-r", fenceSchedule))[1]?.buriedUntil).toBeUndefined();
	});

	it("separates the header from content when the fence had no header blank line", () => {
		const tight = "```osmosis\nid: knot0002\nBowline\n***\nA fixed loop\n```";
		const written = updateFenceBuried(tight, "knot0002", until);
		const [card] = generateExplicitCards(written);
		expect(card?.buriedUntil).toBe(until);
		expect(card?.front).toBe("Bowline");
	});
});
