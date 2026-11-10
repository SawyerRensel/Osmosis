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
	flatWeight,
	notePush,
	obbOverlap,
	facingPhase,
	ringDirections,
	type Body,
	type FlatBranch,
} from "./flatten";

const note = "# Passage plan\n\nIntro line\n\n## Crew\n\n1. One\n2. Two\n3. Three\n\t- Sub\n\n## Gear\n\n- Rope\n";
const model = buildGraph([{ tree: new OsmosisParser().parse(note, "Passage.md"), cache: null }], () => null);
const id = (text: string): string => model.nodes.find((n) => n.kind === "line" && n.label === text)!.id;
const size = () => ({ width: 20, height: 5 });
const CORE = noteNodeId("Passage.md");
const NO_BOX = { x0: 0, x1: 0, y0: 0, y1: 0, ty0: 0, ty1: 0, t: 0 };
const X = { x: 1, y: 0, z: 0 };

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const minus = (a: Body, b: Body): Vec3 => ({ x: a.x! - b.x!, y: a.y! - b.y!, z: a.z! - b.z! });
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

	// A line before the title keeps the file-name plate as the note's root, so the title can be a branch root.
	const cored = buildGraph([{ tree: new OsmosisParser().parse(`Draft\n\n${note}`, "Passage.md"), cache: null }], () => null);
	const coredId = (text: string): string => cored.nodes.find((n) => n.kind === "line" && n.label === text)!.id;

	it("at depth 1 flattens everything under the title into one branch, when the core is the root", () => {
		const branches = layouts.branches(cored.nodes, 1, size);
		expect(branches.map((b) => b.root)).toEqual([coredId("Passage plan")]);
		expect(branches[0]!.core).toBe(CORE);
		expect(linesOf(branches[0]!)).toHaveLength(8);
	});

	it("between whole depths roots at the shallower one, with its children part-way in", () => {
		const branches = layouts.branches(cored.nodes, 1.5, size);
		const id = coredId;
		expect(branches.map((b) => b.root)).toEqual([id("Passage plan")]);
		expect(branches[0]!.weight).toBe(0.5);
		expect(branches[0]!.lines.map((l) => l.id)).toEqual([id("Intro line"), id("Crew"), id("Gear")]);
		expect(branches[0]!.lines[1]!.members.map((m) => m.id)).toEqual([id("One"), id("Two"), id("Three"), id("Sub")]);
	});

	it("pivots on a sole H1 root, which is never a branch root: below depth 2 it roots where depth 2 does, fully flat", () => {
		expect(model.nodes.some((n) => n.kind === "note")).toBe(false);
		for (const flat of [1, 1.5, 2]) {
			const branches = layouts.branches(model.nodes, flat, size);
			expect(branches.map((b) => b.root)).toEqual([id("Crew"), id("Gear")]);
			expect(branches.map((b) => b.core)).toEqual([CORE, CORE]);
			expect(branches[0]!.weight).toBe(1);
		}
		// Above depth 2, weights ease as they do under a core.
		expect(layouts.branches(model.nodes, 2.5, size)[0]!.weight).toBe(0.5);
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
			dir: X,
			hold: 1,
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

/** A dense note, shaped like `e2e/fixtures/graph3d/Galley Handbook.md`: many headings, each with a long list, some nested. */
const galleyText = ((): string => {
	const words = ["rice", "pasta in a sealed tub", "flour", "tinned tomatoes", "a spare tin opener taped to the lid", "kettle", "fire blanket"];
	const list = (n: number, nest: boolean): string =>
		Array.from({ length: n }, (_, i) => `- ${words[i % words.length]!} ${i + 1}` + (nest && i % 4 === 0 ? `\n\t- ${words[(i + 3) % words.length]!}\n\t\t- note ${i}` : "")).join("\n");
	const lengths = [18, 12, 4, 8, 16, 7, 9, 10, 5];
	return `# Galley\n\n${lengths.map((n, h) => `## Part ${h + 1}\n\n${list(n, h % 3 === 2)}\n`).join("\n")}`;
})();
const galleyOf = (text: string) => buildGraph([{ tree: new OsmosisParser().parse(text, "Galley.md"), cache: null }], () => null);
const angleOf = (v: Vec3): number => (Math.atan2(v.z, v.x) + 2 * Math.PI) % (2 * Math.PI);

describe("ringDirections", () => {
	it("spreads slices of one size evenly round world up, the first at +x", () => {
		const dirs = ringDirections([3, 3, 3, 3]);
		dirs.forEach((dir, i) => {
			expect(dir.y).toBe(0);
			expect(Math.hypot(dir.x, dir.z)).toBeCloseTo(1);
			expect(angleOf(dir)).toBeCloseTo((i * Math.PI) / 2);
		});
	});

	it("gives each slice a share of the ring by its size: neighbours sit half their two shares apart, all the way round", () => {
		const sizes = [8, 1, 3, 2];
		const angles = ringDirections(sizes).map(angleOf);
		const total = 14;
		for (let i = 0; i < sizes.length; i++) {
			const j = (i + 1) % sizes.length;
			const gap = (angles[j]! - angles[i]! + 2 * Math.PI) % (2 * Math.PI);
			expect(gap).toBeCloseTo((Math.PI * (sizes[i]! + sizes[j]!)) / total);
		}
	});

	it("keeps document order round the ring", () => {
		const angles = ringDirections([5, 1, 1, 9, 2, 4]).map(angleOf);
		for (let i = 1; i < angles.length; i++) expect(angles[i]!).toBeGreaterThan(angles[i - 1]!);
	});

	it("points a lone slice along +x", () => {
		expect(ringDirections([7])).toEqual([{ x: 1, y: 0, z: 0 }]);
	});

	it("starts the ring at a given phase: the first slice points along it, the rest follow clockwise seen from above", () => {
		const phase = 1;
		const dirs = ringDirections([3, 3, 3, 3], phase);
		expect(dirs[0]!.x).toBeCloseTo(Math.cos(phase));
		expect(dirs[0]!.z).toBeCloseTo(Math.sin(phase));
		// Seen from above (looking down -y, camera up -z) +x is right and +z is down the screen, so clockwise is from +x towards +z: y-component of (a x b) is negative.
		for (let i = 1; i < dirs.length; i++) {
			const [a, b] = [dirs[i - 1]!, dirs[i]!];
			expect(a.z * b.x - a.x * b.z).toBeLessThan(0);
		}
		expect(angleOf(dirs[1]!)).toBeCloseTo((phase + Math.PI / 2) % (2 * Math.PI));
	});

	it("is stable: the same phase gives the same directions, and a phase of 0 is the default", () => {
		expect(ringDirections([5, 1, 4], 2.5)).toEqual(ringDirections([5, 1, 4], 2.5));
		expect(ringDirections([5, 1, 4], 0)).toEqual(ringDirections([5, 1, 4]));
	});

	describe("facingPhase", () => {
		it("points the first slice at the camera's side of the pivot, level", () => {
			const pivot = { x: 10, y: 5, z: -3 };
			for (const camera of [{ x: 40, y: 80, z: -3 }, { x: 10, y: -2, z: 30 }, { x: -20, y: 5, z: -33 }]) {
				const [first] = ringDirections([1, 1, 1], facingPhase(camera, pivot));
				const [dx, dz] = [camera.x - pivot.x, camera.z - pivot.z];
				expect(first!.x).toBeCloseTo(dx / Math.hypot(dx, dz));
				expect(first!.z).toBeCloseTo(dz / Math.hypot(dx, dz));
			}
		});

		it("falls back to +x with the camera straight above the pivot", () => {
			const pivot = { x: 4, y: 0, z: 7 };
			expect(facingPhase({ x: 4, y: 90, z: 7 }, pivot)).toBe(0);
			expect(ringDirections([2, 2], facingPhase({ x: 4, y: -90, z: 7 }, pivot))[0]).toEqual({ x: 1, y: 0, z: 0 });
		});
	});

	it("starts every ring of a note at its phase, the sub-slices' too", () => {
		const galley = galleyOf(galleyText);
		const at = (phase: number) => new FlatLayouts().branches(galley.nodes, 2.5, size, () => phase);
		const [first] = at(2);
		expect(first!.dir.x).toBeCloseTo(Math.cos(2));
		expect(first!.dir.z).toBeCloseTo(Math.sin(2));
		const sub = at(2).flatMap((b) => b.lines.filter((l) => l.members.length > 0))[0]!;
		expect(sub.dir!.x).toBeCloseTo(Math.cos(2));
		expect(at(2).map((b) => b.dir)).toEqual(at(2).map((b) => b.dir));
	});

	it("gives a note's branches their ring, stable under edits that don't change the branch set", () => {
		const dirsOf = (text: string, others = ""): Vec3[] => {
			const notes = [{ tree: new OsmosisParser().parse(text, "Galley.md"), cache: null }];
			if (others !== "") notes.push({ tree: new OsmosisParser().parse(others, "Other.md"), cache: null });
			const graph = buildGraph(notes, () => null);
			return new FlatLayouts().branches(graph.nodes, 2, size).filter((b) => b.core === noteNodeId("Galley.md")).map((b) => b.dir);
		};
		const dirs = dirsOf(galleyText);
		expect(dirs.length).toBe(9);
		// Sized by lines: Part 1 (18 items) has a wider share than Part 3 (4 items, 3-deep), on both sides.
		const angles = dirs.map(angleOf);
		expect(angles[0]).toBe(0);
		expect(angles[1]! - angles[0]!).toBeGreaterThan(angles[3]! - angles[2]!);
		// Another note loaded, a line's text edited: the same ring.
		expect(dirsOf(galleyText, "# Other\n\n## A\n\n- one\n- two\n")).toEqual(dirs);
		expect(dirsOf(galleyText.replace("flour 3", "strong white flour, two bags 3"))).toEqual(dirs);
		// A line added to a branch changes the branch set, and so the ring.
		expect(dirsOf(galleyText.replace("- flour 3", "- flour 3\n- yeast"))).not.toEqual(dirs);
	});

	it("puts each sub-slice, part-way, at the direction it takes a depth down, where it roots a branch: the ramp eases from one ring to the next", () => {
		const galley = galleyOf(galleyText);
		const layouts = new FlatLayouts();
		const below = new Map(layouts.branches(galley.nodes, 3, size).map((b) => [b.root, b.dir]));
		const subs = layouts.branches(galley.nodes, 2.5, size).flatMap((b) => b.lines.filter((l) => l.members.length > 0));
		expect(subs.length).toBe(below.size);
		for (const line of subs) expect(line.dir).toEqual(below.get(line.id));
	});

	it("eases the hold in over the slider's first depth", () => {
		const galley = galleyOf("# Galley\n\n## A\n\n- one\n\t- two\n\t\t- three\n\t\t\t- four\n");
		expect(new FlatLayouts().branches(galley.nodes, 4.75, size)[0]!.hold).toBeCloseTo(0.25);
		expect(new FlatLayouts().branches(galley.nodes, 4, size)[0]!.hold).toBe(1);
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
	/** A slice's plane normal: across its ring direction, level. */
	const normalOf = (dir: Vec3): Vec3 => ({ x: -dir.z, y: 0, z: dir.x });

	it("lays a branch out in its slice: the half-plane through the core holding world up and its ring direction, deeper further out, document order down", () => {
		const [crew] = new FlatLayouts().branches(model.nodes, 2, size);
		const bodies = new Map<string, Body>([[CORE, { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0 }], [crew!.root, { x: 30, y: 10, z: 40, vx: 0, vy: 0, vz: 0 }]]);
		for (const line of linesOf(crew!)) bodies.set(line.id, { x: 0, y: 0, z: 0 });
		flattenStep([crew!], (key) => bodies.get(key), 0.6, 1);
		const root = bodies.get(crew!.root)!;
		const [u, n] = [crew!.dir, normalOf(crew!.dir)];
		// The root is held in its slice, at the height and distance out forces gave it.
		expect(dot(at(root), n)).toBeCloseTo(0);
		expect(dot(at(root), u)).toBeGreaterThan(0);
		expect(root.y).toBeCloseTo(10);
		for (const line of linesOf(crew!)) {
			const body = bodies.get(line.id)!;
			expect(dot(at(body), n)).toBeCloseTo(0);
			// Its outward offset is its 2D layout's left-to-right; its 2D top-to-bottom runs down the world.
			expect(dot(minus(body, root), u)).toBeCloseTo(line.dx);
			expect(root.y! - body.y!).toBeCloseTo(line.dy);
			expect(body).toMatchObject({ vx: 0, vy: 0, vz: 0 });
		}
		expect(at(bodies.get(id("One"))!).y).toBeGreaterThan(at(bodies.get(id("Three"))!).y);
	});

	it("keeps a root on its own side of the vertical axis", () => {
		const [crew] = new FlatLayouts().branches(model.nodes, 2, size);
		const bodies = new Map<string, Body>([[CORE, { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0 }], [crew!.root, { x: -30, y: 0, z: 0, vx: -5, vy: 0, vz: 0 }]]);
		flattenStep([crew!], (key) => bodies.get(key), 0.6, 1);
		const root = bodies.get(crew!.root)!;
		expect(root.x! + root.vx! * 0.6).toBeCloseTo(0);
		expect(root.vx).toBeCloseTo(0);
	});

	it("hands an edge's pull on rigid lines to the root, averaged; leaves a pinned line, and lays out round a pinned root", () => {
		const branch: FlatBranch = {
			root: "r",
			core: "c",
			weight: 1,
			dir: X,
			hold: 1,
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
		flattenStep([branch], (key) => bodies[key], 0.6, 1);
		// Only the free line's pull counts, and it runs along the slice, so the hold keeps it.
		expect(bodies.r!.vx).toBeCloseTo(2);
		expect(bodies.p).toMatchObject({ x: 5, y: 5, z: 5 });

		const pinned: Record<string, Body> = { c: bodies.c!, r: { x: 0, y: 0, z: 10, fx: 0, fy: 0, fz: 10 }, m: { x: 0, y: 0, z: 0 }, p: { x: 0, y: 0, z: 0 } };
		flattenStep([branch], (key) => pinned[key], 0.6, 1);
		expect(pinned.r).toMatchObject({ fx: 0, fy: 0, fz: 10 });
		expect(pinned.m).toMatchObject({ x: 30, y: -10, z: 10 });
	});

	it("eases the hold in below 1: a root is pulled towards its slice, not placed in it", () => {
		const branch: FlatBranch = { root: "r", core: "c", weight: 1, dir: X, hold: 0.5, box: NO_BOX, lines: [{ id: "m", dx: 30, dy: 0, reach: 0, rise: 0, box: NO_BOX, members: [] }] };
		const bodies: Record<string, Body> = { c: { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0 }, r: { x: 20, y: 0, z: 10, vx: 0, vy: 0, vz: 0 }, m: { x: 0, y: 0, z: 0 } };
		flattenStep([branch], (key) => bodies[key], 0.6, 0.1);
		const landing = bodies.r!.z! + bodies.r!.vz! * 0.6;
		expect(landing).toBeLessThan(10);
		expect(landing).toBeGreaterThan(0);
	});

	/** Runs a ramp line pulled along its slice by a steady outside force to rest, and returns how far it rests from its slot. */
	function rampRest(weight: number): number {
		const branch: FlatBranch = {
			root: "r",
			core: "c",
			weight,
			dir: { x: 0, y: 0, z: 1 },
			hold: 1,
			box: { x0: -1, x1: 31, y0: -1, y1: 1, ty0: -1, ty1: 1, t: 1 },
			lines: [{ id: "a", dx: 30, dy: 0, reach: 1, rise: 1, box: { x0: -1, x1: 21, y0: -1, y1: 1, ty0: -1, ty1: 1, t: 1 }, members: [{ id: "a1", dx: 20, dy: 0, reach: 1, rise: 1 }] }],
		};
		const bodies: Record<string, Body> = {
			c: { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0 },
			r: { x: 0, y: 0, z: 50, fx: 0, fy: 0, fz: 50 },
			a: { x: 0, y: 0, z: 80, vx: 0, vy: 0, vz: 0 },
			a1: { x: 0, y: 0, z: 0 },
		};
		const a = bodies.a!;
		for (let tick = 0, alpha = 1; tick < 400; tick++, alpha *= 0.98) {
			a.vy! += alpha * 2; // a steady pull up the slice, alpha-scaled like any d3 force
			flattenStep([branch], (key) => bodies[key], 0.6, alpha);
			a.x! += (a.vx! *= 0.6);
			a.y! += (a.vy! *= 0.6);
			a.z! += (a.vz! *= 0.6);
		}
		const slot = { x: 0, y: 0, z: 80 };
		// The ramp line stays in its slice, and its piece stays rigid with it.
		expect(a.x).toBeCloseTo(0);
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

	/** Runs a note's branches to rest from roots crowded on one side of the core, each held about 40 out by a hierarchy link. */
	function settle(branches: readonly FlatBranch[], core: string, roots: (b: number) => Vec3 = () => ({ x: 40, y: 0, z: 0 })): Map<string, Body> {
		const bodies = new Map<string, Body>([[core, { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0 }]]);
		let seed = 1;
		const random = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
		branches.forEach((branch, b) => {
			const p = roots(b);
			bodies.set(branch.root, { x: p.x + random(), y: p.y + random(), z: p.z + random(), vx: 0, vy: 0, vz: 0 });
			for (const line of linesOf(branch)) bodies.set(line.id, { x: 0, y: 0, z: 0 });
		});
		for (let tick = 0, alpha = 1; tick < 300; tick++, alpha *= 0.977) {
			for (const branch of branches) {
				const root = bodies.get(branch.root)!;
				const r = Math.hypot(root.x!, root.y!, root.z!);
				const k = (alpha * 0.3 * (40 - r)) / r;
				[root.vx, root.vy, root.vz] = [root.vx! + root.x! * k, root.vy! + root.y! * k, root.vz! + root.z! * k];
			}
			flattenStep(branches, (key) => bodies.get(key), 0.6, alpha);
			for (const branch of branches) {
				const root = bodies.get(branch.root)!;
				root.x! += (root.vx! *= 0.6);
				root.y! += (root.vy! *= 0.6);
				root.z! += (root.vz! *= 0.6);
			}
		}
		return bodies;
	}

	it("keeps sibling slices of a dense note clear of each other: no plate of one cuts into another's", () => {
		const galley = galleyOf(galleyText);
		const sizeOf = (node: { label: string }) => ({ width: Math.min(57, node.label.length * 1.5 + 2), height: 5 });
		const branches = new FlatLayouts().branches(galley.nodes, 2, sizeOf);
		const reachOf = new Map(galley.nodes.map((node) => [node.id, Math.max(sizeOf(node).width, 5) / 2]));
		expect(branches.length).toBeGreaterThanOrEqual(9);
		const bodies = settle(branches, noteNodeId("Galley.md"));
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
		// And each slice is still its ring's half-plane through the core, its lines further out than its root.
		for (const branch of branches) {
			const root = bodies.get(branch.root)!;
			for (const key of [branch.root, ...linesOf(branch).map((l) => l.id)]) expect(Math.abs(dot(at(bodies.get(key)!), normalOf(branch.dir)))).toBeLessThan(1e-6);
			for (const line of linesOf(branch)) expect(dot(minus(bodies.get(line.id)!, root), branch.dir)).toBeGreaterThan(0);
		}
	});

	it("keeps siblings of tall and wide plates from covering each other face-on, even with the root straight above its core", () => {
		// Feedback round 2: a slice running top to bottom laid its rows across the screen, spaced by heights, under plates far wider than tall.
		const text = "# Snippets\n\n## Loops\n\n- panel for loop\n- a short line\n- panel while loop\n\t- panel do while\n\t- the body runs at least once\n- panel recursion\n- ends\n\n## Strings\n\n- panel template literal\n- slice\n";
		const graph = galleyOf(text);
		const sizeOf = (node: { label: string }) => (node.label.startsWith("panel") ? { width: 35, height: 30 } : { width: Math.min(35, node.label.length * 1.5 + 2), height: 5 });
		const branches = new FlatLayouts().branches(graph.nodes, 2, sizeOf);
		expect(branches.length).toBe(2);
		const bodies = settle(branches, noteNodeId("Galley.md"), () => ({ x: 0, y: 40, z: 0 }));
		const sizeById = new Map(graph.nodes.map((node) => [node.id, sizeOf(node)]));
		let covered = 0;
		for (const branch of branches) {
			// Face-on to the slice, level: a plate spans its width along the ring direction and its height up.
			const keys = [branch.root, ...linesOf(branch).map((l) => l.id)];
			for (let i = 0; i < keys.length; i++) {
				for (let j = i + 1; j < keys.length; j++) {
					const [a, b] = [sizeById.get(keys[i]!)!, sizeById.get(keys[j]!)!];
					const d = minus(bodies.get(keys[i]!)!, bodies.get(keys[j]!)!);
					if (Math.abs(dot(d, branch.dir)) < (a.width + b.width) / 2 - 1e-6 && Math.abs(d.y) < (a.height + b.height) / 2 - 1e-6) covered++;
				}
			}
		}
		expect(covered).toBe(0);
	});
});

describe("FlatLayouts.branches with Node spacing", () => {
	const at = (spacing?: number): FlatBranch => (spacing === undefined ? new FlatLayouts().branches(model.nodes, 2, size) : new FlatLayouts().branches(model.nodes, 2, size, () => 0, spacing))[0]!;

	it("is exactly today's layout at x1", () => {
		expect(at(1)).toEqual(at());
		const [one, two] = at().lines;
		// Parent half-width, the hierarchy edge's 18, the child's half-width; siblings a plate and 1.5 apart.
		expect(one!.dx).toBe(10 + 18 + 10);
		expect(two!.dy - one!.dy).toBeCloseTo(5 + 1.5, 9);
	});

	it("scales the gaps between plates, never the plates, and the slice grows with it", () => {
		let last = 0;
		for (const spacing of [0.5, 1, 2, 3]) {
			const crew = at(spacing);
			const [one, two] = crew.lines;
			expect(one!.dx).toBeCloseTo(20 + 18 * spacing, 9);
			expect(two!.dy - one!.dy).toBeCloseTo(5 + 1.5 * spacing, 9);
			expect(one!.reach).toBe(10);
			expect(crew.box.x1).toBeGreaterThan(last);
			last = crew.box.x1;
		}
	});

	it("re-cuts a layouts cache that was made at another spacing", () => {
		const layouts = new FlatLayouts();
		const before = layouts.branches(model.nodes, 2, size, () => 0, 1)[0]!.lines[0]!.dx;
		const after = layouts.branches(model.nodes, 2, size, () => 0, 2)[0]!.lines[0]!.dx;
		expect(after).toBeGreaterThan(before);
		expect(layouts.branches(model.nodes, 2, size, () => 0, 1)[0]!.lines[0]!.dx).toBe(before);
	});
});
