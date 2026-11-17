import { describe, it, expect } from "vitest";
import { holeMask, panelHoles, type ScreenPanel, type ScreenPlate } from "./occlusion";

// A panel laid out 200 × 40 px, drawn at half size centred on (500, 300), at view depth 100.
const panel: ScreenPanel = { id: "line:reef", x: 500, y: 300, width: 200, height: 40, scale: 0.5, depth: 100 };

function plate(over: Partial<ScreenPlate>): ScreenPlate {
	return { id: "note:knots", x: 500, y: 300, halfWidth: 20, halfHeight: 5, radius: 3, depth: 80, ...over };
}

describe("panelHoles", () => {
	it("cuts a nearer overlapping plate out, in the panel's layout px", () => {
		// On screen the panel spans x 450–550, y 290–310.
		const holes = panelHoles(panel, [plate({ x: 460, y: 295 })]);
		expect(holes).toEqual([{ left: (440 - 450) / 0.5, top: (290 - 290) / 0.5, width: 80, height: 20, radius: 6 }]);
	});

	it("leaves a farther plate under the panel", () => {
		expect(panelHoles(panel, [plate({ depth: 120 })])).toEqual([]);
	});

	it("never cuts the panel's own plate, which lies under it at the same depth", () => {
		expect(panelHoles(panel, [plate({ id: "line:reef", depth: 99 })])).toEqual([]);
	});

	it("ignores nearer plates that don't overlap it on screen", () => {
		expect(panelHoles(panel, [plate({ x: 600 }), plate({ y: 250 }), plate({ x: 571 })])).toEqual([]);
		// Just touching edges is not an overlap.
		expect(panelHoles(panel, [plate({ x: 570 })])).toEqual([]);
		expect(panelHoles(panel, [plate({ x: 569 })])).toHaveLength(1);
	});

	it("keeps every overlapping plate, however many", () => {
		expect(panelHoles(panel, [plate({ id: "a" }), plate({ id: "b", x: 540 }), plate({ id: "c", depth: 200 })])).toHaveLength(2);
	});
});

describe("holeMask", () => {
	it("is no mask at all without holes", () => {
		expect(holeMask([])).toBeNull();
	});

	it("subtracts the union of the holes from a full layer", () => {
		const mask = holeMask([{ left: 10, top: 20, width: 100, height: 30, radius: 5 }])!;
		const images = mask.image.split(/, (?=linear|radial)/);
		expect(images).toHaveLength(7);
		expect(mask.composite).toBe(["subtract", "add", "add", "add", "add", "add", "add"].join(", "));
		// Two crossed rectangles, then the four corner discs.
		expect(mask.size.split(", ")).toEqual(["100% 100%", "100px 20px", "90px 30px", "10px 10px", "10px 10px", "10px 10px", "10px 10px"]);
		expect(mask.position.split(", ")).toEqual(["0 0", "10px 25px", "15px 20px", "10px 20px", "100px 20px", "10px 40px", "100px 40px"]);
	});

	it("draws a square-cornered hole as one rectangle, and clamps the radius to the hole", () => {
		expect(holeMask([{ left: 0, top: 0, width: 10, height: 10, radius: 0 }])!.composite.split(", ")).toHaveLength(3);
		const pill = holeMask([{ left: 0, top: 0, width: 40, height: 10, radius: 50 }])!;
		expect(pill.size.split(", ")[3]).toBe("10px 10px");
	});
});
