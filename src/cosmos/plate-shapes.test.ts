import { describe, it, expect } from "vitest";
import { SHAPE_LABELS, getShapeInsets } from "../shapes";
import type { TopicShape } from "../styles";
import { DEFAULT_LAYOUT_CONFIG } from "../layout";
import { CLOUD_BULGE, CLOUD_POLYGON, PLATE_SHAPE_ID, fitShapedPanel, isBareShape, isRectShape, isTopicShape, outlinePoints, shapeBox, shapeHolds, shapeHoldsRect, shapeInsets, shapePath, shapeWrapEm } from "./plate-shapes";

const SHAPES = Object.keys(SHAPE_LABELS) as TopicShape[];

describe("isTopicShape", () => {
	it("knows every shape the mind map offers, and nothing else", () => {
		for (const shape of SHAPES) expect(isTopicShape(shape)).toBe(true);
		expect(Object.keys(PLATE_SHAPE_ID).sort()).toEqual([...SHAPES].sort());
		expect(isTopicShape("blob")).toBe(false);
		expect(isTopicShape("toString")).toBe(false);
		expect(isTopicShape(3)).toBe(false);
	});

	it("sorts rectangles and bare shapes", () => {
		expect(SHAPES.filter(isRectShape).sort()).toEqual(["pill", "rect", "rounded-rect"]);
		expect(SHAPES.filter(isBareShape).sort()).toEqual(["none", "underline"]);
	});
});

describe("shapeBox", () => {
	it("leaves a rectangle's box as it is", () => {
		for (const shape of ["rect", "rounded-rect", "underline", "none"] as const) expect(shapeBox(shape, 30, 5)).toEqual({ width: 30, height: 5, textX: 0 });
	});

	it("inflates a diamond to twice its content, as the mind map's layout does", () => {
		const box = shapeBox("diamond", 30, 5);
		expect(box.width).toBeCloseTo(60);
		expect(box.height).toBeCloseTo(10);
		expect(box.textX).toBeCloseTo(0);
	});

	it("makes a circle a square that holds its content's diagonal", () => {
		const box = shapeBox("circle", 30, 5);
		expect(box.width).toBe(box.height);
		expect(box.width).toBeGreaterThanOrEqual(Math.hypot(30, 5));
		expect(box.width).toBeCloseTo(30 / 0.84);
	});

	it("moves the text of an off-centre shape to its inner box", () => {
		// Triangle: insets 0.05 left, 0.45 right.
		const box = shapeBox("triangle", 10, 5);
		expect(box.width).toBeCloseTo(20);
		expect(box.textX).toBeCloseTo(-4);
		// The text's box sits inside: from left inset to the right inset.
		expect(box.textX - 5).toBeCloseTo(-box.width / 2 + 0.05 * box.width);
		expect(shapeBox("arrow-right", 10, 5).textX).toBeLessThan(0);
	});
});

describe("shapePath", () => {
	it("draws a closed outline for every shape but underline", () => {
		for (const shape of SHAPES) {
			const d = shapePath(shape, 100, 40, 12);
			expect(d.startsWith("M ")).toBe(true);
			expect(d.endsWith("Z")).toBe(shape !== "underline");
		}
	});

	it("follows the mind map's geometry", () => {
		expect(shapePath("diamond", 100, 40, 0)).toBe("M 50 0 L 100 20 L 50 40 L 0 20 Z");
		expect(shapePath("triangle", 100, 40, 0)).toBe("M 0 0 L 100 20 L 0 40 Z");
		expect(shapePath("underline", 100, 40, 0)).toBe("M 0 40 L 100 40");
		expect(shapePath("parallelogram", 100, 40, 0)).toBe("M 20 0 L 100 0 L 80 40 L 0 40 Z");
	});

	it("rounds a rectangle's corners by the radius, a pill's by half its height", () => {
		expect(shapePath("rounded-rect", 100, 40, 12)).toContain("A 12 12");
		expect(shapePath("pill", 100, 40, 12)).toContain("A 20 20");
		expect(shapePath("rounded-rect", 100, 40, 0)).toBe(shapePath("rect", 100, 40, 0));
	});
});

