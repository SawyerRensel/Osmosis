import { anchoredScroll, zoomBy, ZOOM_STEP } from "./occlusion-geometry";

/**
 * The arithmetic behind zooming a study image in place (T104).
 *
 * The picture is magnified inside its own box: the box keeps its size in the
 * card, and the zoomed picture is drawn into it with a CSS transform and clipped
 * back to it. So nothing around the image moves — not the card's scroll height,
 * not the floating rating buttons — and the masks of an occluded diagram, drawn
 * into the same box, zoom with the picture because they get the same transform.
 *
 * Everything is in fractions of that box, so a zoom carries over to a redrawn
 * copy of the picture (an occlusion card's answer side) with nothing measured,
 * and survives the window being resized.
 */

/**
 * A zoom: `zoom` is the magnification (1 is fit), `x`/`y` where the zoomed
 * picture's top-left corner sits, as fractions of the box. Both are ≤ 0 — the
 * picture always covers the whole box, since it is never smaller than it.
 */
export interface ZoomState {
	zoom: number;
	x: number;
	y: number;
}

/** The picture at rest, filling its box exactly. */
export const FIT: ZoomState = { zoom: 1, x: 0, y: 0 };

/** A point in the box, as fractions of its width and height. */
export interface BoxPoint {
	x: number;
	y: number;
}

/** Whether `state` is magnified at all. */
export function isZoomed(state: ZoomState): boolean {
	return state.zoom > 1;
}

/**
 * `state` with its offset pulled back so the picture covers the whole box: no
 * gap can open at any edge, whatever a pan or a zoom-out asked for.
 */
export function clampPan(state: ZoomState): ZoomState {
	const min = 1 - state.zoom;
	const clamp = (v: number): number => Math.min(0, Math.max(min, v));
	return { zoom: state.zoom, x: clamp(state.x), y: clamp(state.y) };
}

/**
 * Zoom to `zoom` keeping whatever is under `focus` where it is — the pointer
 * under a Ctrl+wheel. This is the editor's `anchoredScroll` with the scroll
 * offset written as the picture's (negated) position.
 */
export function zoomAbout(state: ZoomState, zoom: number, focus: BoxPoint): ZoomState {
	const scale = zoom / state.zoom;
	return clampPan({
		zoom,
		x: -anchoredScroll(-state.x, focus.x, scale),
		y: -anchoredScroll(-state.y, focus.y, scale),
	});
}

/** Move the picture by `dx`/`dy` box fractions, as a drag does. */
export function panBy(state: ZoomState, dx: number, dy: number): ZoomState {
	return clampPan({ zoom: state.zoom, x: state.x + dx, y: state.y + dy });
}

/**
 * A two-finger gesture, measured from where it began rather than from the last
 * move so a slow pinch cannot drift: zoom by how far the fingers spread
 * (`spread`, the ratio of their distance now to their distance at the start)
 * about their starting midpoint, then follow the midpoint as it moves. The same
 * maths as the occlusion editor's pinch.
 */
export function pinchState(start: ZoomState, startCenter: BoxPoint, center: BoxPoint, spread: number): ZoomState {
	const zoom = spread > 0 ? zoomBy(start.zoom, spread) : start.zoom;
	const anchored = zoomAbout(start, zoom, startCenter);
	return panBy(anchored, center.x - startCenter.x, center.y - startCenter.y);
}

/** ln(zoom) per pixel of wheel travel. */
export const WHEEL_GAIN = 0.01;

/**
 * How much one Ctrl+wheel event (or touchpad pinch, which Chromium sends as a
 * Ctrl+wheel) zooms by. Proportional to the travel, so a pinch's stream of small
 * deltas zooms smoothly; capped at the editor's `ZOOM_STEP` either way, so a
 * mouse notch (about 100 px) is one editor step. Scrolling down zooms out.
 */
export function wheelZoomFactor(deltaY: number, deltaMode: number): number {
	const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 100 : deltaY;
	const factor = Math.exp(-px * WHEEL_GAIN);
	return Math.min(ZOOM_STEP, Math.max(1 / ZOOM_STEP, factor));
}

/** A finger lifted without moving, for telling a double tap. */
export interface Tap {
	at: number;
	x: number;
	y: number;
}

export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_PX = 30;

/** Whether `next` completes a double tap that `prev` began. */
export function isDoubleTap(prev: Tap | null, next: Tap): boolean {
	if (prev === null) return false;
	return next.at - prev.at <= DOUBLE_TAP_MS && Math.hypot(next.x - prev.x, next.y - prev.y) <= DOUBLE_TAP_PX;
}

/**
 * The CSS custom properties that draw `state`, or the properties cleared (empty
 * strings) at fit.
 *
 * The transform itself is composed in styles.css from `--osmosis-zoom` and the
 * two offsets, which are percentages of each layer's own box — every layer of a
 * zoomed picture is the box's size, so one set of percentages fits them all.
 * The clip is the box's edges expressed in a layer's coordinates *before* the
 * transform, since that is the space `clip-path` is resolved in: the window
 * `[-x/zoom, (1-x)/zoom]` of the layer is what lands on `[0, 1]` of the box.
 */
export function zoomStyle(state: ZoomState): Record<string, string> {
	if (!isZoomed(state)) {
		return { "--osmosis-zoom": "", "--osmosis-zoom-x": "", "--osmosis-zoom-y": "", "--osmosis-zoom-clip": "" };
	}
	const pct = (v: number): string => `${String(Math.round(v * 1e5) / 1e3)}%`;
	const z = state.zoom;
	const top = -state.y / z;
	const left = -state.x / z;
	const right = 1 - (1 - state.x) / z;
	const bottom = 1 - (1 - state.y) / z;
	return {
		"--osmosis-zoom": String(z),
		"--osmosis-zoom-x": pct(state.x),
		"--osmosis-zoom-y": pct(state.y),
		"--osmosis-zoom-clip": `inset(${pct(top)} ${pct(right)} ${pct(bottom)} ${pct(left)})`,
	};
}
