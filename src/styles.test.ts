import { describe, it, expect } from "vitest";
import {
	resolveCascade,
	resolveNodeStyle,
	buildTreePath,
	buildStableIdSelector,
	lookupNodeStyle,
	lookupClassStyle,
	lookupVariantStyle,
	getClassScope,
	parseOsmosisStyleFrontmatter,
	type NodeStyle,
	type ThemeDefinition,
	type CascadeInput,
	type OsmosisStyleFrontmatter,
} from "./styles";
import type { OsmosisNode } from "./types";
import type { LayoutNode } from "./layout";

describe("resolveCascade", () => {
	it("returns empty object when all layers are undefined", () => {
		const result = resolveCascade({});
		expect(result).toEqual({});
	});

	it("returns theme style when only theme is provided", () => {
		const theme: NodeStyle = { shape: "rect", fill: "#000" };
		const result = resolveCascade({ theme });
		expect(result).toEqual({ shape: "rect", fill: "#000" });
	});

	it("local overrides theme for scalar properties", () => {
		const result = resolveCascade({
			local: { fill: "#fff" },
			theme: { fill: "#000", shape: "rect" },
		});
		expect(result.fill).toBe("#fff");
		expect(result.shape).toBe("rect"); // falls through from theme
	});

	it("local overrides reference overrides theme", () => {
		const result = resolveCascade({
			local: { fill: "#local" },
			reference: { fill: "#ref", shape: "diamond" },
			theme: { fill: "#theme", shape: "rect", background: "#bg" },
		});
		expect(result.fill).toBe("#local");
		expect(result.shape).toBe("diamond");
		expect(result.background).toBe("#bg");
	});

	it("merges text sub-object field-by-field", () => {
		const result = resolveCascade({
			local: { text: { weight: 700 } },
			theme: { text: { size: 14, weight: 400, color: "#333" } },
		});
		expect(result.text).toEqual({
			size: 14,
			weight: 700,
			color: "#333",
		});
	});

	it("merges border sub-object field-by-field", () => {
		const result = resolveCascade({
			local: { border: { color: "#red" } },
			theme: { border: { color: "#gray", width: 1, style: "solid" } },
		});
		expect(result.border).toEqual({
			color: "#red",
			width: 1,
			style: "solid",
		});
	});

	it("merges branchLine sub-object field-by-field", () => {
		const result = resolveCascade({
			reference: { branchLine: { color: "#blue" } },
			theme: { branchLine: { style: "curved", thickness: 2 } },
		});
		expect(result.branchLine).toEqual({
			style: "curved",
			color: "#blue",
			thickness: 2,
		});
	});

	it("reference fills in where local is absent", () => {
		const result = resolveCascade({
			local: { shape: "ellipse" },
			reference: { fill: "#ref", shape: "diamond" },
			theme: { background: "#bg" },
		});
		expect(result.shape).toBe("ellipse"); // local wins
		expect(result.fill).toBe("#ref"); // reference fills in
		expect(result.background).toBe("#bg"); // theme fills in
	});

	it("handles only local layer", () => {
		const result = resolveCascade({
			local: { shape: "pill", fill: "#abc", text: { size: 16 } },
		});
		expect(result).toEqual({
			shape: "pill",
			fill: "#abc",
			text: { size: 16 },
		});
	});

	it("skips undefined layers gracefully", () => {
		const input: CascadeInput = {
			local: undefined,
			reference: undefined,
			theme: { fill: "#only" },
		};
		expect(resolveCascade(input)).toEqual({ fill: "#only" });
	});
});

