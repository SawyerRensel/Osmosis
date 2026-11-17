/**
 * The pure stages of ONE edit commit on "Perf 10k" (T80), in the order the
 * mind map runs them: splice, renumber + normalise, parse (hash + parse),
 * tree-path maps, the measure pass's per-node cache-key loop, layout.
 * Reported, not asserted (wall-clock limits are flaky on this machine).
 */
import { describe, expect, it } from "vitest";
import { OsmosisParser } from "./parser";
import { computeLayout } from "./layout";
import { buildTreePathMap, lookupNodeStyleByPath } from "./styles";
import { groupDisplayMarkdown } from "./line-groups";
import { insertSibling, normalizeWrite, renameInFile } from "./mindmap-edit";
import type { OsmosisNode } from "./types";
import { buildPerfNote } from "../e2e/generate-perf-notes.mjs";

const RUNS = 5;

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

function all(node: OsmosisNode, out: OsmosisNode[] = []): OsmosisNode[] {
	out.push(node);
	for (const child of node.children) all(child, out);
	return out;
}

describe("one edit commit on Perf 10k (reported, not asserted)", () => {
	it("times each pure stage", () => {
		const markdown: string = buildPerfNote("Perf 10k", 10000, "Perf 3k", 10);
		const parser = new OsmosisParser();
		const tree = parser.parse(markdown, "Perf 10k.md");
		const nodes = all(tree.root);
		const target = nodes.find((n) => n.type === "bullet" && n.range.start > markdown.length / 2)!;
		expect(target).toBeDefined();
		const edited = renameInFile(markdown, target, [], `- ${target.content} edited`).text;

		const rows: [string, number][] = [
			["splice (renameInFile)", time(() => renameInFile(markdown, target, [], `- ${target.content} edited`))],
			["renumber + normalizeBlockSpacing", time(() => normalizeWrite(edited))],
			["content hash", time(() => parser.hash(edited))],
			["parse", time(() => parser.parse(edited, "Perf 10k.md"))],
			["buildTreePathMap (x1)", time(() => buildTreePathMap(tree.root))],
			["measure cache-key loop (no styles)", time(() => {
				const paths = buildTreePathMap(tree.root);
				const keys: string[] = [];
				for (const n of all(tree.root)) {
					if (n.type === "root") continue;
					lookupNodeStyleByPath(undefined, n.id, paths.get(n.id), n.blockId);
					keys.push(`${groupDisplayMarkdown(n)}:::`);
				}
			})],
			["computeLayout", time(() => computeLayout(tree))],
		];
		const total = rows.reduce((s, [, ms]) => s + ms, 0);
		for (const [label, ms] of rows) console.debug(`[perf] edit commit: ${label}: ${ms.toFixed(2)} ms`);
		console.debug(`[perf] edit commit: pure total ${total.toFixed(1)} ms (${nodes.length} nodes)`);
	});

	it("counts the visible nodes an edit's pass can keep (same id and size)", () => {
		const markdown: string = buildPerfNote("Perf 10k", 10000, "Perf 3k", 10);
		const parser = new OsmosisParser();
		const before = parser.parse(markdown, "Perf 10k.md");
		const target = all(before.root).find((n) => n.type === "bullet" && n.range.start > markdown.length / 2)!;
		const edits: [string, string][] = [
			["rename", renameInFile(markdown, target, [], `- ${target.content} edited`).text],
			["Enter (new sibling)", insertSibling(markdown, target).text],
		];
		const oldLayout = computeLayout(before);
		const oldAt = new Map(oldLayout.nodes.map((n) => [n.source.id, n]));
		for (const [label, text] of edits) {
			const layout = computeLayout(parser.parse(normalizeWrite(text), "Perf 10k.md"));
			const at = layout.nodes.find((n) => n.source.content === target.content || n.source.content === `${target.content} edited`)!;
			for (const [zoom, w, h] of [[1, 1600, 1000], [0.1, 16000, 10000]] as const) {
				const cx = at.rect.x, cy = at.rect.y;
				const inView = layout.nodes.filter((n) => n.source.type !== "root"
					&& n.rect.x + n.rect.width > cx - w / 2 && n.rect.x < cx + w / 2
					&& n.rect.y + n.rect.height > cy - h / 2 && n.rect.y < cy + h / 2);
				const kept = inView.filter((n) => {
					const old = oldAt.get(n.source.id);
					return old !== undefined && old.rect.width === n.rect.width && old.rect.height === n.rect.height;
				});
				console.debug(`[perf] edit commit reuse: ${label} at zoom ${String(zoom)}: ${kept.length}/${inView.length} visible nodes keep their group`);
			}
		}
	});
});
