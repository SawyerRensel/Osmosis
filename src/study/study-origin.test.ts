import { describe, it, expect } from "vitest";
import { studyReturnTarget, toStudyOrigin } from "./study-origin";

describe("toStudyOrigin", () => {
	it("keeps the view type, state and ephemeral state of a note tab", () => {
		const origin = toStudyOrigin({
			type: "markdown",
			state: { file: "Sailing/Knots.md", mode: "preview", source: false },
			eState: { scroll: 42 },
		});
		expect(origin).toEqual({
			type: "markdown",
			state: { file: "Sailing/Knots.md", mode: "preview", source: false },
			eState: { scroll: 42 },
		});
	});

	it("drops pin, group, title and other leaf fields", () => {
		const origin = toStudyOrigin({
			type: "markdown",
			state: { file: "Cooking/Bread.md" },
			pinned: true,
			active: true,
			icon: "lucide-file",
			title: "Bread",
		});
		expect(origin).toEqual({ type: "markdown", state: { file: "Cooking/Bread.md" } });
	});

	it("gives a stateless view such as the Decks page an empty state", () => {
		expect(toStudyOrigin({ type: "osmosis-decks" })).toEqual({ type: "osmosis-decks", state: {} });
	});

	it("rejects anything without a view type, as a saved state from an older build has", () => {
		expect(toStudyOrigin(undefined)).toBeNull();
		expect(toStudyOrigin(null)).toBeNull();
		expect(toStudyOrigin({})).toBeNull();
		expect(toStudyOrigin({ type: "" })).toBeNull();
		expect(toStudyOrigin({ type: 3 })).toBeNull();
		expect(toStudyOrigin("markdown")).toBeNull();
	});

	it("ignores a state or ephemeral state that is not an object", () => {
		expect(toStudyOrigin({ type: "markdown", state: "Travel.md", eState: [1] })).toEqual({
			type: "markdown",
			state: {},
		});
	});
});

describe("studyReturnTarget", () => {
	const note = { type: "markdown", state: { file: "Travel/Packing.md", mode: "source" } };
	const decks = { type: "osmosis-decks", state: {} };

	it("returns to the Decks page when the session had no origin", () => {
		expect(studyReturnTarget(null, () => true)).toBeNull();
	});

	it("returns to the note while it still exists", () => {
		expect(studyReturnTarget(note, (p) => p === "Travel/Packing.md")).toBe(note);
	});

	it("falls back to the Decks page when the note is gone", () => {
		expect(studyReturnTarget(note, () => false)).toBeNull();
	});

	it("returns to a view with no file as it is", () => {
		expect(studyReturnTarget(decks, () => false)).toBe(decks);
	});
});
