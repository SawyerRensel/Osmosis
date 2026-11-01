import { describe, it, expect } from "vitest";
import { OsmosisParser } from "../parser";
import { normalizeWrite, renameInFile, toggleCheckboxLine } from "../mindmap-edit";
import { buildGraph } from "./model";
import { ancestorsOf, appendToLine, editBoxGeometry, findNodeById, fitEditTop, heldDiff, isEditableTarget, lineNodeAt, linkInNote, linkSubpath, locateLine, stampBlockId } from "./edit";

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

describe("ancestorsOf", () => {
	it("lists parents nearest first, ending at the root", () => {
		const root = parser.parse(note, "Rig.md").root;
		const fender = root.children[0]!.children[1]!.children[0]!;
		const up = ancestorsOf(root, fender.id);
		expect(up).toHaveLength(3);
		expect(up[0]!.content).toBe("[x] Coil the sheet");
		expect(up[1]!.content).toBe("Rigging");
		expect(up[2]).toBe(root);
	});

	it("is empty for the root and for an unknown id", () => {
		const root = parser.parse(note, "Rig.md").root;
		expect(ancestorsOf(root, root.id)).toEqual([]);
		expect(ancestorsOf(root, "nope")).toEqual([]);
	});

	it("feeds renameInFile: a list item turned into a heading is retyped", () => {
		const md = "## Rigging\n\n- Halyard\n\t- Shackle\n- Sheet\n";
		const root = parser.parse(md, "Rig.md").root;
		const halyard = root.children[0]!.children[0]!;
		const out = renameInFile(md, halyard, ancestorsOf(root, halyard.id), "### Halyard");
		expect(out.retyped).toBe(true);
		const moved = parser.parse(normalizeWrite(out.text), "Rig.md").root.children[0]!;
		expect(moved.children.map((c) => c.content)).toEqual(["Sheet", "Halyard"]);
		expect(moved.children[1]!.children.map((c) => c.content)).toEqual(["Shackle"]);
	});
});

describe("locateLine", () => {
	it("finds the line where normalised spacing moved it", () => {
		const out = "- one\n\n## Heading\n\n- two\n";
		expect(locateLine(out, "## Heading", 6)).toBe(out.indexOf("## Heading"));
	});

	it("picks the occurrence nearest the hint among duplicates", () => {
		const text = "- same\n- other\n- same\n";
		expect(locateLine(text, "- same", 14)).toBe(text.lastIndexOf("- same"));
		expect(locateLine(text, "- same", 1)).toBe(0);
	});

	it("falls back to the hint when the line is gone verbatim or empty", () => {
		expect(locateLine("2. a\n", "3. a", 0)).toBe(0);
		expect(locateLine("x\n", "", 1)).toBe(1);
	});
});

describe("editBoxGeometry", () => {
	const bounds = { left: 0, top: 0, right: 1000, bottom: 700 };

	it("keeps the node's left, top and width when they fit", () => {
		expect(editBoxGeometry({ left: 100, top: 200, width: 300, height: 40 }, bounds)).toEqual({ left: 100, top: 200, width: 300, maxHeight: 492 });
	});

	it("widens a tiny far plate and narrows a huge panel to a readable range", () => {
		expect(editBoxGeometry({ left: 100, top: 200, width: 12, height: 4 }, bounds).width).toBe(240);
		expect(editBoxGeometry({ left: 100, top: 200, width: 2000, height: 400 }, bounds).width).toBe(560);
	});

	it("stays inside the bounds, with room for the buttons above", () => {
		const box = editBoxGeometry({ left: 950, top: -50, width: 300, height: 40 }, bounds);
		expect(box.left).toBe(1000 - 8 - 300);
		expect(box.top).toBe(8 + 36);
		const low = editBoxGeometry({ left: 10, top: 900, width: 300, height: 40 }, bounds);
		expect(low.top).toBe(700 - 8 - 48);
	});

	it("shrinks to a phone-width viewport", () => {
		const phone = { left: 0, top: 0, right: 360, bottom: 400 };
		const box = editBoxGeometry({ left: 20, top: 100, width: 100, height: 20 }, phone);
		expect(box.width).toBe(240);
		expect(box.left + box.width).toBeLessThanOrEqual(360 - 8);
		const narrow = editBoxGeometry({ left: 0, top: 100, width: 100, height: 20 }, { left: 0, top: 0, right: 200, bottom: 400 });
		expect(narrow.width).toBe(184);
	});
});

