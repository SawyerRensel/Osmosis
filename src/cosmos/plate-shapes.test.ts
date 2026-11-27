import { describe, it, expect } from "vitest";
import { SHAPE_LABELS } from "../shapes";
import type { TopicShape } from "../styles";
import { PLATE_SHAPE_ID, isBareShape, isRectShape, isTopicShape, shapeBox, shapePath } from "./plate-shapes";

const SHAPES = Object.keys(SHAPE_LABELS) as TopicShape[];

describe("isTopicShape", () => {
	it("knows every shape the mind map offers, and nothing else", () => {
		for (const shape of SHAPES) expect(isTopicShape(shape)).toBe(true);
		expect(Object.keys(PLATE_SHAPE_ID).sort()).toEqual([...SHAPES].sort());
		expect(isTopicShape("blob")).toBe(false);
		expect(isTopicShape("toString")).toBe(false);
		expect(isTopicShape(3)).toBe(false);
	});

	it("sorts rectangles and bare shapes", () => {
		expect(SHAPES.filter(isRectShape).sort()).toEqual(["pill", "rect", "rounded-rect"]);
		expect(SHAPES.filter(isBareShape).sort()).toEqual(["none", "underline"]);
	});
});

describe("shapeBox", () => {
	it("leaves a rectangle's box as it is", () => {
		for (const shape of ["rect", "rounded-rect", "underline", "none"] as const) expect(shapeBox(shape, 30, 5)).toEqual({ width: 30, height: 5, textX: 0 });
	});

	it("inflates a diamond to twice its content, as the mind map's layout does", () => {
		const box = shapeBox("diamond", 30, 5);
		expect(box.width).toBeCloseTo(60);
		expect(box.height).toBeCloseTo(10);
		expect(box.textX).toBeCloseTo(0);
	});

	it("makes a circle a square that holds its content's diagonal", () => {
		const box = shapeBox("circle", 30, 5);
		expect(box.width).toBe(box.height);
		expect(box.width).toBeGreaterThanOrEqual(Math.hypot(30, 5));
		expect(box.width).toBeCloseTo(30 / 0.84);
	});

	it("moves the text of an off-centre shape to its inner box", () => {
		// Triangle: insets 0.05 left, 0.45 right.
		const box = shapeBox("triangle", 10, 5);
		expect(box.width).toBeCloseTo(20);
		expect(box.textX).toBeCloseTo(-4);
		// The text's box sits inside: from left inset to the right inset.
		expect(box.textX - 5).toBeCloseTo(-box.width / 2 + 0.05 * box.width);
		expect(shapeBox("arrow-right", 10, 5).textX).toBeLessThan(0);
	});
});

describe("shapePath", () => {
	it("draws a closed outline for every shape but underline", () => {
		for (const shape of SHAPES) {
			const d = shapePath(shape, 100, 40, 12);
			expect(d.startsWith("M ")).toBe(true);
			expect(d.endsWith("Z")).toBe(shape !== "underline");
		}
	});

	it("follows the mind map's geometry", () => {
		expect(shapePath("diamond", 100, 40, 0)).toBe("M 50 0 L 100 20 L 50 40 L 0 20 Z");
		expect(shapePath("triangle", 100, 40, 0)).toBe("M 0 0 L 100 20 L 0 40 Z");
		expect(shapePath("underline", 100, 40, 0)).toBe("M 0 40 L 100 40");
		expect(shapePath("parallelogram", 100, 40, 0)).toBe("M 20 0 L 100 0 L 80 40 L 0 40 Z");
	});

	it("rounds a rectangle's corners by the radius, a pill's by half its height", () => {
		expect(shapePath("rounded-rect", 100, 40, 12)).toContain("A 12 12");
		expect(shapePath("pill", 100, 40, 12)).toContain("A 20 20");
		expect(shapePath("rounded-rect", 100, 40, 0)).toBe(shapePath("rect", 100, 40, 0));
	});
});
