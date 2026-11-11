/**
 * Boundaries (clouds): a soft translucent blob drawn behind a node and every
 * visible node beneath it, so a branch reads as a group. One per node, set in
 * the style sidebar and stored in `osmosis-styles` as the node's `boundary`
 * style; never created automatically. The mind map draws them here; the 3D
 * graph reads the same resolved look from `NodeLook.boundary`.
 *
 * Pure logic, no `obsidian` import, so it is unit-tested.
 */

import type { BoundaryStyle, NodeStyle } from "./styles";

export interface Point {
	x: number;
	y: number;
}

export interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Gap between a boundary and what it wraps (and between nested boundaries), mind-map px. */
export const BOUNDARY_PADDING = 12;
/** Fill opacity of a boundary that sets none: soft enough to read the nodes through. */
export const DEFAULT_BOUNDARY_OPACITY = 0.15;
/** Outline thickness of a boundary that sets none, px. */
export const DEFAULT_BOUNDARY_WIDTH = 1;
/** The thickest outline a boundary style can ask for, px. */
export const MAX_BOUNDARY_WIDTH = 8;
/** How much more opaque a tinted outline is than the fill, so the edge reads without a hard line. */
const OUTLINE_LIFT = 0.35;

const LINE_STYLES = new Set(["solid", "dashed", "dotted", "none"]);

/**
 * The `boundary` style as written in frontmatter, cleaned: non-string colours,
 * unknown line styles and non-numbers are dropped, opacity is clamped to 0–1
 * and width to 0–{@link MAX_BOUNDARY_WIDTH}. Undefined when it is not a
 * mapping (hand-written YAML can put anything there).
 */
export function normalizeBoundary(raw: unknown): BoundaryStyle | undefined {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
	const r = raw as Record<string, unknown>;
	const out: BoundaryStyle = {};
	if (typeof r["enabled"] === "boolean") out.enabled = r["enabled"];
	const fill = colour(r["fill"]);
	if (fill !== undefined) out.fill = fill;
	const color = colour(r["color"]);
	if (color !== undefined) out.color = color;
	const opacity = r["opacity"];
	if (typeof opacity === "number" && Number.isFinite(opacity)) out.opacity = clamp(opacity, 0, 1);
	const width = r["width"];
	if (typeof width === "number" && Number.isFinite(width)) out.width = clamp(width, 0, MAX_BOUNDARY_WIDTH);
	const style = r["style"];
	if (typeof style === "string" && LINE_STYLES.has(style)) out.style = style as BoundaryStyle["style"];
	return out;
}

function colour(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function clamp(v: number, lo: number, hi: number): number {
	return Math.min(Math.max(v, lo), hi);
}

/** What a boundary is drawn with, every default applied. */
export interface ResolvedBoundary {
	/** Fill colour (any CSS colour the style holds); null = the theme accent. */
	fill: string | null;
	/** Fill opacity, 0–1. */
	fillOpacity: number;
	/** Outline colour; null = the theme accent. */
	stroke: string | null;
	/** Outline opacity, 0–1: a tinted outline is a little stronger than the fill, an explicit colour is opaque. */
	strokeOpacity: number;
	/** Outline thickness in mind-map px; 0 = no outline. */
	strokeWidth: number;
	dash: "solid" | "dashed" | "dotted";
}

/**
 * The node's colour a boundary is tinted by when it sets none: its fill, else
 * its border colour, else its branch line colour; null when the style sets
 * none of them (the view then uses its accent).
 */
export function nodeTint(style: NodeStyle | undefined): string | null {
	if (style === undefined) return null;
	return colour(style.fill) ?? colour(style.border?.color) ?? colour(style.branchLine?.color) ?? null;
}

/**
 * The boundary a node's resolved style asks for, or null for none (no
 * `boundary` key, or `enabled: false`). Unset colours take {@link nodeTint}.
 */
export function resolveBoundary(style: NodeStyle | undefined): ResolvedBoundary | null {
	const b = normalizeBoundary(style?.boundary);
	if (b === undefined || b.enabled === false) return null;
	const fill = b.fill ?? nodeTint(style);
	const fillOpacity = b.opacity ?? DEFAULT_BOUNDARY_OPACITY;
	const none = b.style === "none";
	return {
		fill,
		fillOpacity,
		stroke: b.color ?? fill,
		strokeOpacity: b.color !== undefined ? 1 : Math.min(1, fillOpacity + OUTLINE_LIFT),
		strokeWidth: none ? 0 : (b.width ?? DEFAULT_BOUNDARY_WIDTH),
		dash: b.style === "dashed" || b.style === "dotted" ? b.style : "solid",
	};
}

// ─── Geometry ───────────────────────────────────────────────────────────────

/** The four corners of `box` grown by `pad` on every side. */
function corners(box: Box, pad: number): Point[] {
	const x1 = box.x - pad;
	const y1 = box.y - pad;
	const x2 = box.x + box.width + pad;
	const y2 = box.y + box.height + pad;
	return [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }];
}

