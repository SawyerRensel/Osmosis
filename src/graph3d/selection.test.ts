import { describe, it, expect } from "vitest";
import { OsmosisParser } from "../parser";
import type { OsmosisNode } from "../types";
import { boxHits, boxRect, deleteLines, linesMarkdown, selectionMarkdown, toggled, topmostLines } from "./selection";

const parser = new OsmosisParser();

const note = "# Sailing Basics\n\n## Rigging\n\n- Halyard\n\t- Shackle\n\t- Winch\n- Sheet\n\n## Knots\n\n- Bowline\n- Cleat hitch\n";

/** The parsed line whose content is `text`. */
function line(root: OsmosisNode, text: string): OsmosisNode {
	const stack = [root];
	while (stack.length > 0) {
		const node = stack.pop()!;
		if (node.content === text) return node;
		stack.push(...node.children);
	}
	throw new Error(`no line ${text}`);
}

describe("boxRect and boxHits", () => {
	it("normalises a box drawn up and to the left", () => {
		expect(boxRect(50, 40, 10, 5)).toEqual({ left: 10, top: 5, right: 50, bottom: 40 });
	});

	it("selects plates whose centre is inside, edges included", () => {
		const rect = boxRect(0, 0, 100, 100);
		const hits = boxHits(
			[
				{ id: "in", x: 50, y: 50 },
				{ id: "edge", x: 100, y: 0 },
				{ id: "out", x: 101, y: 50 },
				{ id: "above", x: 50, y: -1 },
			],
			rect,
		);
		expect(hits).toEqual(["in", "edge"]);
	});
});

describe("toggled", () => {
	it("adds a plate not selected and removes one that was, leaving the input alone", () => {
		const start = new Set(["a"]);
		expect([...toggled(start, "b")]).toEqual(["a", "b"]);
		expect([...toggled(start, "a")]).toEqual([]);
		expect([...start]).toEqual(["a"]);
	});
});

describe("topmostLines", () => {
	it("sorts into document order and drops lines inside another selected line's subtree", () => {
		const { root } = parser.parse(note, "Sailing Basics.md");
		const picked = topmostLines([line(root, "Bowline"), line(root, "Winch"), line(root, "Halyard"), line(root, "Sheet")]);
		expect(picked.map((n) => n.content)).toEqual(["Halyard", "Sheet", "Bowline"]);
	});

	it("drops lines under a selected heading", () => {
		const { root } = parser.parse(note, "Sailing Basics.md");
		expect(topmostLines([line(root, "Shackle"), line(root, "Rigging")]).map((n) => n.content)).toEqual(["Rigging"]);
	});
});

describe("deleteLines", () => {
	it("deletes every selected line with its subtree, however they were picked", () => {
		const { root } = parser.parse(note, "Sailing Basics.md");
		const out = deleteLines(note, [line(root, "Cleat hitch"), line(root, "Halyard"), line(root, "Shackle")]);
		expect(out).toBe("# Sailing Basics\n\n## Rigging\n\n- Sheet\n\n## Knots\n\n- Bowline\n");
	});
});

describe("linesMarkdown", () => {
	it("re-levels nested list lines so the shallowest is top level", () => {
		const { root } = parser.parse(note, "Sailing Basics.md");
		expect(linesMarkdown(note, [line(root, "Winch"), line(root, "Shackle")])).toBe("- Shackle\n- Winch");
	});

	it("keeps a line's subtree and its relative indent", () => {
		const { root } = parser.parse(note, "Sailing Basics.md");
		expect(linesMarkdown(note, [line(root, "Sheet"), line(root, "Halyard")])).toBe("- Halyard\n\t- Shackle\n\t- Winch\n- Sheet");
	});

	it("shifts headings so the shallowest selected is an H1", () => {
		const { root } = parser.parse(note, "Sailing Basics.md");
		expect(linesMarkdown(note, [line(root, "Knots")])).toBe("# Knots\n\n- Bowline\n- Cleat hitch");
	});
});

describe("selectionMarkdown", () => {
	it("is one note's lines alone, with no title", () => {
		expect(selectionMarkdown([{ title: "Sailing Basics", markdown: "- Sheet" }])).toBe("- Sheet");
	});

	it("titles each note's group with a link when the copy spans notes", () => {
		const out = selectionMarkdown([
			{ title: "Sailing Basics", markdown: "- Sheet" },
			{ title: "Galley Handbook", markdown: "- Kettle" },
			{ title: null, markdown: "#knots" },
		]);
		expect(out).toBe("[[Sailing Basics]]\n- Sheet\n\n[[Galley Handbook]]\n- Kettle\n\n#knots");
	});
});
