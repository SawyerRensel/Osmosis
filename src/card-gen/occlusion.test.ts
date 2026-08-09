import { describe, it, expect } from "vitest";
import type { OcclusionSet } from "../database/types";
import { generateExplicitCards } from "./explicit";
import {
	findFirstEmbed,
	findLabeledEmbeds,
	isolateEmbed,
	occludeLineCard,
	occlusionGroups,
	occlusionSetToYamlValue,
	parseFlowValue,
	parseOccludeBlock,
	parseOcclusionSet,
	rewriteFenceEmbeds,
	serializeOccludeBlock,
	stripEmbedLabels,
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

	it("emits shape lines as YAML flow mappings, which the frontmatter carrier requires", () => {
		const lines = serializeOccludeBlock("a", {
			mode: "hide-all-guess-one",
			shapes: [{ group: "c1", kind: "rect", x: 0.3125, y: 0.22, w: 0.14, h: 0.06 }],
		});
		expect(lines).toEqual([
			"occlude-a:",
			"  mode: hide-all-guess-one",
			"  shapes:",
			"    - { group: c1, kind: rect, x: 0.3125, y: 0.22, w: 0.14, h: 0.06 }",
		]);
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