/** Convex hull (Andrew's monotone chain), vertices in order around it; collinear and duplicate points dropped. */
export function convexHull(points: readonly Point[]): Point[] {
	const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
	if (pts.length <= 2) return pts;
	const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
	const lower: Point[] = [];
	for (const p of pts) {
		while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
		lower.push(p);
	}
	const upper: Point[] = [];
	for (let i = pts.length - 1; i >= 0; i--) {
		const p = pts[i]!;
		while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
		upper.push(p);
	}
	lower.pop();
	upper.pop();
	return lower.concat(upper);
}

/** The outline of `boxes` (and `points`), grown by `padding`: a convex polygon at least `padding` clear of each. */
export function boundaryHull(boxes: readonly Box[], padding: number, points: readonly Point[] = []): Point[] {
	const pts: Point[] = [];
	for (const box of boxes) pts.push(...corners(box, padding));
	for (const p of points) pts.push(...corners({ x: p.x, y: p.y, width: 0, height: 0 }, padding));
	return convexHull(pts);
}

/**
 * An SVG path for `hull` with each corner rounded: cut `radius` back along both
 * edges (at most half of each) and joined by a quadratic curve through the
 * corner. With `radius` no more than the hull's padding, the rounding never
 * reaches what the hull wraps.
 */
export function roundedHullPath(hull: readonly Point[], radius: number): string {
	const n = hull.length;
	if (n === 0) return "";
	const f = (v: number) => String(Math.round(v * 100) / 100);
	const parts: string[] = [];
	for (let i = 0; i < n; i++) {
		const v = hull[i]!;
		const prev = hull[(i + n - 1) % n]!;
		const next = hull[(i + 1) % n]!;
		const dPrev = Math.hypot(prev.x - v.x, prev.y - v.y);
		const dNext = Math.hypot(next.x - v.x, next.y - v.y);
		const r = Math.min(radius, dPrev / 2, dNext / 2);
		const a = dPrev > 0 ? { x: v.x + ((prev.x - v.x) * r) / dPrev, y: v.y + ((prev.y - v.y) * r) / dPrev } : v;
		const b = dNext > 0 ? { x: v.x + ((next.x - v.x) * r) / dNext, y: v.y + ((next.y - v.y) * r) / dNext } : v;
		parts.push(`${i === 0 ? "M" : "L"} ${f(a.x)} ${f(a.y)} Q ${f(v.x)} ${f(v.y)} ${f(b.x)} ${f(b.y)}`);
	}
	return `${parts.join(" ")} Z`;
}

/** A laid-out tree node, as boundaries need it (the mind map's `LayoutNode` fits). */
export interface BoundaryTreeNode<N> {
	rect: Box;
	children: readonly N[];
}

export interface BoundaryShape<N> {
	node: N;
	/** Depth below the walk's roots: an outer boundary has a smaller one. */
	depth: number;
	hull: Point[];
}

/**
 * The boundary hull of every node `has` picks, walking down from `roots`: each
 * wraps the node and all its (laid-out, so unfolded) descendants by `padding`,
 * and wraps any boundary nested inside it by `padding` more, so nested
 * boundaries never share an edge. Sorted outer first: draw in this order and
 * an inner boundary lies on top of the one around it.
 */
export function boundaryShapes<N extends BoundaryTreeNode<N>>(roots: readonly N[], has: (node: N) => boolean, padding: number): BoundaryShape<N>[] {
	const out: BoundaryShape<N>[] = [];
	// The hull of a subtree's content, grown once more around each boundary in it.
	const content = (node: N, depth: number): Point[] => {
		const childPoints: Point[] = [];
		for (const child of node.children) childPoints.push(...content(child, depth + 1));
		const own = convexHull([...corners(node.rect, padding), ...childPoints]);
		if (!has(node)) return own;
		out.push({ node, depth, hull: own });
		return boundaryHull([], padding, own);
	};
	const find = (node: N, depth: number): void => {
		if (has(node)) content(node, depth);
		else for (const child of node.children) find(child, depth + 1);
	};
	for (const root of roots) find(root, 0);
	return out.sort((a, b) => a.depth - b.depth);
}
