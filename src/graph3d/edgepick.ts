/**
 * Picking an edge under a click, and choosing which end a click on it travels
 * to (follow a link; see `vault/Planner/3D Graph - Follow a link.md`).
 *
 * Edges are one `LineSegments`, so they can't be picked by the engine. Like
 * plates (`pickNode` in `depth.ts`), they are picked on screen: the distance
 * from the pointer to each segment as drawn, within a slop. Pure: the scene
 * supplies the camera as two functions.
 */

import type { Vec3 } from "./flight";

/** The camera as an edge picker needs it. */
export interface EdgeView {
	/** How far ahead of the camera `p` is (negative: behind it). Linear in `p`. */
	depth(p: Vec3): number;
	/** Where `p`, which is ahead of the camera, lands on screen, in client px. */
	screen(p: Vec3): { x: number; y: number };
}

/** An edge as drawn: its two ends in world space. */
export interface DrawnEdge {
	a: Vec3;
	b: Vec3;
}

/** Closer than this ahead of the camera, an edge is clipped off, so its projection stays finite. */
const NEAR = 1;

/**
 * The index of the edge nearest client point (`x`, `y`), or -1 when none is
 * within `slop` px. Only the part of an edge between `NEAR` and `reach` ahead
 * of the camera counts (a segment behind the camera, or lost in the mist, can't
 * be clicked). Of edges equally near, the one nearer the camera wins.
 */
export function pickEdge(edges: readonly DrawnEdge[], view: EdgeView, x: number, y: number, slop: number, reach: number): number {
	let best = -1;
	let bestGap = Infinity;
	let bestDepth = Infinity;
	edges.forEach((edge, i) => {
		const range = visibleRange(view.depth(edge.a), view.depth(edge.b), reach);
		if (range === null) return;
		const start = at(edge, range[0]);
		const end = at(edge, range[1]);
		const p = view.screen(start);
		const q = view.screen(end);
		const { gap, t } = distanceToSegment(x, y, p, q);
		if (gap > slop) return;
		const depth = view.depth(start) + (view.depth(end) - view.depth(start)) * t;
		if (gap < bestGap || (gap === bestGap && depth < bestDepth)) {
			best = i;
			bestGap = gap;
			bestDepth = depth;
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

function at(edge: DrawnEdge, t: number): Vec3 {
	return { x: edge.a.x + (edge.b.x - edge.a.x) * t, y: edge.a.y + (edge.b.y - edge.a.y) * t, z: edge.a.z + (edge.b.z - edge.a.z) * t };
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
