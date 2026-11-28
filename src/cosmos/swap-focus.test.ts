import { describe, it, expect } from "vitest";
import { OsmosisParser } from "../parser";
import { buildGraph, noteNodeId } from "./model";
import { focusChain, focusNodeId, readMapFocus } from "./swap-focus";

const parser = new OsmosisParser();
const note = "# Passage plan\n\n- Leave on the ebb\n\t- Clear the bar by noon\n- Anchor in the bay\n";
const tree = parser.parse(note, "Passage.md");
const model = buildGraph([{ tree, cache: null }], () => null);

const lineId = (text: string): string => model.nodes.find((n) => n.kind === "line" && n.label.includes(text))!.id;

describe("focusNodeId", () => {
	it("finds a line by its note and start", () => {
		expect(focusNodeId(model, { path: "Passage.md", start: note.indexOf("\t- Clear"), root: false })).toBe(lineId("Clear the bar"));
	});

	it("finds the note, or nothing", () => {
		expect(focusNodeId(model, { path: "Passage.md", start: 0, root: true })).toBe(noteNodeId("Passage.md"));
		expect(focusNodeId(model, null)).toBeNull();
		expect(focusNodeId(model, { path: "Passage.md", start: 3, root: false })).toBeNull();
		expect(focusNodeId(model, { path: "Other.md", start: 0, root: true })).toBeNull();
	});
});

describe("focusChain", () => {
	it("is the focused line and its ancestors, root first", () => {
		const chain = focusChain(tree.root, "Passage.md", { path: "Passage.md", start: note.indexOf("\t- Clear"), root: false });
		expect(chain.map((n) => n.content)).toEqual(["", "Passage plan", "Leave on the ebb", "Clear the bar by noon"]);
	});

	it("is empty for a note, another note's line, or a line that moved", () => {
		const start = note.indexOf("- Anchor");
		expect(focusChain(tree.root, "Passage.md", { path: "Passage.md", start: 0, root: true })).toEqual([]);
		expect(focusChain(tree.root, "Passage.md", { path: "Other.md", start, root: false })).toEqual([]);
		expect(focusChain(tree.root, "Passage.md", { path: "Passage.md", start: start + 1, root: false })).toEqual([]);
		expect(focusChain(tree.root, "Passage.md", null)).toEqual([]);
	});
});

describe("readMapFocus", () => {
	it("reads a focus back from view state", () => {
		expect(readMapFocus({ path: "a.md", start: 4 })).toEqual({ path: "a.md", start: 4, root: false });
		expect(readMapFocus({ path: "a.md", start: 0, root: true })).toEqual({ path: "a.md", start: 0, root: true });
	});

	it("refuses one that is missing or malformed", () => {
		expect(readMapFocus(null)).toBeNull();
		expect(readMapFocus({ path: "a.md", start: "x" })).toBeNull();
		expect(readMapFocus({ start: 1 })).toBeNull();
	});
});
