/**
 * Ctrl/Cmd+arrow navigation in the 2D and 3D mind maps (see `vault/Planner/
 * Mind Map - Ctrl+arrow keys navigate the hierarchy.md`). Unlike the plain
 * arrows, which follow the screen (3D) or the layout's direction and side
 * (2D), these follow the outline only: Up / Down are the previous / next
 * sibling, Left the parent, Right the first child, whatever the layout.
 */

export type HierarchyStep = "prevSibling" | "nextSibling" | "parent" | "firstChild";

/** The outline as the maps see it: each node's parent and its children in document order. */
export interface Hierarchy {
	parent(id: string): string | null;
	children(id: string): readonly string[];
}

const KEY_STEP: Record<string, HierarchyStep> = {
	ArrowUp: "prevSibling",
	ArrowDown: "nextSibling",
	ArrowLeft: "parent",
	ArrowRight: "firstChild",
};

/** The step a Ctrl/Cmd+arrow key takes, or null for any other key. Never mirrored: Left is always the parent. */
export function arrowKeyStep(key: string): HierarchyStep | null {
	return KEY_STEP[key] ?? null;
}

/**
 * Where `step` goes from `id`, or null when there is nothing there: siblings
 * stop at the ends (no wrap, no jump to a cousin), a node without a parent
 * has neither parent nor siblings, and a leaf has no first child.
 */
export function hierarchyStep(tree: Hierarchy, id: string, step: HierarchyStep): string | null {
	if (step === "firstChild") return tree.children(id)[0] ?? null;
	const parent = tree.parent(id);
	if (parent === null) return null;
	if (step === "parent") return parent;
	const siblings = tree.children(parent);
	const index = siblings.indexOf(id);
	if (index < 0) return null;
	return siblings[index + (step === "prevSibling" ? -1 : 1)] ?? null;
}

/**
 * The hierarchy held in a graph's `hierarchy` edges (source is the parent),
 * children in edge order. Nodes `include` rejects are left out, as if absent.
 */
export function edgeHierarchy(edges: Iterable<{ kind: string; source: string; target: string }>, include: (id: string) => boolean = () => true): Hierarchy {
	const parents = new Map<string, string>();
	const children = new Map<string, string[]>();
	for (const edge of edges) {
		if (edge.kind !== "hierarchy" || !include(edge.source) || !include(edge.target)) continue;
		if (parents.has(edge.target)) continue;
		parents.set(edge.target, edge.source);
		const list = children.get(edge.source);
		if (list === undefined) children.set(edge.source, [edge.target]);
		else list.push(edge.target);
	}
	return {
		parent: (id) => parents.get(id) ?? null,
		children: (id) => children.get(id) ?? [],
	};
}
