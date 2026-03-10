import { OsmosisNode, OsmosisTree } from "./types";
import type { BalanceMode, LayoutSide, TopicShape } from "./styles";
import { getShapeInsets } from "./shapes";

/** Layout direction for the mind map. */
export type LayoutDirection = "left-right" | "top-down";

/** Rectangle representing a node's position and size in the layout. */
export interface LayoutRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** A node with computed layout position. */
export interface LayoutNode {
	/** Reference to the source AST node. */
	source: OsmosisNode;
	/** Computed position and size. */
	rect: LayoutRect;
	/** Depth in the tree (0 = root). */
	depth: number;
	/** Whether this node's children are collapsed. */
	collapsed: boolean;
	/** Laid-out children. */
	children: LayoutNode[];
	/** Parent node, null for root. */
	parent: LayoutNode | null;
	/** Which side of the root this subtree is on (for balance modes). */
	side?: "primary" | "secondary";
}

/** Bounding box of the entire laid-out tree. */
export interface LayoutBounds {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	width: number;
	height: number;
}

/** Result of a layout computation. */
export interface LayoutResult {
	root: LayoutNode;
	bounds: LayoutBounds;
	nodes: LayoutNode[];
}

/** Configuration for the layout algorithm. */
export interface LayoutConfig {
	direction: LayoutDirection;
	/** Horizontal spacing between a parent and its children. */
	horizontalSpacing: number;
	/** Vertical spacing between siblings. */
	verticalSpacing: number;
	/** Padding inside each node around its content. */
	nodePaddingX: number;
	nodePaddingY: number;
	/** Default node width when no DOM measurement is available. */
	defaultNodeWidth: number;
	/** Default node height when no DOM measurement is available. */
	defaultNodeHeight: number;
	/** Maximum node width before text wraps. */
	maxNodeWidth: number;
	/** Active topic shape — used to compute shape-specific padding. */
	topicShape: TopicShape;
	/** Balance mode for child distribution around root. */
	balance: BalanceMode;
	/** Which side children are placed on (for one-side balance). */
	layoutSide: LayoutSide;
}

export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
	direction: "left-right",
	horizontalSpacing: 80,
	verticalSpacing: 8,
	nodePaddingX: 8,
	nodePaddingY: 4,
	defaultNodeWidth: 120,
	defaultNodeHeight: 28,
	maxNodeWidth: 300,
	topicShape: "rounded-rect",
	balance: "one-side",
	layoutSide: "right",
};

/** Optional externally-measured sizes keyed by node ID. */
export type NodeSizeMap = Map<string, { width: number; height: number }>;

/**
 * Compute the layout for an OsmosisTree.
 *
 * Algorithm: bottom-up sizing + top-down positioning.
 * 1. Build LayoutNode tree from OsmosisTree.
 * 2. Estimate or use measured sizes for each node.
 * 3. Compute subtree heights bottom-up.
 * 4. Position nodes top-down, centering parents relative to children.
 *
 * For "left-right" direction: primary axis is X (parent→child), secondary is Y (siblings).
 * For "top-down" direction: primary axis is Y (parent→child), secondary is X (siblings).
 * Internally we compute in left-right orientation, then rotate for top-down.
 */
