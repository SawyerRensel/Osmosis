import { describe, it, expect } from "vitest";
import type { OcclusionShape } from "../database/types";
import type { Box } from "./occlusion-geometry";
import {
	boxFromDrag,
	clamp01,
	containsPoint,
	handleAt,
	handlePoint,
	hitTest,
	isDegenerate,
	MIN_SHAPE_SIZE,
	moveBox,
	nextGroup,
	resizeBox,
	shapeBox,
	shapeFromBox,
	shapeWithBox,
	toNormalized,
	usedGroups,
} from "./occlusion-geometry";

/** A 400×200 image at an offset, so x and y scale differently. */
const imageBox = { left: 100, top: 50, width: 400, height: 200 };

/**
 * Compare boxes field by field with a tolerance. Normalised coordinates are the
 * result of arithmetic on floats, so `0.2 + 0.4` is not `0.6` and exact
 * equality would pin the tests to IEEE noise rather than to the geometry.
 */
function expectBox(actual: Box, expected: Box): void {
	expect(actual.x).toBeCloseTo(expected.x);
	expect(actual.y).toBeCloseTo(expected.y);
	expect(actual.w).toBeCloseTo(expected.w);
	expect(actual.h).toBeCloseTo(expected.h);
}

function expectPoints(actual: readonly [number, number][], expected: [number, number][]): void {
	expect(actual.length).toBe(expected.length);
	actual.forEach(([x, y], i) => {
		expect(x).toBeCloseTo(expected[i]![0]);
		expect(y).toBeCloseTo(expected[i]![1]);
	});
}

const rect: OcclusionShape = { group: "c1", kind: "rect", x: 0.2, y: 0.1, w: 0.4, h: 0.3 };
const ellipse: OcclusionShape = { group: "c2", kind: "ellipse", x: 0.5, y: 0.5, rx: 0.1, ry: 0.2 };
const poly: OcclusionShape = {
	group: "c3",
	kind: "poly",
	points: [[0.2, 0.2], [0.6, 0.2], [0.4, 0.6]],
};

describe("toNormalized", () => {
	it("maps a client point into the image's 0-1 space", () => {
		expect(toNormalized(300, 150, imageBox)).toEqual({ x: 0.5, y: 0.5 });
	});

	it("clamps a pointer that has left the image, since a drag holds capture", () => {
		expect(toNormalized(0, 0, imageBox)).toEqual({ x: 0, y: 0 });
		expect(toNormalized(9999, 9999, imageBox)).toEqual({ x: 1, y: 1 });
	});

	it("survives a zero-sized box rather than returning NaN", () => {
		expect(toNormalized(10, 10, { left: 0, top: 0, width: 0, height: 0 }))
			.toEqual({ x: 0, y: 0 });
	});

	it("round-trips a pixel position back to the pixel it came from", () => {
		const point = toNormalized(340, 110, imageBox);
		expect(imageBox.left + point.x * imageBox.width).toBeCloseTo(340);
		expect(imageBox.top + point.y * imageBox.height).toBeCloseTo(110);
	});
});

describe("clamp01", () => {
	it("passes through, floors, and ceils", () => {
		expect([clamp01(0.4), clamp01(-2), clamp01(3)]).toEqual([0.4, 0, 1]);
	});
});

describe("boxFromDrag", () => {
	it("spans two corners dragged down-right", () => {
		expectBox(boxFromDrag({ x: 0.1, y: 0.2 }, { x: 0.5, y: 0.6 }), { x: 0.1, y: 0.2, w: 0.4, h: 0.4 });
	});

	it("spans the same box when dragged up-left", () => {
		expectBox(boxFromDrag({ x: 0.5, y: 0.6 }, { x: 0.1, y: 0.2 }), { x: 0.1, y: 0.2, w: 0.4, h: 0.4 });
	});
});

describe("isDegenerate", () => {
	it("rejects a click, so tapping with the rect tool draws nothing", () => {
		expect(isDegenerate(boxFromDrag({ x: 0.3, y: 0.3 }, { x: 0.3, y: 0.3 }))).toBe(true);
	});

	it("rejects a box thin on only one axis", () => {
		expect(isDegenerate({ x: 0, y: 0, w: 0.5, h: MIN_SHAPE_SIZE / 2 })).toBe(true);
	});

	it("accepts a real drag", () => {
		expect(isDegenerate({ x: 0, y: 0, w: 0.2, h: 0.2 })).toBe(false);
	});
});

describe("shapeBox", () => {
	it("returns a rect's own geometry", () => {
		expect(shapeBox(rect)).toEqual({ x: 0.2, y: 0.1, w: 0.4, h: 0.3 });
	});

	it("expands an ellipse's centre and radii into a box", () => {
		expect(shapeBox(ellipse)).toEqual({ x: 0.4, y: 0.3, w: 0.2, h: 0.4 });
	});

	it("takes a polygon's extent", () => {
		expectBox(shapeBox(poly), { x: 0.2, y: 0.2, w: 0.4, h: 0.4 });
	});
});

