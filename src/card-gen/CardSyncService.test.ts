import { describe, it, expect } from "vitest";
import { CardSyncService, injectFenceIdsIntoContent } from "./CardSyncService";
import { CardStore } from "../store/CardStore";
import { lineCardId } from "./line-cards";
import type { Card, OcclusionSet, ScheduleData } from "../database/types";
import type { GeneratedCard } from "./types";

function card(partial: Partial<GeneratedCard> & Pick<GeneratedCard, "id" | "sourceLine">): GeneratedCard {
	return {
		card_type: "explicit",
		front: "",
		back: "",
		deck: "",
		typeIn: false,
		...partial,
	};
}

describe("injectFenceIdsIntoContent", () => {
	it("injects base id into a cloze-only fence whose cards are all derived", () => {
		const content = [
			"```osmosis",
			"==Mitochondria== are the ==powerhouse== of the ==cell==.",
			"```",
		].join("\n");

		const cards = [
			card({ id: "abc12345-c1", sourceLine: 0, card_type: "explicit_cloze" }),
			card({ id: "abc12345-c2", sourceLine: 0, card_type: "explicit_cloze" }),
			card({ id: "abc12345-c3", sourceLine: 0, card_type: "explicit_cloze" }),
		];

		const result = injectFenceIdsIntoContent(content, cards);

		expect(result).toContain("id: abc12345");
		expect(result).not.toContain("id: abc12345-c1");
		const idCount = (result.match(/^id:/gm) ?? []).length;
		expect(idCount).toBe(1);
	});

	it("injects base id for a bidi fence (only -r cards exist alongside base)", () => {
		const content = [
			"```osmosis",
			"Front",
			"***",
			"Back",
			"```",
		].join("\n");

		const cards = [
			card({ id: "def67890", sourceLine: 0, card_type: "explicit_bidi" }),
			card({ id: "def67890-r", sourceLine: 0, card_type: "explicit_bidi" }),
		];

		const result = injectFenceIdsIntoContent(content, cards);

		expect(result).toContain("id: def67890");
		const idCount = (result.match(/^id:/gm) ?? []).length;
		expect(idCount).toBe(1);
	});

	it("leaves content unchanged when fence already has an id", () => {
		const content = [
			"```osmosis",
			"id: existing",
			"",
			"==Paris== is the capital.",
			"```",
		].join("\n");

		const cards = [card({ id: "existing-c1", sourceLine: 0, card_type: "explicit_cloze" })];

		const result = injectFenceIdsIntoContent(content, cards);

		expect(result).toBe(content);
	});

	it("handles nested code fences (4+ backticks) without mistaking inner ``` for close", () => {
		// An osmosis fence that contains an inner python fence, like Test.md § 10.
		// The 4-backtick osmosis fence must survive scanning past the inner 3-backtick fence.
		const content = [
			"````osmosis",
			"```python",
			"def fibonacci(n):",
			"    return n  # osmosis-cloze",
			"```",
			"````",
		].join("\n");

		const cards = [card({ id: "ghi11111-c1", sourceLine: 0, card_type: "code_cloze" })];

		const result = injectFenceIdsIntoContent(content, cards);

		expect(result).toContain("id: ghi11111");
		// id line should be right after the opening fence, before the inner python fence
		const lines = result.split("\n");
		expect(lines[0]).toBe("````osmosis");
		expect(lines[1]).toBe("id: ghi11111");
	});

	it("inserts a blank line after the id when the next line is content", () => {
		// Regression: without a blank-line separator between injected id and
		// content, downstream metadata scanners (FenceWriter, re-parse) can't
		// tell where content begins, which previously caused schedule fields
		// to be written after the content line.
		const content = [
			"```osmosis",
			"The :::mito::: is a thing.",
			"```",
		].join("\n");

		const cards = [card({ id: "xyz-c1", sourceLine: 0, card_type: "explicit_cloze" })];

		const result = injectFenceIdsIntoContent(content, cards);
		const lines = result.split("\n");

		expect(lines[0]).toBe("```osmosis");
		expect(lines[1]).toBe("id: xyz");
		expect(lines[2]).toBe("");
		expect(lines[3]).toBe("The :::mito::: is a thing.");
	});

	it("does NOT insert an extra blank line if one is already present", () => {
		const content = [
			"```osmosis",
			"",
			"The :::mito::: is a thing.",
			"```",
		].join("\n");

		const cards = [card({ id: "xyz-c1", sourceLine: 0, card_type: "explicit_cloze" })];

		const result = injectFenceIdsIntoContent(content, cards);
		const lines = result.split("\n");

		expect(lines[0]).toBe("```osmosis");
		expect(lines[1]).toBe("id: xyz");
		expect(lines[2]).toBe("");
		expect(lines[3]).toBe("The :::mito::: is a thing.");
	});

	it("does NOT insert a blank line if the next line is another metadata key", () => {
		const content = [
			"```osmosis",
			"hint: a hint",
			"",
			"Front",
			"***",
			"Back",
			"```",
		].join("\n");

		const cards = [card({ id: "xyz", sourceLine: 0 })];

		const result = injectFenceIdsIntoContent(content, cards);
		const lines = result.split("\n");

		expect(lines[0]).toBe("```osmosis");
		expect(lines[1]).toBe("id: xyz");
		expect(lines[2]).toBe("hint: a hint");
	});

	it("injects correct ids for multiple fences in one file", () => {
		const content = [
			"```osmosis",
			"==First== cloze.",
			"```",
			"",
			"Some prose.",
			"",
			"```osmosis",
			"==Second== cloze.",
			"```",
		].join("\n");

		const cards = [
			card({ id: "aaa-c1", sourceLine: 0, card_type: "explicit_cloze" }),
			card({ id: "bbb-c1", sourceLine: 6, card_type: "explicit_cloze" }),
		];

		const result = injectFenceIdsIntoContent(content, cards);
		const lines = result.split("\n");

		// First fence gets id: aaa injected at line 1
		expect(lines[0]).toBe("```osmosis");
		expect(lines[1]).toBe("id: aaa");
		// Second fence gets id: bbb — its original sourceLine was 6, shifted by +1 for the first injection
		const secondFenceIdx = lines.findIndex((l, i) => l === "```osmosis" && i > 1);
		expect(lines[secondFenceIdx + 1]).toBe("id: bbb");
	});

	it("never injects ids for line cards — they are not fences", () => {
		const content = [
			"# Heading ^os-head01",
			"",
			"- Tagged line ^os-a1b2c3",
		].join("\n");

		const cards = [
			card({ id: "note.md#^os-head01", sourceLine: 0, card_type: "line", blockId: "os-head01" }),
			card({ id: "note.md#^os-a1b2c3", sourceLine: 2, card_type: "line", blockId: "os-a1b2c3" }),
		];

		expect(injectFenceIdsIntoContent(content, cards)).toBe(content);
	});
});

