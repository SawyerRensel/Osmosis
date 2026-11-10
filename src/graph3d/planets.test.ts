import { describe, it, expect } from "vitest";
import type { Vec3 } from "./flight";
import {
	CAP_ANGLE,
	CAP_FALLBACK,
	DEFAULT_CONTINENT_STYLE,
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
	type ContinentStyle,
	type PlanetBranch,
	noteMapSettings,
	resolveContinentStyle,
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
		const map = continentMap(head, plate, { direction: "top-down", balance: "one-side" });
		const at = new Map(map.plates.map((p) => [p.id, p]));
		expect(at.get("a")!.y).toBeGreaterThan(0);
		expect(at.get("a")!.x).toBeLessThan(at.get("b")!.x);
	});
});

describe("continentMap balance", () => {
	const kids = ["a", "b", "c", "d"];
	const head: PlanetBranch = { id: "h", children: kids.map((id) => ({ id, children: [] })) };
	const xs = (style: ContinentStyle): Map<string, number> => new Map(continentMap(head, plate, style).plates.map((p) => [p.id, p.x]));

	it("one-side keeps every child on one side, the left when the note's side says so", () => {
		const right = xs({ direction: "left-right", balance: "one-side" });
		expect(kids.every((id) => right.get(id)! > 0)).toBe(true);
		const left = xs({ direction: "left-right", balance: "one-side", side: "left" });
		expect(kids.every((id) => left.get(id)! < 0)).toBe(true);
	});

	it("both-sides puts the first half on one side and the rest on the other", () => {
		const both = xs({ direction: "left-right", balance: "both-sides" });
		expect([both.get("a")! > 0, both.get("b")! > 0, both.get("c")! < 0, both.get("d")! < 0]).toEqual([true, true, true, true]);
	});

	it("both-sides balances by the plates' laid-out extent, not the child count", () => {
		// "a" carries four children, so it takes up as much height as "b", "c" and "d" together
		const tall: PlanetBranch = {
			id: "h",
			children: [
				{ id: "a", children: ["a1", "a2", "a3", "a4"].map((id) => ({ id, children: [] })) },
				...["b", "c", "d"].map((id) => ({ id, children: [] })),
			],
		};
		const map = new Map(continentMap(tall, plate, { direction: "left-right", balance: "both-sides" }).plates.map((p) => [p.id, p.x]));
		expect(map.get("a")! > 0).toBe(true);
		expect(["b", "c", "d"].every((id) => map.get(id)! < 0)).toBe(true);
	});

	it("alternating deals the children out, right then left", () => {
		const alt = xs({ direction: "left-right", balance: "alternating" });
		expect([alt.get("a")! > 0, alt.get("b")! < 0, alt.get("c")! > 0, alt.get("d")! < 0]).toEqual([true, true, true, true]);
	});

	it("balances a top-down map above and below", () => {
		const ys = new Map(continentMap(head, plate, { direction: "top-down", balance: "alternating" }).plates.map((p) => [p.id, p.y]));
		expect([ys.get("a")! > 0, ys.get("b")! < 0]).toEqual([true, true]);
	});

	it("leaves a radial map the same whatever the balance", () => {
		const one = continentMap(head, plate, { direction: "radial", balance: "one-side" }).plates;
		const alt = continentMap(head, plate, { direction: "radial", balance: "alternating" }).plates;
		expect(alt).toEqual(one);
	});
});

