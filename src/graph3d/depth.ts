/**
 * Depth under the cursor and the zoom step that follows from it, for the 3D
 * graph's own pointer and wheel handlers. See the `# Spec` section of
 * `vault/Planner/Develop Mind-Map Graph View.md` ("Navigation").
 *
 * Nodes are small on screen, so a ray cast misses one a few pixels away and
 * lands on a link line or the mist behind it. Orbiting and zooming instead aim
 * at the node nearest the cursor on screen, the way Blender's Auto Depth reads
 * the depth under the cursor.
 *
 * Pure: the scene projects its nodes and passes screen coordinates in.
 */

/** A node as seen from the camera: its centre and radius in screen px, and how far ahead of the camera it is. */
export interface ScreenNode {
	x: number;
	y: number;
	radius: number;
	distance: number;
}

/**
 * Smallest camera step per unit of ln(zoom), in world units. About ten units
 * a wheel notch, so a zoom that has closed in on a node keeps moving and
 * passes through it instead of halving its way toward it forever.
 */
export const MIN_DOLLY = 200;

/**
 * The index of the node to aim at from screen point (`x`, `y`), or -1 when no
 * node's edge is within `slop` px. The node whose edge is nearest wins; when
 * the cursor is on several, the one nearest the camera does.
 */
export function pickNode(nodes: readonly ScreenNode[], x: number, y: number, slop: number): number {
	let best = -1;
	let bestGap = Infinity;
	let bestDistance = Infinity;
	nodes.forEach((node, i) => {
		const gap = Math.max(0, Math.hypot(node.x - x, node.y - y) - node.radius);
		if (gap > slop) return;
		if (gap < bestGap || (gap === bestGap && node.distance < bestDistance)) {
			best = i;
			bestGap = gap;
			bestDistance = node.distance;
		}
	});
	return best;
}

/**
 * How far to move the camera toward a point `depth` away, for a zoom of
 * `logZoom` (ln of the zoom factor; positive zooms in). Negative backs away.
 *
 * The step is the share of the depth that the zoom factor implies, so the
 * point grows on screen by that factor, but never less than `MIN_DOLLY` per
 * unit of `logZoom`.
 */
export function dollyDistance(depth: number, logZoom: number): number {
	const proportional = depth * (1 - Math.exp(-logZoom));
	const floor = MIN_DOLLY * Math.abs(logZoom);
	return Math.sign(logZoom) * Math.max(Math.abs(proportional), floor);
}

type WheelDelta = Pick<WheelEvent, "deltaY" | "deltaMode" | "ctrlKey">;

/** Wheel notches of 100 px, positive for wheel up. */
export function wheelNotches(e: WheelDelta): number {
	let delta = e.deltaY;
	// Normalized as OrbitControls does: lines and pages to pixels, and a
	// trackpad pinch (which arrives as a ctrl-wheel) sped up to match.
	if (e.deltaMode === 1) delta *= 16;
	else if (e.deltaMode === 2) delta *= 100;
	if (e.ctrlKey) delta *= 10;
	return -delta / 100;
}

/** The zoom a wheel event asks for, as ln of the zoom factor: OrbitControls' 5% a notch, wheel up zooms in. */
export function wheelLogZoom(e: WheelDelta): number {
	return -wheelNotches(e) * Math.log(0.95);
}
