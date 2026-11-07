/**
 * Flat branches: below the flat depth, a note's branches lie flat, laid out
 * as the 2D mind map lays them out (children top to bottom in document
 * order). The note's top and the edges between notes stay 3D. See
 * `vault/Planner/3D Graph - Flatten branches.md`.
 *
 * Each flat branch is a slice through its note's core, like a slice cut
 * through the centre of an apple: the 2D map's left-to-right axis (`u`)
 * points straight away from the core, so the branch root sits nearest the
 * core and deeper lines sit further out, and document order runs along the
 * slice (`v`), across that axis. The slice may twist about its own axis; the
 * twist is turned to keep it clear of its neighbours, and slices that would
 * still cut into each other are pushed apart (no decluttering: placement
 * alone keeps plates apart).
 *
 * The flat depth is continuous. Its whole part picks the branch roots (an
 * ordinary 3D node, at outline depth `floor(F)`: the title is 1, what sits
 * under the title 2, and so on). The root's children are the *ramp* lines.
 * Each carries everything under it rigidly (its sub-slice), and is pulled
 * into its slot in the branch with the ramp weight `flatWeight` (1 − the
 * fraction of `F`): at 1 the ramp lines are rigid members too, and the whole
 * branch is one slice; towards 0 each ramp line is a 3D node whose sub-slice
 * is a slice of its own. So the shape eases from one whole depth to the next
 * with no jump.
 *
 * Rigid lines are moved by `flattenStep`, the last force of each tick, so:
 * - they feel no many-body force, which is what keeps a tick cheap; their
 *   strength goes to their note's core, which pushes other notes with it
 *   (`flatCharges`, `notePush`);
 * - edges inside a rigid piece don't pull (`flatLinkScale`);
 * - an edge from a rigid line to anything else pulls its piece through the
 *   piece's free head (a ramp line, or the root), so links between notes
 *   still pull in 3D without bending a slice.
 *
 * Pure: no `obsidian` import, so it is unit-tested directly.
 */

import { computeLayout, type LayoutNode } from "../layout";
import type { OsmosisNode } from "../types";
import { edgeDistance } from "./appearance";
import type { Vec3 } from "./flight";
import type { GraphNode } from "./model";

/** Flat depths the slider reaches: at its far left nothing is flat, then from depth `FLAT_DEPTH_RANGE + 1` down to 1 at its far right. */
export const FLAT_DEPTH_RANGE = 4;

/**
 * The flat depth for a flatten slider position (0–1), continuous: off
 * (Infinity) at 0, then from `FLAT_DEPTH_RANGE + 1` just right of it down to
 * 1 at the far right, where everything under a note's title is flat.
 */
export function flatDepth(flatten: number): number {
	if (!(flatten > 0)) return Infinity;
	return 1 + (1 - Math.min(1, flatten)) * FLAT_DEPTH_RANGE;
}

/** How far a line at outline depth `depth` is pulled into its slice at flat depth `flat`: 0 (3D) to 1 (flat). */
export function flatWeight(depth: number, flat: number): number {
	return Math.min(1, Math.max(0, depth - flat));
}

/** A rigid line of a flat branch: its offset in the 2D layout (`dx` outward, `dy` along the slice in document order), its reach (half its larger side) for keeping slices apart, and half its height. */
export interface FlatMember {
	id: string;
	dx: number;
	dy: number;
	reach: number;
	rise: number;
}

/**
 * A slice's footprint in its own coordinates (outward, along) and its half
 * thickness: it holds every plate's reach, since plates turn to face the
 * camera. `ty0`–`ty1` is the tighter span along the slice that holds only
 * the plates' heights, as the 2D layout spaces its rows.
 */
export interface FlatBox {
	x0: number;
	x1: number;
	y0: number;
	y1: number;
	ty0: number;
	ty1: number;
	t: number;
}

/** A ramp line: a child of a branch root, at its slot in the branch, carrying every line under it (offsets from the ramp line) and their footprint. */
export interface FlatLine extends FlatMember {
	members: FlatMember[];
	box: FlatBox;
}

/** One flat branch: its root (a 3D node), its note's core, the ramp weight, and its ramp lines in document order, with the whole branch's footprint. */
export interface FlatBranch {
	root: string;
	core: string;
	weight: number;
	lines: FlatLine[];
	box: FlatBox;
}

/** A node's footprint for the flat layout, in world units. */
export type FlatSize = (node: GraphNode) => { width: number; height: number };

