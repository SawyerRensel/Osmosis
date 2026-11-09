import { describe, it, expect } from "vitest";
import { OsmosisParser } from "../parser";
import type { OsmosisNode } from "../types";
import { normalizeWrite, renameInFile, toggleCheckboxLine } from "../mindmap-edit";
import { buildGraph } from "./model";
import { ancestorsOf, appendToLine, bandOffset, carryPairs, editorAnchor, findNodeById, fitEditWidth, heldDiff, isEditableTarget, lineNodeAt, linkInNote, linkSubpath, locateLine, mapStart, moveGap, moveInNote, moveRefusal, nodeAtStart, planStructural, preorder, stampBlockId, visibleBand, type StructuralAction } from "./edit";

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

describe("editorAnchor", () => {
	const size = { width: 1000, height: 600 };

	it("centres on the projected node, in stage px", () => {
		expect(editorAnchor({ x: 0, y: 0 }, 100, 1, size, 800, 8)).toEqual({ x: 500, y: 300, scale: 1 });
		const corner = editorAnchor({ x: -1, y: 1 }, 100, 1, size, 800, 8);
		expect([corner?.x, corner?.y]).toEqual([0, 0]);
	});

	it("scales as a panel does, smaller with depth", () => {
		expect(editorAnchor({ x: 0, y: 0 }, 200, 1, size, 800, 8)?.scale).toBe(0.5);
		expect(editorAnchor({ x: 0, y: 0 }, 50, 1, size, 800, 8)?.scale).toBe(2);
	});

	it("is null for a node behind the camera or at its near plane", () => {
		expect(editorAnchor({ x: 0, y: 0 }, -5, 1, size, 800, 8)).toBeNull();
		expect(editorAnchor({ x: 0, y: 0 }, 1, 1, size, 800, 8)).toBeNull();
	});
});

describe("visibleBand", () => {
	it("is the visual viewport when there is no keyboard to subtract", () => {
		expect(visibleBand({ offsetTop: 0, height: 700 }, 800, null)).toEqual({ top: 0, bottom: 700 });
		expect(visibleBand(null, 800, { top: 0, height: 0 })).toEqual({ top: 0, bottom: 800 });
	});

	it("stops above a keyboard that overlays the page", () => {
		expect(visibleBand({ offsetTop: 0, height: 800 }, 800, { top: 480, height: 320 })).toEqual({ top: 0, bottom: 480 });
	});
});

