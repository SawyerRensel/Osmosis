/**
 * The mind map's topic shapes on Cosmos plates and panels (T130). See
 * `vault/Planner/Cosmos - Every plate shape and dashed borders.md`.
 *
 * - **Sizes** mirror the mind map's layout (`assignSizes` in `../layout.ts`):
 *   a shape is inflated by its content insets (`shapeInsets`) so the text
 *   sits in the shape's inner box, and a circle is a square sized from its
 *   content's diagonal. Text in a shape wraps (or a plate's label is cut)
 *   narrower, as the mind map's does (`shapeWrapEm`), so the shape comes out
 *   at the width cap, not the text. A near panel is fitted round its measured
 *   text, and holds its plate's whole outline (`fitShapedPanel`).
 * - **Far tier:** the plate shader draws each shape as a signed distance by
 *   its id (`PLATE_SHAPE_ID`); see `CosmosPlates.ts`.
 * - **Near tier:** a panel draws its shape as an SVG path and clips to it
 *   (`shapePath`), the mind map's geometry from `../shapes.ts`.
 *
 * Pure, so it is unit-tested.
 */

import { getShapeInsets, type ShapeInsets } from "../shapes";
import type { TopicShape } from "../styles";

/** A node border's dash, from `border.style` (`none` is a stroke of 0, not a dash). */
export type BorderDash = "solid" | "dashed" | "dotted";

/**
 * Each shape's id in the plate shader. The rectangles share 0 and differ by
 * corner radius (`NodeLook.corner`); `underline` and `none` are bare plates.
 */
export const PLATE_SHAPE_ID: Readonly<Record<TopicShape, number>> = {
	rect: 0,
	"rounded-rect": 0,
	pill: 0,
	ellipse: 1,
	circle: 2,
	diamond: 3,
	hexagon: 4,
	octagon: 5,
	triangle: 6,
	parallelogram: 7,
	trapezoid: 8,
	"arrow-right": 9,
	cloud: 10,
	underline: 11,
	none: 12,
};

/** Each dash's id in the plate shader. */
export const DASH_ID: Readonly<Record<BorderDash, number>> = { solid: 0, dashed: 1, dotted: 2 };

/**
 * Dash and gap lengths in ems of text: the mind map's `stroke-dasharray`
 * (`4 2` dashed, `1 2` dotted, in px at its 16 px text).
 */
export const DASH_EM: Readonly<Record<Exclude<BorderDash, "solid">, readonly [number, number]>> = {
	dashed: [4 / 16, 2 / 16],
	dotted: [1 / 16, 2 / 16],
};

/** Whether `value` is a shape the mind map draws (frontmatter can hold anything). */
export function isTopicShape(value: unknown): value is TopicShape {
	return typeof value === "string" && Object.prototype.hasOwnProperty.call(PLATE_SHAPE_ID, value);
}

/** A rectangle with corners (rect, rounded-rect, pill): drawn by corner radius, no insets. */
export function isRectShape(shape: TopicShape): boolean {
	return PLATE_SHAPE_ID[shape] === 0;
}

/** A shape with no fill of its own (underline, none): Cosmos fills it with the scene's background. */
export function isBareShape(shape: TopicShape): boolean {
	return shape === "underline" || shape === "none";
}


/** A width and a height, in any one unit. */
export interface Size {
	width: number;
	height: number;
}

/**
 * How far the mind map's cloud (`makeCloud`) bulges past the top and bottom
 * of its box, in its box's heights: its bumps' control points sit a quarter of
 * the height outside it. Sampled from the first bump; the others mirror it.
 */
export const CLOUD_BULGE = (() => {
	let top = 0;
	for (let i = 0; i <= 400; i++) {
		const t = i / 400;
		const u = 1 - t;
		// The first bump's y (down, in box heights): from the left cusp (1/2) by (1/4) and (-1/4) to the top (0).
		top = Math.min(top, u * u * u * 0.5 + 3 * u * u * t * 0.25 - 3 * u * t * t * 0.25);
	}
	return -top;
})();

