import { describe, it, expect } from "vitest";
import { inView, panOnto, plateInset, project, seedBeside, turnToSee, type CameraPose } from "./framing";
import type { Vec3 } from "./flight";

/** A camera at z = 100 looking at the origin, y up, 60° tall, twice as wide as tall. */
const pose: CameraPose = { position: { x: 0, y: 0, z: 100 }, target: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, fov: 60, aspect: 2 };
const tan30 = Math.tan(Math.PI / 6);
const none = { x: 0, y: 0 };

const distance = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

describe("project", () => {
	it("puts the target at the centre, at its distance", () => {
		expect(project(pose, { x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 0, depth: 100 });
	});

	it("puts a point at the edge of the view at ±1", () => {
		const top = project(pose, { x: 0, y: 100 * tan30, z: 0 });
		expect(top.y).toBeCloseTo(1, 9);
		const right = project(pose, { x: 200 * tan30, y: 0, z: 0 });
		expect(right.x).toBeCloseTo(1, 9);
	});

	it("gives a point behind the camera a negative depth", () => {
		expect(project(pose, { x: 0, y: 0, z: 150 }).depth).toBeLessThan(0);
	});
});

describe("inView", () => {
	it("needs the point in front and inside the inset view", () => {
		expect(inView({ x: 0.5, y: -0.5, depth: 10 }, none)).toBe(true);
		expect(inView({ x: 0.5, y: 0, depth: 10 }, { x: 0.6, y: 0 })).toBe(false);
		expect(inView({ x: 0, y: 0, depth: -10 }, none)).toBe(false);
	});
});

describe("plateInset", () => {
	it("keeps half the plate and the margin clear of each edge", () => {
		// 100 units away, 60° tall, 600 px tall: 300 / (100·tan 30°) px a unit.
		const pxPerUnit = 300 / (100 * tan30);
		const inset = plateInset({ x: 5, y: 1 }, 100, 20, { width: 1200, height: 600 }, 60);
		expect(inset.x).toBeCloseTo((5 * pxPerUnit + 20) / 600, 9);
		expect(inset.y).toBeCloseTo((1 * pxPerUnit + 20) / 300, 9);
	});

	it("never covers the whole view", () => {
		expect(plateInset({ x: 1000, y: 1000 }, 1, 20, { width: 800, height: 600 }, 60)).toEqual({ x: 0.8, y: 0.8 });
	});
});

describe("turnToSee", () => {
	it("leaves a node already in view alone", () => {
		expect(turnToSee(pose, { x: 10, y: 10, z: 0 }, { x: 0.1, y: 0.1 })).toBeNull();
	});

	it("turns just far enough to bring an off-screen node to the inset edge, without moving the camera or changing its reach", () => {
		const node = { x: 400, y: 0, z: 0 };
		const inset = { x: 0.2, y: 0.2 };
		const target = turnToSee(pose, node, inset)!;
		expect(distance(target, pose.position)).toBeCloseTo(100, 6);
		const seen = project({ ...pose, target }, node);
		expect(seen.x).toBeCloseTo(0.8, 4);
		expect(Math.abs(seen.y)).toBeLessThan(1e-6);
	});

	it("turns round to a node behind the camera", () => {
		const node = { x: 0, y: 0, z: 300 };
		const target = turnToSee(pose, node, { x: 0.1, y: 0.1 })!;
		expect(inView(project({ ...pose, target }, node), { x: 0.1, y: 0.1 })).toBe(true);
		expect(distance(target, pose.position)).toBeCloseTo(100, 6);
	});

	it("turns about both axes for a node off a corner", () => {
		const node = { x: 500, y: -300, z: 0 };
		const inset = { x: 0.1, y: 0.1 };
		const target = turnToSee(pose, node, inset)!;
		const seen = project({ ...pose, target }, node);
		expect(inView(seen, inset)).toBe(true);
		// Just inside: on the inset edge one way or the other.
		expect(Math.max(Math.abs(seen.x), Math.abs(seen.y))).toBeCloseTo(0.9, 4);
	});
});

describe("panOnto", () => {
	it("moves across the screen only, onto the node, keeping its depth", () => {
		const node = { x: 30, y: -40, z: 20 };
		const pan = panOnto(pose, node);
		expect(pan).toEqual({ x: 30, y: -40, z: 0 });
		const moved = { ...pose, position: { x: 30, y: -40, z: 100 }, target: { x: 30, y: -40, z: 0 } };
		const seen = project(moved, node);
		expect(seen.x).toBeCloseTo(0, 9);
		expect(seen.y).toBeCloseTo(0, 9);
		expect(seen.depth).toBeCloseTo(project(pose, node).depth, 9);
	});

	it("pans in the camera's own plane when it looks down at an angle", () => {
		const tilted: CameraPose = { ...pose, position: { x: 0, y: 100, z: 100 } };
		const node = { x: 25, y: 0, z: 0 };
		const pan = panOnto(tilted, node);
		const moved = { ...tilted, position: { x: pan.x, y: 100 + pan.y, z: 100 + pan.z }, target: pan };
		const seen = project(moved, node);
		expect(seen.x).toBeCloseTo(0, 9);
		expect(seen.y).toBeCloseTo(0, 9);
		expect(seen.depth).toBeCloseTo(project(tilted, node).depth, 9);
	});
});

describe("seedBeside", () => {
	const parent = { x: 0, y: 0, z: 0 };

	it("seeds to the screen right of the parent, at its depth, when the screen is empty", () => {
		expect(seedBeside(pose, parent, 30, [], none)).toEqual({ x: 30, y: 0, z: 0 });
	});

	it("stays in the plane of the screen when the camera looks at an angle", () => {
		const tilted: CameraPose = { ...pose, position: { x: 0, y: 100, z: 100 } };
		const at = seedBeside(tilted, parent, 30, [], none);
		expect(distance(at, parent)).toBeCloseTo(30, 9);
		expect(project(tilted, at).depth).toBeCloseTo(project(tilted, parent).depth, 9);
	});

	it("takes the next direction (below right) when a node sits on the right-hand spot", () => {
		const at = seedBeside(pose, parent, 30, [{ x: 30, y: 0, z: 0 }], none);
		expect(at.x).toBeCloseTo(30 * Math.cos(Math.PI / 6), 9);
		expect(at.y).toBeCloseTo(-15, 9);
	});

	it("goes where the screen is free", () => {
		// Nodes all round the right half: the first spot clear of them is below left.
		const others = [-90, -60, -30, 0, 30, 60, 90].map((d) => ({ x: 30 * Math.cos((d * Math.PI) / 180), y: 30 * Math.sin((d * Math.PI) / 180), z: 0 }));
		const at = seedBeside(pose, parent, 30, others, none);
		expect(at.x).toBeLessThan(0);
	});

	it("counts a node in front of the spot, nearer the camera, as in the way", () => {
		const at = seedBeside(pose, parent, 30, [{ x: 15, y: 0, z: 50 }], none);
		expect(at.y).not.toBeCloseTo(0, 3);
	});

	it("prefers a spot on screen to a freer one off it", () => {
		// The parent near the right edge: right is off screen, so it goes another way.
		const edge = { x: 200 * tan30 - 5, y: 0, z: 0 };
		const at = seedBeside(pose, edge, 30, [], { x: 0.05, y: 0.05 });
		expect(inView(project(pose, at), { x: 0.05, y: 0.05 })).toBe(true);
	});
});
