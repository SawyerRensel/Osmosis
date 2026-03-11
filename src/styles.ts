/**
 * Stylable property schema and LCVRT cascade resolver for Osmosis mind maps.
 *
 * Every stylable property on every node resolves via a deterministic cascade
 * (strongest to weakest): Local > Class > Variant > Reference > Theme.
 *
 * v1.0 ships L, C, R, T levels. V (Variant) is v1.1.
 * All overrides are sparse — only changed properties need to be specified.
 */

import type { LayoutDirection } from "./layout";

export type BranchLineStyle = "curved" | "straight" | "angular" | "rounded-elbow";
export type BranchLinePattern = "solid" | "dashed" | "dotted";
export type BranchLineTaper = "none" | "fade" | "grow";

// ─── Layout Modes ───────────────────────────────────────────────────────────

export type MapLayout = "classic" | "radial";
export type BalanceMode = "one-side" | "both-sides" | "alternating";
export type LayoutSide = "right" | "left" | "down" | "up";

// ─── Topic Shapes ───────────────────────────────────────────────────────────

export type TopicShape =
	| "rect"
	| "rounded-rect"
	| "ellipse"
	| "diamond"
	| "hexagon"
	| "underline"
	| "pill"
	| "parallelogram"
	| "trapezoid"
	| "octagon"
	| "cloud"
	| "circle"
	| "triangle"
	| "arrow-right"
	| "none";

// ─── Style Sub-Objects ──────────────────────────────────────────────────────

export interface TextStyle {
	font?: string;
	size?: number;
	weight?: number;
	color?: string;
	alignment?: "left" | "center" | "right" | "justify";
	style?: "normal" | "italic";
}

export interface BorderStyle {
	color?: string;
	width?: number;
	style?: "solid" | "dashed" | "dotted" | "none";
}

export interface BranchStyle {
	style?: "curved" | "straight" | "angular" | "rounded-elbow";
	color?: string;
	thickness?: number;
	pattern?: BranchLinePattern;
	taper?: BranchLineTaper;
}

// ─── Node Style (per-node stylable properties) ─────────────────────────────

/** All stylable properties for a single node. Every field is optional (sparse). */
export interface NodeStyle {
	shape?: TopicShape;
	fill?: string;
	border?: BorderStyle;
	text?: TextStyle;
	branchLine?: BranchStyle;
	background?: string;
	/** Custom content width in pixels (set via drag-to-resize). */
	width?: number;
	/** Assigned style class name (metadata, not a visual property). */
	class?: string;
	/** Which side of the parent this node is placed on (for balance modes). */
	side?: LayoutSide;
}

// ─── Theme Definition ───────────────────────────────────────────────────────

/** Style defaults for a specific depth level within a theme. */
export type DepthStyle = NodeStyle;

/**
 * A theme is a named, reusable style definition providing defaults
 * for every stylable property at each depth level.
 */
export interface ThemeDefinition {
	/** Unique theme name (e.g., "Ocean", "Solarized Dark"). */
	name: string;

	/** Base style applied to all nodes before depth overrides. */
	base: NodeStyle;

	/** Per-depth-level style overrides (key is depth as string: "1", "2", etc.). */
	depths: Record<string, DepthStyle>;

	/** Whether to auto-assign distinct colors per top-level branch. */
	coloredBranches?: boolean;

	/** Palette of colors for colored branches (cycled through). */
	branchColors?: string[];

	/** Default branch line style for the entire map. */
	branchLine?: BranchStyle;

	/** Map background color. */
	background?: string;

	/** Collapse toggle button colors. */
	collapseToggle?: {
		fill?: string;
		stroke?: string;
		icon?: string;
	};

	/** Default topic shape for the map. */
	topicShape?: TopicShape;

	/** Default layout direction for the map. */
	direction?: LayoutDirection;

	/** Default collapse depth for the map. */
	collapseDepth?: number;

	/** Horizontal spacing between parent and children. */
	horizontalSpacing?: number;

	/** Vertical spacing between sibling nodes. */
	verticalSpacing?: number;

	/** Maximum node width before text wraps (px). */
	maxNodeWidth?: number;
}

// ─── Map Settings ──────────────────────────────────────────────────────────

