import { describe, it, expect } from "vitest";
import type { Vec3 } from "./flight";
import { tangentFrame, type TangentFrame } from "./planets";
import { uprightFrame, uprightSpin, type ViewBasis } from "./upright";

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const unit = (a: Vec3): Vec3 => {
	const l = Math.hypot(a.x, a.y, a.z);
	return { x: a.x / l, y: a.y / l, z: a.z / l };
};

/** A camera at `eye` looking at `target`, rolled by `roll` radians from `worldUp`. */
function look(eye: Vec3, target: Vec3, worldUp: Vec3 = { x: 0, y: 1, z: 0 }, roll = 0): ViewBasis {
	const back = unit(sub(eye, target));
	const right0 = unit(cross(worldUp, back));
	const up0 = cross(back, right0);
	const [c, s] = [Math.cos(roll), Math.sin(roll)];
	const right = { x: c * right0.x + s * up0.x, y: c * right0.y + s * up0.y, z: c * right0.z + s * up0.z };
	return { eye, right, up: cross(back, right), back };
}

/** Where a world point lands on screen (x right, y up), for a camera of focal length 1. */
function screen(p: Vec3, view: ViewBasis): { x: number; y: number } {
	const d = sub(p, view.eye);
	const depth = -dot(d, view.back);
	return { x: dot(d, view.right) / depth, y: dot(d, view.up) / depth };
}

/** The angle a plate's text-up makes with screen-up, radians (0 = upright). */
function screenLean(centre: Vec3, frame: TangentFrame, view: ViewBasis): number {
	const a = screen(centre, view);
	const b = screen({ x: centre.x + frame.up.x * 1e-3, y: centre.y + frame.up.y * 1e-3, z: centre.z + frame.up.z * 1e-3 }, view);
	return Math.atan2(b.x - a.x, b.y - a.y);
}

const expectFrame = (frame: TangentFrame, normal: Vec3): void => {
	expect(Math.hypot(frame.right.x, frame.right.y, frame.right.z)).toBeCloseTo(1, 9);
	expect(Math.hypot(frame.up.x, frame.up.y, frame.up.z)).toBeCloseTo(1, 9);
	expect(dot(frame.right, frame.up)).toBeCloseTo(0, 9);
	const n = cross(frame.right, frame.up);
	expect(n.x).toBeCloseTo(normal.x, 9);
	expect(n.y).toBeCloseTo(normal.y, 9);
	expect(n.z).toBeCloseTo(normal.z, 9);
};

describe("uprightFrame", () => {
	const origin = { x: 0, y: 0, z: 0 };

	it("turns a face-on plate to the camera's own right and up, however the camera rolls", () => {
		const frame = tangentFrame({ x: 0, y: 0, z: 1 });
		for (const roll of [0, 0.4, 1.6, Math.PI, -2.5]) {
			const view = look({ x: 0, y: 0, z: 30 }, origin, { x: 0, y: 1, z: 0 }, roll);
			const spun = uprightFrame(frame, origin, view);
			expectFrame(spun, frame.normal);
			expect(dot(spun.up, view.up)).toBeCloseTo(1, 9);
			expect(dot(spun.right, view.right)).toBeCloseTo(1, 9);
		}
	});

	it("keeps the normal and the plate's centre, and only turns it in its plane", () => {
		const frame = tangentFrame(unit({ x: 0.3, y: 0.8, z: 0.5 }));
		const centre = { x: 3, y: 8, z: 5 };
		const spun = uprightFrame(frame, centre, look({ x: -20, y: 30, z: 40 }, origin, { x: 0, y: 1, z: 0 }, 0.7));
		expectFrame(spun, frame.normal);
		expect(spun.normal).toBe(frame.normal);
	});

	it("reads upright on screen wherever a front-facing plate sits on a globe", () => {
		const radius = 20;
		for (let k = 0; k < 40; k++) {
			// Plates spread over the hemisphere facing the camera, the camera rolled about its view.
			const normal = unit({ x: Math.cos(k * 2.4) * 0.8, y: Math.sin(k * 2.4) * 0.8, z: 0.4 + (k % 5) * 0.12 });
			const centre = { x: normal.x * radius, y: normal.y * radius, z: normal.z * radius };
			const view = look({ x: 0, y: 0, z: 90 }, origin, { x: 0, y: 1, z: 0 }, (k % 7) * 0.9);
			const spun = uprightFrame(tangentFrame(normal), centre, view);
			// Toward the limb (here up to ~66° from facing the camera) a flat plate can't stand fully upright: it leans, never far.
			expect(Math.abs(screenLean(centre, spun, view))).toBeLessThan(0.7);
		}
		// Facing the camera head on, it is exactly upright.
		const spun = uprightFrame(tangentFrame({ x: 0, y: 0, z: 1 }), { x: 0, y: 0, z: radius }, look({ x: 0, y: 0, z: 90 }, origin, { x: 0, y: 1, z: 0 }, 2));
		expect(screenLean({ x: 0, y: 0, z: radius }, spun, look({ x: 0, y: 0, z: 90 }, origin, { x: 0, y: 1, z: 0 }, 2))).toBeCloseTo(0, 6);
	});

	it("turns smoothly as the camera passes straight over a plate, and edge-on with screen-up along its normal", () => {
		// A plate at the pole (normal +y), the camera orbiting over it from one horizon to the other: its own up never jumps.
		const frame = tangentFrame({ x: 0, y: 1, z: 0 });
		const centre = { x: 0, y: 12, z: 0 };
		let last: Vec3 | null = null;
		for (let deg = 2; deg <= 178; deg += 0.5) {
			const a = (deg * Math.PI) / 180;
			const eye = { x: 0, y: 12 + 40 * Math.sin(a), z: 40 * Math.cos(a) };
			const back = unit(sub(eye, centre));
			const right = { x: 1, y: 0, z: 0 };
			const view: ViewBasis = { eye, right, up: cross(back, right), back };
			const spun = uprightFrame(frame, centre, view);
			expect(Number.isFinite(spun.up.x + spun.up.y + spun.up.z)).toBe(true);
			if (last !== null) expect(dot(spun.up, last)).toBeGreaterThan(Math.cos(0.05));
			last = spun.up;
		}
		// Edge-on, the camera's up along the plate's normal: a whole, unit frame, the same as a hair to the front side.
		const edgeOn = (lift: number): TangentFrame => {
			const eye = { x: 0, y: 12 + lift, z: 40 };
			const back = unit(sub(eye, centre));
			const right = { x: 1, y: 0, z: 0 };
			return uprightFrame(frame, centre, { eye, right, up: cross(back, right), back });
		};
		expectFrame(edgeOn(0), frame.normal);
		expect(dot(edgeOn(0).up, edgeOn(0.01).up)).toBeCloseTo(1, 4);
	});

	it("gives a whole frame for a plate seen from behind", () => {
		const frame = tangentFrame({ x: 0, y: 0, z: 1 });
		for (const roll of [0, 1, 2.5]) {
			const spun = uprightFrame(frame, { x: 0, y: 0, z: 0 }, look({ x: 0, y: 0, z: -30 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, roll));
			expectFrame(spun, frame.normal);
		}
		// A camera at the plate's centre has no screen to fit: no spin.
		expect(uprightSpin({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toEqual({ cos: 1, sin: 0 });
	});
});
