import { describe, expect, it } from "vitest";
import {
	BOUNDARY_PADDING,
	DEFAULT_BOUNDARY_OPACITY,
	MAX_BOUNDARY_WIDTH,
	boundaryHull,
	boundaryShapes,
	normalizeBoundary,
	resolveBoundary,
	roundedHullPath,
	type Box,
	type Point,
} from "./boundary";
import { lookupNodeStyleByPath, parseOsmosisStyleFrontmatter, resolveCascade } from "./styles";
import { writeStyleOverride } from "./style-write";

/** Whether `p` lies inside the convex polygon `hull` with at least `gap` to spare. */
function insideBy(hull: Point[], p: Point, gap: number): boolean {
	const n = hull.length;
	// Orientation of the hull (sign of its area), so "inside" is the same side of every edge.
	let area = 0;
	for (let i = 0; i < n; i++) {
		const a = hull[i]!;
		const b = hull[(i + 1) % n]!;
		area += a.x * b.y - b.x * a.y;
	}
	const sign = Math.sign(area);
	for (let i = 0; i < n; i++) {
		const a = hull[i]!;
		const b = hull[(i + 1) % n]!;
		const len = Math.hypot(b.x - a.x, b.y - a.y);
		const dist = (sign * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x))) / len;
		if (dist < gap - 1e-9) return false;
	}
	return true;
}

function boxCorners(b: Box): Point[] {
	return [
		{ x: b.x, y: b.y },
		{ x: b.x + b.width, y: b.y },
		{ x: b.x + b.width, y: b.y + b.height },
		{ x: b.x, y: b.y + b.height },
	];
}

describe("normalizeBoundary", () => {
	it("drops what is not a mapping", () => {
		expect(normalizeBoundary(undefined)).toBeUndefined();
		expect(normalizeBoundary("yes")).toBeUndefined();
		expect(normalizeBoundary([1])).toBeUndefined();
	});

	it("clamps opacity and width and drops unknown values", () => {
		expect(normalizeBoundary({ opacity: 3, width: 40, style: "wavy", fill: 7, color: " ", extra: 1 })).toEqual({ opacity: 1, width: MAX_BOUNDARY_WIDTH });
		expect(normalizeBoundary({ opacity: -1, width: -2, style: "dashed", fill: "#a0c4ff", enabled: false })).toEqual({
			opacity: 0,
			width: 0,
			style: "dashed",
			fill: "#a0c4ff",
			enabled: false,
		});
	});
});

describe("resolveBoundary", () => {
	it("is null without a boundary or when it is switched off", () => {
		expect(resolveBoundary(undefined)).toBeNull();
		expect(resolveBoundary({ fill: "#123456" })).toBeNull();
		expect(resolveBoundary({ boundary: { enabled: false, fill: "#123456" } })).toBeNull();
	});

	it("defaults to a soft blob tinted by the node's colour", () => {
		expect(resolveBoundary({ fill: "#ffcc00", boundary: { enabled: true } })).toEqual({
			fill: "#ffcc00",
			fillOpacity: DEFAULT_BOUNDARY_OPACITY,
			stroke: "#ffcc00",
			strokeOpacity: 0.5,
			strokeWidth: 1,
			dash: "solid",
		});
		// No fill: the border colour, then the branch colour, then the view's accent.
		expect(resolveBoundary({ border: { color: "#00f" }, boundary: {} })?.fill).toBe("#00f");
		expect(resolveBoundary({ branchLine: { color: "#0f0" }, boundary: {} })?.fill).toBe("#0f0");
		expect(resolveBoundary({ boundary: {} })?.fill).toBeNull();
	});

	it("applies explicit settings", () => {
		expect(resolveBoundary({ fill: "#fff", boundary: { fill: "#abc", opacity: 0.4, color: "#123", width: 3, style: "dotted" } })).toEqual({
			fill: "#abc",
			fillOpacity: 0.4,
			stroke: "#123",
			strokeOpacity: 1,
			strokeWidth: 3,
			dash: "dotted",
		});
		expect(resolveBoundary({ boundary: { style: "none", width: 4 } })?.strokeWidth).toBe(0);
	});

	it("lets a local style switch off a class's boundary", () => {
		const style = resolveCascade({ local: { boundary: { enabled: false } }, class: { boundary: { enabled: true, fill: "#abc" } } });
		expect(resolveBoundary(style)).toBeNull();
	});
});