/** Per-map settings that override global defaults. */
export interface MapSettings {
	direction: LayoutDirection;
	branchLineStyle: BranchLineStyle;
	collapseDepth: number;
	horizontalSpacing: number;
	verticalSpacing: number;
	theme: string;
	topicShape: TopicShape;
	/** Map layout algorithm ("classic" tree or "radial"). */
	mapLayout: MapLayout;
	/** Balance mode for child distribution. */
	balance: BalanceMode;
	/** Which side children are placed on (for one-side balance). */
	layoutSide: LayoutSide;
	/** Map-level global node style overrides (fill, border, text). */
	baseStyle?: NodeStyle;
	/** Map background color override. */
	background?: string;
	/** Branch line color override. */
	branchLineColor?: string;
	/** Branch line thickness override. */
	branchLineThickness?: number;
	/** Branch line pattern override (solid, dashed, dotted). */
	branchLinePattern?: BranchLinePattern;
	/** Branch line taper override (none, fade, grow). */
	branchLineTaper?: BranchLineTaper;
	/** Maximum node width before text wraps (px). */
	maxNodeWidth?: number;
}

export const DEFAULT_MAP_SETTINGS: MapSettings = {
	direction: "left-right",
	branchLineStyle: "curved",
	collapseDepth: 0,
	horizontalSpacing: 80,
	verticalSpacing: 8,
	theme: "Default",
	topicShape: "rounded-rect",
	mapLayout: "classic",
	balance: "one-side",
	layoutSide: "right",
};

/** Keys in OsmosisStyleFrontmatter that correspond to MapSettings fields. */
const MAP_SETTING_FM_KEYS: (keyof OsmosisStyleFrontmatter & keyof MapSettings)[] = [
	"theme", "direction", "branchLineStyle", "collapseDepth",
	"horizontalSpacing", "verticalSpacing", "topicShape",
	"maxNodeWidth", "background", "branchLineColor",
	"branchLineThickness", "branchLinePattern", "branchLineTaper",
	"baseStyle", "mapLayout", "balance", "layoutSide",
];

/**
 * Extract MapSettings overrides from parsed frontmatter.
 * Returns only the fields that are explicitly set (sparse).
 */
export function buildMapSettingsFromFrontmatter(
	fm: OsmosisStyleFrontmatter | undefined,
): Partial<MapSettings> {
	if (!fm) return {};
	const result: Partial<MapSettings> = {};
	for (const key of MAP_SETTING_FM_KEYS) {
		if (fm[key] !== undefined) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
			(result as any)[key] = fm[key];
		}
	}
	return result;
}

// ─── Frontmatter Style Overrides ────────────────────────────────────────────

/**
 * The `osmosis-styles:` frontmatter key structure for per-note style overrides.
 * Keys in `styles` are either tree paths ("## Architecture") or
 * stable IDs ("_n:a3f2").
 */
export interface OsmosisStyleFrontmatter {
	/** Theme name to apply to this note's mind map. */
	theme?: string;

	/** Override colored branches for this note. */
	coloredBranches?: boolean;

	// ── Map-level settings (previously stored in data.json mapSettings) ──

	/** Layout direction for this note's mind map. */
	direction?: LayoutDirection;

	/** Branch line style for this note's mind map. */
	branchLineStyle?: BranchLineStyle;

	/** Auto-collapse depth (0 = no auto-collapse). */
	collapseDepth?: number;

	/** Horizontal spacing between parent and children (px). */
	horizontalSpacing?: number;

	/** Vertical spacing between sibling nodes (px). */
	verticalSpacing?: number;

	/** Default topic shape for nodes. */
	topicShape?: TopicShape;

	/** Maximum node width before text wraps (px). */
	maxNodeWidth?: number;

	/** Map background color override. */
	background?: string;

	/** Branch line color override. */
	branchLineColor?: string;

	/** Branch line thickness override. */
	branchLineThickness?: number;

	/** Branch line pattern override (solid, dashed, dotted). */
	branchLinePattern?: BranchLinePattern;

	/** Branch line taper override (none, fade, grow). */
	branchLineTaper?: BranchLineTaper;

	/** Map-level global node style overrides (fill, border, text). */
	baseStyle?: NodeStyle;

	/** Map layout algorithm. */
	mapLayout?: MapLayout;

