import { describe, expect, it } from "vitest";
import type { Card, CardType } from "../database/types";
import {
	allLineCardBlockIds,
	allLineCardIds,
	collectSubtreeCardKeys,
	dueOrNewLineCardBlockIds,
	dueOrNewLineCardIds,
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
			makeCard({ id: "c", cardType: "explicit", blockId: "os-fence1" }),
			makeCard({ id: "d" }), // line card, no blockId
		];
		expect(allLineCardBlockIds(cards)).toEqual(new Set(["os-new001", "os-fut001"]));
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

	it("ignores non-line cards and line cards without a block ID", () => {
		const cards = [
			makeCard({ id: "a", cardType: "explicit", blockId: "os-fence1" }),
			makeCard({ id: "b", cardType: "explicit_cloze", blockId: "os-fence2" }),
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
	it("keys by card ID, keeping same-blockId cards from different notes distinct", () => {
		const cards = [
			makeCard({ id: "tests/host.md#^os-aaa111", notePath: "tests/host.md", blockId: "os-aaa111" }),
			makeCard({ id: "tests/source.md#^os-aaa111", notePath: "tests/source.md", blockId: "os-aaa111" }),
			makeCard({ id: "c", cardType: "explicit", blockId: "os-fence1" }),
			makeCard({ id: "d" }), // line card, no blockId
		];
		expect(allLineCardIds(cards)).toEqual(
			new Set(["tests/host.md#^os-aaa111", "tests/source.md#^os-aaa111"]),
		);
	});
});

describe("dueOrNewLineCardIds", () => {
	it("applies the due-or-new filter and keys by card ID", () => {
		const cards = [
			makeCard({ id: "tests/host.md#^os-new001", blockId: "os-new001" }),
			makeCard({ id: "tests/host.md#^os-due001", blockId: "os-due001", due: NOW }),
			makeCard({ id: "tests/host.md#^os-fut001", blockId: "os-fut001", due: NOW + 1000 }),
		];
		expect(dueOrNewLineCardIds(cards, NOW)).toEqual(
			new Set(["tests/host.md#^os-new001", "tests/host.md#^os-due001"]),
		);
	});

	it("includes deck-excluded line cards (opt-out only affects decks)", () => {
		const cards = [
			makeCard({ id: "tests/host.md#^os-excl01", blockId: "os-excl01", excludeFromDecks: true }),
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
