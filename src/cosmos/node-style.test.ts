import { describe, it, expect } from "vitest";
import { OsmosisParser } from "../parser";
import type { OsmosisNode } from "../types";
import { buildGraph, noteNodeId, type GraphNode } from "./model";
import { cssColor, DEFAULT_LOOK, nodeLook, noteStyleReader } from "./node-style";
import { PLATE_RADIUS } from "./plates";

const parser = new OsmosisParser();

const MD = ["# Rigging", "", "- Halyard ^os-a1b2c3", "- Sheet ^my-anchor", "- Shroud", "  - Turnbuckle", "- Stay"].join("\n");

function lines(md: string): { root: OsmosisNode; byText: (text: string) => OsmosisNode } {
	const { root } = parser.parse(md, "Rigging.md");
	const all: OsmosisNode[] = [];
	const walk = (node: OsmosisNode): void => {
		for (const child of node.children) {
			all.push(child);
			walk(child);
		}
	};
	walk(root);
	return {
		root,
		byText: (text) => {
			const found = all.find((node) => node.content.startsWith(text));
			if (found === undefined) throw new Error(`"${text}" not in fixture`);
			return found;
		},
	};
}

describe("noteStyleReader", () => {
	it("is null for a note with no osmosis-styles, or one that styles no node", () => {
		const { root } = lines(MD);
		expect(noteStyleReader(undefined, root)).toBeNull();
		expect(noteStyleReader({ tags: ["sailing"] }, root)).toBeNull();
		expect(noteStyleReader({ "osmosis-styles": { direction: "right" } }, root)).toBeNull();
		// The corrupt list form reads as no styles, as it does in the mind map.
		expect(noteStyleReader({ "osmosis-styles": ["object Object"] }, root)).toBeNull();
	});

	it("finds a node by its stamped ^os- block ID and by a user's own block ID", () => {
		const { root, byText } = lines(MD);
		const styleOf = noteStyleReader({ "osmosis-styles": { styles: { "^os-a1b2c3": { fill: "#112233" }, "^my-anchor": { text: { color: "#ff0000" } } } } }, root)!;
		expect(styleOf(byText("Halyard"))).toEqual({ fill: "#112233" });
		expect(styleOf(byText("Sheet"))).toEqual({ text: { color: "#ff0000" } });
		expect(styleOf(byText("Shroud"))).toBeUndefined();
	});

	it("falls back to the _n: stable ID, then the tree path, as the mind map does", () => {
		const { root, byText } = lines(MD);
		const turnbuckle = byText("Turnbuckle");
		const styleOf = noteStyleReader({
			"osmosis-styles": { styles: { [`_n:${byText("Stay").id}`]: { fill: "#000000" }, "# Rigging/- Shroud/- Turnbuckle": { fill: "#ffffff" } } },
		}, root)!;
		expect(styleOf(byText("Stay"))).toEqual({ fill: "#000000" });
		expect(styleOf(turnbuckle)).toEqual({ fill: "#ffffff" });
	});

	it("prefers the block ID over the stable ID for the same node", () => {
		const { root, byText } = lines(MD);
		const halyard = byText("Halyard");
		const styleOf = noteStyleReader({ "osmosis-styles": { styles: { [`_n:${halyard.id}`]: { fill: "#000000" }, "^os-a1b2c3": { fill: "#ffffff" } } } }, root)!;
		expect(styleOf(halyard)?.fill).toBe("#ffffff");
	});

	it("styles the root by its stable ID (the file-name plate)", () => {
		const { root } = lines(MD);
		const styleOf = noteStyleReader({ "osmosis-styles": { styles: { [`_n:${root.id}`]: { border: { color: "#00ff00" } } } } }, root)!;
		expect(styleOf(root)).toEqual({ border: { color: "#00ff00" } });
	});

	it("cascades Local over its class (note before global) over the note's baseStyle", () => {
		const { root, byText } = lines(MD);
		const styleOf = noteStyleReader({
			"osmosis-styles": {
				baseStyle: { fill: "#010101", text: { color: "#020202" }, border: { width: 3 } },
				classes: { warn: { fill: "#ff8800", border: { color: "#aa0000" } } },
				styles: { "^os-a1b2c3": { class: "warn", border: { width: 2 } }, "^my-anchor": { class: "shared" } },
			},
		}, root, { shared: { text: { color: "#0000ff" } }, warn: { fill: "#999999" } })!;
		expect(styleOf(byText("Halyard"))).toEqual({ fill: "#ff8800", text: { color: "#020202" }, border: { width: 2, color: "#aa0000" } });
		expect(styleOf(byText("Sheet"))).toEqual({ fill: "#010101", text: { color: "#0000ff" }, border: { width: 3 } });
		// baseStyle alone styles every node of the note.
		expect(styleOf(byText("Shroud"))).toEqual({ fill: "#010101", text: { color: "#020202" }, border: { width: 3 } });
	});

	it("applies the active variant", () => {
		const { root, byText } = lines(MD);
		const styleOf = noteStyleReader({ "osmosis-styles": { activeVariant: "dark", variants: { dark: { Stay: { fill: "#222222" } } } } }, root)!;
		expect(styleOf(byText("Stay"))).toEqual({ fill: "#222222" });
		expect(styleOf(byText("Shroud"))).toBeUndefined();
	});

	it("ignores a style entry that is not a mapping", () => {
		const { root, byText } = lines(MD);
		const styleOf = noteStyleReader({ "osmosis-styles": { styles: { "^os-a1b2c3": "red" } } }, root)!;
		expect(styleOf(byText("Halyard"))).toBeUndefined();
	});
});

