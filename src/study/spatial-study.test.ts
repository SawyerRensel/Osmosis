import { describe, expect, it } from "vitest";
import type { Card, CardType } from "../database/types";
import {
	allLineCardBlockIds,
	collectSubtreeBlockIds,
	dueOrNewLineCardBlockIds,
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

describe("collectSubtreeBlockIds", () => {
	const node = (
		blockId: string | undefined,
		children: SpatialNodeLike[] = [],
		isTranscluded = false,
	): SpatialNodeLike => ({
		source: { ...(blockId !== undefined ? { blockId } : {}), isTranscluded },
		children,
	});

	it("collects the node's own ID and all descendant IDs", () => {
		const root = node("os-root01", [
			node("os-kid001"),
			node(undefined, [node("os-deep01")]),
		]);
		expect(collectSubtreeBlockIds(root)).toEqual(
			new Set(["os-root01", "os-kid001", "os-deep01"]),
		);
	});

	it("skips transcluded nodes but still walks their children", () => {
		const root = node("os-root01", [
			node("os-embed1", [node("os-embed2")], true),
		]);
		// Only the parent is marked transcluded here; the child counts as
		// local, so the filter must be per-node, not per-subtree.
		expect(collectSubtreeBlockIds(root)).toEqual(new Set(["os-root01", "os-embed2"]));
	});

	it("returns empty when no node carries a block ID", () => {
		const root = node(undefined, [node(undefined)]);
		expect(collectSubtreeBlockIds(root)).toEqual(new Set());
	});
});