/** Every shape a near panel draws and clips by its outline (not a rectangle, underline or none). */
const SHAPED = SHAPES.filter((shape) => !isRectShape(shape) && !isBareShape(shape));
/** The panel's padding (`.osmosis-cosmos-near-panel`) and line height, in ems. */
const PAD = { x: 0.4, y: 0.25 };
const LINE = 1.25;
/** The mind map in ems of its 13 px text: its node padding, and its default 230 px max node width. */
const MAP_PAD = { x: DEFAULT_LAYOUT_CONFIG.nodePaddingX / 13, y: DEFAULT_LAYOUT_CONFIG.nodePaddingY / 13 };
const MAP_MAX = 230 / 13;
/** Cosmos's default panel cap, in ems (`PANEL_MAX_EM`). */
const CAP = 20;

/** The mind map's node width round `text` ems of content (`assignSizes`). */
function mapWidth(shape: TopicShape, text: number): number {
	const insets = getShapeInsets(shape);
	return (text + 2 * MAP_PAD.x) / (1 - Math.min(insets.left, 0.45) - Math.min(insets.right, 0.45));
}

/**
 * A fitted panel's text rectangle (its content less the padding), centred in
 * the box's inner area, less a twentieth of an em each side: a glyph's side
 * bearing. (A wide trapezoid's top corners come within 0.02 em of its slope.)
 */
function textRect(fit: ReturnType<typeof fitShapedPanel>, text: { width: number; height: number }) {
	const [top, right, bottom, left] = fit.padding;
	const bearing = 0.05;
	return {
		x: left + (fit.width - left - right - text.width) / 2 + bearing,
		y: top + (fit.height - top - bottom - text.height) / 2 + bearing,
		width: text.width - 2 * bearing,
		height: text.height - 2 * bearing,
	};
}

describe("the cloud", () => {
	it("bulges about 7% of its box past the top and bottom in the mind map", () => {
		expect(CLOUD_BULGE).toBeGreaterThan(0.06);
		expect(CLOUD_BULGE).toBeLessThan(0.075);
	});

	it("is drawn inside its box, bulges and all, with the mind map's text box inside it", () => {
		for (const [, y] of outlinePoints("cloud", 100, 40)) {
			expect(y).toBeGreaterThanOrEqual(-1e-9);
			expect(y).toBeLessThanOrEqual(40 + 1e-9);
		}
		// The mind map's 0.18 of its box, which is the Cosmos box less the bulges.
		const mapBox = 40 / (1 + 2 * CLOUD_BULGE);
		expect(shapeInsets("cloud").top * 40).toBeCloseTo(0.18 * mapBox + CLOUD_BULGE * mapBox);
		expect(shapeInsets("cloud").left).toBe(getShapeInsets("cloud").left);
	});

	it("gives the plate shader the same polygon, in half sizes about the centre", () => {
		const points = outlinePoints("cloud", 100, 40);
		expect(CLOUD_POLYGON).toHaveLength(points.length);
		expect(CLOUD_POLYGON).toHaveLength(24);
		CLOUD_POLYGON.forEach(([x, y], i) => {
			expect(x * 50 + 50).toBeCloseTo(points[i]![0]);
			expect(20 - y * 20).toBeCloseTo(points[i]![1]);
		});
	});
});

describe("shapeWrapEm", () => {
	it("wraps a shape's text where the mind map's contentMaxWidth does, the insets and padding off its cap", () => {
		expect(shapeWrapEm("rounded-rect", CAP, PAD.x)).toBeCloseTo(19.2);
		expect(shapeWrapEm("hexagon", CAP, PAD.x)).toBeCloseTo(CAP * (1 - 0.44) - 0.8);
		expect(shapeWrapEm("diamond", CAP, PAD.x)).toBeCloseTo(CAP * 0.5 - 0.8);
		expect(shapeWrapEm("triangle", CAP, PAD.x)).toBeCloseTo(CAP * 0.5 - 0.8);
		expect(shapeWrapEm("diamond", 1, PAD.x)).toBe(0);
	});
});

