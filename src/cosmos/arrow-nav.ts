/**
 * Arrow-key navigation in Cosmos (see `vault/Planner/3D Graph -
 * Arrow-key navigation.md`). An arrow moves the selection from the primary
 * plate to the related plate that lies closest to that direction on screen.
 * Related means one edge away (parent, child, link target or source) or a
 * sibling under the same parent. The scene projects them; this module
 * gathers the candidates and picks one.
 */

import type { GraphEdgeKind } from "./model";

export type Arrow = "up" | "down" | "left" | "right";

/** A candidate's place on screen relative to the primary, in px, with y down (as the screen's). */
export interface ScreenOffset {
	id: string;
	x: number;
	y: number;
}

/** Anything more than this far off the arrow's axis is not in its direction. */
export const MAX_OFF_AXIS_DEG = 65;
/**
 * How much an angle counts against a candidate: its score is its distance ×
 * (1 + ANGLE_WEIGHT × angle in radians), lowest wins. At 4, a plate 20° off
 * axis counts 1.4 × as far as it is, and one 45° off 4.1 ×. So a plate
 * squarely in the direction beats a nearer one well off it, while a plate a
 * few degrees off beats one straight on but much farther.
 */
export const ANGLE_WEIGHT = 4;

const AXIS: Record<Arrow, { x: number; y: number }> = {
	up: { x: 0, y: -1 },
	down: { x: 0, y: 1 },
	left: { x: -1, y: 0 },
	right: { x: 1, y: 0 },
};

/**
 * The plates one arrow press can reach from `id`: its parent, its children,
 * the other end of any other edge touching it, and its siblings (the other
 * children of its parent). Each once, never `id` itself, in that order.
 */
export function arrowCandidates(id: string, edges: Iterable<{ kind: GraphEdgeKind; source: string; target: string }>): string[] {
	const parents: string[] = [];
	const children = new Map<string, string[]>();
	const near: string[] = [];
	for (const edge of edges) {
		if (edge.kind === "hierarchy") {
			if (edge.target === id) parents.push(edge.source);
			const list = children.get(edge.source);
			if (list === undefined) children.set(edge.source, [edge.target]);
			else list.push(edge.target);
		} else if (edge.source === id) near.push(edge.target);
		else if (edge.target === id) near.push(edge.source);
	}
	const siblings = parents.flatMap((parent) => children.get(parent) ?? []);
	const out = new Set([...parents, ...(children.get(id) ?? []), ...near, ...siblings]);
	out.delete(id);
	return [...out];
}

/**
 * The candidate an arrow press moves to, or null when none lies in that
 * direction. Candidates more than `MAX_OFF_AXIS_DEG` off the arrow's axis,
 * or on the primary itself, are out; of the rest the lowest score wins (see
 * `ANGLE_WEIGHT`), and of equal scores the one listed first.
 */
export function pickInDirection(candidates: Iterable<ScreenOffset>, arrow: Arrow): string | null {
	const axis = AXIS[arrow];
	const limit = (MAX_OFF_AXIS_DEG * Math.PI) / 180;
	let best: string | null = null;
	let bestScore = Infinity;
	for (const candidate of candidates) {
		const distance = Math.hypot(candidate.x, candidate.y);
		if (distance === 0) continue;
		const cos = (candidate.x * axis.x + candidate.y * axis.y) / distance;
		const angle = Math.acos(Math.min(1, Math.max(-1, cos)));
		if (angle > limit) continue;
		const score = distance * (1 + ANGLE_WEIGHT * angle);
		if (score < bestScore) {
			best = candidate.id;
			bestScore = score;
		}
	}
	return best;
}
