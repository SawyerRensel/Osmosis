/**
 * Branch lines in Cosmos (T132): the hierarchy edge from a parent to a child
 * drawn in the mind map's branch line style, resolved as the mind map
 * resolves it (`drawBranchLine` in `MindMapView`), and the shapes the mind
 * map draws (`computeLinePath`), built in 3D.
 *
 * **Resolution** (`resolveBranch`), per field, strongest first, exactly as the
 * mind map layers them:
 *
 * - `style`, `pattern`, `taper`: the child's own `branchLine`, then the
 *   theme's `branchLine`, then the map's `branchLineStyle` /
 *   `branchLinePattern` / `branchLineTaper`.
 * - `color`, `thickness`: the child's own, then the map's `branchLineColor` /
 *   `branchLineThickness`, then the theme's.
 *
 * The theme is read only in the Overlays' *Mind map style* colour mode (a
 * `themes` lookup is passed), as for node styles (`noteStyleReader`). The
 * plugin's default line style (`curved`) is not a layer: an edge no style
 * shapes stays straight, as it always was in Cosmos.
 *
 * **Shapes** (`branchPath`): the mind map lays a branch out along one axis
 * (left to right) and offsets it along the other. In 3D the cross axis is
 * given (world up in Organic and Flat, where a flat slice's rows run down the
 * world; the parent's tangent frame in Planets), and the edge's own component
 * across it is the mind map's x. Curves use the mind map's control points
 * (half-way along that axis), elbows its corner positions.
 *
 * Pure logic, no `obsidian` import, so it is unit-tested.
 */

import { parseOsmosisStyleFrontmatter, type BranchLinePattern, type BranchLineStyle, type BranchLineTaper, type BranchStyle } from "../styles";
import type { Vec3 } from "./flight";
import { noteTheme, type ThemeLookup } from "./node-style";
import { ownThickness } from "./taper";

/** Segments a curved branch is sampled into. */
export const CURVE_SEGMENTS = 12;
/** Segments each rounded elbow corner (a quadratic) is sampled into. */
export const CORNER_SEGMENTS = 4;
/** The mind map's largest elbow corner radius, in mind-map px. */
const ELBOW_RADIUS_PX = 12;

/** A note's map-level branch line layers: its theme's `branchLine` (Mind map style mode only) and its `osmosis-styles` `branchLine*` keys. */
export interface BranchLayers {
	theme?: BranchStyle;
	map: BranchStyle;
}

const STYLES: readonly BranchLineStyle[] = ["curved", "straight", "angular", "rounded-elbow"];
const PATTERNS: readonly BranchLinePattern[] = ["solid", "dashed", "dotted"];
const TAPERS: readonly BranchLineTaper[] = ["none", "fade", "grow"];

/**
 * A note's map-level branch layers, or null when it has none (so an unstyled
 * note costs nothing per line). With `themes`, its mind map theme's
 * `branchLine` is one of them.
 */
export function noteBranchLayers(frontmatter: Record<string, unknown> | null | undefined, themes?: ThemeLookup): BranchLayers | null {
	const fm = parseOsmosisStyleFrontmatter(frontmatter);
	if (fm === undefined) return null;
	const map = clean({ style: fm.branchLineStyle, color: fm.branchLineColor, thickness: fm.branchLineThickness, pattern: fm.branchLinePattern, taper: fm.branchLineTaper });
	const theme = themes === undefined ? undefined : clean(noteTheme(fm, themes)?.branchLine);
	if (map === undefined && theme === undefined) return null;
	return { ...(theme === undefined ? {} : { theme }), map: map ?? {} };
}

/**
 * The branch line a child's hierarchy edge is drawn in: its own `branchLine`
 * over the note's layers, field by field in the mind map's order (see the
 * module comment). Undefined when nothing sets any field.
 */
export function resolveBranch(own: BranchStyle | undefined, layers: BranchLayers | null): BranchStyle | undefined {
	const node = clean(own);
	if (layers === null) return node;
	const { theme, map } = layers;
	return clean({
		style: node?.style ?? theme?.style ?? map.style,
		color: node?.color ?? map.color ?? theme?.color,
		thickness: node?.thickness ?? map.thickness ?? theme?.thickness,
		pattern: node?.pattern ?? theme?.pattern ?? map.pattern,
		taper: node?.taper ?? theme?.taper ?? map.taper,
	});
}

/**
 * Whether a branch line needs a ribbon to be drawn: a shape other than
 * straight, a dashed or dotted pattern, a fade or grow taper, or a thickness
 * of its own (`ownThickness`). Colour alone does not: a line takes it.
 */
export function needsRibbon(branch: BranchStyle | undefined): boolean {
	if (branch === undefined) return false;
	return (branch.style !== undefined && branch.style !== "straight")
		|| branch.pattern === "dashed" || branch.pattern === "dotted"
		|| branch.taper === "fade" || branch.taper === "grow"
		|| ownThickness(branch) !== null;
}

/**
 * The points a branch line of `style` runs through from `from` (the parent)
 * to `to` (the child), both included. `cross` (a unit vector) is the mind
 * map's cross axis: the edge's component across it is the axis the branch
 * grows along, as the 2D map's x. A straight line, or an edge that runs
 * along `cross` with nothing across it, is the two ends. `pxWorld` is world
 * units per mind-map px (the elbow's corner radius).
 */
