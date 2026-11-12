import { describe, it, expect } from "vitest";
import type { Vec3 } from "./flight";
import {
	CAP_FALLBACK,
	COLUMN_GAP,
	CONTINENT_MARGIN,
	DEFAULT_CONTINENT_STYLE,
	MAX_CONTINENT_ANGLE,
	PLANET_GAP,
	PLANET_GAP_SHARE,
	PlanetWorld,
	RELAYOUT_MS,
	ROW_GAP,
	type PlanetBody,
	MIN_PLANET_RADIUS,
	continentMap,
	hoverPose,
	laneArc,
	layoutPlanet,
	placeContinents,
	planetClearance,
	planetGap,
	planetRadius,
	planetTrees,
	surfaceArc,
	spreadContinent,
	surfaceStep,
	tangentFrame,
	wrapPlate,
	wrapPoint,
	type ContinentStyle,
	type Lane,
	type PlanetBranch,
} from "./planets";
import { linkDistance } from "./appearance";
import { DEFAULT_LAYOUT_CONFIG } from "../layout";
import { STYLE_PX_PER_EM } from "./near";
import { LINE_PLATE_HEIGHT, PLATE_HEIGHT_EM } from "./plates";

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

	it("one-side keeps every child on one side", () => {
		const right = xs({ direction: "left-right", balance: "one-side" });
		expect(kids.every((id) => right.get(id)! > 0)).toBe(true);
	});

	it("the three balances lay the same head out three different ways", () => {
		const one = xs({ direction: "left-right", balance: "one-side" });
		const both = xs({ direction: "left-right", balance: "both-sides" });
		const alt = xs({ direction: "left-right", balance: "alternating" });
		const sides = (m: Map<string, number>): string => kids.map((id) => (m.get(id)! > 0 ? "R" : "L")).join("");
		expect([sides(one), sides(both), sides(alt)]).toEqual(["RRRR", "RRLL", "RLRL"]);
		expect(continentMap(head, plate, { direction: "left-right", balance: "one-side" }).plates).not.toEqual(continentMap(head, plate, { direction: "left-right", balance: "both-sides" }).plates);
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

	it("leave a continent at a pole: no latitude is out of bounds", () => {
		for (const pole of [{ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }]) {
			const dirs = [pole];
			for (let i = 0; i < 200; i++) surfaceStep(dirs, [0.1]);
			expect(angle(dirs[0]!, pole)).toBeCloseTo(0, 9);
			expect(placeContinents([0.1], 0, [pole])[0]!.y).toBeCloseTo(pole.y, 9);
		}
	});

	it("seed over the whole sphere, near the poles too", () => {
		const dirs = placeContinents(Array.from({ length: 20 }, () => 0.01));
		// The old polar caps were 0.35 rad: both now hold a continent.
		expect(dirs.some((d) => angle(d, { x: 0, y: 1, z: 0 }) < 0.35)).toBe(true);
		expect(dirs.some((d) => angle(d, { x: 0, y: -1, z: 0 }) < 0.35)).toBe(true);
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
	const tree = (core: string) => ({ core, continents: ["x", "y", "z"].map((id) => ({ id: `${core}${id}`, children: [] })) });
	const [a, b] = [tree("a"), tree("b")];
	const xOf = (world: PlanetWorld, id: string): number => world.place(id)!.offset.x;

	it("re-lays out every planet when the shared balance changes, whatever a note's own 2D map says", () => {
		// A note whose frontmatter says `balance: both-sides` is just a tree here: the style is the Overlays', the same for every planet.
		const world = new PlanetWorld();
		const [one, both] = [{ direction: "left-right", balance: "one-side" }, { direction: "left-right", balance: "both-sides" }] as const;
		world.update([a, b], plate, one, () => 0, 0, false);
		const before = [world.place("ax")!, world.place("bx")!];
		world.update([a, b], plate, one, () => 0, 0, false);
		expect([world.place("ax"), world.place("bx")]).toEqual(before);
		world.update([a, b], plate, both, () => 0, 0, false);
		expect(world.place("ax")).not.toBe(before[0]);
		expect(world.place("bx")).not.toBe(before[1]);
		expect(xOf(world, "ax")).not.toBeCloseTo(xOf(world, "az"), 3);
	});

	it("re-lays out when the shared direction changes", () => {
		const world = new PlanetWorld();
		world.update([a], plate, { direction: "left-right", balance: "one-side" }, () => 0, 0, false);
		const before = world.place("ax")!;
		world.update([a], plate, { direction: "top-down", balance: "one-side" }, () => 0, 0, false);
		expect(world.place("ax")).not.toBe(before);
	});
});

describe("PlanetWorld", () => {
	const tree = (core: string, lines: string[]) => ({ core, continents: lines.map((id) => ({ id, children: [] })) });
	const style: ContinentStyle = DEFAULT_CONTINENT_STYLE;

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
	});

	it("uses the 2D mind map's gaps, at T44's 13 px per em of line-plate text", () => {
		const pxWorld = LINE_PLATE_HEIGHT / PLATE_HEIGHT_EM / STYLE_PX_PER_EM;
		expect(COLUMN_GAP).toBeCloseTo(DEFAULT_LAYOUT_CONFIG.horizontalSpacing * pxWorld, 9);
		expect(ROW_GAP).toBeCloseTo(DEFAULT_LAYOUT_CONFIG.verticalSpacing * pxWorld, 9);
		// 80 px and 8 px of a 2D map.
		expect(COLUMN_GAP).toBeCloseTo(17.58, 2);
		expect(ROW_GAP).toBeCloseTo(1.758, 3);
	});

	it("lays plates out at their real sizes, as compactly as the 2D map, and Node spacing scales only the gaps", () => {
		for (const [spacing, style] of [[1, DEFAULT_CONTINENT_STYLE], [0.5, DEFAULT_CONTINENT_STYLE], [1, { direction: "left-right", balance: "both-sides" }]] as const) {
			const at = new Map(continentMap(head, plate, style, spacing).plates.map((p) => [p.id, p]));
			expect([...at.values()].every((p) => p.width === 20 && p.height === 5)).toBe(true);
			// Parent to child: half-widths and the 2D level gap. Siblings: a plate's height and the 2D sibling gap.
			expect(Math.abs(at.get("a")!.x)).toBeCloseTo(10 + COLUMN_GAP * spacing + 10, 9);
			expect(Math.abs(at.get("c")!.x - at.get("b")!.x)).toBeCloseTo(10 + COLUMN_GAP * spacing + 10, 9);
			if (style.balance === "one-side") expect(at.get("b")!.y - at.get("a")!.y).toBeCloseTo(5 + ROW_GAP * spacing, 9);
		}
		// Top-down: siblings side by side a width and the sibling gap apart, a level below their parent.
		const down = new Map(continentMap(head, plate, { direction: "top-down", balance: "one-side" }, 0.5).plates.map((p) => [p.id, p]));
		expect(down.get("b")!.x - down.get("a")!.x).toBeCloseTo(20 + ROW_GAP * 0.5, 9);
		expect(down.get("a")!.y).toBeCloseTo(2.5 + COLUMN_GAP * 0.5 + 2.5, 9);
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

	it("keeps the gap between planet surfaces at planetGap, and scales it with Note spacing", () => {
		const trees = [{ core: "a", continents: [{ id: "a1", children: [] }] }, { core: "b", continents: [{ id: "b1", children: [] }] }];
		const style: ContinentStyle = DEFAULT_CONTINENT_STYLE;
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
		expect(gapAt(1)).toBeCloseTo(planetGap(radius, radius, 1), 6);
		expect(gapAt(2)).toBeCloseTo(planetGap(radius, radius, 1) * 2, 6);
		expect(gapAt(0.5)).toBeCloseTo(planetGap(radius, radius, 1) / 2, 6);
		expect(gapAt(3)).toBeGreaterThan(gapAt(2));
	});

	it("pushes planets apart to the scaled gap, and stars out to half of it", () => {
		const trees = [{ core: "a", continents: [{ id: "a1", children: [] }] }];
		const run = (note: number): number => {
			const world = new PlanetWorld();
			world.spacing = { note, node: 1 };
			world.update(trees, plate, DEFAULT_CONTINENT_STYLE, () => 0, 0, false);
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
		world.update([tree], wide, DEFAULT_CONTINENT_STYLE, () => 0, 0, false);
		const place = world.place("a2")!;
		world.update([tree], wide, DEFAULT_CONTINENT_STYLE, () => 0, 0, false);
		expect(world.place("a2")).toBe(place);
		world.spacing = { note: 1, node: 2 };
		world.update([tree], wide, DEFAULT_CONTINENT_STYLE, () => 0, 0, false);
		expect(world.place("a2")).not.toBe(place);
	});
});

describe("lanes between planets", () => {
	// Three planets of eight lines each. Every line of a and b links to the next planet's core (lanes from many plates at once),
	// a and c link to a tag, and each line of a also links to a ghost of its own (leaf stars): the shape that swung and flew apart.
	const lines = (core: string): string[] => Array.from({ length: 8 }, (_, i) => `${core}${i}`);
	const trees = ["a", "b", "c"].map((core) => ({ core, continents: lines(core).map((id) => ({ id, children: [] })) }));
	const lanesAt = (note: number): Lane[] => {
		const lane = (source: string, target: string, kind: "link" | "tag"): Lane => ({ source, target, rest: linkDistance(kind, 10, 10, { note, node: 1 }), scale: 1 });
		return [
			...lines("a").map((id) => lane(id, "b", "link")),
			...lines("b").map((id) => lane(id, "c", "link")),
			...lines("a").map((id) => lane(id, `ghost:${id}`, "link")),
			lane("a", "tag:x", "tag"),
			lane("c", "tag:x", "tag"),
		];
	};
	const stars = ["tag:x", ...lines("a").map((id) => `ghost:${id}`)];

	/** d3's tick with only the planets force: alpha decays from 1 to 0.001 over 300 ticks, velocity keeps 0.6. `hold` keeps alpha at 1. */
	const settle = (world: PlanetWorld, bodies: Map<string, PlanetBody>, lanes: readonly Lane[], hold = false): void => {
		const bodyOf = (id: string): PlanetBody | undefined => bodies.get(id);
		const free = stars.map((id) => bodies.get(id)!);
		world.placeAll(bodyOf, 0, true);
		let alpha = 1;
		for (let tick = 0; tick < 300; tick++) {
			world.step(bodyOf, free, alpha, 0, lanes);
			for (const body of bodies.values()) {
				if (body.fx !== undefined) continue;
				body.vx = body.vx! * 0.6;
				body.vy = body.vy! * 0.6;
				body.vz = body.vz! * 0.6;
				body.x! += body.vx;
				body.y! += body.vy;
				body.z! += body.vz;
			}
			if (!hold) alpha += (0 - alpha) * (1 - Math.pow(0.001, 1 / 300));
		}
	};
	const world = (): { world: PlanetWorld; bodies: Map<string, PlanetBody> } => {
		const bodies = new Map<string, PlanetBody>();
		[...["a", "b", "c"], ...stars].forEach((id, i) => bodies.set(id, { x: 300 * Math.cos(i * 2.4), y: 300 * Math.sin(i * 2.4), z: (i % 5) * 20, vx: 0, vy: 0, vz: 0 }));
		for (const core of ["a", "b", "c"]) for (const id of lines(core)) bodies.set(id, {});
		return { world: new PlanetWorld(), bodies };
	};
	/** A re-settle at Note spacing `note`, from wherever the bodies are: what dragging the slider does (`Graph3DScene.setOverlays`). */
	const respace = (state: { world: PlanetWorld; bodies: Map<string, PlanetBody> }, note: number, hold = false): number => {
		state.world.clear();
		state.world.spacing = { note, node: 1 };
		state.world.update(trees, plate, DEFAULT_CONTINENT_STYLE, () => 0, 0, false);
		for (const body of state.bodies.values()) body.fx = body.fy = body.fz = undefined;
		settle(state.world, state.bodies, lanesAt(note), hold);
		const [a, b, c] = ["a", "b", "c"].map((id) => state.bodies.get(id)!);
		const d = (p: PlanetBody, q: PlanetBody): number => Math.hypot(p.x! - q.x!, p.y! - q.y!, p.z! - q.z!);
		return (d(a!, b!) + d(b!, c!) + d(a!, c!)) / 3;
	};

	it("settles farther apart at Note spacing x3 than x1, and the same each time the slider comes back", () => {
		const state = world();
		const [x1, x3, again1, again3] = [respace(state, 1), respace(state, 3), respace(state, 1), respace(state, 3)];
		// Rigid planets don't turn, so where a lane's plate sits depends a little on the way the planets came together: within 10%.
		const near = (value: number, to: number): boolean => Math.abs(value - to) < 0.1 * to;
		expect(x3).toBeGreaterThan(x1 * 1.5);
		expect(near(again1, x1)).toBe(true);
		expect(near(again3, x3)).toBe(true);
		expect(again3).toBeGreaterThan(again1 * 1.5);
		// Starting at x3, as a stored setting does on first load, lands where the slider does.
		expect(near(respace(world(), 3), x3)).toBe(true);
	});

	it("doesn't swing or fly apart while the layout is hot", () => {
		// A slider drag re-heats the layout on every step: alpha stays near 1.
		const state = world();
		const hot = respace(state, 1, true);
		expect(Number.isFinite(hot)).toBe(true);
		expect(hot).toBeLessThan(2000);
		for (const body of state.bodies.values()) expect(Math.hypot(body.vx ?? 0, body.vy ?? 0, body.vz ?? 0)).toBeLessThan(50);
	});

	it("reproduces the old swing: the same lanes pulled per plate, as d3 did, fly apart while hot", () => {
		// d3's link force on the plates (strength one over the fewer links at either node, shared by link count),
		// every plate's share then handed to its core by `step`: what the scene did before lanes moved into `step`.
		const state = world();
		state.world.update(trees, plate, DEFAULT_CONTINENT_STYLE, () => 0, 0, false);
		const bodyOf = (id: string): PlanetBody | undefined => state.bodies.get(id);
		const lanes = lanesAt(1);
		const count = new Map<string, number>();
		for (const lane of lanes) for (const id of [lane.source, lane.target]) count.set(id, (count.get(id) ?? 0) + 1);
		// Each surface plate also had its hierarchy link to its core, counted though it pulled nothing.
		for (const id of ["a", "b", "c"].flatMap(lines)) count.set(id, (count.get(id) ?? 0) + 1);
		for (let tick = 0; tick < 200 && Number.isFinite(state.bodies.get("a")!.x!); tick++) {
			state.world.placeAll(bodyOf, 0, true);
			for (const lane of lanes) {
				const [p, q] = [state.bodies.get(lane.source)!, state.bodies.get(lane.target)!];
				const [dx, dy, dz] = [q.x! + q.vx! - p.x! - p.vx!, q.y! + q.vy! - p.y! - p.vy!, q.z! + q.vz! - p.z! - p.vz!];
				const l = Math.hypot(dx, dy, dz);
				const k = ((l - lane.rest) / l) * (1 / Math.min(count.get(lane.source)!, count.get(lane.target)!));
				const toQ = count.get(lane.source)! / (count.get(lane.source)! + count.get(lane.target)!);
				[q.vx, q.vy, q.vz] = [q.vx! - dx * k * toQ, q.vy! - dy * k * toQ, q.vz! - dz * k * toQ];
				[p.vx, p.vy, p.vz] = [p.vx! + dx * k * (1 - toQ), p.vy! + dy * k * (1 - toQ), p.vz! + dz * k * (1 - toQ)];
			}
			state.world.step(bodyOf, stars.map((id) => state.bodies.get(id)!), 1, 0);
			for (const body of state.bodies.values()) {
				if (body.fx !== undefined) continue;
				for (const axis of ["x", "y", "z"] as const) {
					const v = `v${axis}` as const;
					body[v] = body[v]! * 0.6;
					body[axis] = body[axis]! + body[v];
				}
			}
		}
		const a = state.bodies.get("a")!;
		expect(Number.isFinite(a.x!) ? Math.hypot(a.x!, a.y!, a.z!) : Infinity).toBeGreaterThan(1e6);
	});

	it("shares a lane's pull between its bodies by their lane counts, as d3 does between nodes", () => {
		const state = world();
		state.world.update(trees, plate, DEFAULT_CONTINENT_STYLE, () => 0, 0, false);
		const bodyOf = (id: string): PlanetBody | undefined => state.bodies.get(id);
		state.world.placeAll(bodyOf, 0, true);
		for (const body of state.bodies.values()) body.vx = body.vy = body.vz = 0;
		// A busy planet (8 lanes) and a leaf ghost (1): the ghost moves 8 parts, the planet 1, and the planet takes no more than one lane's worth.
		const lane: Lane = { source: "a0", target: "ghost:a0", rest: 0, scale: 1 };
		const lanes = [lane, ...lines("a").slice(1).map((id) => ({ source: id, target: "b", rest: 1e9, scale: 0 }))];
		state.world.step(bodyOf, [], 1, 0, lanes);
		const [a, ghost] = [state.bodies.get("a")!, state.bodies.get("ghost:a0")!];
		const speed = (p: PlanetBody): number => Math.hypot(p.vx!, p.vy!, p.vz!);
		expect(speed(ghost) / speed(a)).toBeCloseTo(8, 6);
	});
});

describe("planet clearance", () => {
	it("keeps two planets of different radii their radii plus the Note spacing gap apart", () => {
		for (const note of [0.5, 1, 3]) {
			const [ra, rb] = [40, 260];
			const gap = planetGap(ra, rb, note);
			expect(planetClearance(ra, rb, note)).toBeCloseTo(ra + rb + gap, 9);
			expect(gap).toBeCloseTo(note * (PLANET_GAP + PLANET_GAP_SHARE * (ra + rb)), 9);
		}
	});

	it("leaves a clear gap at x1, a link's length between notes at the least, and more between big planets", () => {
		expect(planetGap(0, 0, 1)).toBe(linkDistance("link", 0, 0));
		expect(planetGap(300, 300, 1)).toBeGreaterThan(planetGap(30, 30, 1));
		// Between two radius-100 planets the gap is over half a radius: they don't read as touching.
		expect(planetGap(100, 100, 1)).toBeGreaterThan(50);
	});

	it("scales the whole gap with the slider", () => {
		expect(planetGap(120, 80, 3)).toBeCloseTo(3 * planetGap(120, 80, 1), 9);
		expect(planetGap(120, 80, 0.5)).toBeCloseTo(0.5 * planetGap(120, 80, 1), 9);
	});

	it("holds every pair of settled planets, of different sizes and pulled together by lanes, at their clearance", () => {
		// Four planets of different sizes; every line of b, c and d links to a's core, so lanes pull them all into a.
		const big = (core: string, n: number): { core: string; continents: PlanetBranch[] } => ({
			core,
			continents: Array.from({ length: n }, (_, i) => ({ id: `${core}${i}`, children: [{ id: `${core}${i}x`, children: [] }] })),
		});
		const trees = [big("a", 14), big("b", 6), big("c", 2), big("d", 9)];
		const wide = (id: string): { width: number; height: number } => ({ width: id.startsWith("a") ? 200 : id.startsWith("c") ? 20 : 60, height: 8 });
		const cores = ["a", "b", "c", "d"];
		const settleAt = (note: number): { world: PlanetWorld; d: (p: string, q: string) => number } => {
			const world = new PlanetWorld();
			world.spacing = { note, node: 1 };
			world.update(trees, wide, DEFAULT_CONTINENT_STYLE, () => 0, 0, false);
			const bodies = new Map<string, PlanetBody>();
			cores.forEach((id, i) => bodies.set(id, { x: 30 * Math.cos(i * 2.4), y: 30 * Math.sin(i * 2.4), z: i * 5, vx: 0, vy: 0, vz: 0 }));
			for (const tree of trees) for (const branch of tree.continents) for (const id of [branch.id, branch.children[0]!.id]) bodies.set(id, {});
			const lanes: Lane[] = trees.slice(1).flatMap((tree) => tree.continents.map((branch) => ({ source: branch.id, target: "a", rest: linkDistance("link", 30, 30, { note, node: 1 }), scale: 1 })));
			const bodyOf = (id: string): PlanetBody | undefined => bodies.get(id);
			world.placeAll(bodyOf, 0, true);
			let alpha = 1;
			for (let tick = 0; tick < 300; tick++) {
				world.step(bodyOf, [], alpha, 0, lanes);
				for (const body of bodies.values()) {
					if (body.fx !== undefined) continue;
					for (const axis of ["x", "y", "z"] as const) {
						const v = `v${axis}` as const;
						body[v] = body[v]! * 0.6;
						body[axis] = body[axis]! + body[v];
					}
				}
				alpha += (0 - alpha) * (1 - Math.pow(0.001, 1 / 300));
			}
			const d = (p: string, q: string): number => {
				const [a, b] = [bodies.get(p)!, bodies.get(q)!];
				return Math.hypot(a.x! - b.x!, a.y! - b.y!, a.z! - b.z!);
			};
			return { world, d };
		};
		const gaps = (note: number): number[] => {
			const { world, d } = settleAt(note);
			expect(world.radius("a")).toBeGreaterThan(2 * world.radius("c")!);
			const out: number[] = [];
			for (let i = 0; i < cores.length; i++) {
				for (let j = i + 1; j < cores.length; j++) {
					const [p, q] = [cores[i]!, cores[j]!];
					const [rp, rq] = [world.radius(p)!, world.radius(q)!];
					// The collision force is soft, so the lanes' pull leaves a sliver: within 3% of the gap.
					expect(d(p, q)).toBeGreaterThan(rp + rq + 0.97 * planetGap(rp, rq, note));
					out.push(d(p, q) - rp - rq);
				}
			}
			return out;
		};
		const [x05, x1, x3] = [gaps(0.5), gaps(1), gaps(3)];
		// The slider spreads every pair, not just the first planet's.
		for (let k = 0; k < x1.length; k++) {
			expect(x1[k]).toBeGreaterThan(x05[k]! * 1.5);
			expect(x3[k]).toBeGreaterThan(x1[k]! * 2);
		}
	});
});

describe("continent frames", () => {
	const fan: PlanetBranch = { id: "h", children: Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, children: [] })) };
	const tree = { core: "r", continents: [fan] };
	const radial: ContinentStyle = { direction: "radial", balance: "one-side" };
	const at = (centre: Vec3) => layoutPlanet(tree, plate, radial, 0, new Map([["h", centre]]));
	const north = { x: 0, y: 1, z: 0 };

	it("carries the continent's one frame to every plate: the 2D map's orientation, at a pole too", () => {
		const layout = at(north);
		const head = layout.places.get("h")!;
		// The frame is the continent centre's (world −z up at the pole), not the plate's own.
		expect(head.up.z).toBeCloseTo(-1, 9);
		let splayed = 0;
		for (const place of layout.places.values()) {
			const spread = angle(place.offset, head.offset);
			// Each plate turns with the surface under it, no more: its up stays the head's, tipped by its distance from the centre.
			expect(dot(place.up, head.up)).toBeGreaterThanOrEqual(Math.cos(spread) - 1e-9);
			expect(dot(place.right, head.right)).toBeGreaterThanOrEqual(Math.cos(spread) - 1e-9);
			expect(dot(place.normal, place.offset) / layout.radius).toBeCloseTo(1, 9);
			expect(dot(place.up, place.normal)).toBeCloseTo(0, 9);
			expect(len(place.up)).toBeCloseTo(1, 9);
			// A frame of its own (world +y projected at its own place) points every plate round the pole a different way.
			if (dot(tangentFrame(place.offset).up, head.up) < 0) splayed++;
		}
		expect(splayed).toBeGreaterThan(0);
	});

	it("keeps the plates' orientation to each other wherever the continent sits", () => {
		const [pole, equator] = [at(north), at({ x: 0, y: 0, z: 1 })];
		const ids = [...pole.places.keys()];
		for (const a of ids) {
			for (const b of ids) {
				expect(dot(pole.places.get(a)!.up, pole.places.get(b)!.up)).toBeCloseTo(dot(equator.places.get(a)!.up, equator.places.get(b)!.up), 9);
				expect(dot(pole.places.get(a)!.right, pole.places.get(b)!.up)).toBeCloseTo(dot(equator.places.get(a)!.right, equator.places.get(b)!.up), 9);
			}
		}
	});

	it("wraps as wrapPoint does, with right × up the normal, and stays stable far from the centre", () => {
		const frame = tangentFrame({ x: 0.3, y: -0.8, z: 0.5 });
		for (const [x, y] of [[0, 0], [12, -4], [-30, 25], [0, 140]] as const) {
			const wrapped = wrapPlate(frame, x, y, 50);
			const p = wrapPoint(frame.normal, x, y, 50);
			expect(wrapped.offset.x).toBeCloseTo(p.x, 9);
			expect(wrapped.offset.y).toBeCloseTo(p.y, 9);
			const { right: r, up: u } = wrapped;
			const n = { x: r.y * u.z - r.z * u.y, y: r.z * u.x - r.x * u.z, z: r.x * u.y - r.y * u.x };
			expect(dot(n, wrapped.normal)).toBeCloseTo(1, 9);
		}
	});
});

