import { describe, expect, it } from "vitest";
import { OsmosisParser } from "./parser";
import { computeLayout, type LayoutResult, type NodeSizeMap } from "./layout";
import type { OsmosisNode, OsmosisTree } from "./types";
import {
	PROBE_BIG, PROBE_SMALL, measureOrder, planFirstView, probeSizes, settledWith,
} from "./mindmap-progressive";
import { buildPerfNote } from "../e2e/generate-perf-notes.mjs";

const parser = new OsmosisParser();

function allNodes(tree: OsmosisTree): OsmosisNode[] {
	const out: OsmosisNode[] = [];
	const walk = (n: OsmosisNode) => {
		if (n.type !== "root") out.push(n);
		n.children.forEach(walk);
	};
	walk(tree.root);
	return out;
}

/** A stand-in for MarkdownRenderer: sizes that differ from the layout's estimate. */
function trueSize(n: OsmosisNode): { width: number; height: number } {
	const len = n.content.length;
	const lines = n.content.split("\n").length;
	let height = 22 + Math.floor(len / 38) * 19 + (lines - 1) * 19;
	if (n.type === "codeblock") height += 24;
	if (n.content.includes("![[")) height += 180;
	if (n.content.includes("| ---")) height += 30;
	return { width: Math.min(230, Math.max(40, len * 6.3)), height };
}

function plan(tree: OsmosisTree, cw: number, ch: number) {
	const truth = new Map(allNodes(tree).map((n) => [n.id, trueSize(n)]));
	const sizes: NodeSizeMap = new Map();
	const pending = new Set(truth.keys());
	const layoutOf = (s: NodeSizeMap) => computeLayout(tree, {}, undefined, s);
	return {
		truth, sizes, pending, layoutOf,
		run: () => planFirstView({
			layoutOf, sizes, pending,
			measure: (ids) => {
				for (const id of ids) {
					sizes.set(id, truth.get(id)!);
					pending.delete(id);
				}
				return Promise.resolve();
			},
			container: { w: cw, h: ch }, padding: 50, minZoom: 0.1, maxZoom: 5, margin: 200,
		}),
	};
}

function pos(layout: LayoutResult, id: string): { x: number; y: number } {
	const n = layout.nodes.find((l) => l.source.id === id)!;
	return { x: n.rect.x, y: n.rect.y };
}

describe("settledWith", () => {
	it("settles nodes whose place does not depend on an unmeasured node", () => {
		const tree = parser.parse("# Top\n\n- a\n- b\n- c\n- d\n", "t.md");
		const [top, a, b, c, d] = allNodes(tree);
		const sizes: NodeSizeMap = new Map([[a!.id, { width: 50, height: 20 }], [c!.id, { width: 50, height: 20 }], [d!.id, { width: 50, height: 20 }], [top!.id, { width: 50, height: 20 }]]);
		const pending = new Set([b!.id]);
		const layoutOf = (s: NodeSizeMap) => computeLayout(tree, {}, undefined, s);
		const base = layoutOf(sizes);
		const probes = [layoutOf(probeSizes(sizes, pending, PROBE_BIG)), layoutOf(probeSizes(sizes, pending, PROBE_SMALL))];
		const settled = settledWith(base, probes, pending, c!.id);
		// c and d sit below b, so they move together whatever b measures;
		// a sits above b, and Top is centred on all four.
		expect([...settled].sort()).toEqual([c!.id, d!.id].sort());
		expect(settled.has(b!.id)).toBe(false);
	});
});

describe("measureOrder", () => {
	it("puts laid-out nodes nearest the centre first and folded ones last", () => {
		const tree = parser.parse("# Top\n\n- a\n- b\n\t- folded\n- c\n", "t.md");
		const [, a, b, folded, c] = allNodes(tree);
		const layout = computeLayout(tree, {}, new Set([b!.id]));
		const pending = new Set([a!.id, folded!.id, c!.id]);
		const cRect = layout.nodes.find((n) => n.source.id === c!.id)!.rect;
		const order = measureOrder(layout, pending, { x: cRect.x, y: cRect.y });
		expect(order).toEqual([c!.id, a!.id, folded!.id]);
	});
});

