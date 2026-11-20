/**
 * Edges in front of a near-tier panel. A panel is DOM over the WebGL canvas,
 * so left alone it covers every edge, nearer or farther. Where an edge runs
 * nearer the camera than a panel, the stretch of it that crosses the panel is
 * cut out of the panel's mask as a thin stroke, so the edge drawn on the
 * canvas shows through, as `occlusion.ts` does for nearer plates. See
 * `vault/Planner/3D Graph - Nearer edges cut through near-tier panels.md`.
 *
 * Both kinds of panel are a central projection: a screen-facing panel's
 * strokes are the edge projected from the camera onto the screen, a tilted
 * one's (Planets) the edge cast from the eye onto the panel's plane, as
 * `tiltedHole` casts a plate. Either way a point at distance `d` from the
 * eye (view depth, or height below the eye over the panel's plane) lands at
 * `offset + rel · k / d` in the panel's layout px, and `cut` does the rest.
 *
 * An edge ending at the panel's own node is never cut: it starts at the
 * node's centre, under the panel, and passes under its own plate
 * (`own-plate.ts`), so it would only draw a line through the panel's text.
 *
 * Pure: no `three` or `obsidian` import, so it is unit-tested directly.
 */

import type { Vec3 } from "./flight";
import type { ScreenPanel } from "./occlusion";
import type { TiltedPanel } from "./tilt";

/** Floats a segment in `EdgeSegments.data`: world ends a and b, then the full world width at each (0 for a line). */
const STRIDE = 8;

/** The narrowest stroke cut, in CSS px on screen: a line edge is one device px, and this leaves room for the mask's snapping. */
export const MIN_STROKE_PX = 1.5;

/**
 * Every edge segment drawn this frame, in the world: refilled with the edge
 * geometry (the scene's `writeEdges`), read by every panel.
 */
export class EdgeSegments {
	count = 0;
	data = new Float32Array(64 * STRIDE);
	/** Each segment's two end node ids. */
	readonly endA: string[] = [];
	readonly endB: string[] = [];

	clear(): void {
		this.count = 0;
	}

	/** One straight segment from `a` to `b`, full widths `wa` and `wb` in world units (0 for a line), of the edge from node `idA` to `idB`. */
	push(a: Vec3, b: Vec3, wa: number, wb: number, idA: string, idB: string): void {
		const i = this.count++;
		if ((i + 1) * STRIDE > this.data.length) {
			const grown = new Float32Array(this.data.length * 2);
			grown.set(this.data);
			this.data = grown;
		}
		const o = i * STRIDE;
		const d = this.data;
		d[o] = a.x;
		d[o + 1] = a.y;
		d[o + 2] = a.z;
		d[o + 3] = b.x;
		d[o + 4] = b.y;
		d[o + 5] = b.z;
		d[o + 6] = wa;
		d[o + 7] = wb;
		this.endA[i] = idA;
		this.endB[i] = idB;
	}
}

/** Floats a segment in `toView`'s buffer: view-space ends and widths as in `EdgeSegments.data`, then its box on screen. */
const VIEW_STRIDE = 12;

/**
 * The segments in view space, once a frame, shared by every panel: each
 * end's x, its y flipped to run down the screen, and its view depth, then
 * the two widths, then the box the segment covers on screen past the `near`
 * plane, widths included, in px at depth 1 from the screen's centre (x / d,
 * y / d): left, right, top, bottom, or an empty box when it is all behind.
 * Most segments miss a panel, and the box turns them away before any
 * clipping. `view` is the camera's world-to-view matrix, column-major
 * (three's `matrixWorldInverse.elements`). Reuses `out` when it is big enough.
 */
