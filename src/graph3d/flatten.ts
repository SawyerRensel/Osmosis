/**
 * Flat branches: below the flat depth, a note's branches lie flat, laid out
 * as the 2D mind map lays them out (children top to bottom in document
 * order). The note's top and the edges between notes stay 3D. See
 * `vault/Planner/3D Graph - Flatten branches.md`.
 *
 * Each flat branch is a slice through its note's pivot (its core, or the sole
 * H1 that replaces it: `isNoteRoot`; "core" below means either), like an
 * apple wedge cut top to bottom: the slices of a note stand in a ring round
 * the vertical axis through the core, each at a fixed outward direction
 * (`ringDirections`: shares weighted by size, in document order, the first
 * facing the camera as the note became the focus: `facingPhase`). The 2D
 * map's left-to-right axis (`u`) is that direction, so deeper lines sit
 * further out, and document order runs down the world (`v`), so plates,
 * which billboard upright, are stacked by their heights from every side of
 * the ring. Slices that would still cut into each other are pushed apart
 * within their planes (no decluttering: placement alone keeps plates apart).
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
import { isNoteRoot, type GraphNode } from "./model";

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

/** A ramp line with lines under it: its sub-slice's outward direction in the ring of the next flat depth down, where it roots a branch of its own. */
export interface FlatSubLine extends FlatLine {
	dir?: Vec3;
}

/**
 * One flat branch: its root (a 3D node), its note's core, the ramp weight,
 * its slice's fixed outward direction (`ringDirections`), how firmly its
 * root is held in that slice (`hold`: eases in over the slider's first
 * depth), and its ramp lines in document order, with the whole branch's
 * footprint.
 */
export interface FlatBranch {
	root: string;
	core: string;
	weight: number;
	dir: Vec3;
	hold: number;
	lines: FlatSubLine[];
	box: FlatBox;
}

/**
 * Outward directions for a note's slices, in a ring round world up: each
 * slice's share of the ring is its size over the total, in the order given
 * (document order), the first at angle `phase` (atan2(z, x): 0 is world +x).
 * Angles grow from +x towards +z, which is clockwise seen from above (looking
 * down -y, camera up -z). Neighbours sit half their two shares apart. A pure
 * function of the sizes and the phase, so it changes only when the note's
 * branch set does or its phase is recaptured (`facingPhase`), never per tick.
 */
export function ringDirections(sizes: readonly number[], phase = 0): Vec3[] {
	const total = sizes.reduce((sum, size) => sum + size, 0);
	let angle = phase;
	return sizes.map((size, i) => {
		if (i > 0) angle += (Math.PI * (sizes[i - 1]! + size)) / total;
		return { x: Math.cos(angle), y: 0, z: Math.sin(angle) };
	});
}

/**
 * The ring phase that points a note's first slice at the camera: the angle
 * of the horizontal part of the pivot-to-camera direction. A camera straight
 * above or below the pivot has no horizontal direction, and gets 0 (world +x).
 */