/** Gap between a parent and its children in a flat branch: a hierarchy edge's rest length, as in 3D. */
const FLAT_COLUMN_GAP = edgeDistance("hierarchy");
/** Gap between siblings, in world units: about the 2D map's 8 px against its 28 px line, at a 5-unit line plate. */
const FLAT_ROW_GAP = 1.5;

/** Each line's centre and footprint in its note's 2D layout, in world units. */
type NoteLayout = Map<OsmosisNode, { x: number; y: number; reach: number; rise: number }>;

function boxOf(points: readonly { dx: number; dy: number; reach: number; rise: number }[]): FlatBox {
	const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, ty0: Infinity, ty1: -Infinity, t: 0 };
	for (const p of points) {
		box.x0 = Math.min(box.x0, p.dx - p.reach);
		box.x1 = Math.max(box.x1, p.dx + p.reach);
		box.y0 = Math.min(box.y0, p.dy - p.reach);
		box.y1 = Math.max(box.y1, p.dy + p.reach);
		box.ty0 = Math.min(box.ty0, p.dy - p.rise);
		box.ty1 = Math.max(box.ty1, p.dy + p.rise);
		box.t = Math.max(box.t, p.reach);
	}
	return box;
}

/**
 * The 2D mind map's layout of each note, at plate sizes, kept per parse: a
 * note is laid out once whatever the flat depth, since a branch's offsets
 * are the same wherever in the note it is cut. `clear` when plate sizes
 * change (a new font).
 */
export class FlatLayouts {
	private layouts = new WeakMap<OsmosisNode, NoteLayout>();

	clear(): void {
		this.layouts = new WeakMap();
	}

	/**
	 * Every flat branch of `nodes` at flat depth `flat` (`flatDepth`). Only
	 * nodes in `nodes` take part: a line must be there, and so must its root
	 * and core.
	 */
	branches(nodes: readonly GraphNode[], flat: number, sizeOf: FlatSize): FlatBranch[] {
		if (!Number.isFinite(flat)) return [];
		const rootDepth = Math.max(1, Math.floor(flat));
		const weight = flatWeight(rootDepth + 1, flat);
		const idOf = new Map<OsmosisNode, string>();
		const byId = new Map<string, GraphNode>();
		for (const node of nodes) {
			byId.set(node.id, node);
			if (node.kind === "line" && node.source !== undefined) idOf.set(node.source, node.id);
		}
		const branches: FlatBranch[] = [];
		for (const core of nodes) {
			if (core.kind !== "note" || core.source === undefined) continue;
			let layout: NoteLayout | undefined;
			const offset = (node: OsmosisNode, id: string, origin: { x: number; y: number }): FlatMember | null => {
				const at = layout!.get(node);
				return at === undefined ? null : { id, dx: at.x - origin.x, dy: at.y - origin.y, reach: at.reach, rise: at.rise };
			};
			const collect = (parent: OsmosisNode, origin: { x: number; y: number }, into: FlatMember[]): void => {
				for (const child of parent.children) {
					const id = idOf.get(child);
					if (id === undefined) continue;
					const member = offset(child, id, origin);
					if (member !== null) into.push(member);
					collect(child, origin, into);
				}
			};
			const walk = (parent: OsmosisNode, level: number): void => {
				for (const child of parent.children) {
					const id = idOf.get(child);
					if (id === undefined) continue;
					if (level + 1 < rootDepth) {
						walk(child, level + 1);
						continue;
					}
					if (child.children.length === 0) continue;
					layout ??= this.layoutOf(core.source!, (source) => {
						const node = byId.get(idOf.get(source) ?? "");
						return node === undefined ? undefined : sizeOf(node);
					});
					const origin = layout.get(child);
					if (origin === undefined) continue;
					const lines: FlatLine[] = [];
					const points: FlatMember[] = [{ id, dx: 0, dy: 0, reach: origin.reach, rise: origin.rise }];
					for (const grandchild of child.children) {
						const lineId = idOf.get(grandchild);
						if (lineId === undefined) continue;
						const slot = offset(grandchild, lineId, origin);
						if (slot === null) continue;
						const members: FlatMember[] = [];
						collect(grandchild, layout.get(grandchild)!, members);
						lines.push({ ...slot, members, box: boxOf([{ ...slot, dx: 0, dy: 0 }, ...members]) });
						points.push(slot, ...members.map((m) => ({ ...m, dx: m.dx + slot.dx, dy: m.dy + slot.dy })));
					}
					if (lines.length > 0) branches.push({ root: id, core: core.id, weight, lines, box: boxOf(points) });
				}
			};
			walk(core.source, 0);
		}
		return branches;
	}