/**
 * The share of a Cosmos box each side of a shape's text box takes: the mind
 * map's content insets (`getShapeInsets`), but for two shapes.
 * - The cloud: Cosmos draws it inside its box, bulges and all (a plate is
 *   drawn on a quad of its box, and a panel clips to its box), so its box is
 *   the mind map's grown by `CLOUD_BULGE` top and bottom, with the same text
 *   box inside.
 * - The triangle: the mind map's inner box reaches 0.55 of the way across, where
 *   the triangle is only the middle 45% of its height tall, so its top corners
 *   are outside the outline (the mind map's text spills over it; Cosmos would
 *   clip it). Its top and bottom insets are 0.275, the outline's there.
 */
export function shapeInsets(shape: TopicShape): ShapeInsets {
	const insets = getShapeInsets(shape);
	if (shape === "triangle") {
		const reach = 1 - insets.right;
		return { ...insets, top: reach / 2, bottom: reach / 2 };
	}
	if (shape !== "cloud") return insets;
	const grown = 1 + 2 * CLOUD_BULGE;
	return { ...insets, top: (insets.top + CLOUD_BULGE) / grown, bottom: (insets.bottom + CLOUD_BULGE) / grown };
}

/** The share of the box's width the left and right insets take together, capped as the mind map's layout caps them. */
function insetX(insets: ShapeInsets): number {
	return Math.min(insets.left, 0.45) + Math.min(insets.right, 0.45);
}

/**
 * The box a `shape` needs around content `width` × `height` (padding
 * included), as the mind map's layout sizes it, and where the content's
 * centre sits across it (`textX`, from the box's centre: a triangle's and an
 * arrow's inner box is off-centre). Top and bottom insets are equal for every
 * shape, so the content is always centred vertically.
 */
export function shapeBox(shape: TopicShape, width: number, height: number): Size & { textX: number } {
	const insets = shapeInsets(shape);
	if (shape === "circle") {
		const fromMax = Math.max(width, height) / (1 - insets.left - insets.right);
		const diameter = Math.max(fromMax, Math.hypot(width, height));
		return { width: diameter, height: diameter, textX: 0 };
	}
	const left = Math.min(insets.left, 0.45);
	const right = Math.min(insets.right, 0.45);
	const vertical = Math.min(insets.top, 0.45) + Math.min(insets.bottom, 0.45);
	const boxWidth = width / (1 - left - right);
	return { width: boxWidth, height: height / (1 - vertical), textX: (boxWidth * (left - right)) / 2 };
}

/**
 * Where a node's text wraps, in ems, when the node is at most `outerEm` wide
 * before its shape grows it (its padding `padEm` either side included): the
 * mind map wraps a shaped node's text that much narrower (`MindMapView`'s
 * `contentMaxWidth`, its max node width less the shape's insets and the
 * padding), so the shape, not the text, is what comes out at the cap.
 */
export function shapeWrapEm(shape: TopicShape, outerEm: number, padEm: number): number {
	return Math.max(0, outerEm * (1 - insetX(shapeInsets(shape))) - 2 * padEm);
}

/** The mind map's polygon shapes' corners in a `w` × `h` box (y down, `../shapes.ts`); null for any other shape. */
function polygonPoints(shape: TopicShape, w: number, h: number): [number, number][] | null {
	switch (shape) {
		case "diamond":
			return [[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]];
		case "hexagon": {
			const inset = Math.min(w * 0.25, h * 0.5);
			return [[inset, 0], [w - inset, 0], [w, h / 2], [w - inset, h], [inset, h], [0, h / 2]];
		}
		case "octagon": {
			const ix = w * 0.29;
			const iy = h * 0.29;
			return [[ix, 0], [w - ix, 0], [w, iy], [w, h - iy], [w - ix, h], [ix, h], [0, h - iy], [0, iy]];
		}
		case "triangle":
			return [[0, 0], [w, h / 2], [0, h]];
		case "parallelogram": {
			const skew = Math.min(w * 0.2, h);
			return [[skew, 0], [w, 0], [w - skew, h], [0, h]];
		}
		case "trapezoid": {
			const inset = w * 0.15;
			return [[inset, 0], [w - inset, 0], [w, h], [0, h]];
		}
		case "arrow-right": {
			const notch = Math.min(w * 0.3, h);
			return [[0, 0], [w - notch, 0], [w, h / 2], [w - notch, h], [0, h], [notch * 0.5, h / 2]];
		}
		default:
			return null;
	}
}

