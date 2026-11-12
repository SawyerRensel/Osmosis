import { describe, it, expect } from "vitest";
import { normalizeWrite } from "../mindmap-edit";
import { OsmosisParser } from "../parser";
import type { OsmosisNode } from "../types";
import { orderedLines, movedOut, planSelectionLink, planSelectionMove, planSelectionRelevel, type PickedLine, type PlanNote } from "./selection-edit";

const parser = new OsmosisParser();

const DECK = "# Deck\n\n- Halyard\n\t- Shackle\n- Sheet\n- Winch\n- Cleat\n\t- Horn\n- Fender\n";
const GALLEY = "# Galley\n\n- Stove\n- Kettle\n\t- Whistle\n- Pantry\n";

function notesOf(texts: Record<string, string>): Map<string, PlanNote> {
	return new Map(Object.entries(texts).map(([path, content]) => [path, { content, root: parser.parse(content, path).root }]));
}

/** The parsed line of `path` whose content is `text`. */
function line(notes: Map<string, PlanNote>, path: string, text: string): OsmosisNode {
	const stack = [notes.get(path)!.root];
	while (stack.length > 0) {
		const node = stack.pop()!;
		if (node.content === text) return node;
		stack.push(...node.children);
	}
	throw new Error(`no line ${text}`);
}

const pick = (notes: Map<string, PlanNote>, path: string, ...texts: string[]): PickedLine[] => texts.map((text) => ({ path, line: line(notes, path, text) }));

/** What the view writes: the plan's text, normalised. */
const out = (text: string | undefined): string | undefined => (text === undefined ? undefined : normalizeWrite(text));

/** The line of `text` that starts at `start`. */
const lineAt = (text: string, start: number): string => text.slice(start, text.indexOf("\n", start) === -1 ? undefined : text.indexOf("\n", start));

describe("orderedLines", () => {
	it("keeps the notes in selection order, each in document order, and drops lines under a selected line", () => {
		const notes = notesOf({ "Deck.md": DECK, "Galley.md": GALLEY });
		const picked = orderedLines([...pick(notes, "Galley.md", "Pantry"), ...pick(notes, "Deck.md", "Winch", "Shackle", "Halyard"), ...pick(notes, "Galley.md", "Stove")]);
		expect(picked.map((p) => p.line.content)).toEqual(["Stove", "Pantry", "Halyard", "Winch"]);
	});
});