	private layoutOf(root: OsmosisNode, sizeOf: (source: OsmosisNode) => { width: number; height: number } | undefined): NoteLayout {
		const cached = this.layouts.get(root);
		if (cached !== undefined) return cached;
		const sizes = new Map<string, { width: number; height: number }>();
		const gather = (node: OsmosisNode): void => {
			for (const child of node.children) {
				const size = sizeOf(child);
				if (size !== undefined) sizes.set(child.id, size);
				gather(child);
			}
		};
		gather(root);
		const result = computeLayout(
			{ root, filePath: "", contentHash: "" },
			{
				direction: "left-right",
				balance: "one-side",
				layoutSide: "right",
				topicShape: "rounded-rect",
				horizontalSpacing: FLAT_COLUMN_GAP,
				verticalSpacing: FLAT_ROW_GAP,
				nodePaddingX: 0,
				nodePaddingY: 0,
			},
			undefined,
			sizes,
		);
		const layout: NoteLayout = new Map();
		const centres = (node: LayoutNode): void => {
			const { x, y, width, height } = node.rect;
			layout.set(node.source, { x: x + width / 2, y: y + height / 2, reach: Math.max(width, height) / 2, rise: height / 2 });
			for (const child of node.children) centres(child);
		};
		centres(result.root);
		this.layouts.set(root, layout);
		return layout;
	}
}

/** Where a line of a flat branch sits: its branch's root, the rigid piece it moves with (named by the piece's head), and the branch's ramp weight. */
export interface FlatPlace {
	root: string;
	piece: string;
	weight: number;
}

/** Each root, ramp line and member of `branches`, by ID. */
export function flatIndex(branches: readonly FlatBranch[]): Map<string, FlatPlace> {
	const index = new Map<string, FlatPlace>();
	for (const branch of branches) {
		const { root, weight } = branch;
		index.set(root, { root, piece: root, weight });
		for (const line of branch.lines) {
			// At weight 1 the ramp lines are rigid in the branch, so the whole branch is one piece.
			const piece = weight >= 1 ? root : line.id;
			index.set(line.id, { root, piece, weight });
			for (const member of line.members) index.set(member.id, { root, piece, weight });
		}
	}
	return index;
}

/**
 * How hard an edge pulls, as a share of its usual strength: not at all inside
 * one rigid piece, (1 − the ramp weight) between two pieces of one branch (a
 * ramp line and its root: the pull eases off as the line is pulled into the
 * slice), and fully for every other edge.
 */
export function flatLinkScale(index: ReadonlyMap<string, FlatPlace>, a: string, b: string): number {
	const [pa, pb] = [index.get(a), index.get(b)];
	if (pa === undefined || pb === undefined || pa.root !== pb.root) return 1;
	return pa.piece === pb.piece ? 0 : 1 - pa.weight;
}

/**
 * Take every rigid line out of the many-body force, which is what keeps a
 * tick cheap. A ramp line keeps (1 − weight) of its own strength, so at
 * weight 1 it leaves the force too. What the lines leave behind is returned
 * by core ID, for `notePush`: the note's core pushes other notes with it.
 *
 * Not handed to the roots, as it once was: a root pushing for a whole branch
 * from one point throws its siblings far out (measured: roots 1,100 units
 * from their core on the stress web). Siblings are kept apart by placement
 * (`flattenStep`) instead.
 */
export function flatCharges(strengths: Map<string, number>, branches: readonly FlatBranch[]): Map<string, number> {
	const shares = new Map<string, number>();
	for (const branch of branches) {
		let share = 0;
		for (const line of branch.lines) {
			for (const member of line.members) {
				share += strengths.get(member.id) ?? 0;
				strengths.delete(member.id);
			}
			const own = strengths.get(line.id);
			if (own === undefined) continue;
			share += own * branch.weight;
			if (branch.weight >= 1) strengths.delete(line.id);
			else strengths.set(line.id, own * (1 - branch.weight));
		}
		if (share !== 0) shares.set(branch.core, (shares.get(branch.core) ?? 0) + share);
	}
	return shares;
}

/** A charged node in `notePush`, with the note it belongs to. */
export interface NoteBody {
	body: Body;
	path: string | undefined;
}

