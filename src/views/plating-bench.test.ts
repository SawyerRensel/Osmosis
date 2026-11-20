/**
 * Where Cosmos's plating time goes (T78, `vault/Planner/3D Graph - New
 * plates lay out without a frame stall.md`). Reported, not asserted: wall-clock
 * limits are flaky on this machine. Read the `[perf]` lines in the output.
 *
 * Canvas text is stubbed (Node has no canvas), so `measureText`/`fillText`
 * and the atlas upload cost nothing here: these numbers are the JS around them.
 */
import { describe, expect, it, vi } from "vitest";
import { Color } from "three";
import { OsmosisParser } from "../parser";
import { buildGraph, type GraphNode } from "../cosmos/model";
import { nodeColor, nodeExtent, spriteLabel } from "../cosmos/appearance";
import { nodeLook } from "../cosmos/node-style";
import { panelBoxEm, plateWidthEm } from "../cosmos/near";
import { LINE_PLATE_HEIGHT, layoutPlate } from "../cosmos/plates";
import { FlatLayouts, flatDepth } from "../cosmos/flatten";
import { chargeStrengths } from "../cosmos/settle";
import { buildPerfNote } from "../../e2e/generate-perf-notes.mjs";
import { CosmosPlates, type PlateShape, type PlateSource } from "./CosmosPlates";

const RUNS = 5;

function fakeCanvas(): unknown {
	const context = {
		font: "",
		fillStyle: "",
		textBaseline: "",
		measureText: (text: string) => ({ width: 24 * text.length, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 24 * text.length }),
		fillText: () => undefined,
	};
	return { width: 0, height: 0, getContext: () => context };
}
vi.stubGlobal("createEl", () => fakeCanvas());

function time(run: () => void): number {
	run();
	run();
	const samples: number[] = [];
	for (let i = 0; i < RUNS; i++) {
		const start = performance.now();
		run();
		samples.push(performance.now() - start);
	}
	samples.sort((a, b) => a - b);
	return samples[Math.floor(RUNS / 2)]!;
}

const report = (label: string, ms: number): void => console.debug(`[perf] ${label}: median ${ms.toFixed(2)} ms`);

const COLORS = { background: "#000", text: "#fff", plate: "#222", font: "sans-serif", accent: "#f0f", found: "#ff0" };

function shapeOf(plates: CosmosPlates, graph: GraphNode): PlateShape {
	const isCore = graph.kind === "note";
	const width = graph.kind === "line" ? plateWidthEm(graph) : null;
	const text = isCore ? graph.label : spriteLabel(graph.label);
	if (width !== null) return plates.shape(text, LINE_PLATE_HEIGHT, width.textMaxEm, width.minEm);
	return plates.shape(text, isCore ? 12 : LINE_PLATE_HEIGHT, isCore ? 30 : 20);
}

