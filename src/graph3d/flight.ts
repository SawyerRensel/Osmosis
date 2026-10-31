/**
 * The camera flight to a clicked node, for the 3D graph.
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

const easeOutQuad = (t: number): number => t * (2 - t);

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
	return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}
