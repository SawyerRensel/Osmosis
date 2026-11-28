/**
 * Benchmarks for the near tier's per-frame JS on the "Perf 3k" note
 * (`e2e/generate-perf-notes.mjs`), for T141 (`Cosmos - 60 fps on Perf 3k`).
 * They report numbers rather than assert them: wall-clock limits are flaky on
 * this machine (see parser.test.ts). Read the `[perf]` lines in the output.
 */
import { describe, expect, it } from "vitest";
import { OsmosisParser } from "../parser";
import { buildGraph } from "./model";
import { nearMarkdown, panelBoxEm } from "./near";
import { holeMask, type PanelHole } from "./occlusion";
import { buildPerfNote } from "../../e2e/generate-perf-notes.mjs";

const RUNS = 7;

function median(run: () => void): number {
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

describe("Cosmos near tier benchmarks on Perf 3k (reported, not asserted)", () => {
	const markdown: string = buildPerfNote("Perf 3k", 3000, "Perf 10k", 3);
	const tree = new OsmosisParser().parse(markdown, "Perf 3k.md");
	const model = buildGraph([{ tree, cache: {} }], () => null);
	const nodes = model.nodes;

	it("nearMarkdown over every node (the tier asks it of every node near enough, every frame)", () => {
		let shown = 0;
		const ms = median(() => {
			shown = 0;
			for (const node of nodes) if (nearMarkdown(node) !== null) shown++;
		});
		console.debug(`[perf] nearMarkdown × ${nodes.length} nodes: ${ms.toFixed(2)} ms (${((ms * 1000) / nodes.length).toFixed(2)} µs/node, ${shown} with a panel)`);
		expect(shown).toBeGreaterThan(0);
	});

	it("panelBoxEm over every node (asked of every candidate whose centre is off screen)", () => {
		const ms = median(() => {
			for (const node of nodes) panelBoxEm(node);
		});
		console.debug(`[perf] panelBoxEm × ${nodes.length} nodes: ${ms.toFixed(2)} ms (${((ms * 1000) / nodes.length).toFixed(2)} µs/node)`);
		expect(ms).toBeGreaterThan(0);
	});

	it("holeMask for 48 panels with 8 holes each (one frame of mask strings)", () => {
		const holes: PanelHole[] = Array.from({ length: 8 }, (_, i) => ({ left: i * 13.25, top: i * 7.5, width: 80, height: 18, radius: 6 }));
		let length = 0;
		const ms = median(() => {
			for (let p = 0; p < 48; p++) {
				const mask = holeMask(holes.map((h) => ({ ...h, left: h.left + p * 0.25 })));
				length = mask!.image.length + mask!.size.length + mask!.position.length;
			}
		});
		console.debug(`[perf] holeMask × 48 panels × 8 holes: ${ms.toFixed(2)} ms; ${length} chars of mask CSS per panel (${8 * 6 + 1} layers)`);
		expect(length).toBeGreaterThan(0);
	});
});
