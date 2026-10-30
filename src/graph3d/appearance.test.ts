import { describe, it, expect } from "vitest";
import { noteHue, spriteLabel } from "./appearance";

describe("spriteLabel", () => {
	it("keeps short plain text as it is", () => {
		expect(spriteLabel("Clove hitch")).toBe("Clove hitch");
	});

	it("collapses links and embeds to their display text", () => {
		expect(spriteLabel("Tied to [[Rigging#^halyard|the halyard]]")).toBe("Tied to the halyard");
		expect(spriteLabel("See [[Rigging#Running Rigging]]")).toBe("See Rigging");
		expect(spriteLabel("Back to [[#Bends]]")).toBe("Back to Bends");
		expect(spriteLabel("![[knot-diagram.svg]]")).toBe("knot-diagram.svg");
		expect(spriteLabel("Read [the guide](https://example.com/guide)")).toBe("Read the guide");
	});

	it("drops inline formatting markers", () => {
		expect(spriteLabel("**Bowline** with `code` and ==mark==")).toBe("Bowline with code and mark");
	});

	it("labels a callout by its title and a code block by its first line", () => {
		expect(spriteLabel("> [!tip] Tension check\n> Sight up the mast")).toBe("Tension check");
		expect(spriteLabel("```text\nshroud tension: 12%\n```")).toBe("shroud tension: 12%");
	});

	it("separates table cells", () => {
		expect(spriteLabel("| Knot | Use |\n| --- | --- |")).toBe("Knot · Use");
	});

	it("truncates long text at a word boundary", () => {
		const label = spriteLabel("Shrouds hold the mast sideways against the wind", 24);
		expect(label).toBe("Shrouds hold the mast…");
		expect(label.length).toBeLessThanOrEqual(25);
	});

	it("cuts a single long word rather than leaving it whole", () => {
		expect(spriteLabel("x".repeat(40), 10)).toBe(`${"x".repeat(10)}…`);
	});
});

describe("noteHue", () => {
	it("is stable and in range", () => {
		expect(noteHue("Knots.md")).toBe(noteHue("Knots.md"));
		for (const path of ["a.md", "Sailing Basics.md", "deep/folder/Note.md"]) {
			const hue = noteHue(path);
			expect(hue).toBeGreaterThanOrEqual(0);
			expect(hue).toBeLessThan(360);
		}
	});
});
