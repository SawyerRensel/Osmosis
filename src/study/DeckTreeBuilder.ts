import type { DeckNode } from "./types";

/**
 * Build a hierarchical deck tree from flat deck paths and per-deck counts.
 *
 * Example: ["math", "math/algebra", "math/calculus", "history"]
 * → tree with "math" (children: algebra, calculus) and "history"
 *
 * Parent counts aggregate their own counts + all children recursively.
 */
export function buildDeckTree(
	decks: string[],
	counts: Map<string, { new: number; learn: number; due: number }>,
): DeckNode[] {
	// Build a flat map of fullPath → DeckNode
	const nodeMap = new Map<string, DeckNode>();

	for (const deckPath of decks) {
		const parts = deckPath.split("/");
		let currentPath = "";

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i]!;
			currentPath = i === 0 ? part : `${currentPath}/${part}`;

			if (!nodeMap.has(currentPath)) {
				const ownCounts = counts.get(currentPath) ?? { new: 0, learn: 0, due: 0 };
				nodeMap.set(currentPath, {
					name: part,
					fullPath: currentPath,
					newCount: ownCounts.new,
					learnCount: ownCounts.learn,
					dueCount: ownCounts.due,
					children: [],
				});
			}
		}
	}

	// Wire parent-child relationships
	const roots: DeckNode[] = [];

	for (const [fullPath, node] of nodeMap) {
		const lastSlash = fullPath.lastIndexOf("/");
		if (lastSlash === -1) {
			// Root-level deck
			roots.push(node);
		} else {
			const parentPath = fullPath.substring(0, lastSlash);
			const parent = nodeMap.get(parentPath);
			if (parent) {
				parent.children.push(node);
			} else {
				// Orphan — shouldn't happen if decks list is consistent, but treat as root
				roots.push(node);
			}
		}
	}

	// Sort children alphabetically at each level
	const sortChildren = (nodes: DeckNode[]): void => {
		nodes.sort((a, b) => a.name.localeCompare(b.name));
		for (const node of nodes) {
			sortChildren(node.children);
		}
	};
	sortChildren(roots);

	// Aggregate counts bottom-up: parent = own + sum(children)
	const aggregate = (node: DeckNode): void => {
		for (const child of node.children) {
			aggregate(child);
			node.newCount += child.newCount;
			node.learnCount += child.learnCount;
			node.dueCount += child.dueCount;
		}
	};
	for (const root of roots) {
		aggregate(root);
	}

	return roots;
}
