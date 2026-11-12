import { describe, expect, it } from "vitest";
import { PANE_MENU, SHARED_HEADER, headerItems, readingToggle } from "./view-header";

describe("headerItems", () => {
	it("is Note view, the 2D | 3D pill, Study, then Reading/Editing", () => {
		expect(SHARED_HEADER).toEqual(["note-view", "switch", "study", "reading"]);
	});

	it("is the same in both views, so nothing shifts between 2D and 3D", () => {
		expect(headerItems("2d")).toEqual([...SHARED_HEADER]);
		expect(headerItems("3d")).toEqual([...SHARED_HEADER]);
	});
});

describe("PANE_MENU", () => {
	it("gives 2D Style, Pin and Peek, in that order", () => {
		expect(PANE_MENU["2d"].map((e) => e.id)).toEqual(["style", "pin", "peek"]);
	});

	it("gives 3D Style and Follow, in that order", () => {
		expect(PANE_MENU["3d"].map((e) => e.id)).toEqual(["style", "follow"]);
	});

	it("marks the toggles (they show a check mark) and not Style", () => {
		for (const view of ["2d", "3d"] as const) {
			for (const entry of PANE_MENU[view]) expect(entry.toggle).toBe(entry.id !== "style");
		}
	});

	it("never lists an entry twice in a view", () => {
		for (const view of ["2d", "3d"] as const) {
			const ids = PANE_MENU[view].map((e) => e.id);
			expect(new Set(ids).size).toBe(ids.length);
		}
	});
});

describe("readingToggle", () => {
	it("shows the mode a click switches to", () => {
		expect(readingToggle(true).icon).toBe("pencil");
		expect(readingToggle(false).icon).toBe("book-open");
		expect(readingToggle(true).label).toContain("Click to edit");
		expect(readingToggle(false).label).toContain("Click to read");
	});
});
