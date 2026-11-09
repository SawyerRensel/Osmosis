import { describe, expect, it } from "vitest";
import { easeLook } from "./look-ease";

function run(pending: number, steps: number[]): { applied: number; remaining: number } {
	let applied = 0;
	for (const dt of steps) {
		const r = easeLook(pending, dt);
		applied += r.step;
		pending = r.remaining;
	}
	return { applied, remaining: pending };
}

describe("easeLook", () => {
	it("is frame-rate independent", () => {
		const one = run(100, [0.032]);
		const two = run(100, [0.016, 0.016]);
		expect(two.remaining).toBeCloseTo(one.remaining, 6);
		expect(two.applied).toBeCloseTo(one.applied, 6);
	});

	it("never applies more than was pending and converges to all of it", () => {
		const r = run(-80, Array.from({ length: 120 }, () => 1 / 60));
		expect(r.remaining).toBe(0);
		expect(r.applied).toBeCloseTo(-80, 6);
	});

	it("eases rather than jumping: the first frame takes a fraction", () => {
		const r = easeLook(100, 1 / 60);
		expect(r.step).toBeGreaterThan(0);
		expect(r.step).toBeLessThan(25);
	});

	it("applies nothing for zero elapsed time and keeps the sign", () => {
		expect(easeLook(50, 0)).toEqual({ step: 0, remaining: 50 });
		expect(easeLook(-50, 0.016).step).toBeLessThan(0);
	});

	it("a stop (zero pending) stays zero", () => {
		expect(easeLook(0, 0.016)).toEqual({ step: 0, remaining: 0 });
	});
});
