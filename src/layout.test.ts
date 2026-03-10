import { describe, it, expect } from "vitest";
import { computeLayout, DEFAULT_LAYOUT_CONFIG, LayoutNode } from "./layout";
import { OsmosisNode, OsmosisTree } from "./types";

function makeNode(
	id: string,
	type: OsmosisNode["type"],
	content: string,
	depth: number,
	children: OsmosisNode[] = [],
): OsmosisNode {
	return {
		id,
		type,
		depth,
		content,
		children,
		range: { start: 0, end: content.length },
		isTranscluded: false,
	};
}

function makeTree(root: OsmosisNode): OsmosisTree {
	return { root, filePath: "test.md", contentHash: "abc" };
}

/** Check that no two visible nodes overlap. */
function assertNoOverlap(nodes: LayoutNode[]): void {
	const visible = nodes.filter((n) => n.source.type !== "root");
	for (let i = 0; i < visible.length; i++) {
		const nodeA = visible[i];
		if (!nodeA) continue;
		for (let j = i + 1; j < visible.length; j++) {
			const nodeB = visible[j];
			if (!nodeB) continue;
			const a = nodeA.rect;
			const b = nodeB.rect;
			const overlapX = a.x < b.x + b.width && a.x + a.width > b.x;
			const overlapY = a.y < b.y + b.height && a.y + a.height > b.y;
			if (overlapX && overlapY) {
				throw new Error(
					`Nodes "${nodeA.source.content}" and "${nodeB.source.content}" overlap: ` +
					`(${String(a.x)},${String(a.y)},${String(a.width)},${String(a.height)}) vs (${String(b.x)},${String(b.y)},${String(b.width)},${String(b.height)})`,
				);
			}
		}
	}
}