export function toView(segments: EdgeSegments, view: ArrayLike<number>, near: number, out: Float32Array | null): Float32Array {
	const count = segments.count;
	const result = out !== null && out.length >= count * VIEW_STRIDE ? out : new Float32Array(Math.max(count, 64) * VIEW_STRIDE);
	const d = segments.data;
	const m = view;
	for (let i = 0; i < count; i++) {
		const o = i * STRIDE;
		const r = i * VIEW_STRIDE;
		for (let e = 0; e <= 3; e += 3) {
			const x = d[o + e]!;
			const y = d[o + e + 1]!;
			const z = d[o + e + 2]!;
			result[r + e] = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
			result[r + e + 1] = -(m[1]! * x + m[5]! * y + m[9]! * z + m[13]!);
			result[r + e + 2] = -(m[2]! * x + m[6]! * y + m[10]! * z + m[14]!);
		}
		const wa = (result[r + 6] = d[o + 6]!);
		const wb = (result[r + 7] = d[o + 7]!);
		let ax = result[r]!;
		let ay = result[r + 1]!;
		let ad = result[r + 2]!;
		let bx = result[r + 3]!;
		let by = result[r + 4]!;
		let bd = result[r + 5]!;
		if (ad <= near && bd <= near) {
			result[r + 8] = result[r + 10] = Infinity;
			result[r + 9] = result[r + 11] = -Infinity;
			continue;
		}
		if (ad < near) {
			const t = (near - ad) / (bd - ad);
			ax += (bx - ax) * t;
			ay += (by - ay) * t;
			ad = near;
		} else if (bd < near) {
			const t = (near - bd) / (ad - bd);
			bx += (ax - bx) * t;
			by += (ay - by) * t;
			bd = near;
		}
		const grow = Math.max(wa, wb) / (2 * Math.min(ad, bd));
		const sax = ax / ad;
		const say = ay / ad;
		const sbx = bx / bd;
		const sby = by / bd;
		result[r + 8] = Math.min(sax, sbx) - grow;
		result[r + 9] = Math.max(sax, sbx) + grow;
		result[r + 10] = Math.min(say, sby) - grow;
		result[r + 11] = Math.max(say, sby) + grow;
	}
	return result;
}

/** A box on screen in px at depth 1 from the screen's centre, as `toView`'s segment boxes are. */
export interface ScreenBox {
	left: number;
	right: number;
	top: number;
	bottom: number;
}

/** The screen rectangle `rect` (viewport px), grown by a minimum stroke, as a `ScreenBox`. */
export function screenBox(rect: { left: number; right: number; top: number; bottom: number }, camera: FacingView): ScreenBox {
	const f = camera.pxPerUnitAt1;
	const cx = camera.viewportWidth / 2;
	const cy = camera.viewportHeight / 2;
	return { left: (rect.left - cx - MIN_STROKE_PX) / f, right: (rect.right - cx + MIN_STROKE_PX) / f, top: (rect.top - cy - MIN_STROKE_PX) / f, bottom: (rect.bottom - cy + MIN_STROKE_PX) / f };
}

/** Whether segment `i`'s box in `view` misses `box`. */
const misses = (view: Float32Array, i: number, box: ScreenBox): boolean => {
	const r = i * VIEW_STRIDE;
	return view[r + 9]! < box.left || view[r + 8]! > box.right || view[r + 11]! < box.top || view[r + 10]! > box.bottom;
};

/** A stroke to cut, in the panel's layout px from its top-left: the centre line from (x1, y1) to (x2, y2), `width` across. */
export interface PanelStroke {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	width: number;
}

/**
 * How one projection lands in a panel: a point `rel` from the eye at
 * distance `d` lands at `offset + rel · k / d` layout px. Only the part of a
 * segment with `near < d < far` is in front of the panel and visible.
 */
export interface Projection {
	offsetX: number;
	offsetY: number;
	k: number;
	near: number;
	far: number;
	/** The panel's layout size: strokes are clipped to it. */
	width: number;
	height: number;
	/** The narrowest stroke, in layout px. */
	minWidth: number;
}

/**
 * The stroke one segment cuts, or null: ends (`xa`, `ya`) at distance `da`
 * and (`xb`, `yb`) at `db`, full world widths `wa` and `wb`. Clipped to
 * `near < d < far` first, then projected and clipped to the panel box grown
 * by half the stroke's width (Liang–Barsky). The width is the edge's at the
 * middle of what is left, never under `minWidth`.
 */