describe("planFirstView", () => {
	it("returns null when the whole map fits", async () => {
		const tree = parser.parse("# Top\n\n- a\n- b\n", "t.md");
		expect(await plan(tree, 1600, 1000).run()).toBeNull();
	});

	// Measured: how much of each perf note is measured before the first view,
	// and the no-jump property: every node drawn at the first view keeps its
	// place relative to the anchor once every node is measured.
	const cases = [
		{ name: "Perf 10k", lines: 10000, other: "Perf 3k", seed: 10, cw: 1600, ch: 1000 },
		{ name: "Perf 3k", lines: 3000, other: "Perf 10k", seed: 3, cw: 390, ch: 760 },
	];
	for (const c of cases) {
		it(`${c.name}: first view from a slice of the map, and nothing drawn moves after`, async () => {
			const tree = parser.parse(buildPerfNote(c.name, c.lines, c.other, c.seed), `${c.name}.md`);
			const p = plan(tree, c.cw, c.ch);
			const total = p.pending.size;
			const t0 = performance.now();
			const first = (await p.run())!;
			const planMs = performance.now() - t0;
			expect(first).not.toBeNull();

			const inView = first.layout.nodes.filter((n) => {
				if (n.source.type === "root") return false;
				const ox = -first.layout.bounds.x1 + 50;
				const oy = -first.layout.bounds.y1 + 50;
				const v = first.viewBox;
				return n.rect.x + ox + n.rect.width > v.x && n.rect.x + ox < v.x + v.w
					&& n.rect.y + oy + n.rect.height > v.y && n.rect.y + oy < v.y + v.h;
			});
			const drawnInView = inView.filter((n) => first.settled.has(n.source.id));
			const missing = inView.filter((n) => !first.settled.has(n.source.id));

			// Measure the rest in steps, as the view does: every node settled at
			// one step is still settled at the next.
			let settled = first.settled;
			let steps = 0;
			const stepTimes: number[] = [];
			let current = first.layout;
			while (p.pending.size > 0) {
				const ar = current.nodes.find((n) => n.source.id === first.anchorId)!.rect;
				for (const id of measureOrder(current, p.pending, { x: ar.x, y: ar.y }).slice(0, 200)) {
					p.sizes.set(id, p.truth.get(id)!);
					p.pending.delete(id);
				}
				const s0 = performance.now();
				current = p.layoutOf(p.sizes);
				const probes = [p.layoutOf(probeSizes(p.sizes, p.pending, PROBE_BIG)), p.layoutOf(probeSizes(p.sizes, p.pending, PROBE_SMALL))];
				const next = settledWith(current, probes, p.pending, first.anchorId);
				stepTimes.push(performance.now() - s0);
				for (const id of settled) expect(next.has(id)).toBe(true);
				settled = next;
				steps++;
			}
			const final = p.layoutOf(p.sizes);
			expect(settled.size).toBe(total);
			const a0 = pos(first.layout, first.anchorId);
			const a1 = pos(final, first.anchorId);
			let worst = 0;
			for (const id of first.settled) {
				const b0 = pos(first.layout, id);
				const b1 = pos(final, id);
				worst = Math.max(worst, Math.abs((b1.x - a1.x) - (b0.x - a0.x)), Math.abs((b1.y - a1.y) - (b0.y - a0.y)));
			}
			console.debug(
				`[perf] ${c.name} first view: measured ${first.measured} of ${total} nodes; ` +
				`in view ${inView.length}, drawn ${drawnInView.length}, waiting ${missing.length} ` +
				`(${missing.map((n) => n.source.type === "heading" ? `h${String(n.source.depth)}` : n.source.type).join(" ")}); ` +
				`settled ${first.settled.size}; worst drift ${worst.toFixed(4)}; plan ${planMs.toFixed(1)} ms; ` +
				`then ${String(steps)} steps of 200, relayout + settle median ${[...stepTimes].sort((x, y) => x - y)[stepTimes.length >> 1]!.toFixed(1)} ms, max ${Math.max(...stepTimes).toFixed(1)} ms`,
			);
			expect(worst).toBeLessThan(0.01);
			expect(first.measured).toBeLessThan(total / 2);
			expect(drawnInView.length).toBeGreaterThan(inView.length / 2);
		});
	}
});
