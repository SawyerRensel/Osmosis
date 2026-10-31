/**
 * Detail tiers for the 3D graph, chosen by camera distance. See the `# Spec`
 * section of `vault/Planner/Develop Mind-Map Graph View.md` ("Detail tiers").
 *
 * Below the note cores, which are always labelled, a node is either far (a
 * sphere only) or middle (a label plate, which takes the sphere's place). The
 * scene sets no distance limit, so the cap alone decides: the nearest nodes
 * get plates. The near tier and its own budget arrive in Phase 4.
 */

export interface NodeDistance {
	id: string;
	distance: number;
}

export interface LabelBudget {
	/** An unlabelled node gains its label inside this distance. */
	enter: number;
	/** A labelled node keeps its label out to this distance (>= `enter`), so a
	 *  node resting on the boundary doesn't flicker. */
	exit: number;
	/** At most this many labels at once; the nearest win. */
	max: number;
}

/** The nodes that should carry a middle-tier label, given those that do now. */
export function chooseLabelled(
	nodes: Iterable<NodeDistance>,
	current: ReadonlySet<string>,
	budget: LabelBudget,
): Set<string> {
	const candidates: NodeDistance[] = [];
	for (const node of nodes) {
		if (node.distance < (current.has(node.id) ? budget.exit : budget.enter)) candidates.push(node);
	}
	if (candidates.length > budget.max) {
		candidates.sort((a, b) => a.distance - b.distance);
		candidates.length = budget.max;
	}
	return new Set(candidates.map((node) => node.id));
}
