/**
 * Per-node styles in Cosmos: the `osmosis-styles` frontmatter the mind
 * map writes, resolved by the mind map's own rules, and what the plates and
 * near-tier panels draw from it. One styling system serves both views; see
 * `vault/Planner/3D Graph - Read node styles.md`.
 *
 * Resolution (`noteStyleReader`) is the mind map's LCVRT cascade:
 *
 * - **Local:** the note's `styles` entry, keyed by the line's block ID (`^id`,
 *   including a stamped `^os-`, see `planStyleKeys`), else the `_n:` stable
 *   ID, else the tree path (`lookupNodeStyleByPath`, as the mind map does).
 * - **Class:** the class the Local entry names, the note's then the global one.
 * - **Variant:** the note's active variant.
 * - **Theme:** only in the Overlays' *Mind map style* colour mode (a `themes`
 *   lookup is passed): the note's mind map theme, its base with the note's
 *   `baseStyle` merged in, then the depth's override (`noteTheme`). The depth
 *   is the mind map's: a heading's level, none (the base only) for any other
 *   line or the file-name root.
 * - **Base:** without a theme, the note's map-level `baseStyle` alone is the
 *   weakest layer, as the mind map merges it into an absent theme's base.
 *
 * In the other colour modes the theme is left out: the mode's colours stand in
 * for it, so a node with no style of its own looks as it always has.
 *
 * A node with no shape of its own takes the map's default, `osmosis-styles`
 * `topicShape`, in every colour mode, as the mind map does
 * (`style.shape ?? mapSettings.topicShape`). The theme's `topicShape` is not
 * read: the mind map's map settings always carry a `topicShape` (its default
 * is `rounded-rect`), so a theme's never reaches a node there either; picking a
 * theme in the sidebar writes its shape into the frontmatter instead.
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
	mergeNodeStyle,
	resolveNodeStyle,
	type BranchStyle,
	type NodeStyle,
	type OsmosisStyleFrontmatter,
	type ThemeDefinition,
	type TopicShape,
} from "../styles";
import { isDefaultTheme } from "../themes";
import { resolveBoundary, type ResolvedBoundary } from "../boundary";
import type { OsmosisNode } from "../types";
import { PLATE_RADIUS } from "./plates";
import { isTopicShape, type BorderDash } from "./plate-shapes";

/** A note's node → its resolved style, or undefined for a node with none. */
export type StyleOf = (node: OsmosisNode) => NodeStyle | undefined;

/** Finds a mind map theme by name: `getTheme(name, settings.customThemes)`. */
export type ThemeLookup = (name: string) => ThemeDefinition | undefined;

/**
 * The style reader for one note: its frontmatter, the root of its parse tree,
 * and the plugin's global classes. With `themes` (the *Mind map style* colour
 * mode) the note's mind map theme is the weakest layer. Null when nothing could
 * style a node, so an unstyled note costs nothing per line.
 */
export function noteStyleReader(
	frontmatter: Record<string, unknown> | null | undefined,
	root: OsmosisNode,
	globalClasses?: Record<string, NodeStyle>,
	themes?: ThemeLookup,
): StyleOf | null {
	const fm = parseOsmosisStyleFrontmatter(frontmatter);
	if (fm === undefined) return null;
	const base = isStyle(fm.baseStyle) ? fm.baseStyle : undefined;
	const theme = themes === undefined ? undefined : noteTheme(fm, themes);
	// The map's default shape, for a node whose style names none. The mind map's own default (rounded-rect) is Cosmos's too.
	const mapShape = isTopicShape(fm.topicShape) && fm.topicShape !== "rounded-rect" ? fm.topicShape : undefined;
	if (fm.styles === undefined && fm.activeVariant === undefined && base === undefined && theme === undefined && mapShape === undefined) return null;
	// Tree paths are the last resort of the Local lookup; built once, on first need.
	let paths: Map<string, string> | null = null;
	return (node) => {
		const path = fm.styles === undefined || node.type === "root" ? undefined : (paths ??= buildTreePathMap(root)).get(node.id);
		const local = valid(lookupNodeStyleByPath(fm, node.id, path, node.blockId));
		const classStyle = valid(lookupClassStyle(fm, local?.class, globalClasses));
		const variant = valid(lookupVariantStyle(fm, { source: node }));
		if (local === undefined && classStyle === undefined && variant === undefined && base === undefined && theme === undefined) return mapShape === undefined ? undefined : { shape: mapShape };
		// The mind map's depth: a heading's level; any other line, and the root, take the theme's base alone.
		const style = theme !== undefined
			? resolveNodeStyle(theme, node.type === "heading" ? node.depth : undefined, local, classStyle, variant)
			: resolveCascade({ local, class: classStyle, variant, theme: base });
		const shaped = style.shape === undefined && mapShape !== undefined ? { ...style, shape: mapShape } : style;
		return Object.keys(shaped).length > 0 ? shaped : undefined;
	};
}

