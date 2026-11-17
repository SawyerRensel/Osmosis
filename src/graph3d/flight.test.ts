import { describe, it, expect } from "vitest";
import { flightPose, glideEnd, glidePose, shiftGlide, startFlight, startTrip, tripDuration, tripEnd, tripPose, viewingDistance, TRIP_MAX_MS, TRIP_MIN_MS, type Vec3 } from "./flight";

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

describe("viewingDistance", () => {
	const camera = { x: 0, y: 0, z: 300 };
	const target = { x: 0, y: 0, z: 0 };

	it("is how far ahead the focused node is, not the orbit target a zoom re-seated past it", () => {
		expect(viewingDistance(camera, target, { x: 0, y: 0, z: 255 }, null, 10)).toBeCloseTo(45, 9);
	});

	it("measures along the view, so an off-centre node counts by its depth", () => {
		expect(viewingDistance(camera, target, { x: 30, y: -20, z: 200 }, null, 10)).toBeCloseTo(100, 9);
	});

	it("falls back to the orbit target with no focused node, or one behind the camera or nearer than the minimum", () => {
		expect(viewingDistance(camera, target, null, null, 10)).toBeCloseTo(300, 9);
		expect(viewingDistance(camera, target, { x: 0, y: 0, z: 400 }, null, 10)).toBeCloseTo(300, 9);
		expect(viewingDistance(camera, target, { x: 0, y: 0, z: 295 }, null, 10)).toBeCloseTo(300, 9);
	});

	it("is the end distance of a move under way, so quick presses don't drift", () => {
		expect(viewingDistance(camera, target, { x: 0, y: 0, z: 255 }, 70, 10)).toBe(70);
	});
});

describe("keeping the viewing distance", () => {
	// The user zoomed in to 45 from the focused node, with the orbit target re-seated 300 ahead.
	const camera = { x: 0, y: 0, z: 300 };
	const target = { x: 0, y: 0, z: 0 };
	const focused = { x: 0, y: 0, z: 255 };
	const apart = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

	it("an arrow key's glide, to a node in the same note or another, ends at that distance, looking the same way", () => {
		const distance = viewingDistance(camera, target, focused, null, 10);
		for (const node of [{ x: 40, y: 10, z: 250 }, { x: -500, y: 200, z: -900 }]) {
			const end = glideEnd(camera, target, node, distance);
			expect(apart(end.position, node)).toBeCloseTo(45, 9);
			expectNear(end.target, node);
			expectNear({ x: end.target.x - end.position.x, y: end.target.y - end.position.y, z: end.target.z - end.position.z }, { x: 0, y: 0, z: -45 });
		}
	});

	it("an edge ride ends at that distance from its far end", () => {
		const [from, to] = [focused, { x: 200, y: 0, z: 255 }];
		const trip = startTrip(camera, target, from, to, viewingDistance(camera, target, focused, null, 10), 0, 1);
		const pose = tripPose(trip, from, to, trip.duration);
		expect(apart(pose.position, to)).toBeCloseTo(45, 9);
		expectNear(pose.target, to);
	});
});

describe("tripDuration", () => {
	it("is slow, scaled by distance, and clamped to 1.5-4 s at the default speed", () => {
		expect(tripDuration(0, 1)).toBe(TRIP_MIN_MS);
		expect(tripDuration(100, 1)).toBeGreaterThan(TRIP_MIN_MS);
		expect(tripDuration(100, 1)).toBeLessThan(TRIP_MAX_MS);
		expect(tripDuration(100000, 1)).toBe(TRIP_MAX_MS);
	});

	it("divides by the travel speed", () => {
		expect(tripDuration(100, 2)).toBeCloseTo(tripDuration(100, 1) / 2, 6);
		expect(tripDuration(100, 0.25)).toBeCloseTo(tripDuration(100, 1) * 4, 6);
	});
});

