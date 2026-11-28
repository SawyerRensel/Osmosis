import { describe, expect, it } from "vitest";
import {
	DEFAULT_SIDECAR_FOLDER,
	hasSidecarKeys,
	isSidecarPath,
	migratedSidecarFolder,
	mergeNoteData,
	noteLink,
	parseNoteLink,
	sidecarContent,
	withExcludedFolder,
} from "./sidecar";

describe("withExcludedFolder", () => {
	it("adds the folder with a trailing slash to an empty list", () => {
		expect(withExcludedFolder(null, null, "Osmosis/Data")).toEqual(["Osmosis/Data/"]);
	});

	it("swaps the old folder's entry for the new one and keeps the user's own entries", () => {
		expect(withExcludedFolder(["Archive/", "Osmosis/Data/"], "Osmosis/Data", "Data/Sidecars"))
			.toEqual(["Archive/", "Data/Sidecars/"]);
	});

	it("does not add a duplicate, and leaves entries written another way alone", () => {
		expect(withExcludedFolder(["Osmosis/Data/", "Osmosis/Data"], null, "Osmosis/Data"))
			.toEqual(["Osmosis/Data/", "Osmosis/Data"]);
	});

	it("is null when nothing is left", () => {
		expect(withExcludedFolder(["Osmosis/Data/"], "Osmosis/Data", null)).toBeNull();
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
		expect(isSidecarPath("Osmosis/Data/a3f9c2e1.osmosis.md", "Osmosis/Data")).toBe(true);
		expect(isSidecarPath("Osmosis/Data", "Osmosis/Data")).toBe(true);
	});

	it("does not match a sibling folder sharing a prefix, or an empty folder setting", () => {
		expect(isSidecarPath("Osmosis/Datas/x.md", "Osmosis/Data")).toBe(false);
		expect(isSidecarPath("Osmosis/Reviews/2026-11.md", "Osmosis/Data")).toBe(false);
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

describe("migratedSidecarFolder", () => {
	it("moves the old default to the new one", () => {
		expect(migratedSidecarFolder("Osmosis/Schedule")).toBe(DEFAULT_SIDECAR_FOLDER);
		expect(DEFAULT_SIDECAR_FOLDER).toBe("Osmosis/Data");
	});

	it("leaves the new default, a chosen folder, a near miss and a missing value alone", () => {
		expect(migratedSidecarFolder("Osmosis/Data")).toBeNull();
		expect(migratedSidecarFolder("Sidecars")).toBeNull();
		expect(migratedSidecarFolder("Osmosis/Schedule/Old")).toBeNull();
		expect(migratedSidecarFolder(undefined)).toBeNull();
	});
});
