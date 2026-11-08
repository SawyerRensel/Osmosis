import { describe, it, expect } from "vitest";
import { OsmosisParser } from "../parser";
import { buildGraph, type GraphModel } from "./model";
import { outlineChanged } from "./outline";

const parser = new OsmosisParser();

function model(...notes: [path: string, md: string][]): GraphModel {
	return buildGraph(
		notes.map(([path, md]) => ({ tree: parser.parse(md, path), cache: { tags: [] } })),
		() => null,
	);
}

const lines = (...rows: string[]): string => rows.join("\n");
const RIGGING = lines("- Halyards", "  - Main halyard", "  - Jib halyard", "- Sheets", "- Winches");

describe("outlineChanged", () => {
	const before = model(["Rigging.md", RIGGING]);

	it("is false for the same outline", () => {
		expect(outlineChanged(before, model(["Rigging.md", RIGGING]))).toBe(false);
	});

	it("is false when a line is only reworded", () => {
		const after = model(["Rigging.md", lines("- Halyards", "  - Main halyard", "  - Jib halyard", "- Mainsheet and jib sheets", "- Winches")]);
		expect(outlineChanged(before, after)).toBe(false);
	});

	it("is true when a sibling is added, even an empty one", () => {
		const after = model(["Rigging.md", lines("- Halyards", "  - Main halyard", "  - Jib halyard", "- Sheets", "- ", "- Winches")]);
		expect(outlineChanged(before, after)).toBe(true);
	});

	it("is true when a child is added", () => {
		const after = model(["Rigging.md", lines("- Halyards", "  - Main halyard", "  - Jib halyard", "- Sheets", "  - Jib sheet", "- Winches")]);
		expect(outlineChanged(before, after)).toBe(true);
	});

	it("is true when a line is deleted", () => {
		const after = model(["Rigging.md", lines("- Halyards", "  - Main halyard", "- Sheets", "- Winches")]);
		expect(outlineChanged(before, after)).toBe(true);
	});

	it("is true when a note's last line is deleted", () => {
		expect(outlineChanged(model(["Knots.md", "- Bowline"]), model(["Knots.md", ""]))).toBe(true);
	});

	it("is true when a line is re-levelled", () => {
		const after = model(["Rigging.md", lines("- Halyards", "  - Main halyard", "  - Jib halyard", "  - Sheets", "- Winches")]);
		expect(outlineChanged(before, after)).toBe(true);
	});

	it("is true when a line moves among its siblings, though the shape is the same", () => {
		const after = model(["Rigging.md", lines("- Halyards", "  - Jib halyard", "  - Main halyard", "- Sheets", "- Winches")]);
		expect(outlineChanged(before, after)).toBe(true);
	});

	it("is true when a line moves to another note", () => {
		const knots = lines("- Bowline", "- Cleat hitch");
		const after = model(["Rigging.md", lines("- Halyards", "  - Main halyard", "  - Jib halyard", "- Sheets")], ["Knots.md", lines("- Bowline", "- Cleat hitch", "- Winches")]);
		expect(outlineChanged(model(["Rigging.md", RIGGING], ["Knots.md", knots]), after)).toBe(true);
	});

	it("ignores notes that loaded or unloaded", () => {
		const after = model(["Rigging.md", RIGGING], ["Knots.md", lines("- Bowline")]);
		expect(outlineChanged(before, after)).toBe(false);
		expect(outlineChanged(after, before)).toBe(false);
	});

	it("is true when a heading becomes a list line, letting go of the lines under it", () => {
		const was = model(["Deck.md", lines("## Winches", "- Primary", "- Halyard winch")]);
		const after = model(["Deck.md", lines("- Winches", "- Primary", "- Halyard winch")]);
		expect(outlineChanged(was, after)).toBe(true);
	});
});
