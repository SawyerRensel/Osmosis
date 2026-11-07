import { describe, it, expect } from "vitest";
import { OsmosisParser } from "../parser";
import { buildGraph, noteNodeId } from "./model";
import type { Vec3 } from "./flight";
import {
	FlatLayouts,
	flatCharges,
	flatDepth,
	flatIndex,
	flatLinkScale,
	flattenStep,
	FlatState,
	flatWeight,
	notePush,
	obbOverlap,
	preferredTwist,
	uprightAlong,
	type Body,
	type FlatBranch,
} from "./flatten";

const note = "# Passage plan\n\nIntro line\n\n## Crew\n\n1. One\n2. Two\n3. Three\n\t- Sub\n\n## Gear\n\n- Rope\n";
const model = buildGraph([{ tree: new OsmosisParser().parse(note, "Passage.md"), cache: null }], () => null);
const id = (text: string): string => model.nodes.find((n) => n.kind === "line" && n.label === text)!.id;
const size = () => ({ width: 20, height: 5 });
const CORE = noteNodeId("Passage.md");
const NO_BOX = { x0: 0, x1: 0, y0: 0, y1: 0, ty0: 0, ty1: 0, t: 0 };

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const minus = (a: Body, b: Body): Vec3 => ({ x: a.x! - b.x!, y: a.y! - b.y!, z: a.z! - b.z! });
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const unit = (a: Vec3): Vec3 => {
	const l = Math.hypot(a.x, a.y, a.z);
	return { x: a.x / l, y: a.y / l, z: a.z / l };
};
/** Every line of a branch under its root, with its offset from the root. */
const linesOf = (branch: FlatBranch): { id: string; dx: number; dy: number; reach: number }[] =>
	branch.lines.flatMap((line) => [line, ...line.members.map((m) => ({ ...m, dx: line.dx + m.dx, dy: line.dy + m.dy }))]);

describe("flatDepth and flatWeight", () => {
	it("is off at the far left, then runs smoothly from depth 5 to 1 at the far right", () => {
		expect(flatDepth(0)).toBe(Infinity);
		expect(flatDepth(Number.NaN)).toBe(Infinity);
		expect(flatDepth(0.25)).toBe(4);
		expect(flatDepth(0.75)).toBe(2);
		expect(flatDepth(0.875)).toBe(1.5);
		expect(flatDepth(1)).toBe(1);
	});

	it("pulls a line in by how far it sits below the flat depth, up to fully flat a depth below", () => {
		expect(flatWeight(2, 2)).toBe(0);
		expect(flatWeight(3, 2)).toBe(1);
		expect(flatWeight(4, 2)).toBe(1);
		expect(flatWeight(2, 1.5)).toBe(0.5);
		expect(flatWeight(1, 1.5)).toBe(0);
	});
});

