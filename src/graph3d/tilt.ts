/**
 * Near-tier panels tilted with their plate, for Planets mode: a panel lies on
 * its plate's tangent frame as a CSS3D object instead of facing the screen,
 * and is hidden whenever the plate is seen from behind. See
 * `vault/Planner/3D Graph - Planets mode.md` (P3).
 *
 * Panel layout px run right and down from the panel's top-left corner, as in
 * `occlusion.ts`. The panel is centred on its node, and one world unit is
 * `pxPerUnit` layout px, so its text matches the plate text under it.
 *
 * Pure: no `three` or `obsidian` import, so it is unit-tested directly.
 */

import type { Vec3 } from "./flight";
import type { PanelHole } from "./occlusion";
import type { TangentFrame } from "./planets";

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

/**
 * Whether a plate at `centre`, front face along `normal`, shows its front to
 * an eye at `eye`: the plate shader's test (`plateBack`), so a panel hides
 * exactly when its plate does.
 */
export function facesEye(centre: Vec3, normal: Vec3, eye: Vec3): boolean {
	return dot(normal, sub(eye, centre)) > 0;
}

/**
 * The panel's object matrix (column-major, as three's `Matrix4.elements`):
 * CSS x along the plate's right, CSS y along its up (`CSS3DRenderer` flips
 * CSS's downward y to the object's +y), the face along its normal, and one
 * layout px `1 / pxPerUnit` world units. A rigid tilt and a uniform scale, so
 * the panel is never distorted.
 */
export function panelMatrix(centre: Vec3, frame: TangentFrame, pxPerUnit: number): number[] {
	const s = 1 / pxPerUnit;
	const { right, up, normal } = frame;
	return [
		right.x * s, right.y * s, right.z * s, 0,
		up.x * s, up.y * s, up.z * s, 0,
		normal.x * s, normal.y * s, normal.z * s, 0,
		centre.x, centre.y, centre.z, 1,
	];
}

/** A tilted panel: its node's centre and frame, and its laid-out size in px. */
export interface TiltedPanel {
	centre: Vec3;
	frame: TangentFrame;
	width: number;
	height: number;
	pxPerUnit: number;
}

/** A plate in the world: its centre and its four corners. */
export interface WorldPlate {
	centre: Vec3;
	corners: readonly Vec3[];
	/** Corner radius as a share of the plate's height (`PLATE_RADIUS`). */
	radius: number;
}

/** The world point at layout px (`u`, `v`) from the panel's top-left. */
export function panelPoint(panel: TiltedPanel, u: number, v: number): Vec3 {
	const { centre, frame, pxPerUnit } = panel;
	const a = (u - panel.width / 2) / pxPerUnit;
	const b = -(v - panel.height / 2) / pxPerUnit;
	return {
		x: centre.x + frame.right.x * a + frame.up.x * b,
		y: centre.y + frame.right.y * a + frame.up.y * b,
		z: centre.z + frame.right.z * a + frame.up.z * b,
	};
}

/**
 * The hole `plate` cuts in a tilted panel seen from `eye`, in the panel's
 * layout px, or null when it cuts none. This is `panelHoles` for a panel that
 * may not face the screen:
 *
 * - **In front** means the plate's centre is on the eye's side of the panel's
 *   plane, not nearer by view depth. On a planet every other surface plate
 *   lies inside a panel's tangent plane, so a planet never cuts holes in its
 *   own panels, however the globe is turned; another planet, or a star plate,
 *   between the eye and the panel does.
 * - **Where** is the plate's corners projected from the eye onto the panel's
 *   plane, and the hole is their bounding box: exact for a panel seen
 *   flat-on (the hover view), a little generous for a slanted one.
 */
export function tiltedHole(panel: TiltedPanel, eye: Vec3, plate: WorldPlate): PanelHole | null {
	const { centre, frame, pxPerUnit } = panel;
	const n = frame.normal;
	if (dot(sub(plate.centre, centre), n) <= 0) return null;
	// Negative: the eye is on the panel's front side (callers only ask about panels that face it).
	const toPlane = dot(sub(centre, eye), n);
	if (toPlane >= 0) return null;
	let left = Infinity;
	let right = -Infinity;
	let top = Infinity;
	let bottom = -Infinity;
	for (const corner of plate.corners) {
		const ray = sub(corner, eye);
		const along = dot(ray, n);
		// A corner level with or behind the eye has no shadow on the panel.
		if (along >= 0) return null;
		const t = toPlane / along;
		const hit = sub({ x: eye.x + ray.x * t, y: eye.y + ray.y * t, z: eye.z + ray.z * t }, centre);
		const u = dot(hit, frame.right) * pxPerUnit + panel.width / 2;
		const v = -dot(hit, frame.up) * pxPerUnit + panel.height / 2;
		left = Math.min(left, u);
		right = Math.max(right, u);
		top = Math.min(top, v);
		bottom = Math.max(bottom, v);
	}
	if (right <= 0 || left >= panel.width || bottom <= 0 || top >= panel.height) return null;
	const height = bottom - top;
	return { left, top, width: right - left, height, radius: height * plate.radius };
}
