import { describe, it, expect } from "vitest";
import { PAN_FRICTION, PAN_MIN_FLING_VELOCITY, PAN_MIN_VELOCITY } from "../mindmap-inertia";
import { SPIN_FRICTION, SPIN_MAX_VELOCITY, WHEEL_EASE_EPSILON, WHEEL_EASE_SECONDS, launchSpin, stepCoast, type Coast } from "./inertia";
import { easeLook } from "./look-ease";

const NONE = { x: 0, y: 0 };

/** Run `coast` at `fps` until it stops; the distance it covered on each axis and how long it took. */
function run(coast: Coast, friction: number, fps: number): { x: number; y: number; ms: number; speeds: number[] } {
	const ms = 1000 / fps;
	let x = 0;
	let y = 0;
	let t = 0;
	const speeds: number[] = [];
	for (let i = 0; i < 100000; i++) {
		const { delta, done } = stepCoast(coast, friction, ms);
		x += delta.x;
		y += delta.y;
		t += ms;
		speeds.push(Math.hypot(coast.velocity.x, coast.velocity.y));
		if (done) break;
	}
	return { x, y, ms: t, speeds };
}

describe("launchSpin", () => {
	it("does not coast after a still or slow release", () => {
		expect(launchSpin(NONE, { x: 0.01, y: 0 }, NONE, 0)).toBeNull();
		expect(launchSpin({ x: PAN_MIN_FLING_VELOCITY * 0.9, y: 0 }, { x: 0.01, y: 0 }, NONE, 0)).toBeNull();
		expect(launchSpin({ x: 1, y: 0 }, NONE, NONE, 0)).toBeNull();
	});

	it("spins at the drag's turning rate, and stops where the pointer would have fallen below the mind map's stopping speed", () => {
		const coast = launchSpin({ x: 2, y: 0 }, { x: -0.01, y: 0.002 }, NONE, 0);
		expect(coast?.velocity).toEqual({ x: -0.01, y: 0.002 });
		// 0.01 rad/ms per 2 px/ms, times 0.05 px/ms.
		expect(coast?.stopBelow).toBeCloseTo((PAN_MIN_VELOCITY * Math.hypot(0.01, 0.002)) / 2, 12);
	});

	it("adds what is left of a spin it stopped when the flick goes the same way, and not when it goes back", () => {
		const held = 100;
		const kept = 0.01 * Math.exp(-SPIN_FRICTION * held);
		expect(launchSpin({ x: 1, y: 0 }, { x: 0.01, y: 0 }, { x: 0.01, y: 0 }, held)?.velocity.x).toBeCloseTo(0.01 + kept, 12);
		expect(launchSpin({ x: -1, y: 0 }, { x: -0.01, y: 0 }, { x: 0.01, y: 0 }, held)?.velocity.x).toBeCloseTo(-0.01, 12);
	});

	it("never runs away", () => {
		expect(launchSpin({ x: 5, y: 0 }, { x: 1, y: -1 }, NONE, 0)?.velocity).toEqual({ x: SPIN_MAX_VELOCITY, y: -SPIN_MAX_VELOCITY });
	});
});

describe("stepCoast", () => {
	it("slows every frame and stops", () => {
		const { speeds } = run({ velocity: { x: 3, y: -1 }, stopBelow: PAN_MIN_VELOCITY }, PAN_FRICTION, 60);
		for (let i = 1; i < speeds.length; i++) expect(speeds[i]!).toBeLessThan(speeds[i - 1]!);
		expect(speeds[speeds.length - 1]!).toBeLessThan(PAN_MIN_VELOCITY);
	});

	it("covers the same ground at 30 and 120 frames a second", () => {
		const slow = run({ velocity: { x: 0.02, y: 0.005 }, stopBelow: 0.0001 }, SPIN_FRICTION, 30);
		const fast = run({ velocity: { x: 0.02, y: 0.005 }, stopBelow: 0.0001 }, SPIN_FRICTION, 120);
		// The total is the integral to the stopping speed; frames only decide where the last one falls.
		expect(slow.x).toBeCloseTo(fast.x, 2);
		expect(slow.y).toBeCloseTo(fast.y, 2);
		expect(Math.abs(slow.ms - fast.ms)).toBeLessThanOrEqual(1000 / 30);
	});

	it("travels velocity / friction in all", () => {
		const { x } = run({ velocity: { x: 2, y: 0 }, stopBelow: 1e-9 }, PAN_FRICTION, 60);
		expect(x).toBeCloseTo(2 / PAN_FRICTION, 0);
	});
});

describe("the wheel's zoom glide (easeLook in ln-zoom units)", () => {
	/** Ease `pending` at `fps` to the end; the total applied and the frame steps. */
	function glide(pending: number, fps: number): { total: number; steps: number[] } {
		const steps: number[] = [];
		let left = pending;
		let total = 0;
		while (left !== 0 && steps.length < 10000) {
			const { step, remaining } = easeLook(left, 1 / fps, WHEEL_EASE_SECONDS, WHEEL_EASE_EPSILON);
			steps.push(step);
			total += step;
			left = remaining;
		}
		return { total, steps };
	}

	it("applies exactly the zoom the wheel asked for, decelerating to a stop", () => {
		const notch = -Math.log(0.95);
		const { total, steps } = glide(3 * notch, 60);
		expect(total).toBeCloseTo(3 * notch, 12);
		for (let i = 2; i < steps.length - 1; i++) expect(steps[i]!).toBeLessThan(steps[i - 1]!);
	});

	it("is frame-rate independent: as far along after the same time at 30 and 120 fps", () => {
		const after = (fps: number, seconds: number): number => {
			let left = 1;
			for (let i = 0; i < Math.round(seconds * fps); i++) left = easeLook(left, 1 / fps, WHEEL_EASE_SECONDS, WHEEL_EASE_EPSILON).remaining;
			return left;
		};
		expect(after(30, 0.2)).toBeCloseTo(after(120, 0.2), 9);
	});
});