describe("fitShapedPanel", () => {
	const none = { width: 0, height: 0 };
	// A long single line (8 ems, short of every shape's wrap), and a long sentence wrapped at the shape's wrap into three lines.
	const single = { width: 8, height: LINE };
	const wrapped = (shape: TopicShape) => ({ width: shapeWrapEm(shape, CAP, PAD.x), height: 3 * LINE });

	it("keeps the text inside every shape's outline", () => {
		for (const shape of SHAPED) {
			for (const text of [single, wrapped(shape)]) {
				const fit = fitShapedPanel(shape, { width: text.width + 2 * PAD.x, height: text.height + 2 * PAD.y }, none);
				expect(shapeHoldsRect(shape, fit, textRect(fit, text)), `${shape} ${text.width}`).toBe(true);
			}
		}
	});

	it("is the mind map's box round the same content", () => {
		for (const shape of SHAPED) {
			const content = { width: 8.8, height: 1.75 };
			const fit = fitShapedPanel(shape, content, none);
			const box = shapeBox(shape, content.width, content.height);
			expect(fit.width).toBeCloseTo(box.width);
			expect(fit.height).toBeCloseTo(box.height);
		}
	});

	it("leaves margins across close to the mind map's, for a single line and for wrapped text", () => {
		for (const shape of SHAPED) {
			const one = fitShapedPanel(shape, { width: single.width + 2 * PAD.x, height: single.height + 2 * PAD.y }, none);
			const oneMap = mapWidth(shape, single.width);
			expect((one.width - single.width) / 2, `${shape} single`).toBeCloseTo((oneMap - single.width) / 2, 0);
			const text = wrapped(shape);
			const many = fitShapedPanel(shape, { width: text.width + 2 * PAD.x, height: text.height + 2 * PAD.y }, none);
			// The mind map's wrapped text fills its max node width less the same insets.
			const mapText = MAP_MAX * (1 - (shape === "circle" ? 0.16 : getShapeInsets(shape).left + getShapeInsets(shape).right)) - 2 * MAP_PAD.x;
			const margin = (many.width - text.width) / 2;
			const mapMargin = (mapWidth(shape, mapText) - mapText) / 2;
			if (shape !== "circle") expect(margin / mapMargin, `${shape} wrapped`).toBeGreaterThan(0.85);
			if (shape !== "circle") expect(margin / mapMargin, `${shape} wrapped`).toBeLessThan(1.2);
		}
	});

	it("holds the whole of its plate, so the plate's outline never shows past the panel's", () => {
		for (const shape of SHAPED) {
			const text = wrapped(shape);
			// A single-line plate under a three-line panel: as wide, a third as tall.
			const content = { width: text.width + 2 * PAD.x, height: text.height + 2 * PAD.y };
			const plate = shapeBox(shape, content.width, 1.75);
			const fit = fitShapedPanel(shape, content, plate);
			expect(shapeHolds(shape, fit, plate), shape).toBe(true);
			expect(fit.width).toBeGreaterThanOrEqual(plate.width - 1e-9);
			expect(fit.height).toBeGreaterThanOrEqual(plate.height - 1e-9);
			expect(shapeHoldsRect(shape, fit, textRect(fit, text)), `${shape} text`).toBe(true);
		}
	});

	it("grows a parallelogram across, not up, to hold a flatter plate", () => {
		const fit = fitShapedPanel("parallelogram", { width: 12, height: 4 }, { width: 18.75, height: 1.75 });
		expect(fit.height).toBeCloseTo(4);
		// Its skew is its height: it has to be the height difference wider than the plate.
		expect(fit.width).toBeGreaterThanOrEqual(18.75 + 4 - 1.75 - 0.05);
		expect(fit.width).toBeLessThan(18.75 + 4 - 1.75 + 0.1);
	});

	it("pads the box by its insets", () => {
		const fit = fitShapedPanel("triangle", { width: 10, height: 2 }, none);
		expect(fit.padding[3]).toBeCloseTo(0.05 * fit.width);
		expect(fit.padding[1]).toBeCloseTo(0.45 * fit.width);
		// Not the mind map's 0.2: its inner box's top right corner would be outside the triangle.
		expect(fit.padding[0]).toBeCloseTo(0.275 * fit.height);
	});
});