export function cut(xa: number, ya: number, da: number, xb: number, yb: number, db: number, wa: number, wb: number, p: Projection): PanelStroke | null {
	// Clip to near < d < far, as segment parameters t0..t1 (0 = a, 1 = b).
	let t0 = 0;
	let t1 = 1;
	const dd = db - da;
	if (dd === 0) {
		if (da <= p.near || da >= p.far) return null;
	} else {
		const tNear = (p.near - da) / dd;
		const tFar = (p.far - da) / dd;
		if (dd > 0) {
			t0 = Math.max(t0, tNear);
			t1 = Math.min(t1, tFar);
		} else {
			t0 = Math.max(t0, tFar);
			t1 = Math.min(t1, tNear);
		}
	}
	if (t0 >= t1) return null;
	const d0 = da + dd * t0;
	const d1 = da + dd * t1;
	const x0 = p.offsetX + (xa + (xb - xa) * t0) * (p.k / d0);
	const y0 = p.offsetY + (ya + (yb - ya) * t0) * (p.k / d0);
	const dx = p.offsetX + (xa + (xb - xa) * t1) * (p.k / d1) - x0;
	const dy = p.offsetY + (ya + (yb - ya) * t1) * (p.k / d1) - y0;
	const widthAt = (s: number): number => {
		// Back from screen parameter s (0 = the t0 end) to the segment's, perspective-correct.
		const f = (s * d0) / ((1 - s) * d1 + s * d0);
		const w = wa + (wb - wa) * (t0 + (t1 - t0) * f);
		return Math.max(p.minWidth, (w * p.k) / (d0 + (d1 - d0) * f));
	};
	// Pad the box by the widest the stroke can be, so a wide one isn't cut short at the panel's side.
	const pad = wa === 0 && wb === 0 ? p.minWidth / 2 : Math.max(widthAt(0), widthAt(1)) / 2;
	// Liang–Barsky against the padded box: keep q·s <= r on each side.
	let s0 = 0;
	let s1 = 1;
	const clip = (q: number, r: number): boolean => {
		if (q === 0) return r >= 0;
		const s = r / q;
		if (q < 0) s0 = Math.max(s0, s);
		else s1 = Math.min(s1, s);
		return s0 <= s1;
	};
	if (!clip(-dx, x0 + pad) || !clip(dx, p.width + pad - x0) || !clip(-dy, y0 + pad) || !clip(dy, p.height + pad - y0)) return null;
	return { x1: x0 + dx * s0, y1: y0 + dy * s0, x2: x0 + dx * s1, y2: y0 + dy * s1, width: widthAt((s0 + s1) / 2) };
}

/** How a screen-facing panel's strokes project: `panel` as `panelHoles` takes it, the camera's near plane and px per world unit at depth 1, and the viewport. */
export interface FacingView {
	near: number;
	pxPerUnitAt1: number;
	viewportWidth: number;
	viewportHeight: number;
}

/**
 * The strokes nearer edges cut in a screen-facing panel, in its layout px:
 * each segment's stretch between the near plane and the panel's depth,
 * projected and clipped to the panel. `view` is `toView`'s this frame,
 * with `camera.near`.
 */