/** A CardSyncService wired to a real CardStore; the vault is never touched. */
function syncService(): { sync: CardSyncService; store: CardStore } {
	const store = new CardStore();
	const sync = new CardSyncService(
		{} as never,
		store,
		{ isWriting: () => false, getPendingSchedules: () => new Map() } as never,
		() => ({ includeFolders: [], includeTags: [], includeLineCardsInDecks: true }),
	);
	return { sync, store };
}

function lineCard(notePath: string, blockId: string, overrides: Partial<Card> = {}): Card {
	return {
		id: lineCardId(notePath, blockId),
		notePath,
		blockId,
		deck: "Transit",
		cardType: "line",
		front: "Network gaps",
		back: "",
		typeIn: false,
		sourceLine: 3,
		reps: 4,
		lapses: 1,
		due: 1_700_000_000_000,
		state: "review",
		...overrides,
	};
}

describe("CardSyncService.handleBlockMove", () => {
	it("re-keys a moved line card to the destination note, history intact", () => {
		const { sync, store } = syncService();
		store.addCard(lineCard("bike-lanes.md", "os-seamgap1"));

		sync.handleBlockMove("bike-lanes.md", "transit-map.md", new Set(["os-seamgap1"]));

		expect(store.getCard("bike-lanes.md#^os-seamgap1")).toBeUndefined();
		const moved = store.getCard("transit-map.md#^os-seamgap1");
		expect(moved?.notePath).toBe("transit-map.md");
		expect(moved?.blockId).toBe("os-seamgap1");
		expect(moved?.reps).toBe(4);
		expect(moved?.due).toBe(1_700_000_000_000);
		expect(store.getCardsByNote("bike-lanes.md")).toHaveLength(0);
	});

	it("leaves the origin's other cards alone", () => {
		const { sync, store } = syncService();
		store.addCard(lineCard("bike-lanes.md", "os-seamgap1"));
		store.addCard(lineCard("bike-lanes.md", "os-stay001"));

		sync.handleBlockMove("bike-lanes.md", "transit-map.md", new Set(["os-seamgap1"]));

		expect(store.getCardsByNote("bike-lanes.md").map((c) => c.blockId)).toEqual([
			"os-stay001",
		]);
	});

	it("carries the disabled flag across, so an excluded card stays excluded", () => {
		const { sync, store } = syncService();
		store.addCard(lineCard("bike-lanes.md", "os-seamgap1", { disabled: true }));

		sync.handleBlockMove("bike-lanes.md", "transit-map.md", new Set(["os-seamgap1"]));

		expect(store.getCard("transit-map.md#^os-seamgap1")?.disabled).toBe(true);
	});

	it("ignores block IDs with no card and same-file moves", () => {
		const { sync, store } = syncService();
		store.addCard(lineCard("bike-lanes.md", "os-seamgap1"));

		sync.handleBlockMove("bike-lanes.md", "transit-map.md", new Set(["os-absent"]));
		expect(store.getCard("bike-lanes.md#^os-seamgap1")).toBeDefined();

		sync.handleBlockMove("bike-lanes.md", "bike-lanes.md", new Set(["os-seamgap1"]));
		expect(store.getCard("bike-lanes.md#^os-seamgap1")).toBeDefined();
	});
});

