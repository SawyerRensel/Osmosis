import { describe, it, expect } from "vitest";
import type { Vec3 } from "./flight";
import { angleBetween, atPose, blendPose, forwardOf, hoverFlightPose, lookRotation, restingUp, rideBlend, slerp, startHover, upOf, type CameraState, type Quat } from "./hover";
import { hoverPose, tangentFrame } from "./planets";

const DURATION = 1000;
const FRAME_MS = 1000 / 60;

function expectNear(actual: Vec3, expected: Vec3, digits = 6): void {
	expect(actual.x).toBeCloseTo(expected.x, digits);
	expect(actual.y).toBeCloseTo(expected.y, digits);
	expect(actual.z).toBeCloseTo(expected.z, digits);
}

const normalize = (v: Vec3): Vec3 => {
	const n = Math.hypot(v.x, v.y, v.z);
	return { x: v.x / n, y: v.y / n, z: v.z / n };
};
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

/** The orientation the camera ends up with once OrbitControls aims it: looking at the target, with `up`. */
const orientationOf = (pose: CameraState): Quat => lookRotation(sub(pose.target, pose.position), pose.up);

/** A camera looking at `target` from `position` with world +y up, as the scene's camera is at rest. */
function camera(position: Vec3, target: Vec3): CameraState & { orientation: Quat } {
	const up = { x: 0, y: 1, z: 0 };
	return { position, target, up, orientation: lookRotation(sub(target, position), up) };
}

/** Every frame of a flight from `from` to `end`, at 60 fps. */
function frames(from: ReturnType<typeof camera>, end: CameraState): CameraState[] {
	const flight = startHover(from.position, from.target, from.orientation, 0, DURATION);
	const out: CameraState[] = [];
	for (let now = 0; now <= DURATION + FRAME_MS; now += FRAME_MS) out.push(hoverFlightPose(flight, end, now));
	return out;
}

/** The largest turn between two frames, and the turn over the last few frames. */
function steps(poses: CameraState[]): number[] {
	const out: number[] = [];
	for (let i = 1; i < poses.length; i++) out.push(angleBetween(orientationOf(poses[i - 1]!), orientationOf(poses[i]!)));
	return out;
}

const plate = { x: 300, y: 40, z: -20 };
const normal = normalize({ x: 0.6, y: 0.3, z: 0.74 });
const hover = hoverPose(plate, tangentFrame(normal), 70);

describe("lookRotation", () => {
	it("looks along the forward vector with the up at the top of the screen", () => {
		const forward = normalize({ x: 1, y: -2, z: 0.5 });
		const q = lookRotation(forward, { x: 0, y: 1, z: 0 });
		expectNear(forwardOf(q), forward);
		// The up is world +y made square to the view.
		const up = upOf(q);
		expect(dot(up, forward)).toBeCloseTo(0, 9);
		expect(up.y).toBeGreaterThan(0);
	});

	it("still gives an orientation looking straight along the up", () => {
		const q = lookRotation({ x: 0, y: -1, z: 0 }, { x: 0, y: 1, z: 0 });
		expectNear(forwardOf(q), { x: 0, y: -1, z: 0 });
		expect(dot(upOf(q), { x: 0, y: -1, z: 0 })).toBeCloseTo(0, 9);
	});
});

describe("hoverFlightPose", () => {
	const from = camera({ x: -400, y: 200, z: 900 }, { x: 0, y: 0, z: 0 });

	it("starts on the camera exactly as it is", () => {
		const first = frames(from, hover)[0]!;
		expectNear(first.position, from.position);
		expectNear(first.target, from.target);
		expectNear(first.up, upOf(from.orientation));
	});

	it("ends exactly in the hover pose: on the plate's normal, looking down at it, its up at the top", () => {
		const last = frames(from, hover).at(-1)!;
		expectNear(last.position, { x: plate.x + normal.x * 70, y: plate.y + normal.y * 70, z: plate.z + normal.z * 70 });
		expectNear(last.target, plate);
		expectNear(last.up, tangentFrame(normal).up);
		expect(hoverFlightPose(startHover(from.position, from.target, from.orientation, 0, DURATION), hover, DURATION).done).toBe(true);
	});

	it("turns in no frame by more than the eased share of the whole turn, and comes to rest", () => {
		const poses = frames(from, hover);
		const turn = angleBetween(from.orientation, orientationOf(hover));
		const perFrame = steps(poses);
		// Ease-out: the fastest frame is the first, at twice the average rate.
		for (const step of perFrame) expect(step).toBeLessThanOrEqual(((2 * turn) / 60) * 1.05 + 1e-9);
		// The last frames barely turn: no snap on arrival.
		for (const step of perFrame.slice(-4)) expect(step).toBeLessThan(Math.max(...perFrame) / 10);
	});

	// The bug: the old glide blended the camera and its orbit target in a
	// straight line, so its look direction was a blend of the start and end
	// look vectors. From 10 times the hover distance, half the turn came only
	// at 91% of the way. Slerping spreads it evenly over the eased time.
	it("spreads the turn over the flight, not into its last moments", () => {
		const flight = startHover(from.position, from.target, from.orientation, 0, DURATION);
		const turn = angleBetween(from.orientation, orientationOf(hover));
		// Half the eased way (t·(2 − t) = 0.5) is 29% of the time.
		const half = hoverFlightPose(flight, hover, (1 - Math.SQRT1_2) * DURATION);
		expect(angleBetween(from.orientation, orientationOf(half))).toBeCloseTo(turn / 2, 6);
	});

	it("keeps the up continuous, without a flip, when the two ups are nearly opposite", () => {
		// Above a pole: start looking down with +z at the top, end looking down with nearly −z at the top.
		const start = { position: { x: 0, y: 200, z: 0 }, target: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 } };
		const begin = { ...start, orientation: lookRotation({ x: 0, y: -1, z: 0 }, start.up) };
		const end = { position: { x: 0, y: 70, z: 0 }, target: { x: 0, y: 0, z: 0 }, up: normalize({ x: 0.02, y: 0, z: -1 }) };
		const poses = frames(begin, end);
		for (let i = 1; i < poses.length; i++) {
			// No more than the fastest share of a half turn in a frame.
			expect(dot(normalize(poses[i - 1]!.up), normalize(poses[i]!.up))).toBeGreaterThan(Math.cos(((2 * Math.PI) / 60) * 1.05));
		}
		expectNear(poses.at(-1)!.up, end.up);
	});

	it("tracks a plate that moves while it flies", () => {
		const flight = startHover(from.position, from.target, from.orientation, 0, DURATION);
		const moved = hoverPose({ x: plate.x + 30, y: plate.y, z: plate.z }, tangentFrame(normal), 70);
		expectNear(hoverFlightPose(flight, moved, DURATION).target, { x: plate.x + 30, y: plate.y, z: plate.z });
	});
});

