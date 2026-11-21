import { describe, expect, it } from "vitest";
import { boundaryGroups, hullMesh, patchMesh, type BoundaryMesh, type BoundaryPlate } from "./boundary3d";
import { FAR_SIDE_DIM, FAR_SIDE_GLSL, farSideKeep, onFarSide, showsText } from "./far-side";
import { wrapPlate, tangentFrame } from "./planets";

describe("far side", () => {
	const at = { x: 0, y: 0, z: 10 };
	const out = { x: 0, y: 0, z: 1 };
	it("is the side facing away, edge-on included", () => {
		expect(onFarSide(at, out, { x: 0, y: 0, z: 50 })).toBe(false);
		expect(onFarSide(at, out, { x: 0, y: 0, z: -50 })).toBe(true);
		// Exactly edge-on (the eye in the plate's plane) counts as far, as the plate shader's `<= 0.0`.
		expect(onFarSide(at, out, { x: 40, y: 0, z: 10 })).toBe(true);
		expect(onFarSide(at, out, { x: 40, y: 0, z: 10.001 })).toBe(false);
	});
	it("keeps 1 − FAR_SIDE_DIM of a far thing, all of a near one", () => {
		expect(farSideKeep(false)).toBe(1);
		expect(farSideKeep(true)).toBeCloseTo(1 - FAR_SIDE_DIM);
		expect(FAR_SIDE_DIM).toBeGreaterThan(0);
		expect(FAR_SIDE_DIM).toBeLessThan(1);
		expect(FAR_SIDE_GLSL).toContain((1 - FAR_SIDE_DIM).toFixed(4));
	});
	it("suppresses text only on a planet plate seen from behind", () => {
		expect(showsText(at, undefined, { x: 0, y: 0, z: -50 })).toBe(true);
		expect(showsText(at, out, { x: 0, y: 0, z: 50 })).toBe(true);
		expect(showsText(at, out, { x: 0, y: 0, z: -50 })).toBe(false);
	});
});

describe("boundaryGroups", () => {
	const ids = ["r", "a", "a1", "a2", "b", "b1"];
	const h = [
		{ source: "r", target: "a" },
		{ source: "a", target: "a1" },
		{ source: "a", target: "a2" },
		{ source: "r", target: "b" },
		{ source: "b", target: "b1" },
	];
	it("wraps the node and its loaded subtree", () => {
		const [g] = boundaryGroups(ids, h, (id) => id === "a");
		expect(g!.members.sort()).toEqual(["a", "a1", "a2"]);
		expect(g!.depth).toBe(0);
		expect(g!.nest).toBe(0);
	});
	it("sorts outer first and counts nesting both ways", () => {
		const groups = boundaryGroups(ids, h, (id) => id === "r" || id === "a" || id === "a1");
		expect(groups.map((g) => g.id)).toEqual(["r", "a", "a1"]);
		expect(groups.map((g) => g.depth)).toEqual([0, 1, 2]);
		expect(groups.map((g) => g.nest)).toEqual([2, 1, 0]);
	});
	it("ignores edges to unloaded nodes and survives a cycle", () => {
		const g = boundaryGroups(["a", "b"], [{ source: "a", target: "b" }, { source: "b", target: "a" }, { source: "a", target: "gone" }], (id) => id === "a");
		expect(g[0]!.members.sort()).toEqual(["a", "b"]);
	});
});

/** Each triangle's plane, outward from the mesh's centroid. */
function planes(mesh: BoundaryMesh): { n: number[]; d: number }[] {
	const p = (i: number) => mesh.positions.slice(i * 3, i * 3 + 3);
	const count = mesh.positions.length / 3;
	const c = [0, 1, 2].map((k) => mesh.positions.filter((_, i) => i % 3 === k).reduce((a, b) => a + b, 0) / count);
	const out: { n: number[]; d: number }[] = [];
	for (let t = 0; t < mesh.index.length; t += 3) {
		const [a, b, d] = [p(mesh.index[t]!), p(mesh.index[t + 1]!), p(mesh.index[t + 2]!)];
		const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
		const v = [d[0]! - a[0]!, d[1]! - a[1]!, d[2]! - a[2]!];
		let n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
		const l = Math.hypot(n[0]!, n[1]!, n[2]!);
		n = n.map((x) => x / l);
		let off = n[0]! * a[0]! + n[1]! * a[1]! + n[2]! * a[2]!;
		if (n[0]! * c[0]! + n[1]! * c[1]! + n[2]! * c[2]! > off) [n, off] = [n.map((x) => -x), -off];
		out.push({ n, d: off });
	}
	return out;
}