/**
 * The many-body push of each note's flat lines (`flatCharges`' shares), from
 * its core, by d3's many-body law (strength × alpha / distance). It moves a
 * whole note at once: every charged node of another note gets the push felt
 * at that note's core, so a note keeps its shape rather than being stretched
 * by the difference across it; a node of no note feels it where it is. A
 * note's own lines don't feel their own share, so a core doesn't blow its
 * own note apart. Seen from outside, a note pushes as hard as all its lines
 * did. Cost: notes × notes, plus one add for each charged node.
 */
export function notePush(cores: ReadonlyMap<string, { body: Body; strength: number }>, charged: readonly NoteBody[], alpha: number): void {
	const sources = [...cores].filter(([, core]) => core.strength !== 0 && core.body.x !== undefined);
	if (sources.length === 0) return;
	const pushAt = (x: number, y: number, z: number, own: string | undefined): Vec3 => {
		const push = { x: 0, y: 0, z: 0 };
		for (const [path, { body, strength }] of sources) {
			if (path === own) continue;
			const [dx, dy, dz] = [x - body.x!, y - body.y!, z - body.z!];
			const k = (-strength * alpha) / Math.max(1, dx * dx + dy * dy + dz * dz);
			push.x += dx * k;
			push.y += dy * k;
			push.z += dz * k;
		}
		return push;
	};
	const byNote = new Map<string, Vec3>();
	for (const [path, { body }] of cores) if (body.x !== undefined) byNote.set(path, pushAt(body.x, body.y!, body.z!, path));
	for (const { body, path } of charged) {
		const push = (path === undefined ? undefined : byNote.get(path)) ?? (body.x === undefined ? null : pushAt(body.x, body.y!, body.z!, path));
		if (push === null) continue;
		body.vx = (body.vx ?? 0) + push.x;
		body.vy = (body.vy ?? 0) + push.y;
		body.vz = (body.vz ?? 0) + push.z;
	}
}

/** A simulated node, as d3 keeps it: position, velocity, and a pinned position when fixed. */
export interface Body {
	x?: number;
	y?: number;
	z?: number;
	vx?: number;
	vy?: number;
	vz?: number;
	fx?: number;
	fy?: number;
	fz?: number;
}

