import { describe, expect, it } from "vitest";
import type { Card, CardType } from "../database/types";
import {
	allFenceCardKeys,
	allLineCardBlockIds,
	allLineCardIds,
	cardIdsForFenceKey,
	cardIdsForLineKey,
	cardIdsForSpatialKey,
	cardsForFenceKey,
	collectSubtreeCardKeys,
	dueCardsForFenceKey,
	dueOrNewFenceCardKeys,
	dueOrNewLineCardBlockIds,
	dueOrNewLineCardIds,
	fenceKey,
	fenceKeyFromNode,
	occlusionForLineKey,
	spatialStudyKeys,
	type SpatialNodeLike,
} from "./spatial-study";

const NOW = Date.UTC(2026, 6, 14, 12, 0, 0);

function makeCard(overrides: Partial<Card> & { id: string }): Card {
	return {
		notePath: "tests/espresso.md",
		deck: "tests",
		cardType: "line" as CardType,
		front: "Espresso",
		back: "A concentrated brew",
		typeIn: false,
		sourceLine: 0,
		...overrides,
	};
}

describe("allLineCardBlockIds", () => {
	it("collects every line card's block ID regardless of schedule", () => {
		const cards = [
			makeCard({ id: "a", blockId: "os-new001" }),
			makeCard({ id: "b", blockId: "os-fut001", due: NOW + 1000 }),
			makeCard({ id: "c", cardType: "explicit" }), // fence card, no blockId
			makeCard({ id: "d" }), // line card, no blockId
		];
		expect(allLineCardBlockIds(cards)).toEqual(new Set(["os-new001", "os-fut001"]));
	});

	it("counts an occluded line card, which carries the occlusion type on its line", () => {
		// The block ID is what says "this card lives on a line", not the type: an
		// occluded line card fans out into one `occlusion` card per shape group,
		// all sharing the line's block ID. Filtering on `cardType === "line"` left
		// a note of occluded images with no study or peek button.
		const cards = [
			makeCard({ id: "os-diag01-c1", cardType: "occlusion", blockId: "os-diag01" }),
			makeCard({ id: "os-diag01-c2", cardType: "occlusion", blockId: "os-diag01" }),
		];

		expect(allLineCardBlockIds(cards)).toEqual(new Set(["os-diag01"]));
		expect(dueOrNewLineCardBlockIds(cards, NOW)).toEqual(new Set(["os-diag01"]));
		// One key, not two: a map node is a line, and the two cards share it.
		// Keying on the card ID meant no node ever matched a target, so occluded
		// nodes were counted by the header buttons and then never hidden.
		expect(allLineCardIds(cards)).toEqual(new Set(["tests/espresso.md#^os-diag01"]));
	});

	it("maps a line key back to every card the line carries", () => {
		const cards = [
			makeCard({ id: "tests/espresso.md#^os-diag01-c1", cardType: "occlusion", blockId: "os-diag01" }),
			makeCard({ id: "tests/espresso.md#^os-diag01-c2", cardType: "occlusion", blockId: "os-diag01" }),
			makeCard({ id: "tests/espresso.md#^os-other1", blockId: "os-other1" }),
			makeCard({ id: "tests/other.md#^os-diag01", notePath: "tests/other.md", blockId: "os-diag01" }),
		];

		expect(cardIdsForLineKey(cards, "tests/espresso.md#^os-diag01")).toEqual([
			"tests/espresso.md#^os-diag01-c1",
			"tests/espresso.md#^os-diag01-c2",
		]);
		// An ordinary line card is the degenerate case: one card, one key.
		expect(cardIdsForLineKey(cards, "tests/espresso.md#^os-other1")).toEqual([
			"tests/espresso.md#^os-other1",
		]);
		expect(cardIdsForLineKey(cards, "tests/espresso.md#^os-none01")).toEqual([]);
	});

	it("leaves a disabled line's cards unrated", () => {
		const cards = [
			makeCard({ id: "tests/espresso.md#^os-off001", blockId: "os-off001", disabled: true }),
		];
		expect(cardIdsForLineKey(cards, "tests/espresso.md#^os-off001")).toEqual([]);
	});

	it("finds an occluded line's shape set through the line key, not a card ID", () => {
		const occlusion = {
			image: "bridge.svg",
			mode: "hide-all-guess-one" as const,
			shapes: [{ group: "c1", kind: "rect" as const, x: 0.1, y: 0.2, w: 0.3, h: 0.1 }],
			target: "c1",
		};
		const cards = [
			makeCard({
				id: "tests/espresso.md#^os-diag01-c1",
				cardType: "occlusion",
				blockId: "os-diag01",
				occlusion,
			}),
			makeCard({ id: "tests/espresso.md#^os-plain1", blockId: "os-plain1" }),
		];

		// The key is nobody's card ID — that is exactly what used to return null
		// and leave the node hiding behind a "?".
		expect(occlusionForLineKey(cards, "tests/espresso.md#^os-diag01")).toBe(occlusion);
		expect(occlusionForLineKey(cards, "tests/espresso.md#^os-plain1")).toBeNull();
	});

	it("excludes disabled line cards (fully out of peek and study)", () => {
		const cards = [
			makeCard({ id: "a", blockId: "os-on0001" }),
			makeCard({ id: "b", blockId: "os-off001", disabled: true }),
			makeCard({ id: "c", blockId: "os-off002", due: NOW - 1000, disabled: true }),
		];
		expect(allLineCardBlockIds(cards)).toEqual(new Set(["os-on0001"]));
		expect(dueOrNewLineCardBlockIds(cards, NOW)).toEqual(new Set(["os-on0001"]));
		expect(allLineCardIds(cards)).toEqual(new Set(["tests/espresso.md#^os-on0001"]));
		expect(dueOrNewLineCardIds(cards, NOW)).toEqual(new Set(["tests/espresso.md#^os-on0001"]));
	});
});