export function branchPath(style: BranchLineStyle, from: Vec3, to: Vec3, cross: Vec3, pxWorld: number): Vec3[] {
	const d = sub(to, from);
	const rise = dot(d, cross);
	const h = add(d, cross, -rise);
	const along = Math.hypot(h.x, h.y, h.z);
	if (style === "straight" || !(along > 1e-6)) return [from, to];
	const axis = scale(h, 1 / along);
	// The mind map's mid-x: the control points (curved) and the corners (angular, elbow).
	const near = add(from, axis, along / 2);
	const far = add(to, axis, -along / 2);
	if (style === "angular") return [from, near, far, to];
	if (style === "rounded-elbow") {
		const radius = Math.min(ELBOW_RADIUS_PX * pxWorld, Math.abs(rise) / 2, along / 4);
		if (Math.abs(rise) < pxWorld) return [from, to];
		const up = scale(cross, Math.sign(rise));
		return [
			from,
			...quadratic(add(near, axis, -radius), near, add(near, up, radius), CORNER_SEGMENTS),
			...quadratic(add(far, up, -radius), far, add(far, axis, radius), CORNER_SEGMENTS),
			to,
		];
	}
	// Curved: the mind map's cubic, C (midX, py), (midX, cy).
	const points: Vec3[] = [];
	for (let i = 0; i <= CURVE_SEGMENTS; i++) {
		const t = i / CURVE_SEGMENTS;
		const [a, b, c, e] = [(1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t ** 2, t ** 3];
		points.push({
			x: a * from.x + b * near.x + c * far.x + e * to.x,
			y: a * from.y + b * near.y + c * far.y + e * to.y,
			z: a * from.z + b * near.z + c * far.z + e * to.z,
		});
	}
	return points;
}

/**
 * A branch path laid onto a planet's surface round `centre` (Planets): each
 * leg split into its share of `segments` by length (so a long straight leg
 * still follows the curve of the planet), then every point pushed out from
 * the centre to the radius eased from the first end's to the last's by
 * distance along. The ends stay where they are.
 */
export function onSphere(points: readonly Vec3[], centre: Vec3, segments: number): Vec3[] {
	const legs: number[] = [];
	let total = 0;
	for (let i = 1; i < points.length; i++) {
		const leg = Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y, points[i]!.z - points[i - 1]!.z);
		legs.push(leg);
		total += leg;
	}
	if (!(total > 0) || points.length < 2) return [...points];
	const first = sub(points[0]!, centre);
	const last = sub(points[points.length - 1]!, centre);
	const [ra, rb] = [Math.hypot(first.x, first.y, first.z), Math.hypot(last.x, last.y, last.z)];
	const out: Vec3[] = [points[0]!];
	let walked = 0;
	for (let i = 1; i < points.length; i++) {
		const [a, b, leg] = [points[i - 1]!, points[i]!, legs[i - 1]!];
		const pieces = Math.max(1, Math.ceil((segments * leg) / total));
		for (let k = 1; k <= pieces; k++) {
			const t = k / pieces;
			if (i === points.length - 1 && k === pieces) {
				out.push(b);
				continue;
			}
			const p = sub({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }, centre);
			const length = Math.hypot(p.x, p.y, p.z);
			const radius = ra + ((rb - ra) * (walked + leg * t)) / total;
			out.push(length > 1e-9 ? add(centre, p, radius / length) : add(centre, p, 1));
		}
		walked += leg;
	}
	return out;
}

/** `style` with only the fields the mind map can draw, of valid values; undefined when none is left (or it is not a mapping). */
function clean(style: BranchStyle | undefined): BranchStyle | undefined {
	if (typeof style !== "object" || style === null || Array.isArray(style)) return undefined;
	const out: BranchStyle = {};
	if (STYLES.includes(style.style as BranchLineStyle)) out.style = style.style;
	if (typeof style.color === "string" && style.color.trim() !== "") out.color = style.color;
	if (typeof style.thickness === "number" && Number.isFinite(style.thickness) && style.thickness > 0) out.thickness = style.thickness;
	if (PATTERNS.includes(style.pattern as BranchLinePattern)) out.pattern = style.pattern;
	if (TAPERS.includes(style.taper as BranchLineTaper)) out.taper = style.taper;
	return Object.keys(out).length > 0 ? out : undefined;
}

/** Points along the quadratic from `a` through control `c` to `b`, `a` and `b` included. */
function quadratic(a: Vec3, c: Vec3, b: Vec3, segments: number): Vec3[] {
	const points: Vec3[] = [];
	for (let i = 0; i <= segments; i++) {
		const t = i / segments;
		const [p, q, r] = [(1 - t) ** 2, 2 * (1 - t) * t, t ** 2];
		points.push({ x: p * a.x + q * c.x + r * b.x, y: p * a.y + q * c.y + r * b.y, z: p * a.z + q * c.z + r * b.z });
	}
	return points;
}

function sub(a: Vec3, b: Vec3): Vec3 {
	return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/** `a + b·k`. */
function add(a: Vec3, b: Vec3, k: number): Vec3 {
	return { x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k };
}

function scale(a: Vec3, k: number): Vec3 {
	return { x: a.x * k, y: a.y * k, z: a.z * k };
}

function dot(a: Vec3, b: Vec3): number {
	return a.x * b.x + a.y * b.y + a.z * b.z;
}