describe("resolveNodeStyle", () => {
	const theme: ThemeDefinition = {
		name: "Test",
		base: {
			shape: "rounded-rect",
			fill: "#222",
			text: { size: 13, weight: 400 },
			border: { color: "#555", width: 1, style: "solid" },
		},
		depths: {
			"1": { fill: "#111", text: { size: 20, weight: 700 } },
			"2": { fill: "#333", text: { size: 17, weight: 600 } },
		},
	};

	it("applies base + depth overrides as the theme level", () => {
		const result = resolveNodeStyle(theme, 1);
		expect(result.shape).toBe("rounded-rect"); // from base
		expect(result.fill).toBe("#111"); // depth 1 overrides base
		expect(result.text?.size).toBe(20); // depth 1 overrides base
		expect(result.text?.weight).toBe(700);
		expect(result.border?.color).toBe("#555"); // from base
	});

	it("falls back to base when depth has no override", () => {
		const result = resolveNodeStyle(theme, 5);
		expect(result.fill).toBe("#222"); // base only
		expect(result.text?.size).toBe(13);
	});

	it("local overrides theme+depth", () => {
		const result = resolveNodeStyle(
			theme,
			1,
			{ fill: "#local", text: { size: 24 } },
		);
		expect(result.fill).toBe("#local");
		expect(result.text?.size).toBe(24);
		expect(result.text?.weight).toBe(700); // depth still fills in
		expect(result.shape).toBe("rounded-rect"); // base still fills in
	});

	it("reference sits between local and theme", () => {
		const result = resolveNodeStyle(
			theme,
			2,
			{ text: { weight: 800 } }, // local
			{ fill: "#ref", text: { size: 15 } }, // reference
		);
		expect(result.text?.weight).toBe(800); // local
		expect(result.fill).toBe("#ref"); // reference overrides theme
		expect(result.text?.size).toBe(15); // reference overrides theme
		expect(result.shape).toBe("rounded-rect"); // base fills in
	});

	it("works with no theme", () => {
		const result = resolveNodeStyle(
			undefined,
			1,
			{ fill: "#local" },
		);
		expect(result).toEqual({ fill: "#local" });
	});

	it("works with no overrides — pure theme output", () => {
		const result = resolveNodeStyle(theme, 2);
		expect(result.fill).toBe("#333");
		expect(result.text?.size).toBe(17);
		expect(result.text?.weight).toBe(600);
	});
});

// ─── Helpers for frontmatter tests ───────────────────────────────────────

function makeNode(overrides: Partial<OsmosisNode>): OsmosisNode {
	return {
		id: "abc123def456",
		type: "heading",
		depth: 2,
		content: "Architecture",
		children: [],
		range: { start: 0, end: 20 },
		isTranscluded: false,
		...overrides,
	};
}

function makeLayoutNode(
	source: OsmosisNode,
	parent: LayoutNode | null = null,
): LayoutNode {
	return {
		source,
		rect: { x: 0, y: 0, width: 100, height: 30 },
		depth: source.depth,
		collapsed: false,
		children: [],
		parent,
	};
}

// ─── buildTreePath ───────────────────────────────────────────────────────

describe("buildTreePath", () => {
	it("builds path for a single heading node", () => {
		const node = makeNode({ type: "heading", depth: 2, content: "Architecture" });
		const layout = makeLayoutNode(node);
		expect(buildTreePath(layout)).toBe("## Architecture");
	});

	it("builds path for nested heading + bullet", () => {
		const parent = makeNode({ type: "heading", depth: 2, content: "Architecture" });
		const child = makeNode({ type: "bullet", depth: 0, content: "Intro", id: "child1" });
		const parentLayout = makeLayoutNode(parent);
		const childLayout = makeLayoutNode(child, parentLayout);
		expect(buildTreePath(childLayout)).toBe("## Architecture/- Intro");
	});

	it("builds path for deeply nested nodes", () => {
		const root = makeNode({ type: "root", depth: 0, content: "" });
		const h1 = makeNode({ type: "heading", depth: 1, content: "Overview" });
		const h2 = makeNode({ type: "heading", depth: 2, content: "Details" });
		const bullet = makeNode({ type: "bullet", depth: 0, content: "Item" });

		const rootLayout = makeLayoutNode(root);
		const h1Layout = makeLayoutNode(h1, rootLayout);
		const h2Layout = makeLayoutNode(h2, h1Layout);
		const bulletLayout = makeLayoutNode(bullet, h2Layout);

		// Root is excluded from path
		expect(buildTreePath(bulletLayout)).toBe("# Overview/## Details/- Item");
	});

	it("handles ordered list nodes", () => {
		const node = makeNode({ type: "ordered", depth: 0, content: "First step" });
		const layout = makeLayoutNode(node);
		expect(buildTreePath(layout)).toBe("1. First step");
	});

	it("skips root node from path", () => {
		const root = makeNode({ type: "root", depth: 0, content: "" });
		const child = makeNode({ type: "heading", depth: 1, content: "Title" });
		const rootLayout = makeLayoutNode(root);
		const childLayout = makeLayoutNode(child, rootLayout);
		expect(buildTreePath(childLayout)).toBe("# Title");
	});
});