describe("resolveContinentStyle", () => {
	const defaults: ContinentStyle = { direction: "top-down", balance: "alternating" };

	it("takes the defaults for a note with no map settings of its own", () => {
		expect(resolveContinentStyle(defaults)).toBe(defaults);
		expect(resolveContinentStyle(defaults, {})).toEqual(defaults);
	});

	it("lets the note's own settings win, field by field", () => {
		expect(resolveContinentStyle(defaults, { direction: "left-right" })).toEqual({ direction: "left-right", balance: "alternating" });
		expect(resolveContinentStyle(defaults, { balance: "one-side" })).toEqual({ direction: "top-down", balance: "one-side" });
		expect(resolveContinentStyle(defaults, { direction: "left-right", balance: "both-sides" })).toEqual({ direction: "left-right", balance: "both-sides" });
	});

	it("reads the 2D map's mapLayout: radial over direction, classic back to a tree", () => {
		expect(resolveContinentStyle(defaults, { mapLayout: "radial", direction: "left-right" }).direction).toBe("radial");
		const radial: ContinentStyle = { direction: "radial", balance: "one-side" };
		expect(resolveContinentStyle(radial, { mapLayout: "classic" }).direction).toBe("left-right");
		expect(resolveContinentStyle(radial, { mapLayout: "classic", direction: "top-down" }).direction).toBe("top-down");
		expect(resolveContinentStyle(radial, { balance: "both-sides" }).direction).toBe("radial");
	});

	it("keeps the note's side only when it suits the direction", () => {
		expect(resolveContinentStyle(defaults, { direction: "left-right", layoutSide: "left" }).side).toBe("left");
		expect(resolveContinentStyle(defaults, { layoutSide: "up" }).side).toBe("up");
		expect(resolveContinentStyle(defaults, { layoutSide: "left" }).side).toBeUndefined();
		expect(resolveContinentStyle(defaults, { direction: "left-right", layoutSide: "up" }).side).toBeUndefined();
	});
});