export function computeLayout(
	tree: OsmosisTree,
	config: Partial<LayoutConfig> = {},
	collapsedIds?: Set<string>,
	nodeSizes?: NodeSizeMap,
	nodeShapes?: Map<string, TopicShape>,
	nodeSides?: Map<string, LayoutSide>,
): LayoutResult {
	const cfg = { ...DEFAULT_LAYOUT_CONFIG, ...config };
	const isTopDown = cfg.direction === "top-down";
	const needsBalance = cfg.balance !== "one-side";
	// "right" and "down" are primary (default) sides; "left" and "up" are mirrored.
	const isDefaultSide = cfg.layoutSide === "right" || cfg.layoutSide === "down";

	// Build layout tree
	const root = buildLayoutTree(tree.root, null, 0, collapsedIds);

	// Assign sizes
	assignSizes(root, cfg, nodeSizes, nodeShapes);

	// For top-down layout we compute internally in left-right orientation then
	// rotate.  Swap each node's width↔height before layout so the primary axis
	// (X during LR computation) uses the node's actual height and the secondary
	// axis (Y) uses its actual width.  The final rotation swaps them back.
	if (isTopDown) {
		swapDimensions(root);
	}

	let nodes: LayoutNode[];

	// Find the balance pivot: the node whose children get split across sides.
	// The parser creates a virtual root (type="root") → H1 → H2s.
	// Balance applies at the first node with multiple children (usually H1).
	const pivot = needsBalance ? findBalancePivot(root) : null;

	if (pivot && pivot.children.length > 1) {
		const { primary, secondary } = splitChildrenBySide(
			pivot.children,
			cfg.balance,
			nodeSides,
		);

		// Lay out each group as an independent tree under the pivot.
		// positionNodes positions children relative to a parent at (x, y).
		// The pivot copy acts as the root for each group.

		// Primary group: standard right-side layout
		const primaryPivot = { ...pivot, children: primary };
		computeSubtreeSpans(primaryPivot, cfg);
		positionNodes(primaryPivot, 0, 0, cfg);

		// Secondary group: standard right-side layout, then mirror
		const secondaryPivot = { ...pivot, children: secondary };
		computeSubtreeSpans(secondaryPivot, cfg);
		positionNodes(secondaryPivot, 0, 0, cfg);
		mirrorNodes(secondary);

		markSide(primary, "primary");
		markSide(secondary, "secondary");

		// Reassemble pivot's children in original order
		const sourceChildren = pivot.source.children;
		pivot.children = [...primary, ...secondary].sort((a, b) => {
			const aIdx = sourceChildren.indexOf(a.source);
			const bIdx = sourceChildren.indexOf(b.source);
			return aIdx - bIdx;
		});
		for (const child of pivot.children) {
			child.parent = pivot;
		}

		// Position the ancestor chain (root → ... → pivot) as a leaf.
		const savedChildren = pivot.children;
		pivot.children = [];
		computeSubtreeSpans(root, cfg);
		positionNodes(root, 0, 0, cfg);
		pivot.children = savedChildren;

		// Now offset each child subtree to attach to the pivot's position.
		// Both groups were laid out with their virtual pivot at (0, 0).
		// The pivot's children start at x = pivot.rect.width + hSpacing
		// (since positionNodes uses childX = x + width + hSpacing for non-root).
		// But the virtual pivot copies had the same rect as the real pivot,
		// so children are already offset by (pivotWidth + hSpacing) from x=0.
		// We just need to shift them to the real pivot's position.
		const dx = pivot.rect.x;
		const pivotCenterY = pivot.rect.y + pivot.rect.height / 2;

		// Center primary group around pivot's Y center and shift to pivot's X
		const primarySpan = totalGroupSpan(primary, cfg);
		let py = pivotCenterY - primarySpan / 2;
		for (const child of primary) {
			const span = getSubtreeSpan(child);
			// The child's slot starts at child.rect.y minus the centering offset
			const childSlotY = child.rect.y - (span - child.rect.height) / 2;
			offsetSubtree(child, dx, py - childSlotY);
			py += span + cfg.verticalSpacing;
		}

		// Center secondary group around pivot's Y center and shift to pivot's X
		const secondarySpan = totalGroupSpan(secondary, cfg);
		let sy = pivotCenterY - secondarySpan / 2;
		for (const child of secondary) {
			const span = getSubtreeSpan(child);
			const childSlotY = child.rect.y - (span - child.rect.height) / 2;
			offsetSubtree(child, dx, sy - childSlotY);
			sy += span + cfg.verticalSpacing;
		}

		nodes = [];
		collectNodes(root, nodes);
	} else {
		// Standard single-side layout
		computeSubtreeSpans(root, cfg);
		positionNodes(root, 0, 0, cfg);

		nodes = [];
		collectNodes(root, nodes);

		// Mark all as primary
		markSide(root.children, "primary");

		// Mirror if non-default side (e.g., "left" in horizontal mode)
		if (!isDefaultSide) {
			mirrorNodes(root.children);
			markSide(root.children, "secondary");
		}
	}

	// Rotate for top-down if needed
	if (isTopDown) {
		for (const node of nodes) {
			const { x, y, width, height } = node.rect;
			node.rect = { x: y, y: x, width: height, height: width };
		}
	}

	// Compute bounds
	const bounds = computeBounds(nodes);

	return { root, bounds, nodes };
}

/**
 * Split root's children into primary (default side) and secondary (opposite side) groups.
 */
function splitChildrenBySide(
	children: LayoutNode[],
	balance: BalanceMode,
	nodeSides?: Map<string, LayoutSide>,
): { primary: LayoutNode[]; secondary: LayoutNode[] } {
	const primary: LayoutNode[] = [];
	const secondary: LayoutNode[] = [];

	if (balance === "alternating") {
		for (let i = 0; i < children.length; i++) {
			const child = children[i]!;
			if (i % 2 === 0) {
				primary.push(child);
			} else {
				secondary.push(child);
			}
		}
	} else {
		// "both-sides": split evenly, then apply per-node overrides
		const mid = Math.ceil(children.length / 2);
		for (let i = 0; i < children.length; i++) {
			const child = children[i]!;
			if (i < mid) {
				primary.push(child);
			} else {
				secondary.push(child);
			}
		}
	}

	// Apply per-node side overrides
	if (nodeSides) {
		const toReassign: { node: LayoutNode; target: "primary" | "secondary" }[] = [];
		for (const node of [...primary, ...secondary]) {
			const side = nodeSides.get(node.source.id);
			if (!side) continue;
			// "right" and "down" are primary sides; "left" and "up" are secondary
			const targetSide = (side === "left" || side === "up") ? "secondary" : "primary";
			const currentSide = primary.includes(node) ? "primary" : "secondary";
			if (targetSide !== currentSide) {
				toReassign.push({ node, target: targetSide });
			}
		}
		for (const { node, target } of toReassign) {
			if (target === "primary") {
				const idx = secondary.indexOf(node);
				if (idx >= 0) secondary.splice(idx, 1);
				primary.push(node);
			} else {
				const idx = primary.indexOf(node);
				if (idx >= 0) primary.splice(idx, 1);
				secondary.push(node);
			}
		}
	}

	return { primary, secondary };
}

