/**
 * The camera's flight into Planets mode's hover view, for Cosmos.
 *
 * A hover flight moves the camera's position, look direction and up as one
 * eased move, with the same easing and duration, from the camera as it is to
 * the hover pose (`planets.hoverPose`): on the plate's outward normal, looking
 * down at it, the plate's up at the top of the screen. The orientation is
 * slerped as a quaternion, so the turn is spread over the whole flight and
 * cannot flip at a pole however far apart the two ups are. (The look
 * direction is not the blend of where the camera and its orbit target are:
 * from far away that crams the whole turn into the last moments, as the
 * camera closes in on the plate.)
 *
 * A lane ride blends into the same pose over its second half (`blendPose`).
 */

import type { Vec3 } from "./flight";

/** A camera orientation: a unit quaternion taking camera space (looking down −z, y up) to world space. */
export interface Quat {
	x: number;
	y: number;
	z: number;
	w: number;
}

/** The camera as the hover flight sees it: where it is, the point it orbits (straight ahead), and its up. */
export interface CameraState {
	position: Vec3;
	target: Vec3;
	up: Vec3;
}

export interface HoverFlight {
	fromPosition: Vec3;
	fromOrientation: Quat;
	/** The camera's distance to its orbit target when the flight began. */
	fromDistance: number;
	start: number;
	/** In ms, already scaled by the travel speed. */
	duration: number;
}

export interface HoverFlightPose extends CameraState {
	done: boolean;
}

const WORLD_UP: Vec3 = { x: 0, y: 1, z: 0 };

/**
 * Begin a hover flight from the camera as it is. `orientation` is what is on
 * screen (the camera's own quaternion), not one rebuilt from its up vector.
 */
export function startHover(position: Vec3, target: Vec3, orientation: Quat, now: number, duration: number): HoverFlight {
	return { fromPosition: { ...position }, fromOrientation: normalizeQuat(orientation), fromDistance: distance(position, target), start: now, duration };
}

/** The camera `now` into `flight`, which ends on `end` (re-read each frame, since the plate may still be moving). */
export function hoverFlightPose(flight: HoverFlight, end: CameraState, now: number): HoverFlightPose {
	const t = flight.duration <= 0 ? 1 : Math.min(1, Math.max(0, (now - flight.start) / flight.duration));
	if (t >= 1) return { position: { ...end.position }, target: { ...end.target }, up: { ...end.up }, done: true };
	const from = { position: flight.fromPosition, orientation: flight.fromOrientation, distance: flight.fromDistance };
	return { ...interpolate(from, end, easeOutQuad(t)), done: false };
}

/**
 * `pose` (a lane ride's, this frame) moved `weight` of the way (0 to 1) onto
 * `end`, the hover pose the ride lands in: position, orientation and distance
 * to the orbit target together.
 */
export function blendPose(pose: CameraState, end: CameraState, weight: number): CameraState {
	if (weight <= 0) return pose;
	if (weight >= 1) return { position: { ...end.position }, target: { ...end.target }, up: { ...end.up } };
	const from = { position: pose.position, orientation: lookRotation(sub(pose.target, pose.position), pose.up), distance: distance(pose.position, pose.target) };
	return interpolate(from, end, weight);
}

/** A lane ride rides the arc alone until this far along, then blends into the hover pose. */
export const RIDE_BLEND_FROM = 0.5;

/** How much of the hover pose a lane ride `t` (0 to 1) of the way along has blended in: eased in and out, so the ride lands at rest. */
export function rideBlend(t: number): number {
	const s = Math.min(1, Math.max(0, (t - RIDE_BLEND_FROM) / (1 - RIDE_BLEND_FROM)));
	return s * s * (3 - 2 * s);
}

/**
 * The up the camera should keep at rest, looking along `forward` with `up` at
 * the top of the screen: world +y whenever that shows the same view (looking
 * at a plate anywhere but a pole cap, where its up is world +y projected),
 * since the rest of the view's controls orbit about world +y; otherwise `up`
 * itself, so the camera stays exactly where the flight left it.
 */
export function restingUp(forward: Vec3, up: Vec3): Vec3 {
	const f = normalize(forward);
	const lifted = add(WORLD_UP, f, -dot(WORLD_UP, f));
	const size = length(lifted);
	if (size < 1e-9) return { ...up };
	return dot(scale(lifted, 1 / size), normalize(up)) > 1 - 1e-12 ? { ...WORLD_UP } : { ...up };
}

