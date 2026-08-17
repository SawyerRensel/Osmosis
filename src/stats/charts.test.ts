import { describe, it, expect } from "vitest";
import { heatStep, niceCeiling, xLabelStride } from "./charts";

/**
 * The drawing itself is Obsidian DOM and belongs to the manual column. What is
 * testable here is the arithmetic that decides what a reader actually sees:
 * axis rounding, label crowding, and heatmap intensity.
 */

describe("niceCeiling", () => {
	it("rounds up to a readable axis maximum", () => {
		expect(niceCeiling(437)).toBe(500);
		expect(niceCeiling(874)).toBe(1000);
		expect(niceCeiling(12)).toBe(20);
	});

	it("keeps a value that is already clean", () => {
		expect(niceCeiling(100)).toBe(100);
		expect(niceCeiling(2000)).toBe(2000);
	});

	it("never returns zero, so nothing divides by the axis", () => {
		expect(niceCeiling(0)).toBe(1);
		expect(niceCeiling(-5)).toBe(1);
	});
});

describe("xLabelStride", () => {
	it("labels every column when they all fit", () => {
		expect(xLabelStride(5, 600)).toBe(1);
	});

	it("thins the labels when a year of days will not fit", () => {
		// 365 columns across 600px fits ~11 labels, so roughly every 5th week.
		const stride = xLabelStride(365, 600);
		expect(stride).toBeGreaterThan(1);
		expect(Math.ceil(365 / stride)).toBeLessThanOrEqual(Math.floor(600 / 52) + 1);
	});

	it("thins harder as the pane narrows", () => {
		expect(xLabelStride(90, 300)).toBeGreaterThan(xLabelStride(90, 900));
	});

	it("never returns zero or a negative stride", () => {
		expect(xLabelStride(0, 100)).toBe(1);
		expect(xLabelStride(1, 10)).toBe(1);
		expect(xLabelStride(400, 1)).toBeGreaterThanOrEqual(1);
	});
});

describe("heatStep", () => {
	it("gives a day with no reviews the empty step", () => {
		expect(heatStep(0, 50)).toBe(0);
	});

	it("gives the busiest day the darkest step", () => {
		expect(heatStep(50, 50)).toBe(4);
	});

	it("keeps a single review visible rather than rounding it to empty", () => {
		expect(heatStep(1, 500)).toBe(1);
	});

	it("spreads the middle across the ramp", () => {
		expect(heatStep(25, 100)).toBe(1);
		expect(heatStep(50, 100)).toBe(2);
		expect(heatStep(75, 100)).toBe(3);
	});

	it("does not divide by zero on an empty year", () => {
		expect(heatStep(0, 0)).toBe(0);
		expect(heatStep(3, 0)).toBe(1);
	});
});
