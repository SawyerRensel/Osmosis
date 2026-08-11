import { describe, it, expect } from "vitest";
import type { OcclusionSet } from "../database/types";
import { generateExplicitCards } from "./explicit";
import {
	enclosingOsmosisFence,
	ensureFenceIdentity,
	fenceEmbedLine,
	fenceId,
	fenceOcclusions,
	findFirstEmbed,
	findLabeledEmbeds,
	isolateEmbed,
	labelEmbed,
	labelFence,
	locateOcclusionTarget,
	nextEmbedLabel,
	occludeLineCard,
	occlusionGroups,
	occlusionSetToYamlValue,
	parseFlowValue,
	parseOccludeBlock,
	parseOcclusionSet,
	pickEmbedLine,
	rewriteFenceEmbeds,
	serializeOccludeBlock,
	stripEmbedLabels,
	stripEmbeds,
} from "./occlusion";
import type { GeneratedCard } from "./types";

/** A fence carrying two labelled diagrams and three shape groups. */
const twoDiagramFence = [
	"```osmosis",
	"id: bridge",
	"occlude-a:",
	"  mode: hide-all-guess-one",
	"  shapes:",
	"    - { group: c1, kind: rect, x: 0.31, y: 0.22, w: 0.14, h: 0.06 }",
	"    - { group: c1, kind: rect, x: 0.62, y: 0.30, w: 0.10, h: 0.05 }",
	"    - { group: c2, kind: ellipse, x: 0.55, y: 0.40, rx: 0.08, ry: 0.05 }",
	"occlude-b:",
	"  mode: hide-one-guess-one",
	"  shapes:",
	"    - { group: c3, kind: poly, points: [[0.20, 0.18], [0.42, 0.18], [0.31, 0.34]] }",
	"",
	"![[bridge-cross-section.png]]{a}",
	"![[span-elevation.png]]{b}",
	"```",
].join("\n");

describe("flow-mapping parsing", () => {
	it("reads a shape mapping into a plain object", () => {
		expect(parseFlowValue("{ group: c1, kind: rect, x: 0.31, y: 0.22 }")).toEqual({
			group: "c1",
			kind: "rect",
			x: 0.31,
			y: 0.22,
		});
	});

	it("keeps nested point pairs together rather than splitting on their commas", () => {
		expect(parseFlowValue("[[0.20, 0.18], [0.42, 0.18], [0.31, 0.34]]")).toEqual([
			[0.2, 0.18],
			[0.42, 0.18],
			[0.31, 0.34],
		]);
	});

	it("accepts a leading-dot float, which YAML treats as a number", () => {
		expect(parseFlowValue(".31")).toBe(0.31);
		expect(parseFlowValue("-0.5")).toBe(-0.5);
	});

	it("leaves a non-numeric scalar as a string", () => {
		expect(parseFlowValue("hide-all-guess-one")).toBe("hide-all-guess-one");
		expect(parseFlowValue('"c1"')).toBe("c1");
	});
});

