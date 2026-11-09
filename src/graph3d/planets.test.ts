import { describe, it, expect } from "vitest";
import type { Vec3 } from "./flight";
import {
	CAP_ANGLE,
	CAP_FALLBACK,
	MAX_CONTINENT_ANGLE,
	PLANET_GAP,
	PlanetWorld,
	RELAYOUT_MS,
	type PlanetBody,
	MIN_PLANET_RADIUS,
	continentMap,
	hoverPose,
	laneArc,
	layoutPlanet,
	placeContinents,
	planetRadius,
	planetTrees,
	surfaceArc,
	surfaceStep,
	tangentFrame,
	wrapPoint,
	type PlanetBranch,
} from "./planets";

const len = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const angle = (a: Vec3, b: Vec3): number => Math.acos(Math.min(1, Math.max(-1, dot(a, b) / (len(a) * len(b)))));
const plate = (): { width: number; height: number } => ({ width: 20, height: 5 });

describe("planetTrees", () => {
	it("hangs lines from their parents, continents are the root's children, tags float free", () => {
		const nodes = [
			{ id: "note:a.md", kind: "note" as const },
			{ id: "h2", kind: "line" as const },
			{ id: "item", kind: "line" as const },
			{ id: "loose", kind: "line" as const },
			{ id: "tag:x", kind: "tag" as const },
		];
		const edges = [
			{ kind: "hierarchy" as const, source: "note:a.md", target: "h2" },
			{ kind: "hierarchy" as const, source: "h2", target: "item" },
			{ kind: "hierarchy" as const, source: "note:a.md", target: "loose" },
			{ kind: "tag" as const, source: "note:a.md", target: "tag:x" },
		];
		const [tree, ...rest] = planetTrees(nodes, edges);
		expect(rest).toEqual([]);
		expect(tree!.core).toBe("note:a.md");
		expect(tree!.continents.map((c) => c.id)).toEqual(["h2", "loose"]);
		expect(tree!.continents[0]!.children.map((c) => c.id)).toEqual(["item"]);
	});

	it("puts an embedded note on its host's surface, and a linked note on its own planet", () => {
		const nodes = [
			{ id: "note:host.md", kind: "note" as const },
			{ id: "line", kind: "line" as const },
			{ id: "note:part.md", kind: "note" as const },
			{ id: "inner", kind: "line" as const },
			{ id: "note:other.md", kind: "note" as const },
		];
		const edges = [
			{ kind: "hierarchy" as const, source: "note:host.md", target: "line" },
			{ kind: "embed" as const, source: "line", target: "note:part.md" },
			{ kind: "hierarchy" as const, source: "note:part.md", target: "inner" },
			{ kind: "link" as const, source: "line", target: "note:other.md" },
		];
		const trees = planetTrees(nodes, edges);
		expect(trees.map((t) => t.core)).toEqual(["note:host.md", "note:other.md"]);
		expect(trees[0]!.continents[0]!.children[0]!.id).toBe("note:part.md");
		expect(trees[0]!.continents[0]!.children[0]!.children[0]!.id).toBe("inner");
	});

	it("survives embeds that loop", () => {
		const nodes = [
			{ id: "note:a.md", kind: "note" as const },
			{ id: "a1", kind: "line" as const },
			{ id: "note:b.md", kind: "note" as const },
			{ id: "b1", kind: "line" as const },
		];
		const edges = [
			{ kind: "hierarchy" as const, source: "note:a.md", target: "a1" },
			{ kind: "embed" as const, source: "a1", target: "note:b.md" },
			{ kind: "hierarchy" as const, source: "note:b.md", target: "b1" },
			{ kind: "embed" as const, source: "b1", target: "note:a.md" },
		];
		// Both roots are embedded: neither is a planet, and nothing loops forever.
		expect(planetTrees(nodes, edges)).toEqual([]);
	});
});

