/**
 * Grabbing a planet: the point of the surface pressed stays under the cursor
 * as the drag turns the camera about the planet's core.
 *
 * The camera rig turns as `rotateAboutPivot` turns it, a yaw about the world
 * up and a pitch about the camera's right axis, because that pair is exactly
 * the set of turns that put no roll into the view (OrbitControls re-aims the
 * camera with `lookAt` and a fixed up). `stickyTurn` solves that pair so the
 * grabbed point lands on the cursor's ray. Like `pivot.ts`, this imports
 * `three` math, so only the lazily loaded `CosmosScene` may import it.
 */

import { Vector3 } from "three";

/**
 * Where the ray from `origin` along unit `direction` meets the sphere: its
 * near hit. A ray that misses (the cursor is past the planet's silhouette)
 * gets the silhouette point on the cursor's side instead, the point where a
 * ray from `origin` just grazes the sphere. That is where the hit was as the
 * cursor left the planet, so the grabbed point rolls to the planet's edge and
 * stays there, sliding round the rim as the cursor circles, rather than jumping.
 */
export function grabPoint(origin: Vector3, direction: Vector3, centre: Vector3, radius: number): Vector3 {
	const toOrigin = origin.clone().sub(centre);
	const b = toOrigin.dot(direction);
	const disc = b * b - (toOrigin.lengthSq() - radius * radius);
	if (disc >= 0) {
		const near = -b - Math.sqrt(disc);
		const t = near >= 0 ? near : -b + Math.sqrt(disc);
		if (t >= 0) return origin.clone().addScaledVector(direction, t);
	}
	// A miss means `origin` is outside the sphere. In the plane of the ray and
	// the centre, the grazing ray leaves `origin` at asin(radius / distance)
	// from the centre's direction, toward the cursor's side.
	const distance = toOrigin.length();
	const inward = toOrigin.clone().negate().divideScalar(distance);
	const side = direction.clone().addScaledVector(inward, -direction.dot(inward));
	if (side.lengthSq() === 0) return centre.clone().addScaledVector(inward, -radius);
	side.normalize();
	const sin = Math.min(1, radius / distance);
	const graze = inward.multiplyScalar(Math.sqrt(1 - sin * sin)).addScaledVector(side, sin);
	return origin.clone().addScaledVector(graze, Math.sqrt(Math.max(0, distance * distance - radius * radius)));
}

/**
 * How far (radians) the surface may face away from the line of sight and
 * still hold the grabbed point under the pointer. Toward the silhouette the
 * surface turns ever faster under a moving pointer (without bound at the rim),
 * and past it nothing is under the pointer at all. Beyond this the grab slips (`slipRate`).
 */
export const GRIP_LIMIT = Math.PI / 3;

/**
 * Where the ray from `origin` along unit `direction` holds the sphere: its
 * near hit, while the surface there faces the ray within `GRIP_LIMIT`. Null
 * when the ray misses, meets the sphere past that, or `origin` is inside it.
 */
export function gripPoint(origin: Vector3, direction: Vector3, centre: Vector3, radius: number): Vector3 | null {
	const toOrigin = origin.clone().sub(centre);
	const b = toOrigin.dot(direction);
	const disc = b * b - (toOrigin.lengthSq() - radius * radius);
	if (disc < 0 || radius <= 0) return null;
	const t = -b - Math.sqrt(disc);
	if (t < 0) return null;
	const hit = origin.clone().addScaledVector(direction, t);
	const facing = -hit.clone().sub(centre).dot(direction) / radius;
	return facing >= Math.cos(GRIP_LIMIT) - 1e-12 ? hit : null;
}

/**
 * Radians a slipped grab turns the planet per px of pointer travel: the rate
 * the surface turned under the pointer where it slipped, at `GRIP_LIMIT`, so
 * the drag turns on at the speed it had. `distance` is from the camera to the
 * core; `perPx` is the view's tangent per px at its centre
 * (tan(fov / 2) / half the height). A camera at or inside the surface never
 * slips (its rays always hold), so that is 0.
 *
 * The ray at view angle a from the core meets the surface facing away from
 * it by i, with sin i = distance sin a / radius, at the surface angle
 * i − a from the near point; that turns by
 * distance cos a / (radius cos i) − 1 per radian of a, and a px is
 * perPx cos² a radians of a.
 */
export function slipRate(distance: number, radius: number, perPx: number): number {
	if (radius <= 0 || distance <= radius) return 0;
	const sinA = (radius * Math.sin(GRIP_LIMIT)) / distance;
	const cosA = Math.sqrt(1 - sinA * sinA);
	return perPx * cosA * cosA * ((distance * cosA) / (radius * Math.cos(GRIP_LIMIT)) - 1);
}

