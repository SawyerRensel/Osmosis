import { OsmosisNode, OsmosisTree } from "./types";

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
}

export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
	direction: "left-right",
	horizontalSpacing: 80,
	verticalSpacing: 8,
	nodePaddingX: 12,
	nodePaddingY: 6,
	defaultNodeWidth: 120,
	defaultNodeHeight: 28,
	maxNodeWidth: 300,
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
): LayoutResult {
	const cfg = { ...DEFAULT_LAYOUT_CONFIG, ...config };
	const isTopDown = cfg.direction === "top-down";

	// Build layout tree
	const root = buildLayoutTree(tree.root, null, 0, collapsedIds);

	// Assign sizes
	assignSizes(root, cfg, nodeSizes);

	// Compute subtree spans (secondary axis extent)
	computeSubtreeSpans(root, cfg);

	// Position nodes
	positionNodes(root, 0, 0, cfg);

	// Collect all nodes
	const nodes: LayoutNode[] = [];
	collectNodes(root, nodes);

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
): void {
	if (node.source.type === "root") {
		// Root node has no visual representation
		node.rect.width = 0;
		node.rect.height = 0;
	} else {
		const measured = nodeSizes?.get(node.source.id);
		if (measured) {
			node.rect.width = measured.width + cfg.nodePaddingX * 2;
			node.rect.height = measured.height + cfg.nodePaddingY * 2;
		} else {
			node.rect.width = estimateNodeWidth(node.source, cfg) + cfg.nodePaddingX * 2;
			node.rect.height = cfg.defaultNodeHeight + cfg.nodePaddingY * 2;
		}
	}

	for (const child of node.children) {
		assignSizes(child, cfg, nodeSizes);
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