describe("hullMesh", () => {
	const plates: BoundaryPlate[] = [
		{ x: 0, y: 0, z: 0, width: 20, height: 5 },
		{ x: 30, y: -10, z: 8, width: 12, height: 5 },
		{ x: 10, y: 15, z: -20, width: 8, height: 5 },
	];
	it("is empty with no plates", () => {
		expect(hullMesh([], 3).index).toEqual([]);
	});
	it("encloses every plate centre with room to spare, with unit normals and no outline distance", () => {
		const mesh = hullMesh(plates, 3);
		expect(mesh.index.length).toBeGreaterThan(0);
		for (const plane of planes(mesh)) {
			for (const p of plates) expect(plane.d - (plane.n[0]! * p.x + plane.n[1]! * p.y + plane.n[2]! * p.z)).toBeGreaterThan(p.height / 2);
		}
		for (let i = 0; i < mesh.normals.length; i += 3) expect(Math.hypot(mesh.normals[i]!, mesh.normals[i + 1]!, mesh.normals[i + 2]!)).toBeCloseTo(1);
		expect(mesh.edge.every((e) => e === -1)).toBe(true);
	});
	it("wraps a lone plate", () => {
		expect(planes(hullMesh([plates[0]!], 2)).length).toBeGreaterThan(8);
	});
});

describe("patchMesh", () => {
	const centre = { x: 100, y: -50, z: 20 };
	const radius = 80;
	// Three plates of one continent, wrapped as the planets layout does.
	const frame = tangentFrame({ x: 0.3, y: 0.4, z: 0.866 });
	const plates: BoundaryPlate[] = [
		[0, 0],
		[25, 10],
		[-10, 30],
	].map(([x, y]) => {
		const w = wrapPlate(frame, x!, y!, radius);
		return { x: centre.x + w.offset.x, y: centre.y + w.offset.y, z: centre.z + w.offset.z, width: 12, height: 4, right: w.right, up: w.up };
	});
	const mesh = patchMesh(plates, centre, radius, 3, 1.5);
	it("lies on the sphere with outward normals", () => {
		expect(mesh.index.length).toBeGreaterThan(0);
		for (let i = 0; i < mesh.positions.length; i += 3) {
			const d = [mesh.positions[i]! - centre.x, mesh.positions[i + 1]! - centre.y, mesh.positions[i + 2]! - centre.z];
			expect(Math.hypot(...d)).toBeCloseTo(radius, 6);
			expect((d[0]! * mesh.normals[i]! + d[1]! * mesh.normals[i + 1]! + d[2]! * mesh.normals[i + 2]!) / radius).toBeCloseTo(1, 6);
		}
	});
	it("keeps its outline clear of every plate centre", () => {
		const outline: number[][] = [];
		mesh.edge.forEach((e, i) => {
			if (e === 0) outline.push(mesh.positions.slice(i * 3, i * 3 + 3));
		});
		expect(outline.length).toBeGreaterThan(8);
		for (const p of plates) {
			const nearest = Math.min(...outline.map((q) => Math.hypot(q[0]! - p.x, q[1]! - p.y, q[2]! - p.z)));
			expect(nearest).toBeGreaterThan(p.height / 2 + 2);
		}
	});
	it("marks outline and interior distances and runs the arc length round the outline", () => {
		expect(new Set(mesh.edge)).toEqual(new Set([0, 1.5]));
		const arcs = mesh.arc.filter((_, i) => mesh.edge[i] === 0);
		for (let i = 1; i < arcs.length; i++) expect(arcs[i]!).toBeGreaterThan(arcs[i - 1]!);
	});
	it("is empty with no plates", () => {
		expect(patchMesh([], centre, radius, 3, 1).index).toEqual([]);
	});
});