/** Whether a camera at `position` with `orientation` already shows `pose`: the same place and the same view, to within rounding. */
export function atPose(position: Vec3, orientation: Quat, pose: CameraState): boolean {
	const reach = distance(pose.position, pose.target);
	if (distance(position, pose.position) > 1e-3 * Math.max(1, reach)) return false;
	return angleBetween(normalizeQuat(orientation), lookRotation(sub(pose.target, pose.position), pose.up)) < 1e-4;
}

/** The orientation looking along `forward` with `up` as near the top of the screen as it can be. */
export function lookRotation(forward: Vec3, up: Vec3): Quat {
	const back = normalize(scale(forward, -1));
	let right = cross(up, back);
	// Looking straight along `up`: any up will do, so take one square to the view.
	if (length(right) < 1e-9) right = cross(Math.abs(back.y) < 0.9 ? WORLD_UP : { x: 0, y: 0, z: -1 }, back);
	right = normalize(right);
	const top = cross(back, right);
	return fromBasis(right, top, back);
}

/** The direction a camera with `q` looks along. */
export function forwardOf(q: Quat): Vec3 {
	return rotate(q, { x: 0, y: 0, z: -1 });
}

/** The up at the top of the screen of a camera with `q`. */
export function upOf(q: Quat): Vec3 {
	return rotate(q, WORLD_UP);
}

/** Spherical interpolation between unit quaternions, the short way round. */
export function slerp(a: Quat, b: Quat, t: number): Quat {
	let cos = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
	let [bx, by, bz, bw] = [b.x, b.y, b.z, b.w];
	if (cos < 0) [cos, bx, by, bz, bw] = [-cos, -bx, -by, -bz, -bw];
	let [wa, wb] = [1 - t, t];
	if (cos < 0.9995) {
		const angle = Math.acos(cos);
		const sin = Math.sin(angle);
		[wa, wb] = [Math.sin((1 - t) * angle) / sin, Math.sin(t * angle) / sin];
	}
	return normalizeQuat({ x: a.x * wa + bx * wb, y: a.y * wa + by * wb, z: a.z * wa + bz * wb, w: a.w * wa + bw * wb });
}

/** The angle, in radians, between two orientations. */
export function angleBetween(a: Quat, b: Quat): number {
	const cos = Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w);
	return 2 * Math.acos(Math.min(1, cos));
}

function interpolate(from: { position: Vec3; orientation: Quat; distance: number }, end: CameraState, s: number): CameraState {
	const to = lookRotation(sub(end.target, end.position), end.up);
	const q = slerp(from.orientation, to, s);
	const position = lerp(from.position, end.position, s);
	const reach = from.distance + (distance(end.position, end.target) - from.distance) * s;
	return { position, target: add(position, forwardOf(q), reach), up: upOf(q) };
}

/** The quaternion of the rotation whose matrix has columns `x`, `y`, `z` (orthonormal, right-handed). */
function fromBasis(x: Vec3, y: Vec3, z: Vec3): Quat {
	const [m11, m12, m13, m21, m22, m23, m31, m32, m33] = [x.x, y.x, z.x, x.y, y.y, z.y, x.z, y.z, z.z];
	const trace = m11 + m22 + m33;
	if (trace > 0) {
		const s = 0.5 / Math.sqrt(trace + 1);
		return { w: 0.25 / s, x: (m32 - m23) * s, y: (m13 - m31) * s, z: (m21 - m12) * s };
	}
	if (m11 > m22 && m11 > m33) {
		const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
		return { w: (m32 - m23) / s, x: 0.25 * s, y: (m12 + m21) / s, z: (m13 + m31) / s };
	}
	if (m22 > m33) {
		const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
		return { w: (m13 - m31) / s, x: (m12 + m21) / s, y: 0.25 * s, z: (m23 + m32) / s };
	}
	const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
	return { w: (m21 - m12) / s, x: (m13 + m31) / s, y: (m23 + m32) / s, z: 0.25 * s };
}

function rotate(q: Quat, v: Vec3): Vec3 {
	// v + 2w(u × v) + 2u × (u × v), with u the quaternion's vector part.
	const u = { x: q.x, y: q.y, z: q.z };
	const c = cross(u, v);
	return add(add(v, c, 2 * q.w), cross(u, c), 2);
}

function normalizeQuat(q: Quat): Quat {
	const n = Math.hypot(q.x, q.y, q.z, q.w) || 1;
	return { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n };
}

const easeOutQuad = (t: number): number => t * (2 - t);
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
const distance = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const add = (a: Vec3, b: Vec3, k = 1): Vec3 => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });
const sub = (a: Vec3, b: Vec3): Vec3 => add(a, b, -1);
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });

function normalize(a: Vec3): Vec3 {
	const n = length(a);
	return n === 0 ? { x: 0, y: 0, z: 0 } : scale(a, 1 / n);
}