/** A sphere to pick: a planet's core and the radius its surface plates sit at. */
export interface Sphere {
	centre: Vector3;
	radius: number;
}

/**
 * The sphere the ray from `origin` along unit `direction` meets first, with
 * where it meets it and how far along the ray that is, or null when the ray
 * meets none. A press anywhere over a planet (a plate, a gap between plates,
 * or a node in front of it) grabs it. From inside a sphere the ray meets it
 * on the way out, so that is its hit; spheres behind `origin` don't count.
 */
export function sphereOnRay<T extends Sphere>(origin: Vector3, direction: Vector3, spheres: Iterable<T>): { sphere: T; point: Vector3; distance: number } | null {
	let best: { sphere: T; distance: number } | null = null;
	for (const sphere of spheres) {
		const toOrigin = origin.clone().sub(sphere.centre);
		const b = toOrigin.dot(direction);
		const disc = b * b - (toOrigin.lengthSq() - sphere.radius * sphere.radius);
		if (disc < 0) continue;
		const root = Math.sqrt(disc);
		const t = -b - root >= 0 ? -b - root : -b + root;
		if (t < 0 || (best !== null && t >= best.distance)) continue;
		best = { sphere, distance: t };
	}
	return best === null ? null : { ...best, point: origin.clone().addScaledVector(direction, best.distance) };
}

/** Signed angle (radians) that turns `from` toward `to` about `axis`, right-handed; both are taken in the plane square to `axis`. */
function angleAbout(axis: Vector3, from: Vector3, to: Vector3): number {
	const a = from.clone().projectOnPlane(axis);
	const b = to.clone().projectOnPlane(axis);
	if (a.lengthSq() === 0 || b.lengthSq() === 0) return 0;
	return Math.atan2(axis.dot(a.clone().cross(b)), a.dot(b));
}

/** `angle` wrapped into (−π, π]. */
function wrap(angle: number): number {
	return angle - 2 * Math.PI * Math.ceil((angle - Math.PI) / (2 * Math.PI));
}

/**
 * The yaw (about `up`) and pitch (about the camera's right axis) to pass to
 * `rotateAboutPivot`, with the pivot at `centre`, so that the world point
 * `grabbed` shows where `aim` shows now. `aim` is where the cursor's ray meets
 * the grabbed sphere (`grabPoint`). Both points are taken at the same distance
 * from `centre`.
 *
 * The pitch is solved first: it is the turn about the right axis that brings
 * `aim` to the grabbed point's height along `up`, which a yaw then cannot
 * change. Of its two solutions the smaller turn wins, so a drag never flips
 * the globe. Near a pole the height may be out of reach; the pitch then gets
 * as close as it can and the point trails the cursor a little.
 */
export function stickyTurn(camera: Vector3, target: Vector3, up: Vector3, centre: Vector3, grabbed: Vector3, aim: Vector3): { yaw: number; pitch: number } {
	const u = up.clone().normalize();
	const right = target.clone().sub(camera).cross(u);
	if (right.lengthSq() === 0) return { yaw: 0, pitch: 0 };
	right.normalize();
	// (right, ahead, u) is right-handed, so a turn about `right` carries `ahead` toward `u`.
	const ahead = u.clone().cross(right);
	const from = grabbed.clone().sub(centre);
	const to = aim.clone().sub(centre);
	if (to.lengthSq() > 0 && from.lengthSq() > 0) to.setLength(from.length());

	const across = to.dot(right);
	const b = to.dot(ahead);
	const c = to.dot(u);
	const spread = Math.hypot(b, c);
	let pitch = 0;
	if (spread > 1e-9) {
		const height = Math.asin(Math.max(-1, Math.min(1, from.dot(u) / spread)));
		const now = Math.atan2(c, b);
		const options = [wrap(height - now), wrap(Math.PI - height - now)];
		pitch = Math.abs(options[0]!) <= Math.abs(options[1]!) ? options[0]! : options[1]!;
	}
	const pitched = right
		.clone()
		.multiplyScalar(across)
		.addScaledVector(ahead, spread * Math.cos(Math.atan2(c, b) + pitch))
		.addScaledVector(u, spread * Math.sin(Math.atan2(c, b) + pitch));
	// The yaw takes the grabbed point round to the pitched aim, so the rig turns the other way.
	return { yaw: -angleAbout(u, from, pitched), pitch };
}