const add = (a: Vec3, b: Vec3, s = 1): Vec3 => ({ x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
function unit(a: Vec3): Vec3 | null {
	const length = Math.hypot(a.x, a.y, a.z);
	return length < 1e-9 ? null : scale(a, 1 / length);
}
/** `a` with its component along unit `n` taken out, as a unit vector (null if nothing is left). */
const across = (a: Vec3, n: Vec3): Vec3 | null => unit(add(a, n, -dot(a, n)));

/** The outward axis from `core` to `origin`: the slice's 2D left-to-right. A slice on top of its core points along world x. */
function outward(core: Vec3, origin: Vec3): Vec3 {
	return unit(sub(origin, core)) ?? { x: 1, y: 0, z: 0 };
}

/** The untwisted "along": world down laid across the outward axis, so document order reads top to bottom (world −z for an axis straight up or down). */
export function uprightAlong(u: Vec3): Vec3 {
	const along = across({ x: 0, y: -1, z: 0 }, u);
	return along !== null && Math.abs(dot(along, { x: 0, y: -1, z: 0 })) > 0.1 ? along : across({ x: 0, y: 0, z: -1 }, u)!;
}

/** Twist: how far a slice turns towards its preferred twist each tick. */
const TWIST_RATE = 0.1;
/** Twist: each slice's twist is weighed every this many ticks, by turns (`flattenStep`). */
const TWIST_STRIDE = 4;
/**
 * Twist: how far round the core (radians) a neighbour still turns a slice;
 * past it, neighbours are too far off to cut into it. In a note of many
 * slices it shrinks to `TWIST_SPACINGS` times their typical spacing, so a
 * slice weighs a couple of dozen neighbours however many there are.
 */
const TWIST_REACH = 0.8;
const TWIST_SPACINGS = 3;
/** Twist: how strongly a slice prefers to stand upright (document order down the screen) against its neighbours' pull. */
const TWIST_UPRIGHT = 0.2;
/** Clash: the share of an overlap between two slices pushed apart each tick (like d3's collide strength). */
const CLASH_STRENGTH = 0.5;
/** Ramp: the cap on how much of the way to its slot a ramp line moves a tick, so a stiff pull near weight 1 stays stable. */
const RAMP_PULL_MAX = 0.5;

/**
 * The twist that keeps a slice with outward axis `u` clearest of its
 * neighbours: the "along" least in line with them on the core's sphere of
 * directions (each neighbour within `reach` weighs about `weight / angle²`,
 * fading to nothing at the reach), leaning upright. It is
 * the least eigenvector of the neighbours' direction tensor, so it turns
 * smoothly as they move. Sign: as `current`.
 */
export function preferredTwist(u: Vec3, neighbours: readonly { u: Vec3; weight: number }[], current: Vec3, reach = TWIST_REACH): Vec3 {
	const reachCos = Math.cos(reach);
	const reachSq = 2 * (1 - reachCos);
	const e2 = uprightAlong(u);
	const e1 = cross(e2, u);
	let [a, b, c, total] = [0, 0, 0, 0];
	for (const n of neighbours) {
		const cos = dot(n.u, u);
		if (cos < reachCos || n.weight <= 0) continue;
		// The neighbour's direction across `u`, as (p, q) on (e1, e2), over its length: a unit tangent, without allocating.
		const across2 = 1 - cos * cos;
		if (across2 < 1e-12) continue;
		const [p, q] = [dot(n.u, e1), dot(n.u, e2)];
		// 2(1 − cos θ) is θ² near 0, and fades to nothing at the reach, so a neighbour coming into it doesn't jolt the twist.
		const w = (n.weight * (1 / Math.max(0.0025, 2 * (1 - cos)) - n.weight / reachSq)) / across2;
		a += w * p * p;
		b += w * p * q;
		c += w * q * q;
		total += w * across2;
	}
	if (total > 0) [a, b, c] = [a / total, b / total, c / total];
	// Leaning upright: a sideways "along" (e1) counts against it like a neighbour there.
	a += TWIST_UPRIGHT;
	const theta = 0.5 * Math.atan2(2 * b, a - c) + Math.PI / 2;
	const best = add(scale(e1, Math.cos(theta)), e2, Math.sin(theta));
	return dot(best, current) < 0 ? scale(best, -1) : best;
}

/** A sub-slice's frame: its own (outward from the core, and its twist) turned towards its branch's by the ramp weight. */
function subFrame(ownU: Vec3, ownV: Vec3, u: Vec3, v: Vec3, weight: number): { u: Vec3; v: Vec3 } {
	const lu = unit(add(scale(ownU, 1 - weight), u, weight)) ?? u;
	return { u: lu, v: across(add(scale(ownV, 1 - weight), v, weight), lu) ?? across(v, lu) ?? uprightAlong(lu) };
}

/** An oriented box: centre, axes and half extents. */
interface Obb {
	centre: Vec3;
	axes: [Vec3, Vec3, Vec3];
	half: [number, number, number];
	radius: number;
}

/** `box` placed at `origin` in the frame `u`, `v`; `margin` 1 holds every plate's reach along the slice, 0 only the plates' heights. */
function obbOf(origin: Vec3, u: Vec3, v: Vec3, box: FlatBox, margin = 1): Obb {
	const [y0, y1] = [box.ty0 + (box.y0 - box.ty0) * margin, box.ty1 + (box.y1 - box.ty1) * margin];
	const [hx, hy] = [(box.x1 - box.x0) / 2, (y1 - y0) / 2];
	const centre = add(add(origin, u, (box.x0 + box.x1) / 2), v, (y0 + y1) / 2);
	return { centre, axes: [u, v, cross(u, v)], half: [hx, hy, box.t], radius: Math.hypot(hx, hy, box.t) };
}

/** How deep two boxes overlap, and along which unit axis (from `a` towards `b`) they part soonest; null if they don't (separating axes). */
export function obbOverlap(a: Obb, b: Obb): { depth: number; axis: Vec3 } | null {
	const d = sub(b.centre, a.centre);
	let best: { depth: number; axis: Vec3 } | null = null;
	const test = (raw: Vec3, isUnit: boolean): boolean => {
		const axis = isUnit ? raw : unit(raw);
		if (axis === null) return true;
		let r = 0;
		for (let i = 0; i < 3; i++) r += a.half[i]! * Math.abs(dot(a.axes[i]!, axis)) + b.half[i]! * Math.abs(dot(b.axes[i]!, axis));
		const along = dot(d, axis);
		const depth = r - Math.abs(along);
		if (depth <= 0) return false;
		if (best === null || depth < best.depth) best = { depth, axis: along < 0 ? scale(axis, -1) : axis };
		return true;
	};
	for (const axis of a.axes) if (!test(axis, true)) return null;
	for (const axis of b.axes) if (!test(axis, true)) return null;
	for (const p of a.axes) for (const q of b.axes) if (!test(cross(p, q), false)) return null;
	return best;
}

/** A slice in one tick: a branch as a whole, or a ramp line's sub-slice. */
interface Slice {
	/** The twist's key: its head's ID. */
	key: string;
	/** Which tick of every `TWIST_STRIDE` its twist is weighed on. */
	turn: number;
	core: string;
	branch: number;
	head: Body;
	free: boolean;
	at: Vec3;
	u: Vec3;
	v: Vec3;
	/** How much it counts against its neighbours: a branch's box is where its ramp lines are heading, so it counts with the ramp weight; a sub-slice's plates are all there, so it counts fully. */
	weight: number;
	box: FlatBox;
	obb?: Obb;
	/** A sub-slice's footprint against its own branch's other sub-slices. */
	kin?: Obb;
}

/** Where a body will be after this tick's integration: its pin, or its position plus its velocity once decayed. */
function nextPosition(body: Body, keep: number): Vec3 | null {
	if (body.x === undefined || body.y === undefined || body.z === undefined) return null;
	if (body.fx !== undefined && body.fy !== undefined && body.fz !== undefined) return { x: body.fx, y: body.fy, z: body.fz };
	return { x: body.x + (body.vx ?? 0) * keep, y: body.y + (body.vy ?? 0) * keep, z: body.z + (body.vz ?? 0) * keep };
}

const isFree = (body: Body): boolean => body.fx === undefined && body.x !== undefined;

/** Hand the pull on a piece's free rigid lines (their velocity: only edges leaving the piece pull) to its free head, averaged over the lines pulled, so ten lines linked to one hub act like one link, not ten. */
function handPull(head: Body, bodies: readonly (readonly (Body | undefined)[])[]): void {
	let [px, py, pz, pulled] = [0, 0, 0, 0];
	for (const group of bodies) {
		for (const body of group) {
			if (body === undefined || !isFree(body)) continue;
			const [vx, vy, vz] = [body.vx ?? 0, body.vy ?? 0, body.vz ?? 0];
			if (vx === 0 && vy === 0 && vz === 0) continue;
			[px, py, pz, pulled] = [px + vx, py + vy, pz + vz, pulled + 1];
		}
	}
	if (pulled === 0 || !isFree(head)) return;
	head.vx = (head.vx ?? 0) + px / pulled;
	head.vy = (head.vy ?? 0) + py / pulled;
	head.vz = (head.vz ?? 0) + pz / pulled;
}

function place(body: Body | undefined, at: Vec3, u: Vec3, v: Vec3, dx: number, dy: number): void {
	if (body === undefined || !isFree(body)) return;
	body.x = at.x + u.x * dx + v.x * dy;
	body.y = at.y + u.y * dx + v.y * dy;
	body.z = at.z + u.z * dx + v.z * dy;
	body.vx = body.vy = body.vz = 0;
}

/**
 * One tick of the flatten force, run after every other force (`alpha` is
 * d3's, `keep` the share of velocity a tick keeps, 1 − its velocity decay).
 * `state` holds each slice's twist from tick to tick; a pinned slice keeps
 * its twist, so a line arriving in it later lands in the same plane.
 *
 * 1. Each piece's pull goes to its free head (`handPull`).
 * 2. Each free slice turns its twist towards `preferredTwist` (a quarter of
 *    them each tick, by turns: a twist moves slowly, and weighing every
 *    neighbour is most of the step's cost in a note of hundreds of slices).
 * 3. Slices of one note that overlap push their heads apart (`obbOverlap`).
 * 4. Each free ramp line below weight 1 is pulled towards its slot, harder
 *    as the weight nears 1; at weight 1 it is placed there.
 * 5. Every free rigid line is placed at its offset in its slice where its
 *    head will be after integration, with no velocity left to carry it off.
 *    A sub-slice's frame turns from its own towards its branch's with the
 *    weight. Pinned lines (settled, or being edited) stay put.
 */
export function flattenStep(
	branches: readonly FlatBranch[],
	bodyOf: (id: string) => Body | undefined,
	keep: number,
	alpha: number,
	state: FlatState,
): void {
	const { twists } = state;
	const turn = state.tick++ % TWIST_STRIDE;
	const slices: Slice[] = [];
	const tops: (Slice | null)[] = [];
	const subs: Slice[][] = [];
	// Each branch's ramp lines and their members' bodies, looked up once a tick.
	const lineBodies: (Body | undefined)[][] = [];
	const memberBodies: (Body | undefined)[][][] = [];
	const twistOf = (key: string, u: Vec3, fallback: () => Vec3 | null): Vec3 => {
		const saved = twists.get(key) ?? fallback();
		return (saved === null ? null : across(saved, u)) ?? uprightAlong(u);
	};
	branches.forEach((branch, b) => {
		const root = bodyOf(branch.root);
		const core = bodyOf(branch.core);
		tops.push(null);
		subs.push([]);
		lineBodies.push([]);
		memberBodies.push([]);
		if (root === undefined || core === undefined) return;
		const lines = branch.lines.map((line) => bodyOf(line.id));
		const members = branch.lines.map((line) => line.members.map((m) => bodyOf(m.id)));
		lineBodies[b] = lines;
		memberBodies[b] = members;
		// 1. Pull.
		if (branch.weight >= 1) handPull(root, [lines, ...members]);
		else lines.forEach((line, i) => line !== undefined && handPull(line, [members[i]!]));
		const at = nextPosition(root, keep);
		const from = nextPosition(core, keep);
		if (at === null || from === null) return;
		const u = outward(from, at);
		const top: Slice = {
			key: branch.root,
			turn: slices.length % TWIST_STRIDE,
			core: branch.core,
			branch: b,
			head: root,
			free: isFree(root),
			at,
			u,
			// A new branch takes its sub-slices' twist, so a ramp eases in rather than flips.
			v: twistOf(branch.root, u, () => unit(branch.lines.reduce((sum, line) => add(sum, twists.get(line.id) ?? { x: 0, y: 0, z: 0 }), { x: 0, y: 0, z: 0 }))),
			weight: branch.weight,
			box: branch.box,
		};
		tops[b] = top;
		slices.push(top);
		if (branch.weight >= 1) return;
		branch.lines.forEach((line, i) => {
			const body = lines[i];
			const lineAt = body === undefined ? null : nextPosition(body, keep);
			if (body === undefined || lineAt === null || line.members.length === 0) return;
			const lu = outward(from, lineAt);
			const slice: Slice = {
				key: line.id,
				turn: slices.length % TWIST_STRIDE,
				core: branch.core,
				branch: b,
				head: body,
				free: isFree(body),
				at: lineAt,
				u: lu,
				v: twistOf(line.id, lu, () => across(top.v, lu)),
				weight: 1,
				box: line.box,
			};
			subs[b]![i] = slice;
			slices.push(slice);
		});
	});

	// Each note's slices, and whether two of them are a branch and one of its own sub-slices (they never meet: one holds the other).
	const byCore = new Map<string, Slice[]>();
	for (const slice of slices) (byCore.get(slice.core) ?? byCore.set(slice.core, []).get(slice.core)!).push(slice);
	const own = (a: Slice, b: Slice): boolean => a.branch === b.branch && (tops[a.branch] === a || tops[b.branch] === b);

	// 2. Twist, against the note's other slices within reach round the core (a sweep along the outward axes' x).
	for (const group of byCore.values()) {
		group.sort((p, q) => p.u.x - q.u.x);
		const reach = Math.min(TWIST_REACH, TWIST_SPACINGS * Math.sqrt((4 * Math.PI) / group.length));
		const chord = 2 * Math.sin(reach / 2);
		const near: { u: Vec3; weight: number }[] = [];
		group.forEach((slice, i) => {
			if (slice.free && slice.turn === turn) {
				near.length = 0;
				for (const step of [-1, 1]) {
					for (let j = i + step; j >= 0 && j < group.length && Math.abs(group[j]!.u.x - slice.u.x) <= chord; j += step) {
						if (!own(slice, group[j]!)) near.push(group[j]!);
					}
				}
				const prefer = preferredTwist(slice.u, near, slice.v, reach);
				slice.v = across(add(slice.v, sub(prefer, slice.v), 1 - (1 - TWIST_RATE) ** TWIST_STRIDE), slice.u) ?? slice.v;
			}
			twists.set(slice.key, slice.v);
		});
	}

	// 3. Clash, between slices of one note whose bounding spheres meet (a sweep along x). A sub-slice's plates
	// lie in its turned frame. Two sub-slices of one branch are being pulled together into its layout, whose
	// rows only keep the plates' heights apart: they clash on a footprint that eases from every plate's reach
	// to that as the weight nears 1, so they can settle into their slots.
	for (const slice of slices) {
		const top = tops[slice.branch]!;
		const w = branches[slice.branch]!.weight;
		const frame = top === slice ? slice : subFrame(slice.u, slice.v, top.u, top.v, w);
		slice.obb = obbOf(slice.at, frame.u, frame.v, slice.box);
		if (top !== slice) slice.kin = obbOf(slice.at, frame.u, frame.v, slice.box, 1 - w);
	}
	for (const group of byCore.values()) {
		group.sort((p, q) => p.obb!.centre.x - p.obb!.radius - (q.obb!.centre.x - q.obb!.radius));
		for (let i = 0; i < group.length; i++) {
			const a = group[i]!;
			for (let j = i + 1; j < group.length; j++) {
				const b = group[j]!;
				if (b.obb!.centre.x - b.obb!.radius > a.obb!.centre.x + a.obb!.radius) break;
				if ((!a.free && !b.free) || own(a, b)) continue;
				const kin = a.branch === b.branch;
				const [oa, ob] = kin ? [a.kin!, b.kin!] : [a.obb!, b.obb!];
				const weight = a.weight * b.weight * (kin ? 1 - branches[a.branch]!.weight : 1);
				if (weight <= 0 || Math.hypot(oa.centre.x - ob.centre.x, oa.centre.y - ob.centre.y, oa.centre.z - ob.centre.z) >= oa.radius + ob.radius) continue;
				const hit = obbOverlap(oa, ob);
				if (hit === null) continue;
				const push = CLASH_STRENGTH * weight * hit.depth;
				const [sa, sb] = a.free && b.free ? [push / 2, push / 2] : a.free ? [push, 0] : [0, push];
				for (const [slice, s] of [[a, -sa], [b, sb]] as const) {
					if (s === 0) continue;
					slice.head.vx = (slice.head.vx ?? 0) + hit.axis.x * s;
					slice.head.vy = (slice.head.vy ?? 0) + hit.axis.y * s;
					slice.head.vz = (slice.head.vz ?? 0) + hit.axis.z * s;
				}
			}
		}
	}

	// 4 and 5. Ramp and placement, against where each head will be now.
	branches.forEach((branch, b) => {
		const top = tops[b];
		if (top === null || top === undefined) return;
		const core = nextPosition(bodyOf(branch.core)!, keep)!;
		const at = nextPosition(top.head, keep)!;
		const u = outward(core, at);
		const v = across(top.v, u) ?? uprightAlong(u);
		const w = branch.weight;
		branch.lines.forEach((line, i) => {
			const body = lineBodies[b]![i];
			const members = memberBodies[b]![i]!;
			const slot = add(add(at, u, line.dx), v, line.dy);
			if (w >= 1) {
				place(body, slot, u, v, 0, 0);
				line.members.forEach((m, j) => place(members[j], slot, u, v, m.dx, m.dy));
				return;
			}
			if (body === undefined) return;
			if (isFree(body)) {
				// An alpha-scaled pull, so it keeps its balance with links and charge as the layout cools; it stiffens towards 1.
				const pull = Math.min(RAMP_PULL_MAX, (alpha * w) / (1 - w));
				const gap = sub(slot, nextPosition(body, keep)!);
				body.vx = (body.vx ?? 0) + gap.x * pull;
				body.vy = (body.vy ?? 0) + gap.y * pull;
				body.vz = (body.vz ?? 0) + gap.z * pull;
			}
			if (line.members.length === 0) return;
			const lineAt = nextPosition(body, keep)!;
			const subSlice = subs[b]![i];
			const ownU = outward(core, lineAt);
			const frame = subFrame(ownU, subSlice !== undefined ? (across(subSlice.v, ownU) ?? v) : v, u, v, w);
			line.members.forEach((m, j) => place(members[j], lineAt, frame.u, frame.v, m.dx, m.dy));
		});
	});
}

/** What `flattenStep` keeps from tick to tick: each slice's twist (its "along", by its head's ID), and a tick count. */
export class FlatState {
	readonly twists = new Map<string, Vec3>();
	tick = 0;

	/** Forget the twists of slices `branches` no longer has (their roots and ramp lines). */
	prune(branches: readonly FlatBranch[]): void {
		const keys = new Set<string>();
		for (const branch of branches) {
			keys.add(branch.root);
			for (const line of branch.lines) keys.add(line.id);
		}
		for (const key of this.twists.keys()) if (!keys.has(key)) this.twists.delete(key);
	}
}
