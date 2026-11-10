import { describe, it, expect } from "vitest";
import { farEnd, pickEdge, type DrawnEdge, type EdgeView } from "./edgepick";
import { laneArc } from "./planets";

/** A camera at the origin looking down -z, 1 px per world unit at distance 1, screen centre (500, 500). */
const view: EdgeView = {
	depth: (p) => -p.z,
	screen: (p) => ({ x: 500 + p.x / -p.z * 100, y: 500 - p.y / -p.z * 100 }),
};

const horizontal = (z: number, y = 0, x0 = -2, x1 = 2): DrawnEdge => ({ points: [{ x: x0, y, z }, { x: x1, y, z }] });

describe("pickEdge", () => {
	it("finds the edge under the pointer", () => {
		// At depth 10 the edge spans x 480..520 on screen, y 500.
		expect(pickEdge([horizontal(-10)], view, 500, 500, 16, 1000)).toBe(0);
	});

	it("finds an edge within the slop and not beyond it", () => {
		const edges = [horizontal(-10)];
		expect(pickEdge(edges, view, 500, 515, 16, 1000)).toBe(0);
		expect(pickEdge(edges, view, 500, 520, 16, 1000)).toBe(-1);
	});

	it("measures to the segment's ends, not the infinite line", () => {
		const edges = [horizontal(-10)];
		expect(pickEdge(edges, view, 560, 500, 16, 1000)).toBe(-1);
		expect(pickEdge(edges, view, 530, 500, 16, 1000)).toBe(0);
	});

	it("takes the nearest edge, and the nearer to the camera on a tie", () => {
		const edges = [horizontal(-10, 0.3), horizontal(-10, 0.1)];
		expect(pickEdge(edges, view, 500, 500, 16, 1000)).toBe(1);
		const crossing = [horizontal(-20, 0, -4, 4), horizontal(-10)];
		expect(pickEdge(crossing, view, 500, 500, 16, 1000)).toBe(1);
	});

	it("skips an edge wholly behind the camera", () => {
		expect(pickEdge([horizontal(10)], view, 500, 500, 16, 1000)).toBe(-1);
	});

	it("clips an edge that passes through the camera plane to its visible part", () => {
		// From z = +10 (behind) to z = -10 (ahead), at x = 1: only the far half is on screen.
		const through: DrawnEdge = { points: [{ x: 1, y: 0, z: 10 }, { x: 1, y: 0, z: -10 }] };
		expect(pickEdge([through], view, 510, 500, 16, 1000)).toBe(0);
		expect(pickEdge([through], view, 400, 500, 16, 1000)).toBe(-1);
	});

	it("skips an edge lost in the mist, and picks its visible part when it runs into it", () => {
		expect(pickEdge([horizontal(-500)], view, 500, 500, 16, 100)).toBe(-1);
		const into: DrawnEdge = { points: [{ x: 0, y: 0, z: -50 }, { x: 0, y: 0, z: -500 }] };
		expect(pickEdge([into], view, 500, 500, 16, 100)).toBe(0);
	});

	it("handles an edge seen end-on", () => {
		const endOn: DrawnEdge = { points: [{ x: 0, y: 0, z: -10 }, { x: 0, y: 0, z: -20 }] };
		expect(pickEdge([endOn], view, 505, 500, 16, 1000)).toBe(0);
	});

	it("returns -1 for no edges", () => {
		expect(pickEdge([], view, 500, 500, 16, 1000)).toBe(-1);
	});
});

describe("pickEdge on a Planets lane", () => {
	// Two planets side by side at depth 50, centres 60 apart; each lane runs between plates on their tops, so it bows up.
	const lane = (top: number): DrawnEdge => ({
		points: laneArc({ x: -30, y: top, z: -50 }, { x: 30, y: top, z: -50 }, { x: -30, y: 0, z: -50 }, { x: 30, y: 0, z: -50 }, 12),
	});

	it("hits the lane's bowed middle", () => {
		// The bow is a quarter of the 60-unit span: the middle is at y 25, on screen y 450.
		expect(pickEdge([lane(10)], view, 500, 450, 16, 1000)).toBe(0);
	});

	it("misses the chord's midpoint, which is off the drawn arc", () => {
		// The straight line between the plates passes y 10, on screen y 480: 30 px from the arc.
		expect(pickEdge([lane(10)], view, 500, 480, 16, 1000)).toBe(-1);
	});

	it("takes the nearer of two lanes", () => {
		// Middles on screen at y 450 (plates at y 10) and y 442 (plates at y 14).
		const lanes = [lane(10), lane(14)];
		expect(pickEdge(lanes, view, 500, 444, 16, 1000)).toBe(1);
		expect(pickEdge(lanes, view, 500, 449, 16, 1000)).toBe(0);
	});
});

describe("farEnd", () => {
	const edge = { a: { x: 0, y: 0, z: 0 }, b: { x: 100, y: 0, z: 0 }, aId: "a", bId: "b" };

	it("is the end that isn't focused", () => {
		expect(farEnd(edge, "a", { x: 500, y: 0, z: 0 })).toBe("b");
		expect(farEnd(edge, "b", { x: -500, y: 0, z: 0 })).toBe("a");
	});

	it("with neither end focused, is the end farther from the camera", () => {
		expect(farEnd(edge, "other", { x: -50, y: 0, z: 0 })).toBe("b");
		expect(farEnd(edge, null, { x: 150, y: 0, z: 0 })).toBe("a");
	});
});
