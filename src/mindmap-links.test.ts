import { describe, it, expect } from "vitest";
import { OsmosisParser } from "./parser";
import { nodePathAt } from "./mindmap-links";
import type { OsmosisNode } from "./types";

const MD = [
	"# Title",
	"",
	"Intro para",
	"",
	"- alpha",
	"  - beta ^blk",
	"",
	"## Sub Head",
	"",
	"text",
	"",
].join("\n");

function pathText(path: OsmosisNode[]): string[] {
	return path.map((n) => n.content);
}

describe("nodePathAt", () => {
	const tree = new OsmosisParser().parse(MD, "x.md");

	it("finds a nested heading with its ancestor chain", () => {
		const path = nodePathAt(tree.root, MD.indexOf("## Sub Head"));
		expect(pathText(path)).toEqual(["Title", "Sub Head"]);
	});

	it("finds a nested list item from an offset inside its line", () => {
		// A block's cached position can start at the list marker, past the indent
		const path = nodePathAt(tree.root, MD.indexOf("- beta"));
		expect(pathText(path)).toEqual(["Title", "alpha", "beta"]);
		expect(path[path.length - 1]?.blockId).toBe("blk");
	});

	it("returns the top-level node itself when the offset is on it", () => {
		expect(pathText(nodePathAt(tree.root, 0))).toEqual(["Title"]);
	});

	it("returns an empty path when no node contains the offset", () => {
		expect(nodePathAt(tree.root, MD.indexOf("\n\n## Sub") + 1)).toEqual([]);
	});

	it("skips transcluded nodes, whose ranges index another file", () => {
		const root = new OsmosisParser().parse("- local\n", "y.md").root;
		const local = root.children[0]!;
		const embedded: OsmosisNode = {
			...local,
			id: "embedded",
			content: "embedded",
			isTranscluded: true,
			sourceFile: "other.md",
			children: [],
		};
		root.children.unshift(embedded);
		expect(pathText(nodePathAt(root, 0))).toEqual(["local"]);
	});
});
