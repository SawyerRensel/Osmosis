import { describe, expect, it } from "vitest";
import { heightFov, keepScale } from "./keep-scale";

/** World units per pixel at depth 1. */
const perPixel = (fov: number, height: number) => (2 * Math.tan((fov * Math.PI) / 360)) / height;

describe("heightFov", () => {
	it("is the base at the base height", () => {
		expect(heightFov(50, 800, 800)).toBeCloseTo(50, 10);
	});

	it("keeps world units per pixel when the height shrinks or grows", () => {
		for (const height of [300, 480, 1200]) expect(perPixel(heightFov(50, 800, height), height)).toBeCloseTo(perPixel(50, 800), 12);
	});
});

describe("keepScale", () => {
	it("starts at the default on first layout", () => {
		const { base, fov } = keepScale(null, 400, 800, 50);
		expect(fov).toBe(50);
		expect(base).toEqual({ width: 400, height: 800 });
	});

	it("narrows the view as a keyboard shortens the stage, and restores it when it closes", () => {
		const first = keepScale(null, 400, 800, 50);
		const open = keepScale(first.base, 400, 420, 50);
		expect(open.fov).toBeLessThan(50);
		expect(perPixel(open.fov, 420)).toBeCloseTo(perPixel(50, 800), 12);
		const closed = keepScale(open.base, 400, 800, 50);
		expect(closed.fov).toBeCloseTo(50, 10);
	});

	it("ignores sub-pixel width jitter", () => {
		const first = keepScale(null, 400, 800, 50);
		expect(keepScale(first.base, 400.4, 400, 50).base).toBe(first.base);
	});

	it("starts afresh at the default when the width changes", () => {
		const first = keepScale(null, 400, 800, 50);
		const rotated = keepScale(first.base, 800, 400, 50);
		expect(rotated.fov).toBe(50);
		expect(rotated.base).toEqual({ width: 800, height: 400 });
	});
});
