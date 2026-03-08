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
 * rectangle sits for each shape. Expressed as fractions of width/height.
 *
 * For a shape with insets {x: 0.25, y: 0.25}, the usable content area is
 * the center 50% of width and 50% of height.
 */
export interface ShapeInsets {
	/** Fraction of width consumed on each side (left and right). */
	x: number;
	/** Fraction of height consumed on top and bottom. */
	y: number;
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
			return { x: 0, y: 0 };

		// Pill — half-height rounding on each side
		case "pill":
			return { x: 0.12, y: 0 };

		// Ellipse — inscribed rect of an ellipse is 1/√2 ≈ 70.7% of bounding box
		// Inset per side ≈ (1 - 1/√2) / 2 ≈ 0.146, round up for comfortable padding
		case "ellipse":
			return { x: 0.20, y: 0.20 };

		// Circle — forced square, inscribed rect is 1/√2 of diameter per axis
		// Needs large insets since content is usually wider than tall
		case "circle":
			return { x: 0.22, y: 0.22 };

		// Diamond — the inscribed rect of a diamond is exactly 50% width × 50% height
		case "diamond":
			return { x: 0.30, y: 0.30 };

		// Hexagon — flat-top hex, inset = 0.25 * width on each side (matching makeHexagon)
		case "hexagon":
			return { x: 0.25, y: 0.05 };

		// Octagon — 0.29 fraction corner cuts on each axis
		case "octagon":
			return { x: 0.18, y: 0.18 };

		// Triangle — usable content is roughly the middle 40% of width
		case "triangle":
			return { x: 0.30, y: 0.25 };

		// Parallelogram — skew of 0.2 * width shifts both sides
		case "parallelogram":
			return { x: 0.20, y: 0 };

		// Trapezoid — top is narrower by 0.15 on each side
		case "trapezoid":
			return { x: 0.15, y: 0 };

		// Cloud — bumpy bezier edges eat into content area on all sides
		case "cloud":
			return { x: 0.18, y: 0.20 };

		// Arrow-right — notch on left (~15% width), point on right (~30% width)
		case "arrow-right":
			return { x: 0.22, y: 0.05 };

		default:
			return { x: 0, y: 0 };
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
