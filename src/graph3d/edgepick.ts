/**
 * Picking an edge under a click, and choosing which end a click on it travels
 * to (follow a link; see `vault/Planner/3D Graph - Follow a link.md`).
 *
 * Edges are one `LineSegments`, so they can't be picked by the engine. Like
 * plates (`pickNode` in `depth.ts`), they are picked on screen: the distance
 * from the pointer to each edge as drawn, within a slop. An edge is a polyline
 * through the points it is drawn through (two for a straight edge; a Planets
 * lane or surface arc is sampled as it is drawn), so a click on a bowed lane's
 * middle hits it and one on its chord does not. Pure: the scene supplies the
 * camera as two functions.
 */

import type { Vec3 } from "./flight";

/** The camera as an edge picker needs it. */
export interface EdgeView {
	/** How far ahead of the camera `p` is (negative: behind it). Linear in `p`. */
	depth(p: Vec3): number;
	/** Where `p`, which is ahead of the camera, lands on screen, in client px. */
	screen(p: Vec3): { x: number; y: number };
}

/** An edge as drawn: the points its line runs through in world space, in order (at least two). */
export interface DrawnEdge {
	points: readonly Vec3[];
}

/** Closer than this ahead of the camera, an edge is clipped off, so its projection stays finite. */
const NEAR = 1;

/**
 * The index of the edge nearest client point (`x`, `y`), or -1 when none is
 * within `slop` px. An edge's distance is that of its nearest segment. Only the
 * part of a segment between `NEAR` and `reach` ahead of the camera counts (a
 * segment behind the camera, or lost in the mist, can't be clicked). Of edges
 * equally near, the one nearer the camera wins.
 */
export function pickEdge(edges: readonly DrawnEdge[], view: EdgeView, x: number, y: number, slop: number, reach: number): number {
	let best = -1;
	let bestGap = Infinity;
	let bestDepth = Infinity;
	edges.forEach((edge, i) => {
		for (let k = 1; k < edge.points.length; k++) {
			const [a, b] = [edge.points[k - 1]!, edge.points[k]!];
			const range = visibleRange(view.depth(a), view.depth(b), reach);
			if (range === null) continue;
			const start = at(a, b, range[0]);
			const end = at(a, b, range[1]);
			const { gap, t } = distanceToSegment(x, y, view.screen(start), view.screen(end));
			if (gap > slop) continue;
			const depth = view.depth(start) + (view.depth(end) - view.depth(start)) * t;
			if (gap < bestGap || (gap === bestGap && depth < bestDepth)) {
				best = i;
				bestGap = gap;
				bestDepth = depth;
			}
		}
	});
	return best;
}

/** The part of a segment, as parameters 0..1, whose depth (`da` at 0, `db` at 1) lies in [`NEAR`, `reach`]; null when none does. */
function visibleRange(da: number, db: number, reach: number): [number, number] | null {
	let lo = 0;
	let hi = 1;
	if (da === db) return da >= NEAR && da <= reach ? [0, 1] : null;
	// Depth is linear along the segment: solve for where it crosses each limit.
	const atLimit = (limit: number): number => (limit - da) / (db - da);
	const [first, second] = da < db ? [atLimit(NEAR), atLimit(reach)] : [atLimit(reach), atLimit(NEAR)];
	lo = Math.max(lo, first);
	hi = Math.min(hi, second);
	return lo <= hi ? [lo, hi] : null;
}

function at(a: Vec3, b: Vec3, t: number): Vec3 {
	return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

/** Distance from (`x`, `y`) to segment `p`–`q` in px, and how far along it the nearest point is (0..1). */
function distanceToSegment(x: number, y: number, p: { x: number; y: number }, q: { x: number; y: number }): { gap: number; t: number } {
	const [dx, dy] = [q.x - p.x, q.y - p.y];
	const lengthSquared = dx * dx + dy * dy;
	const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, ((x - p.x) * dx + (y - p.y) * dy) / lengthSquared));
	return { gap: Math.hypot(x - (p.x + dx * t), y - (p.y + dy * t)), t };
}

/**
 * Which end of an edge a click on it travels to: the end that isn't the
 * focused node, and with neither focused, the end farther from the camera.
 * Returns "a" or "b".
 */
export function farEnd(edge: { a: Vec3; b: Vec3; aId: string; bId: string }, focusId: string | null, camera: Vec3): "a" | "b" {
	if (focusId !== null) {
		if (edge.aId === focusId && edge.bId !== focusId) return "b";
		if (edge.bId === focusId && edge.aId !== focusId) return "a";
	}
	const away = (p: Vec3): number => Math.hypot(p.x - camera.x, p.y - camera.y, p.z - camera.z);
	return away(edge.b) >= away(edge.a) ? "b" : "a";
}
