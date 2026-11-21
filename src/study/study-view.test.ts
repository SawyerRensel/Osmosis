import { describe, it, expect } from "vitest";
import {
	crumbsBelowTitle,
	formatInterval,
	isNavbarSwipe,
	studyTabTitle,
	SWIPE_MAX_MS,
	SWIPE_MIN_DISTANCE,
} from "./study-view";

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

describe("formatInterval", () => {
	it("shows anything under a minute as <1m", () => {
		expect(formatInterval(0)).toBe("<1m");
		expect(formatInterval(59_000)).toBe("<1m");
	});

	it("rounds minutes, hours and days to whole units", () => {
		expect(formatInterval(MIN)).toBe("1m");
		expect(formatInterval(10 * MIN)).toBe("10m");
		expect(formatInterval(90 * MIN)).toBe("2h");
		expect(formatInterval(DAY)).toBe("1d");
		expect(formatInterval(12 * DAY)).toBe("12d");
	});

	it("keeps one decimal for months and years, without a trailing .0", () => {
		expect(formatInterval(45 * DAY)).toBe("1.5mo");
		expect(formatInterval(60 * DAY)).toBe("2mo");
		expect(formatInterval(365 * DAY)).toBe("1y");
		expect(formatInterval(2.1 * 365 * DAY)).toBe("2.1y");
	});
});

describe("isNavbarSwipe", () => {
	const swipe = { dx: 0, dy: -120, ms: 200, scrolled: false };

	it("accepts a quick, mostly vertical swipe up", () => {
		expect(isNavbarSwipe(swipe)).toBe(true);
		expect(isNavbarSwipe({ ...swipe, dx: 50 })).toBe(true);
	});

	it("rejects a swipe down (that is the command palette's gesture)", () => {
		expect(isNavbarSwipe({ ...swipe, dy: 120 })).toBe(false);
	});

	it("rejects a short movement", () => {
		expect(isNavbarSwipe({ ...swipe, dy: -(SWIPE_MIN_DISTANCE - 1) })).toBe(false);
	});

	it("rejects a mostly sideways swipe", () => {
		expect(isNavbarSwipe({ ...swipe, dx: 80 })).toBe(false);
	});

	it("rejects a slow drag", () => {
		expect(isNavbarSwipe({ ...swipe, ms: SWIPE_MAX_MS + 1 })).toBe(false);
	});

	it("rejects a drag that scrolled the card", () => {
		expect(isNavbarSwipe({ ...swipe, scrolled: true })).toBe(false);
	});
});

describe("studyTabTitle", () => {
	it("is \"Study\" with no session on screen", () => {
		expect(studyTabTitle(null)).toBe("Study");
	});

	it("is \"All decks\" for the all-decks scope", () => {
		expect(studyTabTitle({ type: "all" })).toBe("All decks");
	});

	it("names a deck by its last path segment, with no prefix", () => {
		expect(studyTabTitle({ type: "single", deck: "Sailing" })).toBe("Sailing");
		expect(studyTabTitle({ type: "single", deck: "sailing/knots" })).toBe("knots");
		expect(studyTabTitle({ type: "parent", deck: "travel/europe" })).toBe("europe");
	});

	it("names a note by its only H1", () => {
		expect(studyTabTitle({ type: "note", notePath: "cooking/Sauces.md" }, ["Mother sauces"])).toBe("Mother sauces");
	});

	it("falls back to the file name with no H1", () => {
		expect(studyTabTitle({ type: "note", notePath: "cooking/Sauces.md" }, [])).toBe("Sauces");
		expect(studyTabTitle({ type: "note", notePath: "Knots.md" })).toBe("Knots");
	});

	it("falls back to the file name with several H1s", () => {
		expect(studyTabTitle({ type: "note", notePath: "cooking/Sauces.md" }, ["Hot", "Cold"])).toBe("Sauces");
	});

	it("ignores a blank H1", () => {
		expect(studyTabTitle({ type: "note", notePath: "Knots.md" }, ["  "])).toBe("Knots");
	});
});

describe("crumbsBelowTitle", () => {
	it("drops a lone note name that repeats the title", () => {
		expect(crumbsBelowTitle(["Sailing"], ["Sailing"])).toEqual([]);
	});

	it("drops every leading segment that repeats it, case-insensitively", () => {
		expect(crumbsBelowTitle(["Sailing", "sailing", "Knots"], ["Sailing"])).toEqual(["Knots"]);
	});

	it("keeps the breadcrumb when the title is something else", () => {
		expect(crumbsBelowTitle(["Sailing", "Knots"], ["All decks"])).toEqual(["Sailing", "Knots"]);
	});

	it("keeps a later segment that happens to match", () => {
		expect(crumbsBelowTitle(["Travel", "Sailing"], ["Sailing"])).toEqual(["Travel", "Sailing"]);
	});

	it("drops the file name and the H1 that titles a note session", () => {
		expect(crumbsBelowTitle(["Sauces", "Mother sauces", "Roux"], ["Mother sauces", "Sauces"])).toEqual(["Roux"]);
	});
});