/**
 * The mind map's cloud (`makeCloud`) fitted into a `w` × `h` box, bulges and
 * all: its start (the left cusp) and four cubic Béziers, each as its two
 * control points and its end.
 */
function cloudCurves(w: number, h: number): { start: [number, number]; curves: number[][] } {
	const mapH = h / (1 + 2 * CLOUD_BULGE);
	const top = CLOUD_BULGE * mapH;
	const bx = w * 0.15;
	const by = mapH * 0.25;
	const y = (value: number): number => top + value;
	return {
		start: [bx, y(mapH / 2)],
		curves: [
			[0, y(by), w * 0.25, y(-by), w / 2, y(0)],
			[w * 0.75, y(-by), w, y(by), w - bx, y(mapH / 2)],
			[w, y(mapH - by), w * 0.75, y(mapH + by), w / 2, y(mapH)],
			[w * 0.25, y(mapH + by), 0, y(mapH - by), bx, y(mapH / 2)],
		],
	};
}

/** Points sampled along each cloud bump; the plate shader draws the same polygon (`CLOUD_POLYGON`). */
const CLOUD_STEPS = 6;

/**
 * The shape's outline as a polygon in a `w` × `h` box (y down): a polygon's
 * corners, a curve sampled. A rectangle with corners is its box (what the
 * outline holds is all this is for).
 */
export function outlinePoints(shape: TopicShape, w: number, h: number): [number, number][] {
	const polygon = polygonPoints(shape, w, h);
	if (polygon !== null) return polygon;
	if (shape === "ellipse" || shape === "circle") {
		return Array.from({ length: 48 }, (_, i): [number, number] => {
			const a = (i / 48) * 2 * Math.PI;
			return [w / 2 - (w / 2) * Math.cos(a), h / 2 - (h / 2) * Math.sin(a)];
		});
	}
	if (shape === "cloud") {
		const { start, curves } = cloudCurves(w, h);
		const points: [number, number][] = [];
		let from = start;
		for (const [x1, y1, x2, y2, x, y] of curves as [number, number, number, number, number, number][]) {
			for (let i = 0; i < CLOUD_STEPS; i++) {
				const t = i / CLOUD_STEPS;
				const u = 1 - t;
				points.push([
					u * u * u * from[0] + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
					u * u * u * from[1] + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y,
				]);
			}
			from = [x, y];
		}
		return points;
	}
	return [[0, 0], [w, 0], [w, h], [0, h]];
}

/**
 * The cloud's polygon in the plate shader's terms: each point from the box's
 * centre, in half sizes, y up, so the shader scales it by the plate's half size.
 */
export const CLOUD_POLYGON: readonly (readonly [number, number])[] = outlinePoints("cloud", 2, 2).map(([x, y]) => [x - 1, 1 - y]);

/** Whether (`x`, `y`) is inside the polygon `points` (ray casting). */
function insidePolygon(points: readonly [number, number][], x: number, y: number): boolean {
	let inside = false;
	for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
		const [xi, yi] = points[i]!;
		const [xj, yj] = points[j]!;
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
	}
	return inside;
}

/**
 * Whether `outer`'s outline holds all of `inner`'s, the two boxes centred on
 * each other in the same shape. A point on the outline counts as inside: the
 * inner one is drawn a hair (0.2%) smaller for the test.
 */
export function shapeHolds(shape: TopicShape, outer: Size, inner: Size): boolean {
	const outline = outlinePoints(shape, outer.width, outer.height);
	const cx = outer.width / 2;
	const cy = outer.height / 2;
	return outlinePoints(shape, inner.width, inner.height).every(([x, y]) =>
		insidePolygon(outline, cx + (x - inner.width / 2) * 0.998, cy + (y - inner.height / 2) * 0.998));
}

/** Whether a rectangle `width` × `height`, at (`x`, `y`) from the top left of a `box` in `shape`, is inside the shape's outline. */
export function shapeHoldsRect(shape: TopicShape, box: Size, rect: Size & { x: number; y: number }): boolean {
	const outline = outlinePoints(shape, box.width, box.height);
	const corners: [number, number][] = [[rect.x, rect.y], [rect.x + rect.width, rect.y], [rect.x + rect.width, rect.y + rect.height], [rect.x, rect.y + rect.height]];
	return corners.every(([x, y]) => insidePolygon(outline, x, y));
}

