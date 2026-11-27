import { describe, expect, it } from "vitest";
import { DEFAULT_BRANCH_THICKNESS, TAPER_MIN_WIDTH, TAPER_ROOT_WIDTH, branchEnds, dashOf, depthWidth, hierarchyDepths, ownThickness, ribbonCorners, styledEnds } from "./taper";

const PX = 0.2;

describe("depthWidth", () => {
	it("is the root width at depth 0 and shrinks with every level", () => {
		expect(depthWidth(0)).toBeCloseTo(TAPER_ROOT_WIDTH);
		for (let d = 0; d < 8; d++) expect(depthWidth(d + 1)).toBeLessThanOrEqual(depthWidth(d));
		expect(depthWidth(1)).toBeLessThan(depthWidth(0));
	});

	it("never goes below the minimum, however deep", () => {
		expect(depthWidth(40)).toBeCloseTo(TAPER_MIN_WIDTH);
		expect(depthWidth(Infinity)).toBeCloseTo(TAPER_MIN_WIDTH);
		expect(depthWidth(-3)).toBeCloseTo(TAPER_ROOT_WIDTH);
	});

	it("scales how far above the minimum a depth is by the strength", () => {
		expect(depthWidth(0, 2) - TAPER_MIN_WIDTH).toBeCloseTo(2 * (TAPER_ROOT_WIDTH - TAPER_MIN_WIDTH));
		expect(depthWidth(0, 0)).toBeCloseTo(TAPER_MIN_WIDTH);
	});
});

describe("branchEnds", () => {
	it("tapers from the parent's depth width to the child's with no branch style", () => {
		for (let d = 0; d < 6; d++) {
			const ends = branchEnds(d, null, 1, PX);
			expect(ends.parent).toBeCloseTo(depthWidth(d));
			expect(ends.child).toBeCloseTo(depthWidth(d + 1));
			expect(ends.parent).toBeGreaterThanOrEqual(ends.child);
		}
	});

	it("lets a node's branch style beat the depth taper", () => {
		expect(branchEnds(0, { taper: "none" }, 1, PX)).toEqual({ parent: depthWidth(0), child: depthWidth(0) });
		expect(branchEnds(2, { thickness: 5, taper: "none" }, 1, PX)).toEqual({ parent: 1, child: 1 });
		const fade = branchEnds(0, { thickness: 5, taper: "fade" }, 1, PX);
		expect(fade.parent).toBeCloseTo(1);
		expect(fade.child).toBeCloseTo(0.3 * PX);
		const grow = branchEnds(0, { thickness: 5, taper: "grow" }, 1, PX);
		expect(grow.parent).toBeCloseTo(0.3 * PX);
		expect(grow.child).toBeCloseTo(1);
	});

	it("keeps the depth taper's ratio for a thickness with no taper, and ignores the strength for it", () => {
		const ends = branchEnds(1, { thickness: 10 }, 2, PX);
		expect(ends.parent).toBeCloseTo(2);
		expect(ends.child / ends.parent).toBeCloseTo(depthWidth(2, 2) / depthWidth(1, 2));
	});

	it("ignores a malformed thickness", () => {
		expect(branchEnds(0, { thickness: Number.NaN }, 1, PX)).toEqual(branchEnds(0, null, 1, PX));
		expect(branchEnds(0, { thickness: -2 }, 1, PX)).toEqual(branchEnds(0, null, 1, PX));
	});

	it("keeps the depth taper under the mind map's default thickness, which every theme sets", () => {
		expect(branchEnds(1, { thickness: DEFAULT_BRANCH_THICKNESS }, 1, PX)).toEqual(branchEnds(1, null, 1, PX));
	});
});

describe("ownThickness", () => {
	it("is a positive thickness other than the mind map's default, else null", () => {
		expect(ownThickness({ thickness: 4 })).toBe(4);
		expect(ownThickness({ thickness: DEFAULT_BRANCH_THICKNESS })).toBeNull();
		expect(ownThickness({ thickness: 0 })).toBeNull();
		expect(ownThickness(null)).toBeNull();
	});
});

describe("styledEnds", () => {
	it("is a hairline for a branch line with no thickness or taper of its own", () => {
		const ends = styledEnds({ thickness: DEFAULT_BRANCH_THICKNESS }, PX);
		expect(ends.parent).toBe(ends.child);
		expect(ends.parent).toBeLessThan(0.01);
	});

	it("keeps a thickness of its own all along", () => {
		expect(styledEnds({ thickness: 5, taper: "none" }, PX)).toEqual({ parent: 1, child: 1 });
	});

	it("fades to a hair at the child, or grows from one, from the default thickness when none is set", () => {
		const fade = styledEnds({ taper: "fade" }, PX);
		expect(fade.parent).toBeCloseTo(DEFAULT_BRANCH_THICKNESS * PX);
		expect(fade.child).toBeLessThan(fade.parent);
		const grow = styledEnds({ thickness: 5, taper: "grow" }, PX);
		expect(grow.child).toBeCloseTo(1);
		expect(grow.parent).toBeLessThan(grow.child);
	});
});

describe("hierarchyDepths", () => {
	it("counts levels from each root", () => {
		const depths = hierarchyDepths([
			{ source: "core", target: "a" },
			{ source: "a", target: "b" },
			{ source: "b", target: "c" },
			{ source: "core", target: "d" },
			{ source: "other", target: "x" },
		]);
		expect(Object.fromEntries(depths)).toEqual({ core: 0, a: 1, b: 2, c: 3, d: 1, other: 0, x: 1 });
	});

	it("survives a cycle", () => {
		const depths = hierarchyDepths([
			{ source: "a", target: "b" },
			{ source: "b", target: "a" },
		]);
		expect(depths.size).toBe(2);
	});
});

describe("dashOf", () => {
	it("draws solid by default and the 2D map's dashes and dots otherwise", () => {
		expect(dashOf(undefined, PX).period).toBe(0);
		expect(dashOf("solid", PX).period).toBe(0);
		expect(dashOf("dashed", PX)).toEqual({ on: 8 * PX, period: 12 * PX });
		expect(dashOf("dotted", PX).on).toBeLessThan(dashOf("dotted", PX).period);
	});
});

describe("ribbonCorners", () => {
	it("spreads each end across the view, perpendicular to the edge and to the eye", () => {
		const a = { x: 0, y: 0, z: 0 };
		const b = { x: 10, y: 0, z: 0 };
		const eye = { x: 5, y: 0, z: 50 };
		const [al, ar, bl, br] = ribbonCorners(a, b, 2, 1, eye);
		// Looking down -z at an edge along x, the sides spread along y.
		expect(Math.abs(al.y - ar.y)).toBeCloseTo(2);
		expect(Math.abs(bl.y - br.y)).toBeCloseTo(1);
		for (const p of [al, ar, bl, br]) expect(p.z).toBeCloseTo(0);
		expect(al.x).toBeCloseTo(0);
		expect(bl.x).toBeCloseTo(10);
	});

	it("turns with the eye", () => {
		const a = { x: 0, y: 0, z: 0 };
		const b = { x: 10, y: 0, z: 0 };
		const [al, ar] = ribbonCorners(a, b, 2, 2, { x: 5, y: 50, z: 0 });
		// Looking down -y, the sides spread along z.
		expect(Math.abs(al.z - ar.z)).toBeCloseTo(2);
		expect(al.y).toBeCloseTo(0);
	});
});
