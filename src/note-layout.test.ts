import { describe, expect, it } from "vitest";
import { cosmosLayout, engineFor, isNoteLayout, noteLayout, writeNoteLayout } from "./note-layout";

describe("noteLayout", () => {
	it("reads the note's own layout from its styles", () => {
		expect(noteLayout({ theme: "Harbour", layout: "planets" }, "mindmap")).toBe("planets");
		expect(noteLayout({ layout: "mindmap" }, "organic")).toBe("mindmap");
	});

	it("falls back to the default for a note without one, or with a value it cannot use", () => {
		expect(noteLayout(undefined, "organic")).toBe("organic");
		expect(noteLayout({ theme: "Harbour" }, "mindmap")).toBe("mindmap");
		expect(noteLayout({ layout: "flat" }, "planets")).toBe("planets");
		expect(noteLayout(["object Object"], "organic")).toBe("organic");
		expect(noteLayout("planets", "mindmap")).toBe("mindmap");
	});
});

describe("engineFor and cosmosLayout", () => {
	it("draws Mindmap in the mind map and the other two in Cosmos", () => {
		expect(engineFor("mindmap")).toBe("mindmap");
		expect(engineFor("organic")).toBe("cosmos");
		expect(engineFor("planets")).toBe("cosmos");
	});

	it("draws a Mindmap note shown in Cosmos as Organic", () => {
		expect(cosmosLayout("planets")).toBe("planets");
		expect(cosmosLayout("organic")).toBe("organic");
		expect(cosmosLayout("mindmap")).toBe("organic");
	});

	it("knows the three layouts and nothing else", () => {
		expect(["mindmap", "organic", "planets"].every(isNoteLayout)).toBe(true);
		expect(isNoteLayout("classic")).toBe(false);
		expect(isNoteLayout(undefined)).toBe(false);
	});
});

describe("writeNoteLayout", () => {
	it("saves a layout other than the default into the note's styles", () => {
		const fm: Record<string, unknown> = { tags: ["sailing"], "osmosis-styles": { theme: "Harbour" } };
		writeNoteLayout(fm, "planets", "mindmap");
		expect(fm).toEqual({ tags: ["sailing"], "osmosis-styles": { theme: "Harbour", layout: "planets" } });
	});

	it("creates the styles mapping when the note has none, or a corrupt one", () => {
		const fresh: Record<string, unknown> = {};
		writeNoteLayout(fresh, "organic", "mindmap");
		expect(fresh).toEqual({ "osmosis-styles": { layout: "organic" } });
		const corrupt: Record<string, unknown> = { "osmosis-styles": ["object Object"] };
		writeNoteLayout(corrupt, "mindmap", "planets");
		expect(corrupt).toEqual({ "osmosis-styles": { layout: "mindmap" } });
	});

	it("removes the key for the default layout, and the styles when nothing else is left", () => {
		const styled: Record<string, unknown> = { "osmosis-styles": { theme: "Harbour", layout: "planets" } };
		writeNoteLayout(styled, "organic", "organic");
		expect(styled).toEqual({ "osmosis-styles": { theme: "Harbour" } });
		const bare: Record<string, unknown> = { tags: ["travel"], "osmosis-styles": { layout: "planets" } };
		writeNoteLayout(bare, "mindmap", "mindmap");
		expect(bare).toEqual({ tags: ["travel"] });
		const none: Record<string, unknown> = { tags: ["cooking"] };
		writeNoteLayout(none, "mindmap", "mindmap");
		expect(none).toEqual({ tags: ["cooking"] });
	});
});