describe("nodeLook", () => {
	it("is the default plate for no style", () => {
		expect(nodeLook(undefined)).toBe(DEFAULT_LOOK);
		expect(nodeLook({})).toEqual(DEFAULT_LOOK);
	});

	it("reads fill, border and text colours, width and branch line", () => {
		const look = nodeLook({ fill: "#112233", border: { color: "rgb(1, 2, 3)", width: 3 }, text: { color: "navy" }, width: 320, branchLine: { color: "#444444", taper: "grow" } });
		expect(look).toEqual({ fill: "#112233", border: "rgb(1, 2, 3)", text: "navy", stroke: 3, corner: PLATE_RADIUS, width: 320, branchLine: { color: "#444444", taper: "grow" }, boundary: null });
	});

	it("resolves the boundary, tinted by the node's fill, with colours WebGL can draw", () => {
		expect(nodeLook({ fill: "#336699", boundary: { enabled: true } }).boundary).toEqual({
			fill: "#336699",
			fillOpacity: 0.15,
			stroke: "#336699",
			strokeOpacity: 0.5,
			strokeWidth: 1,
			dash: "solid",
		});
		const b = nodeLook({ boundary: { fill: "var(--color-red)", color: "teal", style: "dashed" } }).boundary;
		expect(b?.fill).toBeNull();
		expect(b?.stroke).toBe("teal");
		expect(b?.dash).toBe("dashed");
		expect(nodeLook({ boundary: { enabled: false } }).boundary).toBeNull();
	});

	it("draws no outline for border style none, and caps a huge one", () => {
		expect(nodeLook({ border: { style: "none", width: 4 } }).stroke).toBe(0);
		expect(nodeLook({ border: { width: 50 } }).stroke).toBe(8);
		expect(nodeLook({ border: { style: "dashed" } }).stroke).toBe(1);
	});

	it("draws rect, rounded-rect and pill, and falls back to the default plate for any other shape", () => {
		expect(nodeLook({ shape: "rect" }).corner).toBe(0);
		expect(nodeLook({ shape: "rounded-rect" }).corner).toBe(PLATE_RADIUS);
		expect(nodeLook({ shape: "pill" }).corner).toBe(0.5);
		for (const shape of ["ellipse", "diamond", "cloud", "underline", "none"] as const) expect(nodeLook({ shape }).corner).toBe(PLATE_RADIUS);
		// An unknown string from hand-written YAML.
		expect(nodeLook({ shape: "blob" as never }).corner).toBe(PLATE_RADIUS);
	});
});

describe("cssColor", () => {
	it("keeps colours the plates can draw and drops the rest", () => {
		expect(cssColor("#abc")).toBe("#abc");
		expect(cssColor(" #A1B2C3 ")).toBe("#A1B2C3");
		expect(cssColor("hsl(10, 50%, 50%)")).toBe("hsl(10, 50%, 50%)");
		expect(cssColor("teal")).toBe("teal");
		expect(cssColor("var(--color-red)")).toBeNull();
		expect(cssColor("#11223344")).toBeNull();
		expect(cssColor("transparent")).toBeNull();
		expect(cssColor(42)).toBeNull();
		expect(cssColor(undefined)).toBeNull();
	});
});

describe("buildGraph styles", () => {
	const node = (nodes: GraphNode[], label: string): GraphNode | undefined => nodes.find((n) => n.label.startsWith(label));

	it("puts each node's resolved style on it, keyed as in the mind map", () => {
		const md = ["- Halyard ^os-a1b2c3", "- Shroud"].join("\n");
		const tree = parser.parse(md, "Rigging.md");
		const model = buildGraph(
			[{ tree, cache: { frontmatter: { "osmosis-styles": { styles: { "^os-a1b2c3": { fill: "#112233", width: 300 }, [`_n:${tree.root.id}`]: { fill: "#445566" } } } } } }],
			() => null,
		);
		expect(node(model.nodes, "Halyard")?.style).toEqual({ fill: "#112233", width: 300 });
		expect(node(model.nodes, "Shroud")).not.toHaveProperty("style");
		expect(model.nodes.find((n) => n.id === noteNodeId("Rigging.md"))?.style).toEqual({ fill: "#445566" });
	});

	it("leaves every node unstyled for a note without osmosis-styles", () => {
		const tree = parser.parse("- Halyard\n- Shroud", "Rigging.md");
		const model = buildGraph([{ tree, cache: null }], () => null);
		expect(model.nodes.every((n) => n.style === undefined)).toBe(true);
	});

	it("resolves a class from the global classes it is given", () => {
		const tree = parser.parse("- Halyard ^os-a1b2c3", "Rigging.md");
		const model = buildGraph(
			[{ tree, cache: { frontmatter: { "osmosis-styles": { styles: { "^os-a1b2c3": { class: "rope" } } } } } }],
			() => null,
			{ globalClasses: { rope: { border: { color: "#808000" } } } },
		);
		expect(node(model.nodes, "Halyard")?.style).toEqual({ border: { color: "#808000" } });
	});
});
