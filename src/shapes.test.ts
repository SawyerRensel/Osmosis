// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { createShapeElement, SHAPE_LABELS, getShapeInsets } from "./shapes";
import type { TopicShape } from "./styles";

const ALL_SHAPES = Object.keys(SHAPE_LABELS) as TopicShape[];

describe("createShapeElement", () => {
	const x = 10;
	const y = 20;
	const w = 120;
	const h = 40;

	it("returns an SVG element for every defined shape", () => {
		for (const shape of ALL_SHAPES) {
			const el = createShapeElement(shape, x, y, w, h);
			expect(el).toBeDefined();
			expect(el.namespaceURI).toBe("http://www.w3.org/2000/svg");
		}
	});

	it("rect produces a <rect> with no rounding", () => {
		const el = createShapeElement("rect", x, y, w, h);
		expect(el.tagName).toBe("rect");
		expect(el.getAttribute("rx")).toBeNull();
		expect(el.getAttribute("x")).toBe(String(x));
		expect(el.getAttribute("width")).toBe(String(w));
	});

	it("rounded-rect produces a <rect> with rx=4", () => {
		const el = createShapeElement("rounded-rect", x, y, w, h);
		expect(el.tagName).toBe("rect");
		expect(el.getAttribute("rx")).toBe("4");
	});

	it("pill produces a <rect> with rx = height/2", () => {
		const el = createShapeElement("pill", x, y, w, h);
		expect(el.tagName).toBe("rect");
		expect(el.getAttribute("rx")).toBe(String(h / 2));
	});

	it("ellipse produces an <ellipse> centered on the bounding box", () => {
		const el = createShapeElement("ellipse", x, y, w, h);
		expect(el.tagName).toBe("ellipse");
		expect(el.getAttribute("cx")).toBe(String(x + w / 2));
		expect(el.getAttribute("cy")).toBe(String(y + h / 2));
		expect(el.getAttribute("rx")).toBe(String(w / 2));
		expect(el.getAttribute("ry")).toBe(String(h / 2));
	});

	it("circle produces a <circle> using the larger dimension", () => {
		const el = createShapeElement("circle", x, y, w, h);
		expect(el.tagName).toBe("circle");
		const r = Math.max(w, h) / 2;
		expect(el.getAttribute("r")).toBe(String(r));
	});

	const pathShapes: TopicShape[] = [
		"diamond", "hexagon", "octagon", "triangle",
		"parallelogram", "trapezoid", "cloud",
		"arrow-right", "underline",
	];

	for (const shape of pathShapes) {
		it(`${shape} produces a <path> with a non-empty d attribute`, () => {
			const el = createShapeElement(shape, x, y, w, h);
			expect(el.tagName).toBe("path");
			const d = el.getAttribute("d");
			expect(d).toBeTruthy();
			expect(d!.length).toBeGreaterThan(0);
		});
	}

	it("none produces a <rect> with fill=none and stroke=none", () => {
		const el = createShapeElement("none", x, y, w, h);
		expect(el.tagName).toBe("rect");
		expect(el.getAttribute("fill")).toBe("none");
		expect(el.getAttribute("stroke")).toBe("none");
	});

	it("SHAPE_LABELS has a label for every TopicShape", () => {
		// Verify that the labels object matches the shape type exactly
		expect(ALL_SHAPES.length).toBe(15);
		for (const shape of ALL_SHAPES) {
			expect(typeof SHAPE_LABELS[shape]).toBe("string");
			expect(SHAPE_LABELS[shape].length).toBeGreaterThan(0);
		}
	});
});

describe("getShapeInsets", () => {
	it("returns zero insets for rectangular shapes", () => {
		for (const shape of ["rect", "rounded-rect", "underline", "none"] as TopicShape[]) {
			const insets = getShapeInsets(shape);
			expect(insets.x).toBe(0);
			expect(insets.y).toBe(0);
		}
	});

	it("returns positive insets for non-rectangular shapes", () => {
		const nonRect: TopicShape[] = [
			"ellipse", "circle", "diamond", "hexagon", "octagon",
			"triangle", "parallelogram", "trapezoid", "cloud",
			"arrow-right", "pill",
		];
		for (const shape of nonRect) {
			const insets = getShapeInsets(shape);
			expect(insets.x > 0 || insets.y > 0).toBe(true);
		}
	});

	it("insets are less than 0.5 (content area is always positive)", () => {
		for (const shape of ALL_SHAPES) {
			const insets = getShapeInsets(shape);
			expect(insets.x).toBeLessThan(0.5);
			expect(insets.y).toBeLessThan(0.5);
		}
	});

	it("diamond has the largest insets among common shapes", () => {
		const diamond = getShapeInsets("diamond");
		const rect = getShapeInsets("rounded-rect");
		expect(diamond.x).toBeGreaterThan(rect.x);
		expect(diamond.y).toBeGreaterThan(rect.y);
	});
});