/**
 * A note's mind map theme as the mind map draws it (`getEffectiveTheme`): the
 * theme its `osmosis-styles.theme` names, with the note's `baseStyle` merged
 * into the theme's base, so a depth's override still beats `baseStyle`.
 * Undefined for the Default theme (or an unknown name) with no `baseStyle`.
 */
export function noteTheme(fm: OsmosisStyleFrontmatter, themes: ThemeLookup): ThemeDefinition | undefined {
	const named = fm.theme === undefined || isDefaultTheme(fm.theme) ? undefined : themes(fm.theme);
	const active = named !== undefined && isStyle(named.base) && isStyle(named.depths) ? named : undefined;
	const base = isStyle(fm.baseStyle) ? fm.baseStyle : undefined;
	if (base === undefined) return active;
	const effective: ThemeDefinition = { ...(active ?? { name: "Default", base: {}, depths: {} }), base: { ...(active?.base ?? {}) } };
	mergeNodeStyle(effective.base, base);
	return effective;
}

/**
 * The background a single-note scene takes from its note in *Mind map style*
 * mode, by the mind map's precedence: the note's `osmosis-styles.background`,
 * else its theme's. Null for none, or for a colour WebGL can't draw (`cssColor`).
 */
export function mapBackground(frontmatter: Record<string, unknown> | null | undefined, themes: ThemeLookup): string | null {
	const fm = parseOsmosisStyleFrontmatter(frontmatter);
	if (fm === undefined) return null;
	return cssColor(fm.background ?? noteTheme(fm, themes)?.background);
}

/** Whether a style (or part of one) from frontmatter is a mapping: hand-written YAML can put anything there. */
function isStyle<T extends object>(value: T | undefined): value is T {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valid(style: NodeStyle | undefined): NodeStyle | undefined {
	return isStyle(style) ? style : undefined;
}

/**
 * The rectangles' corner radii, as a share of the plate's height. Every other
 * shape is drawn by its own outline (`./plate-shapes.ts`), and keeps the
 * default radius for what still treats it as a box (occlusion holes, the
 * inline editor).
 */
export const PLATE_CORNERS: Readonly<Partial<Record<TopicShape, number>>> = {
	rect: 0,
	"rounded-rect": PLATE_RADIUS,
	pill: 0.5,
};

/** The thickest outline drawn, as a multiple of the default; a style can ask for more. */
const MAX_STROKE = 8;

/**
 * What Cosmos draws from a node's style. Null colours keep what an
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
	/** The topic shape drawn: the style's, else the map's default (`noteStyleReader`), else rounded-rect. */
	shape: TopicShape;
	/** The border's dash; solid for none (`border.style: none` is a `stroke` of 0). */
	dash: BorderDash;
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
	shape: "rounded-rect",
	dash: "solid",
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
	const shape = isTopicShape(style.shape) ? style.shape : "rounded-rect";
	const borderColor = cssColor(border?.color);
	// The `none` shape has no outline unless the style gives it a colour, as the mind map's stylesheet draws it.
	const hidden = border?.style === "none" || (shape === "none" && borderColor === null);
	const stroke = hidden ? 0 : typeof width === "number" && Number.isFinite(width) ? Math.min(Math.max(width, 0), MAX_STROKE) : 1;
	return {
		fill: cssColor(style.fill),
		border: borderColor,
		text: cssColor(text?.color),
		stroke,
		corner: PLATE_CORNERS[shape] ?? PLATE_RADIUS,
		shape,
		dash: border?.style === "dashed" || border?.style === "dotted" ? border.style : "solid",
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
