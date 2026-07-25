import { describe, it, expect } from "vitest";
import { buildDeckTree, pruneDeckTree } from "./DeckTreeBuilder";

describe("DeckTreeBuilder", () => {
	it("returns empty array for no decks", () => {
		const tree = buildDeckTree([], new Map());
		expect(tree).toEqual([]);
	});

	it("builds flat list for root-level decks", () => {
		const decks = ["history", "math", "science"];
		const counts = new Map([
			["history", { new: 2, learn: 0, due: 1 }],
			["math", { new: 5, learn: 1, due: 3 }],
			["science", { new: 0, learn: 0, due: 0 }],
		]);

		const tree = buildDeckTree(decks, counts);

		expect(tree).toHaveLength(3);
		expect(tree[0]!.name).toBe("history");
		expect(tree[0]!.fullPath).toBe("history");
		expect(tree[0]!.newCount).toBe(2);
		expect(tree[0]!.dueCount).toBe(1);
		expect(tree[1]!.name).toBe("math");
		expect(tree[2]!.name).toBe("science");
	});

	it("builds nested hierarchy from path-based decks", () => {
		const decks = ["math", "math/algebra", "math/calculus"];
		const counts = new Map([
			["math", { new: 1, learn: 0, due: 0 }],
			["math/algebra", { new: 5, learn: 1, due: 3 }],
			["math/calculus", { new: 10, learn: 2, due: 4 }],
		]);

		const tree = buildDeckTree(decks, counts);

		expect(tree).toHaveLength(1);
		const math = tree[0]!;
		expect(math.name).toBe("math");
		expect(math.children).toHaveLength(2);
		// Aggregated: own (1,0,0) + algebra (5,1,3) + calculus (10,2,4)
		expect(math.newCount).toBe(16);
		expect(math.learnCount).toBe(3);
		expect(math.dueCount).toBe(7);

		expect(math.children[0]!.name).toBe("algebra");
		expect(math.children[0]!.newCount).toBe(5);
		expect(math.children[1]!.name).toBe("calculus");
		expect(math.children[1]!.newCount).toBe(10);
	});

	it("creates intermediate nodes for deep paths", () => {
		const decks = ["a/b/c"];
		const counts = new Map([
			["a/b/c", { new: 3, learn: 0, due: 1 }],
		]);

		const tree = buildDeckTree(decks, counts);

		expect(tree).toHaveLength(1);
		const a = tree[0]!;
		expect(a.name).toBe("a");
		expect(a.fullPath).toBe("a");
		// Aggregated from child
		expect(a.newCount).toBe(3);
		expect(a.dueCount).toBe(1);

		const b = a.children[0]!;
		expect(b.name).toBe("b");
		expect(b.fullPath).toBe("a/b");
		expect(b.newCount).toBe(3);

		const c = b.children[0]!;
		expect(c.name).toBe("c");
		expect(c.fullPath).toBe("a/b/c");
		expect(c.newCount).toBe(3);
	});

	it("sorts children alphabetically", () => {
		const decks = ["z", "a", "m"];
		const counts = new Map<string, { new: number; learn: number; due: number }>();

		const tree = buildDeckTree(decks, counts);

		expect(tree.map((n) => n.name)).toEqual(["a", "m", "z"]);
	});

	it("defaults missing counts to zero", () => {
		const decks = ["orphan"];
		const counts = new Map<string, { new: number; learn: number; due: number }>();

		const tree = buildDeckTree(decks, counts);

		expect(tree[0]!.newCount).toBe(0);
		expect(tree[0]!.learnCount).toBe(0);
		expect(tree[0]!.dueCount).toBe(0);
	});

	it("handles mix of root and nested decks", () => {
		const decks = ["history", "math/algebra", "math/calculus", "science/physics/quantum"];
		const counts = new Map([
			["history", { new: 1, learn: 0, due: 0 }],
			["math/algebra", { new: 2, learn: 0, due: 0 }],
			["math/calculus", { new: 3, learn: 0, due: 0 }],
			["science/physics/quantum", { new: 4, learn: 0, due: 0 }],
		]);

		const tree = buildDeckTree(decks, counts);

		expect(tree).toHaveLength(3);
		expect(tree[0]!.name).toBe("history");
		expect(tree[1]!.name).toBe("math");
		expect(tree[1]!.newCount).toBe(5); // algebra + calculus
		expect(tree[2]!.name).toBe("science");
		expect(tree[2]!.newCount).toBe(4); // quantum propagated up
	});
});

