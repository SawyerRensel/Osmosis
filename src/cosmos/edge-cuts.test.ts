import { describe, it, expect } from "vitest";
import { EdgeSegments, MIN_STROKE_PX, facingStrokes, tiltedStrokes, toView, type FacingView } from "./edge-cuts";
import type { ScreenPanel } from "./occlusion";
import type { TiltedPanel } from "./tilt";

const at = (x: number, y: number, z: number) => ({ x, y, z });

function segments(...list: [ReturnType<typeof at>, ReturnType<typeof at>, number?, string?][]): EdgeSegments {
	const s = new EdgeSegments();
	for (const [a, b, w = 0, id = "line:jib"] of list) s.push(a, b, w, w, id, "line:mainsail");
	return s;
}

// The camera sits at the origin looking down -z, so the world is view space.
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
// A 1000 × 600 viewport, 500 px per world unit at depth 1.
const camera: FacingView = { near: 1, pxPerUnitAt1: 500, viewportWidth: 1000, viewportHeight: 600 };
// A panel laid out 200 × 40 px, drawn at full size in the middle of the screen, at depth 100.
const panel: ScreenPanel = { id: "line:reef", x: 500, y: 300, width: 200, height: 40, scale: 1, depth: 100 };

function facing(s: EdgeSegments, p: ScreenPanel = panel) {
	return facingStrokes(s, toView(s, IDENTITY, camera.near, null), p, camera);
}

describe("EdgeSegments", () => {
	it("grows past its first capacity and keeps every segment's ends", () => {
		const s = new EdgeSegments();
		for (let i = 0; i < 200; i++) s.push(at(i, 0, 0), at(i, 1, 0), 0, 0, `a${i}`, `b${i}`);
		expect(s.count).toBe(200);
		expect(s.data[199 * 8]).toBe(199);
		expect(s.endB[199]).toBe("b199");
		s.clear();
		expect(s.count).toBe(0);
	});
});

describe("toView", () => {
	it("takes ends to view x, y down the screen and depth", () => {
		const view = toView(segments([at(1, 2, -10), at(3, 4, -20), 0.5]), IDENTITY, 1, null);
		expect(Array.from(view.subarray(0, 8))).toEqual([1, -2, 10, 3, -4, 20, 0.5, 0.5]);
	});

	it("boxes each segment on screen past the near plane, widths included", () => {
		const view = toView(segments([at(-1, 2, -10), at(4, -4, -20), 2]), IDENTITY, 1, null);
		// x / d from -0.1 to 0.2, y down the screen / d from -0.2 to 0.2, grown by the widest end's half width at its nearest depth.
		expect(Array.from(view.subarray(8, 12)).map((n) => Math.round(n * 1000) / 1000)).toEqual([-0.2, 0.3, -0.3, 0.3]);
		expect(toView(segments([at(0, 0, 5), at(1, 0, 2)]), IDENTITY, 1, null)[8]).toBe(Infinity);
	});

	it("applies the camera's translation", () => {
		// The camera moved to z = 10: its inverse moves the world by -10.
		const moved = [...IDENTITY.slice(0, 12), 0, 0, -10, 1];
		expect(toView(segments([at(0, 0, 0), at(0, 0, -5)]), moved, 1, null)[2]).toBe(10);
	});
});