describe("fitEditTop", () => {
	const bounds = { left: 0, top: 0, right: 360, bottom: 400 };

	it("leaves a box that fits where it is", () => {
		expect(fitEditTop(100, 60, bounds)).toBe(100);
	});

	it("lifts a box the keyboard or its own growth pushed past the bottom", () => {
		expect(fitEditTop(300, 120, bounds)).toBe(400 - 8 - 120);
	});

	it("never rises above the room the buttons need", () => {
		expect(fitEditTop(300, 900, bounds)).toBe(8 + 36);
	});
});

describe("linkSubpath", () => {
	const md = "## Rigging\n\n- Check the halyard\n- Coil the sheet ^coil\n\n## Rigging\n\n- Later\n\n## Why: sails\n";
	const root = parser.parse(md, "Rig.md").root;
	const [firstHeading, secondHeading, colonHeading] = root.children;

	it("is the note itself for a null target", () => {
		expect(linkSubpath(null, root, md)).toEqual({ subpath: "", stamp: null });
	});

	it("links a heading by its text, stamping nothing", () => {
		expect(linkSubpath(firstHeading!, root, md)).toEqual({ subpath: "#Rigging", stamp: null });
	});

	it("falls back to a block ID for a heading an earlier one shares its text with", () => {
		const link = linkSubpath(secondHeading!, root, md)!;
		expect(link.subpath).toBe(`#^${link.stamp}`);
		expect(link.stamp).toMatch(/^os-[a-z0-9]{6}$/);
	});

	it("falls back to a block ID for a heading with punctuation a link would mangle", () => {
		expect(linkSubpath(colonHeading!, root, md)?.stamp).not.toBeNull();
	});

	it("uses the ID a line already has", () => {
		const coil = firstHeading!.children[1]!;
		expect(linkSubpath(coil, root, md)).toEqual({ subpath: "#^coil", stamp: null });
	});

	it("generates an ID that no block in the note uses", () => {
		const bullet = firstHeading!.children[0]!;
		const link = linkSubpath(bullet, root, md)!;
		expect(link.stamp).not.toBe("coil");
		expect(link.subpath).toBe(`#^${link.stamp}`);
	});

	it("refuses an embed, a card fence, and a paragraph line that runs on", () => {
		const text = "Para one\nstill para one\n\n![[Other]]\n\n```osmosis\nQ\n```\n";
		const tree = parser.parse(text, "X.md").root;
		const embed = tree.children.find((n) => n.type === "transclusion");
		const fence = tree.children.find((n) => n.type === "codeblock");
		const para = tree.children.find((n) => n.type === "paragraph");
		expect(embed).toBeDefined();
		expect(fence).toBeDefined();
		expect(linkSubpath(embed!, tree, text)).toBeNull();
		expect(linkSubpath(fence!, tree, text)).toBeNull();
		expect(para && linkSubpath(para, tree, text)).toBeNull();
	});
});

describe("stampBlockId", () => {
	it("adds ' ^id' at the end of a bullet and a heading", () => {
		const md = "## Rigging\n\n- Check the halyard\n";
		const tree = parser.parse(md, "Rig.md").root;
		const heading = tree.children[0]!;
		expect(stampBlockId(md, heading.children[0]!, "os-aaaaaa")).toBe("## Rigging\n\n- Check the halyard ^os-aaaaaa\n");
		expect(stampBlockId(md, heading, "os-aaaaaa")).toBe("## Rigging ^os-aaaaaa\n\n- Check the halyard\n");
	});

	it("puts a multiline block's ID on its own line after it, where the parser reads it", () => {
		const md = "| a | b |\n| - | - |\n| 1 | 2 |\n\n- next\n";
		const table = parser.parse(md, "T.md").root.children[0]!;
		expect(table.type).toBe("table");
		const out = stampBlockId(md, table, "os-bbbbbb");
		expect(out).toBe("| a | b |\n| - | - |\n| 1 | 2 |\n^os-bbbbbb\n\n- next\n");
		expect(parser.parse(out, "T.md").root.children[0]!.blockId).toBe("os-bbbbbb");
	});

	it("stamps a code block and a blockquote the same way", () => {
		const md = "```js\nlet a = 1;\n```\n\n> quoted\n> lines\n";
		const [code, quote] = parser.parse(md, "C.md").root.children;
		const out = stampBlockId(stampBlockId(md, quote!, "os-cccccc"), code!, "os-dddddd");
		expect(out).toBe("```js\nlet a = 1;\n```\n^os-dddddd\n\n> quoted\n> lines\n^os-cccccc\n");
	});

	it("is read back as the node's block ID", () => {
		const md = "- one\n- two\n";
		const two = parser.parse(md, "L.md").root.children[1]!;
		expect(parser.parse(stampBlockId(md, two, "os-eeeeee"), "L.md").root.children[1]!.blockId).toBe("os-eeeeee");
	});
});

