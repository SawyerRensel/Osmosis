/**
 * Benchmarks for the pure 2D pipeline on the "Perf 10k" note
 * (`e2e/generate-perf-notes.mjs`). They report numbers rather than assert
 * them: wall-clock limits are flaky on this machine (see parser.test.ts).
 * Read the `[perf]` lines in the vitest output.
 */
import { describe, expect, it } from "vitest";
import { OsmosisParser } from "./parser";
import { computeLayout } from "./layout";
import { buildPerfNote } from "../e2e/generate-perf-notes.mjs";

const RUNS = 5;

function time(run: () => void): { median: number; min: number; max: number } {
	run();
	run();
	const samples: number[] = [];
	for (let i = 0; i < RUNS; i++) {
		const start = performance.now();
		run();
		samples.push(performance.now() - start);
	}
	samples.sort((a, b) => a - b);
	return { median: samples[Math.floor(RUNS / 2)]!, min: samples[0]!, max: samples[RUNS - 1]! };
}

function report(label: string, t: { median: number; min: number; max: number }): void {
	console.debug(`[perf] ${label}: median ${t.median.toFixed(1)} ms (min ${t.min.toFixed(1)}, max ${t.max.toFixed(1)}, ${RUNS} runs)`);
}

function countNodes(node: { children: readonly unknown[] }): number {
	return 1 + node.children.reduce<number>((n, child) => n + countNodes(child as { children: readonly unknown[] }), 0);
}

describe("Perf 10k benchmarks (reported, not asserted)", () => {
	const markdown: string = buildPerfNote("Perf 10k", 10000, "Perf 3k", 10);
	const parser = new OsmosisParser();

	it("parses the 10k note", () => {
		const tree = parser.parse(markdown, "Perf 10k.md");
		expect(markdown.split("\n").length).toBeGreaterThan(10000);
		report(`parse (${countNodes(tree.root)} nodes)`, time(() => parser.parse(markdown, "Perf 10k.md")));
		report("content hash (the parse cache's hit cost)", time(() => parser.hash(markdown)));
	});

	it("lays out the 10k note", () => {
		const tree = parser.parse(markdown, "Perf 10k.md");
		const layout = computeLayout(tree);
		expect(layout.nodes.length).toBeGreaterThan(1000);
		report(`computeLayout (${layout.nodes.length} nodes, default sizes)`, time(() => computeLayout(tree)));
	});
});