describe("FlatLayouts.branches", () => {
	const layouts = new FlatLayouts();

	it("is empty when nothing is flat", () => {
		expect(layouts.branches(model.nodes, Infinity, size)).toEqual([]);
	});

	it("roots a branch at each line of the flat depth that has children, its children as ramp lines carrying what is under them", () => {
		const branches = layouts.branches(model.nodes, 2, size);
		expect(branches.map((b) => b.root)).toEqual([id("Crew"), id("Gear")]);
		expect(branches[0]!.core).toBe(CORE);
		expect(branches[0]!.weight).toBe(1);
		expect(branches[0]!.lines.map((l) => l.id)).toEqual([id("One"), id("Two"), id("Three")]);
		expect(branches[0]!.lines[2]!.members.map((m) => m.id)).toEqual([id("Sub")]);
		expect(branches[1]!.lines.map((l) => l.id)).toEqual([id("Rope")]);
	});

	it("lays a branch out as the mind map does: children outward of their parent, along the slice in document order", () => {
		const [crew] = layouts.branches(model.nodes, 2, size);
		const [one, two, three] = crew!.lines;
		const sub = three!.members[0]!;
		expect(one!.dx).toBeGreaterThan(20);
		expect(two!.dx).toBe(one!.dx);
		expect(one!.dy).toBeLessThan(two!.dy);
		expect(two!.dy).toBeLessThan(three!.dy);
		// A member's offset is from its ramp line, and further out.
		expect(sub.dx).toBeGreaterThan(20);
		expect(sub.dy).toBeCloseTo(0);
		// Plate-sized rows: siblings are a plate apart and a little more, not map pixels.
		expect(two!.dy - one!.dy).toBeGreaterThan(5);
		expect(two!.dy - one!.dy).toBeLessThan(8);
	});

	it("gives each branch and ramp line a footprint holding every plate's reach", () => {
		const [crew] = layouts.branches(model.nodes, 2, size);
		for (const p of [{ dx: 0, dy: 0, reach: 10 }, ...linesOf(crew!)]) {
			expect(p.dx - p.reach).toBeGreaterThanOrEqual(crew!.box.x0 - 1e-9);
			expect(p.dx + p.reach).toBeLessThanOrEqual(crew!.box.x1 + 1e-9);
			expect(p.dy - p.reach).toBeGreaterThanOrEqual(crew!.box.y0 - 1e-9);
			expect(p.dy + p.reach).toBeLessThanOrEqual(crew!.box.y1 + 1e-9);
		}
		expect(crew!.box.t).toBe(10);
		// The tighter span holds only the plates' heights, as the layout's rows do.
		expect(crew!.box.ty0).toBeCloseTo(Math.min(0, ...linesOf(crew!).map((p) => p.dy)) - 2.5);
		expect(crew!.box.ty1).toBeCloseTo(Math.max(0, ...linesOf(crew!).map((p) => p.dy)) + 2.5);
		expect(crew!.lines[2]!.box.x1).toBeCloseTo(crew!.lines[2]!.members[0]!.dx + 10);
	});

	it("stacks a numbered list of ten 1 to 10 along the slice", () => {
		const items = Array.from({ length: 10 }, (_, i) => `${i + 1}. Step ${i + 1}`).join("\n");
		const ten = buildGraph([{ tree: new OsmosisParser().parse(`# Plan\n\n## Steps\n\n${items}\n`, "Plan.md"), cache: null }], () => null);
		const [steps] = new FlatLayouts().branches(ten.nodes, 2, size);
		const label = new Map(ten.nodes.map((n) => [n.id, n.label]));
		expect(steps!.lines.map((m) => label.get(m.id))).toEqual(Array.from({ length: 10 }, (_, i) => `Step ${i + 1}`));
		steps!.lines.forEach((m, i) => {
			if (i > 0) expect(m.dy).toBeGreaterThan(steps!.lines[i - 1]!.dy);
		});
		// The list is centred on its heading, as in the mind map.
		expect(steps!.lines[0]!.dy).toBeCloseTo(-steps!.lines[9]!.dy);
	});

	it("at depth 1 flattens everything under the title into one branch", () => {
		const branches = layouts.branches(model.nodes, 1, size);
		expect(branches.map((b) => b.root)).toEqual([id("Passage plan")]);
		expect(linesOf(branches[0]!)).toHaveLength(8);
	});

	it("between whole depths roots at the shallower one, with its children part-way in", () => {
		const branches = layouts.branches(model.nodes, 1.5, size);
		expect(branches.map((b) => b.root)).toEqual([id("Passage plan")]);
		expect(branches[0]!.weight).toBe(0.5);
		expect(branches[0]!.lines.map((l) => l.id)).toEqual([id("Intro line"), id("Crew"), id("Gear")]);
		expect(branches[0]!.lines[1]!.members.map((m) => m.id)).toEqual([id("One"), id("Two"), id("Three"), id("Sub")]);
	});

	it("roots branches only at lines with children, and keeps shallower lines 3D", () => {
		const branches = layouts.branches(model.nodes, 3, size);
		expect(branches.map((b) => b.root)).toEqual([id("Three")]);
		expect(branches[0]!.lines.map((m) => m.id)).toEqual([id("Sub")]);
	});

	it("leaves out a branch whose root isn't loaded", () => {
		const without = model.nodes.filter((n) => n.id !== id("Crew"));
		expect(layouts.branches(without, 2, size).map((b) => b.root)).toEqual([id("Gear")]);
	});
});

