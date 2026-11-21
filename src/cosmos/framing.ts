/**
 * Screen-space geometry for editing in Cosmos, so the camera can trust
 * the view the user chose (Sawyer, 2026-11-03): an edit never flies the camera.
 *
 * - On desktop, a line that is off screen is brought into view by turning the
 *   camera in place, no further than it takes (`turnToSee`).
 * - On a phone, the line is panned onto the view's centre, which the keyboard
 *   offset puts mid-way down the part of the screen left visible (`panOnto`).
 *   Panning never changes the line's depth, so it never zooms in.
 * - A new line is seeded beside its parent in the plane of the screen, where
 *   the screen is free (`seedBeside`), so it appears where the user is looking.
 *
 * Projection follows three.js: the camera looks from `position` at `target`
 * with `lookAt`'s up vector, as OrbitControls points it.
 */

import type { Vec3 } from "./flight";

export interface CameraPose {
	position: Vec3;
	/** The orbit target: what the camera looks at, and how far away it orbits. */
	target: Vec3;
	/** The camera's `up`, as `lookAt` uses it. */
	up: Vec3;
	/** Vertical field of view, degrees. */
	fov: number;
	/** Width over height. */
	aspect: number;
}

/** A point as the camera sees it: `x`, `y` across the view (−1 to 1, y up), `depth` along it (positive in front). */
export interface ScreenPoint {
	x: number;
	y: number;
	depth: number;
}

/** How much of each half of the view, as a fraction (0–1), to keep clear at its edges. */
export interface Inset {
	x: number;
	y: number;
}

/** The camera's right, up and forward axes, as `lookAt` sets them. */
interface Axes {
	right: Vec3;
	up: Vec3;
	forward: Vec3;
}

/** No inset this large: some of the view always counts. */
const MAX_INSET = 0.8;
/** The directions a new line may take from its parent, degrees from screen right (y up): right first, then alternately below and above, as a mind map grows down. */
const SEED_ANGLES = [0, -30, 30, -60, 60, -90, 90, -120, 120, -150, 150, 180];
/** A seed spot this far (as a fraction of the parent-to-seed distance on screen) from every other node is free; past that, the earlier direction wins. */
const SEED_CLEAR = 0.5;
/** Scores closer than this are a tie, which the earlier direction wins (rounding must not pick a later one). */
const TIE = 1e-9;
/** Halvings in the turn search: far finer than a pixel. */
const TURN_STEPS = 30;

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
const unit = (a: Vec3): Vec3 => {
	const l = length(a);
	return l === 0 ? { x: 0, y: 0, z: 0 } : scale(a, 1 / l);
};

/** The camera's axes, as three's `Matrix4.lookAt` builds them (including its nudge when looking straight along `up`). */
function axes(pose: CameraPose): Axes {
	let back = unit(sub(pose.position, pose.target));
	if (length(back) === 0) back = { x: 0, y: 0, z: 1 };
	let right = cross(pose.up, back);
	if (length(right) === 0) {
		back = Math.abs(pose.up.z) === 1 ? { ...back, x: back.x + 0.0001 } : { ...back, z: back.z + 0.0001 };
		back = unit(back);
		right = cross(pose.up, back);
	}
	right = unit(right);
	return { right, up: cross(back, right), forward: scale(back, -1) };
}

/** Where `p` lands in the view. `x` and `y` mean nothing when `depth` is not positive. */
export function project(pose: CameraPose, p: Vec3): ScreenPoint {
	const { right, up, forward } = axes(pose);
	const v = sub(p, pose.position);
	const depth = dot(v, forward);
	const tan = Math.tan((pose.fov * Math.PI) / 360);
	return { x: dot(v, right) / (depth * tan * pose.aspect), y: dot(v, up) / (depth * tan), depth };
}

/** In front of the camera and inside the view less `inset`. */
export function inView(point: ScreenPoint, inset: Inset): boolean {
	return point.depth > 0 && Math.abs(point.x) <= 1 - inset.x && Math.abs(point.y) <= 1 - inset.y;
}

/**
 * The inset that keeps a plate `half` world units across each way (half its
 * width and height), `distance` from the camera, wholly on screen with
 * `margin` px to spare, in a `size` px view. Never more than most of the view.
 */
