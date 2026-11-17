/**
 * An edge passes under its own plates: where an edge, seen from the camera,
 * crosses the plate of a node it ends at, and runs in front of that plate,
 * the edge isn't drawn there. Everywhere else the depth buffer decides, by
 * real depth: a nearer edge covers a farther plate and a nearer plate covers
 * a farther edge. See
 * `vault/Planner/3D Graph - Plates draw over branches that are in front of them.md`.
 *
 * An edge starts at its node's centre, the middle of its plate, so an edge
 * leaving toward the camera would otherwise run across that plate's text.
 * This used to be solved by drawing every plate at 97% of its depth
 * (`PLATE_PULL`), which also put every plate in front of any *other* edge
 * less than 3% of the camera distance in front of it: most crossings inside
 * a flat branch, whose lines and plates share one plane.
 *
 * Each edge vertex carries both end plates (`writePlateEnd`); the vertex
 * shader takes them to view space (`OWN_PLATE_VERTEX_GLSL`, spinning a
 * planet's plate upright as the plate shader does) and the fragment shader
 * casts the ray through each fragment onto them (`OWN_PLATE_FRAGMENT_GLSL`).
 * `plateInView` and `onOwnPlate` mirror the two line for line, so keep them
 * in step.
 *
 * Pure: no `three` or `obsidian` import, so it is unit-tested directly.
 */

import type { Vec3 } from "./flight";
import { UPRIGHT_GLSL, uprightSpin } from "./upright";

/** An edge's end plate as the edge shaders read it: its centre, size and (on a planet) its unspun axes, in the world. */
export interface PlateEnd {
	x?: number;
	y?: number;
	z?: number;
	shape: { width: number; height: number };
	/** Planets mode: the plate lies along these unit axes. Without, it faces the camera. */
	frame?: { right: Vec3; up: Vec3 };
}

/** The per-vertex attributes, two ends each, and how many floats each takes. */
export const PLATE_END_ATTRIBUTES = { aEndA: 4, aEndARight: 4, aEndAUp: 3, aEndB: 4, aEndBRight: 4, aEndBUp: 3 } as const;

/** One end's three arrays (`aEnd?`, `aEnd?Right`, `aEnd?Up`). */
export interface PlateEndArrays {
	centre: Float32Array;
	right: Float32Array;
	up: Float32Array;
}

/**
 * Write `end` into `arrays` for `vertex`: centre and half width, right axis
 * and half height, up axis. No plate (null, or not placed) is a half width
 * of 0, which the shader skips.
 */
export function writePlateEnd(arrays: PlateEndArrays, vertex: number, end: PlateEnd | null): void {
	const placed = end !== null && end.x !== undefined && end.y !== undefined && end.z !== undefined;
	const c = vertex * 4;
	arrays.centre[c] = placed ? end.x ?? 0 : 0;
	arrays.centre[c + 1] = placed ? end.y ?? 0 : 0;
	arrays.centre[c + 2] = placed ? end.z ?? 0 : 0;
	arrays.centre[c + 3] = placed ? end.shape.width / 2 : 0;
	const right = placed ? end.frame?.right : undefined;
	const up = placed ? end.frame?.up : undefined;
	arrays.right[c] = right?.x ?? 0;
	arrays.right[c + 1] = right?.y ?? 0;
	arrays.right[c + 2] = right?.z ?? 0;
	arrays.right[c + 3] = placed ? end.shape.height / 2 : 0;
	const u = vertex * 3;
	arrays.up[u] = up?.x ?? 0;
	arrays.up[u + 1] = up?.y ?? 0;
	arrays.up[u + 2] = up?.z ?? 0;
}

/** A plate in view space: its centre, and its right and up half extents (zero for no plate). */
export interface ViewPlate {
	centre: Vec3;
	right: Vec3;
	up: Vec3;
}

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

/**
 * The plate centred at view-space `centre`, `halfWidth` × `halfHeight`: a
 * billboard along the view's axes, or, with `axes` (its right and up in view
 * space), lying along them spun upright (`uprightSpin`), as the plate shader
 * draws it.
 */
export function plateInView(centre: Vec3, halfWidth: number, halfHeight: number, axes: { right: Vec3; up: Vec3 } | null): ViewPlate {
	if (halfWidth <= 0) return { centre, right: ZERO, up: ZERO };
	if (axes === null) return { centre, right: { x: halfWidth, y: 0, z: 0 }, up: { x: 0, y: halfHeight, z: 0 } };
	const { cos, sin } = uprightSpin(centre, axes.right, axes.up);
	const { right: r, up: u } = axes;
	return {
		centre,
		right: { x: (cos * r.x + sin * u.x) * halfWidth, y: (cos * r.y + sin * u.y) * halfWidth, z: (cos * r.z + sin * u.z) * halfWidth },
		up: { x: (cos * u.x - sin * r.x) * halfHeight, y: (cos * u.y - sin * r.y) * halfHeight, z: (cos * u.z - sin * r.z) * halfHeight },
	};
}