describe("flatLinkScale and flatCharges", () => {
	const branch = (weight: number): FlatBranch[] => [
		{
			root: "r",
			core: "c",
			weight,
			box: NO_BOX,
			lines: [
				{ id: "a", dx: 0, dy: 0, reach: 0, rise: 0, box: NO_BOX, members: [{ id: "a1", dx: 0, dy: 0, reach: 0, rise: 0 }] },
				{ id: "b", dx: 0, dy: 0, reach: 0, rise: 0, box: NO_BOX, members: [] },
			],
		},
	];

	it("doesn't pull inside a rigid branch, and fully for edges leaving it", () => {
		const index = flatIndex(branch(1));
		expect(flatLinkScale(index, "r", "a")).toBe(0);
		expect(flatLinkScale(index, "a1", "b")).toBe(0);
		expect(flatLinkScale(index, "a1", "x")).toBe(1);
		expect(flatLinkScale(index, "r", "c")).toBe(1);
		expect(flatLinkScale(index, "x", "y")).toBe(1);
	});

	it("part-way, eases the pull between a ramp line and its root, and keeps each ramp line's piece rigid", () => {
		const index = flatIndex(branch(0.25));
		expect(flatLinkScale(index, "r", "a")).toBe(0.75);
		expect(flatLinkScale(index, "a1", "b")).toBe(0.75);
		expect(flatLinkScale(index, "a", "a1")).toBe(0);
		expect(flatLinkScale(index, "a1", "x")).toBe(1);
	});

	it("takes rigid lines out of the many-body force and leaves their strength to their core", () => {
		const strengths = new Map([["r", -30], ["a", -30], ["a1", -30], ["b", -30], ["c", -30]]);
		const shares = flatCharges(strengths, branch(1));
		expect([...strengths]).toEqual([["r", -30], ["c", -30]]);
		expect([...shares]).toEqual([["c", -90]]);
	});

	it("leaves a ramp line part of its strength", () => {
		const strengths = new Map([["r", -30], ["a", -30], ["a1", -30], ["b", -30]]);
		const shares = flatCharges(strengths, branch(0.25));
		expect(strengths.get("a")).toBeCloseTo(-22.5);
		expect(strengths.has("a1")).toBe(false);
		expect(shares.get("c")).toBeCloseTo(-30 - 15);
	});
});

describe("notePush", () => {
	it("pushes every charged node of another note by what its core feels, and leaves the note's own lines alone", () => {
		const coreA: Body = { x: 0, y: 0, z: 0 };
		const coreB: Body = { x: 10, y: 0, z: 0 };
		const ownLine: Body = { x: 5, y: 0, z: 0, vx: 0 };
		const otherLine: Body = { x: 10, y: 50, z: 0, vx: 0, vy: 0 };
		const cores = new Map([["A.md", { body: coreA, strength: -100 }], ["B.md", { body: coreB, strength: 0 }]]);
		notePush(cores, [{ body: ownLine, path: "A.md" }, { body: coreB, path: "B.md" }, { body: otherLine, path: "B.md" }], 0.5);
		expect(ownLine.vx).toBe(0);
		// d3's law: strength × alpha / distance, away from the source.
		expect(coreB.vx).toBeCloseTo(5);
		// The same push as its core, so the note moves as a whole.
		expect(otherLine.vx).toBeCloseTo(5);
		expect(otherLine.vy).toBeCloseTo(0);
	});
});

