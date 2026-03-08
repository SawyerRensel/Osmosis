/**
 * SVG shape generators for mind map topic nodes.
 *
 * Each generator produces an SVG element (rect, ellipse, path, etc.)
 * sized to the given bounding box. The caller applies CSS classes and
 * inline styles for fill, stroke, etc.
 */

import type { TopicShape } from "./styles";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Human-readable labels for the shape dropdown. */
export const SHAPE_LABELS: Record<TopicShape, string> = {
	"rect": "Rectangle",
	"rounded-rect": "Rounded rectangle",
	"ellipse": "Ellipse",
	"circle": "Circle",
	"diamond": "Diamond",
	"hexagon": "Hexagon",
	"octagon": "Octagon",
	"triangle": "Triangle",
	"parallelogram": "Parallelogram",
	"trapezoid": "Trapezoid",
	"pill": "Pill",
	"cloud": "Cloud",
	"arrow-right": "Arrow right",
	"underline": "Underline",
	"none": "None",
};

/**
 * Content insets: how far inside the bounding box the inscribed content
 * rectangle sits for each shape. Expressed as fractions of width (left/right)
 * or height (top/bottom). Allows asymmetric shapes like triangles.
 */
export interface ShapeInsets {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

/** Create symmetric insets from x/y fractions (convenience). */
function sym(x: number, y: number): ShapeInsets {
	return { top: y, right: x, bottom: y, left: x };
}

/**
 * Get the content insets for a given shape.
 *
 * These insets describe how much extra space the shape needs beyond a
 * simple rectangle. The layout engine uses them to inflate node dimensions
 * so content fits within the shape boundary.
 */
export function getShapeInsets(shape: TopicShape): ShapeInsets {
	switch (shape) {
		// Rectangular shapes — no extra insets needed
		case "rect":
		case "rounded-rect":
		case "underline":
		case "none":
			return sym(0, 0);

		// Pill — half-height rounding on each side
		case "pill":
			return sym(0.12, 0);

		// Ellipse — inscribed rect is 1/√2 ≈ 70.7% of bounding box
		// Inset per side = (1 - 1/√2) / 2 ≈ 0.146
		case "ellipse":
			return sym(0.15, 0.15);

		// Circle — tighter insets; layout sizes via max-dimension formula
		case "circle":
			return sym(0.08, 0.08);

		// Diamond — inscribed rect is exactly 50% width × 50% height
		case "diamond":
			return sym(0.25, 0.25);

		// Hexagon — flat-top, inset = 0.25 * width per side (matching makeHexagon)
		case "hexagon":
			return sym(0.22, 0.03);

		// Octagon — 0.29 fraction corner cuts
		case "octagon":
			return sym(0.15, 0.15);

		// Triangle — points right: flat left edge, point on right.
		// Max inscribed rect: left=0, right=0.50, top/bottom=0.25
		case "triangle":
			return { top: 0.20, right: 0.45, bottom: 0.20, left: 0.05 };

		// Parallelogram — skew of 0.2*w; left edge shifted right, right edge shifted left
		case "parallelogram":
			return { top: 0, right: 0.18, bottom: 0, left: 0.18 };

		// Trapezoid — top narrower by 0.15 per side
		case "trapezoid":
			return sym(0.12, 0);

		// Cloud — bumpy bezier edges eat into content area
		case "cloud":
			return sym(0.15, 0.18);

		// Arrow-right — notch on left (~10%), point on right (~25%)
		case "arrow-right":
			return { top: 0.03, right: 0.25, bottom: 0.03, left: 0.15 };

		default:
			return sym(0, 0);
	}
}

/**
 * Create an SVG element for the given topic shape at the specified position and size.
 *
 * The returned element has no class or style — the caller is responsible for
 * adding CSS classes (`osmosis-node`) and inline theme styles.
 */
export function createShapeElement(
	shape: TopicShape,
	x: number,
	y: number,
	width: number,
	height: number,
): SVGElement {
	switch (shape) {
		case "rect":
			return makeRect(x, y, width, height, 0);
		case "rounded-rect":
			return makeRect(x, y, width, height, 4);
		case "pill":
			return makeRect(x, y, width, height, height / 2);
		case "ellipse":
			return makeEllipse(x, y, width, height);
		case "circle":
			return makeCircle(x, y, width, height);
		case "diamond":
			return makeDiamond(x, y, width, height);
		case "hexagon":
			return makeHexagon(x, y, width, height);
		case "octagon":
			return makeOctagon(x, y, width, height);
		case "triangle":
			return makeTriangle(x, y, width, height);
		case "parallelogram":
			return makeParallelogram(x, y, width, height);
		case "trapezoid":
			return makeTrapezoid(x, y, width, height);
		case "cloud":
			return makeCloud(x, y, width, height);
		case "arrow-right":
			return makeArrowRight(x, y, width, height);
		case "underline":
			return makeUnderline(x, y, width, height);
		case "none":
			return makeNone(x, y, width, height);
		default:
			// Fallback for any unknown shape
			return makeRect(x, y, width, height, 4);
	}
}

// ─── Shape Builders ─────────────────────────────────────────────────────────

function makeRect(
	x: number, y: number, w: number, h: number, rx: number,
): SVGRectElement {
	const el = document.createElementNS(SVG_NS, "rect");
	el.setAttribute("x", String(x));
	el.setAttribute("y", String(y));
	el.setAttribute("width", String(w));
	el.setAttribute("height", String(h));
	if (rx > 0) el.setAttribute("rx", String(rx));
	return el;
}

function makeEllipse(
	x: number, y: number, w: number, h: number,
): SVGEllipseElement {
	const el = document.createElementNS(SVG_NS, "ellipse");
	el.setAttribute("cx", String(x + w / 2));
	el.setAttribute("cy", String(y + h / 2));
	el.setAttribute("rx", String(w / 2));
	el.setAttribute("ry", String(h / 2));
	return el;
}

function makeCircle(
	x: number, y: number, w: number, h: number,
): SVGCircleElement {
	const r = Math.max(w, h) / 2;
	const el = document.createElementNS(SVG_NS, "circle");
	el.setAttribute("cx", String(x + w / 2));
	el.setAttribute("cy", String(y + h / 2));
	el.setAttribute("r", String(r));
	return el;
}

function makePath(d: string): SVGPathElement {
	const el = document.createElementNS(SVG_NS, "path");
	el.setAttribute("d", d);
	return el;
}

function makeDiamond(
	x: number, y: number, w: number, h: number,
): SVGPathElement {
	const cx = x + w / 2;
	const cy = y + h / 2;
	return makePath(
		`M ${cx} ${y} L ${x + w} ${cy} L ${cx} ${y + h} L ${x} ${cy} Z`,
	);
}

function makeHexagon(
	x: number, y: number, w: number, h: number,
): SVGPathElement {
	const inset = Math.min(w * 0.25, h * 0.5);
	return makePath(
		`M ${x + inset} ${y} ` +
		`L ${x + w - inset} ${y} ` +
		`L ${x + w} ${y + h / 2} ` +
		`L ${x + w - inset} ${y + h} ` +
		`L ${x + inset} ${y + h} ` +
		`L ${x} ${y + h / 2} Z`,
	);
}

function makeOctagon(
	x: number, y: number, w: number, h: number,
): SVGPathElement {
	const ix = w * 0.29;
	const iy = h * 0.29;
	return makePath(
		`M ${x + ix} ${y} ` +
		`L ${x + w - ix} ${y} ` +
		`L ${x + w} ${y + iy} ` +
		`L ${x + w} ${y + h - iy} ` +
		`L ${x + w - ix} ${y + h} ` +
		`L ${x + ix} ${y + h} ` +
		`L ${x} ${y + h - iy} ` +
		`L ${x} ${y + iy} Z`,
	);
}

function makeTriangle(
	x: number, y: number, w: number, h: number,
): SVGPathElement {
	return makePath(
		`M ${x} ${y} L ${x + w} ${y + h / 2} L ${x} ${y + h} Z`,
	);
}

function makeParallelogram(
	x: number, y: number, w: number, h: number,
): SVGPathElement {
	const skew = Math.min(w * 0.2, h);
	return makePath(
		`M ${x + skew} ${y} ` +
		`L ${x + w} ${y} ` +
		`L ${x + w - skew} ${y + h} ` +
		`L ${x} ${y + h} Z`,
	);
}

function makeTrapezoid(
	x: number, y: number, w: number, h: number,
): SVGPathElement {
	const inset = w * 0.15;
	return makePath(
		`M ${x + inset} ${y} ` +
		`L ${x + w - inset} ${y} ` +
		`L ${x + w} ${y + h} ` +
		`L ${x} ${y + h} Z`,
	);
}

function makeCloud(
	x: number, y: number, w: number, h: number,
): SVGPathElement {
	// Cloud shape using cubic bezier bumps around the perimeter
	const bx = w * 0.15;
	const by = h * 0.25;
	return makePath(
		`M ${x + bx} ${y + h / 2} ` +
		// Left side up
		`C ${x} ${y + by}, ${x + w * 0.25} ${y - by}, ${x + w / 2} ${y} ` +
		// Top to right
		`C ${x + w * 0.75} ${y - by}, ${x + w} ${y + by}, ${x + w - bx} ${y + h / 2} ` +
		// Right side down
		`C ${x + w} ${y + h - by}, ${x + w * 0.75} ${y + h + by}, ${x + w / 2} ${y + h} ` +
		// Bottom to left
		`C ${x + w * 0.25} ${y + h + by}, ${x} ${y + h - by}, ${x + bx} ${y + h / 2} Z`,
	);
}

function makeArrowRight(
	x: number, y: number, w: number, h: number,
): SVGPathElement {
	const notch = Math.min(w * 0.3, h);
	return makePath(
		`M ${x} ${y} ` +
		`L ${x + w - notch} ${y} ` +
		`L ${x + w} ${y + h / 2} ` +
		`L ${x + w - notch} ${y + h} ` +
		`L ${x} ${y + h} ` +
		`L ${x + notch * 0.5} ${y + h / 2} Z`,
	);
}

function makeUnderline(
	x: number, y: number, w: number, h: number,
): SVGPathElement {
	// Transparent rect area with a visible bottom line.
	// We draw the full rect so hit-testing works, but CSS sets fill to none.
	// The bottom line is drawn as part of the path so stroke applies only there.
	return makePath(
		`M ${x} ${y + h} L ${x + w} ${y + h}`,
	);
}

function makeNone(
	x: number, y: number, w: number, h: number,
): SVGRectElement {
	// Invisible rect preserving layout — CSS hides stroke and fill.
	const el = document.createElementNS(SVG_NS, "rect");
	el.setAttribute("x", String(x));
	el.setAttribute("y", String(y));
	el.setAttribute("width", String(w));
	el.setAttribute("height", String(h));
	el.setAttribute("fill", "none");
	el.setAttribute("stroke", "none");
	return el;
}
