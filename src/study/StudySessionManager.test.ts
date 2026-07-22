import { describe, it, expect, beforeEach } from "vitest";
import { CardStore } from "../store/CardStore";
import { FSRSScheduler } from "../database/FSRSScheduler";
import { StudySessionManager } from "./StudySessionManager";
import type { Card } from "../database/types";

let store: CardStore;
let scheduler: FSRSScheduler;

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
	scheduler = new FSRSScheduler();
});

describe("CardStore queries", () => {
	describe("exact deck scoping", () => {
		it("returns only cards in the specified deck", () => {
			store.addCard(makeCard({ id: "1", deck: "math" }));
			store.addCard(makeCard({ id: "2", deck: "science" }));
			store.addCard(makeCard({ id: "3", deck: "math" }));

			const newCards = store.getNewCards("math");
			expect(newCards).toHaveLength(2);
			expect(newCards.every(c => c.deck === "math")).toBe(true);
		});
	});

	describe("parent prefix scoping", () => {
		it("includes parent deck and all sub-decks", () => {
			store.addCard(makeCard({ id: "1", deck: "math" }));
			store.addCard(makeCard({ id: "2", deck: "math/algebra" }));
			store.addCard(makeCard({ id: "3", deck: "math/calculus" }));
			store.addCard(makeCard({ id: "4", deck: "science" }));

			const newCards = store.getNewCardsByDeckPrefix("math");
			expect(newCards).toHaveLength(3);
		});

		it("does not match partial prefix (mathematics vs math)", () => {
			store.addCard(makeCard({ id: "1", deck: "math" }));
			store.addCard(makeCard({ id: "2", deck: "mathematics" }));

			const newCards = store.getNewCardsByDeckPrefix("math");
			expect(newCards).toHaveLength(1);
			expect(newCards[0]!.deck).toBe("math");
		});
	});

	describe("all decks", () => {
		it("returns all cards when no deck filter", () => {
			store.addCard(makeCard({ id: "1", deck: "math" }));
			store.addCard(makeCard({ id: "2", deck: "science" }));
			store.addCard(makeCard({ id: "3", deck: "" }));

			expect(store.getNewCards()).toHaveLength(3);
		});
	});

	describe("new cards", () => {
		it("returns cards without schedule data", () => {
			store.addCard(makeCard({ id: "1" }));
			store.addCard(makeCard({ id: "2", due: Date.now() - 1000, state: "review" }));

			expect(store.getNewCards()).toHaveLength(1);
			expect(store.getNewCards()[0]!.id).toBe("1");
		});

		it("filters by deck prefix", () => {
			store.addCard(makeCard({ id: "1", deck: "math" }));
			store.addCard(makeCard({ id: "2", deck: "math/algebra" }));
			store.addCard(makeCard({ id: "3", deck: "science" }));

			expect(store.getNewCardsByDeckPrefix("math")).toHaveLength(2);
		});
	});

	describe("due cards", () => {
		it("returns cards that are due", () => {
			const now = Date.now();
			store.addCard(makeCard({ id: "1", due: now - 1000, state: "review" }));
			store.addCard(makeCard({ id: "2", due: now + 100000, state: "review" }));
			store.addCard(makeCard({ id: "3" }));

			const due = store.getDueCards(now);
			expect(due).toHaveLength(1);
			expect(due[0]!.id).toBe("1");
		});

		it("filters by deck", () => {
			const now = Date.now();
			store.addCard(makeCard({ id: "1", deck: "math", due: now - 1000, state: "review" }));
			store.addCard(makeCard({ id: "2", deck: "science", due: now - 1000, state: "review" }));

			expect(store.getDueCards(now, "math")).toHaveLength(1);
		});

		it("filters by deck prefix", () => {
			const now = Date.now();
			store.addCard(makeCard({ id: "1", deck: "math", due: now - 1000, state: "review" }));
			store.addCard(makeCard({ id: "2", deck: "math/algebra", due: now - 1000, state: "review" }));
			store.addCard(makeCard({ id: "3", deck: "science", due: now - 1000, state: "review" }));

			expect(store.getDueCardsByDeckPrefix(now, "math")).toHaveLength(2);
		});
	});

	describe("card counts by deck", () => {
		it("groups counts correctly", () => {
			const now = Date.now();
			store.addCard(makeCard({ id: "1", deck: "math" }));
			store.addCard(makeCard({ id: "2", deck: "math" }));
			store.addCard(makeCard({ id: "3", deck: "math", due: now - 1000, state: "review" }));
			store.addCard(makeCard({ id: "4", deck: "math", due: now - 1000, state: "learning" }));
			store.addCard(makeCard({ id: "5", deck: "science" }));

			const counts = store.getCardCountsByDeck(now);
			const math = counts.get("math")!;
			expect(math.new).toBe(2);
			expect(math.due).toBe(1);
			expect(math.learn).toBe(1);

			const science = counts.get("science")!;
			expect(science.new).toBe(1);
		});
	});
});

