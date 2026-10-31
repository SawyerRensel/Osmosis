import { describe, it, expect } from "vitest";
import { FOCUS_DIM_BEHIND, FOCUS_DIM_FRONT, FOCUS_DIM_GLSL, focusDim } from "./focus";

describe("focusDim", () => {
	it("is 0 at the focus", () => {
		expect(focusDim(100, 100)).toBe(0);
		expect(focusDim(4000, 4000)).toBe(0);
	});

	it("rises monotonically behind the focus and caps at the behind maximum", () => {
		let last = 0;
		for (let depth = 101; depth <= 400; depth += 7) {
			const dim = focusDim(depth, 100);
			expect(dim).toBeGreaterThanOrEqual(last);
			expect(dim).toBeLessThanOrEqual(FOCUS_DIM_BEHIND);
			last = dim;
		}
		expect(focusDim(200, 100)).toBeCloseTo(FOCUS_DIM_BEHIND);
		expect(focusDim(10000, 100)).toBeCloseTo(FOCUS_DIM_BEHIND);
	});

	it("rises monotonically toward the camera and caps at the lighter front maximum", () => {
		let last = 0;
		for (let depth = 99; depth >= 0; depth -= 3) {
			const dim = focusDim(depth, 100);
			expect(dim).toBeGreaterThanOrEqual(last);
			expect(dim).toBeLessThanOrEqual(FOCUS_DIM_FRONT);
			last = dim;
		}
		expect(focusDim(0, 100)).toBeCloseTo(FOCUS_DIM_FRONT);
		expect(focusDim(-50, 100)).toBeCloseTo(FOCUS_DIM_FRONT);
	});

	it("dims less in front than the same distance behind", () => {
		expect(focusDim(70, 100)).toBeLessThan(focusDim(130, 100));
	});

	it("scales with the focus depth", () => {
		expect(focusDim(150, 100)).toBeCloseTo(focusDim(1500, 1000));
		expect(focusDim(40, 100)).toBeCloseTo(focusDim(400, 1000));
	});

	it("never fully hides anything", () => {
		expect(Math.max(FOCUS_DIM_BEHIND, FOCUS_DIM_FRONT)).toBeLessThan(1);
	});

	it("survives a zero focus depth", () => {
		expect(Number.isFinite(focusDim(10, 0))).toBe(true);
	});

	it("puts the same constants in the shader", () => {
		expect(FOCUS_DIM_GLSL).toContain(FOCUS_DIM_BEHIND.toFixed(4));
		expect(FOCUS_DIM_GLSL).toContain(FOCUS_DIM_FRONT.toFixed(4));
	});
});
