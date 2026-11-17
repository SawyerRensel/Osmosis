import { describe, expect, it } from "vitest";
import type { Card } from "../database/types";
import type { OsmosisNode } from "../types";
import type { GraphNode } from "./model";
import { HIDDEN_LABEL, nearestTarget, nodeCardKey, nodeStep, studyNode, studyTargets, targetNodeFor } from "./study";

const NOW = Date.UTC(2026, 9, 31, 12, 0, 0);
const PAST = NOW - 86_400_000;
const FUTURE = NOW + 86_400_000;
const NOTE = "tests/graph3d/Rules of the Road.md";

function card(overrides: Partial<Card> & { id: string }): Card {
	return { notePath: NOTE, deck: "tests", cardType: "line", front: "front", back: "back", typeIn: false, sourceLine: 0, ...overrides };
}

function source(overrides: Partial<OsmosisNode>): OsmosisNode {
	return { id: "h1", type: "bullet", depth: 0, content: "Port gives way to starboard", children: [], range: { start: 0, end: 10 }, ...overrides } as OsmosisNode;
}

function line(blockId: string, path = NOTE): GraphNode {
	return { id: `line:${path}#^${blockId}`, kind: "line", label: `line ${blockId}`, path, source: source({ blockId, content: `line ${blockId}`, raw: `- line ${blockId}` }) };
}

function fence(id: string): GraphNode {
	const content = `\`\`\`osmosis\nid: ${id}\n\nQuestion?\n***\nAnswer.\n\`\`\``;
	return { id: `line:${NOTE}#f${id}`, kind: "line", label: content, path: NOTE, source: source({ id: `f${id}`, type: "codeblock", content, raw: content }) };
}

describe("nodeCardKey", () => {
	it("keys a line on its note and block ID, a fence on its own ID, and nothing else", () => {
		expect(nodeCardKey(line("os-a"))).toBe(`${NOTE}#^os-a`);
		expect(nodeCardKey(fence("rr-lights"))).toBe("rr-lights");
		expect(nodeCardKey({ id: "note:x", kind: "note", label: "x", path: "x.md", source: source({ type: "root" }) })).toBeNull();
		expect(nodeCardKey({ id: "line:x#h", kind: "line", label: "plain", path: "x.md", source: source({}) })).toBeNull();
	});
});

describe("studyTargets", () => {
	it("hides due and new cards, not future ones, across several notes", () => {
		const other = "tests/graph3d/Crew Drills.md";
		const nodes = [line("os-due"), line("os-new"), line("os-later"), line("os-drill", other), line("os-none")];
		const cards = [
			card({ id: `${NOTE}#^os-due`, blockId: "os-due", due: PAST }),
			card({ id: `${NOTE}#^os-new`, blockId: "os-new" }),
			card({ id: `${NOTE}#^os-later`, blockId: "os-later", due: FUTURE }),
			card({ id: `${other}#^os-drill`, notePath: other, blockId: "os-drill", due: PAST }),
		];
		const targets = studyTargets(nodes, cards, NOW, new Set());
		expect([...targets.keys()]).toEqual([nodes[0]!.id, nodes[1]!.id, nodes[3]!.id]);
		expect(targets.get(nodes[3]!.id)).toEqual([`${other}#^os-drill`]);
	});

	it("drops keys rated this session, and the node once all are rated", () => {
		const node = fence("rr-sound");
		const cards = [
			card({ id: "rr-sound-c1", cardType: "explicit_cloze", due: PAST }),
			card({ id: "rr-sound-c2", cardType: "explicit_cloze", due: PAST }),
		];
		expect(studyTargets([node], cards, NOW, new Set()).get(node.id)).toEqual(["rr-sound-c1", "rr-sound-c2"]);
		expect(studyTargets([node], cards, NOW, new Set(["rr-sound-c1"])).get(node.id)).toEqual(["rr-sound-c2"]);
		expect(studyTargets([node], cards, NOW, new Set(["rr-sound-c1", "rr-sound-c2"])).has(node.id)).toBe(false);
	});

	it("hides occlusion cards (their masks are the near panel's job) and leaves disabled cards showing", () => {
		const occluded = line("os-diagram");
		const disabled = line("os-off");
		const occlusion = { image: "chart.png", shapes: [], target: "1", mode: "hide-all-guess-one" } as unknown as Card["occlusion"];
		const cards = [
			card({ id: `${NOTE}#^os-diagram/c1`, blockId: "os-diagram", cardType: "occlusion", occlusion, due: PAST }),
			card({ id: `${NOTE}#^os-off`, blockId: "os-off", disabled: true, due: PAST }),
		];
		expect([...studyTargets([occluded, disabled], cards, NOW, new Set())]).toEqual([[occluded.id, [`${NOTE}#^os-diagram/c1`]]]);
	});
});