describe("preferredTwist", () => {
	const u = { x: 1, y: 0, z: 0 };

	it("stands upright alone: document order runs down", () => {
		const v = preferredTwist(u, [], { x: 0, y: -1, z: 0 });
		expect(v.y).toBeCloseTo(-1);
	});

	it("turns sideways to keep clear of a neighbour straight below", () => {
		const v = preferredTwist(u, [{ u: unit({ x: 1, y: -0.3, z: 0 }), weight: 1 }], { x: 0, y: -1, z: 0 });
		expect(Math.abs(v.z)).toBeCloseTo(1);
		expect(dot(v, u)).toBeCloseTo(0);
	});

	it("keeps the sign it had", () => {
		expect(preferredTwist(u, [], { x: 0, y: 1, z: 0 }).y).toBeCloseTo(1);
	});

	it("has an upright for an axis straight up", () => {
		const v = uprightAlong({ x: 0, y: 1, z: 0 });
		expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(1);
		expect(v.y).toBeCloseTo(0);
	});
});

describe("obbOverlap", () => {
	const box = (x: number, y: number, z: number, axes: [Vec3, Vec3, Vec3], half: [number, number, number]) => ({ centre: { x, y, z }, axes, half, radius: Math.hypot(...half) });
	const I: [Vec3, Vec3, Vec3] = [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }];

	it("finds how deep two boxes overlap, and the way to part them", () => {
		const hit = obbOverlap(box(0, 0, 0, I, [5, 5, 1]), box(0, 0, 1.5, I, [5, 5, 1]));
		expect(hit!.depth).toBeCloseTo(0.5);
		expect(hit!.axis.z).toBeCloseTo(1);
	});

	it("tells thin slices that cut each other from ones that only share a bounding sphere", () => {
		const turned: [Vec3, Vec3, Vec3] = [unit({ x: 1, y: 0, z: 1 }), { x: 0, y: 1, z: 0 }, unit({ x: -1, y: 0, z: 1 })];
		expect(obbOverlap(box(0, 0, 0, I, [10, 10, 1]), box(0, 0, 8, turned, [10, 10, 1]))).not.toBeNull();
		expect(obbOverlap(box(0, 0, 0, I, [10, 10, 1]), box(0, 0, 3, I, [10, 10, 1]))).toBeNull();
	});
});