/**
 * A shaped near panel's box round its measured `content` (its text, the
 * stylesheet's padding included), and the padding that puts the content in the
 * shape's inner box: the mind map's layout (`shapeBox`). The panel is drawn
 * over its node's `plate`, so its outline holds the plate's whole (grown
 * across first, as the shapes that need it mostly do, else every way), or the
 * plate's outline would show past the panel's as a second one. The padding is
 * the box's insets; the content is centred in what is left.
 */
export function fitShapedPanel(shape: TopicShape, content: Size, plate: Size): Size & { padding: [number, number, number, number] } {
	const box = shapeBox(shape, content.width, content.height);
	let width = Math.max(box.width, plate.width);
	let height = Math.max(box.height, plate.height);
	if (shape === "circle") width = height = Math.max(width, height);
	if (!shapeHolds(shape, { width, height }, plate)) {
		const across = shape !== "circle" && shapeHolds(shape, { width: width * 2, height }, plate);
		const grown = (k: number): Size => (across ? { width: width * k, height } : { width: width * k, height: height * k });
		// The smallest growth that holds it, to a thousandth: a plate is never more than a few times its panel.
		let low = 1;
		let high = across ? 2 : 4;
		for (let i = 0; i < 12; i++) {
			const mid = (low + high) / 2;
			if (shapeHolds(shape, grown(mid), plate)) high = mid;
			else low = mid;
		}
		({ width, height } = grown(high));
	}
	const insets = shapeInsets(shape);
	return { width, height, padding: [insets.top * height, insets.right * width, insets.bottom * height, insets.left * width] };
}

/**
 * The shape's outline as an SVG path in a `width` × `height` box at the
 * origin (y down), the mind map's geometry (`../shapes.ts`). `radius` is a
 * rounded rectangle's corner, in the box's units. A circle whose box isn't
 * square is drawn as an ellipse, so content that outgrew the estimate is never
 * cut off. The cloud is fitted into its box, bulges and all (`shapeInsets`).
 */
export function shapePath(shape: TopicShape, width: number, height: number, radius: number): string {
	const w = width;
	const h = height;
	const n = (value: number): string => String(Math.round(value * 100) / 100);
	const polygon = (points: [number, number][]): string => `M ${points.map(([x, y]) => `${n(x)} ${n(y)}`).join(" L ")} Z`;
	const corners = polygonPoints(shape, w, h);
	if (corners !== null) return polygon(corners);
	switch (shape) {
		case "rounded-rect":
		case "pill": {
			const r = Math.max(0, Math.min(shape === "pill" ? h / 2 : radius, w / 2, h / 2));
			if (r === 0) return polygon([[0, 0], [w, 0], [w, h], [0, h]]);
			const arc = (x: number, y: number): string => `A ${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y)}`;
			return `M ${n(r)} 0 L ${n(w - r)} 0 ${arc(w, r)} L ${n(w)} ${n(h - r)} ${arc(w - r, h)} L ${n(r)} ${n(h)} ${arc(0, h - r)} L 0 ${n(r)} ${arc(r, 0)} Z`;
		}
		case "ellipse":
		case "circle": {
			const arc = `A ${n(w / 2)} ${n(h / 2)} 0 1 0`;
			return `M 0 ${n(h / 2)} ${arc} ${n(w)} ${n(h / 2)} ${arc} 0 ${n(h / 2)} Z`;
		}
		case "cloud": {
			const { start, curves } = cloudCurves(w, h);
			const c = (xy: number[]): string => `C ${n(xy[0]!)} ${n(xy[1]!)}, ${n(xy[2]!)} ${n(xy[3]!)}, ${n(xy[4]!)} ${n(xy[5]!)}`;
			return `M ${n(start[0])} ${n(start[1])} ${curves.map(c).join(" ")} Z`;
		}
		case "underline":
			return `M 0 ${n(h)} L ${n(w)} ${n(h)}`;
		default:
			return polygon([[0, 0], [w, 0], [w, h], [0, h]]);
	}
}
