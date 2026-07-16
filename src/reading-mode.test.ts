import { describe, it, expect } from "vitest";
import { resolveDefaultReadingMode } from "./reading-mode";

describe("resolveDefaultReadingMode", () => {
	it("editing never starts in reading mode", () => {
		expect(resolveDefaultReadingMode("editing", false)).toBe(false);
		expect(resolveDefaultReadingMode("editing", true)).toBe(false);
	});

	it("reading always starts in reading mode", () => {
		expect(resolveDefaultReadingMode("reading", false)).toBe(true);
		expect(resolveDefaultReadingMode("reading", true)).toBe(true);
	});

	it("reading-mobile follows the platform", () => {
		expect(resolveDefaultReadingMode("reading-mobile", false)).toBe(false);
		expect(resolveDefaultReadingMode("reading-mobile", true)).toBe(true);
	});
});