describe("dueOrNewLineCardBlockIds", () => {
	it("includes new cards (no schedule) and due cards, excludes future ones", () => {
		const cards = [
			makeCard({ id: "a", blockId: "os-new001" }),
			makeCard({ id: "b", blockId: "os-due001", due: NOW - 1000 }),
			makeCard({ id: "c", blockId: "os-due002", due: NOW }),
			makeCard({ id: "d", blockId: "os-fut001", due: NOW + 1000 }),
		];
		expect(dueOrNewLineCardBlockIds(cards, NOW)).toEqual(
			new Set(["os-new001", "os-due001", "os-due002"]),
		);
	});

	it("ignores fence cards and line cards without a block ID", () => {
		// Fence cards never carry a block ID — that field is what marks a card as
		// living on a line, whatever its type.
		const cards = [
			makeCard({ id: "a", cardType: "explicit" }),
			makeCard({ id: "b", cardType: "explicit_cloze" }),
			makeCard({ id: "c" }), // line card, no blockId
		];
		expect(dueOrNewLineCardBlockIds(cards, NOW)).toEqual(new Set());
	});

	it("includes deck-excluded line cards (opt-out only affects decks)", () => {
		const cards = [
			makeCard({ id: "a", blockId: "os-excl01", excludeFromDecks: true }),
		];
		expect(dueOrNewLineCardBlockIds(cards, NOW)).toEqual(new Set(["os-excl01"]));
	});

	it("returns empty for no cards", () => {
		expect(dueOrNewLineCardBlockIds([], NOW)).toEqual(new Set());
	});
});

describe("allLineCardIds", () => {
	it("keys by line, keeping same-blockId lines from different notes distinct", () => {
		const cards = [
			makeCard({ id: "tests/host.md#^os-aaa111", notePath: "tests/host.md", blockId: "os-aaa111" }),
			makeCard({ id: "tests/source.md#^os-aaa111", notePath: "tests/source.md", blockId: "os-aaa111" }),
			makeCard({ id: "c", cardType: "explicit" }), // fence card, no blockId
			makeCard({ id: "d" }), // line card, no blockId
		];
		expect(allLineCardIds(cards)).toEqual(
			new Set(["tests/host.md#^os-aaa111", "tests/source.md#^os-aaa111"]),
		);
	});
});