describe("noteMapSettings", () => {
	it("reads direction, map layout, balance and side from the osmosis-styles block, and nothing else", () => {
		const fm = { "osmosis-styles": { direction: "top-down", mapLayout: "classic", balance: "both-sides", layoutSide: "up", theme: "Dark", horizontalSpacing: 200 } };
		expect(noteMapSettings(fm)).toEqual({ direction: "top-down", mapLayout: "classic", balance: "both-sides", layoutSide: "up" });
	});

	it("gives nothing for a note with no map settings of its own", () => {
		expect(noteMapSettings(undefined)).toBeUndefined();
		expect(noteMapSettings({ tags: ["a"] })).toBeUndefined();
		expect(noteMapSettings({ "osmosis-styles": { theme: "Dark" } })).toBeUndefined();
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

describe("PlanetWorld styles", () => {
	const tree = { core: "a", continents: [{ id: "x", children: [{ id: "x1", children: [] }, { id: "x2", children: [] }] }] };

	it("re-lays out a planet whose own style changed and leaves the others", () => {
		const world = new PlanetWorld();
		const styles = new Map<string, ContinentStyle>();
		const styleOf = (core: string): ContinentStyle => styles.get(core) ?? DEFAULT_CONTINENT_STYLE;
		const other = { core: "b", continents: tree.continents.map((c) => ({ ...c, id: `b${c.id}`, children: c.children.map((k) => ({ ...k, id: `b${k.id}` })) })) };
		world.update([tree, other], plate, styleOf, () => 0, 0, false);
		const [a, b] = [world.place("x1")!, world.place("bx1")!];
		world.update([tree, other], plate, styleOf, () => 0, 0, false);
		expect(world.place("x1")).toBe(a);
		styles.set("a", { direction: "radial", balance: "one-side" });
		world.update([tree, other], plate, styleOf, () => 0, 0, false);
		expect(world.place("x1")).not.toBe(a);
		expect(world.place("bx1")).toBe(b);
	});
});

describe("PlanetWorld", () => {
	const tree = (core: string, lines: string[]) => ({ core, continents: lines.map((id) => ({ id, children: [] })) });
	const style = (): ContinentStyle => DEFAULT_CONTINENT_STYLE;

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

describe("spacing sliders in Planets", () => {
	const head: PlanetBranch = { id: "h", children: [{ id: "a", children: [] }, { id: "b", children: [{ id: "c", children: [] }] }] };
	const wide = (id: string): { width: number; height: number } => (id === "r" ? plate() : { width: 60, height: 5 });
	const many = { core: "r", continents: Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, children: [{ id: `c${i}-x`, children: [{ id: `c${i}-y`, children: [] }] }] })) };

	it("is exactly today's map at Node spacing x1", () => {
		expect(continentMap(head, plate, DEFAULT_CONTINENT_STYLE, 1)).toEqual(continentMap(head, plate));
		const at = new Map(continentMap(head, plate).plates.map((p) => [p.id, p]));
		// Parent half-width, the hierarchy edge's 18, the child's half-width.
		expect(at.get("a")!.x).toBe(10 + 18 + 10);
		expect(at.get("b")!.y - at.get("a")!.y).toBeCloseTo(5 + 1.5, 9);
	});

	it("widens the gaps between plates with Node spacing, never the plates", () => {
		for (const style of [DEFAULT_CONTINENT_STYLE, { direction: "top-down" as const, balance: "one-side" as const }, { direction: "radial" as const, balance: "one-side" as const }]) {
			let last = 0;
			for (const spacing of [0.5, 1, 2, 3]) {
				const map = continentMap(head, plate, style, spacing);
				expect(map.plates.every((p) => p.width === 20 && p.height === 5)).toBe(true);
				expect(map.reach).toBeGreaterThan(last);
				last = map.reach;
			}
		}
		const at = new Map(continentMap(head, plate, DEFAULT_CONTINENT_STYLE, 2).plates.map((p) => [p.id, p]));
		expect(at.get("a")!.x).toBe(10 + 36 + 10);
	});

	it("grows the planet with Node spacing, and x1 is today's radius", () => {
		expect(layoutPlanet(many, wide, DEFAULT_CONTINENT_STYLE, 0, undefined, 1).radius).toBe(layoutPlanet(many, wide).radius);
		let last = 0;
		for (const spacing of [0.5, 1, 2, 3]) {
			const { radius } = layoutPlanet(many, wide, DEFAULT_CONTINENT_STYLE, 0, undefined, spacing);
			expect(radius).toBeGreaterThan(last);
			last = radius;
		}
	});

	it("keeps the gap between planet surfaces at PLANET_GAP x1, and scales it with Note spacing", () => {
		const trees = [{ core: "a", continents: [{ id: "a1", children: [] }] }, { core: "b", continents: [{ id: "b1", children: [] }] }];
		const style = (): ContinentStyle => DEFAULT_CONTINENT_STYLE;
		const radius = layoutPlanet(trees[0]!, plate).radius;
		const gapAt = (note: number): number => {
			const world = new PlanetWorld();
			world.spacing = { note, node: 1 };
			world.update(trees, plate, style, () => 0, 0, false);
			// Planets side by side, just closer than the gap: a plate-sized sliver.
			const bodies = new Map<string, PlanetBody>([["a", { x: 0, y: 0, z: 0 }], ["a1", {}], ["b", { x: 0, y: 0, z: 0 }], ["b1", {}]]);
			let low = 0;
			let high = 1000;
			for (let i = 0; i < 40; i++) {
				const mid = (low + high) / 2;
				bodies.get("b")!.x = mid;
				if (world.collisions(["a"], (id) => bodies.get(id)).length > 0) low = mid;
				else high = mid;
			}
			return high - 2 * radius;
		};
		expect(gapAt(1)).toBeCloseTo(PLANET_GAP, 6);
		expect(gapAt(2)).toBeCloseTo(PLANET_GAP * 2, 6);
		expect(gapAt(0.5)).toBeCloseTo(PLANET_GAP / 2, 6);
		expect(gapAt(3)).toBeGreaterThan(gapAt(2));
	});

	it("pushes planets apart to the scaled gap, and stars out to half of it", () => {
		const trees = [{ core: "a", continents: [{ id: "a1", children: [] }] }];
		const run = (note: number): number => {
			const world = new PlanetWorld();
			world.spacing = { note, node: 1 };
			world.update(trees, plate, () => DEFAULT_CONTINENT_STYLE, () => 0, 0, false);
			const star: PlanetBody = { x: world.radius("a")! + 1, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
			const bodies = new Map<string, PlanetBody>([["a", { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, fx: 0 }], ["a1", {}]]);
			world.step((id) => bodies.get(id), [star], 1, 0);
			return star.vx!;
		};
		expect(run(2)).toBeGreaterThan(run(1));
		expect(run(1)).toBeGreaterThan(run(0.5));
	});

	it("re-lays a planet out when Node spacing changes, and keeps it otherwise", () => {
		const world = new PlanetWorld();
		const tree = { core: "a", continents: [{ id: "a1", children: [{ id: "a2", children: [] }] }] };
		world.update([tree], wide, () => DEFAULT_CONTINENT_STYLE, () => 0, 0, false);
		const place = world.place("a2")!;
		world.update([tree], wide, () => DEFAULT_CONTINENT_STYLE, () => 0, 0, false);
		expect(world.place("a2")).toBe(place);
		world.spacing = { note: 1, node: 2 };
		world.update([tree], wide, () => DEFAULT_CONTINENT_STYLE, () => 0, 0, false);
		expect(world.place("a2")).not.toBe(place);
	});
});