describe("continentMap", () => {
	const head: PlanetBranch = { id: "h", children: [{ id: "a", children: [] }, { id: "b", children: [{ id: "c", children: [] }] }] };

	it("lays left-right maps out with children to the right, in document order down", () => {
		const map = continentMap(head, plate);
		const at = new Map(map.plates.map((p) => [p.id, p]));
		expect(at.get("h")).toMatchObject({ x: 0, y: 0 });
		expect(at.get("a")!.x).toBeGreaterThan(10);
		expect(at.get("a")!.y).toBeLessThan(at.get("b")!.y);
		expect(at.get("c")!.x).toBeGreaterThan(at.get("b")!.x);
		expect(map.reach).toBeGreaterThan(at.get("c")!.x);
		expect(map.area).toBeGreaterThan(0);
	});

	it("lays top-down maps out with children below", () => {
		const map = continentMap(head, plate, { direction: "top-down" });
		const at = new Map(map.plates.map((p) => [p.id, p]));
		expect(at.get("a")!.y).toBeGreaterThan(0);
		expect(at.get("a")!.x).toBeLessThan(at.get("b")!.x);
	});
});

describe("planetRadius", () => {
	it("fits the area, never below the minimum, and grows with the note", () => {
		expect(planetRadius([])).toBe(MIN_PLANET_RADIUS);
		const small = planetRadius([{ area: 4000, reach: 10 }]);
		const big = planetRadius([{ area: 4000, reach: 10 }, { area: 4000, reach: 10 }]);
		expect(big).toBeGreaterThan(small);
		expect(big / small).toBeCloseTo(Math.SQRT2, 5);
		expect(planetRadius([], 100)).toBeGreaterThan(50);
		// A long continent doesn't wrap round onto itself.
		expect(planetRadius([{ area: 100, reach: 300 }])).toBeGreaterThanOrEqual(300 / MAX_CONTINENT_ANGLE);
	});
});

describe("tangentFrame", () => {
	it("is orthonormal, with up as world +y projected and right × up the normal", () => {
		const frame = tangentFrame({ x: 1, y: 0.5, z: 0.3 });
		expect(len(frame.up)).toBeCloseTo(1, 9);
		expect(len(frame.right)).toBeCloseTo(1, 9);
		expect(dot(frame.up, frame.normal)).toBeCloseTo(0, 9);
		expect(dot(frame.right, frame.normal)).toBeCloseTo(0, 9);
		expect(frame.up.y).toBeGreaterThan(0);
		const r = frame.right;
		const u = frame.up;
		const n = { x: r.y * u.z - r.z * u.y, y: r.z * u.x - r.x * u.z, z: r.x * u.y - r.y * u.x };
		expect(dot(n, frame.normal)).toBeCloseTo(1, 9);
	});

	it("faces +z with up +y and right +x on the equator", () => {
		const frame = tangentFrame({ x: 0, y: 0, z: 1 });
		expect(frame.up.y).toBeCloseTo(1, 9);
		expect(frame.right.x).toBeCloseTo(1, 9);
	});

	it("falls back to world −z in a cap", () => {
		const frame = tangentFrame({ x: Math.sin(CAP_FALLBACK / 2), y: Math.cos(CAP_FALLBACK / 2), z: 0 });
		expect(frame.up.z).toBeLessThan(-0.99);
		expect(dot(frame.up, frame.normal)).toBeCloseTo(0, 9);
	});
});

describe("wrapPoint", () => {
	it("keeps map distance from the continent centre as surface distance, on the sphere", () => {
		const centre = { x: 0, y: 0, z: 1 };
		const p = wrapPoint(centre, 30, 0, 50);
		expect(len(p)).toBeCloseTo(50, 9);
		expect(angle(p, centre) * 50).toBeCloseTo(30, 6);
		// Map right is the frame's right (+x here), map down is down.
		expect(p.x).toBeGreaterThan(0);
		expect(wrapPoint(centre, 0, 10, 50).y).toBeLessThan(0);
	});
});

