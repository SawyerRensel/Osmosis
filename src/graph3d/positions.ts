/**
 * Where a new 3D graph node starts. See the `# Spec` section of
 * `vault/Planner/Develop Mind-Map Graph View.md` ("Streaming: the loaded
 * area").
 *
 * Positions live only as long as the view: nothing is saved. A vault's shape
 * keeps changing as notes are written, so each session settles it afresh.
 * Within a session, nodes already in the scene keep their place, and anything
 * new is seeded beside what it hangs off (its parent line, or the note that
 * pulled its note in) and left free for the simulation to settle. An edited
 * line gets a new content ID, so it alone re-settles near its parent.
 */

import { noteNodeId, type GraphModel } from "./model";

type Vec3 = [x: number, y: number, z: number];

/** A node's position, and whether the simulation may move it. */
export interface Placed {
	x: number;
	y: number;
	z: number;
	pinned: boolean;
}

/** How far from the note that pulled it in a new note's core is seeded. */
const NOTE_SEED_DISTANCE = 120;
/** How far from its parent a new line, or from a neighbour a new hub, is seeded. */
const SEED_SPREAD = 10;

/**
 * Place every node of `model`. Nodes already in the scene (`current`) stay
 * where they are. Anything new is seeded free: a note beside the note that
 * reached it (`via`, from the horizon), a line beside its parent, a hub beside
 * a neighbour.
 */
export function placeNodes(
	model: GraphModel,
	current: ReadonlyMap<string, Placed>,
	via: ReadonlyMap<string, string>,
	random: () => number = Math.random,
): Map<string, Placed> {
	const placed = new Map<string, Placed>();
	const parentOf = new Map<string, string>();
	const neighboursOf = new Map<string, string[]>();
	for (const edge of model.edges) {
		if (edge.kind === "hierarchy") {
			parentOf.set(edge.target, edge.source);
			continue;
		}
		for (const [a, b] of [[edge.target, edge.source], [edge.source, edge.target]] as const) {
			let list = neighboursOf.get(a);
			if (list === undefined) neighboursOf.set(a, (list = []));
			list.push(b);
		}
	}

	const at = (id: string | undefined): Placed | undefined => (id === undefined ? undefined : placed.get(id) ?? current.get(id));
	const seedNear = (base: Placed | undefined, distance: number): Placed => {
		const [dx, dy, dz] = randomDirection(random);
		const { x, y, z } = base ?? { x: 0, y: 0, z: 0 };
		return { x: x + dx * distance, y: y + dy * distance, z: z + dz * distance, pinned: false };
	};

	for (const node of model.nodes) {
		const existing = current.get(node.id);
		if (existing !== undefined) {
			placed.set(node.id, { ...existing });
			continue;
		}
		let place: Placed;
		if (node.kind === "note" && node.path !== undefined) {
			const puller = via.get(node.path);
			place = seedNear(at(puller === undefined ? undefined : noteNodeId(puller)), NOTE_SEED_DISTANCE);
		} else if (node.kind === "line" && node.path !== undefined) {
			place = seedNear(at(parentOf.get(node.id)) ?? at(noteNodeId(node.path)), SEED_SPREAD);
		} else {
			const neighbour = (neighboursOf.get(node.id) ?? []).map(at).find((p) => p !== undefined);
			place = seedNear(neighbour, SEED_SPREAD);
		}
		placed.set(node.id, place);
	}
	return placed;
}

/** A uniformly random unit vector. */
function randomDirection(random: () => number): Vec3 {
	const z = 2 * random() - 1;
	const angle = 2 * Math.PI * random();
	const r = Math.sqrt(1 - z * z);
	return [r * Math.cos(angle), r * Math.sin(angle), z];
}
