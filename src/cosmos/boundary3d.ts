/**
 * Boundaries (clouds) in Cosmos: which loaded nodes each boundary wraps,
 * and the mesh it is drawn with. The style is the mind map's (`../boundary.ts`,
 * resolved onto `NodeLook.boundary`); `CosmosBoundaries` draws every mesh in
 * one draw call.
 *
 * - **Hull** (Organic, Flat, and anything not on one planet's surface): the
 *   convex hull of the subtree's plates, each grown by the padding as a short
 *   rounded cylinder about world vertical (a billboard plate turns about it as
 *   the camera orbits). Smooth vertex normals, so the shader can draw a soft
 *   rim where the hull turns edge-on.
 * - **Patch** (Planets, a subtree on one planet's surface): the 2D hull of the
 *   plates' corners in an azimuthal equidistant map about the subtree's mean
 *   direction (as `wrapPoint` maps continents), rounded by the padding, then
 *   wrapped back onto the sphere in rings, so it hugs the surface. Its
 *   vertices carry their distance in from the outline and the arc length
 *   along it, for the border and its dashes.
 *
 * Imports `three` math (the hull), so only the lazily loaded scene may import it.
 */

import { Vector3 } from "three";
import { ConvexHull } from "three/examples/jsm/math/ConvexHull.js";
import { convexHull, type Point } from "../boundary";
import type { Vec3 } from "./flight";
import { tangentFrame, wrapPoint } from "./planets";

/** A plate a boundary wraps: its centre and world size; on a planet, its text-right and text-up. */
export interface BoundaryPlate extends Vec3 {
	width: number;
	height: number;
	right?: Vec3;
	up?: Vec3;
}

/** A boundary's mesh. `edge` is −1 at every hull vertex (no outline distance), else the distance in from the patch outline. */
export interface BoundaryMesh {
	positions: number[];
	normals: number[];
	index: number[];
	edge: number[];
	arc: number[];
}

export interface BoundaryGroup {
	/** The node that has the boundary. */
	id: string;
	/** It and every loaded node under it in the outline. */
	members: string[];
	/** Boundaries above it: an outer boundary has a smaller one. */
	depth: number;
	/** Levels of boundary nested inside it (0 = none): it is padded once more for each. */
	nest: number;
}

/**
 * The boundary of every loaded node `has` picks, with what it wraps, walking
 * the outline (hierarchy edges, parent → child; an edge with an end not in
 * `ids` is ignored, and only a node's first parent counts). Sorted outer
 * first: drawn in this order, an inner boundary lies over the one around it.
 */
export function boundaryGroups(ids: readonly string[], hierarchy: readonly { source: string; target: string }[], has: (id: string) => boolean): BoundaryGroup[] {
	const live = new Set(ids);
	const parent = new Map<string, string>();
	const children = new Map<string, string[]>();
	for (const { source, target } of hierarchy) {
		if (!live.has(source) || !live.has(target) || source === target || parent.has(target)) continue;
		parent.set(target, source);
		const list = children.get(source);
		if (list === undefined) children.set(source, [target]);
		else list.push(target);
	}
	const below = new Map<string, number>();
	const nestBelow = (id: string, seen: Set<string>): number => {
		const known = below.get(id);
		if (known !== undefined) return known;
		seen.add(id);
		let most = 0;
		for (const child of children.get(id) ?? []) {
			if (seen.has(child)) continue;
			const inner = nestBelow(child, seen);
			most = Math.max(most, has(child) ? inner + 1 : inner);
		}
		below.set(id, most);
		return most;
	};
	const out: BoundaryGroup[] = [];
	for (const id of ids) {
		if (!has(id)) continue;
		const members: string[] = [];
		const seen = new Set<string>();
		const stack = [id];
		while (stack.length > 0) {
			const next = stack.pop()!;
			if (seen.has(next)) continue;
			seen.add(next);
			members.push(next);
			stack.push(...(children.get(next) ?? []));
		}
		let depth = 0;
		const up = new Set<string>([id]);
		for (let p = parent.get(id); p !== undefined && !up.has(p); p = parent.get(p)) {
			up.add(p);
			if (has(p)) depth++;
		}
		out.push({ id, members, depth, nest: nestBelow(id, new Set()) });
	}
	return out.sort((a, b) => a.depth - b.depth);
}

/** Directions round world vertical each plate's cylinder is sampled at. */
const HULL_AZIMUTHS = 8;

