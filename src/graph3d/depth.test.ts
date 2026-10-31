import { describe, it, expect } from "vitest";
import { MIN_DOLLY, dollyDistance, pickNode, wheelLogZoom, wheelNotches, type ScreenNode } from "./depth";

const node = (x: number, y: number, radius: number, distance: number): ScreenNode => ({ x, y, radius, distance });

describe("pickNode", () => {
	it("picks the node under the cursor", () => {
		expect(pickNode([node(0, 0, 5, 100), node(50, 0, 5, 100)], 51, 2, 10)).toBe(1);
	});

	it("picks a node the cursor narrowly missed", () => {
		// 12 px from the centre of a 4 px node: an 8 px gap.
		expect(pickNode([node(100, 100, 4, 300)], 112, 100, 10)).toBe(0);
	});

	it("misses when every node is further than the slop", () => {
		expect(pickNode([node(100, 100, 4, 300)], 120, 100, 10)).toBe(-1);
		expect(pickNode([], 0, 0, 10)).toBe(-1);
	});

	it("prefers the node whose edge is closest on screen", () => {
		// A big node 20 px away (edge 5 px off) beats a small one 8 px away (edge 6 px off).
		expect(pickNode([node(8, 0, 2, 100), node(-20, 0, 15, 400)], 0, 0, 10)).toBe(1);
	});

	it("picks a label plate anywhere on its rectangle", () => {
		const plate: ScreenNode = { ...node(100, 100, 2, 300), plate: { halfWidth: 60, halfHeight: 10 } };
		// 55 px right of centre: on the plate, though far outside its 2 px circle.
		expect(pickNode([plate], 155, 104, 0)).toBe(0);
		// 8 px below the plate's edge.
		expect(pickNode([plate], 100, 118, 6)).toBe(-1);
		expect(pickNode([plate], 100, 118, 10)).toBe(0);
	});

	it("prefers the nearer node when the cursor is on two", () => {
		expect(pickNode([node(0, 0, 10, 500), node(3, 0, 10, 200), node(-3, 0, 10, 900)], 0, 0, 10)).toBe(1);
	});
});

describe("dollyDistance", () => {
	it("moves the same fraction of the depth at any depth", () => {
		const near = dollyDistance(400, 0.1);
		const far = dollyDistance(4000, 0.1);
		expect(near).toBeCloseTo(400 * (1 - Math.exp(-0.1)), 9);
		expect(far / near).toBeCloseTo(10, 9);
	});

	it("never steps less than the minimum, so zooming in passes through a node", () => {
		expect(dollyDistance(5, 0.1)).toBeCloseTo(MIN_DOLLY * 0.1, 9);
		expect(dollyDistance(5, 0.1)).toBeGreaterThan(5);
	});

	it("backs away by the matching amount when zooming out", () => {
		// Zooming out by the same factor undoes a zoom in.
		const depth = 300;
		const inward = dollyDistance(depth, 0.2);
		expect(dollyDistance(depth - inward, -0.2)).toBeCloseTo(-inward, 9);
		expect(dollyDistance(2, -0.1)).toBeCloseTo(-MIN_DOLLY * 0.1, 9);
	});

	it("does not move for no zoom", () => {
		expect(dollyDistance(300, 0)).toBe(0);
	});
});

describe("wheelNotches", () => {
	it("counts 100 px notches, positive for wheel up", () => {
		expect(wheelNotches({ deltaY: -100, deltaMode: 0, ctrlKey: false })).toBe(1);
		expect(wheelNotches({ deltaY: 50, deltaMode: 0, ctrlKey: false })).toBe(-0.5);
		expect(wheelNotches({ deltaY: -3, deltaMode: 1, ctrlKey: false })).toBeCloseTo(0.48, 9);
	});
});

describe("wheelLogZoom", () => {
	it("zooms in on wheel up by OrbitControls' 5% a notch", () => {
		expect(wheelLogZoom({ deltaY: -100, deltaMode: 0, ctrlKey: false })).toBeCloseTo(-Math.log(0.95), 9);
		expect(wheelLogZoom({ deltaY: 100, deltaMode: 0, ctrlKey: false })).toBeCloseTo(Math.log(0.95), 9);
	});

	it("scales line and page deltas, and trackpad pinches, the way OrbitControls does", () => {
		const pixels = wheelLogZoom({ deltaY: -48, deltaMode: 0, ctrlKey: false });
		expect(wheelLogZoom({ deltaY: -3, deltaMode: 1, ctrlKey: false })).toBeCloseTo(pixels, 9);
		expect(wheelLogZoom({ deltaY: -1, deltaMode: 2, ctrlKey: false })).toBeCloseTo(wheelLogZoom({ deltaY: -100, deltaMode: 0, ctrlKey: false }), 9);
		expect(wheelLogZoom({ deltaY: -4.8, deltaMode: 0, ctrlKey: true })).toBeCloseTo(pixels, 9);
	});
});
