import { describe, expect, it } from "vitest";
import type { ThemeDefinition } from "../styles";
import { CORNER_SEGMENTS, CURVE_SEGMENTS, branchPath, needsRibbon, noteBranchLayers, onSphere, resolveBranch } from "./branch-look";
import type { Vec3 } from "./flight";

const UP: Vec3 = { x: 0, y: 1, z: 0 };
const PX = 0.25;
const from: Vec3 = { x: 0, y: 0, z: 0 };
const to: Vec3 = { x: 40, y: -20, z: 0 };

const harbour: ThemeDefinition = {
	name: "Harbour",
	base: {},
	depths: {},
	branchLine: { color: "#336699", thickness: 1.5, style: "angular", pattern: "dotted", taper: "grow" },
};
const themes = (name: string): ThemeDefinition | undefined => (name === "Harbour" ? harbour : undefined);

function close(a: Vec3, b: Vec3): void {
	expect(a.x).toBeCloseTo(b.x, 6);
	expect(a.y).toBeCloseTo(b.y, 6);
	expect(a.z).toBeCloseTo(b.z, 6);
}

describe("noteBranchLayers", () => {
	it("is null for a note with no branch keys and no theme", () => {
		expect(noteBranchLayers(null)).toBeNull();
		expect(noteBranchLayers({ "osmosis-styles": { direction: "left-right" } }, themes)).toBeNull();
	});

	it("reads the map's branchLine keys, and the theme's only when a lookup is passed", () => {
		const fm = { "osmosis-styles": { theme: "Harbour", branchLineStyle: "curved", branchLineThickness: 3 } };
		expect(noteBranchLayers(fm)).toEqual({ map: { style: "curved", thickness: 3 } });
		expect(noteBranchLayers(fm, themes)).toEqual({ theme: harbour.branchLine, map: { style: "curved", thickness: 3 } });
	});

	it("drops values the mind map can't draw", () => {
		expect(noteBranchLayers({ "osmosis-styles": { branchLineStyle: "wavy", branchLineThickness: -1, branchLinePattern: "dashed" } })).toEqual({ map: { pattern: "dashed" } });
	});
});

describe("resolveBranch", () => {
	const layers = { theme: harbour.branchLine, map: { style: "curved", color: "#aa0000", thickness: 4, pattern: "dashed", taper: "fade" } } as const;

	it("takes style, pattern and taper from the theme over the map, as the mind map does", () => {
		const branch = resolveBranch(undefined, layers);
		expect(branch?.style).toBe("angular");
		expect(branch?.pattern).toBe("dotted");
		expect(branch?.taper).toBe("grow");
	});

	it("takes colour and thickness from the map over the theme, as the mind map does", () => {
		const branch = resolveBranch(undefined, layers);
		expect(branch?.color).toBe("#aa0000");
		expect(branch?.thickness).toBe(4);
	});

	it("lets the node's own branch line beat both", () => {
		const own = { style: "rounded-elbow", color: "#00aa00", thickness: 6, pattern: "solid", taper: "none" } as const;
		expect(resolveBranch(own, layers)).toEqual(own);
	});

	it("falls through field by field", () => {
		expect(resolveBranch({ color: "#00aa00" }, { map: { style: "straight" } })).toEqual({ style: "straight", color: "#00aa00" });
		expect(resolveBranch({ thickness: Number.NaN }, null)).toBeUndefined();
		expect(resolveBranch(undefined, null)).toBeUndefined();
	});
});

describe("needsRibbon", () => {
	it("is false for nothing, a colour, a straight line or the default thickness", () => {
		expect(needsRibbon(undefined)).toBe(false);
		expect(needsRibbon({ color: "#123456", style: "straight", pattern: "solid", taper: "none", thickness: 1.5 })).toBe(false);
	});

	it("is true for a shape, a pattern, a taper or a thickness of its own", () => {
		expect(needsRibbon({ style: "curved" })).toBe(true);
		expect(needsRibbon({ pattern: "dashed" })).toBe(true);
		expect(needsRibbon({ taper: "fade" })).toBe(true);
		expect(needsRibbon({ thickness: 3 })).toBe(true);
	});
});