describe("spreadContinent", () => {
	/** Pairs of plates that overlap once wrapped onto `radius`, measured in the first plate's frame. */
	const overlaps = (plates: readonly { x: number; y: number; width: number; height: number }[], radius: number): number => {
		const frame = tangentFrame({ x: 0, y: 0, z: 1 });
		const wrapped = plates.map((p) => wrapPlate(frame, p.x, p.y, radius));
		let count = 0;
		for (let i = 0; i < plates.length; i++) {
			for (let j = i + 1; j < plates.length; j++) {
				const o = wrapped[i]!.offset;
				const q = wrapped[j]!.offset;
				const rel = { x: q.x - o.x, y: q.y - o.y, z: q.z - o.z };
				const [dx, dy] = [dot(rel, wrapped[i]!.right), dot(rel, wrapped[i]!.up)];
				if (Math.abs(dx) < (plates[i]!.width + plates[j]!.width) / 2 && Math.abs(dy) < (plates[i]!.height + plates[j]!.height) / 2) count++;
			}
		}
		return count;
	};
	// A dense radial continent: a ring of children, each with a child, squeezed sideways by a small planet.
	const dense: PlanetBranch = { id: "h", children: Array.from({ length: 14 }, (_, i) => ({ id: `s${i}`, children: [{ id: `t${i}`, children: [] }] })) };
	const radial: ContinentStyle = { direction: "radial", balance: "one-side" };

	it("pushes squeezed plates out from the centre until none overlap, keeping their bearings", () => {
		const map = continentMap(dense, plate, radial);
		// Small enough to squeeze the outer ring, while the map still sits within its hemisphere (as planetRadius keeps it).
		const radius = map.reach / 1.5;
		expect(overlaps(map.plates, radius)).toBeGreaterThan(0);
		const spread = spreadContinent(map, dense, radius, 0.75);
		expect(overlaps(spread.plates, radius)).toBe(0);
		const before = new Map(map.plates.map((p) => [p.id, p]));
		for (const p of spread.plates) {
			const q = before.get(p.id)!;
			if (p.id === "h") expect([p.x, p.y]).toEqual([q.x, q.y]);
			else {
				expect(Math.atan2(p.y, p.x)).toBeCloseTo(Math.atan2(q.y, q.x), 9);
				expect(Math.hypot(p.x, p.y)).toBeGreaterThanOrEqual(Math.hypot(q.x, q.y));
			}
		}
		// Every child stays beyond its parent: the continent keeps its shape.
		for (let i = 0; i < 14; i++) {
			const [s, t] = [spread.plates.find((p) => p.id === `s${i}`)!, spread.plates.find((p) => p.id === `t${i}`)!];
			expect(Math.hypot(t.x, t.y)).toBeGreaterThan(Math.hypot(s.x, s.y));
		}
		expect(spread.reach).toBeGreaterThan(map.reach);
		expect(spreadContinent(map, dense, radius, 0.75)).toEqual(spread);
	});

	it("leaves a map nothing overlaps alone", () => {
		const head: PlanetBranch = { id: "h", children: [{ id: "a", children: [] }, { id: "b", children: [{ id: "c", children: [] }] }] };
		const map = continentMap(head, plate);
		expect(spreadContinent(map, head, 200, 0.75)).toBe(map);
	});

	it("leaves no overlapping plates on a laid-out planet", () => {
		const tree = { core: "r", continents: [dense, { id: "g", children: Array.from({ length: 10 }, (_, i) => ({ id: `g${i}`, children: [] })) }] };
		const layout = layoutPlanet(tree, plate, radial);
		for (const head of ["h", "g"]) {
			const places = [...layout.places.values()].filter((p) => p.continent === head);
			for (let i = 0; i < places.length; i++) {
				for (let j = i + 1; j < places.length; j++) {
					const [a, b] = [places[i]!, places[j]!];
					const rel = { x: b.offset.x - a.offset.x, y: b.offset.y - a.offset.y, z: b.offset.z - a.offset.z };
					expect(Math.abs(dot(rel, a.right)) >= 20 || Math.abs(dot(rel, a.up)) >= 5).toBe(true);
				}
			}
		}
	});
});