describe("appendToLine", () => {
	it("adds the text at the end of a line", () => {
		const md = "- Check the halyard\n- Coil\n";
		expect(appendToLine(md, parser.parse(md, "R.md").root.children[0]!, "[[Other]]")).toBe("- Check the halyard [[Other]]\n- Coil\n");
	});

	it("adds it before a trailing block ID", () => {
		const md = "- Check the halyard ^halyard\n";
		expect(appendToLine(md, parser.parse(md, "R.md").root.children[0]!, "[[Other#^x]]")).toBe("- Check the halyard [[Other#^x]] ^halyard\n");
	});

	it("keeps a nested line's indentation and ignores trailing spaces", () => {
		const md = "- Parent\n\t- Child   \n";
		const child = parser.parse(md, "R.md").root.children[0]!.children[0]!;
		expect(appendToLine(md, child, "[[Other]]")).toBe("- Parent\n\t- Child [[Other]]   \n");
	});

	it("works on a heading", () => {
		const md = "## Rigging\n";
		expect(appendToLine(md, parser.parse(md, "R.md").root.children[0]!, "[[Other]]")).toBe("## Rigging [[Other]]\n");
	});

	it("refuses a multiline block and an embed", () => {
		const md = "```js\nx\n```\n\n> q\n\n![[Embed]]\n";
		for (const node of parser.parse(md, "R.md").root.children) expect(appendToLine(md, node, "[[Other]]")).toBeNull();
	});
});

describe("linkInNote", () => {
	const md = "- Alpha\n- Beta\n- Gamma ^g\n";
	const [alpha, beta, gamma] = parser.parse(md, "L.md").root.children;

	it("links forward: the later line is stamped first, so the earlier splice lands where it should", () => {
		const out = linkInNote(md, alpha!, beta!, "[[#^os-b]]", "os-b")!;
		expect(out.content).toBe("- Alpha [[#^os-b]]\n- Beta ^os-b\n- Gamma ^g\n");
		expect(out.content.slice(out.aStart, out.aStart + 7)).toBe("- Alpha");
		expect(out.content.slice(out.bStart!, out.bStart! + 6)).toBe("- Beta");
	});

	it("links backward: the target above the source is stamped, and the source's start moves", () => {
		const out = linkInNote(md, beta!, alpha!, "[[#^os-a]]", "os-a")!;
		expect(out.content).toBe("- Alpha ^os-a\n- Beta [[#^os-a]]\n- Gamma ^g\n");
		expect(out.content.slice(out.aStart, out.aStart + 6)).toBe("- Beta");
		expect(out.bStart).toBe(0);
	});

	it("stamps nothing when the target already has an ID, or is the note", () => {
		expect(linkInNote(md, alpha!, gamma!, "[[#^g]]", null)!.content).toBe("- Alpha [[#^g]]\n- Beta\n- Gamma ^g\n");
		expect(linkInNote(md, alpha!, null, "[[Note]]", null)).toMatchObject({ bStart: null });
	});

	it("is null when the source cannot take text", () => {
		const text = "```js\nx\n```\n\n- one\n";
		const [code, one] = parser.parse(text, "L.md").root.children;
		expect(linkInNote(text, code!, one!, "[[#^x]]", "x")).toBeNull();
	});
});