describe("slerp", () => {
	it("takes the short way round", () => {
		const a = lookRotation({ x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 });
		const b = lookRotation({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
		const negated = { x: -b.x, y: -b.y, z: -b.z, w: -b.w };
		expect(angleBetween(a, slerp(a, negated, 0.5))).toBeCloseTo(Math.PI / 4, 9);
	});
});

describe("blendPose and rideBlend", () => {
	it("rides the arc alone for the first half, then blends in, eased to rest", () => {
		expect(rideBlend(0)).toBe(0);
		expect(rideBlend(0.5)).toBe(0);
		expect(rideBlend(0.75)).toBeCloseTo(0.5, 9);
		expect(rideBlend(1)).toBe(1);
		expect(rideBlend(1) - rideBlend(0.99)).toBeLessThan(0.002);
	});

	it("lands a lane ride in the hover pose without a turn in its last frames", () => {
		// A ride along a straight lane toward the plate, slowing to rest standOff short of it.
		const lane = normalize({ x: -1, y: 0.2, z: 0.1 });
		const ridePose = (t: number): CameraState => {
			const along = 70 + 600 * (1 - t * t * (3 - 2 * t));
			const position = { x: plate.x - lane.x * along, y: plate.y - lane.y * along, z: plate.z - lane.z * along };
			return { position, target: plate, up: { x: 0, y: 1, z: 0 } };
		};
		const poses: CameraState[] = [];
		for (let i = 0; i <= 120; i++) poses.push(blendPose(ridePose(i / 120), hover, rideBlend(i / 120)));
		expectNear(poses.at(-1)!.position, hover.position);
		expectNear(poses.at(-1)!.target, hover.target);
		expectNear(poses.at(-1)!.up, hover.up);
		const perFrame = steps(poses);
		const turn = angleBetween(orientationOf(ridePose(1)), orientationOf(hover));
		// The blend's fastest frame is 1.5 times the average over its 60 frames.
		for (const step of perFrame) expect(step).toBeLessThanOrEqual(((1.5 * turn) / 60) * 1.05 + 1e-9);
		// Eased in and out, the turn slows to nothing: the last two frames turn under a fifth of the fastest.
		for (const step of perFrame.slice(-2)) expect(step).toBeLessThan(Math.max(...perFrame) / 5);
		// The first half is the ride itself.
		expectNear(poses[30]!.position, ridePose(0.25).position);
	});
});

describe("restingUp", () => {
	it("is world +y wherever that shows the same view", () => {
		const frame = tangentFrame(normal);
		expectNear(restingUp({ x: -normal.x, y: -normal.y, z: -normal.z }, frame.up), { x: 0, y: 1, z: 0 });
	});

	it("keeps a pole cap plate's own up, which world +y cannot show", () => {
		const capNormal = normalize({ x: 0.01, y: 1, z: 0.01 });
		const frame = tangentFrame(capNormal);
		expectNear(restingUp({ x: -capNormal.x, y: -capNormal.y, z: -capNormal.z }, frame.up), frame.up);
	});
});

describe("atPose", () => {
	it("is true for a camera already in the pose, whatever up vector it holds", () => {
		// A lane ride lands in the hover pose and rests with world +y as up: the same view.
		const resting = lookRotation(sub(hover.target, hover.position), { x: 0, y: 1, z: 0 });
		expect(atPose(hover.position, resting, hover)).toBe(true);
	});

	it("is false for a camera elsewhere, or turned", () => {
		const turned = lookRotation({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
		expect(atPose(hover.position, turned, hover)).toBe(false);
		expect(atPose({ x: 0, y: 0, z: 0 }, lookRotation(sub(hover.target, hover.position), hover.up), hover)).toBe(false);
	});
});
