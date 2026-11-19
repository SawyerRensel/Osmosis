import type { DeckNode, DeckScope } from "./types";

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

/**
 * Remove intermediate deck nodes that have no direct cards, promoting
 * their children up. This ensures folder-derived hierarchy only shows
 * folders that actually contain cards.
 *
 * Example: decks = ["Study/Math/Algebra"] with only Algebra having cards
 * → "Study" and "Math" are pruned, "Algebra" becomes a root node.
 *
 * If "Math" also has cards: "Study" is pruned, "Math" becomes root with
 * "Algebra" as a child.
 */
export function pruneDeckTree(roots: DeckNode[], realDecks: Set<string>): DeckNode[] {
	const result: DeckNode[] = [];

	for (const node of roots) {
		// Recurse first so children are pruned before we decide about this node
		node.children = pruneDeckTree(node.children, realDecks);

		if (realDecks.has(node.fullPath)) {
			// This node has real cards — keep it
			result.push(node);
		} else {
			// Intermediate node with no cards — promote its children
			result.push(...node.children);
		}
	}

	// Re-sort since promoted children may interleave
	result.sort((a, b) => a.name.localeCompare(b.name));

	return result;
}

/**
 * The deck tree as the dashboard and the study tab's deck picker show it:
 * every real deck, plus the path segments above an explicitly assigned deck so
 * its hierarchy survives pruning. Folder-derived decks keep no empty ancestors.
 */
export function visibleDeckTree(
	decks: string[],
	counts: Map<string, { new: number; learn: number; due: number }>,
	folderDerived: Set<string>,
): DeckNode[] {
	const keepPaths = new Set(decks);
	for (const deck of decks) {
		if (!folderDerived.has(deck)) {
			const parts = deck.split("/");
			for (let i = 1; i < parts.length; i++) {
				keepPaths.add(parts.slice(0, i).join("/"));
			}
		}
	}
	return pruneDeckTree(buildDeckTree(decks, counts), keepPaths);
}

/** What studying a deck row covers: the deck and its sub-decks when it has any. */
export function deckScopeOf(node: DeckNode): DeckScope {
	return node.children.length > 0
		? { type: "parent", deck: node.fullPath }
		: { type: "single", deck: node.fullPath };
}
