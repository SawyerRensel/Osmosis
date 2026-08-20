import { describe, expect, it } from "vitest";
import {
	MAX_FRAME_MS,
	PAN_FRICTION,
	PAN_MIN_VELOCITY,
	RUBBER_BAND_COEFFICIENT,
	SAMPLE_WINDOW_MS,
	STALE_SAMPLE_MS,
	applyRubberBand,
	clampRange,
	estimateVelocity,
	integrateDecay,
	overshoot,
	pruneSamples,
	rubberBand,
	springStep,
	springTarget,
	type Sample,
} from "./mindmap-inertia";

/** Samples 16ms apart moving at a constant velocity, ending at t = 0. */
function flick(vx: number, vy: number, count = 6): Sample[] {
	const samples: Sample[] = [];
	for (let i = count - 1; i >= 0; i--) {
		const t = -i * 16;
		samples.push({ x: vx * t, y: vy * t, t });
	}
	return samples;
}

describe("estimateVelocity", () => {
	it("recovers the velocity of a constant-speed flick", () => {
		const v = estimateVelocity(flick(2, -1), 0);
		expect(v.x).toBeCloseTo(2, 6);
		expect(v.y).toBeCloseTo(-1, 6);
	});

	it("averages over the window instead of trusting the last pair", () => {
		// A single jittery final sample would read as a huge velocity if the
		// estimate differenced only the last two points.
		const samples = flick(1, 0);
		const last = samples[samples.length - 1];
		if (last) last.x += 30;
		const v = estimateVelocity(samples, 0);
		expect(v.x).toBeLessThan(2);
	});

	it("ignores movement older than the window", () => {
		const samples: Sample[] = [
			{ x: 0, y: 0, t: -SAMPLE_WINDOW_MS - 500 },
			{ x: 500, y: 0, t: -32 },
			{ x: 500, y: 0, t: -16 },
			{ x: 500, y: 0, t: 0 },
		];
		expect(estimateVelocity(samples, 0).x).toBe(0);
	});

	it("treats a finger that paused before lifting as a placement, not a flick", () => {
		expect(estimateVelocity(flick(2, 2), STALE_SAMPLE_MS + 1)).toEqual({
			x: 0,
			y: 0,
		});
	});

	it("returns rest for an empty or single-sample history", () => {
		expect(estimateVelocity([], 0)).toEqual({ x: 0, y: 0 });
		expect(estimateVelocity([{ x: 5, y: 5, t: 0 }], 0)).toEqual({ x: 0, y: 0 });
	});
});

describe("pruneSamples", () => {
	it("keeps the window and drops what precedes it", () => {
		const samples: Sample[] = [
			{ x: 0, y: 0, t: -SAMPLE_WINDOW_MS - 1 },
			{ x: 1, y: 1, t: -SAMPLE_WINDOW_MS },
			{ x: 2, y: 2, t: 0 },
		];
		expect(pruneSamples(samples, 0).map((s) => s.t)).toEqual([
			-SAMPLE_WINDOW_MS,
			0,
		]);
	});
});

describe("integrateDecay", () => {
	it("decays velocity toward rest", () => {
		let v = 1;
		for (let i = 0; i < 200; i++) v = integrateDecay(v, PAN_FRICTION, 16).velocity;
		expect(Math.abs(v)).toBeLessThan(PAN_MIN_VELOCITY);
	});

	it("travels the same distance regardless of frame rate", () => {
		const total = (steps: number, dt: number) => {
			let v = 3;
			let d = 0;
			for (let i = 0; i < steps; i++) {
				const step = integrateDecay(v, PAN_FRICTION, dt);
				v = step.velocity;
				d += step.delta;
			}
			return d;
		};
		// 60fps for 960ms vs. a stuttering 20fps for the same 960ms.
		expect(total(60, 16)).toBeCloseTo(total(20, 48), 6);
	});

	it("converges on v0/friction as the total fling distance", () => {
		let v = 2;
		let d = 0;
		for (let i = 0; i < 2000; i++) {
			const step = integrateDecay(v, PAN_FRICTION, MAX_FRAME_MS);
			v = step.velocity;
			d += step.delta;
		}
		expect(d).toBeCloseTo(2 / PAN_FRICTION, 3);
	});

	it("is inert for a non-positive frame", () => {
		expect(integrateDecay(5, PAN_FRICTION, 0)).toEqual({ velocity: 5, delta: 0 });
	});
});