describe("bandOffset", () => {
	it("is 0 when the whole stage shows", () => {
		expect(bandOffset(40, 760, { top: 0, bottom: 800 })).toBe(0);
	});

	it("lifts the picture's centre to the middle of what the keyboard leaves", () => {
		// Stage 40–800, centre 420; visible 40–480, centre 260.
		expect(bandOffset(40, 760, { top: 0, bottom: 480 })).toBe(160);
	});

	it("is 0 when almost none of the stage shows", () => {
		expect(bandOffset(40, 760, { top: 0, bottom: 60 })).toBe(0);
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

describe("planStructural", () => {
	const md = "# Harbour\n\n## Moorings\n\n- Bow line\n- Stern line ^stern\n\t- Spring\n\t- Breast\n\n## Fuel\n\n- Diesel\n";
	const tree = parser.parse(md, "Harbour.md").root;
	const lineOf = (content: string): OsmosisNode => preorder(tree).find((n) => n.content === content)!;
	/** The plan run through `normalizeWrite` and parsed back: the text, and the line it selects (and what it is). */
	const run = (action: StructuralAction, content: string) => {
		const plan = planStructural(action, md, tree, lineOf(content));
		if (plan === null) return null;
		const text = normalizeWrite(plan.text);
		const selected = plan.select === null ? null : mapStart(plan.text, text, plan.select);
		const root = parser.parse(text, "Harbour.md").root;
		return { plan, text, selected, node: selected === null ? null : nodeAtStart(root, selected), root };
	};

	it("child and sibling select a new empty line of the right kind", () => {
		const child = run("child", "Stern line")!;
		expect(child.plan.fresh).toBe(true);
		expect(child.node).toMatchObject({ type: "bullet", depth: 1, content: "" });
		expect(child.text).toContain("\t- Breast\n\t- \n");
		const sibling = run("sibling", "Spring")!;
		expect(sibling.node).toMatchObject({ type: "bullet", depth: 1, content: "" });
		const heading = run("sibling", "Moorings")!;
		expect(heading.node).toMatchObject({ type: "heading", depth: 2, content: "" });
	});

	it("parent selects a new empty line and keeps the old one as its child", () => {
		const out = run("parent", "Bow line")!;
		expect(out.plan.fresh).toBe(true);
		expect(out.node).toMatchObject({ type: "bullet", depth: 0, content: "" });
		expect(out.node?.children.map((c) => c.content)).toEqual(["Bow line"]);
		expect(out.plan.moved?.node.content).toBe("Bow line");
	});

	it("delete selects the previous sibling, else the parent, or the note when the parent is the root", () => {
		const nested = run("delete", "Spring")!;
		expect(nested.node?.content).toBe("Stern line");
		expect(nested.text).not.toContain("Spring");
		const middle = run("delete", "Breast")!;
		expect(middle.node?.content).toBe("Spring");
		expect(middle.text).not.toContain("Breast");
		expect(run("delete", "Stern line")!.node?.content).toBe("Bow line");
		expect(run("delete", "Fuel")!.node?.content).toBe("Moorings");
		const top = run("delete", "Harbour")!;
		expect(top.plan.select).toBeNull();
		expect(top.text).toBe("");
	});

	it("up, down, indent and outdent keep the line selected where it went", () => {
		const down = run("down", "Bow line")!;
		expect(down.node?.content).toBe("Bow line");
		expect(down.root.children[0]!.children[0]!.children.map((c) => c.content)).toEqual(["Stern line", "Bow line"]);
		const up = run("up", "Fuel")!;
		expect(up.node?.content).toBe("Fuel");
		const indent = run("indent", "Stern line")!;
		expect(indent.node).toMatchObject({ content: "Stern line", depth: 1 });
		expect(indent.node?.children.map((c) => c.content)).toEqual(["Spring", "Breast"]);
		const outdent = run("outdent", "Spring")!;
		expect(outdent.node).toMatchObject({ content: "Spring", depth: 0 });
	});

	it("does nothing where the mind map does nothing", () => {
		expect(run("up", "Bow line")).toBeNull();
		expect(run("down", "Fuel")).toBeNull();
		expect(run("indent", "Bow line")).toBeNull();
		expect(run("outdent", "Harbour")).toBeNull();
	});
});

describe("mapStart", () => {
	it("follows a line through blank lines added and dropped, and renumbering", () => {
		const before = "# A\n## B\n\n\n- x\n2. y\n";
		const after = "# A\n\n## B\n\n- x\n1. y\n";
		expect(mapStart(before, after, before.indexOf("- x"))).toBe(after.indexOf("- x"));
		expect(mapStart(before, after, before.indexOf("2. y"))).toBe(after.indexOf("1. y"));
		expect(mapStart(before, after, 0)).toBe(0);
	});

	it("is null on a blank line or when the text is shorter", () => {
		expect(mapStart("a\n\nb", "a\n\nb", 2)).toBeNull();
		expect(mapStart("a\nb", "a", 2)).toBeNull();
	});
});

describe("carryPairs", () => {
	it("pairs a re-levelled subtree line by line", () => {
		const before = "- A\n- B\n\t- B1\n\t\t- B2\n";
		const after = "- A\n\t- B\n\t\t- B1\n\t\t\t- B2\n";
		const b = parser.parse(before, "T.md").root.children[1]!;
		const now = parser.parse(after, "T.md").root;
		const pairs = carryPairs(b, now, after.indexOf("\t- B\n"));
		expect(pairs.map((p) => [p.from.content, p.to.content, p.from.id === p.to.id])).toEqual([
			["B", "B", false],
			["B1", "B1", false],
			["B2", "B2", false],
		]);
	});

	it("pairs only the line when the shapes differ, and nothing when no line starts there", () => {
		const b = parser.parse("- B\n\t- B1\n", "T.md").root.children[0]!;
		const now = parser.parse("- B\n", "T.md").root;
		expect(carryPairs(b, now, 0)).toHaveLength(1);
		expect(carryPairs(b, now, 99)).toEqual([]);
	});
});

describe("moving a line (Move under / Move after / Move to end of note)", () => {
	const note = ["# Deck", "", "- Coil the lines", "\t- Bow line", "\t- Stern line", "- Rig the fenders ^os-fend01", "", "## Galley", "", "1. Light the stove", "2. Boil water", ""].join("\n");
	const root = parser.parse(note, "Deck.md").root;
	const at = (content: string): OsmosisNode => preorder(root).find((n) => n.content === content)!;

	it("finds the gap: last child under, next sibling after", () => {
		const fenders = at("Rig the fenders");
		expect(moveGap(root, at("Coil the lines"), "under", fenders)).toEqual({ parent: at("Coil the lines"), index: 2 });
		expect(moveGap(root, at("Bow line"), "after", fenders)).toEqual({ parent: at("Coil the lines"), index: 1 });
		expect(moveGap(root, at("Deck"), "after", fenders)).toEqual({ parent: root, index: 1 });
	});

	it("puts a line at the end of the last section's content, and a heading after the last top-level section", () => {
		expect(moveGap(root, null, "end", at("Coil the lines"))).toEqual({ parent: at("Galley"), index: 2 });
		expect(moveGap(root, null, "end", at("Galley"))).toEqual({ parent: root, index: 1 });
		const list = parser.parse("- Stow the boat hook\n- Coil the lines\n", "List.md").root;
		expect(moveGap(list, null, "end", at("Bow line"))).toEqual({ parent: list, index: 2 });
	});

	it("refuses a move into the line's own subtree, or onto the place it already holds", () => {
		const coil = at("Coil the lines");
		expect(moveRefusal(root, coil, { parent: coil, index: 2 })).toBe("inside");
		expect(moveRefusal(root, coil, moveGap(root, at("Bow line"), "after", coil)!)).toBe("inside");
		expect(moveRefusal(root, at("Bow line"), moveGap(root, at("Stern line"), "after", at("Bow line"))!)).toBeNull();
		expect(moveRefusal(root, at("Stern line"), moveGap(root, at("Bow line"), "after", at("Stern line"))!)).toBe("unchanged");
		expect(moveRefusal(root, at("Stern line"), moveGap(root, coil, "under", at("Stern line"))!)).toBe("unchanged");
		expect(moveRefusal(root, at("Boil water"), moveGap(root, null, "end", at("Boil water"))!)).toBe("unchanged");
		expect(moveInNote(note, root, coil, { parent: coil, index: 0 })).toBeNull();
	});

	it("moves under a line with the mind map's drop bytes, and says where the line went", () => {
		const out = moveInNote(note, root, at("Rig the fenders"), moveGap(root, at("Coil the lines"), "under", at("Rig the fenders"))!)!;
		expect(out.text).toBe("# Deck\n\n- Coil the lines\n\t- Bow line\n\t- Stern line\n\t- Rig the fenders ^os-fend01\n## Galley\n\n1. Light the stove\n2. Boil water\n");
		const written = normalizeWrite(out.text);
		const start = mapStart(out.text, written, out.start)!;
		expect(written.startsWith("\t- Rig the fenders ^os-fend01", start)).toBe(true);
	});

	it("moves after a line in another section, re-levelled to fit there", () => {
		const out = moveInNote(note, root, at("Stern line"), moveGap(root, at("Light the stove"), "after", at("Stern line"))!)!;
		expect(out.text).toBe("# Deck\n\n- Coil the lines\n\t- Bow line\n- Rig the fenders ^os-fend01\n\n## Galley\n\n1. Light the stove\n- Stern line\n2. Boil water\n");
		expect(out.text.startsWith("- Stern line", out.start)).toBe(true);
	});

	it("moves a subtree to the end of its note", () => {
		const out = moveInNote(note, root, at("Coil the lines"), moveGap(root, null, "end", at("Coil the lines"))!)!;
		expect(out.text).toBe("# Deck\n- Rig the fenders ^os-fend01\n\n## Galley\n\n1. Light the stove\n2. Boil water\n- Coil the lines\n\t- Bow line\n\t- Stern line\n");
		expect(out.text.startsWith("- Coil the lines\n\t- Bow line\n\t- Stern line", out.start)).toBe(true);
	});
});

describe("fitEditWidth", () => {
	// Ten px a character.
	const measure = (line: string): number => line.length * 10;

	it("fits the widest line, its chrome and the slack", () => {
		expect(fitEditWidth(["Reef early", "Reef the main before the squall"], measure, 20, 0, 1000)).toBe(310 + 20 + 4);
	});

	it("grows as the text does, a character at a time", () => {
		const widths = ["R", "Re", "Ree", "Reef"].map((text) => fitEditWidth([text], measure, 20, 0, 1000));
		expect(widths).toEqual([34, 44, 54, 64]);
	});

	it("keeps the plate's width for short or empty text", () => {
		expect(fitEditWidth([""], measure, 20, 120, 320)).toBe(120);
	});

	it("stops at the max width, where the editor wraps", () => {
		expect(fitEditWidth(["x".repeat(80)], measure, 20, 0, 320)).toBe(320);
	});

	it("lets the minimum win over the maximum, as CSS does", () => {
		expect(fitEditWidth(["x"], measure, 20, 400, 320)).toBe(400);
	});
});
