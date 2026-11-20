/**
 * On-screen thumb joysticks for walking and flying through Cosmos on a
 * touch screen: the maths only. The sticks themselves are `CosmosSticks`, and
 * `CosmosScene` feeds what they read into the same flight and look code the
 * keyboard and mouse drive (`fly`, `rotateAboutPivot`).
 *
 * Deflections are in screen axes: x to the right, y down, each −1…1, with the
 * whole deflection inside the unit circle.
 */

export type StickSide = "left" | "right";
export type StickRole = "look" | "move";

/**
 * Which stick does what: left moves (WASD), right looks, as most console games
 * have it. (The first build had them the other way round, as the ticket
 * specified; Sawyer swapped them after trying it on a phone.) Swap them here
 * and nowhere else.
 */
export const STICK_ROLES: Readonly<Record<StickSide, StickRole>> = { left: "move", right: "look" };

/** Fraction of the stick's radius a thumb can wander from centre without moving anything. */
export const STICK_DEADZONE = 0.12;
/** Turn rate at full deflection of the look stick, radians a second (about 115°). */
export const STICK_LOOK_RATE = 2;

export interface Deflection {
	x: number;
	y: number;
}

/** Camera-space movement, as `FLIGHT_KEYS` gives it: right, up, forward. */
export type FlightAxes = [right: number, up: number, forward: number];

export const CENTRED: Deflection = { x: 0, y: 0 };

/**
 * A thumb (`dx`, `dy`) px from the centre of a stick `radius` px wide, as a
 * deflection. Inside the deadzone it is nothing; past it, the travel left is
 * rescaled to 0…1 so motion starts from zero rather than jumping, then
 * squared, so a small push is a slow, fine movement and the full rate is still
 * at the rim. Past the rim it holds at full deflection.
 */
export function stickDeflection(dx: number, dy: number, radius: number): Deflection {
	const distance = Math.hypot(dx, dy);
	if (radius <= 0 || distance === 0) return CENTRED;
	const reach = distance / radius;
	if (reach <= STICK_DEADZONE) return CENTRED;
	const travel = Math.min(1, (reach - STICK_DEADZONE) / (1 - STICK_DEADZONE));
	const amount = travel * travel;
	return { x: (dx / distance) * amount, y: (dy / distance) * amount };
}

/**
 * How far the look stick turns the view in `seconds`, as `rotateAboutPivot`
 * takes it: a push right turns right (a negative yaw, as mouse-look turns
 * toward the drag) and a push up tips the view up (a positive pitch).
 */
export function stickLook(deflection: Deflection, seconds: number): { yaw: number; pitch: number } {
	return { yaw: -deflection.x * STICK_LOOK_RATE * seconds, pitch: -deflection.y * STICK_LOOK_RATE * seconds };
}

/** The move stick as flight axes: up is forward, sideways strafes (W/A/S/D). */
export function stickMove(deflection: Deflection): FlightAxes {
	return [deflection.x, 0, -deflection.y];
}

/**
 * Flight direction and throttle from the held keys and the move stick
 * together. Keys are all or nothing, so their sum is normalised to full speed
 * as before; the stick adds its analog push on top, and the total is held to
 * full speed. A length under 1 flies that fraction of the flight speed.
 */
export function flightAxes(keys: FlightAxes, stick: FlightAxes): FlightAxes {
	const keyLength = Math.hypot(...keys);
	const sum = keys.map((axis, i) => (keyLength === 0 ? 0 : axis / keyLength) + stick[i]!) as FlightAxes;
	const length = Math.hypot(...sum);
	return length > 1 ? (sum.map((axis) => axis / length) as FlightAxes) : sum;
}
