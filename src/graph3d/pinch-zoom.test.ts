import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { MIN_DOLLY, dollyDistance } from "./depth";
import { sphereOnRay } from "./globe";
import { PINCH_MIN_DOLLY, pinchDollyDistance, rayDistanceAtDepth, zoomPivotDistance } from "./pinch-zoom";
import { grabRadius } from "./shells";

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

describe("zoomPivotDistance", () => {
	// A planet of radius 100 whose core is 170 straight ahead: its surface is
	// 70 away, the distance a plate is read from (`LINE_STAND_OFF`).
	const eye = new Vector3(0, 0, 0);
	const ahead = new Vector3(0, 0, -1);
	/** Where a ray from the eye meets the sphere a drag there grabs (the scene's `sphereHit`). */
	const surfaceAlong = (direction: Vector3, core: number, surface: number, shells: number[] = []): number | null =>
		sphereOnRay(eye, direction, [{ centre: new Vector3(0, 0, -core), radius: grabRadius(core, surface, shells) }])?.distance ?? null;

	it("over a gap heads for the surface a drag grabs, so its step is the step for a pivot on the surface, not the core", () => {
		const logZoom = Math.log(1.25);
		const surface = surfaceAlong(ahead, 170, 100);
		expect(surface).toBeCloseTo(70, 9);
		const gap = zoomPivotDistance({ plate: null, surface, miss: 170 }, 1);
		expect(pinchDollyDistance(gap, logZoom)).toBeCloseTo(pinchDollyDistance(70, logZoom), 9);
		expect(pinchDollyDistance(gap, logZoom)).toBeCloseTo(14, 9);
		// Round 1 fell back to Auto Depth's last depth, which the first finger's press set to the core's: 34, 2.4 times as fast.
		expect(pinchDollyDistance(170, logZoom)).toBeCloseTo(34, 9);
	});

	it("zooms a gap at the rate of a plate on the surface beside it", () => {
		const plate = zoomPivotDistance({ plate: 70, surface: 70, miss: 170 }, 1);
		const angle = 0.05;
		const beside = new Vector3(Math.sin(angle), 0, -Math.cos(angle));
		const gap = zoomPivotDistance({ plate: null, surface: surfaceAlong(beside, 170, 100), miss: 170 }, Math.cos(angle));
		expect(Math.abs(gap - plate) / plate).toBeLessThan(0.01);
	});

	it("with core layers, heads for the shell a drag from inside the surface grabs", () => {
		// 90 from the core: inside the surface (100), outside the shell at 60, which is 30 ahead.
		const surface = surfaceAlong(ahead, 90, 100, [30, 60]);
		expect(zoomPivotDistance({ plate: null, surface, miss: 90 }, 1)).toBeCloseTo(30, 9);
	});

	it("keeps the plate first, in the plane facing the camera through it, as in round 1", () => {
		const cosine = Math.cos(0.2);
		expect(zoomPivotDistance({ plate: 40, surface: 70, miss: 170 }, cosine)).toBeCloseTo(40 / cosine, 9);
	});

	it("falls back to the miss only off every planet", () => {
		expect(zoomPivotDistance({ plate: null, surface: null, miss: 250 }, 0.9)).toBe(250);
	});
});
