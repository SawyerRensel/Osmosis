/**
 * Flat branches: below the flat depth, a note's branches lie flat, laid out
 * as the 2D mind map lays them out (children top to bottom in document
 * order), in a plane facing outward from the note's core. The note's top and
 * the edges between notes stay 3D. See
 * `vault/Planner/3D Graph - Flatten branches.md`.
 *
 * A flat branch hangs off its root: the deepest line at or above the flat
 * depth (outline depth, counted within the note: its title is 1, what sits
 * under the title 2, and so on). The root is an ordinary 3D node. Every line
 * below it is a member, held rigidly at its 2D-layout offset from the root,
 * in the plane through the root whose normal points from the core to the
 * root. Members are moved by `flattenStep`, the last force of each tick, so:
 * - they feel no many-body force (their root carries their share, see
 *   `flatCharges`), which is what keeps a tick cheap;
 * - edges inside the branch don't pull (`sameBranch`), since the branch is
 *   rigid;
 * - an edge from a member to another note pulls the whole branch through its
 *   root, so links between notes still pull in 3D without bending the plane.
 *
 * Pure: no `obsidian` import, so it is unit-tested directly.
 */

import { computeLayout, type LayoutNode } from "../layout";
import type { OsmosisNode } from "../types";
import { edgeDistance } from "./appearance";
import type { Vec3 } from "./flight";
import type { GraphNode } from "./model";

/** Flat depths the slider reaches: at its far left nothing is flat, then depth `FLAT_DEPTH_RANGE`, …, 1 at its far right. */
export const FLAT_DEPTH_RANGE = 4;

/**
 * The flat depth for a flatten slider position (0–1). Off (Infinity) at 0;
 * then from `FLAT_DEPTH_RANGE` at a quarter of the way down to 1 at the far
 * right, where everything under a note's title is flat.
 */
export function flatDepth(flatten: number): number {
	if (!(flatten > 0)) return Infinity;
	return 1 + (1 - Math.min(1, flatten)) * FLAT_DEPTH_RANGE;
}

/** A line of a flat branch, and where it sits from the branch root's centre in the branch plane: `dx` along the plane's right (parent to child), `dy` down it. */
export interface FlatMember {
	id: string;
	dx: number;
	dy: number;
}

/** One flat branch: its root (a 3D node), the note core its plane faces away from, and its members in document order. */
export interface FlatBranch {
	root: string;
	core: string;
	members: FlatMember[];
}

/** A node's footprint for the flat layout, in world units. */
export type FlatSize = (node: GraphNode) => { width: number; height: number };

/** Gap between a parent and its children in a flat branch: a hierarchy edge's rest length, as in 3D. */
const FLAT_COLUMN_GAP = edgeDistance("hierarchy");
/** Gap between siblings, in world units: about the 2D map's 8 px against its 28 px line, at a 5-unit line plate. */
const FLAT_ROW_GAP = 1.5;

/** Each line's centre in its note's 2D layout, in world units. */
type NoteLayout = Map<OsmosisNode, { x: number; y: number }>;

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
	 * Every flat branch of `nodes` at flat depth `depth`. Only nodes in `nodes`
	 * take part: a member must be there, and so must its root and core.
	 */
	branches(nodes: readonly GraphNode[], depth: number, sizeOf: FlatSize): FlatBranch[] {
		if (!Number.isFinite(depth)) return [];
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
			const collect = (parent: OsmosisNode, origin: { x: number; y: number }, into: FlatMember[]): void => {
				for (const child of parent.children) {
					const id = idOf.get(child);
					if (id === undefined) continue;
					const at = layout!.get(child);
					if (at !== undefined) into.push({ id, dx: at.x - origin.x, dy: at.y - origin.y });
					collect(child, origin, into);
				}
			};
			const walk = (parent: OsmosisNode, level: number): void => {
				for (const child of parent.children) {
					const id = idOf.get(child);
					if (id === undefined) continue;
					// Outline depth runs 1, 2, …: the deepest line at or above the flat depth roots a branch.
					if (level + 1 <= depth && level + 2 > depth && child.children.length > 0) {
						layout ??= this.layoutOf(core.source!, (source) => {
							const node = byId.get(idOf.get(source) ?? "");
							return node === undefined ? undefined : sizeOf(node);
						});
						const origin = layout.get(child);
						if (origin === undefined) continue;
						const members: FlatMember[] = [];
						collect(child, origin, members);
						if (members.length > 0) branches.push({ root: id, core: core.id, members });
					} else if (level + 1 <= depth) {
						walk(child, level + 1);
					}
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
			layout.set(node.source, { x: node.rect.x + node.rect.width / 2, y: node.rect.y + node.rect.height / 2 });
			for (const child of node.children) centres(child);
		};
		centres(result.root);
		this.layouts.set(root, layout);
		return layout;
	}
}

/** Which branch root each member belongs to. */
export function branchOf(branches: readonly FlatBranch[]): Map<string, string> {
	const of = new Map<string, string>();
	for (const branch of branches) for (const member of branch.members) of.set(member.id, branch.root);
	return of;
}

