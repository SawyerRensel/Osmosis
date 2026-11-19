import { describe, expect, it } from "vitest";
import { MIN_DOLLY, dollyDistance } from "./depth";
import { PINCH_MIN_DOLLY, pinchDollyDistance, rayDistanceAtDepth } from "./pinch-zoom";

describe("pinchDollyDistance", () => {
	it("moves a spread ratio r toward a point d away by d·(1 − 1/r), so the point grows by r on screen", () => {
		for (const [d, r] of [[70, 1.5], [400, 1.2], [2000, 2]] as const) {
			const step = pinchDollyDistance(d, Math.log(r));
			expect(step).toBeCloseTo(d * (1 - 1 / r), 9);
			// What was d away is now d / r away: r times larger on screen.
			expect(d / (d - step)).toBeCloseTo(r, 9);
		}
	});

	it("moves a little near a plate and a lot far away, for the same pinch", () => {
		const logZoom = Math.log(1.5);
		expect(pinchDollyDistance(1000, logZoom) / pinchDollyDistance(100, logZoom)).toBeCloseTo(10, 9);
	});

	it("depends only on the aimed distance, so a planet core far behind the plate adds nothing", () => {
		// Near a plate 70 away on a planet whose core is 400 away, a 1.5× pinch used to be sized from the core.
		const logZoom = Math.log(1.5);
		const plate = pinchDollyDistance(70, logZoom);
		expect(plate).toBeCloseTo(70 / 3, 9);
		expect(plate).toBeLessThan(70);
		expect(dollyDistance(400, logZoom)).toBeGreaterThan(70);
	});

	it("is not held up by the wheel's floor, which would overshoot a plate being read", () => {
		const logZoom = Math.log(1.5);
		expect(dollyDistance(70, logZoom)).toBeCloseTo(MIN_DOLLY * logZoom, 9);
		expect(dollyDistance(70, logZoom)).toBeGreaterThan(70);
		expect(pinchDollyDistance(70, logZoom)).toBeLessThan(dollyDistance(70, logZoom));
	});

	it("still steps at least the pinch floor right at a plate, so a pinch passes through it", () => {
		const logZoom = Math.log(2);
		expect(pinchDollyDistance(5, logZoom)).toBeCloseTo(PINCH_MIN_DOLLY * logZoom, 9);
		expect(pinchDollyDistance(5, logZoom)).toBeGreaterThan(5);
	});

	it("backs away by the matching amount when the fingers close", () => {
		const d = 120;
		const inward = pinchDollyDistance(d, 0.3);
		expect(pinchDollyDistance(d - inward, -0.3)).toBeCloseTo(-inward, 9);
	});

	it("does not move for no spread", () => {
		expect(pinchDollyDistance(300, 0)).toBe(0);
	});
});

describe("rayDistanceAtDepth", () => {
	it("is the depth itself straight ahead", () => {
		expect(rayDistanceAtDepth(80, 1)).toBe(80);
	});

	it("is longer along an oblique ray, reaching the same view depth", () => {
		const cosine = Math.cos(0.3);
		expect(rayDistanceAtDepth(80, cosine) * cosine).toBeCloseTo(80, 9);
	});

	it("stays finite for a ray at right angles to the view", () => {
		expect(rayDistanceAtDepth(80, 0)).toBe(800);
	});
});