describe("dueOrNewLineCardIds", () => {
	it("applies the due-or-new filter and keys by line", () => {
		const cards = [
			makeCard({ id: "tests/host.md#^os-new001", notePath: "tests/host.md", blockId: "os-new001" }),
			makeCard({ id: "tests/host.md#^os-due001", notePath: "tests/host.md", blockId: "os-due001", due: NOW }),
			makeCard({ id: "tests/host.md#^os-fut001", notePath: "tests/host.md", blockId: "os-fut001", due: NOW + 1000 }),
		];
		expect(dueOrNewLineCardIds(cards, NOW)).toEqual(
			new Set(["tests/host.md#^os-new001", "tests/host.md#^os-due001"]),
		);
	});

	it("includes deck-excluded line cards (opt-out only affects decks)", () => {
		const cards = [
			makeCard({
				id: "tests/host.md#^os-excl01",
				notePath: "tests/host.md",
				blockId: "os-excl01",
				excludeFromDecks: true,
			}),
		];
		expect(dueOrNewLineCardIds(cards, NOW)).toEqual(new Set(["tests/host.md#^os-excl01"]));
	});
});

describe("collectSubtreeCardKeys", () => {
	const HOST = "tests/host.md";

	const node = (
		blockId: string | undefined,
		children: SpatialNodeLike[] = [],
		transcluded?: { sourceFile?: string },
	): SpatialNodeLike => ({
		source: {
			...(blockId !== undefined ? { blockId } : {}),
			isTranscluded: transcluded !== undefined,
			...(transcluded?.sourceFile !== undefined ? { sourceFile: transcluded.sourceFile } : {}),
		},
		children,
	});

	it("keys local nodes against the host note", () => {
		const root = node("os-root01", [
			node("os-kid001"),
			node(undefined, [node("os-deep01")]),
		]);
		expect(collectSubtreeCardKeys(root, HOST)).toEqual(
			new Set([
				"tests/host.md#^os-root01",
				"tests/host.md#^os-kid001",
				"tests/host.md#^os-deep01",
			]),
		);
	});

	it("keys transcluded nodes against their source note", () => {
		const root = node("os-root01", [
			node("os-embed1", [], { sourceFile: "tests/source.md" }),
		]);
		expect(collectSubtreeCardKeys(root, HOST)).toEqual(
			new Set(["tests/host.md#^os-root01", "tests/source.md#^os-embed1"]),
		);
	});

	it("attributes chained transclusions per node (A hosts B hosts C)", () => {
		const root = node("os-hostln", [
			node("os-fromb1", [
				node("os-fromc1", [], { sourceFile: "tests/c.md" }),
			], { sourceFile: "tests/b.md" }),
		]);
		expect(collectSubtreeCardKeys(root, HOST)).toEqual(
			new Set([
				"tests/host.md#^os-hostln",
				"tests/b.md#^os-fromb1",
				"tests/c.md#^os-fromc1",
			]),
		);
	});

	it("keeps colliding block IDs distinct across host and source", () => {
		const root = node("os-aaa111", [
			node("os-aaa111", [], { sourceFile: "tests/source.md" }),
		]);
		expect(collectSubtreeCardKeys(root, HOST)).toEqual(
			new Set(["tests/host.md#^os-aaa111", "tests/source.md#^os-aaa111"]),
		);
	});

	it("skips transcluded nodes without a resolved sourceFile", () => {
		const root = node("os-root01", [node("os-lost01", [], {})]);
		expect(collectSubtreeCardKeys(root, HOST)).toEqual(
			new Set(["tests/host.md#^os-root01"]),
		);
	});

	it("returns empty when no node carries a block ID", () => {
		const root = node(undefined, [node(undefined)]);
		expect(collectSubtreeCardKeys(root, HOST)).toEqual(new Set());
	});
});

