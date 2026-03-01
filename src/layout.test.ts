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