describe("surface forces", () => {
	it("push overlapping continents apart until they clear", () => {
		const dirs = placeContinents([0.5, 0.5, 0.5, 0.5], 0, [{ x: 1, y: 0, z: 0 }, { x: 1, y: 0.01, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }]);
		for (let i = 0; i < dirs.length; i++) for (let j = i + 1; j < dirs.length; j++) expect(angle(dirs[i]!, dirs[j]!)).toBeGreaterThan(0.95);
	});

	it("nudge a continent out of a polar cap, gently", () => {
		const dirs = [{ x: 0.05, y: 1, z: 0 }];
		const polar = (): number => angle(dirs[0]!, { x: 0, y: 1, z: 0 });
		const before = polar();
		surfaceStep(dirs, [0.1]);
		expect(polar()).toBeGreaterThan(before);
		expect(polar()).toBeLessThan(CAP_ANGLE);
		for (let i = 0; i < 200; i++) surfaceStep(dirs, [0.1]);
		expect(polar()).toBeGreaterThan(CAP_ANGLE * 0.95);
	});

	it("seed along a spiral, the first facing the phase", () => {
		const dirs = placeContinents([0.1, 0.1], Math.PI / 2);
		expect(dirs[0]!.z).toBeGreaterThan(0.3);
		for (const d of dirs) expect(len(d)).toBeCloseTo(1, 9);
	});
});

describe("layoutPlanet", () => {
	it("puts every line on the surface, tangent, and keeps a seeded continent where it was", () => {
		const tree = { core: "root", continents: [{ id: "a", children: [{ id: "a1", children: [] }] }, { id: "b", children: [] }] };
		const layout = layoutPlanet(tree, plate);
		expect([...layout.places.keys()].sort()).toEqual(["a", "a1", "b"]);
		for (const place of layout.places.values()) {
			expect(len(place.offset)).toBeCloseTo(layout.radius, 6);
			expect(dot(place.up, place.normal)).toBeCloseTo(0, 9);
		}
		const seeded = layoutPlanet(tree, plate, undefined, 0, layout.centres);
		expect(seeded.places.get("a")!.offset.x).toBeCloseTo(layout.places.get("a")!.offset.x, 3);
	});

	it("grows when a line is added", () => {
		const size = (id: string): { width: number; height: number } => (id === "r" ? plate() : { width: 60, height: 5 });
		const one = layoutPlanet({ core: "r", continents: [{ id: "a", children: [] }] }, size);
		const many = layoutPlanet({ core: "r", continents: ["a", "b", "c", "d", "e", "f"].map((id) => ({ id, children: [] })) }, size);
		expect(many.radius).toBeGreaterThan(one.radius);
	});

	it("lays a 300-line note out quickly", () => {
		const continents = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, children: Array.from({ length: 14 }, (_, j) => ({ id: `c${i}-${j}`, children: [] })) }));
		layoutPlanet({ core: "r", continents }, plate);
		const start = performance.now();
		layoutPlanet({ core: "r", continents }, plate);
		const ms = performance.now() - start;
		// Measured 2026-11-09: about 11 ms warm (1,020 lines in 60 continents: about 36 ms). Run once per planet change, never per tick.
		expect(ms).toBeLessThan(500);
	});
});

