/**
 * Raster scale buckets for the near tier's panels (`CosmosNear.ts`). See
 * `vault/Planner/3D Graph - Live panels hold 60 fps while the camera moves.md`.
 *
 * A screen-facing panel is its own composited layer (`will-change:
 * transform`). Its content is laid out at a raster scale (the bucket) at or
 * above the scale it is drawn at, and the layer itself is shrunk to the
 * drawn scale by a transform the compositor applies: moving, orbiting and
 * most of a zoom then cost no repaint. The raster is never shown larger than
 * it was drawn: the layer's own scale stays in `[RASTER_BAND.low, 1]`, and
 * leaving that band re-rasters the panel at a new bucket.
 */

import type { PanelStroke } from "./edge-cuts";
import type { PanelHole } from "./occlusion";

/**
 * Drawn scale ÷ raster scale stays in [`low`, 1]. Leaving it re-rasters at
 * the bucket that puts it at `reset`, so a steady zoom either way re-rasters
 * every ~5% of scale, not every frame. A judgment call for Sawyer to check by
 * eye: a lower `low` re-rasters less often but shrinks the raster further
 * (softer text) between re-rasters.
 */
export const RASTER_BAND = { low: 0.9, reset: 0.95 } as const;

/**
 * The raster scale for a panel drawn at `scale`, given the raster scale it has
 * now (`current`; 0 for none yet). A panel's first raster is at its drawn
 * scale exactly, so the layer is first rastered at its own scale 1.
 */
export function rasterScale(current: number, scale: number): number {
	if (!(scale > 0) || !Number.isFinite(scale)) return current;
	if (!(current > 0)) return scale;
	const ratio = scale / current;
	if (ratio <= 1 && ratio >= RASTER_BAND.low) return current;
	return scale / RASTER_BAND.reset;
}

/** Screen px a mask hole may lag its plate before the mask is rewritten: well inside the half-px anti-aliasing ramp. */
export const MASK_STEP_PX = 0.25;

/**
 * `holes` with every length rounded to a multiple of `step`, so a mask is
 * rewritten only when a hole moves by about a step, not on every sub-pixel
 * drift. Each edge moves by at most half a step.
 */
export function snapHoles(holes: readonly PanelHole[], step: number): PanelHole[] {
	if (!(step > 0)) return holes.slice();
	const snap = (n: number): number => Math.round(n / step) * step;
	return holes.map((hole) => ({ left: snap(hole.left), top: snap(hole.top), width: snap(hole.width), height: snap(hole.height), radius: snap(hole.radius) }));
}

/** `strokes` snapped as `snapHoles` snaps holes, ends and width alike. */
export function snapStrokes(strokes: readonly PanelStroke[], step: number): PanelStroke[] {
	if (!(step > 0)) return strokes.slice();
	const snap = (n: number): number => Math.round(n / step) * step;
	return strokes.map((s) => ({ x1: snap(s.x1), y1: snap(s.y1), x2: snap(s.x2), y2: snap(s.y2), width: snap(s.width) }));
}
