import { describe, it, expect } from "vitest";
import type { MapPlate, PlanetBranch } from "./planets";
import { continentMap } from "./planets";
import { MAX_FAN, radialMap } from "./radial";

const leaf = (id: string): PlanetBranch => ({ id, children: [] });
const branch = (id: string, ...children: PlanetBranch[]): PlanetBranch => ({ id, children });
const sizeOf = (id: string): { width: number; height: number } => ({ width: id.length > 3 ? 30 : 16, height: 5 });
const GAP = 12;
const ROW = 1.5;
const at = (plates: MapPlate[]): Map<string, MapPlate> => new Map(plates.map((p) => [p.id, p]));
const dist = (p: MapPlate): number => Math.hypot(p.x, p.y);

/** Whether two rigid plates overlap, to within a hair. */
const overlap = (a: MapPlate, b: MapPlate): boolean => Math.abs(a.x - b.x) < (a.width + b.width) / 2 - 1e-6 && Math.abs(a.y - b.y) < (a.height + b.height) / 2 - 1e-6;

function overlaps(plates: MapPlate[]): string[] {
	const found: string[] = [];
	for (let i = 0; i < plates.length; i++) for (let j = i + 1; j < plates.length; j++) if (overlap(plates[i]!, plates[j]!)) found.push(`${plates[i]!.id}/${plates[j]!.id}`);
	return found;
}

describe("radialMap", () => {
	it("puts the head at the centre and a lone line to its right", () => {
		const plates = at(radialMap(branch("h", leaf("a")), sizeOf, GAP, ROW));
		expect(plates.get("h")).toMatchObject({ x: 0, y: 0 });
		expect(plates.get("a")!.x).toBeGreaterThan(8);
		expect(plates.get("a")!.y).toBeCloseTo(0, 6);
	});

	it("keeps the plates' sizes, rigid", () => {
		const plates = at(radialMap(branch("head", leaf("a"), leaf("long-b")), sizeOf, GAP, ROW));
		expect(plates.get("head")).toMatchObject({ width: 30, height: 5 });
		expect(plates.get("a")).toMatchObject({ width: 16, height: 5 });
	});

	it("spreads children round the head on one ring, in clockwise document order", () => {
		const kids = ["a", "b", "c", "d"];
		const plates = at(radialMap(branch("h", ...kids.map(leaf)), sizeOf, GAP, ROW));
		const radii = kids.map((id) => dist(plates.get(id)!));
		for (const r of radii) expect(r).toBeCloseTo(radii[0]!, 6);
		const angles = kids.map((id) => Math.atan2(plates.get(id)!.y, plates.get(id)!.x));
		// Four equal wedges: the quarter-turn mid-angles run clockwise from the upper left.
		expect(angles[0]).toBeCloseTo(-Math.PI * 0.75, 6);
		expect(angles[1]).toBeCloseTo(-Math.PI * 0.25, 6);
		expect(angles[2]).toBeCloseTo(Math.PI * 0.25, 6);
		expect(angles[3]).toBeCloseTo(Math.PI * 0.75, 6);
	});

	it("puts deeper lines on wider rings, inside their parent's side", () => {
		const tree = branch("h", branch("a", leaf("a1"), leaf("a2")), branch("b", leaf("b1")));
		const plates = at(radialMap(tree, sizeOf, GAP, ROW));
		expect(dist(plates.get("a1")!)).toBeGreaterThan(dist(plates.get("a")!));
		expect(dist(plates.get("b1")!)).toBeGreaterThan(dist(plates.get("b")!));
		// a is the upper half (angle -π/2), so its children are above the centre too.
		expect(plates.get("a")!.y).toBeLessThan(0);
		expect(plates.get("a1")!.y).toBeLessThan(0);
		expect(plates.get("b1")!.y).toBeGreaterThan(0);
	});

	it("does not fan a lone child's children behind it", () => {
		const kids = ["k1", "k2", "k3", "k4", "k5", "k6"].map(leaf);
		const plates = at(radialMap(branch("h", branch("only", ...kids)), sizeOf, GAP, ROW));
		const [only, ...rest] = [plates.get("only")!, ...kids.map((k) => plates.get(k.id)!)];
		for (const k of rest) {
			const spread = Math.abs(Math.atan2(k.y, k.x) - Math.atan2(only.y, only.x));
			expect(spread).toBeLessThanOrEqual(MAX_FAN / 2 + 1e-9);
		}
	});

	it("leaves no plates overlapping, for a lopsided tree of wide and narrow lines", () => {
		const many = Array.from({ length: 24 }, (_, i) => leaf(i % 3 === 0 ? `wide-${i}` : `n${i}`));
		const tree = branch("headline", branch("big", ...many), leaf("solo"), branch("mid", branch("mid-1", leaf("x1"), leaf("x2"), leaf("x3")), leaf("y")), leaf("last-one"));
		expect(overlaps(radialMap(tree, sizeOf, GAP, ROW))).toEqual([]);
	});

	it("returns every line once, and is deterministic", () => {
		const tree = branch("h", branch("a", leaf("a1")), leaf("b"));
		const first = radialMap(tree, sizeOf, GAP, ROW);
		expect(first.map((p) => p.id).sort()).toEqual(["a", "a1", "b", "h"]);
		expect(radialMap(tree, sizeOf, GAP, ROW)).toEqual(first);
	});

	it("is what a continent's map uses for the radial direction", () => {
		const tree = branch("h", leaf("a"), leaf("b"), leaf("c"));
		const map = continentMap(tree, sizeOf, { direction: "radial", balance: "one-side" });
		expect(at(map.plates).get("h")).toMatchObject({ x: 0, y: 0 });
		// Three children round the head: not the left-right map's single column.
		expect(new Set(map.plates.map((p) => Math.sign(Math.round(p.y)))).size).toBeGreaterThan(1);
		expect(map.reach).toBeGreaterThan(dist(at(map.plates).get("a")!));
	});
});
