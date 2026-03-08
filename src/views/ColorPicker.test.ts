import { describe, it, expect } from "vitest";
import { extractThemeColors } from "./ColorPicker";
import type { ThemeDefinition } from "../styles";

describe("extractThemeColors", () => {
	it("returns empty array for undefined theme", () => {
		expect(extractThemeColors(undefined)).toEqual([]);
	});

	it("extracts colors from base, depths, branchLine, and background", () => {
		const theme: ThemeDefinition = {
			name: "Test",
			base: {
				fill: "#111111",
				border: { color: "#222222", width: 1, style: "solid" },
				text: { color: "#333333" },
			},
			depths: {
				"1": { fill: "#444444", text: { color: "#555555" } },
			},
			branchLine: { color: "#666666", thickness: 1.5 },
			background: "#777777",
		};

		const colors = extractThemeColors(theme);
		expect(colors).toContain("#111111");
		expect(colors).toContain("#222222");
		expect(colors).toContain("#333333");
		expect(colors).toContain("#444444");
		expect(colors).toContain("#555555");
		expect(colors).toContain("#666666");
		expect(colors).toContain("#777777");
	});

	it("deduplicates repeated colors", () => {
		const theme: ThemeDefinition = {
			name: "Dup",
			base: { fill: "#aaaaaa" },
			depths: {
				"1": { fill: "#aaaaaa" },
			},
		};

		const colors = extractThemeColors(theme);
		const count = colors.filter((c) => c === "#aaaaaa").length;
		expect(count).toBe(1);
	});

	it("includes branchColors palette", () => {
		const theme: ThemeDefinition = {
			name: "Branches",
			base: {},
			depths: {},
			branchColors: ["#ff0000", "#00ff00", "#0000ff"],
		};

		const colors = extractThemeColors(theme);
		expect(colors).toContain("#ff0000");
		expect(colors).toContain("#00ff00");
		expect(colors).toContain("#0000ff");
	});
});