/**
 * Whether a fragment at view-space `p` lies in front of `plate` and over it
 * on screen: the ray from the camera (the origin) through `p` meets the
 * plate's plane beyond `p`, inside its rectangle. A fragment behind the plate
 * is false: the plate's depth already hides it.
 */
export function onOwnPlate(p: Vec3, plate: ViewPlate): boolean {
	const rr = dot(plate.right, plate.right);
	if (rr === 0) return false;
	const n = cross(plate.right, plate.up);
	const pn = dot(p, n);
	if (Math.abs(pn) < 1e-12) return false;
	const t = dot(plate.centre, n) / pn;
	if (t <= 1) return false;
	const q = { x: p.x * t - plate.centre.x, y: p.y * t - plate.centre.y, z: p.z * t - plate.centre.z };
	return Math.abs(dot(q, plate.right)) <= rr && Math.abs(dot(q, plate.up)) <= dot(plate.up, plate.up);
}

/** Appended to an edge's vertex shader after `mvPosition` is known: both end plates to view space. */
export const OWN_PLATE_VERTEX_GLSL = /* glsl */ `
${UPRIGHT_GLSL}
attribute vec4 aEndA;
attribute vec4 aEndARight;
attribute vec3 aEndAUp;
attribute vec4 aEndB;
attribute vec4 aEndBRight;
attribute vec3 aEndBUp;
varying vec3 vOwnView;
varying vec3 vEndAC;
varying vec3 vEndAR;
varying vec3 vEndAU;
varying vec3 vEndBC;
varying vec3 vEndBR;
varying vec3 vEndBU;
void plateInView(vec4 centre, vec4 right, vec3 up, out vec3 c, out vec3 r, out vec3 u) {
	c = (modelViewMatrix * vec4(centre.xyz, 1.0)).xyz;
	r = vec3(0.0);
	u = vec3(0.0);
	if (centre.w <= 0.0) return;
	if (dot(right.xyz, right.xyz) < 0.5) {
		r = vec3(centre.w, 0.0, 0.0);
		u = vec3(0.0, right.w, 0.0);
		return;
	}
	mat3 toView = mat3(modelViewMatrix);
	vec3 vr = toView * right.xyz;
	vec3 vu = toView * up;
	vec2 spin = uprightSpin(c, vr, vu);
	r = (spin.x * vr + spin.y * vu) * centre.w;
	u = (spin.x * vu - spin.y * vr) * right.w;
}
`;

/** The lines that use it, at the end of the vertex shader's `main` (where `mvPosition` is the vertex in view space). */
export const OWN_PLATE_VERTEX_MAIN = /* glsl */ `
vOwnView = mvPosition.xyz;
plateInView(aEndA, aEndARight, aEndAUp, vEndAC, vEndAR, vEndAU);
plateInView(aEndB, aEndBRight, aEndBUp, vEndBC, vEndBR, vEndBU);
`;

/** Before an edge's fragment shader's `main`: `onOwnPlate`. */
export const OWN_PLATE_FRAGMENT_GLSL = /* glsl */ `
varying vec3 vOwnView;
varying vec3 vEndAC;
varying vec3 vEndAR;
varying vec3 vEndAU;
varying vec3 vEndBC;
varying vec3 vEndBR;
varying vec3 vEndBU;
bool onOwnPlate(vec3 p, vec3 c, vec3 r, vec3 u) {
	float rr = dot(r, r);
	if (rr == 0.0) return false;
	vec3 n = cross(r, u);
	float pn = dot(p, n);
	if (abs(pn) < 1e-12) return false;
	float t = dot(c, n) / pn;
	if (t <= 1.0) return false;
	vec3 q = p * t - c;
	return abs(dot(q, r)) <= rr && abs(dot(q, u)) <= dot(u, u);
}
`;

/** First thing in the fragment shader's `main`. */
export const OWN_PLATE_FRAGMENT_MAIN = /* glsl */ `
if (onOwnPlate(vOwnView, vEndAC, vEndAR, vEndAU) || onOwnPlate(vOwnView, vEndBC, vEndBR, vEndBU)) discard;
`;

/**
 * Patch a compiled edge shader (`onBeforeCompile`'s) to pass under its own
 * plates. Needs a `#include <fog_vertex>` after `mvPosition` is set, which
 * three's line and basic mesh shaders have.
 */
export function patchOwnPlate(shader: { vertexShader: string; fragmentShader: string }): void {
	shader.vertexShader = shader.vertexShader
		.replace("void main() {", `${OWN_PLATE_VERTEX_GLSL}\nvoid main() {`)
		.replace("#include <fog_vertex>", `#include <fog_vertex>\n${OWN_PLATE_VERTEX_MAIN}`);
	shader.fragmentShader = shader.fragmentShader.replace("void main() {", `${OWN_PLATE_FRAGMENT_GLSL}\nvoid main() {\n${OWN_PLATE_FRAGMENT_MAIN}`);
}
