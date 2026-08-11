import { describe, it, expect } from "vitest";
import type { OcclusionShape } from "../database/types";
import type { Box } from "./occlusion-geometry";
import {
	alignShapes,
	boxFromDrag,
	clamp01,
	cloneShape,
	containsPoint,
	DOUBLE_CLICK_MS,
	duplicateAnnotation,
	duplicateShape,
	handleAt,
	handlePoint,
	hitTest,
	isDegenerate,
	isDoubleClick,
	MIN_POLY_POINTS,
	MIN_SHAPE_SIZE,
	moveBox,
	moveShapes,
	nextGroup,
	polyFromPoints,
	resizeBox,
	shapeBox,
	shapeFromBox,
	shapeWithBox,
	toNormalized,
	unionBox,
	usedGroups,
	vertexAt,
	withVertexInserted,
	withVertexMoved,
	withVertexRemoved,
	zoomBy,
	ZOOM_MAX,
	ZOOM_MIN,
	ZOOM_STEP,
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

// ── Phase 4: polygons, arrangement, and zoom ──────────────────

describe("polyFromPoints", () => {
	it("builds a polygon from the vertices a draft collected", () => {
		const shape = polyFromPoints("c5", [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.1 }, { x: 0.25, y: 0.5 }]);

		expect(shape).toEqual({
			group: "c5",
			kind: "poly",
			points: [[0.1, 0.1], [0.4, 0.1], [0.25, 0.5]],
		});
	});

	it("refuses a draft that encloses no area", () => {
		// Two points draw an invisible mask, which is a card nobody can answer.
		expect(polyFromPoints("c1", [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.1 }])).toBeNull();
		expect(MIN_POLY_POINTS).toBe(3);
	});
});

describe("vertexAt", () => {
	// Per-axis, because the 0-1 space is stretched to the image's aspect ratio.
	const tolerance = { x: 0.03, y: 0.06 };

	it("finds the vertex under the pointer", () => {
		expect(vertexAt([[0.2, 0.2], [0.6, 0.2], [0.4, 0.6]], { x: 0.61, y: 0.22 }, tolerance)).toBe(1);
	});

	it("reports nothing when the pointer is on the outline but off every vertex", () => {
		expect(vertexAt([[0.2, 0.2], [0.6, 0.2], [0.4, 0.6]], { x: 0.4, y: 0.2 }, tolerance)).toBeNull();
	});

	it("uses each axis's own tolerance rather than a single scalar", () => {
		// 0.05 away on y is inside the taller tolerance; the same distance on x
		// is outside the narrower one. A scalar could not tell these apart.
		expect(vertexAt([[0.2, 0.2]], { x: 0.2, y: 0.25 }, tolerance)).toBe(0);
		expect(vertexAt([[0.2, 0.2]], { x: 0.25, y: 0.2 }, tolerance)).toBeNull();
	});
});

describe("withVertexMoved", () => {
	it("moves one vertex and leaves the rest alone", () => {
		const moved = withVertexMoved(poly, 1, { x: 0.7, y: 0.3 });

		expect(moved.kind).toBe("poly");
		if (moved.kind === "poly") {
			expectPoints(moved.points, [[0.2, 0.2], [0.7, 0.3], [0.4, 0.6]]);
		}
	});

	it("does not share the points array with the shape it came from", () => {
		const moved = withVertexMoved(poly, 0, { x: 0.9, y: 0.9 });

		expect(moved).not.toBe(poly);
		if (poly.kind === "poly") expect(poly.points[0]).toEqual([0.2, 0.2]);
	});

	it("clamps a vertex dragged past the image, as the drag holds capture", () => {
		const moved = withVertexMoved(poly, 0, { x: -0.4, y: 1.8 });

		if (moved.kind === "poly") expect(moved.points[0]).toEqual([0, 1]);
	});

	it("passes other kinds through untouched", () => {
		expect(withVertexMoved(rect, 0, { x: 0.9, y: 0.9 })).toEqual(rect);
	});
});

describe("withVertexRemoved", () => {
	const square: OcclusionShape = {
		group: "c1",
		kind: "poly",
		points: [[0.2, 0.2], [0.6, 0.2], [0.6, 0.6], [0.2, 0.6]],
	};

	it("drops the named vertex", () => {
		const shorter = withVertexRemoved(square, 1);

		if (shorter.kind === "poly") expectPoints(shorter.points, [[0.2, 0.2], [0.6, 0.6], [0.2, 0.6]]);
	});

	it("refuses at three points rather than deleting the mask", () => {
		// The user asked to drop a point, not to lose a card that may be deep
		// into review.
		expect(withVertexRemoved(poly, 0)).toEqual(poly);
	});

	it("ignores an index that is not there", () => {
		expect(withVertexRemoved(square, 9)).toEqual(square);
	});
});