describe("clampRange", () => {
	it("allows panning past the content until only a sliver is left on screen", () => {
		// 1000 of content, 400 of viewport, 48 sliver: the origin runs from
		// -352 (content's near edge just inside the far screen edge) to 952
		// (content's far edge just inside the near screen edge).
		expect(clampRange(1000, 400, 48)).toEqual({ lo: -352, hi: 952 });
	});

	it("is looser than the content edge in both directions", () => {
		// The point of the sliver rule: you can always push the map far enough
		// to clear room for a new child node, at either end.
		const range = clampRange(1000, 400, 48);
		expect(range.lo).toBeLessThan(0);
		expect(range.hi).toBeGreaterThan(1000 - 400);
	});

	it("keeps a sliver on screen at every position in range", () => {
		const content = 300;
		const viewport = 400;
		const keep = 48;
		const range = clampRange(content, viewport, keep);
		for (const x of [range.lo, -100, 0, 150, range.hi]) {
			const overlap = Math.min(content, x + viewport) - Math.max(0, x);
			expect(overlap).toBeGreaterThanOrEqual(keep - 1e-9);
		}
	});

	it("pins to the midpoint rather than inverting when the sliver cannot fit", () => {
		// 10 of content in a 10 viewport cannot keep a 48 sliver on screen at
		// all, so the axis pins instead of inverting into an empty range.
		const range = clampRange(10, 10, 48);
		expect(range.lo).toBe(range.hi);
	});
});

describe("overshoot", () => {
	const range = { lo: 0, hi: 600 };

	it("is zero inside the range, signed outside it", () => {
		expect(overshoot(300, range)).toBe(0);
		expect(overshoot(0, range)).toBe(0);
		expect(overshoot(600, range)).toBe(0);
		expect(overshoot(-25, range)).toBe(-25);
		expect(overshoot(640, range)).toBe(40);
	});
});

describe("rubberBand", () => {
	it("resists at the configured fraction for the first pixels past the bound", () => {
		expect(rubberBand(1, 400)).toBeCloseTo(RUBBER_BAND_COEFFICIENT, 2);
	});

	it("is monotonic and never exceeds one viewport", () => {
		let previous = 0;
		for (const d of [10, 50, 100, 400, 1000, 100000]) {
			const banded = rubberBand(d, 400);
			expect(banded).toBeGreaterThan(previous);
			expect(banded).toBeLessThan(400);
			previous = banded;
		}
	});

	it("always damps — the map never outruns the finger past the bound", () => {
		for (const d of [1, 10, 100, 1000]) {
			expect(rubberBand(d, 400)).toBeLessThan(d);
		}
	});

	it("is zero for a non-positive pull or dimension", () => {
		expect(rubberBand(0, 400)).toBe(0);
		expect(rubberBand(50, 0)).toBe(0);
	});
});

describe("applyRubberBand", () => {
	const range = { lo: 0, hi: 600 };

	it("leaves in-range positions untouched", () => {
		expect(applyRubberBand(250, range, 400)).toBe(250);
	});

	it("damps past either bound, symmetrically", () => {
		const above = applyRubberBand(700, range, 400);
		const below = applyRubberBand(-100, range, 400);
		expect(above).toBeGreaterThan(600);
		expect(above).toBeLessThan(700);
		expect(below).toBeLessThan(0);
		expect(below).toBeGreaterThan(-100);
		expect(above - range.hi).toBeCloseTo(range.lo - below, 6);
	});
});

describe("springStep / springTarget", () => {
	const range = { lo: 0, hi: 600 };

	it("targets the bound that was exceeded, and stays put inside", () => {
		expect(springTarget(-40, range)).toBe(0);
		expect(springTarget(680, range)).toBe(600);
		expect(springTarget(300, range)).toBe(300);
	});

	it("settles at the bound without overshooting it", () => {
		let v = -80;
		for (let i = 0; i < 100; i++) {
			const next = springStep(v, 0, 16);
			expect(next).toBeGreaterThan(v); // monotonic, never past the target
			expect(next).toBeLessThanOrEqual(0);
			v = next;
		}
		expect(v).toBeCloseTo(0, 3);
	});

	it("is inert for a non-positive frame", () => {
		expect(springStep(-40, 0, 0)).toBe(-40);
	});
});