/**
 * Fence cards as spatial targets. A fence is one node but often several cards,
 * so — exactly like a line — the node keys on the fence and the key maps back
 * to every card it derived.
 */
describe("fence keys", () => {
	const fenceCard = (id: string, overrides: Partial<Card> = {}): Card =>
		makeCard({ id, cardType: "occlusion", ...overrides });

	it("strips a derived suffix to reach the fence a card came from", () => {
		expect(fenceKey(fenceCard("surface-parts-c1"))).toBe("surface-parts");
		expect(fenceKey(fenceCard("surface-parts-c12"))).toBe("surface-parts");
		expect(fenceKey(fenceCard("surface-parts-r"))).toBe("surface-parts");
		// A fence with a single undivided card is its own key.
		expect(fenceKey(fenceCard("surface-parts"))).toBe("surface-parts");
	});

	it("keeps line cards out — they key on their block, not their ID", () => {
		const cards = [
			fenceCard("surface-parts-c1"),
			makeCard({ id: "tests/espresso.md#^os-line01", blockId: "os-line01" }),
		];
		expect(allFenceCardKeys(cards)).toEqual(new Set(["surface-parts"]));
	});

	it("excludes a disabled fence card, as peek and study exclude a disabled line", () => {
		expect(allFenceCardKeys([fenceCard("gone-c1", { disabled: true })])).toEqual(new Set());
	});

	it("applies the due-or-new filter", () => {
		const cards = [
			fenceCard("new-c1"),
			fenceCard("due-c1", { due: NOW - 1000 }),
			fenceCard("later-c1", { due: NOW + 100_000 }),
		];
		expect(dueOrNewFenceCardKeys(cards, NOW)).toEqual(new Set(["new", "due"]));
	});

	it("maps a fence key back to every card the fence derived", () => {
		const cards = [
			fenceCard("surface-parts-c1"),
			fenceCard("surface-parts-c2"),
			fenceCard("other-c1"),
		];
		expect(cardIdsForFenceKey(cards, "surface-parts")).toEqual([
			"surface-parts-c1",
			"surface-parts-c2",
		]);
	});

	it("orders a fence's cards the way a study surface asks them", () => {
		// Deliberately shuffled: the store hands its note index back in insertion
		// order, and an incremental re-sync re-adds an edited card at the end — so
		// a fence would start asking `c2` before `c1` because `c1` was the group
		// whose wording changed.
		const cards = [
			fenceCard("rivers-c10"),
			fenceCard("rivers-r"),
			fenceCard("rivers-c2"),
			fenceCard("rivers"),
			fenceCard("rivers-c1"),
		];
		expect(cardsForFenceKey(cards, "rivers").map((card) => card.id)).toEqual([
			"rivers",
			"rivers-c1",
			"rivers-c2",
			"rivers-c10",
			"rivers-r",
		]);
	});

	it("leaves a disabled card out, so an excluded fence has no cards to ask", () => {
		const cards = [fenceCard("rivers-c1", { disabled: true }), fenceCard("rivers-c2")];
		expect(cardsForFenceKey(cards, "rivers").map((card) => card.id)).toEqual(["rivers-c2"]);
	});

	describe("the questions a fence asks in place", () => {
		it("asks every due card the fence derived, in ask order", () => {
			const cards = [
				fenceCard("rivers-c2"),
				fenceCard("rivers-c1", { due: NOW - 1000 }),
				fenceCard("rivers-c3", { due: NOW }),
			];

			expect(dueCardsForFenceKey(cards, "rivers", NOW).map((card) => card.id)).toEqual([
				"rivers-c1",
				"rivers-c2",
				"rivers-c3",
			]);
		});

		it("asks both directions of a bidirectional fence, forward first", () => {
			const cards = [fenceCard("capital-r", { due: NOW - 1000 }), fenceCard("capital")];

			expect(dueCardsForFenceKey(cards, "capital", NOW).map((card) => card.id)).toEqual([
				"capital",
				"capital-r",
			]);
		});

		it("drops the groups that are not due, so one due group is one question", () => {
			const cards = [
				fenceCard("rivers-c1", { due: NOW - 1000 }),
				fenceCard("rivers-c2", { due: NOW + 60_000 }),
				fenceCard("rivers-c3", { due: NOW + 60_000 }),
			];

			expect(dueCardsForFenceKey(cards, "rivers", NOW).map((card) => card.id)).toEqual([
				"rivers-c1",
			]);
		});

		it("asks nothing for a fence whose cards are all excluded", () => {
			const cards = [fenceCard("rivers-c1", { disabled: true })];

			expect(dueCardsForFenceKey(cards, "rivers", NOW)).toEqual([]);
		});

		it("asks nothing for a fence the store has no card for", () => {
			expect(dueCardsForFenceKey([fenceCard("other-c1")], "rivers", NOW)).toEqual([]);
		});
	});
});