describe("arcs and hover", () => {
	it("runs a surface arc over the sphere between its ends", () => {
		const points = surfaceArc({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 0, y: 0, z: 10 }, 8);
		expect(points).toHaveLength(9);
		for (const p of points) expect(len(p)).toBeCloseTo(10, 9);
		expect(points[8]!.z).toBeCloseTo(10, 9);
	});

	it("bows a lane away from both planets", () => {
		const points = laneArc({ x: 0, y: 5, z: 0 }, { x: 10, y: 5, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 4);
		expect(points[0]).toEqual({ x: 0, y: 5, z: 0 });
		expect(points[2]!.y).toBeGreaterThan(5);
	});

	it("hovers on the outward normal, up at the top", () => {
		const frame = tangentFrame({ x: 0, y: 0, z: 1 });
		const pose = hoverPose({ x: 0, y: 0, z: 20 }, frame, 30);
		expect(pose.position.z).toBeCloseTo(50, 9);
		expect(pose.up.y).toBeCloseTo(1, 9);
	});
});

describe("PlanetWorld", () => {
	const tree = (core: string, lines: string[]) => ({ core, continents: lines.map((id) => ({ id, children: [] })) });
	const style = { direction: "left-right" as const };

	it("keeps a planet's layout until its tree changes, and puts plates on their core", () => {
		const world = new PlanetWorld();
		world.update([tree("a", ["a1", "a2"])], plate, style, () => 0, 0, false);
		const place = world.place("a1")!;
		world.update([tree("a", ["a1", "a2"])], plate, style, () => 0, 0, false);
		expect(world.place("a1")).toBe(place);
		const bodies = new Map<string, PlanetBody>([["a", { x: 100, y: 0, z: 0 }], ["a1", {}], ["a2", {}]]);
		world.placeAll((id) => bodies.get(id), 0, true);
		expect(bodies.get("a1")!.x).toBeCloseTo(100 + place.offset.x, 9);
		expect(bodies.get("a1")!.fx).toBe(bodies.get("a1")!.x);
		expect(world.planetOf("a1")).toBe("a");
		expect(world.planetOf("a")).toBe("a");
	});

	it("eases plates to a new layout and reports a planet that grew", () => {
		const world = new PlanetWorld();
		const wide = (id: string): { width: number; height: number } => (id === "a" ? plate() : { width: 60, height: 5 });
		world.update([tree("a", ["a1"])], wide, style, () => 0, 0, false);
		const grew = world.update([tree("a", ["a1", "a2", "a3", "a4", "a5", "a6"])], wide, style, () => 0, 1000, true);
		expect(grew).toEqual(["a"]);
		const bodies = new Map<string, PlanetBody>([["a", { x: 0, y: 0, z: 0 }], ["a1", {}]]);
		world.placeAll((id) => bodies.get(id), 1000);
		const start = { ...bodies.get("a1")! };
		world.placeAll((id) => bodies.get(id), 1000 + RELAYOUT_MS);
		const end = world.place("a1")!.offset;
		expect(bodies.get("a1")!.x).toBeCloseTo(end.x, 9);
		expect(Math.hypot(start.x! - end.x, start.y! - end.y, start.z! - end.z)).toBeGreaterThan(0);
		// Done easing: no more per-frame placing.
		expect(world.placeAll((id) => bodies.get(id), 5000)).toBe(false);
	});

	it("hands surface pull to the core and pushes overlapping planets apart", () => {
		const world = new PlanetWorld();
		world.update([tree("a", ["a1"]), tree("b", ["b1"])], plate, style, () => 0, 0, false);
		const bodies = new Map<string, PlanetBody>([
			["a", { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }],
			["a1", { vx: 0, vy: 3, vz: 0 }],
			["b", { x: 5, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }],
			["b1", {}],
		]);
		const bodyOf = (id: string): PlanetBody | undefined => bodies.get(id);
		expect(world.collisions(["a"], bodyOf).sort()).toEqual(["a", "b"]);
		world.step(bodyOf, [], 1, 0);
		expect(bodies.get("a")!.vy).toBe(3);
		expect(bodies.get("a")!.vx).toBeLessThan(0);
		expect(bodies.get("b")!.vx).toBeGreaterThan(0);
		expect(bodies.get("a1")!.vy).toBe(0);
		bodies.get("b")!.x = 1000;
		expect(world.collisions(["a"], bodyOf)).toEqual([]);
		expect(PLANET_GAP).toBeGreaterThan(0);
	});
});
