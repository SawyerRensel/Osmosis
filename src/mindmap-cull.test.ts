import { describe, expect, it } from "vitest";
import { drawWithinBudget, fitViewBox, rectInView } from "./mindmap-cull";
import { OsmosisParser } from "./parser";
import { computeLayout } from "./layout";
import { buildPerfNote } from "../e2e/generate-perf-notes.mjs";

describe("rectInView", () => {
	const view = { x: 100, y: 100, w: 200, h: 100 };
	it("finds boxes overlapping the view", () => {
		expect(rectInView(150, 150, 10, 10, view, 0)).toBe(true);
		expect(rectInView(0, 0, 50, 50, view, 0)).toBe(false);
	});
	it("treats touching edges as outside", () => {
		expect(rectInView(300, 150, 10, 10, view, 0)).toBe(false);
		expect(rectInView(50, 150, 50, 10, view, 0)).toBe(false);
	});
	it("grows the view by the margin", () => {
		expect(rectInView(310, 150, 10, 10, view, 0)).toBe(false);
		expect(rectInView(310, 150, 10, 10, view, 20)).toBe(true);
	});
});

describe("fitViewBox", () => {
	it("matches the fit the view has always computed", () => {
		const { viewBox, zoom } = fitViewBox(1000, 500, 800, 600, 0.1, 5);
		expect(zoom).toBeCloseTo(0.8);
		expect(viewBox.w).toBeCloseTo(1000);
		expect(viewBox.h).toBeCloseTo(750);
		expect(viewBox.x).toBeCloseTo(0);
		expect(viewBox.y).toBeCloseTo(-125);
	});
	it("clamps to the zoom range and centres the content", () => {
		const tall = fitViewBox(400, 100_000, 800, 600, 0.1, 5);
		expect(tall.zoom).toBe(0.1);
		expect(tall.viewBox.y + tall.viewBox.h / 2).toBeCloseTo(50_000);
		expect(fitViewBox(10, 10, 800, 600, 0.1, 5).zoom).toBe(5);
	});
	it("falls back to the content size for a zero-sized container", () => {
		const { viewBox, zoom } = fitViewBox(300, 200, 0, 0, 0.1, 5);
		expect(zoom).toBe(1);
		expect(viewBox).toEqual({ x: 0, y: 0, w: 300, h: 200 });
	});
});

describe("drawWithinBudget", () => {
	it("draws urgent items first and defers what does not fit", () => {
		let t = 0;
		const drawn: string[] = [];
		const left = drawWithinBudget(["a", "b"], ["c", "d"], 1.5, () => t, (item) => {
			drawn.push(item);
			t += 1;
		});
		expect(drawn).toEqual(["a", "b"]);
		expect(left).toEqual(["c", "d"]);
	});
	it("always draws at least one item", () => {
		let t = 0;
		const drawn: number[] = [];
		const left = drawWithinBudget([], [1, 2], 0, () => t, (item) => {
			drawn.push(item);
			t += 10;
		});
		expect(drawn).toEqual([1]);
		expect(left).toEqual([2]);
	});
	it("draws everything when time allows", () => {
		const drawn: number[] = [];
		expect(drawWithinBudget([1], [2, 3], 8, () => 0, (i) => drawn.push(i))).toEqual([]);
		expect(drawn).toEqual([1, 2, 3]);
	});
});

/**
 * How much a cull pass has to do on the perf notes: nodes in view at the
 * opening fit, and nodes entering per frame of a steady pan. Default layout
 * sizes, so real (measured) node sizes shift the counts. Reported, not
 * asserted.
 */
describe("Perf notes cull workload (reported, not asserted)", () => {
	const parser = new OsmosisParser();
	const cases = [
		{ name: "Perf 10k", lines: 10000, other: "Perf 3k", seed: 10, cw: 1600, ch: 1000 },
		{ name: "Perf 3k", lines: 3000, other: "Perf 10k", seed: 3, cw: 390, ch: 760 },
	];
	for (const c of cases) {
		it(`${c.name} in a ${c.cw}×${c.ch} viewport`, () => {
			const tree = parser.parse(buildPerfNote(c.name, c.lines, c.other, c.seed), `${c.name}.md`);
			const layout = computeLayout(tree);
			const pad = 50;
			const ox = -layout.bounds.x1 + pad;
			const oy = -layout.bounds.y1 + pad;
			const nodes = layout.nodes.filter((n) => n.source.type !== "root");
			const visible = (view: { x: number; y: number; w: number; h: number }, margin: number): Set<LayoutNode> => {
				const out = new Set<LayoutNode>();
				for (const n of nodes) {
					if (rectInView(n.rect.x + ox, n.rect.y + oy, n.rect.width, n.rect.height, view, margin)) out.add(n);
				}
				return out;
			};
			const fit = fitViewBox(layout.bounds.width + pad * 2, layout.bounds.height + pad * 2, c.cw, c.ch, 0.1, 5);
			const atFit = visible(fit.viewBox, 200);
			// The first frame before this change: the container's size at zoom 1, top-left.
			const before = visible({ x: 0, y: 0, w: c.cw, h: c.ch }, 200);
			let lost = 0;
			for (const n of before) if (!atFit.has(n)) lost++;
			// A pan of 40 screen px per frame, down, at fit zoom and at zoom 1.
			const enters = (zoom: number, start: { x: number; y: number }): number => {
				const view = { x: start.x, y: start.y, w: c.cw / zoom, h: c.ch / zoom };
				let prev = visible(view, 200);
				let max = 0;
				for (let f = 0; f < 30; f++) {
					view.y += 40 / zoom;
					const next = visible(view, 200);
					let entered = 0;
					for (const n of next) if (!prev.has(n)) entered++;
					max = Math.max(max, entered);
					prev = next;
				}
				return max;
			};
			const mid = { x: fit.viewBox.x + fit.viewBox.w / 2, y: fit.viewBox.y + fit.viewBox.h / 2 };
			console.debug(
				`[perf] ${c.name}: map ${Math.round(layout.bounds.width)}×${Math.round(layout.bounds.height)}, ` +
				`fit zoom ${fit.zoom.toFixed(3)}, nodes in view at fit ${atFit.size} of ${nodes.length}; ` +
				`old first frame drew ${before.size}, ${lost} of them thrown away by the fit; ` +
				`max entering per 40px frame: at fit ${enters(fit.zoom, fit.viewBox)}, at zoom 1 ${enters(1, { x: mid.x - c.cw / 2, y: mid.y })}`,
			);
			expect(atFit.size).toBeGreaterThan(0);
		});
	}
});

type LayoutNode = ReturnType<typeof computeLayout>["nodes"][number];
