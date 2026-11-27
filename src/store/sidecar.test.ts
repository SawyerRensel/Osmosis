import { describe, expect, it } from "vitest";
import {
	SIDECAR_SUFFIX,
	hasSidecarKeys,
	isSidecarPath,
	mergeNoteData,
	noteLink,
	parseNoteLink,
	sidecarContent,
	sidecarName,
} from "./sidecar";

describe("sidecarName", () => {
	it("is an 8-hex hash of the note path, stable across calls", () => {
		const name = sidecarName("Sailing/Knots.md", () => false);
		expect(name).toMatch(/^[0-9a-f]{8}\.osmosis\.md$/);
		expect(sidecarName("Sailing/Knots.md", () => false)).toBe(name);
	});

	it("differs between notes", () => {
		expect(sidecarName("Sailing/Knots.md", () => false)).not.toBe(sidecarName("Sailing/Tides.md", () => false));
	});

	it("re-salts while the name is taken, stably", () => {
		const first = sidecarName("Cooking/Bread.md", () => false);
		const taken = new Set([first]);
		const second = sidecarName("Cooking/Bread.md", (name) => taken.has(name));
		expect(second).not.toBe(first);
		expect(second.endsWith(SIDECAR_SUFFIX)).toBe(true);
		expect(sidecarName("Cooking/Bread.md", (name) => taken.has(name))).toBe(second);
		taken.add(second);
		const third = sidecarName("Cooking/Bread.md", (name) => taken.has(name));
		expect(taken.has(third)).toBe(false);
	});
});

describe("noteLink / parseNoteLink", () => {
	it("links the full path without .md and reads it back", () => {
		expect(noteLink("Travel/Lisbon trip.md")).toBe("[[Travel/Lisbon trip]]");
		expect(parseNoteLink(noteLink("Travel/Lisbon trip.md"))).toBe("Travel/Lisbon trip");
	});

	it("drops an alias, heading or block subpath", () => {
		expect(parseNoteLink("[[Travel/Lisbon|Lisbon]]")).toBe("Travel/Lisbon");
		expect(parseNoteLink("[[Lisbon#Day one]]")).toBe("Lisbon");
		expect(parseNoteLink("[[Lisbon^os-abc]]")).toBe("Lisbon");
	});

	it("rejects anything that is not one wikilink", () => {
		expect(parseNoteLink(undefined)).toBeNull();
		expect(parseNoteLink(42)).toBeNull();
		expect(parseNoteLink("Travel/Lisbon")).toBeNull();
		expect(parseNoteLink("[[]]")).toBeNull();
		expect(parseNoteLink("[[a]] and [[b]]")).toBeNull();
	});
});

describe("isSidecarPath", () => {
	it("matches the folder and everything under it", () => {
		expect(isSidecarPath("Osmosis/Schedule/a3f9c2e1.osmosis.md", "Osmosis/Schedule")).toBe(true);
		expect(isSidecarPath("Osmosis/Schedule", "Osmosis/Schedule")).toBe(true);
	});

	it("does not match a sibling folder sharing a prefix, or an empty folder setting", () => {
		expect(isSidecarPath("Osmosis/Schedules/x.md", "Osmosis/Schedule")).toBe(false);
		expect(isSidecarPath("Osmosis/Reviews/2026-11.md", "Osmosis/Schedule")).toBe(false);
		expect(isSidecarPath("Note.md", "")).toBe(false);
	});
});

describe("mergeNoteData", () => {
	it("lets the sidecar win per osmosis-schedule entry, keeping the note's other entries", () => {
		const note = { "osmosis-cards": true, "osmosis-schedule": { "os-bowline": { due: "a" }, "os-cleat": { due: "b" } } };
		const sidecar = { "osmosis-note": "[[Knots]]", "osmosis-schedule": { "os-cleat": { due: "c" }, "os-reef": { due: "d" } } };
		expect(mergeNoteData(note, sidecar)).toEqual({
			"osmosis-cards": true,
			"osmosis-schedule": { "os-bowline": { due: "a" }, "os-cleat": { due: "c" }, "os-reef": { due: "d" } },
		});
	});

	it("replaces osmosis-styles whole, and ignores the sidecar's link and unknown keys", () => {
		const merged = mergeNoteData(
			{ "osmosis-styles": { theme: "Ocean", styles: { a: 1 } } },
			{ "osmosis-note": "[[Knots]]", "osmosis-styles": { theme: "Harbour" }, tags: ["x"] },
		);
		expect(merged).toEqual({ "osmosis-styles": { theme: "Harbour" } });
	});

	it("does not mutate either input", () => {
		const note = { "osmosis-schedule": { a: { due: "1" } } };
		const sidecar = { "osmosis-schedule": { b: { due: "2" } } };
		mergeNoteData(note, sidecar);
		expect(note).toEqual({ "osmosis-schedule": { a: { due: "1" } } });
		expect(sidecar).toEqual({ "osmosis-schedule": { b: { due: "2" } } });
	});

	it("handles a missing side", () => {
		expect(mergeNoteData(undefined, { "osmosis-schedule": { a: {} } })).toEqual({ "osmosis-schedule": { a: {} } });
		expect(mergeNoteData({ x: 1 }, null)).toEqual({ x: 1 });
	});
});

describe("hasSidecarKeys / sidecarContent", () => {
	it("counts only the keys a sidecar can carry", () => {
		expect(hasSidecarKeys({ "osmosis-cards": true, "osmosis-deck": "Sailing" })).toBe(false);
		expect(hasSidecarKeys({ "osmosis-schedule": {} })).toBe(true);
		expect(hasSidecarKeys({ "osmosis-styles": {} })).toBe(true);
		expect(hasSidecarKeys(undefined)).toBe(false);
	});

	it("writes the link as a quoted YAML string and a body with no wikilinks", () => {
		const content = sidecarContent("Travel/Lisbon.md");
		expect(content.startsWith('---\nosmosis-note: "[[Travel/Lisbon]]"\n---\n')).toBe(true);
		expect(content.slice(content.lastIndexOf("---")).includes("[[")).toBe(false);
	});
});
