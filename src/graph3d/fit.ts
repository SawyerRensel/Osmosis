/** Fit to view (the ribbon's Fit button): how far back the camera must stand to see every loaded plate. */

import type { Vec3 } from "./flight";

export interface Sphere extends Vec3 {
	r: number;
}

/** A little air around the fitted graph, as a multiple of its radius. */
export const FIT_MARGIN = 1.15;

/**
 * A sphere that holds all of `spheres`: centred on the middle of their
 * bounding box (so one far straggler doesn't drag the centre off the bulk any
 * more than the box itself does), as big as the farthest edge needs. Null for none.
 */
export function enclosingSphere(spheres: readonly Sphere[]): Sphere | null {
	if (spheres.length === 0) return null;
	const lo = { x: Infinity, y: Infinity, z: Infinity };
	const hi = { x: -Infinity, y: -Infinity, z: -Infinity };
	for (const s of spheres) {
		for (const axis of ["x", "y", "z"] as const) {
			lo[axis] = Math.min(lo[axis], s[axis]);
			hi[axis] = Math.max(hi[axis], s[axis]);
		}
	}
	const centre = { x: (lo.x + hi.x) / 2, y: (lo.y + hi.y) / 2, z: (lo.z + hi.z) / 2 };
	let r = 0;
	for (const s of spheres) r = Math.max(r, Math.hypot(s.x - centre.x, s.y - centre.y, s.z - centre.z) + s.r);
	return { ...centre, r };
}

/**
 * The distance from a sphere's centre at which it fills the narrower side of a
 * view of vertical field of view `fovDeg` (degrees) and `aspect` (width over height), with `margin` to spare.
 */
export function fitDistance(radius: number, fovDeg: number, aspect: number, margin: number = FIT_MARGIN): number {
	const half = (fovDeg * Math.PI) / 360;
	const halfWide = Math.atan(Math.tan(half) * Math.max(aspect, 1e-3));
	return (radius * margin) / Math.sin(Math.min(half, halfWide));
}

/**
 * Whether a view state opening the 3D graph frames the whole map (as Fit
 * does) rather than landing somewhere: true unless it names a plate to stand
 * at (a restored workspace, a forward step), a line to land on (`subpath`, a
 * Mod-click on a link), or a mind map picture to lift off from.
 */
export function opensFitted(state: Record<string, unknown> | null | undefined): boolean {
	return typeof state?.node !== "string" && (typeof state?.subpath !== "string" || state.subpath === "") && state?.liftOff == null;
}