/**
 * The hull mesh round `plates`, each at least `padding` clear sideways and
 * above and below (a rounded cylinder about world vertical: the plate's
 * half-width plus padding across, its half-height plus padding up and down;
 * a wide plate's reaches a little further, so its corners stay inside between
 * the samples). Empty for no plates.
 */
export function hullMesh(plates: readonly BoundaryPlate[], padding: number): BoundaryMesh {
	const mesh: BoundaryMesh = { positions: [], normals: [], index: [], edge: [], arc: [] };
	if (plates.length === 0) return mesh;
	const points: Vector3[] = [];
	// (up, across) of each ring, from the plate's half-height and half-width: square edges cut back, so the cylinder reads rounded.
	// A ring's sides fall short of its samples by cos(π / HULL_AZIMUTHS), so a wide plate (a big panel's footprint) turned between two samples would poke through them: a ring reaches out until its sides lie no more than half the padding inside it. A small plate's rings are as they were.
	const reach = (r: number): number => Math.max(r, (r - padding / 2) / Math.cos(Math.PI / HULL_AZIMUTHS));
	const rings = (h: number, w: number): [number, number][] => [
		[h, reach(w + padding)],
		[h + padding * 0.7, reach(w + padding * 0.7)],
		[h + padding, reach(w)],
	];
	for (const plate of plates) {
		for (const [dy, r] of rings(plate.height / 2, plate.width / 2)) {
			for (let k = 0; k < HULL_AZIMUTHS; k++) {
				const a = ((k + 0.5) / HULL_AZIMUTHS) * Math.PI * 2;
				const [dx, dz] = [Math.cos(a) * r, Math.sin(a) * r];
				points.push(new Vector3(plate.x + dx, plate.y + dy, plate.z + dz), new Vector3(plate.x + dx, plate.y - dy, plate.z + dz));
			}
		}
	}
	const hull = new ConvexHull().setFromPoints(points);
	const indexOf = new Map<Vector3, number>();
	const normals: Vector3[] = [];
	for (const face of hull.faces) {
		let edge = face.edge;
		const corners: number[] = [];
		do {
			const point = edge.head().point;
			let i = indexOf.get(point);
			if (i === undefined) {
				i = normals.length;
				indexOf.set(point, i);
				normals.push(new Vector3());
				mesh.positions.push(point.x, point.y, point.z);
				mesh.edge.push(-1);
				mesh.arc.push(0);
			}
			// Area-weighted: a sliver face barely bends the normal.
			normals[i]!.addScaledVector(face.normal, face.area);
			corners.push(i);
			edge = edge.next;
		} while (edge !== face.edge);
		for (let k = 1; k + 1 < corners.length; k++) mesh.index.push(corners[0]!, corners[k]!, corners[k + 1]!);
	}
	for (const n of normals) {
		n.normalize();
		mesh.normals.push(n.x, n.y, n.z);
	}
	return mesh;
}

/** Points round each map corner, rounding the patch's outline by the padding. */
const ROUND_STEPS = 8;
/** Inner rings between the inset ring and the centre, so a wide patch bends with the sphere. */
const INNER_RINGS = [0.66, 0.33];

const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const sub = (a: Vec3, b: Vec3): Vec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
const addScaled = (a: Vec3, b: Vec3, s: number): Vec3 => v3(a.x + b.x * s, a.y + b.y * s, a.z + b.z * s);
const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);

/**
 * The patch mesh under `plates` on the sphere of `radius` round `centre`:
 * at least `padding` clear of every plate corner along the surface, rounded,
 * outline segments no longer than a tenth of the radius. `inset` is how far
 * in from the outline the second ring lies (the border's room); vertices
 * there and further in carry `edge` = `inset`. Empty for no plates.
 */
