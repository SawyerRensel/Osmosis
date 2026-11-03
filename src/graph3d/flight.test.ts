import { describe, it, expect } from "vitest";
import { flightPose, glidePose, startFlight, type Vec3 } from "./flight";

const DURATION = 1000;

function expectNear(actual: Vec3, expected: Vec3): void {
	expect(actual.x).toBeCloseTo(expected.x, 6);
	expect(actual.y).toBeCloseTo(expected.y, 6);
	expect(actual.z).toBeCloseTo(expected.z, 6);
}

describe("startFlight", () => {
	it("keeps the viewing direction and stands the given distance from the node", () => {
		const flight = startFlight({ x: 0, y: 0, z: 100 }, { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 50, 0);
		expectNear(flight.offset, { x: -10 / Math.hypot(10, 100) * 50, y: 0, z: (100 / Math.hypot(10, 100)) * 50 });
	});

	it("looks along +z when the camera is already at the node", () => {
		const flight = startFlight({ x: 5, y: 5, z: 5 }, { x: 0, y: 0, z: 0 }, { x: 5, y: 5, z: 5 }, 70, 0);
		expectNear(flight.offset, { x: 0, y: 0, z: 70 });
	});
});

describe("flightPose", () => {
	const camera = { x: 0, y: 0, z: 200 };
	const target = { x: 0, y: 0, z: 0 };

	it("starts where the camera was", () => {
		const flight = startFlight(camera, target, { x: 100, y: 0, z: 0 }, 70, 0);
		const pose = flightPose(flight, { x: 100, y: 0, z: 0 }, 0, DURATION);
		expectNear(pose.position, camera);
		expectNear(pose.target, target);
		expect(pose.done).toBe(false);
	});

	// The bug: a hop to another note re-heats the layout, and the clicked
	// node moves after the flight began. The flight must land on where the
	// node is now, not on where it was when clicked.
	it("lands on the node where it is now, not where it was when the flight began", () => {
		const flight = startFlight(camera, target, { x: 100, y: 0, z: 0 }, 70, 0);
		const moved = { x: 40, y: -60, z: 25 };
		const pose = flightPose(flight, moved, DURATION, DURATION);
		expectNear(pose.target, moved);
		expectNear(pose.position, { x: moved.x + flight.offset.x, y: moved.y + flight.offset.y, z: moved.z + flight.offset.z });
		expect(pose.done).toBe(true);
	});

	it("faces the node by a third of the way, wherever it has gone", () => {
		const flight = startFlight(camera, target, { x: 100, y: 0, z: 0 }, 70, 0);
		const moved = { x: -30, y: 10, z: 0 };
		expectNear(flightPose(flight, moved, DURATION / 3, DURATION).target, moved);
		expectNear(flightPose(flight, moved, DURATION / 2, DURATION).target, moved);
	});

	it("eases out: more than half way at half time", () => {
		const node = { x: 100, y: 0, z: 0 };
		const flight = startFlight(camera, target, node, 70, 0);
		const end = node.x + flight.offset.x;
		const half = flightPose(flight, node, DURATION / 2, DURATION).position.x;
		expect(half).toBeGreaterThan(end / 2);
		expect(half).toBeLessThan(end);
	});
});

describe("glidePose", () => {
	const glide = { from: { position: { x: 0, y: 0, z: 100 }, target: { x: 0, y: 0, z: 0 } }, to: { position: { x: 10, y: 0, z: 100 }, target: { x: 10, y: 0, z: 0 } }, start: 0 };

	it("starts at the first pose and ends at the second", () => {
		expectNear(glidePose(glide, 0, DURATION).position, glide.from.position);
		const end = glidePose(glide, DURATION, DURATION);
		expectNear(end.position, glide.to.position);
		expectNear(end.target, glide.to.target);
		expect(end.done).toBe(true);
	});

	it("eases out: more than half way at half time", () => {
		const half = glidePose(glide, DURATION / 2, DURATION);
		expect(half.position.x).toBeCloseTo(7.5, 9);
		expect(half.done).toBe(false);
	});
});