describe("flattenStep", () => {
	const at = (body: Body): Vec3 => ({ x: body.x!, y: body.y!, z: body.z! });

	it("lays a branch out in a slice through its core: outward along core to root, deeper further out", () => {
		const [crew] = new FlatLayouts().branches(model.nodes, 2, size);
		const bodies = new Map<string, Body>([[CORE, { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0 }], [crew!.root, { x: 30, y: 0, z: 40, vx: 0, vy: 0, vz: 0 }]]);
		for (const line of linesOf(crew!)) bodies.set(line.id, { x: 0, y: 0, z: 0 });
		const state = new FlatState();
		const { twists } = state;
		flattenStep([crew!], (key) => bodies.get(key), 0.6, 1, state);
		const root = bodies.get(crew!.root)!;
		const u = unit(at(root));
		const n = cross(u, twists.get(crew!.root)!);
		for (const line of linesOf(crew!)) {
			const body = bodies.get(line.id)!;
			// In the plane through the core, the root and the slice's twist.
			expect(dot(at(body), n)).toBeCloseTo(0);
			// Its outward offset is its 2D layout's left-to-right.
			expect(dot(minus(body, root), u)).toBeCloseTo(line.dx);
			expect(body).toMatchObject({ vx: 0, vy: 0, vz: 0 });
		}
		const outwardOf = (text: string): number => dot(minus(bodies.get(id(text))!, root), u);
		expect(outwardOf("Three")).toBeGreaterThan(0);
		expect(outwardOf("Sub")).toBeGreaterThan(outwardOf("Three"));
		// Document order runs along the slice, and an untwisted slice reads down the world.
		expect(at(bodies.get(id("One"))!).y).toBeGreaterThan(at(bodies.get(id("Three"))!).y);
	});

	it("hands an edge's pull on rigid lines to the root, averaged; leaves a pinned line, and a pinned root's twist", () => {
		const branch: FlatBranch = {
			root: "r",
			core: "c",
			weight: 1,
			box: NO_BOX,
			lines: [
				{ id: "m", dx: 30, dy: 10, reach: 0, rise: 0, box: NO_BOX, members: [] },
				{ id: "p", dx: 30, dy: 20, reach: 0, rise: 0, box: NO_BOX, members: [] },
			],
		};
		const bodies: Record<string, Body> = {
			c: { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0 },
			r: { x: 0, y: 0, z: 10, vx: 0, vy: 0, vz: 0 },
			m: { x: 0, y: 0, z: 0, vx: 2, vy: 0, vz: 0 },
			p: { x: 5, y: 5, z: 5, fx: 5, fy: 5, fz: 5, vx: 0, vy: 4, vz: 0 },
		};
		flattenStep([branch], (key) => bodies[key], 0.6, 1, new FlatState());
		// Only the free line's pull counts.
		expect(bodies.r!.vx).toBeCloseTo(2);
		expect(bodies.p).toMatchObject({ x: 5, y: 5, z: 5 });

		const pinned: Record<string, Body> = { c: bodies.c!, r: { x: 0, y: 0, z: 10, fx: 0, fy: 0, fz: 10 }, m: { x: 0, y: 0, z: 0 }, p: { x: 0, y: 0, z: 0 } };
		const state = new FlatState();
		state.twists.set("r", { x: 1, y: 0, z: 0 });
		flattenStep([branch], (key) => pinned[key], 0.6, 1, state);
		expect(state.twists.get("r")).toEqual({ x: 1, y: 0, z: 0 });
		expect(pinned.m).toMatchObject({ x: 10, y: 0, z: 40 });
	});

	/** Runs a ramp line pulled sideways by a steady outside force to rest, and returns how far it rests from its slot. */
	function rampRest(weight: number): number {
		const branch: FlatBranch = {
			root: "r",
			core: "c",
			weight,
			box: { x0: -1, x1: 31, y0: -1, y1: 1, ty0: -1, ty1: 1, t: 1 },
			lines: [{ id: "a", dx: 30, dy: 0, reach: 1, rise: 1, box: { x0: -1, x1: 21, y0: -1, y1: 1, ty0: -1, ty1: 1, t: 1 }, members: [{ id: "a1", dx: 20, dy: 0, reach: 1, rise: 1 }] }],
		};
		const bodies: Record<string, Body> = {
			c: { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0 },
			r: { x: 0, y: 0, z: 50, fx: 0, fy: 0, fz: 50 },
			a: { x: 0, y: 0, z: 80, vx: 0, vy: 0, vz: 0 },
			a1: { x: 0, y: 0, z: 0 },
		};
		const state = new FlatState();
		const a = bodies.a!;
		for (let tick = 0, alpha = 1; tick < 400; tick++, alpha *= 0.98) {
			a.vx! += alpha * 2; // a steady pull, alpha-scaled like any d3 force
			flattenStep([branch], (key) => bodies[key], 0.6, alpha, state);
			for (const body of [a]) {
				body.x! += (body.vx! *= 0.6);
				body.y! += (body.vy! *= 0.6);
				body.z! += (body.vz! *= 0.6);
			}
		}
		const slot = { x: 0, y: 0, z: 80 };
		// The ramp line's piece stays rigid with it.
		const a1 = bodies.a1!;
		expect(Math.hypot(a1.x! - a.x!, a1.y! - a.y!, a1.z! - a.z!)).toBeCloseTo(20);
		return Math.hypot(a.x! - slot.x, a.y! - slot.y, a.z! - slot.z);
	}

	it("pulls a ramp line part-way into its slot, nearer as its weight nears 1, keeping its pull", () => {
		const [half, most, nearly] = [rampRest(0.5), rampRest(0.9), rampRest(0.99)];
		expect(half).toBeGreaterThan(1);
		expect(most).toBeLessThan(half);
		expect(nearly).toBeLessThan(most / 5);
	});

	it("keeps sibling slices of a dense note clear of each other: no plate of one cuts into another's", () => {
		// Shaped like `e2e/fixtures/graph3d/Galley Handbook.md`: many headings, each with a long list, some nested.
		const words = ["rice", "pasta in a sealed tub", "flour", "tinned tomatoes", "a spare tin opener taped to the lid", "kettle", "fire blanket"];
		const list = (n: number, nest: boolean): string =>
			Array.from({ length: n }, (_, i) => `- ${words[i % words.length]!} ${i + 1}` + (nest && i % 4 === 0 ? `\n\t- ${words[(i + 3) % words.length]!}\n\t\t- note ${i}` : "")).join("\n");
		const lengths = [18, 12, 4, 8, 16, 7, 9, 10, 5];
		const text = `# Galley\n\n${lengths.map((n, h) => `## Part ${h + 1}\n\n${list(n, h % 3 === 2)}\n`).join("\n")}`;
		const galley = buildGraph([{ tree: new OsmosisParser().parse(text, "Galley.md"), cache: null }], () => null);
		const sizeOf = (node: { label: string }) => ({ width: Math.min(57, node.label.length * 1.5 + 2), height: 5 });
		const branches = new FlatLayouts().branches(galley.nodes, 2, sizeOf);
		const reachOf = new Map(galley.nodes.map((node) => [node.id, Math.max(sizeOf(node).width, 5) / 2]));
		expect(branches.length).toBeGreaterThanOrEqual(9);
		const core = noteNodeId("Galley.md");
		const bodies = new Map<string, Body>([[core, { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0 }]]);
		// Every root starts crowded together on one side of the core, as from seeds near their parent.
		let seed = 1;
		const random = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
		for (const branch of branches) {
			bodies.set(branch.root, { x: 40 + random(), y: random(), z: random(), vx: 0, vy: 0, vz: 0 });
			for (const line of linesOf(branch)) bodies.set(line.id, { x: 0, y: 0, z: 0 });
		}
		const state = new FlatState();
		const { twists } = state;
		for (let tick = 0, alpha = 1; tick < 300; tick++, alpha *= 0.977) {
			// A hierarchy link holding each root 40 from the core.
			for (const branch of branches) {
				const root = bodies.get(branch.root)!;
				const r = Math.hypot(root.x!, root.y!, root.z!);
				const k = (alpha * 0.3 * (40 - r)) / r;
				[root.vx, root.vy, root.vz] = [root.vx! + root.x! * k, root.vy! + root.y! * k, root.vz! + root.z! * k];
			}
			flattenStep(branches, (key) => bodies.get(key), 0.6, alpha, state);
			for (const branch of branches) {
				const root = bodies.get(branch.root)!;
				root.x! += (root.vx! *= 0.6);
				root.y! += (root.vy! *= 0.6);
				root.z! += (root.vz! *= 0.6);
			}
		}
		const plates = branches.flatMap((branch, b) => [branch.root, ...linesOf(branch).map((l) => l.id)].map((key) => ({ id: key, b })));
		let cuts = 0;
		for (let i = 0; i < plates.length; i++) {
			for (let j = i + 1; j < plates.length; j++) {
				const [p, q] = [plates[i]!, plates[j]!];
				if (p.b === q.b) continue;
				const [a, b] = [bodies.get(p.id)!, bodies.get(q.id)!];
				if (Math.hypot(a.x! - b.x!, a.y! - b.y!, a.z! - b.z!) < reachOf.get(p.id)! + reachOf.get(q.id)!) cuts++;
			}
		}
		expect(cuts).toBe(0);
		// And each slice still passes through the core, its lines further out than its root.
		for (const branch of branches) {
			const root = bodies.get(branch.root)!;
			const n = cross(unit(at(root)), twists.get(branch.root)!);
			for (const line of linesOf(branch)) {
				expect(Math.abs(dot(at(bodies.get(line.id)!), n))).toBeLessThan(1e-6);
				expect(dot(minus(bodies.get(line.id)!, root), unit(at(root)))).toBeGreaterThan(0);
			}
		}
	});
});
