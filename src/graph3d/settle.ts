/**
 * How new arrivals settle against a world that is already at rest. See the
 * `# Spec` section of `vault/Planner/Develop Mind-Map Graph View.md`
 * ("Stability").
 *
 * Pinning a node stops it moving, but d3 still computes the many-body force on
 * it, and that force is nearly all of a tick's cost: measured on 3,500 nodes,
 * 26.5 ms a tick with none pinned, 27.9 ms with 85% pinned, and 2.9 ms with
 * the force limited to the free nodes. So the force acts only on:
 * - every free node, and every node of a note that still has one (an edited
 *   line re-settles among its own note's lines);
 * - the pinned root of every other note (its core, or the sole H1 that
 *   replaces it: `isNoteRoot`), standing in for its whole cluster,
 *   at its cluster's combined strength. Seen from outside, a cluster pushes
 *   about as hard as all its nodes together, so arrivals still keep clear of
 *   settled notes without paying for each of their lines.
 */

import type { Spacing } from "./appearance";
import { isNoteRoot, type GraphNodeKind } from "./model";

export interface ChargeNode {
	id: string;
	kind: GraphNodeKind;
	path?: string;
	/** A line that is its note's root (`GraphNode.root`). */
	root?: boolean;
	pinned: boolean;
}

/** Many-body strength for each node the force acts on; nodes left out feel and exert none. */
export function chargeStrengths(nodes: readonly ChargeNode[], base: number): Map<string, number> {
	const clusterSize = new Map<string, number>();
	const unsettled = new Set<string>();
	for (const node of nodes) {
		if (node.path === undefined || (node.kind !== "note" && node.kind !== "line")) continue;
		clusterSize.set(node.path, (clusterSize.get(node.path) ?? 0) + 1);
		if (!node.pinned) unsettled.add(node.path);
	}
	const strengths = new Map<string, number>();
	for (const node of nodes) {
		const inUnsettledNote = node.path !== undefined && unsettled.has(node.path);
		if (!node.pinned || (inUnsettledNote && node.kind === "line")) {
			strengths.set(node.id, base);
		} else if (isNoteRoot(node) && node.path !== undefined) {
			strengths.set(node.id, inUnsettledNote ? base : base * (clusterSize.get(node.path) ?? 1));
		}
	}
	return strengths;
}

/**
 * Scale many-body strengths (in place) for the spacing sliders. A strength
 * sets a distance by its square root, so a node's is multiplied by the square
 * of the spacing it keeps: a note's lines by Node spacing, which keeps its
 * shape in step with its hierarchy rest length, tags and other pathless
 * nodes by Note spacing; in Planets mode only cores and stars are charged,
 * all by Note spacing. What keeps notes apart is then Note spacing's, not
 * Node spacing's, so each note's lines also owe the difference
 * (Note² - Node²) times their strength as a push from the note as a whole
 * (`notePush`); that is returned by note path. At ×1 nothing changes and
 * nothing is owed.
 *
 * Only a push is owed, never a pull: with Note spacing below Node spacing
 * nothing is owed, and notes sit as close as their links' rest lengths (which
 * Note spacing still scales) and their lines' charge let them. An owed pull
 * acted from each core on whole other notes and did not weaken as notes
 * overlapped, so notes fell into one another and stayed there (Note ×1 with
 * Node ×1.15, 2026-11-09; `vault/Planner/3D Graph - Note spacing applies late and shrinks.md`).
 */
export function spaceCharges(strengths: Map<string, number>, pathOf: (id: string) => string | undefined, spacing: Spacing, planets: boolean): Map<string, number> {
	const within = planets ? spacing.note : spacing.node;
	const owed = Math.max(0, spacing.note ** 2 - within ** 2);
	const clusters = new Map<string, number>();
	for (const [id, strength] of strengths) {
		const path = pathOf(id);
		strengths.set(id, strength * (path === undefined ? spacing.note : within) ** 2);
		if (owed !== 0 && path !== undefined) clusters.set(path, (clusters.get(path) ?? 0) + strength * owed);
	}
	return clusters;
}
