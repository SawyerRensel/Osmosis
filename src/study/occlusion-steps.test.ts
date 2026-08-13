import { describe, expect, it } from "vitest";
import type { Card, CardOcclusion, CardType, OcclusionShape } from "../database/types";
import { occlusionSteps } from "./occlusion-steps";

const NOW = Date.UTC(2026, 7, 12, 12, 0, 0);

function makeCard(overrides: Partial<Card> & { id: string }): Card {
	return {
		notePath: "tests/bridge.md",
		deck: "tests",
		cardType: "occlusion" as CardType,
		front: "",
		back: "",
		typeIn: false,
		sourceLine: 0,
		...overrides,
	};
}

/** A card for one shape group, as `occludeLineCard` and the fence generator mint them. */
function makeGroupCard(id: string, group: string, overrides: Partial<Card> = {}): Card {
	return makeCard({
		id,
		occlusion: { image: "bridge.svg", mode: "hide-all-guess-one", shapes: [], target: group },
		occlusionGroup: group,
		...overrides,
	});
}

function rect(group: string): OcclusionShape {
	return { group, kind: "rect", x: 0.1, y: 0.1, w: 0.2, h: 0.2 };
}

function diagram(image: string, groups: readonly string[]): CardOcclusion {
	return { image, mode: "hide-all-guess-one", shapes: groups.map(rect), target: "" };
}

describe("occlusionSteps", () => {
	it("asks one question per shape group, in group order", () => {
		const steps = occlusionSteps([diagram("bridge.svg", ["c2", "c1", "c3"])], [], null);

		expect(steps.map((step) => step.group)).toEqual(["c1", "c2", "c3"]);
		expect(steps.every((step) => step.diagram === 0)).toBe(true);
	});

	it("collapses several shapes sharing a group into one question", () => {
		// A shape group is a cloze group: two masks labelled `c1` are one card,
		// exactly as two `c1:` cloze occurrences are.
		const steps = occlusionSteps(
			[diagram("bridge.svg", ["c1", "c1", "c2"])],
			[],
			null,
		);

		expect(steps.map((step) => step.group)).toEqual(["c1", "c2"]);
	});

	it("pairs each group with the card whose schedule it moves", () => {
		const cards = [
			makeGroupCard("bridge-c1", "c1"),
			makeGroupCard("bridge-c2", "c2"),
		];

		const steps = occlusionSteps([diagram("bridge.svg", ["c1", "c2"])], cards, null);

		expect(steps.map((step) => step.cardId)).toEqual(["bridge-c1", "bridge-c2"]);
	});

	it("orders by group number across a fence's diagrams, not diagram by diagram", () => {
		// Group labels are allocated per fence, so the second diagram starts where
		// the first left off and group order already is document order.
		const steps = occlusionSteps(
			[diagram("section.svg", ["c1", "c3"]), diagram("elevation.svg", ["c2"])],
			[],
			null,
		);

		expect(steps).toEqual([
			{ diagram: 0, group: "c1", cardId: null },
			{ diagram: 1, group: "c2", cardId: null },
			{ diagram: 0, group: "c3", cardId: null },
		]);
	});

	it("sorts c10 after c9 rather than after c1", () => {
		const steps = occlusionSteps([diagram("bridge.svg", ["c10", "c9", "c1"])], [], null);

		expect(steps.map((step) => step.group)).toEqual(["c1", "c9", "c10"]);
	});

	describe("when filtering by time", () => {
		it("keeps only the groups the scheduler would ask now", () => {
			// One due group out of three is one question, not three — the same rule
			// spatial study applies when it splits a node.
			const cards = [
				makeGroupCard("bridge-c1", "c1", { due: NOW - 1000 }),
				makeGroupCard("bridge-c2", "c2", { due: NOW + 60_000 }),
				makeGroupCard("bridge-c3", "c3"), // new — never reviewed
			];

			const steps = occlusionSteps([diagram("bridge.svg", ["c1", "c2", "c3"])], cards, NOW);

			expect(steps.map((step) => step.group)).toEqual(["c1", "c3"]);
		});

		it("drops a group whose card the store does not know about", () => {
			// No card means no schedule to move, so the question's answer would go
			// nowhere. Peek still shows the mask; study does not ask it.
			const steps = occlusionSteps(
				[diagram("bridge.svg", ["c1", "c2"])],
				[makeGroupCard("bridge-c1", "c1")],
				NOW,
			);

			expect(steps.map((step) => step.group)).toEqual(["c1"]);
		});

		it("drops a disabled card's group", () => {
			const cards = [
				makeGroupCard("bridge-c1", "c1", { disabled: true }),
				makeGroupCard("bridge-c2", "c2"),
			];

			expect(occlusionSteps([diagram("bridge.svg", ["c1", "c2"])], cards, NOW))
				.toEqual([{ diagram: 0, group: "c2", cardId: "bridge-c2" }]);
		});
	});

	it("takes every group when no time is given, card or no card", () => {
		// Peek's own listing: nothing is recorded there, so a group with no card is
		// still a region worth covering.
		const steps = occlusionSteps([diagram("bridge.svg", ["c1", "c2"])], [], null);

		expect(steps).toHaveLength(2);
	});

	it("returns nothing for a diagram with no shapes", () => {
		expect(occlusionSteps([diagram("bridge.svg", [])], [], null)).toEqual([]);
	});
});
