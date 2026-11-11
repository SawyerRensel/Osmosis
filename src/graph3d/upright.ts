/**
 * Planets mode's upright plates: a plate lies flat on its planet (tangent at
 * its place, as `wrapPlate` puts it), but spins in place about its own
 * normal so its text reads upright on screen as the camera orbits and rolls.
 * See `vault/Planner/3D Graph - Planets plates face up.md`.
 *
 * The spin is the in-plane turn whose text-right and text-up best match the
 * screen's right and up at the plate (the 2D Procrustes fit of the
 * perspective projection's Jacobian there): face-on that is exactly the
 * camera's up laid into the plate, and toward the limb it leans as little as
 * a flat plate can. For a plate seen from the front the fit never vanishes
 * (it can't be degenerate, edge-on included), so the turn is smooth however
 * the camera moves, a pass straight over the plate included. Seen from behind
 * (the far side: dimmed, no text) it fits right to right and up to *down*,
 * which is the same rectangle on screen and keeps that fit from vanishing
 * too; the switch happens edge-on, where the plate has no area.
 *
 * `UPRIGHT_GLSL` is the same rule for the plate shaders, in view space;
 * `uprightSpin` mirrors it line for line, so keep the two in step.
 *
 * Pure: no `three` or `obsidian` import, so it is unit-tested directly.
 */

import type { Vec3 } from "./flight";
import type { TangentFrame } from "./planets";

/** The camera, as the spin reads it: its position and its world right, up and back (+z) axes, all unit. */
export interface ViewBasis {
	eye: Vec3;
	right: Vec3;
	up: Vec3;
	back: Vec3;
}

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const toView = (v: Vec3, view: ViewBasis): Vec3 => ({ x: dot(v, view.right), y: dot(v, view.up), z: dot(v, view.back) });

/**
 * The spin (cos, sin) for a plate at view-space position `p` whose text-right
 * and text-up are `r` and `u` in view space: turned right is
 * `cos·right + sin·up`, turned up `−sin·right + cos·up`. The rows of the
 * projection's Jacobian at `p` are (−p.z, 0, p.x) for screen x and
 * (0, −p.z, p.y) for screen y (up to one positive scale, which the angle
 * ignores). Falls back to no spin only for a camera at the plate's centre.
 */
export function uprightSpin(p: Vec3, r: Vec3, u: Vec3): { cos: number; sin: number } {
	const a11 = -p.z * r.x + p.x * r.z;
	const a12 = -p.z * u.x + p.x * u.z;
	const a21 = -p.z * r.y + p.y * r.z;
	const a22 = -p.z * u.y + p.y * u.z;
	const s = a11 * a22 - a12 * a21 < 0 ? -1 : 1;
	const c = a11 + s * a22;
	const n = a12 - s * a21;
	const h = Math.hypot(c, n);
	return h < 1e-6 ? { cos: 1, sin: 0 } : { cos: c / h, sin: n / h };
}

/** `frame` (a plate at `centre`) spun upright for the camera `view`: the same normal, right and up turned in its plane. */
export function uprightFrame(frame: TangentFrame, centre: Vec3, view: ViewBasis): TangentFrame {
	const p = toView({ x: centre.x - view.eye.x, y: centre.y - view.eye.y, z: centre.z - view.eye.z }, view);
	const { cos, sin } = uprightSpin(p, toView(frame.right, view), toView(frame.up, view));
	const { right, up } = frame;
	return {
		normal: frame.normal,
		right: { x: cos * right.x + sin * up.x, y: cos * right.y + sin * up.y, z: cos * right.z + sin * up.z },
		up: { x: cos * up.x - sin * right.x, y: cos * up.y - sin * right.y, z: cos * up.z - sin * right.z },
	};
}

/**
 * `uprightSpin` for the shaders: `p` the plate's centre and `r`, `u` its axes,
 * all in view space; returns (cos, sin).
 */
export const UPRIGHT_GLSL = /* glsl */ `
vec2 uprightSpin(vec3 p, vec3 r, vec3 u) {
	float a11 = -p.z * r.x + p.x * r.z;
	float a12 = -p.z * u.x + p.x * u.z;
	float a21 = -p.z * r.y + p.y * r.z;
	float a22 = -p.z * u.y + p.y * u.z;
	float s = a11 * a22 - a12 * a21 < 0.0 ? -1.0 : 1.0;
	vec2 cs = vec2(a11 + s * a22, a12 - s * a21);
	float h = length(cs);
	return h < 1e-6 ? vec2(1.0, 0.0) : cs / h;
}
`;

/**
 * The side of the square a plate `width` × `height` stays inside at any spin
 * (its diagonal): squares that don't overlap hold circles that don't, so a
 * continent laid out at these sizes has no two plates overlapping however
 * each one turns.
 */
export function spinFootprint(width: number, height: number): number {
	return Math.hypot(width, height);
}