// ─── buildStableIdSelector ───────────────────────────────────────────────

describe("buildStableIdSelector", () => {
	it("builds _n: prefixed selector from node id", () => {
		const node = makeNode({ id: "abc123def456" });
		expect(buildStableIdSelector(node)).toBe("_n:abc123def456");
	});
});

// ─── lookupNodeStyle ─────────────────────────────────────────────────────

describe("lookupNodeStyle", () => {
	it("returns undefined when no frontmatter", () => {
		const node = makeNode({});
		const layout = makeLayoutNode(node);
		expect(lookupNodeStyle(undefined, layout)).toBeUndefined();
	});

	it("returns undefined when no styles key", () => {
		const fm: OsmosisStyleFrontmatter = { theme: "Ocean" };
		const node = makeNode({});
		const layout = makeLayoutNode(node);
		expect(lookupNodeStyle(fm, layout)).toBeUndefined();
	});

	it("matches by stable ID selector", () => {
		const node = makeNode({ id: "abc123def456" });
		const layout = makeLayoutNode(node);
		const fm: OsmosisStyleFrontmatter = {
			styles: {
				"_n:abc123def456": { fill: "#ff0000" },
			},
		};
		expect(lookupNodeStyle(fm, layout)).toEqual({ fill: "#ff0000" });
	});

	it("matches by tree path selector", () => {
		const node = makeNode({ type: "heading", depth: 2, content: "Architecture" });
		const layout = makeLayoutNode(node);
		const fm: OsmosisStyleFrontmatter = {
			styles: {
				"## Architecture": { shape: "hexagon" },
			},
		};
		expect(lookupNodeStyle(fm, layout)).toEqual({ shape: "hexagon" });
	});

	it("stable ID takes priority over tree path", () => {
		const node = makeNode({ type: "heading", depth: 2, content: "Architecture", id: "abc123def456" });
		const layout = makeLayoutNode(node);
		const fm: OsmosisStyleFrontmatter = {
			styles: {
				"_n:abc123def456": { fill: "#stable" },
				"## Architecture": { fill: "#treepath" },
			},
		};
		expect(lookupNodeStyle(fm, layout)?.fill).toBe("#stable");
	});

	it("matches nested tree path", () => {
		const parent = makeNode({ type: "heading", depth: 2, content: "Architecture" });
		const child = makeNode({ type: "bullet", depth: 0, content: "Intro", id: "child123" });
		const parentLayout = makeLayoutNode(parent);
		const childLayout = makeLayoutNode(child, parentLayout);
		const fm: OsmosisStyleFrontmatter = {
			styles: {
				"## Architecture/- Intro": { fill: "#nested" },
			},
		};
		expect(lookupNodeStyle(fm, childLayout)).toEqual({ fill: "#nested" });
	});

	it("returns undefined when no selector matches", () => {
		const node = makeNode({ type: "heading", depth: 2, content: "Architecture", id: "nomatch" });
		const layout = makeLayoutNode(node);
		const fm: OsmosisStyleFrontmatter = {
			styles: {
				"## Other": { fill: "#nope" },
				"_n:different": { fill: "#nope" },
			},
		};
		expect(lookupNodeStyle(fm, layout)).toBeUndefined();
	});
});

// ─── parseOsmosisStyleFrontmatter ────────────────────────────────────────

