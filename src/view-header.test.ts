import { describe, expect, it } from "vitest";
import { HEADER_EXTRAS, SHARED_HEADER, headerItems, readingToggle } from "./view-header";

describe("headerItems", () => {
	it("starts both views with the same shared buttons, in order", () => {
		expect(SHARED_HEADER).toEqual(["switch", "note-view", "reading", "style", "study"]);
		expect(headerItems("2d").slice(0, SHARED_HEADER.length)).toEqual([...SHARED_HEADER]);
		expect(headerItems("3d").slice(0, SHARED_HEADER.length)).toEqual([...SHARED_HEADER]);
	});

	it("puts Pin and Peek after the shared set in 2D, and Follow in 3D", () => {
		expect(headerItems("2d")).toEqual([...SHARED_HEADER, "pin", "peek"]);
		expect(headerItems("3d")).toEqual([...SHARED_HEADER, "follow"]);
	});

	it("never lists a button twice, and keeps extras out of the other view", () => {
		for (const view of ["2d", "3d"] as const) {
			const items = headerItems(view);
			expect(new Set(items).size).toBe(items.length);
		}
		expect(HEADER_EXTRAS["2d"].some((id) => HEADER_EXTRAS["3d"].includes(id))).toBe(false);
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