describe("withVertexInserted", () => {
	it("splits the edge the point lies closest to", () => {
		const { shape, index } = withVertexInserted(poly, { x: 0.4, y: 0.21 });

		expect(index).toBe(1);
		if (shape.kind === "poly") {
			expectPoints(shape.points, [[0.2, 0.2], [0.4, 0.2], [0.6, 0.2], [0.4, 0.6]]);
		}
	});

	it("can split the closing edge, which has no successor in the list", () => {
		const { index } = withVertexInserted(poly, { x: 0.3, y: 0.4 });

		expect(index).toBe(3);
	});

	it("projects the point onto the edge rather than taking it literally", () => {
		// The click is inside the shape, but the new vertex belongs on the outline
		// — dropping it where the pointer was would dent the polygon inwards.
		const { shape } = withVertexInserted(poly, { x: 0.4, y: 0.26 });

		if (shape.kind === "poly") expect(shape.points[1]).toEqual([0.4, 0.2]);
	});

	it("passes other kinds through untouched", () => {
		expect(withVertexInserted(rect, { x: 0.3, y: 0.3 })).toEqual({ shape: rect, index: -1 });
	});
});

describe("unionBox", () => {
	it("spans every box it is given", () => {
		expectBox(unionBox([shapeBox(rect), shapeBox(ellipse)]), { x: 0.2, y: 0.1, w: 0.4, h: 0.6 });
	});

	it("is a zero box when there is nothing to span", () => {
		expectBox(unionBox([]), { x: 0, y: 0, w: 0, h: 0 });
	});
});

describe("alignShapes", () => {
	const a: OcclusionShape = { group: "c1", kind: "rect", x: 0.1, y: 0.1, w: 0.2, h: 0.1 };
	const b: OcclusionShape = { group: "c2", kind: "rect", x: 0.5, y: 0.4, w: 0.3, h: 0.2 };

	it("lines shapes up on the selection's own bounding box, not the image edge", () => {
		// Aligning to the picture's border would stack every mask on the edge;
		// every drawing tool aligns to the selection instead.
		const aligned = alignShapes([a, b], [0, 1], "left");

		expectBox(shapeBox(aligned[0]!), { x: 0.1, y: 0.1, w: 0.2, h: 0.1 });
		expectBox(shapeBox(aligned[1]!), { x: 0.1, y: 0.4, w: 0.3, h: 0.2 });
	});

	it("aligns right to the selection's far edge", () => {
		const aligned = alignShapes([a, b], [0, 1], "right");

		expectBox(shapeBox(aligned[0]!), { x: 0.6, y: 0.1, w: 0.2, h: 0.1 });
		expectBox(shapeBox(aligned[1]!), { x: 0.5, y: 0.4, w: 0.3, h: 0.2 });
	});

	it("centres on the horizontal midline without touching the vertical axis", () => {
		const aligned = alignShapes([a, b], [0, 1], "center");

		expectBox(shapeBox(aligned[0]!), { x: 0.35, y: 0.1, w: 0.2, h: 0.1 });
		expectBox(shapeBox(aligned[1]!), { x: 0.3, y: 0.4, w: 0.3, h: 0.2 });
	});

	it("aligns top, middle, and bottom on the other axis", () => {
		expectBox(shapeBox(alignShapes([a, b], [0, 1], "top")[1]!), { x: 0.5, y: 0.1, w: 0.3, h: 0.2 });
		expectBox(shapeBox(alignShapes([a, b], [0, 1], "middle")[1]!), { x: 0.5, y: 0.25, w: 0.3, h: 0.2 });
		expectBox(shapeBox(alignShapes([a, b], [0, 1], "bottom")[1]!), { x: 0.5, y: 0.4, w: 0.3, h: 0.2 });
	});

	it("never resizes — a mask drawn to fit a label still fits it", () => {
		const aligned = alignShapes([a, b], [0, 1], "left");

		expect(shapeBox(aligned[1]!).w).toBeCloseTo(0.3);
		expect(shapeBox(aligned[1]!).h).toBeCloseTo(0.2);
	});

	it("keeps an ellipse an ellipse, re-fitting it through its box", () => {
		const aligned = alignShapes([rect, ellipse], [0, 1], "left");

		expect(aligned[1]!.kind).toBe("ellipse");
		expectBox(shapeBox(aligned[1]!), { x: 0.2, y: 0.3, w: 0.2, h: 0.4 });
	});

	it("does nothing below two shapes, where alignment has no meaning", () => {
		expect(alignShapes([a, b], [0], "left")).toEqual([a, b]);
	});

	it("leaves unselected shapes exactly where they were", () => {
		const aligned = alignShapes([a, b, rect], [0, 1], "left");

		expect(aligned[2]).toEqual(rect);
	});
});