describe("CardSyncService occlusion", () => {
	/**
	 * An occluded line card: the shapes live in the note's `osmosis-schedule`
	 * frontmatter, which only Obsidian's YAML parser has read — so they reach
	 * card generation through a callback rather than through `processNote`,
	 * which sees only the raw markdown.
	 */
	const note = [
		"---",
		"osmosis-cards: true",
		"---",
		"",
		"# Rail network",
		"",
		"![[network-map.png]] ^os-ek322j",
		"",
		"- An ordinary tagged line ^os-plain1",
	].join("\n");

	const set: OcclusionSet = {
		mode: "hide-all-guess-one",
		shapes: [
			{ group: "c1", kind: "rect", x: 0.31, y: 0.22, w: 0.14, h: 0.06 },
			{ group: "c2", kind: "rect", x: 0.5, y: 0.5, w: 0.1, h: 0.1 },
		],
	};

	function occludedSync(options?: {
		schedules?: Map<string, ScheduleData>;
		disabled?: Set<string>;
	}): { sync: CardSyncService; store: CardStore } {
		const store = new CardStore();
		const sync = new CardSyncService(
			{ cachedRead: () => Promise.resolve(note) } as never,
			store,
			{ isWriting: () => false, getPendingSchedules: () => new Map() } as never,
			() => ({ includeFolders: [], includeTags: [], includeLineCardsInDecks: true }),
			() => [],
			() => options?.schedules ?? new Map(),
			() => options?.disabled ?? new Set(),
			() => new Map([["os-ek322j", set]]),
		);
		return { sync, store };
	}

	const file = { path: "Atlas.md", extension: "md" } as never;

	it("fans the occluded line into one card per group, leaving plain lines alone", async () => {
		const { sync, store } = occludedSync();
		await sync.syncFile(file);

		const ids = store.getCardsByNote("Atlas.md").map((c) => c.id).sort();
		expect(ids).toEqual([
			"Atlas.md#^os-ek322j-c1",
			"Atlas.md#^os-ek322j-c2",
			"Atlas.md#^os-plain1",
		]);
	});

	it("carries the renderer payload onto each card", async () => {
		const { sync, store } = occludedSync();
		await sync.syncFile(file);

		const c1 = store.getCard("Atlas.md#^os-ek322j-c1")!;
		expect(c1.cardType).toBe("occlusion");
		expect(c1.occlusionGroup).toBe("c1");
		expect(c1.blockId).toBe("os-ek322j");
		expect(c1.occlusion?.image).toBe("network-map.png");
		expect(c1.occlusion?.shapes).toHaveLength(2);
	});

	it("routes each group's schedule through its own nested key", async () => {
		const schedules = new Map<string, ScheduleData>([
			["os-ek322j/c1", { stability: 9.5, difficulty: 5, due: 1_800_000_000_000, lastReview: null, reps: 6, lapses: 0, state: "review", learningSteps: 0 }],
		]);
		const { sync, store } = occludedSync({ schedules });
		await sync.syncFile(file);

		expect(store.getCard("Atlas.md#^os-ek322j-c1")?.reps).toBe(6);
		expect(store.getCard("Atlas.md#^os-ek322j-c2")?.reps).toBeUndefined();
	});

	it("suspends one group without suspending the image's other cards", async () => {
		const { sync, store } = occludedSync({ disabled: new Set(["os-ek322j/c2"]) });
		await sync.syncFile(file);

		expect(store.getCard("Atlas.md#^os-ek322j-c2")?.disabled).toBe(true);
		expect(store.getCard("Atlas.md#^os-ek322j-c1")?.disabled).toBeUndefined();
	});

	it("leaves every card a plain line card when the note declares no shapes", async () => {
		const store = new CardStore();
		const sync = new CardSyncService(
			{ cachedRead: () => Promise.resolve(note) } as never,
			store,
			{ isWriting: () => false, getPendingSchedules: () => new Map() } as never,
			() => ({ includeFolders: [], includeTags: [], includeLineCardsInDecks: true }),
		);
		await sync.syncFile(file);

		expect(store.getCardsByNote("Atlas.md").map((c) => c.cardType)).toEqual(["line", "line"]);
	});
});

