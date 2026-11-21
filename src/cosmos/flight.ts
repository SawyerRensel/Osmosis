/**
 * The camera flight to a clicked node, for Cosmos.
 *
 * The flight aims at the node's position each frame, not the one it had when
 * the flight began. A hop to another note loads new notes and re-heats the
 * layout, which moves any node that has not settled yet, the clicked one
 * included; a flight aimed at the click-time position lands on empty space.
 */

export interface Vec3 {
	x: number;
	y: number;
	z: number;
}

export interface Flight {
	/** Camera position and orbit target when the flight began. */
	fromPosition: Vec3;
	fromTarget: Vec3;
	/** Where the camera ends up, relative to the node. */
	offset: Vec3;
	start: number;
}

export interface FlightPose {
	position: Vec3;
	target: Vec3;
	done: boolean;
}

/**
 * Begin a flight to `node`, keeping the current viewing direction: the camera
 * ends `distance` from the node, on the side it is on now.
 */
export function startFlight(camera: Vec3, target: Vec3, node: Vec3, distance: number, now: number): Flight {
	let [dx, dy, dz] = [camera.x - node.x, camera.y - node.y, camera.z - node.z];
	let length = Math.hypot(dx, dy, dz);
	if (length === 0) [dx, dy, dz, length] = [0, 0, 1, 1];
	const scale = distance / length;
	return {
		fromPosition: { ...camera },
		fromTarget: { ...target },
		offset: { x: dx * scale, y: dy * scale, z: dz * scale },
		start: now,
	};
}

/**
 * The camera pose `now` into `flight`, with the node at `node`. The camera
 * eases out over `duration` ms and turns to face the node in the first third,
 * as 3d-force-graph's own `cameraPosition()` transition does.
 */
export function flightPose(flight: Flight, node: Vec3, now: number, duration: number): FlightPose {
	const t = Math.min(1, Math.max(0, (now - flight.start) / duration));
	const end = { x: node.x + flight.offset.x, y: node.y + flight.offset.y, z: node.z + flight.offset.z };
	return {
		position: lerp(flight.fromPosition, end, easeOutQuad(t)),
		target: lerp(flight.fromTarget, node, easeOutQuad(Math.min(1, t * 3))),
		done: t >= 1,
	};
}

/**
 * A ride along an edge (follow a link): the camera moves from where it is onto
 * the line through the edge's two ends, then along it toward the far end,
 * `standOff` short of it, looking ahead. Both ends are re-read each frame, as
 * a flight re-reads its node.
 */
export interface Trip {
	fromPosition: Vec3;
	fromTarget: Vec3;
	/** How far short of the far end the camera stops: the viewing distance it had when the ride began. */
	standOff: number;
	start: number;
	/** In ms, already scaled by the travel speed. */
	duration: number;
}

/** A trip takes this long at least, and this long at most, at travel speed 1. */
export const TRIP_MIN_MS = 1500;
export const TRIP_MAX_MS = 4000;
const TRIP_BASE_MS = 1200;
/** Each world unit the camera has to cover adds this many ms. */
const TRIP_MS_PER_UNIT = 12;

/** How long a trip over `distance` world units takes at `speed` (1 is the default pace; 2 is twice as fast). */
export function tripDuration(distance: number, speed: number): number {
	return Math.min(TRIP_MAX_MS, Math.max(TRIP_MIN_MS, TRIP_BASE_MS + distance * TRIP_MS_PER_UNIT)) / speed;
}

/** The camera pose a trip ends on: `standOff` before `to` along the edge from `from`. */
export function tripEnd(from: Vec3, to: Vec3, standOff: number): Vec3 {
	const [dir, length] = direction(from, to);
	const back = length === 0 ? 0 : standOff;
	return { x: to.x - dir.x * back, y: to.y - dir.y * back, z: to.z - dir.z * back };
}

export function startTrip(camera: Vec3, target: Vec3, from: Vec3, to: Vec3, standOff: number, now: number, speed: number): Trip {
	const end = tripEnd(from, to, standOff);
	const distance = Math.hypot(end.x - camera.x, end.y - camera.y, end.z - camera.z);
	return { fromPosition: { ...camera }, fromTarget: { ...target }, standOff, start: now, duration: tripDuration(distance, speed) };
}

/**
 * The camera pose `now` into `trip`, the edge running from `from` to `to`
 * where they are now. Along the edge the camera eases in and out; its sideways
 * offset from the edge's line is gone by 60% of the way, and its gaze moves
 * from the old target to a point `standOff` ahead on the line, which by the end
 * is `to`.
 */