describe("parseOsmosisStyleFrontmatter", () => {
	it("returns undefined for null/undefined frontmatter", () => {
		expect(parseOsmosisStyleFrontmatter(null)).toBeUndefined();
		expect(parseOsmosisStyleFrontmatter(undefined)).toBeUndefined();
	});

	it("returns undefined when osmosis key is missing", () => {
		expect(parseOsmosisStyleFrontmatter({ title: "Note" })).toBeUndefined();
	});

	it("returns undefined when osmosis key is not an object", () => {
		expect(parseOsmosisStyleFrontmatter({ osmosis: "string" })).toBeUndefined();
		expect(parseOsmosisStyleFrontmatter({ osmosis: 42 })).toBeUndefined();
	});

	it("parses theme string", () => {
		const result = parseOsmosisStyleFrontmatter({
			osmosis: { theme: "Ocean" },
		});
		expect(result?.theme).toBe("Ocean");
	});

	it("parses coloredBranches boolean", () => {
		const result = parseOsmosisStyleFrontmatter({
			osmosis: { coloredBranches: true },
		});
		expect(result?.coloredBranches).toBe(true);
	});

	it("parses styles record", () => {
		const styles = {
			"## Architecture": { fill: "#ff0000", shape: "hexagon" },
			"_n:abc123": { text: { weight: 700 } },
		};
		const result = parseOsmosisStyleFrontmatter({
			osmosis: { styles },
		});
		expect(result?.styles).toEqual(styles);
	});

	it("ignores non-boolean coloredBranches", () => {
		const result = parseOsmosisStyleFrontmatter({
			osmosis: { coloredBranches: "yes", theme: "Test" },
		});
		expect(result?.coloredBranches).toBeUndefined();
		expect(result?.theme).toBe("Test");
	});

	it("ignores non-string theme", () => {
		const result = parseOsmosisStyleFrontmatter({
			osmosis: { theme: 42, coloredBranches: false },
		});
		expect(result?.theme).toBeUndefined();
		expect(result?.coloredBranches).toBe(false);
	});

	it("returns undefined for empty osmosis object", () => {
		expect(parseOsmosisStyleFrontmatter({ osmosis: {} })).toBeUndefined();
	});
});

describe("lookupClassStyle", () => {
	const localFm: OsmosisStyleFrontmatter = {
		classes: {
			emphasis: { fill: "#ff0000" },
			shared: { fill: "#local" },
		},
	};
	const globalClasses: Record<string, NodeStyle> = {
		highlight: { fill: "#00ff00" },
		shared: { fill: "#global" },
	};

	it("returns local class when it exists", () => {
		expect(lookupClassStyle(localFm, "emphasis", globalClasses)).toEqual({ fill: "#ff0000" });
	});

	it("returns global class when local does not exist", () => {
		expect(lookupClassStyle(localFm, "highlight", globalClasses)).toEqual({ fill: "#00ff00" });
	});

	it("local class shadows same-named global class", () => {
		expect(lookupClassStyle(localFm, "shared", globalClasses)).toEqual({ fill: "#local" });
	});

	it("returns undefined for unknown class name", () => {
		expect(lookupClassStyle(localFm, "unknown", globalClasses)).toBeUndefined();
	});

	it("returns undefined when className is undefined", () => {
		expect(lookupClassStyle(localFm, undefined, globalClasses)).toBeUndefined();
	});

	it("returns global class when frontmatter is undefined", () => {
		expect(lookupClassStyle(undefined, "highlight", globalClasses)).toEqual({ fill: "#00ff00" });
	});

	it("returns undefined when no global classes provided", () => {
		expect(lookupClassStyle(undefined, "highlight")).toBeUndefined();
	});
});

describe("getClassScope", () => {
	const localFm: OsmosisStyleFrontmatter = {
		classes: {
			emphasis: { fill: "#ff0000" },
			shared: { fill: "#local" },
		},
	};
	const globalClasses: Record<string, NodeStyle> = {
		highlight: { fill: "#00ff00" },
		shared: { fill: "#global" },
	};

	it("returns 'local' for a local class", () => {
		expect(getClassScope(localFm, "emphasis", globalClasses)).toBe("local");
	});

	it("returns 'global' for a global-only class", () => {
		expect(getClassScope(localFm, "highlight", globalClasses)).toBe("global");
	});

	it("returns 'local' when class exists in both scopes (local wins)", () => {
		expect(getClassScope(localFm, "shared", globalClasses)).toBe("local");
	});

	it("returns undefined for unknown class name", () => {
		expect(getClassScope(localFm, "unknown", globalClasses)).toBeUndefined();
	});

	it("returns 'global' when frontmatter is undefined", () => {
		expect(getClassScope(undefined, "highlight", globalClasses)).toBe("global");
	});
});