describe("3D plating benchmarks (reported, not asserted)", () => {
	it("plates ~520 nodes cold (first run in this worker: unoptimised JS, as on open)", () => {
		const markdown: string = buildPerfNote("Cold", 1270, "Other", 10);
		const model = buildGraph([{ tree: new OsmosisParser().parse(markdown, "Cold.md"), cache: null }], () => null);
		const plates = new CosmosPlates(COLORS);
		let start = performance.now();
		const shapes = model.nodes.map((node) => shapeOf(plates, node));
		report(`${model.nodes.length} nodes: shape, cold`, performance.now() - start);
		start = performance.now();
		for (const node of model.nodes) nodeExtent({ width: 50, height: 5 }, panelBoxEm(node), 1);
		report(`${model.nodes.length} nodes: panelBoxEm, cold`, performance.now() - start);
		start = performance.now();
		const sources: PlateSource[] = model.nodes.map((node, i) => ({ x: i, y: i, z: i, opacity: 1, color: new Color(nodeColor(node)), shape: shapes[i]!, look: nodeLook(node.style) }));
		let writes = 0;
		do {
			plates.write(sources, true);
			writes++;
		} while (plates.queued > 0);
		report(`${model.nodes.length} nodes: write(layout) incl. building glyphs, cold, ${writes} writes`, performance.now() - start);
		start = performance.now();
		const again = model.nodes.map((node) => shapeOf(plates, node));
		report(`${model.nodes.length} nodes: shape again (cached)`, performance.now() - start);
		expect(again.length).toBe(shapes.length);
		plates.dispose();
	});

	for (const lines of [3000, 10000]) {
		it(`plates the ${lines}-line perf note`, () => {
			const markdown: string = buildPerfNote("Perf", lines, "Other", 10);
			const tree = new OsmosisParser().parse(markdown, "Perf.md");
			const model = buildGraph([{ tree, cache: null }], () => null);
			const nodes = model.nodes;
			expect(nodes.length).toBeGreaterThan(500);
			let plates = new CosmosPlates(COLORS);
			report(`${nodes.length} nodes: shape (sync part: measure + queue), empty cache`, time(() => {
				plates.dispose();
				plates = new CosmosPlates(COLORS);
				for (const node of nodes) shapeOf(plates, node);
			}));
			report(`${nodes.length} nodes: shape, every layout cached (a re-parse or hop back)`, time(() => {
				for (const node of nodes) shapeOf(plates, node);
			}));
			let writes = 0;
			report(`${nodes.length} nodes: queued glyphs built by write(), all slices`, time(() => {
				plates.dispose();
				plates = new CosmosPlates(COLORS);
				const queued: PlateSource[] = nodes.map((node, i) => ({ x: i, y: i, z: i, opacity: 1, color: new Color(), shape: shapeOf(plates, node) }));
				writes = 0;
				while (plates.queued > 0) {
					plates.write(queued, false);
					writes++;
				}
			}));
			console.debug(`[perf] ${nodes.length} nodes: ${writes} writes to drain the queue (${plates.stats().glyphMs.toFixed(1)} ms building in the last)`);
			const advance = (char: string): number => 24 * char.length;
			report(`${nodes.length} nodes: layoutPlate only (no glyph objects)`, time(() => {
				for (const node of nodes) layoutPlate(node.kind === "note" ? node.label : spriteLabel(node.label), advance, 48, 960);
			}));
			report(`${nodes.length} nodes: nodeLook`, time(() => {
				for (const node of nodes) nodeLook(node.style);
			}));
			report(`${nodes.length} nodes: panelBoxEm (extent)`, time(() => {
				for (const node of nodes) nodeExtent({ width: 50, height: 5 }, panelBoxEm(node), 1);
			}));
			report(`${nodes.length} nodes: colour`, time(() => {
				for (const node of nodes) new Color(nodeColor(node));
			}));
			const shapes = new Map(nodes.map((node) => [node.id, shapeOf(plates, node)]));
			const sizeOf = (node: GraphNode): { width: number; height: number } => {
				const panel = panelBoxEm(node);
				const plate = shapes.get(node.id)!;
				return { width: Math.max(plate.width, (panel?.width ?? 0) * 1), height: Math.max(plate.height, (panel?.height ?? 0) * 1) };
			};
			report(`${nodes.length} nodes: flat layout, cold (an edit's new tree)`, time(() => {
				new FlatLayouts().branches(nodes, flatDepth(0.75), sizeOf);
			}));
			const warm = new FlatLayouts();
			report(`${nodes.length} nodes: flat layout, warm`, time(() => {
				warm.branches(nodes, flatDepth(0.75), sizeOf);
			}));
			report(`${nodes.length} nodes: chargeStrengths`, time(() => {
				chargeStrengths(nodes.map((node) => ({ ...node, pinned: false })), -30);
			}));
			const sources: PlateSource[] = nodes.map((node, i) => ({ x: i, y: i, z: i, opacity: 1, color: new Color(nodeColor(node)), shape: shapeOf(plates, node), look: nodeLook(node.style) }));
			const glyphs = sources.reduce((sum, s) => sum + s.shape.glyphs.length, 0);
			report(`${nodes.length} plates / ${glyphs} glyphs: write(layout)`, time(() => plates.write(sources, true)));
			report(`${nodes.length} plates / ${glyphs} glyphs: write(tick)`, time(() => plates.write(sources, false)));
			plates.dispose();
		});
	}
});
