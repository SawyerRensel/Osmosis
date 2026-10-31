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
 * - the pinned core of every other note, standing in for its whole cluster,
 *   at its cluster's combined strength. Seen from outside, a cluster pushes
 *   about as hard as all its nodes together, so arrivals still keep clear of
 *   settled notes without paying for each of their lines.
 */

import type { GraphNodeKind } from "./model";

export interface ChargeNode {
	id: string;
	kind: GraphNodeKind;
	path?: string;
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
		} else if (node.kind === "note" && node.path !== undefined) {
			strengths.set(node.id, inUnsettledNote ? base : base * (clusterSize.get(node.path) ?? 1));
		}
	}
	return strengths;
}