describe("FSRS integration", () => {
	it("creates a schedule and processes a review", () => {
		const now = Date.now();
		const schedule = scheduler.createNewSchedule(now);
		expect(schedule.state).toBe("new");
		expect(schedule.reps).toBe(0);

		const result = scheduler.review(schedule, 3, now);
		expect(result.schedule.reps).toBe(1);
		expect(result.schedule.stability).toBeGreaterThan(0);
	});

	it("schedule state transitions from new after review", () => {
		const now = Date.now();
		const schedule = scheduler.createNewSchedule(now);
		const result = scheduler.review(schedule, 3, now);
		expect(result.schedule.state).not.toBe("new");
	});
});

describe("StudySessionManager schedule-write routing", () => {
	interface FenceCall { cardId: string; kind: "write" | "remove" }
	interface LineCall { notePath: string; blockId: string; kind: "set" | "remove" | "disable" | "enable" }

	function makeManager() {
		const fenceCalls: FenceCall[] = [];
		const lineCalls: LineCall[] = [];

		const fenceWriter = {
			writeSchedule: (_file: unknown, cardId: string) => {
				fenceCalls.push({ cardId, kind: "write" });
				return Promise.resolve();
			},
			removeSchedule: (_file: unknown, cardId: string) => {
				fenceCalls.push({ cardId, kind: "remove" });
				return Promise.resolve();
			},
		};
		const scheduleStore = {
			setSchedule: (notePath: string, blockId: string) => {
				lineCalls.push({ notePath, blockId, kind: "set" });
			},
			removeSchedule: (notePath: string, blockId: string) => {
				lineCalls.push({ notePath, blockId, kind: "remove" });
			},
			setDisabled: (notePath: string, blockId: string, disabled: boolean) => {
				lineCalls.push({ notePath, blockId, kind: disabled ? "disable" : "enable" });
			},
		};

		const manager = new StudySessionManager(
			store,
			scheduler,
			fenceWriter as unknown as import("../store/FenceWriter").FenceWriter,
			(notePath) => ({ path: notePath } as import("obsidian").TFile),
			scheduleStore,
		);
		return { manager, fenceCalls, lineCalls };
	}

	it("routes line-card ratings to the schedule store, not the fence writer", async () => {
		const { manager, fenceCalls, lineCalls } = makeManager();
		store.addCard(makeCard({
			id: "notes/bio.md#^os-a1b2c3",
			notePath: "notes/bio.md",
			cardType: "line",
			blockId: "os-a1b2c3",
		}));

		await manager.recordReview("notes/bio.md#^os-a1b2c3", 3);

		expect(fenceCalls).toHaveLength(0);
		expect(lineCalls).toEqual([
			{ notePath: "notes/bio.md", blockId: "os-a1b2c3", kind: "set" },
		]);
	});

	it("routes fence-card ratings to the fence writer", async () => {
		const { manager, fenceCalls, lineCalls } = makeManager();
		store.addCard(makeCard({ id: "abc12345" }));

		await manager.recordReview("abc12345", 3);

		expect(lineCalls).toHaveLength(0);
		expect(fenceCalls).toEqual([{ cardId: "abc12345", kind: "write" }]);
	});

	it("revert on a previously-new line card removes its schedule entry", async () => {
		const { manager, lineCalls } = makeManager();
		store.addCard(makeCard({
			id: "notes/bio.md#^os-a1b2c3",
			notePath: "notes/bio.md",
			cardType: "line",
			blockId: "os-a1b2c3",
		}));

		await manager.recordReview("notes/bio.md#^os-a1b2c3", 3);
		await manager.revertReview("notes/bio.md#^os-a1b2c3", null);

		expect(lineCalls[lineCalls.length - 1]).toEqual({
			notePath: "notes/bio.md", blockId: "os-a1b2c3", kind: "remove",
		});
		expect(store.getCard("notes/bio.md#^os-a1b2c3")?.due).toBeUndefined();
	});

	it("revert with a previous schedule restores it via the schedule store", async () => {
		const { manager, lineCalls } = makeManager();
		store.addCard(makeCard({
			id: "notes/bio.md#^os-a1b2c3",
			notePath: "notes/bio.md",
			cardType: "line",
			blockId: "os-a1b2c3",
		}));
		const previous = scheduler.createNewSchedule(Date.now());

		await manager.revertReview("notes/bio.md#^os-a1b2c3", previous);

		expect(lineCalls).toEqual([
			{ notePath: "notes/bio.md", blockId: "os-a1b2c3", kind: "set" },
		]);
	});
});