describe("trip", () => {
	const from = { x: 0, y: 0, z: 0 };
	const to = { x: 200, y: 0, z: 0 };
	const camera = { x: -20, y: 50, z: 60 };
	const target = { x: 0, y: 0, z: 0 };

	it("ends on the edge's line, the stand-off short of the far end, looking at it", () => {
		const trip = startTrip(camera, target, from, to, 70, 0, 1);
		const pose = tripPose(trip, from, to, trip.duration);
		expectNear(pose.position, { x: 130, y: 0, z: 0 });
		expectNear(pose.target, to);
		expectNear(tripEnd(from, to, 70), { x: 130, y: 0, z: 0 });
		expect(pose.done).toBe(true);
	});

	it("starts where the camera was", () => {
		const trip = startTrip(camera, target, from, to, 70, 0, 1);
		const pose = tripPose(trip, from, to, 0);
		expectNear(pose.position, camera);
		expectNear(pose.target, target);
		expect(pose.done).toBe(false);
	});

	it("rides along the line: off it at the start, on it from 60% of the way", () => {
		const trip = startTrip(camera, target, from, to, 70, 0, 1);
		const early = tripPose(trip, from, to, trip.duration * 0.2).position;
		const late = tripPose(trip, from, to, trip.duration * 0.7).position;
		expect(Math.hypot(early.y, early.z)).toBeGreaterThan(1);
		expect(Math.hypot(late.y, late.z)).toBeCloseTo(0, 6);
	});

	it("moves forward along the edge and never overshoots", () => {
		const trip = startTrip(camera, target, from, to, 70, 0, 1);
		let last = -Infinity;
		for (let i = 0; i <= 20; i++) {
			const x = tripPose(trip, from, to, (trip.duration * i) / 20).position.x;
			expect(x).toBeGreaterThanOrEqual(last);
			expect(x).toBeLessThanOrEqual(130 + 1e-9);
			last = x;
		}
	});

	it("eases in and out: slow at both ends", () => {
		const trip = startTrip(camera, target, from, to, 70, 0, 1);
		const step = (a: number, b: number): number => Math.abs(tripPose(trip, from, to, trip.duration * b).position.x - tripPose(trip, from, to, trip.duration * a).position.x);
		expect(step(0, 0.1)).toBeLessThan(step(0.45, 0.55));
		expect(step(0.9, 1)).toBeLessThan(step(0.45, 0.55));
	});

	it("lands on where the ends are now, if they moved during the ride", () => {
		const trip = startTrip(camera, target, from, to, 70, 0, 1);
		const movedFrom = { x: 0, y: 40, z: 0 };
		const movedTo = { x: 0, y: 40, z: 300 };
		const pose = tripPose(trip, movedFrom, movedTo, trip.duration);
		expectNear(pose.target, movedTo);
		expectNear(pose.position, { x: 0, y: 40, z: 230 });
	});

	it("looks ahead of the camera along the edge once under way", () => {
		const trip = startTrip(camera, target, from, to, 70, 0, 1);
		const pose = tripPose(trip, from, to, trip.duration * 0.8);
		expect(pose.target.x - pose.position.x).toBeCloseTo(70, 6);
		expect(pose.target.y).toBeCloseTo(0, 6);
	});

	it("takes longer for a farther camera, and scales with speed", () => {
		const near = startTrip({ x: 100, y: 0, z: 0 }, target, from, to, 70, 0, 1);
		const far = startTrip({ x: -400, y: 0, z: 0 }, target, from, to, 70, 0, 1);
		expect(far.duration).toBeGreaterThan(near.duration);
		expect(startTrip(camera, target, from, to, 70, 0, 4).duration).toBeCloseTo(startTrip(camera, target, from, to, 70, 0, 1).duration / 4, 6);
	});

	it("copes with an edge of no length", () => {
		const trip = startTrip(camera, target, from, from, 70, 0, 1);
		const pose = tripPose(trip, from, from, trip.duration);
		expectNear(pose.target, from);
		expect(Number.isFinite(pose.position.x)).toBe(true);
	});
});

describe("shiftGlide", () => {
	it("moves both ends with the node, so the pose at any moment keeps its offset", () => {
		const glide = { from: { position: { x: 0, y: 0, z: 100 }, target: { x: 0, y: 0, z: 0 } }, to: { position: { x: 10, y: 0, z: 100 }, target: { x: 10, y: 0, z: 0 } }, start: 0 };
		const move = { x: 3, y: -4, z: 5 };
		const shifted = shiftGlide(glide, move);
		expect(shifted.start).toBe(0);
		const [a, b] = [glidePose(glide, 100, DURATION), glidePose(shifted, 100, DURATION)];
		expect(b.position.x - a.position.x).toBeCloseTo(3);
		expect(b.position.y - a.position.y).toBeCloseTo(-4);
		expect(b.target.z - a.target.z).toBeCloseTo(5);
	});
});
