import { describe, it, expect } from "vitest";
import { OsmosisParser } from "./parser";
import { selectAfterDelete } from "./select-after-delete";
import type { OsmosisNode } from "./types";

const parser = new OsmosisParser();

const note = "## Rigging\n\n- Halyard\n\t- Shackle\n\t- Winch\n- Sheet\n- Cleat\n\n## Knots\n\n- Bowline\n- Hitch\n";

const root = parser.parse(note, "t.md").root;

/** The id of the line whose content is `text`. */
function id(text: string, from: OsmosisNode = root): string {
	const stack = [from];
	while (stack.length > 0) {
		const node = stack.pop()!;
		if (node.content === text) return node.id;
		stack.push(...node.children);
	}
	throw new Error(`no line ${text}`);
}

describe("selectAfterDelete", () => {
	it("selects the previous sibling of a middle sibling", () => {
		expect(selectAfterDelete(root, [id("Sheet")])).toBe(id("Halyard"));
		expect(selectAfterDelete(root, [id("Winch")])).toBe(id("Shackle"));
	});

	it("selects the previous sibling, not its last descendant", () => {
		expect(selectAfterDelete(root, [id("Cleat")])).toBe(id("Sheet"));
		expect(selectAfterDelete(root, [id("Knots")])).toBe(id("Rigging"));
	});

	it("selects the parent of a first child", () => {
		expect(selectAfterDelete(root, [id("Shackle")])).toBe(id("Halyard"));
		expect(selectAfterDelete(root, [id("Halyard")])).toBe(id("Rigging"));
		expect(selectAfterDelete(root, [id("Bowline")])).toBe(id("Knots"));
	});

	it("anchors a multi-delete on the first deleted line in document order, whatever order the ids come in", () => {
		expect(selectAfterDelete(root, [id("Hitch"), id("Cleat"), id("Sheet")])).toBe(id("Halyard"));
		expect(selectAfterDelete(root, [id("Hitch"), id("Winch")])).toBe(id("Shackle"));
	});

	it("anchors a multi-delete across subtrees on the deeper line when it comes first", () => {
		expect(selectAfterDelete(root, [id("Cleat"), id("Winch")])).toBe(id("Shackle"));
	});

	it("anchors on the parent when a deleted parent and its deleted child go together", () => {
		expect(selectAfterDelete(root, [id("Shackle"), id("Halyard")])).toBe(id("Rigging"));
		expect(selectAfterDelete(root, [id("Sheet"), id("Halyard"), id("Winch")])).toBe(id("Rigging"));
	});

	it("never returns a deleted node", () => {
		const deleted = [id("Sheet"), id("Cleat"), id("Winch"), id("Knots")];
		expect(deleted).not.toContain(selectAfterDelete(root, deleted));
	});

	it("returns null when the first deleted line is top level with nothing before it", () => {
		expect(selectAfterDelete(root, [id("Rigging")])).toBeNull();
	});

	it("selects the previous top-level sibling of a later top-level line", () => {
		expect(selectAfterDelete(root, [id("Knots")])).toBe(id("Rigging"));
	});

	it("ignores the root itself and unknown ids; null when nothing is left to anchor on", () => {
		expect(selectAfterDelete(root, [root.id])).toBeNull();
		expect(selectAfterDelete(root, [root.id, id("Sheet")])).toBe(id("Halyard"));
		expect(selectAfterDelete(root, ["nope"])).toBeNull();
		expect(selectAfterDelete(root, [])).toBeNull();
	});

	it("treats a deleted sole H1 like any top-level line: its parent is the root, so null", () => {
		const titled = parser.parse("# Title\n\n- One\n- Two\n", "t.md").root;
		expect(selectAfterDelete(titled, [id("Title", titled)])).toBeNull();
		expect(selectAfterDelete(titled, [id("One", titled)])).toBe(id("Title", titled));
		expect(selectAfterDelete(titled, [id("Two", titled)])).toBe(id("One", titled));
	});
});
