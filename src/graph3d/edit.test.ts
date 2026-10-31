import { describe, it, expect } from "vitest";
import { OsmosisParser } from "../parser";
import { toggleCheckboxLine } from "../mindmap-edit";
import { buildGraph } from "./model";
import { findNodeById, heldDiff, isEditableTarget, lineNodeAt } from "./edit";

const parser = new OsmosisParser();

const note = "## Rigging\n\n- [ ] Check the halyard\n- [x] Coil the sheet\n\t- [ ] Stow the fender\n";

describe("findNodeById", () => {
	it("finds a nested line by its parse ID", () => {
		const tree = parser.parse(note, "Rig.md");
		const fender = tree.root.children[0]!.children[1]!.children[0]!;
		expect(findNodeById(tree.root, fender.id)).toBe(fender);
	});

	it("finds the same line after text above it changed", () => {
		const before = parser.parse(note, "Rig.md");
		const target = before.root.children[0]!.children[0]!;
		const after = parser.parse(`Intro paragraph.\n\n${note}`, "Rig.md");
		const found = findNodeById(after.root, target.id);
		expect(found?.content).toBe("[ ] Check the halyard");
		expect(found?.range.start).toBeGreaterThan(target.range.start);
	});

	it("is null once the line is gone", () => {
		const before = parser.parse(note, "Rig.md");
		const target = before.root.children[0]!.children[0]!;
		const after = parser.parse(note.replace("- [ ] Check the halyard\n", ""), "Rig.md");
		expect(findNodeById(after.root, target.id)).toBeNull();
	});

	it("splices a toggle against fresh bytes, not the stale offsets", () => {
		const stale = parser.parse(note, "Rig.md").root.children[0]!.children[0]!;
		const fresh = `Intro paragraph.\n\n${note}`;
		const found = findNodeById(parser.parse(fresh, "Rig.md").root, stale.id)!;
		const line = fresh.slice(found.range.start, found.range.end);
		const out = fresh.slice(0, found.range.start) + toggleCheckboxLine(line, found.metadata?.checked === true) + fresh.slice(found.range.end);
		expect(out).toBe(fresh.replace("- [ ] Check the halyard", "- [x] Check the halyard"));
	});

	it("toggles a parent checkbox line only, keeping its block id and its children", () => {
		const md = "## Before sailing\n\n- [ ] Test the lights ^nav-lights\n\t- [ ] Replace the port bulb\n\t- [x] Wipe the lenses\n- [ ] Next\n";
		const parent = parser.parse(md, "Dock.md").root.children[0]!.children[0]!;
		expect(parent.metadata?.checkbox).toBe(true);
		const line = md.slice(parent.range.start, parent.range.end);
		expect(line).toBe("- [ ] Test the lights ^nav-lights");
		const out = md.slice(0, parent.range.start) + toggleCheckboxLine(line, parent.metadata?.checked === true) + md.slice(parent.range.end);
		expect(out).toBe(md.replace("- [ ] Test the lights", "- [x] Test the lights"));
	});

	it("loses a checkbox line's ID when it is ticked, since the box is in its content", () => {
		const open = parser.parse("- [ ] Check the halyard\n", "Rig.md").root.children[0]!;
		const done = parser.parse("- [x] Check the halyard\n", "Rig.md").root.children[0]!;
		expect(done.id).not.toBe(open.id);
		expect(done.range.start).toBe(open.range.start);
	});
});

describe("lineNodeAt", () => {
	const model = buildGraph([{ tree: parser.parse(note, "Rig.md"), cache: null }], () => null);

	it("finds the line that starts at an offset in a note", () => {
		const start = note.indexOf("- [x] Coil the sheet");
		const id = lineNodeAt(model, "Rig.md", start);
		expect(model.nodes.find((n) => n.id === id)?.label).toBe("[x] Coil the sheet");
	});

	it("is null for another note or an offset that starts no line", () => {
		expect(lineNodeAt(model, "Other.md", 0)).toBeNull();
		expect(lineNodeAt(model, "Rig.md", 1)).toBeNull();
	});
});

describe("heldDiff", () => {
	it("acquires what arrived and releases what left", () => {
		expect(heldDiff(new Set(["A.md", "B.md"]), new Set(["B.md", "C.md"]))).toEqual({ acquire: ["C.md"], release: ["A.md"] });
	});

	it("does nothing when the set is the same", () => {
		expect(heldDiff(new Set(["A.md"]), new Set(["A.md"]))).toEqual({ acquire: [], release: [] });
	});

	it("acquires everything from empty and releases everything to empty", () => {
		expect(heldDiff(new Set(), new Set(["A.md", "B.md"]))).toEqual({ acquire: ["A.md", "B.md"], release: [] });
		expect(heldDiff(new Set(["A.md", "B.md"]), new Set())).toEqual({ acquire: [], release: ["A.md", "B.md"] });
	});
});

describe("isEditableTarget", () => {
	const target = (props: object): EventTarget => props as unknown as EventTarget;

	it("accepts text boxes and contenteditable editors", () => {
		expect(isEditableTarget(target({ tagName: "INPUT" }))).toBe(true);
		expect(isEditableTarget(target({ tagName: "TEXTAREA" }))).toBe(true);
		expect(isEditableTarget(target({ tagName: "DIV", isContentEditable: true }))).toBe(true);
	});

	it("rejects the canvas, plain elements, the window and nothing", () => {
		expect(isEditableTarget(target({ tagName: "CANVAS", isContentEditable: false }))).toBe(false);
		expect(isEditableTarget(target({}))).toBe(false);
		expect(isEditableTarget(null)).toBe(false);
	});
});