	/** Balance mode for child distribution. */
	balance?: BalanceMode;

	/** Which side children are placed on (for one-side balance). */
	layoutSide?: LayoutSide;

	// ── Per-node overrides ──

	/** Per-node style overrides (Local level in LCVRT). */
	styles?: Record<string, NodeStyle>;

	/** Named reusable style bundles (Class level in LCVRT). */
	classes?: Record<string, NodeStyle>;

	/** Named variant configurations (Variant level in LCVRT). */
	variants?: Record<string, Record<string, NodeStyle>>;

	/** Currently active variant name. */
	activeVariant?: string;
}

// ─── LCVRT Cascade ──────────────────────────────────────────────────────────

/**
 * Inputs to the LCVRT cascade resolver for a single node.
 *
 * Each level is optional — missing levels are skipped.
 */
export interface CascadeInput {
	/** L — Local: per-node frontmatter override from the host note. */
	local?: NodeStyle;

	/** C — Class: named reusable style bundle. */
	class?: NodeStyle;

	/** V — Variant: switchable per-note style configuration. */
	variant?: NodeStyle;

	/** R — Reference: style from the transcluded note's own frontmatter. */
	reference?: NodeStyle;

	/** T — Theme: depth-level defaults from the active theme. */
	theme?: NodeStyle;
}

/**
 * Resolve a single node's style via the LCVRT cascade.
 *
 * Merges styles from strongest (Local) to weakest (Theme).
 * Sub-objects (text, border, branchLine) are merged field-by-field,
 * not replaced wholesale.
 *
 * @returns A fully or partially resolved NodeStyle.
 */
export function resolveCascade(input: CascadeInput): NodeStyle {
	// Ordered strongest → weakest.
	const layers: (NodeStyle | undefined)[] = [
		input.local,
		input.class,
		input.variant,
		input.reference,
		input.theme,
	];

	const result: NodeStyle = {};

	// Walk layers weakest → strongest so stronger layers overwrite.
	for (let i = layers.length - 1; i >= 0; i--) {
		const layer = layers[i];
		if (!layer) continue;
		mergeNodeStyle(result, layer);
	}

	return result;
}

/**
 * Merge `source` into `target`, overwriting scalar fields and
 * shallowly merging sub-objects (text, border, branchLine).
 */
export function mergeNodeStyle(target: NodeStyle, source: NodeStyle): void {
	if (source.shape !== undefined) target.shape = source.shape;
	if (source.fill !== undefined) target.fill = source.fill;
	if (source.background !== undefined) target.background = source.background;
	if (source.width !== undefined) target.width = source.width;

	if (source.text) {
		target.text = { ...target.text, ...source.text };
	}
	if (source.border) {
		target.border = { ...target.border, ...source.border };
	}
	if (source.branchLine) {
		target.branchLine = { ...target.branchLine, ...source.branchLine };
	}
}

/**
 * Resolve a node's full style given a theme, depth, and optional overrides.
 *
 * Convenience wrapper that constructs the theme-level NodeStyle from
 * a ThemeDefinition (base + depth overrides) and runs the cascade.
 */
export function resolveNodeStyle(
	theme: ThemeDefinition | undefined,
	depth: number | undefined,
	local?: NodeStyle,
	classStyle?: NodeStyle,
	variantStyle?: NodeStyle,
	reference?: NodeStyle,
): NodeStyle {
	let themeStyle: NodeStyle | undefined;

	if (theme) {
		// Merge base + depth-specific overrides to get the T-level style.
		themeStyle = { ...theme.base };
		const depthOverride = depth != null ? theme.depths[String(depth)] : undefined;
		if (depthOverride) {
			mergeNodeStyle(themeStyle, depthOverride);
		}
	}

	return resolveCascade({ local, class: classStyle, variant: variantStyle, reference, theme: themeStyle });
}

// ─── Frontmatter Parsing & Node-Style Lookup ─────────────────────────────

import type { OsmosisNode } from "./types";
import type { LayoutNode } from "./layout";

/** Stable-ID selector prefix. */
const STABLE_ID_PREFIX = "_n:";

/**
 * Build the tree-path selector string for a node in the layout tree.
 *
 * Tree paths use the markdown prefix of each ancestor:
 *   "## Architecture/- Intro/- Detail"
 *
 * Heading nodes use "## Content", bullet nodes use "- Content", etc.
 */