describe("plates at their continent's frame", () => {
	// Mixed sizes: wide one-liners, tall panels, a square.
	const sizes = [{ width: 24, height: 1.4 }, { width: 9, height: 7 }, { width: 14, height: 3 }, { width: 5, height: 5 }];
	const sizeOf = (id: string): { width: number; height: number } => sizes[[...id].reduce((sum, c) => sum + c.charCodeAt(0), 0) % sizes.length]!;
	const branch = (id: string, depth: number, fan: number): PlanetBranch => ({ id, children: depth === 0 ? [] : Array.from({ length: fan }, (_, i) => branch(`${id}${i}`, depth - 1, fan)) });
	const tree = { core: "r", continents: [branch("a", 2, 4), branch("b", 1, 9), branch("c", 3, 2)] };
	const styles: ContinentStyle[] = [DEFAULT_CONTINENT_STYLE, { direction: "top-down", balance: "both-sides" }, { direction: "radial", balance: "one-side" }];

	/** Whether two plates (centre, frame, size) overlap, separating-axis test in the first one's plane. */
	const overlap = (a: { c: Vec3; r: Vec3; u: Vec3; w: number; h: number }, b: { c: Vec3; r: Vec3; u: Vec3; w: number; h: number }): boolean => {
		const flat = (v: Vec3): [number, number] => [dot(v, a.r), dot(v, a.u)];
		const rel = flat({ x: b.c.x - a.c.x, y: b.c.y - a.c.y, z: b.c.z - a.c.z });
		const [br, bu] = [flat(b.r), flat(b.u)];
		const axes: [number, number][] = [[1, 0], [0, 1], br, bu];
		return axes.every(([x, y]) => {
			const l = Math.hypot(x, y);
			const along = (v: [number, number]): number => Math.abs(v[0] * x + v[1] * y) / l;
			const reachA = (Math.abs(x) * a.w + Math.abs(y) * a.h) / 2 / l;
			const reachB = (along(br) * b.w + along(bu) * b.h) / 2;
			return along(rel) < reachA + reachB;
		});
	};

	it("leaves no two plates of a continent overlapping as they lie in its frame", () => {
		for (const style of [...styles, { direction: "left-right", balance: "both-sides" } as const]) {
			for (const spacing of [0.5, 1]) {
				const layout = layoutPlanet(tree, sizeOf, style, 0, undefined, spacing);
				for (const head of ["a", "b", "c"]) {
					const plates = [...layout.places.entries()].filter(([, p]) => p.continent === head).map(([id, p]) => ({ c: p.offset, r: p.right, u: p.up, w: sizeOf(id).width, h: sizeOf(id).height }));
					for (let i = 0; i < plates.length; i++) for (let j = i + 1; j < plates.length; j++) expect(overlap(plates[i]!, plates[j]!)).toBe(false);
				}
			}
		}
	});

	it("packs a continent of siblings as tightly as the 2D map: a plate's height and the sibling gap apart", () => {
		const fan = { core: "r", continents: [{ id: "h", children: Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, children: [] })) }] };
		const layout = layoutPlanet(fan, plate);
		const [a, b] = [layout.places.get("s0")!.offset, layout.places.get("s1")!.offset];
		// On the sphere: the arc between neighbours is close to the flat 5 + ROW_GAP (the wrap only bends it).
		expect(len({ x: b.x - a.x, y: b.y - a.y, z: b.z - a.z })).toBeCloseTo(5 + ROW_GAP, 0);
		expect(len({ x: b.x - a.x, y: b.y - a.y, z: b.z - a.z })).toBeLessThan(Math.hypot(20, 5));
	});
});