describe("planSelectionMove", () => {
	it("moves non-adjacent lines under a target, each with its subtree, in document order", () => {
		const notes = notesOf({ "Deck.md": DECK });
		const plan = planSelectionMove(notes, pick(notes, "Deck.md", "Cleat", "Halyard"), { path: "Deck.md", node: line(notes, "Deck.md", "Fender") }, "under");
		if (plan === null || plan === "inside") throw new Error("no plan");
		const text = plan.texts.get("Deck.md")!;
		expect(normalizeWrite(text)).toBe("# Deck\n\n- Sheet\n- Winch\n- Fender\n\t- Halyard\n\t\t- Shackle\n\t- Cleat\n\t\t- Horn\n");
		expect(plan.lines.map((l) => lineAt(text, l.start))).toEqual(["\t- Halyard", "\t- Cleat"]);
	});

	it("moves after a target, and to the end of the note", () => {
		const notes = notesOf({ "Deck.md": DECK });
		const after = planSelectionMove(notes, pick(notes, "Deck.md", "Fender", "Sheet"), { path: "Deck.md", node: line(notes, "Deck.md", "Halyard") }, "after");
		if (after === null || after === "inside") throw new Error("no plan");
		expect(out(after.texts.get("Deck.md"))).toBe("# Deck\n\n- Halyard\n\t- Shackle\n- Sheet\n- Fender\n- Winch\n- Cleat\n\t- Horn\n");
		const end = planSelectionMove(notes, pick(notes, "Deck.md", "Sheet", "Halyard"), { path: "Deck.md", node: null }, "end");
		if (end === null || end === "inside") throw new Error("no plan");
		expect(out(end.texts.get("Deck.md"))).toBe("# Deck\n\n- Winch\n- Cleat\n\t- Horn\n- Fender\n- Halyard\n\t- Shackle\n- Sheet\n");
	});

	it("moves lines from two notes into a third place, re-levelled, the origins losing them", () => {
		const notes = notesOf({ "Deck.md": DECK, "Galley.md": GALLEY });
		const selected = [...pick(notes, "Galley.md", "Pantry", "Stove"), ...pick(notes, "Deck.md", "Cleat")];
		const plan = planSelectionMove(notes, selected, { path: "Deck.md", node: line(notes, "Deck.md", "Halyard") }, "under");
		if (plan === null || plan === "inside") throw new Error("no plan");
		expect(out(plan.texts.get("Galley.md"))).toBe("# Galley\n\n- Kettle\n\t- Whistle\n");
		const deck = plan.texts.get("Deck.md")!;
		expect(normalizeWrite(deck)).toBe("# Deck\n\n- Halyard\n\t- Shackle\n\t- Stove\n\t- Pantry\n\t- Cleat\n\t\t- Horn\n- Sheet\n- Winch\n- Fender\n");
		// Galley's lines first: the primary's note leads.
		expect(plan.lines.map((l) => [l.path, lineAt(deck, l.start)])).toEqual([
			["Deck.md", "\t- Stove"],
			["Deck.md", "\t- Pantry"],
			["Deck.md", "\t- Cleat"],
		]);
		expect(movedOut(notes, selected, "Deck.md")).toEqual(new Map([["Galley.md", "- Stove\n- Pantry"]]));
	});

	it("moves a selected line inside another selected line once, with its ancestor", () => {
		const notes = notesOf({ "Deck.md": DECK });
		const plan = planSelectionMove(notes, pick(notes, "Deck.md", "Horn", "Cleat", "Shackle"), { path: "Deck.md", node: line(notes, "Deck.md", "Sheet") }, "under");
		if (plan === null || plan === "inside") throw new Error("no plan");
		expect(out(plan.texts.get("Deck.md"))).toBe("# Deck\n\n- Halyard\n- Sheet\n\t- Shackle\n\t- Cleat\n\t\t- Horn\n- Winch\n- Fender\n");
		expect(plan.lines).toHaveLength(2);
	});

	it("refuses a target inside a moving line, or one of them", () => {
		const notes = notesOf({ "Deck.md": DECK });
		expect(planSelectionMove(notes, pick(notes, "Deck.md", "Halyard", "Winch"), { path: "Deck.md", node: line(notes, "Deck.md", "Shackle") }, "under")).toBe("inside");
		expect(planSelectionMove(notes, pick(notes, "Deck.md", "Halyard", "Winch"), { path: "Deck.md", node: line(notes, "Deck.md", "Winch") }, "after")).toBe("inside");
	});

	it("moves headings and a list line to the end of a note, the list line inside the last section", () => {
		const text = "# One\n\n- a\n\n# Two\n\n- b\n\n# Three\n\n- c\n";
		const notes = notesOf({ "N.md": text });
		const plan = planSelectionMove(notes, pick(notes, "N.md", "One", "b"), { path: "N.md", node: null }, "end");
		if (plan === null || plan === "inside") throw new Error("no plan");
		expect(out(plan.texts.get("N.md"))).toBe("# Two\n\n# Three\n\n- c\n- b\n\n# One\n\n- a\n");
	});
});

describe("planSelectionRelevel", () => {
	it("indents non-adjacent lines, each under its previous sibling, and skips a first child (and a run starting there)", () => {
		const notes = notesOf({ "Deck.md": DECK });
		const plan = planSelectionRelevel("indent", notes, pick(notes, "Deck.md", "Halyard", "Winch", "Fender"));
		expect(out(plan?.texts.get("Deck.md"))).toBe("# Deck\n\n- Halyard\n\t- Shackle\n- Sheet\n\t- Winch\n- Cleat\n\t- Horn\n\t- Fender\n");
		expect(plan?.lines.map((l) => l.line.content)).toEqual(["Winch", "Fender"]);
	});

	it("indents a run of adjacent siblings together, under the sibling before the run", () => {
		const notes = notesOf({ "Deck.md": DECK });
		const plan = planSelectionRelevel("indent", notes, pick(notes, "Deck.md", "Winch", "Sheet"));
		expect(out(plan?.texts.get("Deck.md"))).toBe("# Deck\n\n- Halyard\n\t- Shackle\n\t- Sheet\n\t- Winch\n- Cleat\n\t- Horn\n- Fender\n");
	});

	it("outdents lines of different parents, each after its own parent's subtree", () => {
		const text = "# Deck\n\n- P\n\t- A\n\t- Q\n\t\t- B\n\t\t- C\n- R\n";
		const notes = notesOf({ "Deck.md": text });
		const plan = planSelectionRelevel("outdent", notes, pick(notes, "Deck.md", "A", "B"));
		expect(out(plan?.texts.get("Deck.md"))).toBe("# Deck\n\n- P\n\t- Q\n\t\t- C\n\t- B\n- A\n- R\n");
	});

	it("outdents across notes in one plan, and promotes a root list line in place", () => {
		const notes = notesOf({ "Deck.md": DECK, "Galley.md": GALLEY, "Loose.md": "- Rope\n- Chain\n" });
		const plan = planSelectionRelevel("outdent", notes, [...pick(notes, "Deck.md", "Shackle", "Horn"), ...pick(notes, "Galley.md", "Whistle"), ...pick(notes, "Loose.md", "Chain")]);
		expect(out(plan?.texts.get("Deck.md"))).toBe("# Deck\n\n- Halyard\n- Shackle\n- Sheet\n- Winch\n- Cleat\n- Horn\n- Fender\n");
		expect(out(plan?.texts.get("Galley.md"))).toBe("# Galley\n\n- Stove\n- Kettle\n- Whistle\n- Pantry\n");
		expect(out(plan?.texts.get("Loose.md"))).toBe("- Rope\n\nChain\n");
	});

	it("is null when no selected line can move", () => {
		const notes = notesOf({ "Deck.md": DECK });
		expect(planSelectionRelevel("indent", notes, pick(notes, "Deck.md", "Halyard", "Shackle"))).toBeNull();
	});
});