describe("targetNodeFor", () => {
	it("finds a fence's node again after writing its schedule gave the node a new ID", () => {
		const cards = [
			card({ id: "rr-sound-c1", cardType: "explicit_cloze", due: PAST }),
			card({ id: "rr-sound-c2", cardType: "explicit_cloze", due: PAST }),
		];
		const before = fence("rr-sound");
		// Same fence, same `id:`, but its text (a schedule is part of it) and so its parse ID changed.
		const after: GraphNode = { ...fence("rr-sound"), id: `line:${NOTE}#rewritten` };
		const key = nodeCardKey(before)!;
		const [firstTargets, secondTargets] = [studyTargets([before], cards, NOW, new Set()), studyTargets([after], cards, NOW, new Set(["rr-sound-c1"]))];
		expect(targetNodeFor([before], firstTargets, key)).toBe(before.id);
		expect(targetNodeFor([after], secondTargets, key)).toBe(after.id);
		expect(after.id).not.toBe(before.id);
	});

	it("finds a line by its card key, and nothing that is not a target", () => {
		const [a, b] = [line("os-a"), line("os-b")];
		const targets = new Map([[b.id, ["k"]]]);
		expect(targetNodeFor([a, b], targets, nodeCardKey(b)!)).toBe(b.id);
		expect(targetNodeFor([a, b], targets, nodeCardKey(a)!)).toBeNull();
		expect(targetNodeFor([a, b], targets, "missing")).toBeNull();
	});
});

describe("nodeStep", () => {
	it("asks the first unrated key, revealed or not", () => {
		expect(nodeStep(["a", "b"], new Set())).toEqual({ asking: "a", revealed: false });
		expect(nodeStep(["a", "b"], new Set(["a"]))).toEqual({ asking: "a", revealed: true });
		expect(nodeStep([], new Set())).toBeNull();
	});
});

describe("studyNode", () => {
	it("paints an occlusion card's masks instead of blanking its panel: covered while hidden, ringed once revealed", () => {
		const node = line("os-diagram");
		const occlusion = { image: "chart.png", shapes: [], target: "c1", mode: "hide-all-guess-one" } as unknown as NonNullable<Card["occlusion"]>;
		const asked = card({ id: `${NOTE}#^os-diagram/c1`, blockId: "os-diagram", cardType: "occlusion", occlusion });
		const hidden = studyNode(node, { asking: asked.id, revealed: false }, asked);
		expect(hidden).toMatchObject({ id: node.id, label: HIDDEN_LABEL, masks: { occlusion, side: "front" } });
		// The text is left alone: the panel draws the image from `masks`, not from this.
		expect(hidden.source?.raw).toBe(node.source?.raw);
		expect(studyNode(node, { asking: asked.id, revealed: true }, asked)).toMatchObject({ label: node.label, masks: { occlusion, side: "back" } });
	});

	it("blanks a hidden line, keeping its identity", () => {
		const node = line("os-a");
		const shown = studyNode(node, { asking: `${NOTE}#^os-a`, revealed: false }, card({ id: `${NOTE}#^os-a`, blockId: "os-a" }));
		expect(shown).toMatchObject({ id: node.id, kind: "line", path: NOTE, label: HIDDEN_LABEL });
		expect(shown.source).toMatchObject({ blockId: "os-a", content: HIDDEN_LABEL, raw: HIDDEN_LABEL });
		expect(node.label).toBe("line os-a");
	});

	it("gives a revealed line back unchanged", () => {
		const node = line("os-a");
		expect(studyNode(node, { asking: "k", revealed: true }, undefined)).toBe(node);
	});

	it("shows a fence's question while hidden and its answer once revealed", () => {
		const node = fence("rr-lights");
		const basic = card({ id: "rr-lights", cardType: "explicit", front: "Which light shows to port?", back: "Red." });
		expect(studyNode(node, { asking: "rr-lights", revealed: false }, basic).source?.raw).toBe("Which light shows to port?");
		expect(studyNode(node, { asking: "rr-lights", revealed: true }, basic).source?.raw).toBe("Which light shows to port?\n\n---\n\nRed.");

		const cloze = card({ id: "rr-lights-c1", cardType: "explicit_cloze", front: "Port is [...]", back: "Port is red" });
		expect(studyNode(node, { asking: "rr-lights-c1", revealed: true }, cloze).source?.raw).toBe("Port is red");
	});
});

describe("nearestTarget", () => {
	it("picks the closest candidate in a straight line", () => {
		const from = { x: 0, y: 0, z: 0 };
		expect(nearestTarget(from, [{ id: "far", x: 50, y: 0, z: 0 }, { id: "near", x: 0, y: -10, z: 5 }])).toBe("near");
		expect(nearestTarget(from, [])).toBeNull();
	});
});