describe("fenceKeyFromNode", () => {
	it("reads the id: a fence declares in its header", () => {
		const content = "```osmosis\nid: surface-parts\nocclude-a:\n  mode: hide-all-guess-one\n```";
		expect(fenceKeyFromNode(content)).toBe("surface-parts");
	});

	it("reads the legacy id comment on the opening line", () => {
		expect(fenceKeyFromNode("```osmosis <!--osmosis-id:ab12cd-->\nfront\n***\nback\n```"))
			.toBe("ab12cd");
	});

	it("stops at the end of the metadata run, so prose cannot pose as an id", () => {
		const content = "```osmosis\ndeck: Engineering\n\nid: not-metadata\n```";
		expect(fenceKeyFromNode(content)).toBeNull();
	});

	it("returns null for a fence with no identity yet, which is no card", () => {
		expect(fenceKeyFromNode("```osmosis\nfront\n***\nback\n```")).toBeNull();
	});

	it("returns null for any other code block", () => {
		expect(fenceKeyFromNode("```ts\nconst id = 1;\n```")).toBeNull();
	});
});

/** An occlusion payload for `group`, on `image`. */
function occlusionFor(group: string, image = "bridge.svg") {
	return {
		image,
		mode: "hide-all-guess-one" as const,
		shapes: [
			{ group: "c1", kind: "rect" as const, x: 0.1, y: 0.2, w: 0.3, h: 0.1 },
			{ group: "c2", kind: "rect" as const, x: 0.5, y: 0.2, w: 0.3, h: 0.1 },
		],
		target: group,
	};
}