describe("planSelectionLink", () => {
	const link = (_from: string, subpath: string): string => `[[Deck${subpath}]]`;

	it("links every selected line, stamping the target once", () => {
		const notes = notesOf({ "Deck.md": DECK, "Galley.md": GALLEY });
		const plan = planSelectionLink(notes, [...pick(notes, "Galley.md", "Stove", "Whistle"), ...pick(notes, "Deck.md", "Sheet")], { path: "Deck.md", node: line(notes, "Deck.md", "Cleat") }, link);
		const id = /\^([\w-]+)/.exec(plan!.texts.get("Deck.md")!)![1]!;
		expect(out(plan?.texts.get("Galley.md"))).toBe(`# Galley\n\n- Stove [[Deck#^${id}]]\n- Kettle\n\t- Whistle [[Deck#^${id}]]\n- Pantry\n`);
		expect(out(plan?.texts.get("Deck.md"))).toBe(`# Deck\n\n- Halyard\n\t- Shackle\n- Sheet [[Deck#^${id}]]\n- Winch\n- Cleat ^${id}\n\t- Horn\n- Fender\n`);
		expect(plan?.texts.get("Deck.md")!.match(/\^/g)).toHaveLength(2);
		const deck = plan!.texts.get("Deck.md")!;
		expect(plan?.lines.filter((l) => l.path === "Deck.md").map((l) => lineAt(deck, l.start))).toEqual([`- Sheet [[Deck#^${id}]]`, `- Cleat ^${id}`]);
		expect(plan?.lines.at(-1)?.line.content).toBe("Cleat");
		expect(plan?.skipped).toBe(0);
	});

	it("reuses the target's block ID, and skips the target itself", () => {
		const text = "# Deck\n\n- Sheet\n- Cleat ^cleat\n- Fender\n";
		const notes = notesOf({ "Deck.md": text });
		const plan = planSelectionLink(notes, pick(notes, "Deck.md", "Sheet", "Cleat", "Fender"), { path: "Deck.md", node: line(notes, "Deck.md", "Cleat") }, link);
		expect(out(plan?.texts.get("Deck.md"))).toBe("# Deck\n\n- Sheet [[Deck#^cleat]]\n- Cleat ^cleat\n- Fender [[Deck#^cleat]]\n");
		expect(plan?.skipped).toBe(1);
	});

	it("labels every link with an arrow, not a numbered marker", () => {
		const aliased = (_from: string, subpath: string, alias: string): string => `[[Deck${subpath}|${alias}]]`;
		const galley = "# Galley\n\n- Stove [[Deck#^old|^2]]\n- Kettle\n\t- Whistle\n- Pantry\n";
		const notes = notesOf({ "Deck.md": "# Deck\n\n- Sheet\n- Cleat ^cleat\n- Fender\n", "Galley.md": galley });
		const plan = planSelectionLink(notes, [...pick(notes, "Galley.md", "Kettle", "Pantry"), ...pick(notes, "Deck.md", "Sheet")], { path: "Deck.md", node: line(notes, "Deck.md", "Cleat") }, aliased);
		expect(out(plan?.texts.get("Galley.md"))).toBe("# Galley\n\n- Stove [[Deck#^old|^2]]\n- Kettle [[Deck#^cleat|-->]]\n\t- Whistle\n- Pantry [[Deck#^cleat|-->]]\n");
		expect(out(plan?.texts.get("Deck.md"))).toBe("# Deck\n\n- Sheet [[Deck#^cleat|-->]]\n- Cleat ^cleat\n- Fender\n");
	});

	it("links to a note: its own lines are skipped, and nothing is stamped", () => {
		const notes = notesOf({ "Deck.md": DECK, "Galley.md": GALLEY });
		const plan = planSelectionLink(notes, [...pick(notes, "Deck.md", "Sheet"), ...pick(notes, "Galley.md", "Pantry")], { path: "Deck.md", node: null }, link);
		expect([...plan!.texts.keys()]).toEqual(["Galley.md"]);
		expect(out(plan?.texts.get("Galley.md"))).toBe("# Galley\n\n- Stove\n- Kettle\n\t- Whistle\n- Pantry [[Deck]]\n");
		expect(plan?.skipped).toBe(1);
	});
});
