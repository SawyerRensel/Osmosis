import { describe, it, expect } from "vitest";
import { isCloseMatch } from "../study/match";

describe("isCloseMatch", () => {
	it("returns true for exact match (case insensitive)", () => {
		expect(isCloseMatch("Paris", "paris")).toBe(true);
	});

	it("returns true for close match (minor typo)", () => {
		expect(isCloseMatch("Pariss", "Paris")).toBe(true);
	});

	it("returns false for very different strings", () => {
		expect(isCloseMatch("London", "Paris")).toBe(false);
	});

	it("returns false for empty input", () => {
		expect(isCloseMatch("", "Paris")).toBe(false);
	});

	it("returns false for empty expected", () => {
		expect(isCloseMatch("Paris", "")).toBe(false);
	});

	it("handles whitespace trimming", () => {
		expect(isCloseMatch("  Paris  ", "Paris")).toBe(true);
	});

	it("returns true when 70% of characters match", () => {
		// "Mitochon" vs "Mitochond" — 8/9 match = 88%
		expect(isCloseMatch("Mitochon", "Mitochond")).toBe(true);
	});

	it("returns false when less than 70% match", () => {
		// "abc" vs "abcdefghij" — 3/10 = 30%
		expect(isCloseMatch("abc", "abcdefghij")).toBe(false);
	});
});
