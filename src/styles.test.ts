import { describe, it, expect } from "vitest";
import {
	resolveCascade,
	resolveNodeStyle,
	type NodeStyle,
	type ThemeDefinition,
	type CascadeInput,
} from "./styles";

describe("resolveCascade", () => {
	it("returns empty object when all layers are undefined", () => {
		const result = resolveCascade({});
		expect(result).toEqual({});
	});

	it("returns theme style when only theme is provided", () => {
		const theme: NodeStyle = { shape: "rect", fill: "#000" };
		const result = resolveCascade({ theme });
		expect(result).toEqual({ shape: "rect", fill: "#000" });
	});

	it("local overrides theme for scalar properties", () => {
		const result = resolveCascade({
			local: { fill: "#fff" },
			theme: { fill: "#000", shape: "rect" },
		});
		expect(result.fill).toBe("#fff");
		expect(result.shape).toBe("rect"); // falls through from theme
	});

	it("local overrides reference overrides theme", () => {
		const result = resolveCascade({
			local: { fill: "#local" },
			reference: { fill: "#ref", shape: "diamond" },
			theme: { fill: "#theme", shape: "rect", background: "#bg" },
		});
		expect(result.fill).toBe("#local");
		expect(result.shape).toBe("diamond");
		expect(result.background).toBe("#bg");
	});

	it("merges text sub-object field-by-field", () => {
		const result = resolveCascade({
			local: { text: { weight: 700 } },
			theme: { text: { size: 14, weight: 400, color: "#333" } },
		});
		expect(result.text).toEqual({
			size: 14,
			weight: 700,
			color: "#333",
		});
	});

	it("merges border sub-object field-by-field", () => {
		const result = resolveCascade({
			local: { border: { color: "#red" } },
			theme: { border: { color: "#gray", width: 1, style: "solid" } },
		});
		expect(result.border).toEqual({
			color: "#red",
			width: 1,
			style: "solid",
		});
	});

	it("merges branchLine sub-object field-by-field", () => {
		const result = resolveCascade({
			reference: { branchLine: { color: "#blue" } },
			theme: { branchLine: { style: "curved", thickness: 2 } },
		});
		expect(result.branchLine).toEqual({
			style: "curved",
			color: "#blue",
			thickness: 2,
		});
	});

	it("reference fills in where local is absent", () => {
		const result = resolveCascade({
			local: { shape: "ellipse" },
			reference: { fill: "#ref", shape: "diamond" },
			theme: { background: "#bg" },
		});
		expect(result.shape).toBe("ellipse"); // local wins
		expect(result.fill).toBe("#ref"); // reference fills in
		expect(result.background).toBe("#bg"); // theme fills in
	});

	it("handles only local layer", () => {
		const result = resolveCascade({
			local: { shape: "pill", fill: "#abc", text: { size: 16 } },
		});
		expect(result).toEqual({
			shape: "pill",
			fill: "#abc",
			text: { size: 16 },
		});
	});

	it("skips undefined layers gracefully", () => {
		const input: CascadeInput = {
			local: undefined,
			reference: undefined,
			theme: { fill: "#only" },
		};
		expect(resolveCascade(input)).toEqual({ fill: "#only" });
	});
});

describe("resolveNodeStyle", () => {
	const theme: ThemeDefinition = {
		name: "Test",
		base: {
			shape: "rounded-rect",
			fill: "#222",
			text: { size: 13, weight: 400 },
			border: { color: "#555", width: 1, style: "solid" },
		},
		depths: {
			"1": { fill: "#111", text: { size: 20, weight: 700 } },
			"2": { fill: "#333", text: { size: 17, weight: 600 } },
		},
	};

	it("applies base + depth overrides as the theme level", () => {
		const result = resolveNodeStyle(theme, 1);
		expect(result.shape).toBe("rounded-rect"); // from base
		expect(result.fill).toBe("#111"); // depth 1 overrides base
		expect(result.text?.size).toBe(20); // depth 1 overrides base
		expect(result.text?.weight).toBe(700);
		expect(result.border?.color).toBe("#555"); // from base
	});

	it("falls back to base when depth has no override", () => {
		const result = resolveNodeStyle(theme, 5);
		expect(result.fill).toBe("#222"); // base only
		expect(result.text?.size).toBe(13);
	});

	it("local overrides theme+depth", () => {
		const result = resolveNodeStyle(
			theme,
			1,
			{ fill: "#local", text: { size: 24 } },
		);
		expect(result.fill).toBe("#local");
		expect(result.text?.size).toBe(24);
		expect(result.text?.weight).toBe(700); // depth still fills in
		expect(result.shape).toBe("rounded-rect"); // base still fills in
	});

	it("reference sits between local and theme", () => {
		const result = resolveNodeStyle(
			theme,
			2,
			{ text: { weight: 800 } }, // local
			{ fill: "#ref", text: { size: 15 } }, // reference
		);
		expect(result.text?.weight).toBe(800); // local
		expect(result.fill).toBe("#ref"); // reference overrides theme
		expect(result.text?.size).toBe(15); // reference overrides theme
		expect(result.shape).toBe("rounded-rect"); // base fills in
	});

	it("works with no theme", () => {
		const result = resolveNodeStyle(
			undefined,
			1,
			{ fill: "#local" },
		);
		expect(result).toEqual({ fill: "#local" });
	});

	it("works with no overrides — pure theme output", () => {
		const result = resolveNodeStyle(theme, 2);
		expect(result.fill).toBe("#333");
		expect(result.text?.size).toBe(17);
		expect(result.text?.weight).toBe(600);
	});
});