describe("boundary storage", () => {
	it("writes under the stamped ^os- key and reads back by block ID, surviving a text change", () => {
		const fm: Record<string, unknown> = {};
		writeStyleOverride(fm, "^os-k1", "_n:old", { boundary: { enabled: true } });
		writeStyleOverride(fm, "^os-k1", "_n:old", { boundary: { opacity: 0.3 } });
		expect(fm).toEqual({ "osmosis-styles": { styles: { "^os-k1": { boundary: { enabled: true, opacity: 0.3 } } } } });
		// Found by block ID whatever the node's stable ID and tree path now are.
		const parsed = parseOsmosisStyleFrontmatter(fm);
		expect(lookupNodeStyleByPath(parsed, "_n:renamed", "## Renamed", "os-k1")?.boundary).toEqual({ enabled: true, opacity: 0.3 });
		writeStyleOverride(fm, "^os-k1", "_n:old", { boundary: undefined });
		expect(fm).toEqual({});
	});
});

describe("boundaryHull", () => {
	it("is a padded rectangle around one box", () => {
		const hull = boundaryHull([{ x: 10, y: 20, width: 100, height: 30 }], 12);
		expect(hull).toHaveLength(4);
		expect(hull).toEqual(
			expect.arrayContaining([
				{ x: -2, y: 8 },
				{ x: 122, y: 8 },
				{ x: 122, y: 62 },
				{ x: -2, y: 62 },
			]),
		);
	});

	it("contains every box with the padding to spare", () => {
		const boxes: Box[] = [
			{ x: 0, y: 100, width: 80, height: 24 },
			{ x: 140, y: 0, width: 60, height: 24 },
			{ x: 140, y: 90, width: 120, height: 40 },
			{ x: 140, y: 200, width: 50, height: 24 },
		];
		const hull = boundaryHull(boxes, BOUNDARY_PADDING);
		for (const b of boxes) for (const c of boxCorners(b)) expect(insideBy(hull, c, BOUNDARY_PADDING)).toBe(true);
	});

	it("rounds into a closed path, one curve per corner", () => {
		const d = roundedHullPath(boundaryHull([{ x: 0, y: 0, width: 50, height: 20 }], 10), 10);
		expect(d.startsWith("M ")).toBe(true);
		expect(d.endsWith(" Z")).toBe(true);
		expect(d.match(/Q/g)).toHaveLength(4);
		expect(roundedHullPath([], 10)).toBe("");
	});
});

describe("boundaryShapes", () => {
	interface T {
		id: string;
		rect: Box;
		children: T[];
	}
	const leaf = (id: string, x: number, y: number): T => ({ id, rect: { x, y, width: 60, height: 20 }, children: [] });

	it("wraps a single leaf alone", () => {
		const only = leaf("a", 0, 0);
		const shapes = boundaryShapes([only], (n) => n.id === "a", 10);
		expect(shapes).toHaveLength(1);
		expect(shapes[0]!.hull).toHaveLength(4);
	});

	it("wraps a node's whole subtree and nests inner boundaries inside outer ones, outer first", () => {
		const inner = { id: "inner", rect: { x: 100, y: 40, width: 60, height: 20 }, children: [leaf("c1", 200, 20), leaf("c2", 200, 60)] };
		const outer: T = { id: "outer", rect: { x: 0, y: 40, width: 60, height: 20 }, children: [inner, leaf("b", 100, 120)] };
		const root: T = { id: "root", rect: { x: -100, y: 40, width: 0, height: 0 }, children: [outer, leaf("far", 0, 400)] };
		const shapes = boundaryShapes([root], (n) => n.id === "outer" || n.id === "inner", 10);
		expect(shapes.map((s) => s.node.id)).toEqual(["outer", "inner"]);
		const [o, i] = shapes;
		for (const n of [outer, inner, ...inner.children, outer.children[1]!]) for (const c of boxCorners(n.rect)) expect(insideBy(o!.hull, c, 10)).toBe(true);
		// The inner boundary sits inside the outer one with the padding between them.
		for (const v of i!.hull) expect(insideBy(o!.hull, v, 10)).toBe(true);
		// Nothing outside the subtree is wrapped.
		for (const c of boxCorners({ x: 0, y: 400, width: 60, height: 20 })) expect(insideBy(o!.hull, c, 0)).toBe(false);
	});

	it("finds nothing when no node has a boundary", () => {
		expect(boundaryShapes([leaf("a", 0, 0)], () => false, 10)).toEqual([]);
	});
});
