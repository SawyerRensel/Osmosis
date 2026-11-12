import { describe, expect, it } from "vitest";
import { MASK_STEP_PX, RASTER_BAND, rasterScale, snapHoles } from "./raster";

describe("rasterScale", () => {
	it("first rasters at the drawn scale", () => {
		expect(rasterScale(0, 1.7)).toBe(1.7);
	});

	it("keeps the raster while the drawn scale stays in the band", () => {
		expect(rasterScale(2, 2)).toBe(2);
		expect(rasterScale(2, 1.9)).toBe(2);
		expect(rasterScale(2, 2 * RASTER_BAND.low)).toBe(2);
	});

	it("re-rasters above the drawn scale as soon as the panel grows past its raster", () => {
		const next = rasterScale(2, 2.01);
		expect(next).toBeGreaterThan(2.01);
		expect(2.01 / next).toBeCloseTo(RASTER_BAND.reset);
	});

	it("re-rasters smaller once the panel shrinks out of the band", () => {
		const next = rasterScale(2, 1.7);
		expect(next).toBeLessThan(2);
		expect(1.7 / next).toBeCloseTo(RASTER_BAND.reset);
	});

	it("never shows the raster larger than drawn over a zoom in and out", () => {
		let raster = 0;
		let rasters = 0;
		const scales: number[] = [];
		for (let i = 0; i <= 120; i++) scales.push(0.5 * 1.02 ** i);
		for (let i = 120; i >= 0; i--) scales.push(0.5 * 1.02 ** i);
		for (const scale of scales) {
			const next = rasterScale(raster, scale);
			if (next !== raster) rasters++;
			raster = next;
			expect(scale / raster).toBeLessThanOrEqual(1);
			expect(scale / raster).toBeGreaterThanOrEqual(RASTER_BAND.low);
		}
		// A 2% step a frame re-rasters about every third frame, not every frame.
		expect(rasters).toBeLessThan(scales.length / 2);
	});

	it("keeps the raster for a scale it cannot use", () => {
		expect(rasterScale(2, 0)).toBe(2);
		expect(rasterScale(2, Infinity)).toBe(2);
		expect(rasterScale(2, NaN)).toBe(2);
	});
});

describe("snapHoles", () => {
	it("rounds every length to the step", () => {
		expect(snapHoles([{ left: 10.12, top: 3.9, width: 40.3, height: 20.01, radius: 4.13 }], 0.25)).toEqual([{ left: 10, top: 4, width: 40.25, height: 20, radius: 4.25 }]);
	});

	it("gives the same holes for a sub-step drift", () => {
		const a = snapHoles([{ left: 10.01, top: 5, width: 30, height: 12, radius: 3 }], MASK_STEP_PX);
		const b = snapHoles([{ left: 10.06, top: 5.04, width: 30, height: 12, radius: 3 }], MASK_STEP_PX);
		expect(b).toEqual(a);
	});

	it("leaves holes as they are for a step it cannot use", () => {
		const holes = [{ left: 1.3, top: 2, width: 3, height: 4, radius: 0 }];
		expect(snapHoles(holes, 0)).toEqual(holes);
	});
});
