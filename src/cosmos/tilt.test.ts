import { describe, it, expect } from "vitest";
import { facesEye, panelMatrix, panelPoint, tiltedHole, type TiltedPanel, type WorldPlate } from "./tilt";
import { tangentFrame, type TangentFrame } from "./planets";
import type { Vec3 } from "./flight";

const FACING_Z: TangentFrame = { right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, normal: { x: 0, y: 0, z: 1 } };

/** A camera-facing plate (seen down −z) centred on `centre`. */
function plate(centre: Vec3, width = 4, height = 2): WorldPlate {
	const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => ({ x: centre.x + (sx * width) / 2, y: centre.y + (sy * height) / 2, z: centre.z })));
	return { centre, corners, radius: 0.25 };
}

function close(a: Vec3, b: Vec3): void {
	expect(a.x).toBeCloseTo(b.x, 9);
	expect(a.y).toBeCloseTo(b.y, 9);
	expect(a.z).toBeCloseTo(b.z, 9);
}

describe("facesEye", () => {
	const centre = { x: 0, y: 0, z: 10 };
	const normal = { x: 0, y: 0, z: 1 };

	it("is true from the front, false from behind and edge-on", () => {
		expect(facesEye(centre, normal, { x: 5, y: 3, z: 100 })).toBe(true);
		expect(facesEye(centre, normal, { x: 5, y: 3, z: -100 })).toBe(false);
		expect(facesEye(centre, normal, { x: 0, y: 100, z: 10 })).toBe(false);
	});
});

describe("panelMatrix", () => {
	it("lays CSS x along right, CSS up along up and the face along the normal, one px 1/pxPerUnit units", () => {
		const frame = tangentFrame({ x: 1, y: 0.3, z: -0.4 });
		const m = panelMatrix({ x: 7, y: -2, z: 3 }, frame, 4);
		const column = (i: number): Vec3 => ({ x: m[4 * i]!, y: m[4 * i + 1]!, z: m[4 * i + 2]! });
		close(column(0), { x: frame.right.x / 4, y: frame.right.y / 4, z: frame.right.z / 4 });
		close(column(1), { x: frame.up.x / 4, y: frame.up.y / 4, z: frame.up.z / 4 });
		close(column(2), { x: frame.normal.x / 4, y: frame.normal.y / 4, z: frame.normal.z / 4 });
		expect(m.slice(12)).toEqual([7, -2, 3, 1]);
		expect([m[3], m[7], m[11]]).toEqual([0, 0, 0]);
	});

	it("is a rigid tilt: right × up is the normal, so the panel is never mirrored", () => {
		const { right, up, normal } = tangentFrame({ x: -0.2, y: 0.9, z: 0.5 });
		close({ x: right.y * up.z - right.z * up.y, y: right.z * up.x - right.x * up.z, z: right.x * up.y - right.y * up.x }, normal);
	});

	it("agrees with panelPoint: the box's top-right corner is up and to the right of the node", () => {
		const frame = tangentFrame({ x: 0, y: 0.2, z: 1 });
		const panel: TiltedPanel = { centre: { x: 1, y: 2, z: 3 }, frame, width: 300, height: 60, pxPerUnit: 10 };
		const m = panelMatrix(panel.centre, frame, panel.pxPerUnit);
		// CSS3DRenderer draws the box at CSS (150, -30) from its centre for that corner, and flips CSS y.
		const [cx, cy] = [150, 30];
		close(panelPoint(panel, 300, 0), { x: m[0]! * cx + m[4]! * cy + m[12]!, y: m[1]! * cx + m[5]! * cy + m[13]!, z: m[2]! * cx + m[6]! * cy + m[14]! });
	});
});

describe("tiltedHole", () => {
	// 400 × 100 px at 10 px a unit: 40 × 10 units, facing an eye 100 units out.
	const panel: TiltedPanel = { centre: { x: 0, y: 0, z: 0 }, frame: FACING_Z, width: 400, height: 100, pxPerUnit: 10 };
	const eye = { x: 0, y: 0, z: 100 };

	it("cuts a plate between the eye and a flat-on panel out where it covers it on screen", () => {
		// Halfway to the eye, the plate's shadow on the panel is twice its size.
		const hole = tiltedHole(panel, eye, plate({ x: 10, y: 0, z: 50 }));
		expect(hole).not.toBeNull();
		expect(hole!.left).toBeCloseTo(360);
		expect(hole!.top).toBeCloseTo(30);
		expect(hole!.width).toBeCloseTo(80);
		expect(hole!.height).toBeCloseTo(40);
		expect(hole!.radius).toBeCloseTo(10);
	});

	it("cuts nothing for a plate behind the panel's plane, or beside the panel", () => {
		expect(tiltedHole(panel, eye, plate({ x: 0, y: 0, z: -5 }))).toBeNull();
		expect(tiltedHole(panel, eye, plate({ x: 40, y: 0, z: 50 }))).toBeNull();
	});

	it("cuts nothing from a panel seen from behind", () => {
		expect(tiltedHole(panel, { x: 0, y: 0, z: -100 }, plate({ x: 0, y: 0, z: -50 }))).toBeNull();
	});

	it("never cuts a planet's own surface plates out of its panels, however obliquely the globe is seen", () => {
		const radius = 100;
		const on = (theta: number): Vec3 => ({ x: radius * Math.sin(theta), y: 0, z: radius * Math.cos(theta) });
		const tilted: TiltedPanel = { ...panel, centre: on(0), frame: tangentFrame(on(0)) };
		// Low over the panel's horizon, so the neighbour toward the eye is nearer by view depth.
		const oblique = { x: 400, y: 0, z: 140 };
		expect(facesEye(tilted.centre, tilted.frame.normal, oblique)).toBe(true);
		for (const theta of [0.05, 0.1, 0.2, -0.1]) {
			const centre = on(theta);
			const f = tangentFrame(centre);
			const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => ({
				x: centre.x + f.right.x * sx * 2 + f.up.x * sy,
				y: centre.y + f.right.y * sx * 2 + f.up.y * sy,
				z: centre.z + f.right.z * sx * 2 + f.up.z * sy,
			})));
			expect(tiltedHole(tilted, oblique, { centre, corners, radius: 0.25 })).toBeNull();
		}
		// Another planet's plate in the line of sight does cut it.
		expect(tiltedHole(tilted, oblique, plate({ x: 200, y: 0, z: 120 }, 40, 40))).not.toBeNull();
	});
});