/**
 * Find the balance pivot: the first node with multiple children.
 * Walks down single-child chains (root → H1 → ...) until it finds
 * a node with 2+ children whose branches should be split.
 */
function findBalancePivot(node: LayoutNode): LayoutNode | null {
	if (node.children.length > 1) return node;
	if (node.children.length === 1) return findBalancePivot(node.children[0]!);
	return null;
}

/** Offset all nodes in a subtree by (dx, dy). */
function offsetSubtree(node: LayoutNode, dx: number, dy: number): void {
	node.rect.x += dx;
	node.rect.y += dy;
	for (const child of node.children) {
		offsetSubtree(child, dx, dy);
	}
}

/** Compute the total span (secondary axis) of a group of children. */
function totalGroupSpan(children: LayoutNode[], cfg: LayoutConfig): number {
	let total = 0;
	for (let i = 0; i < children.length; i++) {
		if (i > 0) total += cfg.verticalSpacing;
		total += getSubtreeSpan(children[i]!);
	}
	return total;
}

/** Swap width↔height for all nodes in a subtree (used for top-down pre/post). */
function swapDimensions(node: LayoutNode): void {
	const tmp = node.rect.width;
	node.rect.width = node.rect.height;
	node.rect.height = tmp;
	for (const child of node.children) {
		swapDimensions(child);
	}
}

/** Mirror nodes horizontally: negate x so they extend to the left. */
function mirrorNodes(nodes: LayoutNode[]): void {
	for (const node of nodes) {
		mirrorSubtree(node);
	}
}

function mirrorSubtree(node: LayoutNode): void {
	node.rect.x = -(node.rect.x + node.rect.width);
	for (const child of node.children) {
		mirrorSubtree(child);
	}
}

/** Recursively mark all nodes in a list of subtrees with a side. */
function markSide(nodes: LayoutNode[], side: "primary" | "secondary"): void {
	for (const node of nodes) {
		markSubtreeSide(node, side);
	}
}

function markSubtreeSide(node: LayoutNode, side: "primary" | "secondary"): void {
	node.side = side;
	for (const child of node.children) {
		markSubtreeSide(child, side);
	}
}

function buildLayoutTree(
	source: OsmosisNode,
	parent: LayoutNode | null,
	depth: number,
	collapsedIds?: Set<string>,
): LayoutNode {
	const collapsed = collapsedIds?.has(source.id) ?? false;
	const node: LayoutNode = {
		source,
		rect: { x: 0, y: 0, width: 0, height: 0 },
		depth,
		collapsed,
		children: [],
		parent,
	};

	if (!collapsed) {
		node.children = source.children.map((child) =>
			buildLayoutTree(child, node, depth + 1, collapsedIds),
		);
	}

	return node;
}

function assignSizes(
	node: LayoutNode,
	cfg: LayoutConfig,
	nodeSizes?: NodeSizeMap,
	nodeShapes?: Map<string, TopicShape>,
): void {
	if (node.source.type === "root") {
		// Root node has no visual representation
		node.rect.width = 0;
		node.rect.height = 0;
	} else {
		const measured = nodeSizes?.get(node.source.id);
		let contentW: number;
		let contentH: number;
		if (measured) {
			contentW = measured.width;
			contentH = measured.height;
		} else {
			contentW = estimateNodeWidth(node.source, cfg);
			contentH = cfg.defaultNodeHeight;
		}

		// Use per-node shape override if available, else fall back to global
		const effectiveShape = nodeShapes?.get(node.source.id) ?? cfg.topicShape;

		if (effectiveShape === "circle") {
			// Circle: size so the inscribed content area (after insets) fits content.
			const paddedW = contentW + cfg.nodePaddingX * 2;
			const paddedH = contentH + cfg.nodePaddingY * 2;
			const insets = getShapeInsets("circle");
			const availFrac = 1 - insets.left - insets.right; // 0.84
			const fromMax = Math.max(paddedW, paddedH) / availFrac;
			const fromDiag = Math.sqrt(paddedW * paddedW + paddedH * paddedH);
			const diameter = Math.max(fromMax, fromDiag);
			node.rect.width = diameter;
			node.rect.height = diameter;
		} else {
			// Inflate node dimensions to account for shape insets so content fits
			// within the inscribed rectangle of the shape.
			const insets = getShapeInsets(effectiveShape);
			const totalInsetX = Math.min(insets.left, 0.45) + Math.min(insets.right, 0.45);
			const totalInsetY = Math.min(insets.top, 0.45) + Math.min(insets.bottom, 0.45);

			const scaleX = totalInsetX > 0 ? 1 / (1 - totalInsetX) : 1;
			const scaleY = totalInsetY > 0 ? 1 / (1 - totalInsetY) : 1;

			node.rect.width = (contentW + cfg.nodePaddingX * 2) * scaleX;
			node.rect.height = (contentH + cfg.nodePaddingY * 2) * scaleY;
		}
	}

	for (const child of node.children) {
		assignSizes(child, cfg, nodeSizes, nodeShapes);
	}
}