describe("Continent spacing", () => {
	const head: PlanetBranch = { id: "h", children: [{ id: "a", children: [] }, { id: "b", children: [{ id: "c", children: [] }] }] };
	const many = { core: "r", continents: Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, children: [{ id: `c${i}-x`, children: [{ id: `c${i}-y`, children: [] }] }] })) };
	// Few, compact continents: ones the sphere has room to keep apart at every spacing.
	const few = { core: "r", continents: Array.from({ length: 4 }, (_, i) => ({ id: `f${i}`, children: [] })) };
	/** The narrowest gap between two continents' maps on the surface: centre to centre, less both reaches without their margins. */
	const narrowest = (spacing: number): number => {
		const layout = layoutPlanet(few, plate, DEFAULT_CONTINENT_STYLE, 0, undefined, 1, spacing);
		const bare = few.continents.map((c) => continentMap(c, plate).reach - CONTINENT_MARGIN / 2);
		const centres = few.continents.map((c) => layout.centres.get(c.id)!);
		let least = Infinity;
		for (let i = 0; i < centres.length; i++) for (let j = i + 1; j < centres.length; j++) least = Math.min(least, angle(centres[i]!, centres[j]!) * layout.radius - bare[i]! - bare[j]!);
		return least;
	};

	it("keeps today's margin round a continent at x1, and scales it with the slider, never the plates", () => {
		const today = continentMap(head, plate);
		const corner = Math.max(...today.plates.map((p) => Math.hypot(Math.abs(p.x) + p.width / 2, Math.abs(p.y) + p.height / 2)));
		expect(today.reach).toBe(corner + CONTINENT_MARGIN / 2);
		expect(continentMap(head, plate, DEFAULT_CONTINENT_STYLE, 1, 1)).toEqual(today);
		for (const s of [0.5, 2, 3]) {
			const scaled = continentMap(head, plate, DEFAULT_CONTINENT_STYLE, 1, s);
			expect(scaled.plates).toEqual(today.plates);
			expect(scaled.reach - today.reach).toBeCloseTo((CONTINENT_MARGIN * (s - 1)) / 2, 9);
		}
		expect(layoutPlanet(many, plate, DEFAULT_CONTINENT_STYLE, 0, undefined, 1, 1)).toEqual(layoutPlanet(many, plate));
	});

	it("sets continents at least the margin apart, farther as the slider grows", () => {
		const gaps = [0.5, 1, 2, 3].map(narrowest);
		[0.5, 1, 2, 3].forEach((s, i) => expect(gaps[i]!).toBeGreaterThan(CONTINENT_MARGIN * s * 0.9));
		// Gaps are a floor (a small planet can leave room to spare), so they never shrink, and grow once the margin dominates.
		for (let i = 1; i < gaps.length; i++) expect(gaps[i]!).toBeGreaterThanOrEqual(gaps[i - 1]! - 1e-9);
		expect(gaps[3]!).toBeGreaterThan(gaps[1]! + CONTINENT_MARGIN);
	});

	it("re-lays a planet out when Continent spacing changes, and keeps it otherwise", () => {
		const world = new PlanetWorld();
		world.update([many], plate, DEFAULT_CONTINENT_STYLE, () => 0, 0, false);
		const [place, radius] = [world.place("c3-y")!, world.radius("r")!];
		world.update([many], plate, DEFAULT_CONTINENT_STYLE, () => 0, 0, false);
		expect(world.place("c3-y")).toBe(place);
		world.continentSpacing = 3;
		world.update([many], plate, DEFAULT_CONTINENT_STYLE, () => 0, 0, false);
		expect(world.place("c3-y")).not.toBe(place);
		expect(world.radius("r")!).toBeGreaterThan(radius);
	});
});
