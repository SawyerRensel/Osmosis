import { describe, it, expect } from "vitest";
import { UNIT_SPACING, edgeDistance, linkDistance, nodeExtent, noteHue, plateExtent, spriteLabel } from "./appearance";

describe("spriteLabel", () => {
	it("shows a node link's arrow label as the arrow", () => {
		expect(spriteLabel("Sheet [[Deck#^cleat|-->]]")).toBe("Sheet -->");
		expect(spriteLabel("Sheet [-->](Deck.md#^cleat)")).toBe("Sheet -->");
	});

	it("drops a coloured highlight's colour emoji, and only that one", () => {
		expect(spriteLabel("The ==🔴Danube== flows")).toBe("The Danube flows");
		expect(spriteLabel("==🟣c1:Danube== and ==🟢Rhine==")).toBe("Danube and Rhine");
		expect(spriteLabel("A ==stop 🔴 sign== here")).toBe("A stop 🔴 sign here");
		expect(spriteLabel("A ==⭐star== here")).toBe("A ⭐star here");
		expect(spriteLabel("🔴 Alert")).toBe("🔴 Alert");
	});

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

describe("nodeExtent", () => {
	it("is the plate's extent when there is no panel, or a smaller one", () => {
		const plate = { width: 30, height: 5 };
		expect(nodeExtent(plate, null, 3)).toBe(plateExtent(plate));
		expect(nodeExtent(plate, { width: 4, height: 1 }, 3)).toBe(plateExtent(plate));
	});

	it("is the panel's half-diagonal in world units when the panel is bigger", () => {
		expect(nodeExtent({ width: 30, height: 5 }, { width: 20, height: 15 }, 2)).toBe(25);
	});
});

describe("linkDistance with spacing", () => {
	const kinds = ["hierarchy", "link", "embed", "property", "tag", "attachment"] as const;

	it("is exactly today's distance at x1, however it is spelled", () => {
		for (const kind of kinds) {
			expect(linkDistance(kind, 30, 12, { note: 1, node: 1 })).toBe(edgeDistance(kind) + 42);
			expect(linkDistance(kind, 30, 12, UNIT_SPACING)).toBe(linkDistance(kind, 30, 12));
		}
	});

	it("scales hierarchy edges by Node spacing and every other kind by Note spacing, never the plates", () => {
		expect(linkDistance("hierarchy", 25, 5, { note: 3, node: 2 })).toBe(edgeDistance("hierarchy") * 2 + 30);
		for (const kind of ["link", "embed", "property", "tag", "attachment"] as const) {
			expect(linkDistance(kind, 25, 5, { note: 3, node: 2 })).toBe(edgeDistance(kind) * 3 + 30);
		}
	});

	it("grows with each slider", () => {
		let last = 0;
		for (const node of [0.5, 1, 2, 3]) {
			const distance = linkDistance("hierarchy", 10, 10, { note: 1, node });
			expect(distance).toBeGreaterThan(last);
			last = distance;
		}
		last = 0;
		for (const note of [0.5, 1, 2, 3]) {
			const distance = linkDistance("link", 10, 10, { note, node: 1 });
			expect(distance).toBeGreaterThan(last);
			last = distance;
		}
	});
});