describe("facingStrokes", () => {
	it("cuts a nearer edge across the panel, clipped to the panel grown by half the stroke", () => {
		// At depth 50 a world unit is 10 px, so this edge spans the whole screen at the panel's middle row.
		const strokes = facing(segments([at(-100, 0, -50), at(100, 0, -50)]));
		const half = MIN_STROKE_PX / 2;
		expect(strokes).toHaveLength(1);
		expect(strokes[0]!.x1).toBeCloseTo(-half);
		expect(strokes[0]!.x2).toBeCloseTo(200 + half);
		expect(strokes[0]!.y1).toBeCloseTo(20);
		expect(strokes[0]!.y2).toBeCloseTo(20);
		expect(strokes[0]!.width).toBe(MIN_STROKE_PX);
	});

	it("leaves an edge behind the panel hidden", () => {
		expect(facing(segments([at(-100, 0, -150), at(100, 0, -150)]))).toEqual([]);
	});

	it("cuts only the stretch nearer than the panel when the edge runs through its depth", () => {
		// x = -10 at depth 50 (screen 400, the panel's left side); depth 100 halfway, at x = 10 (screen 550).
		const strokes = facing(segments([at(-10, 0, -50), at(30, 0, -150)]));
		expect(strokes).toHaveLength(1);
		expect(strokes[0]!.x1).toBeCloseTo(0);
		expect(strokes[0]!.x2).toBeCloseTo(150);
	});

	it("never cuts an edge that ends at the panel's own node", () => {
		expect(facing(segments([at(-100, 0, -50), at(100, 0, -50), 0, "line:reef"]))).toEqual([]);
		const s = new EdgeSegments();
		s.push(at(-100, 0, -50), at(100, 0, -50), 0, 0, "line:jib", "line:reef");
		expect(facing(s)).toEqual([]);
	});

	it("drops the part behind the near plane", () => {
		// From behind the camera to depth 50 at the panel's right side: only depths above 1 project.
		const strokes = facing(segments([at(0, 0, 10), at(10, 0, -50)]));
		expect(strokes).toHaveLength(1);
		// At the near plane x is 10·11/60 units, 500 px a unit: far off screen to the right, clipped to the box.
		expect(strokes[0]!.x1).toBeCloseTo(200 + MIN_STROKE_PX / 2);
		expect(strokes[0]!.x2).toBeCloseTo(200);
	});

	it("skips an edge that misses the panel on screen", () => {
		// 10 px a unit at depth 50: y = 5 is 50 px above the middle, the panel is 20 px each way.
		expect(facing(segments([at(-100, 5, -50), at(100, 5, -50)]))).toEqual([]);
	});

	it("gives a tapered edge its width on screen, and works in the panel's layout px", () => {
		// 2 world units at depth 50 is 20 px.
		expect(facing(segments([at(-100, 0, -50), at(100, 0, -50), 2]))[0]!.width).toBeCloseTo(20);
		// Drawn at half size, the panel's own px are twice the screen's.
		const half = facing(segments([at(-100, 0, -50), at(100, 0, -50)]), { ...panel, width: 400, height: 80, scale: 0.5 })[0]!;
		expect(half.width).toBeCloseTo(2 * MIN_STROKE_PX);
		expect(half.y1).toBeCloseTo(40);
	});

	it("uses the width where the edge crosses the panel, not at its ends", () => {
		const s = new EdgeSegments();
		// Width 0 at x = -100 to 4 at x = 100: 2 units across the middle, at depth 50 that is 20 px.
		s.push(at(-100, 0, -50), at(100, 0, -50), 0, 4, "line:jib", "line:mainsail");
		expect(facing(s)[0]!.width).toBeCloseTo(20, 0);
	});
});

describe("tiltedStrokes", () => {
	// A panel lying in the z = 0 plane at the origin, facing +z, 2 layout px a world unit; the eye 100 above it.
	const tilted: TiltedPanel = {
		centre: at(0, 0, 0),
		frame: { right: at(1, 0, 0), up: at(0, 1, 0), normal: at(0, 0, 1) },
		width: 200,
		height: 40,
		pxPerUnit: 2,
	};
	const eye = at(0, 0, 100);
	const strokes = (s: EdgeSegments) => tiltedStrokes(s, tilted, "line:reef", eye, 1.5);

	it("casts an edge between the eye and the plane onto the panel", () => {
		// Halfway up, a world unit casts to 2 units, 4 layout px.
		const [stroke] = strokes(segments([at(-1000, 0, 50), at(1000, 0, 50)]));
		expect(stroke!.x1).toBeCloseTo(-0.75);
		expect(stroke!.x2).toBeCloseTo(200.75);
		expect(stroke!.y1).toBeCloseTo(20);
		expect(stroke!.width).toBe(1.5);
		// Up is up: an edge at y = 2 casts to y = 4, 8 layout px above the middle row.
		expect(strokes(segments([at(-1000, 2, 50), at(1000, 2, 50)]))[0]!.y1).toBeCloseTo(12);
	});

	it("cuts nothing for an edge behind the plane or beyond the eye's height", () => {
		expect(strokes(segments([at(-1000, 0, -10), at(1000, 0, -10)]))).toEqual([]);
		expect(strokes(segments([at(-1000, 0, 150), at(1000, 0, 150)]))).toEqual([]);
	});

	it("cuts only the stretch on the eye's side of the plane", () => {
		// From x = -20 halfway up (u = 100 - 80) down through the plane at x = 0 (u = 100).
		const [stroke] = strokes(segments([at(-20, 0, 50), at(20, 0, -50)]));
		expect(stroke!.x1).toBeCloseTo(20);
		expect(stroke!.x2).toBeCloseTo(100);
	});

	it("casts a tapered edge's width, and skips the panel's own edges", () => {
		expect(strokes(segments([at(-1000, 0, 50), at(1000, 0, 50), 1]))[0]!.width).toBeCloseTo(4);
		expect(strokes(segments([at(-1000, 0, 50), at(1000, 0, 50), 0, "line:reef"]))).toEqual([]);
	});

	it("cuts nothing while the eye is behind the panel", () => {
		expect(tiltedStrokes(segments([at(-1000, 0, -50), at(1000, 0, -50)]), tilted, "line:reef", at(0, 0, -100), 1.5)).toEqual([]);
	});
});
