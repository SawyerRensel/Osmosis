import { describe, it, expect } from "vitest";
import { isEntry, landing, nodeNotePath, readPlace, stepTo } from "./history";

const at = (focus: string | null, node: string | null) => ({ focus, node });

describe("stepTo", () => {
	it("flies to another plate in the same focus note", () => {
		expect(stepTo(at("Knots.md", "note:Knots.md"), at("Knots.md", "line:Knots.md#3"))).toEqual({ kind: "fly", node: "line:Knots.md#3", again: false });
	});

	it("flies to a plate of another loaded note without refocusing", () => {
		expect(stepTo(at("Sailing Basics.md", "note:Sailing Basics.md"), at("Sailing Basics.md", "line:Knots.md#3"))).toEqual({ kind: "fly", node: "line:Knots.md#3", again: false });
	});

	it("refocuses when the focus note differs, keeping the plate to land on", () => {
		expect(stepTo(at("Knots.md", "line:Knots.md#3"), at("Sailing Basics.md", "line:Rigging.md#1"))).toEqual({ kind: "refocus", focus: "Sailing Basics.md", node: "line:Rigging.md#1" });
		expect(stepTo(at("Knots.md", "line:Knots.md#3"), at("Rigging.md", null))).toEqual({ kind: "refocus", focus: "Rigging.md", node: null });
	});

	it("flies again to the selected plate without an entry, so repeated visits collapse", () => {
		const step = stepTo(at("Knots.md", "line:Knots.md#3"), at("Knots.md", "line:Knots.md#3"));
		expect(step).toEqual({ kind: "fly", node: "line:Knots.md#3", again: true });
		expect(isEntry(step)).toBe(false);
	});

	it("makes an entry of a flight elsewhere or a refocus, never of no step", () => {
		expect(isEntry(stepTo(at("Knots.md", "note:Knots.md"), at("Knots.md", "line:Knots.md#3")))).toBe(true);
		expect(isEntry(stepTo(at("Knots.md", "note:Knots.md"), at("Rigging.md", null)))).toBe(true);
		expect(isEntry(stepTo(at("Knots.md", "note:Knots.md"), at("Knots.md", null)))).toBe(false);
	});

	it("is no step without a plate in the same focus note, or without a focus note", () => {
		expect(stepTo(at("Knots.md", "line:Knots.md#3"), at("Knots.md", null))).toEqual({ kind: "none" });
		expect(stepTo(at("Knots.md", "line:Knots.md#3"), at(null, "line:Knots.md#3"))).toEqual({ kind: "none" });
	});

	it("refocuses from an empty view", () => {
		expect(stepTo(at(null, null), at("Knots.md", null))).toEqual({ kind: "refocus", focus: "Knots.md", node: null });
	});
});

describe("readPlace", () => {
	it("reads the focus note and plate", () => {
		expect(readPlace({ focus: "Knots.md", node: "note:Knots.md", depth: 1 })).toEqual(at("Knots.md", "note:Knots.md"));
	});

	it("reads anything missing or malformed as null", () => {
		expect(readPlace(undefined)).toEqual(at(null, null));
		expect(readPlace({ focus: 3, node: false })).toEqual(at(null, null));
	});
});

describe("nodeNotePath", () => {
	it("finds the note of a line or a note core", () => {
		expect(nodeNotePath("line:Sail/Knots.md#4")).toBe("Sail/Knots.md");
		expect(nodeNotePath("line:Knots.md#^bowline")).toBe("Knots.md");
		expect(nodeNotePath("note:Sail/Knots.md")).toBe("Sail/Knots.md");
	});

	it("is null for tags, attachments and ghosts", () => {
		expect(nodeNotePath("tag:#sailing")).toBeNull();
		expect(nodeNotePath("attachment:chart.png")).toBeNull();
		expect(nodeNotePath("ghost:Mooring")).toBeNull();
	});
});

describe("landing", () => {
	const loaded = (...ids: string[]) => (id: string) => ids.includes(id);

	it("lands on the plate when it is still there", () => {
		expect(landing(loaded("line:Knots.md#3", "note:Knots.md"), "Knots.md", "line:Knots.md#3")).toBe("line:Knots.md#3");
	});

	it("lands on its note's root when an edit deleted the plate", () => {
		expect(landing(loaded("note:Rigging.md", "note:Knots.md"), "Knots.md", "line:Rigging.md#9")).toBe("note:Rigging.md");
	});

	it("falls back to the focus note's root when the plate's note is gone too", () => {
		expect(landing(loaded("note:Knots.md"), "Knots.md", "line:Rigging.md#9")).toBe("note:Knots.md");
		expect(landing(loaded("note:Knots.md"), "Knots.md", "tag:#sailing")).toBe("note:Knots.md");
	});
});
