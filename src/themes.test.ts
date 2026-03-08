import { describe, it, expect } from "vitest";
import {
	getTheme,
	getDefaultTheme,
	getThemeNames,
	isDefaultTheme,
} from "./themes";

describe("theme registry", () => {
	it("returns at least 10 preset themes", () => {
		expect(getThemeNames().length).toBeGreaterThanOrEqual(10);
	});

	it("lists Default as the first theme", () => {
		expect(getThemeNames()[0]).toBe("Default");
	});

	it("getTheme returns a theme by name", () => {
		const ocean = getTheme("Ocean");
		expect(ocean).toBeDefined();
		expect(ocean?.name).toBe("Ocean");
	});

	it("getTheme returns undefined for unknown name", () => {
		expect(getTheme("NonExistent")).toBeUndefined();
	});

	it("getDefaultTheme returns the Default theme", () => {
		const def = getDefaultTheme();
		expect(def.name).toBe("Default");
		// Default theme has empty base (falls back to CSS)
		expect(def.base).toEqual({});
	});

	it("isDefaultTheme correctly identifies Default", () => {
		expect(isDefaultTheme("Default")).toBe(true);
		expect(isDefaultTheme("Ocean")).toBe(false);
	});

	it("all theme names are unique", () => {
		const names = getThemeNames();
		const unique = new Set(names);
		expect(unique.size).toBe(names.length);
	});

	it("every named theme is retrievable", () => {
		for (const name of getThemeNames()) {
			expect(getTheme(name)).toBeDefined();
		}
	});

	it("non-default themes have base fill and text color", () => {
		for (const name of getThemeNames()) {
			if (name === "Default") continue;
			const theme = getTheme(name)!;
			expect(theme.base.fill).toBeDefined();
			expect(theme.base.text?.color).toBeDefined();
		}
	});

	it("non-default themes have depth-1 overrides", () => {
		for (const name of getThemeNames()) {
			if (name === "Default") continue;
			const theme = getTheme(name)!;
			const d1 = theme.depths["1"];
			expect(d1).toBeDefined();
			expect(d1?.fill).toBeDefined();
			expect(d1?.text?.weight).toBeDefined();
		}
	});

	it("themes do not set font sizes (CSS handles typography)", () => {
		for (const name of getThemeNames()) {
			if (name === "Default") continue;
			const theme = getTheme(name)!;
			expect(theme.base.text?.size).toBeUndefined();
			for (const depth of Object.values(theme.depths)) {
				expect(depth.text?.size).toBeUndefined();
			}
		}
	});
});
