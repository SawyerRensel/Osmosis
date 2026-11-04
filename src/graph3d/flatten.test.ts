import { describe, it, expect } from "vitest";
import { OsmosisParser } from "../parser";
import { buildGraph, noteNodeId } from "./model";
import { branchOf, branchPlane, FlatLayouts, flatCharges, flatDepth, flattenStep, sameBranch, type Body, type FlatBranch } from "./flatten";

const note = "# Passage plan\n\nIntro line\n\n## Crew\n\n1. One\n2. Two\n3. Three\n\t- Sub\n\n## Gear\n\n- Rope\n";
const model = buildGraph([{ tree: new OsmosisParser().parse(note, "Passage.md"), cache: null }], () => null);
const id = (text: string): string => model.nodes.find((n) => n.kind === "line" && n.label === text)!.id;
const size = () => ({ width: 20, height: 5 });
const CORE = noteNodeId("Passage.md");

describe("flatDepth", () => {
	it("is off at the far left, then runs from depth 4 to 1 at the far right", () => {
		expect(flatDepth(0)).toBe(Infinity);
		expect(flatDepth(0.25)).toBe(4);
		expect(flatDepth(0.5)).toBe(3);
		expect(flatDepth(0.75)).toBe(2);
		expect(flatDepth(1)).toBe(1);
		expect(flatDepth(Number.NaN)).toBe(Infinity);
	});
});

describe("FlatLayouts.branches", () => {
	const layouts = new FlatLayouts();

	it("is empty when nothing is flat", () => {
		expect(layouts.branches(model.nodes, Infinity, size)).toEqual([]);
	});

	it("roots a branch at each line of the flat depth that has children, with everything under it as members", () => {
		const branches = layouts.branches(model.nodes, 2, size);
		expect(branches.map((b) => b.root)).toEqual([id("Crew"), id("Gear")]);
		expect(branches[0]!.core).toBe(CORE);
		expect(branches[0]!.members.map((m) => m.id)).toEqual([id("One"), id("Two"), id("Three"), id("Sub")]);
		expect(branches[1]!.members.map((m) => m.id)).toEqual([id("Rope")]);
	});

	it("lays a branch out as the mind map does: children right of their parent, top to bottom in document order", () => {
		const [crew] = layouts.branches(model.nodes, 2, size);
		const at = new Map(crew!.members.map((m) => [m.id, m]));
		const [one, two, three, sub] = [at.get(id("One"))!, at.get(id("Two"))!, at.get(id("Three"))!, at.get(id("Sub"))!];
		expect(one.dx).toBeGreaterThan(20);
		expect(two.dx).toBe(one.dx);
		expect(one.dy).toBeLessThan(two.dy);
		expect(two.dy).toBeLessThan(three.dy);
		expect(sub.dx).toBeGreaterThan(three.dx);
		// Plate-sized rows: siblings are a plate apart and a little more, not map pixels.
		expect(two.dy - one.dy).toBeGreaterThan(5);
		expect(two.dy - one.dy).toBeLessThan(8);
	});

	it("stacks a numbered list of ten 1 to 10, top to bottom", () => {
		const items = Array.from({ length: 10 }, (_, i) => `${i + 1}. Step ${i + 1}`).join("\n");
		const ten = buildGraph([{ tree: new OsmosisParser().parse(`# Plan\n\n## Steps\n\n${items}\n`, "Plan.md"), cache: null }], () => null);
		const [steps] = new FlatLayouts().branches(ten.nodes, 2, size);
		const label = new Map(ten.nodes.map((n) => [n.id, n.label]));
		expect(steps!.members.map((m) => label.get(m.id))).toEqual(Array.from({ length: 10 }, (_, i) => `Step ${i + 1}`));
		steps!.members.forEach((m, i) => {
			if (i > 0) expect(m.dy).toBeGreaterThan(steps!.members[i - 1]!.dy);
		});
		// The list is centred on its heading, as in the mind map.
		expect(steps!.members[0]!.dy).toBeCloseTo(-steps!.members[9]!.dy);
	});

	it("at depth 1 flattens everything under the title into one branch", () => {
		const branches = layouts.branches(model.nodes, 1, size);
		expect(branches.map((b) => b.root)).toEqual([id("Passage plan")]);
		expect(branches[0]!.members).toHaveLength(8);
	});

	it("roots branches only at lines with children, and keeps shallower lines 3D", () => {
		const branches = layouts.branches(model.nodes, 3, size);
		expect(branches.map((b) => b.root)).toEqual([id("Three")]);
		expect(branches[0]!.members.map((m) => m.id)).toEqual([id("Sub")]);
	});

	it("leaves out a branch whose root isn't loaded", () => {
		const without = model.nodes.filter((n) => n.id !== id("Crew"));
		expect(layouts.branches(without, 2, size).map((b) => b.root)).toEqual([id("Gear")]);
	});
});