describe("branchPath", () => {
	it("is the two ends for straight, and for an edge running along the cross axis", () => {
		expect(branchPath("straight", from, to, UP, PX)).toEqual([from, to]);
		expect(branchPath("curved", from, { x: 0, y: -30, z: 0 }, UP, PX)).toHaveLength(2);
	});

	for (const style of ["curved", "angular", "rounded-elbow"] as const) {
		it(`${style}: starts and ends on the two anchors, and is monotone along and across`, () => {
			const points = branchPath(style, from, to, UP, PX);
			close(points[0]!, from);
			close(points[points.length - 1]!, to);
			for (let i = 1; i < points.length; i++) {
				expect(points[i]!.x).toBeGreaterThanOrEqual(points[i - 1]!.x - 1e-9);
				expect(points[i]!.y).toBeLessThanOrEqual(points[i - 1]!.y + 1e-9);
				expect(points[i]!.z).toBeCloseTo(0, 9);
			}
		});
	}

	it("curved: the mind map's cubic, sampled, leaving and arriving along the growth axis", () => {
		const points = branchPath("curved", from, to, UP, PX);
		expect(points).toHaveLength(CURVE_SEGMENTS + 1);
		// C (midX, py), (midX, cy): flat at both ends, half-way down at the middle.
		expect(points[1]!.y / points[1]!.x).toBeGreaterThan(-0.1);
		close(points[CURVE_SEGMENTS / 2]!, { x: 20, y: -10, z: 0 });
	});

	it("angular: the mind map's corners, half-way along", () => {
		expect(branchPath("angular", from, to, UP, PX)).toEqual([from, { x: 20, y: 0, z: 0 }, { x: 20, y: -20, z: 0 }, to]);
	});

	it("rounded-elbow: the angular corners, rounded by the mind map's 12 px radius", () => {
		const points = branchPath("rounded-elbow", from, to, UP, PX);
		expect(points).toHaveLength(2 * (CORNER_SEGMENTS + 1) + 2);
		const r = 12 * PX;
		close(points[1]!, { x: 20 - r, y: 0, z: 0 });
		close(points[1 + CORNER_SEGMENTS]!, { x: 20, y: -r, z: 0 });
		close(points[2 + CORNER_SEGMENTS]!, { x: 20, y: -20 + r, z: 0 });
		close(points[2 + 2 * CORNER_SEGMENTS]!, { x: 20 + r, y: -20, z: 0 });
	});

	it("rounded-elbow: straight when the ends are level", () => {
		expect(branchPath("rounded-elbow", from, { x: 40, y: 0.1, z: 0 }, UP, PX)).toHaveLength(2);
	});

	it("grows along whichever way the edge leaves, in any plane holding the cross axis", () => {
		const back: Vec3 = { x: 0, y: 10, z: -30 };
		const points = branchPath("angular", from, back, UP, PX);
		expect(points).toEqual([from, { x: 0, y: 0, z: -15 }, { x: 0, y: 10, z: -15 }, back]);
	});
});

describe("onSphere", () => {
	const centre: Vec3 = { x: 0, y: 0, z: 0 };
	const a: Vec3 = { x: 100, y: 0, z: 0 };
	const b: Vec3 = { x: 0, y: 100, z: 0 };

	it("keeps the ends and lays every point on the shell", () => {
		const points = onSphere(branchPath("angular", a, b, { x: 0, y: 0, z: 1 }, PX), centre, 6);
		close(points[0]!, a);
		close(points[points.length - 1]!, b);
		for (const p of points) expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(100, 6);
	});

	it("splits each leg into its share of the segments", () => {
		expect(onSphere([a, b], centre, 6)).toHaveLength(7);
		// A curve already finer than the share keeps its points.
		expect(onSphere(branchPath("curved", a, { x: 80, y: 60, z: 0 }, { x: 0, y: 0, z: 1 }, PX), centre, 6)).toHaveLength(CURVE_SEGMENTS + 1);
	});

	it("eases the radius from one end's to the other's", () => {
		const points = onSphere([a, { x: 0, y: 120, z: 0 }], centre, 2);
		expect(Math.hypot(points[1]!.x, points[1]!.y, points[1]!.z)).toBeCloseTo(110, 6);
	});
});
