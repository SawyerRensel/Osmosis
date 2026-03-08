/**
 * Stylable property schema and LCVRT cascade resolver for Osmosis mind maps.
 *
 * Every stylable property on every node resolves via a deterministic cascade
 * (strongest to weakest): Local > Class > Variant > Reference > Theme.
 *
 * v1.0 ships L, R, T levels. C (Class) and V (Variant) are v1.1.
 * All overrides are sparse — only changed properties need to be specified.
 */

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
	alignment?: "left" | "center" | "right";
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
	tapering?: boolean;
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
}

// ─── Frontmatter Style Overrides ────────────────────────────────────────────

/**
 * The `osmosis:` frontmatter key structure for per-note style overrides.
 * Keys in `styles` are either tree paths ("## Architecture") or
 * stable IDs ("_n:a3f2").
 */
export interface OsmosisStyleFrontmatter {
	/** Theme name to apply to this note's mind map. */
	theme?: string;

	/** Override colored branches for this note. */
	coloredBranches?: boolean;

	/** Per-node style overrides (Local level in LCVRT). */
	styles?: Record<string, NodeStyle>;

	// v1.1: classes, variants, activeVariant
}

// ─── LCVRT Cascade ──────────────────────────────────────────────────────────

/**
 * Inputs to the LCVRT cascade resolver for a single node.
 *
 * v1.0 resolves L → R → T (Class and Variant are v1.1 stubs).
 * Each level is optional — missing levels are skipped.
 */
export interface CascadeInput {
	/** L — Local: per-node frontmatter override from the host note. */
	local?: NodeStyle;

	// v1.1: class?: NodeStyle;
	// v1.1: variant?: NodeStyle;

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
	// Ordered strongest → weakest. v1.1 will insert Class and Variant.
	const layers: (NodeStyle | undefined)[] = [
		input.local,
		// input.class,    // v1.1
		// input.variant,  // v1.1
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
function mergeNodeStyle(target: NodeStyle, source: NodeStyle): void {
	if (source.shape !== undefined) target.shape = source.shape;
	if (source.fill !== undefined) target.fill = source.fill;
	if (source.background !== undefined) target.background = source.background;

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

	return resolveCascade({ local, reference, theme: themeStyle });
}