describe("pruneDeckTree", () => {
	it("returns empty array for empty tree", () => {
		expect(pruneDeckTree([], new Set())).toEqual([]);
	});

	it("keeps all nodes when all have cards", () => {
		const decks = ["math", "math/algebra"];
		const counts = new Map([
			["math", { new: 1, learn: 0, due: 0 }],
			["math/algebra", { new: 2, learn: 0, due: 0 }],
		]);
		const tree = buildDeckTree(decks, counts);
		const pruned = pruneDeckTree(tree, new Set(decks));

		expect(pruned).toHaveLength(1);
		expect(pruned[0]!.name).toBe("math");
		expect(pruned[0]!.children).toHaveLength(1);
		expect(pruned[0]!.children[0]!.name).toBe("algebra");
	});

	it("prunes single intermediate node", () => {
		// Study/Math has cards, Study does not
		const decks = ["Study/Math"];
		const counts = new Map([
			["Study/Math", { new: 5, learn: 0, due: 0 }],
		]);
		const tree = buildDeckTree(decks, counts);
		const pruned = pruneDeckTree(tree, new Set(decks));

		// Study is pruned, Math promoted to root
		expect(pruned).toHaveLength(1);
		expect(pruned[0]!.name).toBe("Math");
		expect(pruned[0]!.fullPath).toBe("Study/Math");
		expect(pruned[0]!.newCount).toBe(5);
	});

	it("prunes multiple intermediate levels", () => {
		// Only the leaf has cards
		const decks = ["A/B/C"];
		const counts = new Map([
			["A/B/C", { new: 3, learn: 0, due: 1 }],
		]);
		const tree = buildDeckTree(decks, counts);
		const pruned = pruneDeckTree(tree, new Set(decks));

		// A and B pruned, C promoted to root
		expect(pruned).toHaveLength(1);
		expect(pruned[0]!.name).toBe("C");
		expect(pruned[0]!.fullPath).toBe("A/B/C");
		expect(pruned[0]!.newCount).toBe(3);
	});

	it("keeps parent when it has cards, prunes grandparent", () => {
		// Study has no cards, Math has cards, Algebra has cards
		const decks = ["Study/Math", "Study/Math/Algebra"];
		const counts = new Map([
			["Study/Math", { new: 1, learn: 0, due: 0 }],
			["Study/Math/Algebra", { new: 2, learn: 0, due: 0 }],
		]);
		const tree = buildDeckTree(decks, counts);
		const pruned = pruneDeckTree(tree, new Set(decks));

		// Study pruned, Math becomes root with Algebra child
		expect(pruned).toHaveLength(1);
		expect(pruned[0]!.name).toBe("Math");
		expect(pruned[0]!.fullPath).toBe("Study/Math");
		expect(pruned[0]!.children).toHaveLength(1);
		expect(pruned[0]!.children[0]!.name).toBe("Algebra");
	});

	it("promotes siblings when parent has no cards", () => {
		// Math has no cards, but Algebra and Calculus do
		const decks = ["Math/Algebra", "Math/Calculus"];
		const counts = new Map([
			["Math/Algebra", { new: 2, learn: 0, due: 0 }],
			["Math/Calculus", { new: 3, learn: 0, due: 0 }],
		]);
		const tree = buildDeckTree(decks, counts);
		const pruned = pruneDeckTree(tree, new Set(decks));

		// Math pruned, both promoted to root
		expect(pruned).toHaveLength(2);
		expect(pruned[0]!.name).toBe("Algebra");
		expect(pruned[1]!.name).toBe("Calculus");
	});

	it("sorts promoted children alphabetically", () => {
		const decks = ["X/Zebra", "X/Apple"];
		const counts = new Map([
			["X/Zebra", { new: 1, learn: 0, due: 0 }],
			["X/Apple", { new: 1, learn: 0, due: 0 }],
		]);
		const tree = buildDeckTree(decks, counts);
		const pruned = pruneDeckTree(tree, new Set(decks));

		expect(pruned).toHaveLength(2);
		expect(pruned[0]!.name).toBe("Apple");
		expect(pruned[1]!.name).toBe("Zebra");
	});

	it("handles mix of real and intermediate nodes", () => {
		// history is real, math is intermediate (no cards), science/physics/quantum all intermediate except quantum
		const decks = ["history", "math/algebra", "math/calculus", "science/physics/quantum"];
		const counts = new Map([
			["history", { new: 1, learn: 0, due: 0 }],
			["math/algebra", { new: 2, learn: 0, due: 0 }],
			["math/calculus", { new: 3, learn: 0, due: 0 }],
			["science/physics/quantum", { new: 4, learn: 0, due: 0 }],
		]);
		const tree = buildDeckTree(decks, counts);
		const pruned = pruneDeckTree(tree, new Set(decks));

		// history stays, math pruned (algebra+calculus promoted), science+physics pruned (quantum promoted)
		expect(pruned).toHaveLength(4);
		expect(pruned.map((n) => n.name)).toEqual(["algebra", "calculus", "history", "quantum"]);
	});
});
