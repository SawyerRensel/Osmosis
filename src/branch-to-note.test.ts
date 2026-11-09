import { describe, expect, it } from "vitest";
import {
	anchorToSource,
	applyTemplate,
	convertBranch,
	movedTarget,
	replaceBranch,
	retargetLinks,
	sanitizeFileName,
	splitStyles,
	stableSelectorPairs,
	uniqueNotePath,
} from "./branch-to-note";
import { findNodeById } from "./graph3d/edit";
import { subtreeEnd } from "./mindmap-edit";
import { OsmosisParser } from "./parser";
import type { OsmosisNode } from "./types";

const parse = (text: string): OsmosisNode => new OsmosisParser().parse(text, "Src.md").root;

function find(root: OsmosisNode, content: string): OsmosisNode {
	const walk = (node: OsmosisNode): OsmosisNode | null => {
		if (node.type !== "root" && node.content.replace(/^\[.\] /, "") === content) return node;
		for (const child of node.children) {
			const hit = walk(child);
			if (hit !== null) return hit;
		}
		return null;
	};
	const hit = walk(root);
	if (hit === null) throw new Error(`no node ${content}`);
	return hit;
}

function convert(text: string, content: string) {
	const node = find(parse(text), content);
	return convertBranch(text, node.range.start, subtreeEnd(node));
}

const FENCE = ["```osmosis", "id: abc123", "front: Port side", "back: Left", "```"].join("\n");

const SOURCE = [
	"# Sailing",
	"",
	"## Rigging",
	"",
	"Lines that hold the mast. ^rig1",
	"",
	"### Standing rigging",
	"",
	"- Shrouds ^shr01",
	"  - Upper",
	"",
	"#### Stays",
	"",
	FENCE,
	"",
	"## Navigation",
	"",
	"See [[#Stays]] and [[#Navigation]].",
	"",
].join("\n");

describe("convertBranch", () => {
	it("makes a heading branch a note: H1 from its text, child headings from H2", () => {
		const c = convert(SOURCE, "Rigging");
		expect(c.title).toBe("Rigging");
		expect(c.fileName).toBe("Rigging");
		expect(c.body).toBe(
			["# Rigging", "", "Lines that hold the mast. ^rig1", "", "## Standing rigging", "", "- Shrouds ^shr01", "  - Upper", "", "### Stays", "", FENCE, ""].join("\n"),
		);
		expect(c.embedPrefix).toBe("");
	});

	it("carries an osmosis fence byte-identical", () => {
		expect(convert(SOURCE, "Rigging").body).toContain(FENCE);
	});

	it("leaves heading-like lines inside a code fence alone", () => {
		const text = ["## Knots", "### Bowline", "```", "## not a heading", "```", ""].join("\n");
		expect(convert(text, "Knots").body).toBe(["# Knots", "", "## Bowline", "```", "## not a heading", "```", ""].join("\n"));
	});

	it("replaces the branch with an embed at its position", () => {
		const c = convert(SOURCE, "Rigging");
		const out = replaceBranch(SOURCE, c, "Rigging");
		expect(out).toBe(["# Sailing", "", "![[Rigging]]", "", "## Navigation", "", "See [[#Stays]] and [[#Navigation]].", ""].join("\n"));
	});

	it("dedents a list item's children and keeps their relative nesting", () => {
		const text = ["- Harbour", "  - Moorings ^moor01", "    - Buoys", "  - Pilots", "- Open sea", ""].join("\n");
		const c = convert(text, "Moorings");
		expect(c.title).toBe("Moorings");
		expect(c.body).toBe(["# Moorings ^moor01", "", "- Buoys", ""].join("\n"));
		expect(c.embedPrefix).toBe("  - ");
		expect(replaceBranch(text, c, "Moorings")).toBe(["- Harbour", "  - ![[Moorings]]", "  - Pilots", "- Open sea", ""].join("\n"));
	});

	it("drops a checkbox from the title and keeps an ordered marker on the embed", () => {
		const text = ["1. [ ] Charts", "   - Tides", ""].join("\n");
		const c = convert(text, "Charts");
		expect(c.title).toBe("Charts");
		expect(c.embedPrefix).toBe("1. ");
		expect(c.body).toBe(["# Charts", "", "- Tides", ""].join("\n"));
	});

	it("records the moved headings and block IDs", () => {
		const c = convert(SOURCE, "Rigging");
		expect([...c.moved.headings].sort()).toEqual(["rigging", "standing rigging", "stays"]);
		expect(c.moved.rootHeading).toBe("rigging");
		expect([...c.moved.blockIds].sort()).toEqual(["rig1", "shr01"]);
	});

	it("does not claim a heading whose first occurrence stayed behind", () => {
		const text = ["## Notes", "", "## Rigging", "", "### Notes", ""].join("\n");
		expect(convert(text, "Rigging").moved.headings.has("notes")).toBe(false);
	});

	it("handles a childless line", () => {
		const text = ["- Anchor", "- Keel", ""].join("\n");
		const c = convert(text, "Keel");
		expect(c.body).toBe("# Keel\n");
		expect(replaceBranch(text, c, "Keel")).toBe(["- Anchor", "- ![[Keel]]", ""].join("\n"));
	});
});