/**
 * Estimate node width from content length.
 * Rough heuristic: ~7px per character, clamped to maxNodeWidth.
 */
function estimateNodeWidth(source: OsmosisNode, cfg: LayoutConfig): number {
	const charWidth = 7;
	const estimated = source.content.length * charWidth;
	return Math.min(Math.max(estimated, 40), cfg.maxNodeWidth);
}

/**
 * Subtree span: how much secondary-axis space this node and its
 * descendants need. Stored temporarily on the node via a WeakMap.
 */
const subtreeSpanMap = new WeakMap<LayoutNode, number>();

function getSubtreeSpan(node: LayoutNode): number {
	return subtreeSpanMap.get(node) ?? node.rect.height;
}

function computeSubtreeSpans(node: LayoutNode, cfg: LayoutConfig): number {
	if (node.children.length === 0) {
		const span = node.rect.height;
		subtreeSpanMap.set(node, span);
		return span;
	}

	let totalChildSpan = 0;
	for (const [i, child] of node.children.entries()) {
		if (i > 0) totalChildSpan += cfg.verticalSpacing;
		totalChildSpan += computeSubtreeSpans(child, cfg);
	}

	// The node's span is the max of its own height and its children's total span
	const span = Math.max(node.rect.height, totalChildSpan);
	subtreeSpanMap.set(node, span);
	return span;
}

/**
 * Position nodes in left-right orientation.
 * Primary axis (x): determined by depth and horizontal spacing.
 * Secondary axis (y): children are distributed within the parent's subtree span.
 */
function positionNodes(
	node: LayoutNode,
	x: number,
	y: number,
	cfg: LayoutConfig,
): void {
	const subtreeSpan = getSubtreeSpan(node);

	// Center this node vertically within its subtree span
	node.rect.x = x;
	node.rect.y = y + (subtreeSpan - node.rect.height) / 2;

	if (node.children.length === 0) return;

	// Position children
	const childX = x + (node.source.type === "root" ? 0 : node.rect.width + cfg.horizontalSpacing);
	let childY = y;

	// If the children's total span is less than the subtree span,
	// center the children block
	let totalChildSpan = 0;
	for (const [i, child] of node.children.entries()) {
		if (i > 0) totalChildSpan += cfg.verticalSpacing;
		totalChildSpan += getSubtreeSpan(child);
	}
	childY += (subtreeSpan - totalChildSpan) / 2;

	for (const child of node.children) {
		const childSpan = getSubtreeSpan(child);
		positionNodes(child, childX, childY, cfg);
		childY += childSpan + cfg.verticalSpacing;
	}
}

function collectNodes(node: LayoutNode, out: LayoutNode[]): void {
	out.push(node);
	for (const child of node.children) {
		collectNodes(child, out);
	}
}

function computeBounds(nodes: LayoutNode[]): LayoutBounds {
	if (nodes.length === 0) {
		return { x1: 0, y1: 0, x2: 0, y2: 0, width: 0, height: 0 };
	}

	let x1 = Infinity;
	let y1 = Infinity;
	let x2 = -Infinity;
	let y2 = -Infinity;

	for (const node of nodes) {
		if (node.source.type === "root") continue;
		x1 = Math.min(x1, node.rect.x);
		y1 = Math.min(y1, node.rect.y);
		x2 = Math.max(x2, node.rect.x + node.rect.width);
		y2 = Math.max(y2, node.rect.y + node.rect.height);
	}

	if (!isFinite(x1)) {
		return { x1: 0, y1: 0, x2: 0, y2: 0, width: 0, height: 0 };
	}

	return { x1, y1, x2, y2, width: x2 - x1, height: y2 - y1 };
}