export function plateInset(half: { x: number; y: number }, distance: number, margin: number, size: { width: number; height: number }, fov: number): Inset {
	if (size.width <= 0 || size.height <= 0) return { x: 0, y: 0 };
	const pxPerUnit = size.height / 2 / (Math.max(distance, 1e-6) * Math.tan((fov * Math.PI) / 360));
	return {
		x: Math.min(MAX_INSET, (half.x * pxPerUnit + margin) / (size.width / 2)),
		y: Math.min(MAX_INSET, (half.y * pxPerUnit + margin) / (size.height / 2)),
	};
}

/** `v` turned `angle` radians about unit axis `k` (Rodrigues). */
function rotate(v: Vec3, k: Vec3, angle: number): Vec3 {
	const cos = Math.cos(angle);
	return add(add(scale(v, cos), scale(cross(k, v), Math.sin(angle))), scale(k, dot(k, v) * (1 - cos)));
}

/**
 * Turn the camera where it stands just far enough that `p` is in view (inside
 * `inset`): the view direction swings toward `p` along the shortest arc and
 * stops as soon as `p` is in. Returns the new orbit target, as far from the
 * camera as the old one (so no zoom and no move), or null when `p` is in view
 * already.
 */
export function turnToSee(pose: CameraPose, p: Vec3, inset: Inset): Vec3 | null {
	if (inView(project(pose, p), inset)) return null;
	const toTarget = sub(pose.target, pose.position);
	const reach = length(toTarget);
	const to = unit(sub(p, pose.position));
	if (reach === 0 || length(to) === 0) return null;
	const from = scale(toTarget, 1 / reach);
	const angle = Math.acos(Math.min(1, Math.max(-1, dot(from, to))));
	let axis = unit(cross(from, to));
	// Straight behind: any arc is shortest; turn about the camera's up, as a person turns round.
	if (length(axis) === 0) axis = axes(pose).up;
	const targetAt = (t: number): Vec3 => add(pose.position, scale(rotate(from, axis, t), reach));
	let [lo, hi] = [0, angle];
	for (let i = 0; i < TURN_STEPS; i++) {
		const mid = (lo + hi) / 2;
		if (inView(project({ ...pose, target: targetAt(mid) }, p), inset)) hi = mid;
		else lo = mid;
	}
	return targetAt(hi);
}

/**
 * The pan (to add to both the camera and its target) that puts `p` on the
 * view's centre line: across the screen only, so `p` keeps its depth and the
 * camera never zooms in or out.
 */
export function panOnto(pose: CameraPose, p: Vec3): Vec3 {
	const { forward } = axes(pose);
	const v = sub(p, pose.position);
	return sub(v, scale(forward, dot(v, forward)));
}

/**
 * Where to seed a new line: `distance` from its `parent`, in the plane of the
 * screen through the parent (so at the parent's depth), in the direction that
 * is freest of the `others` on screen. Directions are tried right first, then
 * alternately below and above (`SEED_ANGLES`); a later one wins only by being
 * clearer, and once a spot is clear by half the seeding distance on screen it
 * counts as free. A spot that would land in view (inside `inset`) beats one
 * that would not, so the line appears where the user is looking.
 */
export function seedBeside(pose: CameraPose, parent: Vec3, distance: number, others: readonly Vec3[], inset: Inset): Vec3 {
	const { right, up } = axes(pose);
	// Screen positions in units of the view's half-height, the same both ways.
	const flat = (s: ScreenPoint) => ({ x: s.x * pose.aspect, y: s.y });
	const from = project(pose, parent);
	const blockers = others
		.map((o) => project(pose, o))
		.filter((s) => s.depth > 0 && Math.abs(s.x) <= 1 && Math.abs(s.y) <= 1)
		.map(flat);
	let best: { at: Vec3; score: number; shown: boolean } | null = null;
	for (const degrees of SEED_ANGLES) {
		const angle = (degrees * Math.PI) / 180;
		const at = add(parent, add(scale(right, distance * Math.cos(angle)), scale(up, distance * Math.sin(angle))));
		const seen = project(pose, at);
		let score = -Infinity;
		if (seen.depth > 0 && from.depth > 0) {
			const spot = flat(seen);
			const origin = flat(from);
			score = SEED_CLEAR * Math.hypot(spot.x - origin.x, spot.y - origin.y);
			for (const b of blockers) score = Math.min(score, Math.hypot(spot.x - b.x, spot.y - b.y));
		}
		const shown = inView(seen, inset);
		if (best === null || (shown && !best.shown) || (shown === best.shown && score - best.score > TIE)) best = { at, score, shown };
	}
	return best?.at ?? add(parent, scale(right, distance));
}