describe("sameBranch and flatCharges", () => {
	const branches: FlatBranch[] = [
		{ root: "r1", core: "c", members: [{ id: "a", dx: 0, dy: 0 }, { id: "b", dx: 0, dy: 0 }] },
		{ root: "r2", core: "c", members: [{ id: "d", dx: 0, dy: 0 }] },
	];
	const of = branchOf(branches);

	it("tells edges inside a branch from edges leaving it", () => {
		expect(sameBranch(of, "r1", "a")).toBe(true);
		expect(sameBranch(of, "b", "a")).toBe(true);
		expect(sameBranch(of, "a", "d")).toBe(false);
		expect(sameBranch(of, "r1", "c")).toBe(false);
		expect(sameBranch(of, "a", "x")).toBe(false);
		expect(sameBranch(of, "r1", "r1")).toBe(false);
	});

	it("moves members' many-body strength onto their root", () => {
		const strengths = new Map([["r1", -30], ["a", -30], ["b", -30], ["d", -30], ["c", -30]]);
		flatCharges(strengths, branches);
		expect([...strengths]).toEqual([["r1", -90], ["c", -30]]);
	});
});

describe("branchPlane", () => {
	const dot = (a: Body, b: Body): number => a.x! * b.x! + a.y! * b.y! + a.z! * b.z!;

	it("faces away from the core, with world up laid into the plane and right as seen from outside", () => {
		const { right, up } = branchPlane({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 });
		expect(up.x).toBeCloseTo(0);
		expect(up.y).toBeCloseTo(1);
		expect(right.x).toBeCloseTo(1);
		expect(right.z).toBeCloseTo(0);
	});

	it("is orthonormal and keeps up pointing up for a tilted plane", () => {
		const { right, up } = branchPlane({ x: 1, y: 2, z: 3 }, { x: 8, y: 9, z: -4 });
		const n = { x: 7, y: 7, z: -7 };
		expect(dot(right, up)).toBeCloseTo(0);
		expect(dot(right, n)).toBeCloseTo(0);
		expect(dot(up, n)).toBeCloseTo(0);
		expect(dot(up, up)).toBeCloseTo(1);
		expect(up.y).toBeGreaterThan(0);
	});

	it("still has an up when the branch sits straight above its core", () => {
		const { right, up } = branchPlane({ x: 0, y: 0, z: 0 }, { x: 0, y: 10, z: 0 });
		expect(dot(up, up)).toBeCloseTo(1);
		expect(dot(right, right)).toBeCloseTo(1);
		expect(up.y).toBeCloseTo(0);
	});
});

describe("flattenStep", () => {
	const branch: FlatBranch = { root: "r", core: "c", members: [{ id: "m", dx: 30, dy: 10 }, { id: "p", dx: 30, dy: 20 }] };
	const run = (bodies: Record<string, Body>): void => flattenStep([branch], (id) => bodies[id], 0.6);

	it("places members in the plane where the root will be after the tick, with no velocity left", () => {
		const bodies: Record<string, Body> = {
			c: { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0 },
			r: { x: 0, y: 0, z: 10, vx: 0, vy: 0, vz: 1 },
			m: { x: 99, y: 99, z: 99 },
			p: { x: 5, y: 5, z: 5, fx: 5, fy: 5, fz: 5 },
		};
		run(bodies);
		expect(bodies.m).toMatchObject({ x: 30, y: -10, z: 10.6, vx: 0, vy: 0, vz: 0 });
		// A pinned member (settled, or being edited) stays put.
		expect(bodies.p).toMatchObject({ x: 5, y: 5, z: 5 });
	});

	it("hands an edge's pull on a member to the branch root, averaged over the pulled members", () => {
		const bodies: Record<string, Body> = {
			c: { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0 },
			r: { x: 0, y: 0, z: 10, vx: 0, vy: 0, vz: 0 },
			m: { x: 0, y: 0, z: 0, vx: 2, vy: 0, vz: 0 },
			p: { x: 0, y: 0, z: 0, vx: 0, vy: 4, vz: 0 },
		};
		run(bodies);
		expect(bodies.r!.vx).toBeCloseTo(1);
		expect(bodies.r!.vy).toBeCloseTo(2);
	});

	it("leaves a pinned root where it is, and lays its members out around the pin", () => {
		const bodies: Record<string, Body> = {
			c: { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0 },
			r: { x: 0, y: 0, z: 10, fx: 0, fy: 0, fz: 10 },
			m: { x: 0, y: 0, z: 0, vx: 2, vy: 0, vz: 0 },
			p: { x: 0, y: 0, z: 0 },
		};
		run(bodies);
		expect(bodies.r!.vx).toBeUndefined();
		expect(bodies.m).toMatchObject({ x: 30, y: -10, z: 10 });
		expect(bodies.p).toMatchObject({ x: 30, y: -20, z: 10 });
	});
});