export function buildTreePath(layoutNode: LayoutNode): string {
	const segments: string[] = [];
	let current: LayoutNode | null = layoutNode;
	while (current && current.source.type !== "root") {
		segments.unshift(nodeToPathSegment(current.source));
		current = current.parent;
	}
	return segments.join("/");
}

/** Convert an OsmosisNode to its tree-path segment (e.g. "## Title", "- Item"). */
function nodeToPathSegment(node: OsmosisNode): string {
	switch (node.type) {
		case "heading":
			return "#".repeat(node.depth) + " " + node.content;
		case "bullet":
			return "- " + node.content;
		case "ordered":
			return "1. " + node.content;
		default:
			return node.content;
	}
}

/**
 * Build a stable-ID selector for a node.
 * Format: "_n:<first 12 chars of node.id>"
 */
export function buildStableIdSelector(node: OsmosisNode): string {
	return STABLE_ID_PREFIX + node.id;
}

/**
 * Build a map of nodeId → tree-path string from an OsmosisNode tree.
 *
 * This enables tree-path style lookups without needing LayoutNode parent
 * pointers, which is necessary during measurement (before layout is computed).
 */
export function buildTreePathMap(root: OsmosisNode): Map<string, string> {
	const map = new Map<string, string>();
	function walk(node: OsmosisNode, parentPath: string): void {
		if (node.type === "root") {
			for (const child of node.children) {
				walk(child, "");
			}
			return;
		}
		const segment = nodeToPathSegment(node);
		const path = parentPath ? `${parentPath}/${segment}` : segment;
		map.set(node.id, path);
		for (const child of node.children) {
			walk(child, path);
		}
	}
	walk(root, "");
	return map;
}

/**
 * Look up the Local-level style for a node using its ID and pre-built tree path.
 * Works without LayoutNode parent pointers — suitable for pre-layout measurement.
 */
export function lookupNodeStyleByPath(
	frontmatter: OsmosisStyleFrontmatter | undefined,
	nodeId: string,
	treePath: string | undefined,
): NodeStyle | undefined {
	if (!frontmatter?.styles) return undefined;
	const styles = frontmatter.styles;

	// 1. Stable ID selector (highest priority)
	const stableKey = STABLE_ID_PREFIX + nodeId;
	if (styles[stableKey]) return styles[stableKey];

	// 2. Tree path selector
	if (treePath && styles[treePath]) return styles[treePath];

	return undefined;
}

/**
 * Look up the Local-level style override for a node from parsed frontmatter.
 *
 * Checks both stable-ID selectors ("_n:a3f2...") and tree-path selectors.
 * Stable IDs take priority over tree paths if both match.
 */
export function lookupNodeStyle(
	frontmatter: OsmosisStyleFrontmatter | undefined,
	layoutNode: LayoutNode,
): NodeStyle | undefined {
	if (!frontmatter?.styles) return undefined;

	const styles = frontmatter.styles;

	// 1. Check stable ID selector (highest priority within Local level)
	const stableKey = STABLE_ID_PREFIX + layoutNode.source.id;
	if (styles[stableKey]) return styles[stableKey];

	// 2. Check tree path selector
	const treePath = buildTreePath(layoutNode);
	if (treePath && styles[treePath]) return styles[treePath];

	return undefined;
}

/**
 * Parse and validate the `osmosis` key from note frontmatter.
 *
 * Returns undefined if the key is missing or not an object.
 * Performs lightweight validation — trusts that YAML parsing produced
 * reasonable types since Obsidian's parser already handles the heavy lifting.
 */
