import { describe, it, expect } from "vitest";
import {
	getTheme,
	getDefaultTheme,
	getThemeNames,
	isDefaultTheme,
	isPresetTheme,
} from "./themes";
import type { ThemeDefinition } from "./styles";

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

describe("custom themes", () => {
	const customTheme: ThemeDefinition = {
		name: "My Custom",
		base: { fill: "#112233", text: { color: "#ffffff" } },
		depths: { "1": { fill: "#223344", text: { weight: 700 } } },
		background: "#000000",
		branchLine: { color: "#aabbcc", thickness: 2 },
	};

	const customThemes: Record<string, ThemeDefinition> = {
		"My Custom": customTheme,
	};

	it("getTheme resolves custom themes when provided", () => {
		expect(getTheme("My Custom")).toBeUndefined(); // not in presets
		expect(getTheme("My Custom", customThemes)).toBe(customTheme);
	});

	it("preset themes take priority over custom themes with same name", () => {
		const clash: Record<string, ThemeDefinition> = {
			Ocean: { name: "Ocean", base: { fill: "#000" }, depths: {} },
		};
		const result = getTheme("Ocean", clash);
		// Should return the preset Ocean, not the custom one
		expect(result?.base.fill).toBe("#1e3a5f"); // preset Ocean fill
	});

	it("getThemeNames includes custom themes after presets", () => {
		const names = getThemeNames(customThemes);
		const presetCount = getThemeNames().length;
		expect(names.length).toBe(presetCount + 1);
		expect(names[names.length - 1]).toBe("My Custom");
	});

	it("getThemeNames sorts custom themes alphabetically", () => {
		const multi: Record<string, ThemeDefinition> = {
			"Zebra": { name: "Zebra", base: {}, depths: {} },
			"Alpha": { name: "Alpha", base: {}, depths: {} },
			"Mid": { name: "Mid", base: {}, depths: {} },
		};
		const names = getThemeNames(multi);
		const presetCount = getThemeNames().length;
		const customPart = names.slice(presetCount);
		expect(customPart).toEqual(["Alpha", "Mid", "Zebra"]);
	});

	it("isPresetTheme distinguishes preset from custom", () => {
		expect(isPresetTheme("Ocean")).toBe(true);
		expect(isPresetTheme("Default")).toBe(true);
		expect(isPresetTheme("My Custom")).toBe(false);
		expect(isPresetTheme("NonExistent")).toBe(false);
	});

	it("getThemeNames returns only presets when no custom themes provided", () => {
		const withUndefined = getThemeNames(undefined);
		const withEmpty = getThemeNames({});
		const baseline = getThemeNames();
		expect(withUndefined).toEqual(baseline);
		expect(withEmpty).toEqual(baseline);
	});

	it("custom themes with topicShape and direction are retrievable", () => {
		const themed: Record<string, ThemeDefinition> = {
			"Shaped": {
				name: "Shaped",
				base: { fill: "#111" },
				depths: {},
				topicShape: "ellipse",
				direction: "top-down",
			},
		};
		const result = getTheme("Shaped", themed);
		expect(result?.topicShape).toBe("ellipse");
		expect(result?.direction).toBe("top-down");
	});

	it("preset themes have no topicShape or direction by default", () => {
		const ocean = getTheme("Ocean");
		expect(ocean?.topicShape).toBeUndefined();
		expect(ocean?.direction).toBeUndefined();
	});
});
