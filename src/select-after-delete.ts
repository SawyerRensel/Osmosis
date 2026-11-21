/**
 * Which node to select once lines are deleted, shared by the 2D mind map and
 * Cosmos (no `obsidian` import, so it is unit-tested).
 */

/** The part of a parse-tree node this needs; `OsmosisNode` satisfies it. */
export interface TreeNode {
	id: string;
	children: readonly TreeNode[];
}

/**
 * The node to select after `deletedIds` are removed from the tree under
 * `root`: the previous sibling of the first deleted node in document order,
 * else that node's parent. Null when that parent is `root` itself (a top-level
 * line with nothing before it): the caller picks what stands for the root (the
 * Cosmos's note core; the 2D map has no selectable root). `root` is never a
 * deleted node, so an id that names it is ignored, and so is one that is not
 * in the tree; with none left, null.
 *
 * "First" is the order of a depth-first walk, so a deleted parent and its
 * deleted child anchor on the parent. Siblings that are themselves deleted are
 * skipped, so the result always survives.
 */
export function selectAfterDelete(root: TreeNode, deletedIds: Iterable<string>): string | null {
	const deleted = new Set(deletedIds);
	deleted.delete(root.id);
	if (deleted.size === 0) return null;
	const anchor = firstDeleted(root, deleted);
	if (anchor === null) return null;
	const { parent, index } = anchor;
	for (let i = index - 1; i >= 0; i--) {
		const sibling = parent.children[i]!;
		if (!deleted.has(sibling.id)) return sibling.id;
	}
	return parent === root ? null : parent.id;
}

/** The first node of `deleted` met walking `root` depth-first (document order), with its parent and place among its siblings. */
function firstDeleted(root: TreeNode, deleted: ReadonlySet<string>): { parent: TreeNode; index: number } | null {
	// Pre-order: a node comes before its children, which come before its next sibling.
	const stack: { parent: TreeNode; index: number }[] = [];
	for (let index = root.children.length - 1; index >= 0; index--) stack.push({ parent: root, index });
	while (stack.length > 0) {
		const at = stack.pop()!;
		const node = at.parent.children[at.index]!;
		if (deleted.has(node.id)) return at;
		for (let index = node.children.length - 1; index >= 0; index--) stack.push({ parent: node, index });
	}
	return null;
}
