/**
 * Pinch zoom in the Planets layout (T96, `vault/Planner/3D Graph - Pinch
 * zooms toward the fingers in Planets.md`).
 *
 * Everywhere else a pinch zooms toward `aim`'s point, which in Planets is the
 * planet core behind the plate under the fingers: its step was sized from the
 * core's distance, so near a plate far from the core a small pinch flew the
 * camera a long way. In Planets a pinch instead heads for the point under the
 * fingers on the plate itself, and its step is that point's share of the
 * spread ratio, so the plate grows by the ratio the fingers spread and stays
 * under them. The core's distance never enters.
 *
 * Round 2: between plates the fingers are over the planet's surface (or the
 * core layer a drag there grabs), and the zoom heads for that surface, not
 * for Auto Depth's last depth, which the first finger's press had just set to
 * the core's distance (`zoomPivotDistance`). The depth picked as the gesture
 * starts is kept for the whole gesture, so crossing from a plate to a gap
 * never changes the rate. The mouse wheel in Planets follows the same rules.
 *
 * Pure: the scene passes in its ray and depths.
 */

import { dollyDistance } from "./depth";

/**
 * Smallest pinch step per unit of ln(zoom), in world units, in Planets. The
 * wheel's `MIN_DOLLY` (200) outweighs the proportional step anywhere nearer
 * than about 200, which is where plates are read; this one only takes over
 * within about 20 units, so a pinch still passes through a plate instead of
 * halving its way toward it forever.
 */
export const PINCH_MIN_DOLLY = 20;

/** Below this cosine between the finger ray and the view direction, the ray is treated as this oblique (it never is, at a sane field of view). */
const MIN_COSINE = 0.1;

/**
 * How far along the ray through the fingers lies the point at view depth
 * `depth`: the ray meets the plane facing the camera through the aimed plate
 * there. `cosine` is the dot product of the ray's and the view's unit
 * directions.
 */
export function rayDistanceAtDepth(depth: number, cosine: number): number {
	return depth / Math.max(MIN_COSINE, cosine);
}

/**
 * How far a pinch of `logZoom` (ln of the fingers' spread ratio; positive
 * zooms in) moves the camera toward a point `distance` away: the share that
 * makes it grow on screen by the ratio, but never less than `PINCH_MIN_DOLLY`
 * per unit of `logZoom`. Negative backs away.
 */
export function pinchDollyDistance(distance: number, logZoom: number): number {
	return dollyDistance(distance, logZoom, PINCH_MIN_DOLLY);
}

/** What lies under the fingers (or the cursor) as a Planets zoom starts. */
export interface ZoomAim {
	/** View depth of the plate under them, or null when none is near. */
	plate: number | null;
	/**
	 * Distance along their ray to the planet surface, or the core layer, that a
	 * drag there would grab (`grabRadius`), or null when the ray meets no planet.
	 */
	surface: number | null;
	/** Distance along the ray to fall back on over empty sky: Auto Depth's last depth. */
	miss: number;
}

/**
 * How far along the ray through the fingers a Planets zoom heads (the scene
 * keeps the view depth there for the rest of the gesture). The plate under
 * them comes first, in the plane facing the camera through it, as in round 1.
 * Between plates, the surface they are over: the same sphere a drag there
 * turns, so a gap zooms at the rate of the plates around it. Only off every
 * planet does it fall back to `miss`. `cosine` is the dot product of the
 * ray's and the view's unit directions.
 */
export function zoomPivotDistance(aim: ZoomAim, cosine: number): number {
	if (aim.plate !== null) return rayDistanceAtDepth(aim.plate, cosine);
	return aim.surface ?? aim.miss;
}