export function patchMesh(plates: readonly BoundaryPlate[], centre: Vec3, radius: number, padding: number, inset: number): BoundaryMesh {
	const mesh: BoundaryMesh = { positions: [], normals: [], index: [], edge: [], arc: [] };
	if (plates.length === 0 || radius <= 0) return mesh;
	// The subtree's mean direction from the core is the map's centre.
	let mean = v3(0, 0, 0);
	for (const p of plates) {
		const d = sub(p, centre);
		mean = addScaled(mean, d, 1 / Math.max(len(d), 1e-9));
	}
	if (len(mean) < 1e-9) mean = sub(plates[0]!, centre);
	const axis = addScaled(v3(0, 0, 0), mean, 1 / Math.max(len(mean), 1e-9));
	const frame = tangentFrame(axis);
	// Azimuthal equidistant, as `wrapPoint` (x right, y down): the inverse of wrapping.
	const project = (q: Vec3): Point => {
		const d = sub(q, centre);
		const u = addScaled(v3(0, 0, 0), d, 1 / Math.max(len(d), 1e-9));
		const c = Math.min(1, Math.max(-1, dot(u, axis)));
		const t = addScaled(u, axis, -c);
		const tl = len(t);
		if (tl < 1e-9) return { x: 0, y: 0 };
		const arc = (radius * Math.atan2(tl, c)) / tl;
		return { x: arc * dot(t, frame.right), y: -arc * dot(t, frame.up) };
	};
	const pts: Point[] = [];
	for (const p of plates) {
		const right = p.right ?? frame.right;
		const up = p.up ?? frame.up;
		for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
			const m = project(addScaled(addScaled(p, right, (sx * p.width) / 2), up, (sy * p.height) / 2));
			for (let k = 0; k < ROUND_STEPS; k++) {
				const a = (k / ROUND_STEPS) * Math.PI * 2;
				pts.push({ x: m.x + Math.cos(a) * padding, y: m.y + Math.sin(a) * padding });
			}
		}
	}
	const hull = convexHull(pts);
	if (hull.length < 3) return mesh;
	// Subdivide long edges, so the outline follows the curve.
	const maxSegment = radius * 0.1;
	const outline: Point[] = [];
	const arcs: number[] = [];
	let run = 0;
	for (let i = 0; i < hull.length; i++) {
		const [a, b] = [hull[i]!, hull[(i + 1) % hull.length]!];
		const length = Math.hypot(b.x - a.x, b.y - a.y);
		const steps = Math.max(1, Math.ceil(length / maxSegment));
		for (let s = 0; s < steps; s++) {
			outline.push({ x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps });
			arcs.push(run + (length * s) / steps);
		}
		run += length;
	}
	const n = outline.length;
	const mid = outline.reduce((acc, p) => ({ x: acc.x + p.x / n, y: acc.y + p.y / n }), { x: 0, y: 0 });
	// The inset ring: each outline point moved `inset` toward the inside along its edges' mean inward normal.
	const inward = (i: number): Point => {
		const [a, b] = [outline[i]!, outline[(i + 1) % n]!];
		let nx = -(b.y - a.y);
		let ny = b.x - a.x;
		const l = Math.hypot(nx, ny) || 1;
		[nx, ny] = [nx / l, ny / l];
		// Point the normal at the centre, whichever way the hull winds.
		if (nx * (mid.x - a.x) + ny * (mid.y - a.y) < 0) [nx, ny] = [-nx, -ny];
		return { x: nx, y: ny };
	};
	const ring1: Point[] = [];
	for (let i = 0; i < n; i++) {
		const [e1, e2] = [inward((i + n - 1) % n), inward(i)];
		let bx = e1.x + e2.x;
		let by = e1.y + e2.y;
		const bl = Math.hypot(bx, by) || 1;
		[bx, by] = [bx / bl, by / bl];
		const p = outline[i]!;
		const toMid = Math.hypot(mid.x - p.x, mid.y - p.y);
		const reach = Math.min(inset / Math.max(bx * e2.x + by * e2.y, 0.3), toMid * 0.9);
		ring1.push({ x: p.x + bx * reach, y: p.y + by * reach });
	}
	const rings: Point[][] = [outline, ring1, ...INNER_RINGS.map((f) => ring1.map((p) => ({ x: mid.x + (p.x - mid.x) * f, y: mid.y + (p.y - mid.y) * f })))];
	const push = (p: Point, edge: number, arc: number): void => {
		const off = wrapPoint(axis, p.x, p.y, radius);
		const r = len(off) || 1;
		mesh.positions.push(centre.x + off.x, centre.y + off.y, centre.z + off.z);
		mesh.normals.push(off.x / r, off.y / r, off.z / r);
		mesh.edge.push(edge);
		mesh.arc.push(arc);
	};
	rings.forEach((ring, k) => ring.forEach((p, i) => push(p, k === 0 ? 0 : inset, arcs[i]!)));
	push(mid, inset, 0);
	for (let k = 0; k + 1 < rings.length; k++) {
		for (let i = 0; i < n; i++) {
			const j = (i + 1) % n;
			const [a, b, c, d] = [k * n + i, k * n + j, (k + 1) * n + j, (k + 1) * n + i];
			mesh.index.push(a, b, c, a, c, d);
		}
	}
	const last = (rings.length - 1) * n;
	const hub = rings.length * n;
	for (let i = 0; i < n; i++) mesh.index.push(last + i, last + ((i + 1) % n), hub);
	return mesh;
}
