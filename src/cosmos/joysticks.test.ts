import { describe, expect, it } from "vitest";
import { CENTRED, STICK_DEADZONE, STICK_LOOK_RATE, STICK_ROLES, flightAxes, stickDeflection, stickLook, stickMove } from "./joysticks";

describe("STICK_ROLES", () => {
	it("moves with the left stick and looks with the right, as Sawyer settled after trying it on a phone", () => {
		expect(STICK_ROLES).toEqual({ left: "move", right: "look" });
	});
});

describe("stickDeflection", () => {
	it("is nothing at the centre and inside the deadzone", () => {
		expect(stickDeflection(0, 0, 50)).toEqual(CENTRED);
		expect(stickDeflection(50 * STICK_DEADZONE, 0, 50)).toEqual(CENTRED);
		expect(stickDeflection(0, -50 * STICK_DEADZONE * 0.9, 50)).toEqual(CENTRED);
	});

	it("starts from zero just past the deadzone rather than jumping", () => {
		const d = stickDeflection(50 * STICK_DEADZONE + 0.01, 0, 50);
		expect(d.x).toBeGreaterThan(0);
		expect(d.x).toBeLessThan(1e-6);
	});

	it("is full deflection at the rim, and holds there past it", () => {
		expect(stickDeflection(50, 0, 50).x).toBeCloseTo(1, 9);
		const past = stickDeflection(0, -200, 50);
		expect(past.x).toBeCloseTo(0, 9);
		expect(past.y).toBeCloseTo(-1, 9);
	});

	it("keeps the push's direction and stays inside the unit circle", () => {
		const d = stickDeflection(30, 40, 50);
		expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 9);
		expect(d.y / d.x).toBeCloseTo(40 / 30, 9);
	});

	it("is fine near the centre: half the travel is a quarter of the rate", () => {
		const half = STICK_DEADZONE + (1 - STICK_DEADZONE) / 2;
		expect(stickDeflection(100 * half, 0, 100).x).toBeCloseTo(0.25, 9);
	});

	it("is nothing for a stick with no size", () => {
		expect(stickDeflection(10, 10, 0)).toEqual(CENTRED);
	});
});

describe("stickLook", () => {
	it("turns right for a push right and up for a push up, at the full rate at the rim", () => {
		expect(stickLook({ x: 1, y: 0 }, 0.5)).toEqual({ yaw: -STICK_LOOK_RATE * 0.5, pitch: -0 });
		expect(stickLook({ x: 0, y: -1 }, 1).pitch).toBeCloseTo(STICK_LOOK_RATE, 9);
	});

	it("does nothing when centred", () => {
		const turn = stickLook(CENTRED, 1);
		expect(Math.abs(turn.yaw) + Math.abs(turn.pitch)).toBe(0);
	});
});

describe("stickMove", () => {
	it("flies forward for a push up and strafes for a push sideways", () => {
		expect(stickMove({ x: 0, y: -1 })).toEqual([0, 0, 1]);
		expect(stickMove({ x: -0.5, y: 0 })).toEqual([-0.5, 0, -0]);
	});
});

describe("flightAxes", () => {
	it("normalises held keys to full speed, as the keys always did", () => {
		const axes = flightAxes([1, 0, 1], [0, 0, 0]);
		expect(axes[0]).toBeCloseTo(Math.SQRT1_2, 9);
		expect(axes[2]).toBeCloseTo(Math.SQRT1_2, 9);
	});

	it("keeps the stick's analog push below full speed", () => {
		expect(flightAxes([0, 0, 0], [0, 0, 0.3])).toEqual([0, 0, 0.3]);
	});

	it("holds keys and stick together to full speed", () => {
		const axes = flightAxes([0, 0, 1], [1, 0, 0]);
		expect(Math.hypot(...axes)).toBeCloseTo(1, 9);
		expect(axes[0]).toBeCloseTo(axes[2], 9);
	});

	it("is nothing with no keys and a centred stick", () => {
		expect(flightAxes([0, 0, 0], [0, 0, 0])).toEqual([0, 0, 0]);
	});
});