/** Whether an edge runs inside one flat branch (a member to its root or to another member of it): such an edge doesn't pull. */
export function sameBranch(of: ReadonlyMap<string, string>, a: string, b: string): boolean {
	const [ra, rb] = [of.get(a), of.get(b)];
	return (ra !== undefined || rb !== undefined) && (ra ?? a) === (rb ?? b);
}

/**
 * Hand each branch's many-body share to its root: members leave the force,
 * and their root pushes for all of them, as a settled note's core does for
 * its lines (`settle.ts`). Seen from outside, a branch pushes about as hard
 * as before, for the cost of one node.
 */
export function flatCharges(strengths: Map<string, number>, branches: readonly FlatBranch[]): Map<string, number> {
	for (const branch of branches) {
		let share = 0;
		for (const member of branch.members) {
			share += strengths.get(member.id) ?? 0;
			strengths.delete(member.id);
		}
		const root = strengths.get(branch.root);
		if (root !== undefined) strengths.set(branch.root, root + share);
	}
	return strengths;
}

/** The branch plane through `root` facing away from `core`: its right and up, unit vectors. */
export function branchPlane(core: Vec3, root: Vec3): { right: Vec3; up: Vec3 } {
	let n = { x: root.x - core.x, y: root.y - core.y, z: root.z - core.z };
	let length = Math.hypot(n.x, n.y, n.z);
	if (length < 1e-6) {
		n = { x: 0, y: 0, z: 1 };
		length = 1;
	}
	n = { x: n.x / length, y: n.y / length, z: n.z / length };
	// "Up" is world up laid into the plane, so text and order read top to
	// bottom; a plane facing straight up or down takes world -z instead.
	let up = { x: -n.y * n.x, y: 1 - n.y * n.y, z: -n.y * n.z };
	if (Math.hypot(up.x, up.y, up.z) < 0.1) up = { x: n.z * n.x, y: n.z * n.y, z: n.z * n.z - 1 };
	const u = Math.hypot(up.x, up.y, up.z);
	up = { x: up.x / u, y: up.y / u, z: up.z / u };
	// Right as seen from outside, looking back at the core: up × normal.
	const right = { x: up.y * n.z - up.z * n.y, y: up.z * n.x - up.x * n.z, z: up.x * n.y - up.y * n.x };
	return { right, up };
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

/** Where a body will be after this tick's integration: its pin, or its position plus its velocity once decayed. */
function nextPosition(body: Body, keep: number): Vec3 | null {
	if (body.x === undefined || body.y === undefined || body.z === undefined) return null;
	if (body.fx !== undefined && body.fy !== undefined && body.fz !== undefined) return { x: body.fx, y: body.fy, z: body.fz };
	return { x: body.x + (body.vx ?? 0) * keep, y: body.y + (body.vy ?? 0) * keep, z: body.z + (body.vz ?? 0) * keep };
}

/**
 * One tick of the flatten force, run after every other force: each free
 * member's pull this tick (only edges leaving the branch pull, `sameBranch`)
 * is averaged over the members being pulled and handed to its free root,
 * then every free member is placed at its offset in the plane where the root
 * will be after integration, with no velocity left to carry it off. Pinned
 * members (settled, or being edited) are left where they are. `keep` is the
 * share of velocity a tick keeps (1 − d3's velocity decay).
 */
export function flattenStep(branches: readonly FlatBranch[], bodyOf: (id: string) => Body | undefined, keep: number): void {
	for (const branch of branches) {
		const root = bodyOf(branch.root);
		const core = bodyOf(branch.core);
		if (root === undefined || core === undefined) continue;
		const free: Body[] = [];
		let [px, py, pz, pulled] = [0, 0, 0, 0];
		for (const member of branch.members) {
			const body = bodyOf(member.id);
			if (body === undefined || body.fx !== undefined) {
				free.push({});
				continue;
			}
			free.push(body);
			const [vx, vy, vz] = [body.vx ?? 0, body.vy ?? 0, body.vz ?? 0];
			if (vx === 0 && vy === 0 && vz === 0) continue;
			px += vx;
			py += vy;
			pz += vz;
			pulled++;
		}
		if (pulled > 0 && root.fx === undefined) {
			root.vx = (root.vx ?? 0) + px / pulled;
			root.vy = (root.vy ?? 0) + py / pulled;
			root.vz = (root.vz ?? 0) + pz / pulled;
		}
		const at = nextPosition(root, keep);
		const from = nextPosition(core, keep);
		if (at === null || from === null) continue;
		const { right, up } = branchPlane(from, at);
		branch.members.forEach((member, i) => {
			const body = free[i]!;
			if (body.x === undefined) return;
			body.x = at.x + right.x * member.dx - up.x * member.dy;
			body.y = at.y + right.y * member.dx - up.y * member.dy;
			body.z = at.z + right.z * member.dx - up.z * member.dy;
			body.vx = body.vy = body.vz = 0;
		});
	}
}