describe("moveShapes", () => {
	const a: OcclusionShape = { group: "c1", kind: "rect", x: 0.1, y: 0.1, w: 0.2, h: 0.1 };
	const b: OcclusionShape = { group: "c2", kind: "rect", x: 0.5, y: 0.4, w: 0.3, h: 0.2 };

	it("moves every selected shape by the same delta", () => {
		const moved = moveShapes([a, b], [0, 1], 0.1, 0.2);

		expectBox(shapeBox(moved[0]!), { x: 0.2, y: 0.3, w: 0.2, h: 0.1 });
		expectBox(shapeBox(moved[1]!), { x: 0.6, y: 0.6, w: 0.3, h: 0.2 });
	});

	it("clamps the selection as a whole, so an arrangement is never deformed", () => {
		// Clamping each shape on its own would let the trailing one keep going
		// after the leading one hit the edge, silently squashing the group.
		// The union spans 0.1–0.8, so it can only travel 0.2 before its trailing
		// edge reaches the border; both shapes move by that, not by the 0.9 asked.
		const moved = moveShapes([a, b], [0, 1], 0.9, 0);

		expectBox(shapeBox(moved[1]!), { x: 0.7, y: 0.4, w: 0.3, h: 0.2 });
		expectBox(shapeBox(moved[0]!), { x: 0.3, y: 0.1, w: 0.2, h: 0.1 });
	});

	it("leaves unselected shapes alone", () => {
		expect(moveShapes([a, b], [0], 0.1, 0)[1]).toEqual(b);
	});
});

describe("cloneShape", () => {
	it("copies a polygon's points rather than sharing the array", () => {
		const copy = cloneShape(poly);

		expect(copy).toEqual(poly);
		if (copy.kind === "poly" && poly.kind === "poly") {
			expect(copy.points).not.toBe(poly.points);
			expect(copy.points[0]).not.toBe(poly.points[0]);
		}
	});
});

describe("duplicateShape", () => {
	it("keeps the copy in its source's group, so it joins the same card", () => {
		// A copy that started its own group would turn one card into two behind
		// the user's back.
		expect(duplicateShape(rect).group).toBe("c1");
	});

	it("nudges the copy clear of the original", () => {
		expectBox(shapeBox(duplicateShape(rect, 0.05)), { x: 0.25, y: 0.15, w: 0.4, h: 0.3 });
	});

	it("keeps the copy inside the image", () => {
		const edge: OcclusionShape = { group: "c1", kind: "rect", x: 0.9, y: 0.9, w: 0.1, h: 0.1 };

		expectBox(shapeBox(duplicateShape(edge, 0.05)), { x: 0.9, y: 0.9, w: 0.1, h: 0.1 });
	});
});

describe("duplicateAnnotation", () => {
	it("nudges the copy clear and keeps it on the image", () => {
		expect(duplicateAnnotation({ x: 0.5, y: 0.99, text: "Deck" }, 0.05))
			.toEqual({ x: 0.55, y: 1, text: "Deck" });
	});
});

describe("isDoubleClick", () => {
	const tolerance = { x: 0.03, y: 0.06 };
	const first = { time: 1000, point: { x: 0.3, y: 0.2 } };

	it("pairs a second press that lands soon enough and close enough", () => {
		expect(isDoubleClick(first, 1200, { x: 0.31, y: 0.21 }, tolerance)).toBe(true);
	});

	it("refuses a press that came too late", () => {
		expect(isDoubleClick(first, 1000 + DOUBLE_CLICK_MS + 1, { x: 0.3, y: 0.2 }, tolerance)).toBe(false);
	});

	it("refuses a press that landed somewhere else", () => {
		expect(isDoubleClick(first, 1100, { x: 0.5, y: 0.2 }, tolerance)).toBe(false);
	});

	it("measures proximity per axis, as every tolerance here does", () => {
		// The 0–1 space is stretched to the image's aspect ratio, so one
		// normalised unit is a different number of pixels on each axis.
		expect(isDoubleClick(first, 1100, { x: 0.3, y: 0.25 }, tolerance)).toBe(true);
		expect(isDoubleClick(first, 1100, { x: 0.35, y: 0.2 }, tolerance)).toBe(false);
	});

	it("has nothing to pair with on the first press", () => {
		expect(isDoubleClick(null, 1000, { x: 0.3, y: 0.2 }, tolerance)).toBe(false);
	});
});

describe("zoomBy", () => {
	it("steps up and down by the given factor", () => {
		expect(zoomBy(2, ZOOM_STEP)).toBeCloseTo(2.5);
		expect(zoomBy(2, 1 / ZOOM_STEP)).toBeCloseTo(1.6);
	});

	it("floors at fit, which is what the canvas already shows at rest", () => {
		expect(zoomBy(ZOOM_MIN, 1 / ZOOM_STEP)).toBe(ZOOM_MIN);
	});

	it("caps rather than running away", () => {
		expect(zoomBy(ZOOM_MAX, ZOOM_STEP)).toBe(ZOOM_MAX);
	});
});