export function tripPose(trip: Trip, from: Vec3, to: Vec3, now: number): FlightPose {
	const t = Math.min(1, Math.max(0, (now - trip.start) / trip.duration));
	const [dir, length] = direction(from, to);
	const toCamera = { x: trip.fromPosition.x - from.x, y: trip.fromPosition.y - from.y, z: trip.fromPosition.z - from.z };
	const along0 = toCamera.x * dir.x + toCamera.y * dir.y + toCamera.z * dir.z;
	const standOff = length === 0 ? 0 : trip.standOff;
	const along1 = length - standOff;
	const along = along0 + (along1 - along0) * smooth(t);
	const sideways = 1 - smooth(Math.min(1, t / 0.6));
	const at = (s: number): Vec3 => ({ x: from.x + dir.x * s, y: from.y + dir.y * s, z: from.z + dir.z * s });
	const online = at(along);
	const position = {
		x: online.x + (toCamera.x - dir.x * along0) * sideways,
		y: online.y + (toCamera.y - dir.y * along0) * sideways,
		z: online.z + (toCamera.z - dir.z * along0) * sideways,
	};
	return { position, target: lerp(trip.fromTarget, at(along + standOff), smooth(Math.min(1, t * 2.5))), done: t >= 1 };
}

/** The unit vector from `a` to `b` (+z when they coincide), and the distance. */
function direction(a: Vec3, b: Vec3): [Vec3, number] {
	const length = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
	if (length === 0) return [{ x: 0, y: 0, z: 1 }, 0];
	return [{ x: (b.x - a.x) / length, y: (b.y - a.y) / length, z: (b.z - a.z) / length }, length];
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * The distance the camera views from, which an arrow key's glide and an edge
 * ride keep (Sawyer, 2026-11-10: the distance you zoomed to is the one you
 * keep). A move under way already has its end distance (`heading`): that one,
 * so presses in quick succession don't drift. Otherwise, how far ahead of the
 * camera the focused node is along the view (camera to orbit target), which is
 * what sets its plate's size on screen. Not the orbit target's own distance:
 * a wheel zoom re-seats the target at the depth of whatever the cursor aimed
 * at (another plate, a planet's core, the last depth aimed at), so it is often
 * far from the node in view. With no focused node, or one behind the camera
 * or closer than `minimum`, the orbit target's distance it is.
 */
export function viewingDistance(camera: Vec3, target: Vec3, focused: Vec3 | null, heading: number | null, minimum: number): number {
	if (heading !== null) return heading;
	const [forward, orbit] = direction(camera, target);
	if (focused === null) return orbit;
	const depth = (focused.x - camera.x) * forward.x + (focused.y - camera.y) * forward.y + (focused.z - camera.z) * forward.z;
	return depth >= minimum ? depth : orbit;
}

/** Where an arrow key's glide ends: looking at `node` from `distance`, along the camera's current view direction, so it turns nowhere. */
export function glideEnd(camera: Vec3, target: Vec3, node: Vec3, distance: number): { position: Vec3; target: Vec3 } {
	const [forward] = direction(camera, target);
	return { position: { x: node.x - forward.x * distance, y: node.y - forward.y * distance, z: node.z - forward.z * distance }, target: { ...node } };
}

/** A short eased camera move between two poses that track no node: an edit's turn or pan (`cosmos/framing.ts`). */
export interface Glide {
	from: { position: Vec3; target: Vec3 };
	to: { position: Vec3; target: Vec3 };
	start: number;
}

/** The camera pose `now` into `glide`, easing out over `duration` ms. */
export function glidePose(glide: Glide, now: number, duration: number): FlightPose {
	const t = Math.min(1, Math.max(0, (now - glide.start) / duration));
	const eased = easeOutQuad(t);
	return { position: lerp(glide.from.position, glide.to.position, eased), target: lerp(glide.from.target, glide.to.target, eased), done: t >= 1 };
}

/**
 * `glide` carried along by `move`: the node it shows moved while it was under
 * way (a re-settle after a structural edit), so both ends move with it and the
 * camera keeps its offset to the node.
 */
export function shiftGlide(glide: Glide, move: Vec3): Glide {
	const add = (a: Vec3): Vec3 => ({ x: a.x + move.x, y: a.y + move.y, z: a.z + move.z });
	return {
		from: { position: add(glide.from.position), target: add(glide.from.target) },
		to: { position: add(glide.to.position), target: add(glide.to.target) },
		start: glide.start,
	};
}

const easeOutQuad = (t: number): number => t * (2 - t);

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
	return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}