describe("parseOccludeBlock", () => {
	it("parses a labelled block and reports where it ends", () => {
		const lines = [
			"occlude-a:",
			"  mode: hide-one-guess-one",
			"  shapes:",
			"    - { group: c1, kind: rect, x: 0.1, y: 0.2, w: 0.3, h: 0.4 }",
			"id: bridge",
		];
		const parsed = parseOccludeBlock(lines, 0);
		expect(parsed).not.toBeNull();
		expect(parsed!.label).toBe("a");
		expect(parsed!.nextIdx).toBe(4);
		expect(parsed!.set.mode).toBe("hide-one-guess-one");
		expect(parsed!.set.shapes).toEqual([
			{ group: "c1", kind: "rect", x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
		]);
	});

	it("parses the bare `occlude:` form with an empty label", () => {
		const parsed = parseOccludeBlock(
			["occlude:", "  shapes:", "    - { group: c1, kind: rect, x: 0, y: 0, w: 1, h: 1 }"],
			0,
		);
		expect(parsed!.label).toBe("");
	});

	it("defaults to hide-all-guess-one when no mode is given", () => {
		const parsed = parseOccludeBlock(
			["occlude-a:", "  shapes:", "    - { group: c1, kind: rect, x: 0, y: 0, w: 1, h: 1 }"],
			0,
		);
		expect(parsed!.set.mode).toBe("hide-all-guess-one");
	});

	it("skips keys it does not recognise instead of failing the block", () => {
		const parsed = parseOccludeBlock(
			[
				"occlude-a:",
				"  mode: hide-all-guess-one",
				"  someFutureKey: whatever",
				"  shapes:",
				"    - { group: c1, kind: rect, x: 0, y: 0, w: 1, h: 1 }",
			],
			0,
		);
		expect(parsed!.set.shapes).toHaveLength(1);
	});

	it("returns null when the line is not an occlude key", () => {
		expect(parseOccludeBlock(["id: bridge"], 0)).toBeNull();
	});
});

describe("shape validation", () => {
	const set = (shape: unknown): OcclusionSet | null =>
		parseOcclusionSet({ mode: "hide-all-guess-one", shapes: [shape] });

	it("accepts each shape kind", () => {
		expect(set({ group: "c1", kind: "rect", x: 0.1, y: 0.2, w: 0.3, h: 0.4 })).not.toBeNull();
		expect(set({ group: "c1", kind: "ellipse", x: 0.1, y: 0.2, rx: 0.3, ry: 0.4 })).not.toBeNull();
		expect(set({ group: "c1", kind: "poly", points: [[0, 0], [1, 0], [1, 1]] })).not.toBeNull();
	});

	it("drops a shape missing a coordinate rather than producing NaN geometry", () => {
		expect(set({ group: "c1", kind: "rect", x: 0.1, y: 0.2, w: 0.3 })).toBeNull();
	});

	it("drops a polygon with fewer than three points, which encloses no area", () => {
		expect(set({ group: "c1", kind: "poly", points: [[0, 0], [1, 1]] })).toBeNull();
	});

	it("drops a shape whose group is not a cN label", () => {
		expect(set({ group: "top-left", kind: "rect", x: 0, y: 0, w: 1, h: 1 })).toBeNull();
	});

	it("falls back to the default mode when the mode is unrecognised", () => {
		const parsed = parseOcclusionSet({
			mode: "hide-everything",
			shapes: [{ group: "c1", kind: "rect", x: 0, y: 0, w: 1, h: 1 }],
		});
		expect(parsed!.mode).toBe("hide-all-guess-one");
	});

	it("returns null when nothing usable survives validation", () => {
		expect(parseOcclusionSet({ shapes: [{ group: "c1", kind: "blob" }] })).toBeNull();
		expect(parseOcclusionSet({ mode: "hide-all-guess-one" })).toBeNull();
		expect(parseOcclusionSet("not an object")).toBeNull();
	});
});

describe("round-tripping", () => {
	it("survives fence serialize → parse unchanged", () => {
		const original: OcclusionSet = {
			mode: "hide-one-guess-one",
			shapes: [
				{ group: "c1", kind: "rect", x: 0.31, y: 0.22, w: 0.14, h: 0.06 },
				{ group: "c2", kind: "ellipse", x: 0.55, y: 0.4, rx: 0.08, ry: 0.05 },
				{ group: "c3", kind: "poly", points: [[0.2, 0.18], [0.42, 0.18], [0.31, 0.34]] },
			],
		};
		const lines = serializeOccludeBlock("a", original);
		const parsed = parseOccludeBlock(lines, 0);
		expect(parsed!.label).toBe("a");
		expect(parsed!.set).toEqual(original);
	});

	it("survives frontmatter serialize → parse unchanged", () => {
		const original: OcclusionSet = {
			mode: "hide-all-guess-one",
			shapes: [{ group: "c1", kind: "poly", points: [[0.2, 0.18], [0.42, 0.18], [0.31, 0.34]] }],
		};
		expect(parseOcclusionSet(occlusionSetToYamlValue(original))).toEqual(original);
	});

	it("emits shape lines as YAML block mappings, matching the frontmatter carrier", () => {
		const lines = serializeOccludeBlock("a", {
			mode: "hide-all-guess-one",
			shapes: [{ group: "c1", kind: "rect", x: 0.3125, y: 0.22, w: 0.14, h: 0.06 }],
		});
		expect(lines).toEqual([
			"occlude-a:",
			"  mode: hide-all-guess-one",
			"  shapes:",
			"    - group: c1",
			"      kind: rect",
			"      x: 0.3125",
			"      y: 0.22",
			"      w: 0.14",
			"      h: 0.06",
		]);
	});

	it("still reads the flow mappings every pre-migration note was written with", () => {
		const lines = [
			"occlude-a:",
			"  mode: hide-one-guess-one",
			"  shapes:",
			"    - { group: c1, kind: rect, x: 0.1188, y: 0.5225, w: 0.1375, h: 0.08 }",
			"    - { group: c2, kind: poly, points: [[0.2, 0.18], [0.42, 0.18], [0.31, 0.34]] }",
		];
		expect(parseOccludeBlock(lines, 0)!.set).toEqual({
			mode: "hide-one-guess-one",
			shapes: [
				{ group: "c1", kind: "rect", x: 0.1188, y: 0.5225, w: 0.1375, h: 0.08 },
				{ group: "c2", kind: "poly", points: [[0.2, 0.18], [0.42, 0.18], [0.31, 0.34]] },
			],
		});
	});

	it("reads a fence where one shape migrated to a block mapping and one did not", () => {
		const lines = [
			"occlude:",
			"  mode: hide-all-guess-one",
			"  shapes:",
			"    - group: c1",
			"      kind: rect",
			"      x: 0.1",
			"      y: 0.2",
			"      w: 0.3",
			"      h: 0.4",
			"    - { group: c2, kind: ellipse, x: 0.55, y: 0.4, rx: 0.08, ry: 0.05 }",
		];
		expect(parseOccludeBlock(lines, 0)!.set.shapes).toEqual([
			{ group: "c1", kind: "rect", x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
			{ group: "c2", kind: "ellipse", x: 0.55, y: 0.4, rx: 0.08, ry: 0.05 },
		]);
	});
});

/**
 * Text annotations live in their own list, never in `shapes`. That is what stops
 * them deriving a card by construction: every consumer that maps a shape to a
 * group would otherwise have to learn to skip them, and one missed consumer
 * mints a phantom card the user cannot explain.
 */
describe("annotations", () => {
	const annotated: OcclusionSet = {
		mode: "hide-all-guess-one",
		shapes: [{ group: "c1", kind: "rect", x: 0.3, y: 0.2, w: 0.14, h: 0.06 }],
		annotations: [
			{ x: 0.5, y: 0.12, text: "Deck" },
			{ x: 0.2, y: 0.9, text: "Abutment" },
		],
	};

	it("survives fence serialize → parse unchanged", () => {
		expect(parseOccludeBlock(serializeOccludeBlock("a", annotated), 0)!.set).toEqual(annotated);
	});

	it("survives frontmatter serialize → parse unchanged", () => {
		expect(parseOcclusionSet(occlusionSetToYamlValue(annotated))).toEqual(annotated);
	});

	it("writes them as block mappings under their own key, after the shapes", () => {
		expect(serializeOccludeBlock("", annotated)).toEqual([
			"occlude:",
			"  mode: hide-all-guess-one",
			"  shapes:",
			"    - group: c1",
			"      kind: rect",
			"      x: 0.3",
			"      y: 0.2",
			"      w: 0.14",
			"      h: 0.06",
			"  annotations:",
			"    - x: 0.5",
			"      y: 0.12",
			'      text: "Deck"',
			"    - x: 0.2",
			"      y: 0.9",
			'      text: "Abutment"',
		]);
	});

	it("always quotes the text, since a bare scalar could break the whole block", () => {
		// In the frontmatter carrier a malformed line fails the parse of the
		// *note's* entire frontmatter, not just this entry.
		const set: OcclusionSet = {
			mode: "hide-all-guess-one",
			shapes: [{ group: "c1", kind: "rect", x: 0, y: 0, w: 0.1, h: 0.1 }],
			annotations: [{ x: 0.1, y: 0.2, text: "Span: main # 2" }],
		};
		const lines = serializeOccludeBlock("", set);

		expect(lines).toContain('      text: "Span: main # 2"');
		expect(parseOccludeBlock(lines, 0)!.set.annotations).toEqual(set.annotations);
	});

	it("round-trips text carrying quotes and backslashes", () => {
		const set: OcclusionSet = {
			mode: "hide-all-guess-one",
			shapes: [{ group: "c1", kind: "rect", x: 0, y: 0, w: 0.1, h: 0.1 }],
			annotations: [{ x: 0.1, y: 0.2, text: 'the "web" plate \\ flange' }],
		};

		expect(parseOccludeBlock(serializeOccludeBlock("", set), 0)!.set.annotations)
			.toEqual(set.annotations);
	});

	it("omits the key entirely when there are none", () => {
		const bare: OcclusionSet = { mode: "hide-all-guess-one", shapes: annotated.shapes };

		expect(serializeOccludeBlock("a", bare).join("\n")).not.toContain("annotations");
		expect(occlusionSetToYamlValue(bare)["annotations"]).toBeUndefined();
		expect(parseOccludeBlock(serializeOccludeBlock("a", bare), 0)!.set).toEqual(bare);
	});

	it("derives no card of its own — cards still come only from shape groups", () => {
		expect(occlusionGroups(annotated)).toEqual(["c1"]);
	});

	it("drops an entry with no text, which would be invisible and unreachable", () => {
		expect(parseOcclusionSet({
			mode: "hide-all-guess-one",
			shapes: [{ group: "c1", kind: "rect", x: 0, y: 0, w: 0.1, h: 0.1 }],
			annotations: [{ x: 0.1, y: 0.2, text: "  " }, { x: 0.3, y: 0.4 }],
		})?.annotations).toBeUndefined();
	});

	it("keeps a hand-written numeric label rather than losing it", () => {
		expect(parseOcclusionSet({
			mode: "hide-all-guess-one",
			shapes: [{ group: "c1", kind: "rect", x: 0, y: 0, w: 0.1, h: 0.1 }],
			annotations: [{ x: 0.1, y: 0.2, text: 12 }],
		})?.annotations).toEqual([{ x: 0.1, y: 0.2, text: "12" }]);
	});

	it("still reads a set written before annotations existed", () => {
		const lines = [
			"occlude-a:",
			"  mode: hide-one-guess-one",
			"  shapes:",
			"    - { group: c1, kind: rect, x: 0.1, y: 0.2, w: 0.3, h: 0.4 }",
		];

		expect(parseOccludeBlock(lines, 0)!.set).toEqual({
			mode: "hide-one-guess-one",
			shapes: [{ group: "c1", kind: "rect", x: 0.1, y: 0.2, w: 0.3, h: 0.4 }],
		});
	});
});

describe("embed labels", () => {
	it("finds every labelled embed in source order", () => {
		expect(findLabeledEmbeds("![[one.png]]{a}\ntext\n![[two.png]]{b}")).toEqual([
			{ label: "a", target: "one.png" },
			{ label: "b", target: "two.png" },
		]);
	});

	it("reads the target past a sizing suffix", () => {
		expect(findLabeledEmbeds("![[bridge.png|300]]{a}")).toEqual([
			{ label: "a", target: "bridge.png" },
		]);
	});

	it("handles the markdown embed spelling too", () => {
		expect(findLabeledEmbeds("![alt](diagrams/bridge.png){a}")).toEqual([
			{ label: "a", target: "diagrams/bridge.png" },
		]);
	});

	it("strips the label but keeps the embed", () => {
		expect(stripEmbedLabels("![[bridge.png]]{a}")).toBe("![[bridge.png]]");
		expect(stripEmbedLabels("![alt](bridge.png){a}")).toBe("![alt](bridge.png)");
	});

	it("leaves braces that are the user's own prose alone", () => {
		expect(stripEmbedLabels("The set {a} is closed under $\\{x\\}$.")).toBe(
			"The set {a} is closed under $\\{x\\}$.",
		);
	});

	it("keeps one diagram and drops its siblings", () => {
		const content = "![[one.png]]{a}\ncaption\n![[two.png]]{b}";
		expect(isolateEmbed(content, "a")).toBe("![[one.png]]\ncaption\n");
		expect(isolateEmbed(content, "b")).toBe("\ncaption\n![[two.png]]");
	});

	it("finds the first embed whether or not it is labelled", () => {
		expect(findFirstEmbed("text ![[bridge.png|300]] more")).toBe("bridge.png");
		expect(findFirstEmbed("no images here")).toBeNull();
	});

	it("strips embeds but keeps the prose around them", () => {
		expect(stripEmbeds("Deck anatomy\n![[bridge.png|300]]\n![alt](span.png)").trim())
			.toBe("Deck anatomy");
	});

	it("leaves a plain link alone when stripping embeds", () => {
		expect(stripEmbeds("See [[bridge notes]] and ![[bridge.png]]")).toBe(
			"See [[bridge notes]] and ",
		);
	});
});

describe("group derivation", () => {
	it("collapses shapes sharing a group into one group", () => {
		const parsed = parseOccludeBlock(twoDiagramFence.split("\n"), 2);
		expect(occlusionGroups(parsed!.set)).toEqual(["c1", "c2"]);
	});

	it("orders groups numerically, not lexically", () => {
		const set: OcclusionSet = {
			mode: "hide-all-guess-one",
			shapes: [
				{ group: "c10", kind: "rect", x: 0, y: 0, w: 1, h: 1 },
				{ group: "c2", kind: "rect", x: 0, y: 0, w: 1, h: 1 },
			],
		};
		expect(occlusionGroups(set)).toEqual(["c2", "c10"]);
	});
});

describe("fence cards", () => {
	const cards = generateExplicitCards(twoDiagramFence);

	it("derives one card per group, with cloze's -cN ID shape", () => {
		expect(cards.map((c) => c.id)).toEqual(["bridge-c1", "bridge-c2", "bridge-c3"]);
		expect(cards.every((c) => c.card_type === "occlusion")).toBe(true);
	});

	it("collapses the two c1 shapes into a single card carrying both", () => {
		const c1 = cards.find((c) => c.id === "bridge-c1")!;
		expect(c1.occlusion!.shapes.filter((s) => s.group === "c1")).toHaveLength(2);
	});

	it("keeps each label's shape set bound to its own image", () => {
		expect(cards.find((c) => c.id === "bridge-c1")!.occlusion!.image).toBe("bridge-cross-section.png");
		expect(cards.find((c) => c.id === "bridge-c3")!.occlusion!.image).toBe("span-elevation.png");
	});

	it("carries each embed's own mode", () => {
		expect(cards.find((c) => c.id === "bridge-c1")!.occlusion!.mode).toBe("hide-all-guess-one");
		expect(cards.find((c) => c.id === "bridge-c3")!.occlusion!.mode).toBe("hide-one-guess-one");
	});

	it("shows a card only its own diagram", () => {
		const c1 = cards.find((c) => c.id === "bridge-c1")!;
		expect(c1.front).toContain("bridge-cross-section.png");
		expect(c1.front).not.toContain("span-elevation.png");
	});

	it("never leaks a {label} into card content", () => {
		for (const card of cards) {
			expect(card.front).not.toMatch(/\{[a-z]\}/);
			expect(card.back).not.toMatch(/\{[a-z]\}/);
		}
	});

	it("does not move masks between images when the embeds are reordered", () => {
		const reordered = twoDiagramFence.replace(
			"![[bridge-cross-section.png]]{a}\n![[span-elevation.png]]{b}",
			"![[span-elevation.png]]{b}\n![[bridge-cross-section.png]]{a}",
		);
		const after = generateExplicitCards(reordered);
		expect(after.find((c) => c.id === "bridge-c1")!.occlusion!.image).toBe("bridge-cross-section.png");
		expect(after.find((c) => c.id === "bridge-c3")!.occlusion!.image).toBe("span-elevation.png");
	});

	it("reads per-group schedules from prefixed header keys, as cloze does", () => {
		const md = twoDiagramFence.replace("id: bridge", "id: bridge\nc1-due: 2026-08-12T09:00:00\nc1-state: review");
		const c1 = generateExplicitCards(md).find((c) => c.id === "bridge-c1")!;
		expect(c1.state).toBe("review");
		expect(c1.due).toBe(new Date("2026-08-12T09:00:00").getTime());
	});

	it("keeps parsing plain metadata that follows a shape block", () => {
		const md = twoDiagramFence.replace("occlude-b:", "deck: engineering\nocclude-b:");
		expect(generateExplicitCards(md)[0]!.deck).toBe("engineering");
	});

	it("binds a bare `occlude:` block to a lone unlabelled embed", () => {
		const md = [
			"```osmosis",
			"id: solo",
			"occlude:",
			"  shapes:",
			"    - { group: c1, kind: rect, x: 0.1, y: 0.2, w: 0.3, h: 0.4 }",
			"",
			"![[map.png]]",
			"```",
		].join("\n");
		const cards = generateExplicitCards(md);
		expect(cards).toHaveLength(1);
		expect(cards[0]!.id).toBe("solo-c1");
		expect(cards[0]!.occlusion!.image).toBe("map.png");
	});

	it("binds a repeated label only once, so no two cards share an ID", () => {
		const md = [
			"```osmosis",
			"id: dup",
			"occlude-a:",
			"  shapes:",
			"    - { group: c1, kind: rect, x: 0.1, y: 0.2, w: 0.3, h: 0.4 }",
			"",
			"![[one.png]]{a}",
			"![[two.png]]{a}",
			"```",
		].join("\n");
		const ids = generateExplicitCards(md).map((c) => c.id);
		expect(ids).toEqual(["dup-c1"]);
	});

	it("carries `exclude: true` onto every group's card", () => {
		const md = twoDiagramFence.replace("id: bridge", "id: bridge\nexclude: true");
		expect(generateExplicitCards(md).every((c) => c.disabled === true)).toBe(true);
	});
});

describe("shared cN namespace with cloze", () => {
	const mixedFence = (clozeLabel: string): string =>
		[
			"```osmosis",
			"id: mixed",
			"occlude-a:",
			"  shapes:",
			"    - { group: c1, kind: rect, x: 0.1, y: 0.2, w: 0.3, h: 0.4 }",
			"",
			"![[map.png]]{a}",
			`The scale bar reads ==${clozeLabel}one kilometre==.`,
			"```",
		].join("\n");

	it("numbers an anonymous cloze above the groups the shapes already claimed", () => {
		const cards = generateExplicitCards(mixedFence(""));
		expect(cards.map((c) => c.id)).toEqual(["mixed-c1", "mixed-c2"]);
		expect(cards[1]!.card_type).toBe("explicit_cloze");
	});

	it("drops a labelled cloze that collides with a shape group instead of duplicating its ID", () => {
		const cards = generateExplicitCards(mixedFence("c1:"));
		expect(cards.map((c) => c.id)).toEqual(["mixed-c1"]);
		expect(cards[0]!.card_type).toBe("occlusion");
	});

	it("strips the embed label from a sibling cloze card's content", () => {
		const cloze = generateExplicitCards(mixedFence(""))[1]!;
		expect(cloze.front).not.toContain("{a}");
		expect(cloze.front).toContain("![[map.png]]");
	});
});

describe("line cards", () => {
	const lineCard: GeneratedCard = {
		id: "Atlas.md#^os-ek322j",
		card_type: "line",
		front: "Atlas › Rail network",
		back: "![[network-map.png]]",
		deck: "",
		sourceLine: 12,
		typeIn: false,
		blockId: "os-ek322j",
	};

	const set: OcclusionSet = {
		mode: "hide-all-guess-one",
		shapes: [
			{ group: "c1", kind: "rect", x: 0.31, y: 0.22, w: 0.14, h: 0.06 },
			{ group: "c2", kind: "rect", x: 0.5, y: 0.5, w: 0.1, h: 0.1 },
		],
	};

	it("fans one block ID out into a card per group", () => {
		const cards = occludeLineCard(lineCard, set);
		expect(cards.map((c) => c.id)).toEqual([
			"Atlas.md#^os-ek322j-c1",
			"Atlas.md#^os-ek322j-c2",
		]);
		expect(cards.map((c) => c.occlusionGroup)).toEqual(["c1", "c2"]);
	});

	it("keeps the block ID intact, so the line is still locatable in the note", () => {
		expect(occludeLineCard(lineCard, set).every((c) => c.blockId === "os-ek322j")).toBe(true);
	});

	it("takes the image from the line itself — no label needed", () => {
		expect(occludeLineCard(lineCard, set)[0]!.occlusion!.image).toBe("network-map.png");
	});

	it("leaves a line holding no image as an ordinary line card", () => {
		const textOnly = { ...lineCard, back: "The rail network spans four regions." };
		expect(occludeLineCard(textOnly, set)).toEqual([textOnly]);
	});
});

describe("rewriteFenceEmbeds", () => {
	const toNew = (target: string): string | null =>
		target === "old.png" ? "new.png" : null;

	it("rewrites an embed inside an osmosis fence, which Obsidian's rename cannot see", () => {
		const md = ["```osmosis", "id: x", "", "![[old.png]]{a}", "```"].join("\n");
		expect(rewriteFenceEmbeds(md, toNew)).toContain("![[new.png]]{a}");
	});

	it("preserves the sizing suffix and the occlusion label", () => {
		const md = ["```osmosis", "![[old.png|300]]{a}", "```"].join("\n");
		expect(rewriteFenceEmbeds(md, toNew)).toContain("![[new.png|300]]{a}");
	});

	it("rewrites the markdown embed spelling too", () => {
		const md = ["```osmosis", "![diagram](old.png){a}", "```"].join("\n");
		expect(rewriteFenceEmbeds(md, toNew)).toContain("![diagram](new.png){a}");
	});

	it("leaves embeds outside any fence alone — Obsidian already handles those", () => {
		const md = ["![[old.png]]", "```osmosis", "![[old.png]]{a}", "```"].join("\n");
		const out = rewriteFenceEmbeds(md, toNew).split("\n");
		expect(out[0]).toBe("![[old.png]]");
		expect(out[2]).toBe("![[new.png]]{a}");
	});

	it("leaves non-osmosis code fences alone", () => {
		const md = ["```python", "# ![[old.png]]", "```"].join("\n");
		expect(rewriteFenceEmbeds(md, toNew)).toBe(md);
	});

	it("returns the input unchanged when nothing resolves", () => {
		const md = ["```osmosis", "![[other.png]]{a}", "```"].join("\n");
		expect(rewriteFenceEmbeds(md, toNew)).toBe(md);
	});

	it("handles a fence opened with more than three backticks", () => {
		const md = ["````osmosis", "![[old.png]]{a}", "```", "````"].join("\n");
		expect(rewriteFenceEmbeds(md, toNew)).toContain("![[new.png]]{a}");
	});
});

/**
 * Locating the carrier for an image the user right-clicked. The rule the editor
 * follows: an image already inside an ```osmosis fence keeps its shapes in that
 * fence's header; an image in prose becomes a line card, so the note's
 * structure is left alone and the embed keeps Obsidian's own rename handling.
 */
describe("locateOcclusionTarget", () => {
	const note = [
		"Cross-section of the span:",           // 0
		"",                                      // 1
		"![[bridge-cross-section.png]] ^os-ek322j", // 2
		"",                                      // 3
		"```osmosis",                            // 4
		"id: bridge",                            // 5
		"",                                      // 6
		"![[span-elevation.png]]{b}",            // 7
		"```",                                   // 8
		"",                                      // 9
		"![[untagged.png]]",                     // 10
		"",                                      // 11
		"Just prose, no image.",                 // 12
	].join("\n");

	it("returns null for a line holding no image", () => {
		expect(locateOcclusionTarget(note, 12)).toBeNull();
		expect(locateOcclusionTarget(note, 0)).toBeNull();
	});

	it("returns null for a line past the end of the note", () => {
		expect(locateOcclusionTarget(note, 999)).toBeNull();
	});

	it("routes an image in prose to the line carrier, with its block ID", () => {
		expect(locateOcclusionTarget(note, 2)).toEqual({
			carrier: "line",
			image: "bridge-cross-section.png",
			line: 2,
			blockId: "os-ek322j",
		});
	});

	it("reports a null block ID when the line is not yet a card", () => {
		expect(locateOcclusionTarget(note, 10)?.blockId).toBeNull();
	});

	it("routes an image inside a fence to the fence carrier", () => {
		const target = locateOcclusionTarget(note, 7);
		expect(target?.carrier).toBe("fence");
		expect(target?.image).toBe("span-elevation.png");
		expect(target?.id).toBe("bridge");
		expect(target?.label).toBe("b");
		expect(target?.span).toEqual({ start: 4, end: 8 });
	});

	it("reports a null id and label when the fence declares neither yet", () => {
		const bare = "```osmosis\n\n![[diagram.png]]\n```";
		const target = locateOcclusionTarget(bare, 2);
		expect(target?.carrier).toBe("fence");
		expect(target?.id).toBeNull();
		expect(target?.label).toBeNull();
	});

	it("picks the label belonging to the embed, not a neighbour's", () => {
		const shared = "```osmosis\nid: x\n\n![[a.png]]{a} ![[b.png]]{b}\n```";
		// The scan takes the first embed on the line, so its own label wins.
		expect(locateOcclusionTarget(shared, 3)?.label).toBe("a");
	});

	it("does not mistake the fence's own delimiter lines for content", () => {
		expect(locateOcclusionTarget(note, 4)).toBeNull();
		expect(locateOcclusionTarget(note, 8)).toBeNull();
	});

	it("treats a markdown-style embed the same as a wikilink", () => {
		expect(locateOcclusionTarget("![alt](diagrams/bridge.png)", 0)).toEqual({
			carrier: "line",
			image: "diagrams/bridge.png",
			line: 0,
			blockId: null,
		});
	});

	it("ignores a sizing suffix, which is display data not a link target", () => {
		expect(locateOcclusionTarget("![[bridge.png|300]]", 0)?.image).toBe("bridge.png");
	});
});

describe("enclosingOsmosisFence", () => {
	it("does not end a ````osmosis fence at an inner ``` block's close", () => {
		const lines = [
			"````osmosis",     // 0
			"id: code",        // 1
			"```python",       // 2
			"x = 1",           // 3
			"```",             // 4
			"![[plot.png]]",   // 5
			"````",            // 6
		];
		expect(enclosingOsmosisFence(lines, 5)).toEqual({ start: 0, end: 6 });
	});

	it("returns null outside any fence", () => {
		expect(enclosingOsmosisFence(["```osmosis", "id: a", "```", "prose"], 3)).toBeNull();
	});

	it("runs an unterminated fence to the end of the note", () => {
		expect(enclosingOsmosisFence(["```osmosis", "id: a", "![[x.png]]"], 2))
			.toEqual({ start: 0, end: 2 });
	});
});

describe("fenceOcclusions", () => {
	it("collects every shape set the header declares, by label", () => {
		const lines = [
			"```osmosis",
			"id: bridge",
			"occlude-a:",
			"  mode: hide-all-guess-one",
			"  shapes:",
			"    - group: c1",
			"      kind: rect",
			"      x: 0.1",
			"      y: 0.1",
			"      w: 0.2",
			"      h: 0.2",
			"occlude-b:",
			"  mode: hide-one-guess-one",
			"  shapes:",
			"    - group: c7",
			"      kind: rect",
			"      x: 0.5",
			"      y: 0.5",
			"      w: 0.2",
			"      h: 0.2",
			"",
			"![[a.png]]{a}",
			"![[b.png]]{b}",
			"```",
		];
		const sets = fenceOcclusions(lines, { start: 0, end: 23 });
		expect([...sets.keys()]).toEqual(["a", "b"]);
		expect(sets.get("b")?.shapes[0]?.group).toBe("c7");
	});
});

describe("nextEmbedLabel", () => {
	it("starts at a", () => {
		expect(nextEmbedLabel([])).toBe("a");
	});

	it("skips labels already bound in the fence", () => {
		expect(nextEmbedLabel(["a", "b"])).toBe("c");
	});

	it("wraps past z rather than colliding", () => {
		const alphabet = Array.from({ length: 26 }, (_, i) => String.fromCharCode(97 + i));
		expect(nextEmbedLabel(alphabet)).toBe("a1");
	});
});

describe("labelEmbed", () => {
	it("adds a label to the matching embed", () => {
		expect(labelEmbed("![[bridge.png]]", 0, "bridge.png", "a")).toBe("![[bridge.png]]{a}");
	});

	it("leaves an embed that already carries one alone", () => {
		const content = "![[bridge.png]]{a}";
		expect(labelEmbed(content, 0, "bridge.png", "b")).toBe(content);
	});

	it("labels only the embed whose target matches", () => {
		expect(labelEmbed("![[a.png]] ![[b.png]]", 0, "b.png", "b"))
			.toBe("![[a.png]] ![[b.png]]{b}");
	});

	it("keeps a sizing suffix and a trailing block ID intact", () => {
		expect(labelEmbed("![[bridge.png|300]] ^os-x1", 0, "bridge.png", "a"))
			.toBe("![[bridge.png|300]]{a} ^os-x1");
	});

	it("returns the content unchanged when nothing matches", () => {
		const content = "![[bridge.png]]";
		expect(labelEmbed(content, 0, "other.png", "a")).toBe(content);
	});

	it("produces a label the render surfaces strip back out", () => {
		const labelled = labelEmbed("![[bridge.png]]", 0, "bridge.png", "a");
		expect(stripEmbedLabels(labelled)).toBe("![[bridge.png]]");
	});
});

describe("labelFence", () => {
	it("inserts the id directly under the opening line, where the header starts", () => {
		const content = "```osmosis\n\n![[bridge.png]]\n```";
		expect(labelFence(content, { start: 0, end: 3 }, "os-abc123"))
			.toBe("```osmosis\nid: os-abc123\n\n![[bridge.png]]\n```");
	});

	it("gives the fence an identity the writer can then locate it by", () => {
		const content = "```osmosis\n\n![[bridge.png]]\n```";
		const withId = labelFence(content, { start: 0, end: 3 }, "os-abc123");
		const span = { start: 0, end: 4 };
		expect(fenceId(withId.split("\n"), span)).toBe("os-abc123");
	});
});

describe("fenceEmbedLine", () => {
	// The fence body as a code block processor hands it over: the opening
	// ```osmosis line is not part of it.
	const body = [
		"Name the labelled parts.",
		"",
		"![[bridge-cross-section.svg]]",
		"![[span-elevation.svg|300]]",
	].join("\n");

	it("finds the line of the embed the rendered image came from", () => {
		expect(fenceEmbedLine(body, "bridge-cross-section.svg")).toBe(2);
		expect(fenceEmbedLine(body, "span-elevation.svg")).toBe(3);
	});

	it("matches through a sizing suffix, since the src carries the link as authored", () => {
		expect(fenceEmbedLine(body, "span-elevation.svg|300")).toBe(3);
	});

	it("matches a percent-encoded target against its plain spelling", () => {
		expect(fenceEmbedLine("![[deck plan.svg]]", "deck%20plan.svg")).toBe(0);
	});

	it("declines when the same diagram is embedded twice", () => {
		// Which one was clicked cannot be told from the target alone, and
		// guessing would hang the shapes off the wrong diagram.
		const twice = "![[span-elevation.svg]]\n![[span-elevation.svg]]";
		expect(fenceEmbedLine(twice, "span-elevation.svg")).toBeNull();
	});

	it("declines when nothing matches", () => {
		expect(fenceEmbedLine(body, "other.svg")).toBeNull();
	});
});

describe("pickEmbedLine", () => {
	it("takes the only candidate, with or without a line to go on", () => {
		expect(pickEmbedLine([7], 0)).toBe(7);
		expect(pickEmbedLine([7], null)).toBe(7);
	});

	it("picks the instance the click landed on when one image is embedded twice", () => {
		// The defect this exists for: the first embed was returned whichever
		// instance was right-clicked, so the second opened the first one's shapes.
		expect(pickEmbedLine([4, 12], 12)).toBe(12);
		expect(pickEmbedLine([4, 12], 4)).toBe(4);
	});

	it("takes the nearest when the click resolved to a line either side", () => {
		expect(pickEmbedLine([4, 12], 10)).toBe(12);
		expect(pickEmbedLine([4, 12], 6)).toBe(4);
	});

	it("breaks a tie on the earlier embed, so order cannot change the answer", () => {
		expect(pickEmbedLine([4, 12], 8)).toBe(4);
		expect(pickEmbedLine([12, 4], 8)).toBe(4);
	});

	it("declines when several match and there is no line", () => {
		expect(pickEmbedLine([4, 12], null)).toBeNull();
	});

	it("declines when nothing matches", () => {
		expect(pickEmbedLine([], 3)).toBeNull();
	});
});

describe("ensureFenceIdentity", () => {
	/** A fence with no `id:`, holding one diagram. Embed sits on line 3. */
	const bareSingle = [
		"# Note",
		"```osmosis",
		"What does this show?",
		"![[bridge.png]]",
		"```",
	].join("\n");

	/** The same, holding two diagrams. Embeds sit on lines 3 and 4. */
	const bareDouble = [
		"# Note",
		"```osmosis",
		"What do these show?",
		"![[bridge.png]]",
		"![[span.png]]",
		"```",
	].join("\n");

	const mint = () => "os-abc123";

	it("mints an id for a fence that declares none", () => {
		const identity = ensureFenceIdentity(bareSingle, 3, "bridge.png", mint);
		expect(identity?.id).toBe("os-abc123");
		expect(identity?.content).toContain("```osmosis\nid: os-abc123\n");
	});

	it("leaves a single-embed fence unlabelled, for the bare occlude: spelling", () => {
		const identity = ensureFenceIdentity(bareSingle, 3, "bridge.png", mint);
		expect(identity?.label).toBe("");
		expect(identity?.content).toContain("![[bridge.png]]\n");
		expect(identity?.content).not.toContain("{a}");
	});

	it("writes the label to the line the inserted id: pushed the embed down to", () => {
		// The trap: minting the id shifts every line below it by one, so a
		// label written to the caller's original line number lands on the
		// embed above — or on the fence's prose.
		const identity = ensureFenceIdentity(bareDouble, 3, "bridge.png", mint);
		expect(identity?.label).toBe("a");
		expect(identity?.content.split("\n")).toEqual([
			"# Note",
			"```osmosis",
			"id: os-abc123",
			"What do these show?",
			"![[bridge.png]]{a}",
			"![[span.png]]",
			"```",
		]);
	});

	it("labels the second embed of a fence that already has an id", () => {
		const first = ensureFenceIdentity(bareDouble, 3, "bridge.png", mint)!;
		const second = ensureFenceIdentity(first.content, 5, "span.png", () => "os-never");

		expect(second?.id).toBe("os-abc123");
		expect(second?.label).toBe("b");
		expect(second?.content).toContain("![[span.png]]{b}");
		expect(second?.content).toContain("![[bridge.png]]{a}");
	});

	it("does not mint an id when the fence already declares one", () => {
		let minted = 0;
		const identity = ensureFenceIdentity(twoDiagramFence, 13, "bridge-cross-section.png", () => {
			minted++;
			return "os-never";
		});

		expect(minted).toBe(0);
		expect(identity?.id).toBe("bridge");
	});

	it("reuses the label an embed already carries, leaving the note byte-identical", () => {
		// Reopening the editor on an occluded image must not rewrite the note.
		const identity = ensureFenceIdentity(twoDiagramFence, 14, "span-elevation.png", mint);
		expect(identity?.label).toBe("b");
		expect(identity?.content).toBe(twoDiagramFence);
	});

	it("returns null for a line outside any fence", () => {
		const content = "# Note\n\n![[bridge.png]]\n";
		expect(ensureFenceIdentity(content, 2, "bridge.png", mint)).toBeNull();
	});

	it("mints an identity the shape reader then finds the set under", () => {
		const identity = ensureFenceIdentity(bareDouble, 3, "bridge.png", mint)!;
		const lines = identity.content.split("\n");
		const span = enclosingOsmosisFence(lines, 4)!;

		expect(fenceId(lines, span)).toBe(identity.id);
		expect(findLabeledEmbeds(lines.join("\n")).map((entry) => entry.label))
			.toEqual([identity.label]);
	});
});