export function facingStrokes(segments: EdgeSegments, view: Float32Array, panel: ScreenPanel, camera: FacingView): PanelStroke[] {
	const strokes: PanelStroke[] = [];
	if (panel.scale <= 0 || panel.width <= 0 || panel.height <= 0) return strokes;
	const p: Projection = {
		offsetX: (camera.viewportWidth / 2 - panel.x) / panel.scale + panel.width / 2,
		offsetY: (camera.viewportHeight / 2 - panel.y) / panel.scale + panel.height / 2,
		k: camera.pxPerUnitAt1 / panel.scale,
		near: camera.near,
		far: panel.depth,
		width: panel.width,
		height: panel.height,
		minWidth: MIN_STROKE_PX / panel.scale,
	};
	const halfWidth = (panel.width * panel.scale) / 2;
	const halfHeight = (panel.height * panel.scale) / 2;
	const box = screenBox({ left: panel.x - halfWidth, right: panel.x + halfWidth, top: panel.y - halfHeight, bottom: panel.y + halfHeight }, camera);
	for (let i = 0; i < segments.count; i++) {
		const o = i * VIEW_STRIDE;
		const da = view[o + 2]!;
		const db = view[o + 5]!;
		if ((da >= p.far && db >= p.far) || misses(view, i, box)) continue;
		if (segments.endA[i] === panel.id || segments.endB[i] === panel.id) continue;
		const stroke = cut(view[o]!, view[o + 1]!, da, view[o + 3]!, view[o + 4]!, db, view[o + 6]!, view[o + 7]!, p);
		if (stroke !== null) strokes.push(stroke);
	}
	return strokes;
}

/**
 * The strokes nearer edges cut in a tilted panel seen from `eye`, in its
 * layout px: each segment's stretch on the eye's side of the panel's plane
 * and short of the eye's height over it, cast from the eye onto the plane.
 * `id` is the panel's node; `minWidth` the narrowest stroke in layout px.
 * With `cull` (`toView`'s this frame, and the panel's box on screen), only
 * segments over the panel on screen are cast: what the eye sees over the
 * panel is exactly what casts onto it.
 */
export function tiltedStrokes(segments: EdgeSegments, panel: TiltedPanel, id: string, eye: Vec3, minWidth: number, cull: { view: Float32Array; box: ScreenBox } | null = null): PanelStroke[] {
	const strokes: PanelStroke[] = [];
	const { centre: c, frame, pxPerUnit } = panel;
	const { right, up, normal: n } = frame;
	const [ex, ey, ez] = [eye.x - c.x, eye.y - c.y, eye.z - c.z];
	// The eye's height over the panel's plane; a panel seen from behind is hidden and cuts nothing.
	const height = ex * n.x + ey * n.y + ez * n.z;
	if (!(height > 0) || panel.width <= 0 || panel.height <= 0) return strokes;
	const eu = ex * right.x + ey * right.y + ez * right.z;
	const ev = ex * up.x + ey * up.y + ez * up.z;
	const p: Projection = {
		offsetX: eu * pxPerUnit + panel.width / 2,
		offsetY: -ev * pxPerUnit + panel.height / 2,
		k: pxPerUnit * height,
		// A point level with the eye casts no shadow on the plane.
		near: height * 1e-3,
		far: height,
		width: panel.width,
		height: panel.height,
		minWidth,
	};
	const d = segments.data;
	for (let i = 0; i < segments.count; i++) {
		if (cull !== null && misses(cull.view, i, cull.box)) continue;
		const o = i * STRIDE;
		const ax = d[o]! - c.x;
		const ay = d[o + 1]! - c.y;
		const az = d[o + 2]! - c.z;
		const bx = d[o + 3]! - c.x;
		const by = d[o + 4]! - c.y;
		const bz = d[o + 5]! - c.z;
		// Distance below the eye's height: under `far` is on the eye's side of the plane.
		const da = height - (ax * n.x + ay * n.y + az * n.z);
		const db = height - (bx * n.x + by * n.y + bz * n.z);
		if ((da >= p.far && db >= p.far) || (da <= p.near && db <= p.near)) continue;
		if (segments.endA[i] === id || segments.endB[i] === id) continue;
		const ua = ax * right.x + ay * right.y + az * right.z - eu;
		const va = -(ax * up.x + ay * up.y + az * up.z - ev);
		const ub = bx * right.x + by * right.y + bz * right.z - eu;
		const vb = -(bx * up.x + by * up.y + bz * up.z - ev);
		const stroke = cut(ua, va, da, ub, vb, db, d[o + 6]!, d[o + 7]!, p);
		if (stroke !== null) strokes.push(stroke);
	}
	return strokes;
}