describe("resolveCascade with variant layer", () => {
	it("variant fills gap between class and theme", () => {
		const result = resolveCascade({
			theme: { fill: "#theme", shape: "rect" },
			variant: { fill: "#variant" },
		});
		expect(result.fill).toBe("#variant");
		expect(result.shape).toBe("rect");
	});

	it("class overrides variant", () => {
		const result = resolveCascade({
			class: { fill: "#class" },
			variant: { fill: "#variant" },
			theme: { fill: "#theme" },
		});
		expect(result.fill).toBe("#class");
	});

	it("local overrides variant", () => {
		const result = resolveCascade({
			local: { fill: "#local" },
			variant: { fill: "#variant" },
		});
		expect(result.fill).toBe("#local");
	});

	it("variant overrides reference", () => {
		const result = resolveCascade({
			variant: { fill: "#variant" },
			reference: { fill: "#ref" },
		});
		expect(result.fill).toBe("#variant");
	});

	it("variant merges sub-objects with theme", () => {
		const result = resolveCascade({
			theme: { text: { size: 14, color: "#000" } },
			variant: { text: { size: 18 } },
		});
		expect(result.text).toEqual({ size: 18, color: "#000" });
	});
});

describe("lookupVariantStyle", () => {
	const fm: OsmosisStyleFrontmatter = {
		activeVariant: "presentation",
		variants: {
			presentation: {
				"_n:abc123def456": { fill: "#byId" },
				"Architecture": { fill: "#byContent" },
				"*": { text: { size: 18 } },
			},
		},
	};

	it("matches by stable ID selector", () => {
		const node = makeNode({ id: "abc123def456" });
		const layout = makeLayoutNode(node);
		expect(lookupVariantStyle(fm, layout)).toEqual({ fill: "#byId" });
	});

	it("matches by node content", () => {
		const node = makeNode({ id: "other_id", content: "Architecture" });
		const layout = makeLayoutNode(node);
		expect(lookupVariantStyle(fm, layout)).toEqual({ fill: "#byContent" });
	});

	it("falls back to wildcard selector", () => {
		const node = makeNode({ id: "other_id", type: "bullet", depth: 0, content: "Some item" });
		const layout = makeLayoutNode(node);
		expect(lookupVariantStyle(fm, layout)).toEqual({ text: { size: 18 } });
	});

	it("returns undefined when no active variant", () => {
		const fmNoActive: OsmosisStyleFrontmatter = {
			variants: { presentation: { "*": { fill: "#x" } } },
		};
		const node = makeNode({});
		const layout = makeLayoutNode(node);
		expect(lookupVariantStyle(fmNoActive, layout)).toBeUndefined();
	});

	it("returns undefined when active variant not found", () => {
		const fmBadRef: OsmosisStyleFrontmatter = {
			activeVariant: "missing",
			variants: { presentation: { "*": { fill: "#x" } } },
		};
		const node = makeNode({});
		const layout = makeLayoutNode(node);
		expect(lookupVariantStyle(fmBadRef, layout)).toBeUndefined();
	});

	it("returns undefined when no variants defined", () => {
		const node = makeNode({});
		const layout = makeLayoutNode(node);
		expect(lookupVariantStyle(undefined, layout)).toBeUndefined();
	});

	it("stable ID takes priority over content match", () => {
		const node = makeNode({ id: "abc123def456", content: "Architecture" });
		const layout = makeLayoutNode(node);
		const result = lookupVariantStyle(fm, layout);
		expect(result?.fill).toBe("#byId");
	});
});

describe("parseOsmosisStyleFrontmatter with variants", () => {
	it("parses variants and activeVariant", () => {
		const result = parseOsmosisStyleFrontmatter({
			osmosis: {
				activeVariant: "study",
				variants: {
					study: { "*": { fill: "#333" } },
					print: { "*": { fill: "#fff" } },
				},
			},
		});
		expect(result?.activeVariant).toBe("study");
		expect(result?.variants).toEqual({
			study: { "*": { fill: "#333" } },
			print: { "*": { fill: "#fff" } },
		});
	});

	it("ignores non-string activeVariant", () => {
		const result = parseOsmosisStyleFrontmatter({
			osmosis: { activeVariant: 42 },
		});
		expect(result).toBeUndefined();
	});

	it("ignores non-object variants", () => {
		const result = parseOsmosisStyleFrontmatter({
			osmosis: { variants: "bad" },
		});
		expect(result).toBeUndefined();
	});
});
