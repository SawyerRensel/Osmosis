/**
 * The radial map: a continent's Direction "radial" (Planets mode, see
 * `vault/Planner/3D Graph - Planets mode.md`). The 2D mind map has no radial
 * layout (its `mapLayout: "radial"` setting is stored but never drawn), so this
 * is new, pure code that leaves 2D's `computeLayout` alone.
 *
 * The continent's head sits at the centre. Each line takes an angular wedge
 * in proportion to the room its descendants need, and lies at the middle of
 * it on a ring for its depth. Rings are spaced by the plates' extents along
 * their own direction and widened until the plates in a wedge fit side by
 * side. Plates stay rigid rectangles: only their centres are placed.
 *
 * Angles run clockwise on the map (x right, y down) from the first child in
 * document order. A lone child lies to the right, as in the left-right map.
 */

import type { MapPlate, PlanetBranch, PlateSize } from "./planets";

/** The most a line spreads its children over: a line near the centre with one child would otherwise fan them round the whole circle, behind its parent. */
export const MAX_FAN = Math.PI;

interface Slot {
	branch: PlanetBranch;
	depth: number;
	/** Wedge width the line was given, radians. */
	wedge: number;
	/** Direction of the line's centre from the head, radians. */
	angle: number;
}

/** Half the plate's extent along the direction `angle`. */
const alongHalf = (size: { width: number; height: number }, angle: number): number => (Math.abs(Math.cos(angle)) * size.width + Math.abs(Math.sin(angle)) * size.height) / 2;

/** The plate's extent across the direction `angle`. */
const acrossFull = (size: { width: number; height: number }, angle: number): number => Math.abs(Math.sin(angle)) * size.width + Math.abs(Math.cos(angle)) * size.height;

/**
 * Lay a continent out radially: its head at (0, 0), every other line at its
 * angle on its depth's ring. `columnGap` is the clear space between rings,
 * `rowGap` between neighbours on a ring.
 */
export function radialMap(head: PlanetBranch, sizeOf: PlateSize, columnGap: number, rowGap: number): MapPlate[] {
	// A line's weight: the room, along a ring, its descendants' leaves need.
	const weights = new Map<string, number>();
	const weigh = (branch: PlanetBranch): number => {
		const { width, height } = sizeOf(branch.id);
		const own = Math.hypot(width, height) + rowGap;
		const weight = branch.children.length === 0 ? own : Math.max(own, branch.children.reduce((sum, child) => sum + weigh(child), 0));
		weights.set(branch.id, weight);
		return weight;
	};
	weigh(head);

	// Wedges, top down. The head spreads its children over the whole circle, any other line over at most MAX_FAN about its own direction.
	const slots: Slot[] = [];
	const share = (branch: PlanetBranch, depth: number, from: number, to: number): void => {
		slots.push({ branch, depth, wedge: to - from, angle: (from + to) / 2 });
		if (branch.children.length === 0) return;
		const mid = (from + to) / 2;
		const fan = depth === 0 ? to - from : Math.min(to - from, MAX_FAN);
		const total = branch.children.reduce((sum, child) => sum + weights.get(child.id)!, 0);
		let start = mid - fan / 2;
		for (const child of branch.children) {
			const end = start + (fan * weights.get(child.id)!) / total;
			share(child, depth + 1, start, end);
			start = end;
		}
	};
	// Starting at the left seam puts a lone child to the right.
	share(head, 0, -Math.PI, Math.PI);

	// Rings. The head's own extent toward each child is exact; deeper rings step by the largest extents along each line's own direction.
	const byDepth: Slot[][] = [];
	for (const slot of slots) (byDepth[slot.depth] ??= []).push(slot);
	const radii: number[] = [0];
	for (let depth = 1; depth < byDepth.length; depth++) {
		const outer = byDepth[depth]!;
		let step = columnGap;
		if (depth === 1) {
			// Per child: the head's reach toward it, its own, and the gap.
			const headSize = sizeOf(head.id);
			step = Math.max(...outer.map((slot) => alongHalf(headSize, slot.angle) + columnGap + alongHalf(sizeOf(slot.branch.id), slot.angle)));
		} else {
			const inner = Math.max(...byDepth[depth - 1]!.map((slot) => alongHalf(sizeOf(slot.branch.id), slot.angle)));
			step = columnGap + inner + Math.max(...outer.map((slot) => alongHalf(sizeOf(slot.branch.id), slot.angle)));
		}
		// Neighbours in a wedge sit side by side: the ring must be long enough for each line's footprint across its direction.
		const around = Math.max(...outer.map((slot) => (acrossFull(sizeOf(slot.branch.id), slot.angle) + rowGap) / slot.wedge));
		radii[depth] = Math.max(radii[depth - 1]! + step, around);
	}

	return slots.map((slot) => {
		const { width, height } = sizeOf(slot.branch.id);
		const radius = radii[slot.depth]!;
		return { id: slot.branch.id, x: radius * Math.cos(slot.angle), y: radius * Math.sin(slot.angle), width, height };
	});
}