export function parseOsmosisStyleFrontmatter(
	frontmatter: Record<string, unknown> | undefined | null,
): OsmosisStyleFrontmatter | undefined {
	if (!frontmatter) return undefined;

	const raw = frontmatter["osmosis-styles"];
	if (!raw || typeof raw !== "object") return undefined;

	const obj = raw as Record<string, unknown>;
	const result: OsmosisStyleFrontmatter = {};

	if (typeof obj["theme"] === "string") result.theme = obj["theme"];
	if (typeof obj["coloredBranches"] === "boolean") result.coloredBranches = obj["coloredBranches"];

	// Map-level settings
	if (typeof obj["direction"] === "string") result.direction = obj["direction"] as LayoutDirection;
	if (typeof obj["branchLineStyle"] === "string") result.branchLineStyle = obj["branchLineStyle"] as BranchLineStyle;
	if (typeof obj["collapseDepth"] === "number") result.collapseDepth = obj["collapseDepth"];
	if (typeof obj["horizontalSpacing"] === "number") result.horizontalSpacing = obj["horizontalSpacing"];
	if (typeof obj["verticalSpacing"] === "number") result.verticalSpacing = obj["verticalSpacing"];
	if (typeof obj["topicShape"] === "string") result.topicShape = obj["topicShape"] as TopicShape;
	if (typeof obj["maxNodeWidth"] === "number") result.maxNodeWidth = obj["maxNodeWidth"];
	if (typeof obj["background"] === "string") result.background = obj["background"];
	if (typeof obj["branchLineColor"] === "string") result.branchLineColor = obj["branchLineColor"];
	if (typeof obj["branchLineThickness"] === "number") result.branchLineThickness = obj["branchLineThickness"];
	if (typeof obj["branchLinePattern"] === "string") result.branchLinePattern = obj["branchLinePattern"] as BranchLinePattern;
	if (typeof obj["branchLineTaper"] === "string") result.branchLineTaper = obj["branchLineTaper"] as BranchLineTaper;
	if (obj["baseStyle"] && typeof obj["baseStyle"] === "object") {
		result.baseStyle = obj["baseStyle"] as NodeStyle;
	}
	if (typeof obj["mapLayout"] === "string") result.mapLayout = obj["mapLayout"] as MapLayout;
	if (typeof obj["balance"] === "string") result.balance = obj["balance"] as BalanceMode;
	if (typeof obj["layoutSide"] === "string") result.layoutSide = obj["layoutSide"] as LayoutSide;

	// Per-node overrides
	if (obj["styles"] && typeof obj["styles"] === "object") {
		result.styles = obj["styles"] as Record<string, NodeStyle>;
	}

	if (obj["classes"] && typeof obj["classes"] === "object") {
		result.classes = obj["classes"] as Record<string, NodeStyle>;
	}

	if (obj["variants"] && typeof obj["variants"] === "object") {
		result.variants = obj["variants"] as Record<string, Record<string, NodeStyle>>;
	}

	if (typeof obj["activeVariant"] === "string") {
		result.activeVariant = obj["activeVariant"];
	}

	return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Look up a class definition by name.
 * Checks local (per-note frontmatter) first, then global (plugin settings).
 */
export function lookupClassStyle(
	frontmatter: OsmosisStyleFrontmatter | undefined,
	className: string | undefined,
	globalClasses?: Record<string, NodeStyle>,
): NodeStyle | undefined {
	if (!className) return undefined;
	return frontmatter?.classes?.[className] ?? globalClasses?.[className];
}

/** Determine whether a class is local (per-note) or global. */
export function getClassScope(
	frontmatter: OsmosisStyleFrontmatter | undefined,
	className: string,
	globalClasses?: Record<string, NodeStyle>,
): "local" | "global" | undefined {
	if (frontmatter?.classes?.[className]) return "local";
	if (globalClasses?.[className]) return "global";
	return undefined;
}

/**
 * Look up the Variant-level style for a node from the active variant.
 *
 * Checks stable-ID selector first, then node content text, then wildcard "*".
 */
export function lookupVariantStyle(
	frontmatter: OsmosisStyleFrontmatter | undefined,
	layoutNode: LayoutNode,
): NodeStyle | undefined {
	if (!frontmatter?.variants || !frontmatter.activeVariant) return undefined;

	const variantDef = frontmatter.variants[frontmatter.activeVariant];
	if (!variantDef) return undefined;

	// 1. Stable ID selector
	const stableKey = STABLE_ID_PREFIX + layoutNode.source.id;
	if (variantDef[stableKey]) return variantDef[stableKey];

	// 2. Node content selector (e.g. "Architecture" matches a heading with that text)
	const content = layoutNode.source.content;
	if (content && variantDef[content]) return variantDef[content];

	// 3. Wildcard selector
	if (variantDef["*"]) return variantDef["*"];

	return undefined;
}