describe("computeLayout", () => {
	it("lays out a single heading", () => {
		const root = makeNode("r", "root", "", 0, [
			makeNode("h1", "heading", "Hello", 1),
		]);
		const result = computeLayout(makeTree(root));

		expect(result.nodes.length).toBe(2); // root + heading
		const heading = result.nodes.find((n) => n.source.id === "h1");
		expect(heading).toBeDefined();
		expect(heading!.rect.width).toBeGreaterThan(0);
		expect(heading!.rect.height).toBeGreaterThan(0);
	});

	it("places children to the right of parent in left-right mode", () => {
		const root = makeNode("r", "root", "", 0, [
			makeNode("h1", "heading", "Parent", 1, [
				makeNode("h2", "heading", "Child", 2),
			]),
		]);
		const result = computeLayout(makeTree(root), { direction: "left-right" });

		const parent = result.nodes.find((n) => n.source.id === "h1")!;
		const child = result.nodes.find((n) => n.source.id === "h2")!;
		expect(child.rect.x).toBeGreaterThan(parent.rect.x + parent.rect.width);
	});

	it("places children below parent in top-down mode", () => {
		const root = makeNode("r", "root", "", 0, [
			makeNode("h1", "heading", "Parent", 1, [
				makeNode("h2", "heading", "Child", 2),
			]),
		]);
		const result = computeLayout(makeTree(root), { direction: "top-down" });

		const parent = result.nodes.find((n) => n.source.id === "h1")!;
		const child = result.nodes.find((n) => n.source.id === "h2")!;
		expect(child.rect.y).toBeGreaterThan(parent.rect.y + parent.rect.height);
	});

	it("does not overlap siblings", () => {
		const root = makeNode("r", "root", "", 0, [
			makeNode("h1", "heading", "Parent", 1, [
				makeNode("c1", "heading", "Child A", 2),
				makeNode("c2", "heading", "Child B", 2),
				makeNode("c3", "heading", "Child C", 2),
			]),
		]);
		const result = computeLayout(makeTree(root));
		assertNoOverlap(result.nodes);
	});

	it("does not overlap in a deep tree", () => {
		const root = makeNode("r", "root", "", 0, [
			makeNode("h1", "heading", "A", 1, [
				makeNode("h1a", "heading", "A1", 2, [
					makeNode("h1a1", "bullet", "A1x", 0),
					makeNode("h1a2", "bullet", "A1y", 0),
				]),
				makeNode("h1b", "heading", "A2", 2, [
					makeNode("h1b1", "bullet", "A2x", 0),
				]),
			]),
			makeNode("h2", "heading", "B", 1, [
				makeNode("h2a", "heading", "B1", 2),
			]),
		]);
		const result = computeLayout(makeTree(root));
		assertNoOverlap(result.nodes);
	});

	it("respects hierarchy — children are deeper than parents", () => {
		const root = makeNode("r", "root", "", 0, [
			makeNode("h1", "heading", "Level 1", 1, [
				makeNode("h2", "heading", "Level 2", 2, [
					makeNode("h3", "heading", "Level 3", 3),
				]),
			]),
		]);
		const result = computeLayout(makeTree(root));

		const l1 = result.nodes.find((n) => n.source.id === "h1")!;
		const l2 = result.nodes.find((n) => n.source.id === "h2")!;
		const l3 = result.nodes.find((n) => n.source.id === "h3")!;

		expect(l1.depth).toBe(1);
		expect(l2.depth).toBe(2);
		expect(l3.depth).toBe(3);

		// In left-right: x increases with depth
		expect(l2.rect.x).toBeGreaterThan(l1.rect.x);
		expect(l3.rect.x).toBeGreaterThan(l2.rect.x);
	});

	it("collapses children when node is in collapsedIds", () => {
		const root = makeNode("r", "root", "", 0, [
			makeNode("h1", "heading", "Parent", 1, [
				makeNode("c1", "heading", "Child A", 2),
				makeNode("c2", "heading", "Child B", 2),
			]),
		]);
		const result = computeLayout(makeTree(root), {}, new Set(["h1"]));

		// Only root + parent should be in the layout
		const visibleIds = result.nodes.map((n) => n.source.id);
		expect(visibleIds).toContain("h1");
		expect(visibleIds).not.toContain("c1");
		expect(visibleIds).not.toContain("c2");
	});

	it("uses externally measured sizes", () => {
		const root = makeNode("r", "root", "", 0, [
			makeNode("h1", "heading", "Tiny", 1),
		]);
		const sizes = new Map([["h1", { width: 200, height: 50 }]]);
		const result = computeLayout(makeTree(root), {}, undefined, sizes);

		const h1 = result.nodes.find((n) => n.source.id === "h1")!;
		const cfg = DEFAULT_LAYOUT_CONFIG;
		expect(h1.rect.width).toBe(200 + cfg.nodePaddingX * 2);
		expect(h1.rect.height).toBe(50 + cfg.nodePaddingY * 2);
	});

	it("computes correct bounds", () => {
		const root = makeNode("r", "root", "", 0, [
			makeNode("h1", "heading", "Node A", 1),
			makeNode("h2", "heading", "Node B", 1),
		]);
		const result = computeLayout(makeTree(root));

		expect(result.bounds.width).toBeGreaterThan(0);
		expect(result.bounds.height).toBeGreaterThan(0);
		expect(result.bounds.x2).toBeGreaterThan(result.bounds.x1);
		expect(result.bounds.y2).toBeGreaterThan(result.bounds.y1);
	});

	it("handles empty tree", () => {
		const root = makeNode("r", "root", "", 0);
		const result = computeLayout(makeTree(root));

		expect(result.nodes.length).toBe(1); // just root
		expect(result.bounds.width).toBe(0);
		expect(result.bounds.height).toBe(0);
	});

	it("handles variable node sizes without overlap", () => {
		const root = makeNode("r", "root", "", 0, [
			makeNode("h1", "heading", "Short", 1),
			makeNode("h2", "heading", "This is a much longer heading with many words", 1),
			makeNode("h3", "heading", "Mid", 1),
		]);
		const result = computeLayout(makeTree(root));
		assertNoOverlap(result.nodes);
	});

	// ─── Balance Mode Tests ─────────────────────────────────────────

	it("one-side right: all children to the right of root", () => {
		const root = makeNode("r", "root", "", 0, [
			makeNode("a", "heading", "A", 1),
			makeNode("b", "heading", "B", 1),
			makeNode("c", "heading", "C", 1),
		]);
		const result = computeLayout(makeTree(root), { balance: "one-side", layoutSide: "right" });
		const visible = result.nodes.filter((n) => n.source.type !== "root");
		for (const node of visible) {
			expect(node.rect.x).toBeGreaterThanOrEqual(0);
			expect(node.side).toBe("primary");
		}
	});

	it("one-side left: all children to the left (mirrored)", () => {
		const root = makeNode("r", "root", "", 0, [
			makeNode("a", "heading", "A", 1),
			makeNode("b", "heading", "B", 1),
			makeNode("c", "heading", "C", 1),
		]);
		const result = computeLayout(makeTree(root), { balance: "one-side", layoutSide: "left" });
		const visible = result.nodes.filter((n) => n.source.type !== "root");
		for (const node of visible) {
			expect(node.rect.x + node.rect.width).toBeLessThanOrEqual(0);
			expect(node.side).toBe("secondary");
		}
		assertNoOverlap(result.nodes);
	});

	it("both-sides: children split left and right of root", () => {
		const root = makeNode("r", "root", "", 0, [
			makeNode("a", "heading", "A", 1),
			makeNode("b", "heading", "B", 1),
			makeNode("c", "heading", "C", 1),
			makeNode("d", "heading", "D", 1),
		]);
		const result = computeLayout(makeTree(root), { balance: "both-sides" });
		const visible = result.nodes.filter((n) => n.source.type !== "root");
		const primaryNodes = visible.filter((n) => n.side === "primary");
		const secondaryNodes = visible.filter((n) => n.side === "secondary");

		expect(primaryNodes.length).toBeGreaterThan(0);
		expect(secondaryNodes.length).toBeGreaterThan(0);

		// Primary nodes should have positive x, secondary negative
		for (const node of primaryNodes) {
			expect(node.rect.x).toBeGreaterThanOrEqual(0);
		}
		for (const node of secondaryNodes) {
			expect(node.rect.x + node.rect.width).toBeLessThanOrEqual(0);
		}
		assertNoOverlap(result.nodes);
	});

	it("alternating: children alternate sides", () => {
		const root = makeNode("r", "root", "", 0, [
			makeNode("a", "heading", "A", 1),
			makeNode("b", "heading", "B", 1),
			makeNode("c", "heading", "C", 1),
			makeNode("d", "heading", "D", 1),
		]);
		const result = computeLayout(makeTree(root), { balance: "alternating" });
		const a = result.nodes.find((n) => n.source.id === "a")!;
		const b = result.nodes.find((n) => n.source.id === "b")!;
		const c = result.nodes.find((n) => n.source.id === "c")!;
		const d = result.nodes.find((n) => n.source.id === "d")!;

		// Even indices (A, C) on primary side, odd (B, D) on secondary
		expect(a.side).toBe("primary");
		expect(b.side).toBe("secondary");
		expect(c.side).toBe("primary");
		expect(d.side).toBe("secondary");
		assertNoOverlap(result.nodes);
	});

	it("both-sides with per-node side override", () => {
		const root = makeNode("r", "root", "", 0, [
			makeNode("a", "heading", "A", 1),
			makeNode("b", "heading", "B", 1),
			makeNode("c", "heading", "C", 1),
			makeNode("d", "heading", "D", 1),
		]);
		// Force node "a" to the left side
		const nodeSides = new Map([["a", "left" as const]]);
		const result = computeLayout(makeTree(root), { balance: "both-sides" }, undefined, undefined, undefined, nodeSides);
		const a = result.nodes.find((n) => n.source.id === "a")!;
		expect(a.side).toBe("secondary");
		expect(a.rect.x + a.rect.width).toBeLessThanOrEqual(0);
		assertNoOverlap(result.nodes);
	});

	it("both-sides in top-down mode: children split above and below", () => {
		const root = makeNode("r", "root", "", 0, [
			makeNode("a", "heading", "A", 1),
			makeNode("b", "heading", "B", 1),
			makeNode("c", "heading", "C", 1),
			makeNode("d", "heading", "D", 1),
		]);
		const result = computeLayout(makeTree(root), { direction: "top-down", balance: "both-sides" });
		const visible = result.nodes.filter((n) => n.source.type !== "root");
		const primaryNodes = visible.filter((n) => n.side === "primary");
		const secondaryNodes = visible.filter((n) => n.side === "secondary");

		expect(primaryNodes.length).toBeGreaterThan(0);
		expect(secondaryNodes.length).toBeGreaterThan(0);

		// In top-down + both-sides: primary below (positive y), secondary above (negative y)
		for (const node of primaryNodes) {
			expect(node.rect.y).toBeGreaterThanOrEqual(0);
		}
		for (const node of secondaryNodes) {
			expect(node.rect.y + node.rect.height).toBeLessThanOrEqual(0);
		}
		assertNoOverlap(result.nodes);
	});

	it("both-sides with single child falls back to one-side", () => {
		const root = makeNode("r", "root", "", 0, [
			makeNode("a", "heading", "A", 1),
		]);
		const result = computeLayout(makeTree(root), { balance: "both-sides" });
		const a = result.nodes.find((n) => n.source.id === "a")!;
		// Single child: both-sides falls back since root.children.length <= 1
		expect(a.rect.x).toBeGreaterThanOrEqual(0);
		expect(a.side).toBe("primary");
	});

	it("both-sides works with root → H1 → H2s structure (real Obsidian tree)", () => {
		// Real tree: root (virtual) → H1 (single child) → H2s (branches)
		const root = makeNode("r", "root", "", 0, [
			makeNode("h1", "heading", "My Note", 1, [
				makeNode("a", "heading", "Section A", 2),
				makeNode("b", "heading", "Section B", 2),
				makeNode("c", "heading", "Section C", 2),
				makeNode("d", "heading", "Section D", 2),
			]),
		]);
		const result = computeLayout(makeTree(root), { balance: "both-sides" });
		const visible = result.nodes.filter((n) => n.source.type !== "root");
		const h2s = visible.filter((n) => n.depth === 2);
		const primaryH2s = h2s.filter((n) => n.side === "primary");
		const secondaryH2s = h2s.filter((n) => n.side === "secondary");

		expect(primaryH2s.length).toBeGreaterThan(0);
		expect(secondaryH2s.length).toBeGreaterThan(0);

		// H1 should be positioned; primary H2s to the right, secondary to the left
		const h1 = result.nodes.find((n) => n.source.id === "h1")!;
		for (const node of primaryH2s) {
			expect(node.rect.x).toBeGreaterThan(h1.rect.x);
		}
		for (const node of secondaryH2s) {
			expect(node.rect.x + node.rect.width).toBeLessThan(h1.rect.x);
		}
		assertNoOverlap(result.nodes);
	});

	it("alternating works with root → H1 → H2s structure", () => {
		const root = makeNode("r", "root", "", 0, [
			makeNode("h1", "heading", "My Note", 1, [
				makeNode("a", "heading", "A", 2),
				makeNode("b", "heading", "B", 2),
				makeNode("c", "heading", "C", 2),
				makeNode("d", "heading", "D", 2),
			]),
		]);
		const result = computeLayout(makeTree(root), { balance: "alternating" });
		const a = result.nodes.find((n) => n.source.id === "a")!;
		const b = result.nodes.find((n) => n.source.id === "b")!;
		expect(a.side).toBe("primary");
		expect(b.side).toBe("secondary");
		assertNoOverlap(result.nodes);
	});

	// ─── Regression Tests ──────────────────────────────────────────

	it("one-side left: no overlap in deep tree (mirror fix)", () => {
		const root = makeNode("r", "root", "", 0, [
			makeNode("h1", "heading", "Root", 1, [
				makeNode("a", "heading", "A", 2, [
					makeNode("a1", "bullet", "A1", 0),
					makeNode("a2", "bullet", "A2", 0),
					makeNode("a3", "bullet", "A3", 0),
				]),
				makeNode("b", "heading", "B", 2, [
					makeNode("b1", "bullet", "B1", 0),
					makeNode("b2", "bullet", "B2", 0),
				]),
			]),
		]);
		const result = computeLayout(makeTree(root), { balance: "one-side", layoutSide: "left" });
		assertNoOverlap(result.nodes);
		// All visible nodes should be to the left
		const visible = result.nodes.filter((n) => n.source.type !== "root");
		for (const node of visible) {
			expect(node.rect.x + node.rect.width).toBeLessThanOrEqual(0.01);
		}
	});

	it("both-sides: no overlap with deep subtrees (repositioning fix)", () => {
		// H2s with children — the old code would overlap subtrees
		const root = makeNode("r", "root", "", 0, [
			makeNode("h1", "heading", "Note", 1, [
				makeNode("a", "heading", "Section A", 2, [
					makeNode("a1", "bullet", "Item 1", 0),
					makeNode("a2", "bullet", "Item 2", 0),
					makeNode("a3", "bullet", "Item 3", 0),
				]),
				makeNode("b", "heading", "Section B", 2, [
					makeNode("b1", "bullet", "Item 4", 0),
					makeNode("b2", "bullet", "Item 5", 0),
					makeNode("b3", "bullet", "Item 6", 0),
				]),
				makeNode("c", "heading", "Section C", 2, [
					makeNode("c1", "bullet", "Item 7", 0),
					makeNode("c2", "bullet", "Item 8", 0),
				]),
				makeNode("d", "heading", "Section D", 2, [
					makeNode("d1", "bullet", "Item 9", 0),
					makeNode("d2", "bullet", "Item 10", 0),
				]),
			]),
		]);
		const resultBoth = computeLayout(makeTree(root), { balance: "both-sides" });
		assertNoOverlap(resultBoth.nodes);

		const resultAlt = computeLayout(makeTree(root), { balance: "alternating" });
		assertNoOverlap(resultAlt.nodes);
	});

	it("top-down: nodes have proper width (not swapped)", () => {
		const root = makeNode("r", "root", "", 0, [
			makeNode("h1", "heading", "A wide heading with many words", 1),
		]);
		const result = computeLayout(makeTree(root), { direction: "top-down" });
		const h1 = result.nodes.find((n) => n.source.id === "h1")!;
		// Width should be the wider dimension (based on text content)
		expect(h1.rect.width).toBeGreaterThan(h1.rect.height);
	});

	it("top-down one-side up: no overlap and nodes above root", () => {
		const root = makeNode("r", "root", "", 0, [
			makeNode("h1", "heading", "Root", 1, [
				makeNode("a", "heading", "A", 2),
				makeNode("b", "heading", "B", 2),
			]),
		]);
		const result = computeLayout(makeTree(root), {
			direction: "top-down",
			balance: "one-side",
			layoutSide: "up",
		});
		assertNoOverlap(result.nodes);
		const h1 = result.nodes.find((n) => n.source.id === "h1")!;
		const a = result.nodes.find((n) => n.source.id === "a")!;
		// Children should be above parent (negative y)
		expect(a.rect.y + a.rect.height).toBeLessThanOrEqual(h1.rect.y + 0.01);
	});

	it("performs under 50ms for 500 nodes", () => {
		// Build a wide + deep tree: 10 top-level headings, each with 10 children, each with ~4 leaves
		const topChildren: OsmosisNode[] = [];
		let idCounter = 0;
		for (let i = 0; i < 10; i++) {
			const midChildren: OsmosisNode[] = [];
			for (let j = 0; j < 10; j++) {
				const leaves: OsmosisNode[] = [];
				for (let k = 0; k < 4; k++) {
					leaves.push(makeNode(`n${String(idCounter++)}`, "bullet", `Leaf ${String(i)}-${String(j)}-${String(k)}`, 0));
				}
				midChildren.push(makeNode(`n${String(idCounter++)}`, "heading", `Mid ${String(i)}-${String(j)}`, 2, leaves));
			}
			topChildren.push(makeNode(`n${String(idCounter++)}`, "heading", `Top ${String(i)}`, 1, midChildren));
		}
		const root = makeNode("r", "root", "", 0, topChildren);
		const tree = makeTree(root);

		const start = performance.now();
		const result = computeLayout(tree);
		const elapsed = performance.now() - start;

		// Should have ~510 nodes (10 + 100 + 400 + root)
		expect(result.nodes.length).toBeGreaterThan(400);
		expect(elapsed).toBeLessThan(50);
		assertNoOverlap(result.nodes);
	});
});