describe("staged fence schedules", () => {
	// A fence whose card carries a schedule already written into its metadata.
	const note = `---
osmosis-cards: true
---

\`\`\`osmosis
id: abc123
stability: 4.5
difficulty: 5.2
due: 2026-03-15T00:00:00.000Z
reps: 3
lapses: 0
state: review
lastReview: 2026-03-10T00:00:00.000Z
learningSteps: 0

What is 2+2?
***
4
\`\`\``;

	const file = { path: "notes/cards.md", extension: "md" } as never;

	function syncWithStaged(
		staged: Map<string, import("../store/FenceWriter").ScheduleFields | null>,
	): { sync: CardSyncService; store: CardStore } {
		const store = new CardStore();
		const sync = new CardSyncService(
			{ cachedRead: () => Promise.resolve(note) } as never,
			store,
			{ isWriting: () => false, getPendingSchedules: () => staged } as never,
			() => ({ includeFolders: [], includeTags: [], includeLineCardsInDecks: true }),
		);
		return { sync, store };
	}

	// A re-sync mid-session (a debounced frontmatter flush rewrites the note)
	// would otherwise restore the pre-rating schedule from the fence text and
	// put the card back in the day's due counts.
	it("prefers a contextual session's staged rating over the stale fence text", async () => {
		const { sync, store } = syncWithStaged(new Map([
			["abc123", {
				stability: 12.5,
				difficulty: 4.1,
				due: new Date("2026-04-01T00:00:00.000Z").getTime(),
				lastReview: new Date("2026-03-20T00:00:00.000Z").getTime(),
				reps: 4,
				lapses: 0,
				state: "review" as const,
				learningSteps: 0,
			}],
		]));
		await sync.syncFile(file);

		const card = store.getCard("abc123")!;
		expect(card.reps).toBe(4);
		expect(card.stability).toBe(12.5);
		expect(card.due).toBe(new Date("2026-04-01T00:00:00.000Z").getTime());
	});

	it("returns a card to new when its review has been undone but not yet written", async () => {
		const { sync, store } = syncWithStaged(new Map([["abc123", null]]));
		await sync.syncFile(file);

		const card = store.getCard("abc123")!;
		expect(card.due).toBeUndefined();
		expect(card.reps).toBeUndefined();
		expect(card.state).toBeUndefined();
	});

	it("reads the fence text for cards with nothing staged", async () => {
		const { sync, store } = syncWithStaged(new Map());
		await sync.syncFile(file);

		expect(store.getCard("abc123")?.reps).toBe(3);
	});
});