describe("shapeWithBox", () => {
	const target = { x: 0.5, y: 0.5, w: 0.2, h: 0.1 };

	it("round-trips every kind through its own bounding box", () => {
		for (const shape of [rect, ellipse, poly]) {
			expectBox(shapeBox(shapeWithBox(shape, target)), target);
		}
	});

	it("keeps the group when re-fitting", () => {
		expect(shapeWithBox(ellipse, target).group).toBe("c2");
	});

	it("scales a polygon's points into the new box", () => {
		const moved = shapeWithBox(poly, target);
		expect(moved.kind).toBe("poly");
		if (moved.kind !== "poly") return;
		expectPoints(moved.points, [[0.5, 0.5], [0.7, 0.5], [0.6, 0.6]]);
	});

	it("translates a flat polygon instead of dividing by its zero extent", () => {
		const flat: OcclusionShape = { group: "c1", kind: "poly", points: [[0.1, 0.4], [0.5, 0.4]] };
		const moved = shapeWithBox(flat, { x: 0.2, y: 0.7, w: 0.4, h: 0 });
		expect(moved.kind).toBe("poly");
		if (moved.kind !== "poly") return;
		expect(moved.points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
	});
});

describe("shapeFromBox", () => {
	it("builds a rect matching the swept box", () => {
		expect(shapeFromBox("rect", "c1", { x: 0.1, y: 0.2, w: 0.3, h: 0.4 }))
			.toEqual({ group: "c1", kind: "rect", x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
	});

	it("builds an ellipse inscribed in the swept box, centred", () => {
		const shape = shapeFromBox("ellipse", "c2", { x: 0.1, y: 0.2, w: 0.4, h: 0.2 });
		expect(shape.kind).toBe("ellipse");
		if (shape.kind !== "ellipse") return;
		expect(shape.group).toBe("c2");
		expect(shape.x).toBeCloseTo(0.3);
		expect(shape.y).toBeCloseTo(0.3);
		expect(shape.rx).toBeCloseTo(0.2);
		expect(shape.ry).toBeCloseTo(0.1);
	});
});

describe("containsPoint", () => {
	it("hits inside a rect and misses outside it", () => {
		expect(containsPoint(rect, { x: 0.3, y: 0.2 })).toBe(true);
		expect(containsPoint(rect, { x: 0.9, y: 0.2 })).toBe(false);
	});

	it("tests an ellipse against its outline, not its bounding box", () => {
		expect(containsPoint(ellipse, { x: 0.5, y: 0.5 })).toBe(true);
		// Inside the bounding box, outside the ellipse — its top-left corner.
		expect(containsPoint(ellipse, { x: 0.41, y: 0.31 })).toBe(false);
	});

	it("misses a degenerate ellipse rather than dividing by zero", () => {
		const flat: OcclusionShape = { group: "c1", kind: "ellipse", x: 0.5, y: 0.5, rx: 0, ry: 0.2 };
		expect(containsPoint(flat, { x: 0.5, y: 0.5 })).toBe(false);
	});

	it("tests a polygon against its outline", () => {
		expect(containsPoint(poly, { x: 0.4, y: 0.3 })).toBe(true);
		// Inside the bounding box, outside the triangle — its bottom-left corner.
		expect(containsPoint(poly, { x: 0.22, y: 0.58 })).toBe(false);
	});
});

describe("hitTest", () => {
	const overlapping: OcclusionShape[] = [
		{ group: "c1", kind: "rect", x: 0, y: 0, w: 0.8, h: 0.8 },
		{ group: "c2", kind: "rect", x: 0.2, y: 0.2, w: 0.2, h: 0.2 },
	];

	it("grabs the shape on top, which is the one drawn last", () => {
		expect(hitTest(overlapping, { x: 0.3, y: 0.3 })).toBe(1);
	});

	it("falls through to the shape underneath outside the top one", () => {
		expect(hitTest(overlapping, { x: 0.7, y: 0.7 })).toBe(0);
	});

	it("returns -1 on empty canvas", () => {
		expect(hitTest(overlapping, { x: 0.95, y: 0.95 })).toBe(-1);
		expect(hitTest([], { x: 0.5, y: 0.5 })).toBe(-1);
	});
});

describe("handlePoint", () => {
	const box = { x: 0.2, y: 0.4, w: 0.4, h: 0.2 };

	it("places the corners on the box's corners", () => {
		expect(handlePoint(box, "nw")).toEqual({ x: 0.2, y: 0.4 });
		expect(handlePoint(box, "se").x).toBeCloseTo(0.6);
		expect(handlePoint(box, "se").y).toBeCloseTo(0.6);
	});

	it("places the edge handles at the midpoints", () => {
		expect(handlePoint(box, "n")).toEqual({ x: 0.4, y: 0.4 });
		expect(handlePoint(box, "w")).toEqual({ x: 0.2, y: 0.5 });
	});
});

describe("handleAt", () => {
	const box = { x: 0.2, y: 0.2, w: 0.4, h: 0.4 };
	const tolerance = { x: 0.02, y: 0.04 };

	it("grabs a handle within tolerance", () => {
		expect(handleAt(box, { x: 0.205, y: 0.21 }, tolerance)).toBe("nw");
	});

	it("misses when outside tolerance", () => {
		expect(handleAt(box, { x: 0.4, y: 0.4 }, tolerance)).toBeNull();
	});

	it("uses per-axis tolerance, since the 0-1 space is stretched to the image", () => {
		// 0.03 off on y is inside the y tolerance; the same offset on x is not.
		expect(handleAt(box, { x: 0.2, y: 0.23 }, tolerance)).toBe("nw");
		expect(handleAt(box, { x: 0.23, y: 0.2 }, tolerance)).toBeNull();
	});

	it("prefers a corner over the edge that overlaps it", () => {
		expect(handleAt(box, { x: 0.6, y: 0.6 }, tolerance)).toBe("se");
	});
});

describe("moveBox", () => {
	const box = { x: 0.2, y: 0.2, w: 0.2, h: 0.2 };

	it("shifts by the delta", () => {
		expectBox(moveBox(box, 0.1, -0.1), { x: 0.3, y: 0.1, w: 0.2, h: 0.2 });
	});

	it("stops at the edge keeping its size, rather than squashing", () => {
		expectBox(moveBox(box, 5, 5), { x: 0.8, y: 0.8, w: 0.2, h: 0.2 });
		expectBox(moveBox(box, -5, -5), { x: 0, y: 0, w: 0.2, h: 0.2 });
	});

	it("pins a box wider than the image at the origin", () => {
		expect(moveBox({ x: 0, y: 0, w: 1.5, h: 0.2 }, 0.3, 0).x).toBe(0);
	});
});

describe("resizeBox", () => {
	const box = { x: 0.2, y: 0.2, w: 0.4, h: 0.4 };

	it("moves only the edges the handle owns", () => {
		expectBox(resizeBox(box, "e", { x: 0.9, y: 0.9 }), { x: 0.2, y: 0.2, w: 0.7, h: 0.4 });
	});

	it("moves both axes from a corner", () => {
		const next = resizeBox(box, "nw", { x: 0.1, y: 0.1 });
		expect(next.x).toBeCloseTo(0.1);
		expect(next.y).toBeCloseTo(0.1);
		expect(next.w).toBeCloseTo(0.5);
		expect(next.h).toBeCloseTo(0.5);
	});

	it("flips rather than inverting when dragged past the opposite edge", () => {
		const next = resizeBox(box, "e", { x: 0.05, y: 0.5 });
		expect(next.x).toBeCloseTo(0.05);
		expect(next.w).toBeCloseTo(0.15);
	});

	it("clamps a handle dragged outside the image", () => {
		const next = resizeBox(box, "se", { x: 5, y: 5 });
		expect(next.x + next.w).toBeCloseTo(1);
		expect(next.y + next.h).toBeCloseTo(1);
	});

	it("enforces the minimum on the axes the handle moves", () => {
		const next = resizeBox(box, "se", { x: 0.2, y: 0.2 });
		expect(next.w).toBe(MIN_SHAPE_SIZE);
		expect(next.h).toBe(MIN_SHAPE_SIZE);
	});

	it("leaves the untouched axis alone when an edge handle collapses", () => {
		expect(resizeBox(box, "s", { x: 0.5, y: 0.1 }).w).toBeCloseTo(0.4);
	});
});

describe("nextGroup", () => {
	it("starts at c1 on an empty canvas", () => {
		expect(nextGroup([])).toBe("c1");
	});

	it("continues above the highest in use rather than filling a gap", () => {
		// c2's card may still hold a schedule; reusing the number would present a
		// brand-new mask as a card already deep into review.
		expect(nextGroup(["c1", "c3"])).toBe("c4");
	});

	it("ignores labels that are not cN", () => {
		expect(nextGroup(["c2", "banner"])).toBe("c3");
	});

	it("numbers above every set in the carrier, not just the one being edited", () => {
		// Two labelled embeds in one fence both derive `<fenceId>-cN`, so numbering
		// each from c1 would make the second card overwrite the first.
		expect(nextGroup([...usedGroups([rect]), ...usedGroups([ellipse, poly])])).toBe("c4");
	});
});

describe("usedGroups", () => {
	it("lists each group once, in first-appearance order", () => {
		expect(usedGroups([ellipse, rect, ellipse])).toEqual(["c2", "c1"]);
	});
});
