/**
 * Keeping the map's on-screen scale when only the stage's height changes, as
 * when a phone's on-screen keyboard opens and the WebView shrinks the page.
 *
 * A perspective camera has a fixed vertical field of view, so a shorter stage
 * would show the same vertical extent in fewer pixels: everything shrinks. To
 * keep world units per pixel constant, the field of view scales with the
 * height instead, around the base it had at a reference height.
 */

/** The stage size (px) at which the camera had its default field of view. */
export interface ScaleBase {
	width: number;
	height: number;
}

/** Below this the width counts as unchanged (sub-pixel layout jitter). */
const SAME_WIDTH_PX = 1;

/** The vertical field of view (degrees) at `height` that keeps the pixels per world unit of `baseFov` at `baseHeight`. */
export function heightFov(baseFov: number, baseHeight: number, height: number): number {
	const half = (baseFov * Math.PI) / 360;
	return (360 / Math.PI) * Math.atan((Math.tan(half) * height) / baseHeight);
}

/**
 * The field of view for a stage now `width` × `height` px. A change of width
 * (first layout, rotation, split screen) starts afresh at `defaultFov` from
 * this size; a change of height alone keeps the scale, so the default comes
 * back when the height does.
 */
export function keepScale(base: ScaleBase | null, width: number, height: number, defaultFov: number): { base: ScaleBase; fov: number } {
	if (base === null || Math.abs(base.width - width) >= SAME_WIDTH_PX) {
		return { base: { width, height }, fov: defaultFov };
	}
	return { base, fov: heightFov(defaultFov, base.height, height) };
}
