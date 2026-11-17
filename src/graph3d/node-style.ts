/**
 * Per-node styles in the 3D graph: the `osmosis-styles` frontmatter the mind
 * map writes, resolved by the mind map's own rules, and what the plates and
 * near-tier panels draw from it. One styling system serves both views; see
 * `vault/Planner/3D Graph - Read node styles.md`.
 *
 * Resolution (`noteStyleReader`) is the mind map's LCVRT cascade with the
 * plugin theme left out:
 *
 * - **Local:** the note's `styles` entry, keyed by the line's block ID (`^id`,
 *   including a stamped `^os-`, see `planStyleKeys`), else the `_n:` stable
 *   ID, else the tree path (`lookupNodeStyleByPath`, as the mind map does).
 * - **Class:** the class the Local entry names, the note's then the global one.
 * - **Variant:** the note's active variant.
 * - **Base:** the note's map-level `baseStyle`, the weakest layer, as the mind
 *   map merges it into the theme's base.
 *
 * The theme itself is not applied: in 3D the Overlays' colour-by modes stand in
 * for it, so a node with no style of its own looks as it always has.
 *
 * Pure logic, no `obsidian` import, so it is unit-tested.
 */

import {
	buildTreePathMap,
	lookupClassStyle,
	lookupNodeStyleByPath,
	lookupVariantStyle,
	parseOsmosisStyleFrontmatter,
	resolveCascade,
	type BranchStyle,
	type NodeStyle,
	type TopicShape,
} from "../styles";
import { resolveBoundary, type ResolvedBoundary } from "../boundary";
import type { OsmosisNode } from "../types";
import { PLATE_RADIUS } from "./plates";

/** A note's node → its resolved style, or undefined for a node with none. */
export type StyleOf = (node: OsmosisNode) => NodeStyle | undefined;

/**
 * The style reader for one note: its frontmatter, the root of its parse tree,
 * and the plugin's global classes. Null when the note has no `osmosis-styles`
 * that could style a node, so an unstyled note costs nothing per line.
 */
export function noteStyleReader(
	frontmatter: Record<string, unknown> | null | undefined,
	root: OsmosisNode,
	globalClasses?: Record<string, NodeStyle>,
): StyleOf | null {
	const fm = parseOsmosisStyleFrontmatter(frontmatter);
	if (fm === undefined) return null;
	const base = isStyle(fm.baseStyle) ? fm.baseStyle : undefined;
	if (fm.styles === undefined && fm.activeVariant === undefined && base === undefined) return null;
	// Tree paths are the last resort of the Local lookup; built once, on first need.
	let paths: Map<string, string> | null = null;
	return (node) => {
		const path = fm.styles === undefined || node.type === "root" ? undefined : (paths ??= buildTreePathMap(root)).get(node.id);
		const local = valid(lookupNodeStyleByPath(fm, node.id, path, node.blockId));
		const classStyle = valid(lookupClassStyle(fm, local?.class, globalClasses));
		const variant = valid(lookupVariantStyle(fm, { source: node }));
		if (local === undefined && classStyle === undefined && variant === undefined && base === undefined) return undefined;
		const style = resolveCascade({ local, class: classStyle, variant, theme: base });
		return Object.keys(style).length > 0 ? style : undefined;
	};
}

/** Whether a style (or part of one) from frontmatter is a mapping: hand-written YAML can put anything there. */
function isStyle<T extends object>(value: T | undefined): value is T {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valid(style: NodeStyle | undefined): NodeStyle | undefined {
	return isStyle(style) ? style : undefined;
}

/**
 * The shapes a 3D plate draws, each as its corner radius (a share of the
 * plate's height). Any other `TopicShape` (ellipse, diamond, cloud, underline,
 * none, …) falls back to the default rounded plate: a plate is a one-line
 * label, and those shapes either need room it doesn't have or, like `none`,
 * would leave text floating with nothing to hide what is behind it.
 */
export const PLATE_CORNERS: Readonly<Partial<Record<TopicShape, number>>> = {
	rect: 0,
	"rounded-rect": PLATE_RADIUS,
	pill: 0.5,
};

/** The thickest outline drawn, as a multiple of the default; a style can ask for more. */
const MAX_STROKE = 8;

/**
 * What the 3D graph draws from a node's style. Null colours keep what an
 * unstyled node has: the theme's plate fill and text colour, and the colour-by
 * mode's outline.
 */
export interface NodeLook {
	fill: string | null;
	border: string | null;
	text: string | null;
	/** Outline thickness, as a multiple of the default plate outline (the mind map's 1 px border); 0 draws none. */
	stroke: number;
	/** Corner radius, as a share of the plate's height (`PLATE_CORNERS`). */
	corner: number;
	/** The style's custom width, in mind-map px (`NodeStyle.width`), for the node-width ticket to draw. */
	width: number | null;
	/** The style's branch line, for the tapered-edges ticket to draw. */
	branchLine: BranchStyle | null;
	/**
	 * The node's boundary (cloud) around its subtree, defaults applied; null for
	 * none. Colours are `cssColor`-checked: null = the view's accent.
	 */
	boundary: ResolvedBoundary | null;
}

/** An unstyled node's look: exactly today's plate. */
export const DEFAULT_LOOK: Readonly<NodeLook> = Object.freeze({
	fill: null,
	border: null,
	text: null,
	stroke: 1,
	corner: PLATE_RADIUS,
	width: null,
	branchLine: null,
	boundary: null,
});

/** The look a node's resolved style gives it (`DEFAULT_LOOK` for none). */
export function nodeLook(style: NodeStyle | undefined): NodeLook {
	if (style === undefined) return DEFAULT_LOOK;
	const border = isStyle(style.border) ? style.border : undefined;
	const text = isStyle(style.text) ? style.text : undefined;
	const width = border?.width;
	const stroke = border?.style === "none" ? 0 : typeof width === "number" && Number.isFinite(width) ? Math.min(Math.max(width, 0), MAX_STROKE) : 1;
	return {
		fill: cssColor(style.fill),
		border: cssColor(border?.color),
		text: cssColor(text?.color),
		stroke,
		corner: (style.shape !== undefined ? PLATE_CORNERS[style.shape] : undefined) ?? PLATE_RADIUS,
		width: typeof style.width === "number" && style.width > 0 ? style.width : null,
		branchLine: isStyle(style.branchLine) ? style.branchLine : null,
		boundary: boundaryLook(style),
	};
}

/** `resolveBoundary`, its colours limited to what WebGL can draw (`cssColor`). */
function boundaryLook(style: NodeStyle): ResolvedBoundary | null {
	const b = resolveBoundary(style);
	return b === null ? null : { ...b, fill: cssColor(b.fill), stroke: cssColor(b.stroke) };
}

/**
 * `value` if it is a colour the plates can draw (`#rgb`, `#rrggbb`, `rgb()`,
 * `hsl()` or a colour name), else null and the default is kept. A CSS
 * variable or an 8-digit hex can't be read by the WebGL plates, so it is not
 * applied to the panels either: a node looks the same near and far.
 */
export function cssColor(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const color = value.trim();
	if (/^(?:transparent|currentcolor|inherit|initial|unset|none)$/i.test(color)) return null;
	return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) || /^(?:rgb|hsl)a?\([^()]*\)$/i.test(color) || /^[a-z]+$/i.test(color) ? color : null;
}