describe("sanitizeFileName", () => {
	it("drops illegal and link-breaking characters", () => {
		expect(sanitizeFileName("Wind: speed / direction?")).toBe("Wind speed direction");
		expect(sanitizeFileName("**Bold** [[Link]] #tag ^x |a")).toBe("Bold Link tag x a");
	});
	it("never returns an empty name", () => {
		expect(sanitizeFileName("  ?? ")).toBe("Untitled");
		expect(sanitizeFileName("...")).toBe("Untitled");
	});
});

describe("links", () => {
	const moved = convert(SOURCE, "Rigging").moved;
	const isSrc = (path: string): boolean => path === "Src";

	it("classifies subpaths", () => {
		expect(movedTarget("Rigging", moved)).toBe("root");
		expect(movedTarget("Sailing#Stays", moved)).toBe("moved");
		expect(movedTarget("^shr01", moved)).toBe("moved");
		expect(movedTarget("^other", moved)).toBeNull();
		expect(movedTarget("Navigation", moved)).toBeNull();
	});

	it("retargets heading, block, alias and embed links into the branch", () => {
		const text = "[[Src#Stays]] [[Src#^shr01|shrouds]] ![[Src#Standing rigging]] [[Src#Rigging]] [[Src#Navigation]] [[Other#Stays]] [[Src]]";
		expect(retargetLinks(text, isSrc, moved, "Rigging")).toBe(
			"[[Rigging#Stays]] [[Rigging#^shr01|shrouds]] ![[Rigging#Standing rigging]] [[Rigging]] [[Src#Navigation]] [[Other#Stays]] [[Src]]",
		);
	});

	it("matches headings loosely, as Obsidian does", () => {
		expect(retargetLinks("[[Src#standing   RIGGING]]", isSrc, moved, "R")).toBe("[[R#standing   RIGGING]]");
	});

	it("leaves links in code fences alone", () => {
		const text = "```\n[[Src#Stays]]\n```";
		expect(retargetLinks(text, isSrc, moved, "R")).toBe(text);
	});

	it("rewrites the source's own links into the branch", () => {
		const out = retargetLinks("See [[#Stays]] and [[#Navigation]].", (p) => p === "", moved, "Rigging");
		expect(out).toBe("See [[Rigging#Stays]] and [[#Navigation]].");
	});

	it("anchors the branch's links to headings that stayed behind", () => {
		expect(anchorToSource("[[#Navigation]] [[#Stays]] [[Other#X]]", moved, "Sailing")).toBe("[[Sailing#Navigation]] [[#Stays]] [[Other#X]]");
	});
});

describe("uniqueNotePath", () => {
	it("adds an Obsidian-style suffix on a clash", () => {
		const taken = new Set(["Rigging.md", "Rigging 1.md", "Boats/Keel.md"]);
		const exists = (p: string): boolean => taken.has(p);
		expect(uniqueNotePath("", "Rigging", exists)).toBe("Rigging 2.md");
		expect(uniqueNotePath("Boats/", "Keel", exists)).toBe("Boats/Keel 1.md");
		expect(uniqueNotePath("Boats", "Mast", exists)).toBe("Boats/Mast.md");
	});
});

describe("applyTemplate", () => {
	it("puts the template's frontmatter first and its body last", () => {
		const template = "---\ntags:\n  - topic\n---\n\n## See also\n";
		expect(applyTemplate("# Keel\n", template)).toBe("---\ntags:\n  - topic\n---\n# Keel\n\n## See also\n");
	});
	it("takes a template with no frontmatter or no body", () => {
		expect(applyTemplate("# Keel\n", "Footer")).toBe("# Keel\n\nFooter\n");
		expect(applyTemplate("# Keel\n", "---\na: 1\n---")).toBe("---\na: 1\n---\n# Keel\n");
		expect(applyTemplate("# Keel\n", null)).toBe("# Keel\n");
	});
});

describe("styles", () => {
	it("pairs the branch's _n: selectors with the new note's", () => {
		const root = parse(SOURCE);
		const branch = find(root, "Rigging");
		const c = convertBranch(SOURCE, branch.range.start, subtreeEnd(branch));
		const converted = parse(c.body);
		const pairs = stableSelectorPairs(branch, converted);
		const upper = find(root, "Upper");
		const newUpper = find(converted, "Upper");
		expect(pairs.get(`_n:${upper.id}`)).toBe(`_n:${newUpper.id}`);
		expect(pairs.get(`_n:${branch.id}`)).toBe(`_n:${find(converted, "Rigging").id}`);
		expect(findNodeById(converted, newUpper.id)).not.toBeNull();
	});

	it("moves ^id and renamed _n: keys and keeps the rest", () => {
		const styles = { "^shr01": { fill: "red" }, "^keep": { fill: "blue" }, "_n:old": { shape: "pill" }, "_n:stay": { fill: "green" } };
		const { moved, retained } = splitStyles(styles, new Set(["shr01"]), new Map([["_n:old", "_n:new"]]));
		expect(moved).toEqual({ "^shr01": { fill: "red" }, "_n:new": { shape: "pill" } });
		expect(retained).toEqual({ "^keep": { fill: "blue" }, "_n:stay": { fill: "green" } });
	});
});
