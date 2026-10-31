import { describe, it, expect } from "vitest";
import { edgeDistance, linkDistance, noteHue, plateExtent, spriteLabel } from "./appearance";

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

describe("plateExtent", () => {
	it("is half the plate's diagonal, so it clears the plate whichever way the link leaves it", () => {
		expect(plateExtent({ width: 6, height: 8 })).toBe(5);
		expect(plateExtent({ width: 50, height: 5 })).toBeCloseTo(25.12, 2);
	});
});

describe("linkDistance", () => {
	it("keeps the kind's base distance between two point-sized ends", () => {
		for (const kind of ["hierarchy", "link", "embed", "property", "tag", "attachment"] as const) {
			expect(linkDistance(kind, 0, 0)).toBe(edgeDistance(kind));
		}
	});

	it("adds each end's extent to the base distance", () => {
		expect(linkDistance("hierarchy", 25, 0)).toBe(edgeDistance("hierarchy") + 25);
		expect(linkDistance("hierarchy", 0, 25)).toBe(edgeDistance("hierarchy") + 25);
		expect(linkDistance("link", 30, 12)).toBe(edgeDistance("link") + 42);
	});

	it("grows with either end's plate", () => {
		const small = linkDistance("hierarchy", 5, 5);
		expect(linkDistance("hierarchy", 20, 5)).toBeGreaterThan(small);
		expect(linkDistance("hierarchy", 5, 20)).toBeGreaterThan(small);
	});
});