describe("spatialStudyKeys", () => {
	it("splits an occlusion fence node into one key per due shape group", () => {
		const cards = [
			makeCard({ id: "bridge-c1", cardType: "occlusion", occlusion: occlusionFor("c1") }),
			makeCard({ id: "bridge-c2", cardType: "occlusion", occlusion: occlusionFor("c2") }),
		];
		expect(spatialStudyKeys(cards, "bridge", NOW)).toEqual(["bridge-c1", "bridge-c2"]);
	});

	it("splits an occluded line node the same way, keyed on the line", () => {
		const cards = [
			makeCard({
				id: "tests/espresso.md#^os-diag01/c1",
				cardType: "occlusion",
				blockId: "os-diag01",
				occlusion: occlusionFor("c1"),
			}),
			makeCard({
				id: "tests/espresso.md#^os-diag01/c2",
				cardType: "occlusion",
				blockId: "os-diag01",
				occlusion: occlusionFor("c2"),
			}),
		];
		expect(spatialStudyKeys(cards, "tests/espresso.md#^os-diag01", NOW)).toEqual([
			"tests/espresso.md#^os-diag01/c1",
			"tests/espresso.md#^os-diag01/c2",
		]);
	});

	it("orders by group number, so c10 never precedes c2", () => {
		const cards = [
			makeCard({ id: "bridge-c10", cardType: "occlusion", occlusion: occlusionFor("c10") }),
			makeCard({ id: "bridge-c2", cardType: "occlusion", occlusion: occlusionFor("c2") }),
		];
		expect(spatialStudyKeys(cards, "bridge", NOW)).toEqual(["bridge-c2", "bridge-c10"]);
	});

	it("asks only the groups the scheduler would ask now", () => {
		const cards = [
			makeCard({ id: "bridge-c1", cardType: "occlusion", occlusion: occlusionFor("c1") }),
			makeCard({
				id: "bridge-c2",
				cardType: "occlusion",
				occlusion: occlusionFor("c2"),
				due: NOW + 1000,
			}),
		];
		expect(spatialStudyKeys(cards, "bridge", NOW)).toEqual(["bridge-c1"]);
	});

	it("leaves an ordinary node as a single unit of work", () => {
		const cards = [
			makeCard({ id: "bridge-c1", cardType: "explicit_cloze" }),
			makeCard({ id: "bridge-c2", cardType: "explicit_cloze" }),
		];
		expect(spatialStudyKeys(cards, "bridge", NOW)).toEqual(["bridge"]);
	});

	it("does not split a fence that mixes an occluded diagram with another card", () => {
		// Splitting on the diagram alone would leave the cloze card with no key
		// at all, and its review would be dropped.
		const cards = [
			makeCard({ id: "bridge-c1", cardType: "occlusion", occlusion: occlusionFor("c1") }),
			makeCard({ id: "bridge-c2", cardType: "explicit_cloze" }),
		];
		expect(spatialStudyKeys(cards, "bridge", NOW)).toEqual(["bridge"]);
	});

	it("ignores disabled cards, and falls back to the node key when all are out", () => {
		const cards = [
			makeCard({
				id: "bridge-c1",
				cardType: "occlusion",
				occlusion: occlusionFor("c1"),
				disabled: true,
			}),
		];
		expect(spatialStudyKeys(cards, "bridge", NOW)).toEqual(["bridge"]);
	});
});

describe("cardIdsForSpatialKey", () => {
	const fenceGroups = [
		makeCard({ id: "bridge-c1", cardType: "occlusion", occlusion: occlusionFor("c1") }),
		makeCard({ id: "bridge-c2", cardType: "occlusion", occlusion: occlusionFor("c2") }),
	];

	it("resolves one shape group of a fence to that card alone", () => {
		expect(cardIdsForSpatialKey(fenceGroups, "bridge-c1")).toEqual(["bridge-c1"]);
	});

	it("resolves one shape group of a line to that card alone", () => {
		// `cardIdsForLineKey` finds nothing for it — the key is `…#^block/c1`,
		// not the line key — which is how a rating came to record nothing.
		const cards = [
			makeCard({
				id: "tests/espresso.md#^os-diag01/c1",
				cardType: "occlusion",
				blockId: "os-diag01",
				occlusion: occlusionFor("c1"),
			}),
		];
		expect(cardIdsForSpatialKey(cards, "tests/espresso.md#^os-diag01/c1"))
			.toEqual(["tests/espresso.md#^os-diag01/c1"]);
	});

	it("still resolves a whole fence key to every card the fence derived", () => {
		expect(cardIdsForSpatialKey(fenceGroups, "bridge")).toEqual(["bridge-c1", "bridge-c2"]);
	});

	it("still resolves a whole line key to every card the line carries", () => {
		const cards = [
			makeCard({ id: "tests/espresso.md#^os-diag01/c1", blockId: "os-diag01" }),
			makeCard({ id: "tests/espresso.md#^os-diag01/c2", blockId: "os-diag01" }),
		];
		expect(cardIdsForSpatialKey(cards, "tests/espresso.md#^os-diag01")).toEqual([
			"tests/espresso.md#^os-diag01/c1",
			"tests/espresso.md#^os-diag01/c2",
		]);
	});

	it("drops a disabled card, whichever shape of key names it", () => {
		const cards = [
			makeCard({
				id: "bridge-c1",
				cardType: "occlusion",
				occlusion: occlusionFor("c1"),
				disabled: true,
			}),
		];
		expect(cardIdsForSpatialKey(cards, "bridge-c1")).toEqual([]);
		expect(cardIdsForSpatialKey(cards, "bridge")).toEqual([]);
	});
});
