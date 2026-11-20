import { anchoredScroll, zoomBy, ZOOM_STEP } from "./occlusion-geometry";

/**
 * The arithmetic behind zooming a study image in place (T104).
 *
 * The picture's box keeps its size in the card, and the zoomed picture is drawn
 * from it with a CSS transform. So nothing around the image moves — not the
 * card's scroll height, not the floating rating buttons — and the masks of an
 * occluded diagram, drawn into the same box, zoom with the picture because they
 * get the same transform. Once magnified, the picture may spill out of its box
 * over the study area around it (batch 14, F2); styles.css clips it to that
 * area, and the pan is held to the part of it on screen (`ZoomWindow`).
 *
 * The zoom is in fractions of the box, so it carries over to a redrawn copy of
 * the picture (an occlusion card's answer side) with nothing measured, and
 * survives the window being resized.
 */

/**
 * A zoom: `zoom` is the magnification (1 is fit), `x`/`y` where the zoomed
 * picture's top-left corner sits, as fractions of the box.
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

/**
 * The study area a zoomed picture may be seen in — the part of it on screen,
 * measured when a gesture starts — as fractions of the picture's box, which
 * runs 0–1 on each axis.
 */
export interface ZoomWindow {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/** A window that is just the picture's own box. */
export const BOX: ZoomWindow = { left: 0, top: 0, right: 1, bottom: 1 };

/** A rectangle on screen, in px. */
export interface ScreenRect {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/** `area` as a window onto the picture whose box is `box`. A box of no size gets its own. */
export function windowIn(box: ScreenRect, area: ScreenRect): ZoomWindow {
	const width = box.right - box.left;
	const height = box.bottom - box.top;
	if (width <= 0 || height <= 0) return BOX;
	return {
		left: (area.left - box.left) / width,
		top: (area.top - box.top) / height,
		right: (area.right - box.left) / width,
		bottom: (area.bottom - box.top) / height,
	};
}

/** Whether `state` is magnified at all. */
export function isZoomed(state: ZoomState): boolean {
	return state.zoom > 1;
}

/**
 * `state` with its offset pulled back into `window`, on each axis: a picture
 * larger than the window covers it, so no gap opens at its edge; one smaller
 * stays inside it, so none of it is lost off screen. The two meet where the
 * picture is exactly the window's size, so the pan never jumps between them.
 * A picture at fit is the box, which lies inside a window that holds it.
 */
export function clampPan(state: ZoomState, window: ZoomWindow = BOX): ZoomState {
	const clamp = (v: number, start: number, end: number): number => {
		const a = start;
		const b = end - state.zoom;
		return Math.min(Math.max(a, b), Math.max(Math.min(a, b), v));
	};
	return {
		zoom: state.zoom,
		x: clamp(state.x, window.left, window.right),
		y: clamp(state.y, window.top, window.bottom),
	};
}

/**
 * Zoom to `zoom` keeping whatever is under `focus` where it is — the pointer
 * under a Ctrl+wheel. This is the editor's `anchoredScroll` with the scroll
 * offset written as the picture's (negated) position.
 */
export function zoomAbout(state: ZoomState, zoom: number, focus: BoxPoint, window: ZoomWindow = BOX): ZoomState {
	if (zoom <= 1) return FIT;
	const scale = zoom / state.zoom;
	return clampPan({
		zoom,
		x: -anchoredScroll(-state.x, focus.x, scale),
		y: -anchoredScroll(-state.y, focus.y, scale),
	}, window);
}

/** Move the picture by `dx`/`dy` box fractions, as a drag does. */
export function panBy(state: ZoomState, dx: number, dy: number, window: ZoomWindow = BOX): ZoomState {
	if (!isZoomed(state)) return FIT;
	return clampPan({ zoom: state.zoom, x: state.x + dx, y: state.y + dy }, window);
}

/**
 * A two-finger gesture, measured from where it began rather than from the last
 * move so a slow pinch cannot drift: zoom by how far the fingers spread
 * (`spread`, the ratio of their distance now to their distance at the start)
 * about their starting midpoint, then follow the midpoint as it moves. The same
 * maths as the occlusion editor's pinch.
 */
export function pinchState(
	start: ZoomState,
	startCenter: BoxPoint,
	center: BoxPoint,
	spread: number,
	window: ZoomWindow = BOX,
): ZoomState {
	const zoom = spread > 0 ? zoomBy(start.zoom, spread) : start.zoom;
	const anchored = zoomAbout(start, zoom, startCenter, window);
	return panBy(anchored, center.x - startCenter.x, center.y - startCenter.y, window);
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
 * Nothing clips the layers themselves: styles.css clips the study area they
 * spill into.
 */
export function zoomStyle(state: ZoomState): Record<string, string> {
	if (!isZoomed(state)) {
		return { "--osmosis-zoom": "", "--osmosis-zoom-x": "", "--osmosis-zoom-y": "" };
	}
	const pct = (v: number): string => `${String(Math.round(v * 1e5) / 1e3)}%`;
	return {
		"--osmosis-zoom": String(state.zoom),
		"--osmosis-zoom-x": pct(state.x),
		"--osmosis-zoom-y": pct(state.y),
	};
}
