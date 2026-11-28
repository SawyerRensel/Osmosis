import { describe, expect, it } from "vitest";
import { PANE_MENU, SHARED_HEADER, STYLE_ACTION, headerItems, readingToggle } from "./view-header";

describe("headerItems", () => {
	it("is Style, Note view, the 2D | 3D pill, Study, then Reading/Editing", () => {
		expect(SHARED_HEADER).toEqual(["style", "note-view", "switch", "study", "reading"]);
	});

	it("puts Style leftmost, ahead of Note view", () => {
		expect(headerItems("2d")[0]).toBe("style");
		expect(headerItems("3d")[0]).toBe("style");
		expect(STYLE_ACTION).toEqual({ icon: "paintbrush", label: "Style" });
	});

	it("is the same in both views, so nothing shifts between 2D and 3D", () => {
		expect(headerItems("2d")).toEqual([...SHARED_HEADER]);
		expect(headerItems("3d")).toEqual([...SHARED_HEADER]);
	});
});

describe("PANE_MENU", () => {
	it("gives 2D Find, Replace, Pin and Peek, in that order", () => {
		expect(PANE_MENU["2d"].map((e) => e.id)).toEqual(["find", "replace", "pin", "peek"]);
	});

	it("gives 3D Find, Replace, Follow, the joysticks and Controls help, in that order", () => {
		expect(PANE_MENU["3d"].map((e) => e.id)).toEqual(["find", "replace", "follow", "sticks", "help"]);
	});

	it("puts Find and Replace first in both views, in a group of their own", () => {
		for (const view of ["2d", "3d"] as const) {
			const [find, replace, ...rest] = PANE_MENU[view];
			expect([find?.id, replace?.id]).toEqual(["find", "replace"]);
			expect(find?.group).toBe(replace?.group);
			for (const entry of rest) expect(entry.group).not.toBe(find?.group);
		}
	});

	it("marks the toggles (they show a check mark), not Find, Replace or Controls help", () => {
		for (const view of ["2d", "3d"] as const) {
			for (const entry of PANE_MENU[view]) expect(entry.toggle).toBe(!["find", "replace", "help"].includes(entry.id));
		}
	});

	it("no longer lists Style (it is a header button)", () => {
		for (const view of ["2d", "3d"] as const) expect(PANE_MENU[view].map((e) => e.id)).not.toContain("style");
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