export function facingPhase(camera: Vec3, pivot: Vec3): number {
	const [dx, dz] = [camera.x - pivot.x, camera.z - pivot.z];
	return Math.hypot(dx, dz) < 1e-6 ? 0 : Math.atan2(dz, dx);
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
	/** The Node spacing the cached layouts were made at (`branches`). */
	private nodeSpacing = 1;

	clear(): void {
		this.layouts = new WeakMap();
	}

	/**
	 * Every flat branch of `nodes` at flat depth `flat` (`flatDepth`). Only
	 * nodes in `nodes` take part: a line must be there, and so must its root
	 * and core. `phaseOf` is a note's ring phase (see `ringDirections`).
	 * `nodeSpacing` (the Node spacing slider) scales the gaps between plates
	 * in a slice, never the plates; a new value lays every note out afresh.
	 */
	branches(nodes: readonly GraphNode[], flat: number, sizeOf: FlatSize, phaseOf: (core: GraphNode) => number = () => 0, nodeSpacing = 1): FlatBranch[] {
		if (nodeSpacing !== this.nodeSpacing) {
			this.clear();
			this.nodeSpacing = nodeSpacing;
		}
		if (!Number.isFinite(flat)) return [];
		const rootDepth = Math.max(1, Math.floor(flat));
		const idOf = new Map<OsmosisNode, string>();
		const byId = new Map<string, GraphNode>();
		for (const node of nodes) {
			byId.set(node.id, node);
			if (node.kind === "line" && node.source !== undefined) idOf.set(node.source, node.id);
		}
		const branches: FlatBranch[] = [];
		// Below the slider's first depth every root is held in its slice; over it the hold eases in, so leaving Off doesn't jump.
		const hold = Math.min(1, FLAT_DEPTH_RANGE + 1 - flat);
		for (const core of nodes) {
			if (!isNoteRoot(core) || core.source === undefined) continue;
			// A core's source is the parse root, above the title (depth 1). A sole H1 root is the title itself: it pivots its note's slices and is never a branch root.
			const top = core.source;
			const topDepth = core.kind === "note" ? 0 : 1;
			// So under a sole H1, flat depths below 2 root where depth 2 does, fully flat: the slider never loosens a branch on its way to 1.
			const weight = flatWeight(Math.max(rootDepth, topDepth + 1) + 1, flat);
			const first = branches.length;
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
					layout ??= this.layoutOf(top, (source) => {
						const node = byId.get(idOf.get(source) ?? "");
						return node === undefined ? undefined : sizeOf(node);
					});
					const origin = layout.get(child);
					if (origin === undefined) continue;
					const lines: FlatSubLine[] = [];
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
					if (lines.length > 0) branches.push({ root: id, core: core.id, weight, dir: { x: 1, y: 0, z: 0 }, hold, lines, box: boxOf(points) });
				}
			};
			walk(top, topDepth);
			// The note's ring (each slice weighted by its lines), and the ring its sub-slices would stand in a depth
			// down, where each roots a branch of its own: a sub-slice turns from that to its branch's as the ramp nears 1.
			const own = branches.slice(first);
			const phase = phaseOf(core);
			ringDirections(own.map((branch) => 1 + branch.lines.reduce((n, line) => n + 1 + line.members.length, 0)), phase).forEach((dir, i) => (own[i]!.dir = dir));
			const subs = own.flatMap((branch) => branch.lines.filter((line) => line.members.length > 0));
			ringDirections(subs.map((line) => 1 + line.members.length), phase).forEach((dir, i) => (subs[i]!.dir = dir));
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
				horizontalSpacing: FLAT_COLUMN_GAP * this.nodeSpacing,
				verticalSpacing: FLAT_ROW_GAP * this.nodeSpacing,
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

/** World down: every slice's "along", so document order reads down the screen from every side of the ring. */
const DOWN: Vec3 = { x: 0, y: -1, z: 0 };

/** Clash: the share of an overlap between two slices pushed apart each tick (like d3's collide strength). */
const CLASH_STRENGTH = 0.5;
/** Ramp: the cap on how much of the way to its slot a ramp line moves a tick, so a stiff pull near weight 1 stays stable. */
const RAMP_PULL_MAX = 0.5;

/** A sub-slice's outward direction: its own (in the ring a depth down, where it roots a branch) turned towards its branch's by the ramp weight. */
function subDir(own: Vec3 | undefined, dir: Vec3, weight: number): Vec3 {
	return own === undefined ? dir : (unit(add(scale(own, 1 - weight), dir, weight)) ?? dir);
}

/**
 * Hold a free head in its slice: the half-plane through the core `core`
 * that holds world up and the outward direction `dir`. At `hold` 1 it is
 * placed there (its offset across the plane, and any inward of the vertical
 * axis, taken out of where it will be after integration, with no velocity
 * left across it); below 1 it is pulled there, alpha-scaled as the ramp
 * pulls, so the hold eases in. Its height and its distance out stay free.
 */
function holdInSlice(head: Body, core: Vec3, dir: Vec3, hold: number, keep: number, alpha: number): void {
	if (!isFree(head) || hold <= 0) return;
	const normal = { x: -dir.z, y: 0, z: dir.x };
	const offset = sub(nextPosition(head, keep)!, core);
	const off = dot(offset, normal);
	const inward = Math.min(0, dot(offset, dir));
	if (hold < 1) {
		const pull = Math.min(RAMP_PULL_MAX, (alpha * hold) / (1 - hold)) / keep;
		head.vx = (head.vx ?? 0) - (normal.x * off + dir.x * inward) * pull;
		head.vz = (head.vz ?? 0) - (normal.z * off + dir.z * inward) * pull;
		return;
	}
	const [vn, vd] = [dot({ x: head.vx ?? 0, y: 0, z: head.vz ?? 0 }, normal), inward < 0 ? Math.min(0, dot({ x: head.vx ?? 0, y: 0, z: head.vz ?? 0 }, dir)) : 0];
	head.vx = (head.vx ?? 0) - normal.x * vn - dir.x * vd;
	head.vz = (head.vz ?? 0) - normal.z * vn - dir.z * vd;
	// Where it lands now its velocity no longer crosses the plane.
	const landed = sub(nextPosition(head, keep)!, core);
	const [across, out] = [dot(landed, normal), Math.min(0, dot(landed, dir))];
	head.x! -= normal.x * across + dir.x * out;
	head.z! -= normal.z * across + dir.z * out;
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
	core: string;
	branch: number;
	head: Body;
	free: boolean;
	/** Its outward direction: it is held in the half-plane through the core along it. */
	dir: Vec3;
	/** How much it counts against its neighbours: a branch's box is where its ramp lines are heading, so it counts with the ramp weight; a sub-slice's plates are all there, so it counts fully. */
	weight: number;
	obb: Obb;
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
 * Each slice's frame is fixed: outward along its ring direction, along
 * world down.
 *
 * 1. Each piece's pull goes to its free head (`handPull`).
 * 2. Slices of one note that overlap push their heads apart (`obbOverlap`).
 * 3. Each free ramp line below weight 1 is pulled towards its slot, harder
 *    as the weight nears 1; at weight 1 it is placed there.
 * 4. Each free head (a root, or a ramp line's sub-slice) is held in its
 *    slice's half-plane through the core (`holdInSlice`).
 * 5. Every free rigid line is placed at its offset in its slice where its
 *    head will be after integration, with no velocity left to carry it off.
 *    A sub-slice's direction turns from its own towards its branch's with
 *    the weight. Pinned lines (settled, or being edited) stay put.
 */
export function flattenStep(branches: readonly FlatBranch[], bodyOf: (id: string) => Body | undefined, keep: number, alpha: number): void {
	const slices: Slice[] = [];
	const tops: (Slice | null)[] = [];
	// Each branch's ramp lines and their members' bodies, looked up once a tick.
	const lineBodies: (Body | undefined)[][] = [];
	const memberBodies: (Body | undefined)[][][] = [];
	branches.forEach((branch, b) => {
		const root = bodyOf(branch.root);
		const core = bodyOf(branch.core);
		tops.push(null);
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
		if (at === null || nextPosition(core, keep) === null) return;
		const w = branch.weight;
		const top: Slice = { core: branch.core, branch: b, head: root, free: isFree(root), dir: branch.dir, weight: w, obb: obbOf(at, branch.dir, DOWN, branch.box) };
		tops[b] = top;
		slices.push(top);
		if (w >= 1) return;
		branch.lines.forEach((line, i) => {
			const body = lines[i];
			const lineAt = body === undefined ? null : nextPosition(body, keep);
			if (body === undefined || lineAt === null || line.members.length === 0) return;
			const u = subDir(line.dir, branch.dir, w);
			// Two sub-slices of one branch are being pulled together into its layout, whose rows only keep the plates'
			// heights apart: they clash on a footprint that eases from every plate's reach to that as the weight nears 1.
			slices.push({ core: branch.core, branch: b, head: body, free: isFree(body), dir: u, weight: 1, obb: obbOf(lineAt, u, DOWN, line.box), kin: obbOf(lineAt, u, DOWN, line.box, 1 - w) });
		});
	});

	// 2. Clash, between slices of one note whose bounding spheres meet (a sweep along x). A branch never meets its own sub-slices: one holds the other.
	// A head is held in its slice, so the part of a push across the slice goes outward instead, where the gap to the next slice is wider.
	const byCore = new Map<string, Slice[]>();
	for (const slice of slices) (byCore.get(slice.core) ?? byCore.set(slice.core, []).get(slice.core)!).push(slice);
	const own = (a: Slice, b: Slice): boolean => a.branch === b.branch && (tops[a.branch] === a || tops[b.branch] === b);
	for (const group of byCore.values()) {
		group.sort((p, q) => p.obb.centre.x - p.obb.radius - (q.obb.centre.x - q.obb.radius));
		for (let i = 0; i < group.length; i++) {
			const a = group[i]!;
			for (let j = i + 1; j < group.length; j++) {
				const b = group[j]!;
				if (b.obb.centre.x - b.obb.radius > a.obb.centre.x + a.obb.radius) break;
				if ((!a.free && !b.free) || own(a, b)) continue;
				const kin = a.branch === b.branch;
				const [oa, ob] = kin ? [a.kin!, b.kin!] : [a.obb, b.obb];
				const weight = a.weight * b.weight * (kin ? 1 - branches[a.branch]!.weight : 1);
				if (weight <= 0 || Math.hypot(oa.centre.x - ob.centre.x, oa.centre.y - ob.centre.y, oa.centre.z - ob.centre.z) >= oa.radius + ob.radius) continue;
				const hit = obbOverlap(oa, ob);
				if (hit === null) continue;
				const push = CLASH_STRENGTH * weight * hit.depth;
				const [sa, sb] = a.free && b.free ? [push / 2, push / 2] : a.free ? [push, 0] : [0, push];
				for (const [slice, s] of [[a, -sa], [b, sb]] as const) {
					if (s === 0) continue;
					const { dir } = slice;
					const across = hit.axis.z * dir.x - hit.axis.x * dir.z;
					const out = Math.abs(across * s);
					slice.head.vx = (slice.head.vx ?? 0) + (hit.axis.x + dir.z * across) * s + dir.x * out;
					slice.head.vy = (slice.head.vy ?? 0) + hit.axis.y * s;
					slice.head.vz = (slice.head.vz ?? 0) + (hit.axis.z - dir.x * across) * s + dir.z * out;
				}
			}
		}
	}

	// 3, 4 and 5. Ramp, hold and placement, against where each head will be now.
	branches.forEach((branch, b) => {
		const top = tops[b];
		if (top === null || top === undefined) return;
		const core = nextPosition(bodyOf(branch.core)!, keep)!;
		const { dir: u, weight: w } = branch;
		holdInSlice(top.head, core, u, branch.hold, keep, alpha);
		const at = nextPosition(top.head, keep)!;
		branch.lines.forEach((line, i) => {
			const body = lineBodies[b]![i];
			const members = memberBodies[b]![i]!;
			const slot = add(add(at, u, line.dx), DOWN, line.dy);
			if (w >= 1) {
				place(body, slot, u, DOWN, 0, 0);
				line.members.forEach((m, j) => place(members[j], slot, u, DOWN, m.dx, m.dy));
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
			const lineU = subDir(line.dir, u, w);
			holdInSlice(body, core, lineU, branch.hold, keep, alpha);
			const lineAt = nextPosition(body, keep)!;
			line.members.forEach((m, j) => place(members[j], lineAt, lineU, DOWN, m.dx, m.dy));
		});
	});
}
