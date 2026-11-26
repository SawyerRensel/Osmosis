/**
 * Wheel events in the 3D view: telling a touchpad's two-finger swipe from a
 * mouse wheel, and how far each event zooms. All of them zoom: a mouse wheel
 * and a pinch at their usual rates, a swipe at a finer one, since a touchpad
 * streams many small deltas. The view turns and pans by drag only. There is
 * no setting, so when unsure it is a wheel.
 */

import { wheelLogZoom } from "./depth";

export type WheelSource = "touchpad" | "wheel";

/** One wheel event, as the classifier needs it; `t` in ms (the event's `timeStamp`). */
export interface WheelSample {
	deltaX: number;
	deltaY: number;
	deltaMode: number;
	t: number;
}

/** Events closer together than this belong to one gesture, which is classified once. */
export const GESTURE_GAP_MS = 200;
/**
 * A mouse wheel's deltas are whole multiples of one step: a notch (100 or 120
 * px, about 53 on some Linux builds, or those over the display scale), a
 * high-resolution wheel's fraction of one, or macOS's 4 px. Deltas whose
 * common step is finer than this came from a touchpad.
 */
export const MIN_WHEEL_STEP_PX = 2;
/** How far from a whole multiple (as a share of the step) a delta may be and still count as one: rounding at odd display scales. */
const STEP_TOLERANCE = 0.05;

/**
 * The common step of two deltas, the way a mouse wheel would have them: the
 * greatest common divisor, allowing each remainder `STEP_TOLERANCE` of slack.
 * Touchpad deltas have no common step, so it falls toward zero.
 */
export function commonStep(a: number, b: number): number {
	let big = Math.max(a, b);
	let small = Math.min(a, b);
	while (small >= MIN_WHEEL_STEP_PX / 2) {
		const rest = big % small;
		const slack = STEP_TOLERANCE * small;
		if (rest <= slack || small - rest <= slack) return small;
		big = small;
		small = rest;
	}
	return small;
}

/**
 * Decides, once per gesture, whether wheel events come from a touchpad. A
 * gesture is a touchpad's once it moves on both axes (a mouse wheel scrolls
 * one), or once its deltas share no wheel-sized step. It is a wheel for good
 * on line or page deltas. Until one of those shows, each event is reported as
 * a wheel (it zooms, as before), so a mouse never turns the view. Once
 * decided, the gesture keeps its answer until the events pause for
 * `GESTURE_GAP_MS`, so a swipe never flickers between turning and zooming.
 */
export class WheelClassifier {
	private decided: WheelSource | null = null;
	private lastAt = -Infinity;
	private step = 0;
	private sawX = false;
	private sawY = false;

	classify(e: WheelSample): WheelSource {
		if (e.t - this.lastAt > GESTURE_GAP_MS) {
			this.decided = null;
			this.step = 0;
			this.sawX = this.sawY = false;
		}
		this.lastAt = e.t;
		if (this.decided !== null) return this.decided;
		if (e.deltaMode !== 0) return (this.decided = "wheel");
		if (e.deltaX !== 0) this.sawX = true;
		if (e.deltaY !== 0) this.sawY = true;
		const size = Math.max(Math.abs(e.deltaX), Math.abs(e.deltaY));
		if (size > 0) this.step = this.step === 0 ? size : commonStep(this.step, size);
		if ((this.sawX && this.sawY) || (this.step > 0 && this.step < MIN_WHEEL_STEP_PX)) return (this.decided = "touchpad");
		return "wheel";
	}
}

export interface WheelInput {
	deltaY: number;
	deltaMode: number;
	ctrlKey: boolean;
}

/**
 * Zoom per px of a touchpad swipe's scroll, against a wheel's: a swipe streams
 * deltas continuously (a wheel sends one big step a notch), and Chromium on
 * Linux inflates them to about 3.5 times the finger's travel, so at a wheel's
 * rate a short swipe would race through the whole depth.
 */
export const TOUCHPAD_ZOOM_GAIN = 0.6;

/**
 * How far wheel event `e` from `source` zooms, as ln of the zoom factor
 * (positive zooms in). `ctrlHeld` is whether the Control key is physically
 * down: Chromium sends a touchpad pinch as a ctrl-wheel without it, and that
 * keeps its x10 speed-up. A swipe scales by `TOUCHPAD_ZOOM_GAIN`, scrolling
 * down zooming out.
 */
export function wheelZoomStep(e: WheelInput, source: WheelSource, ctrlHeld: boolean): number {
	const pinch = e.ctrlKey && !ctrlHeld;
	const zoom = wheelLogZoom({ deltaY: e.deltaY, deltaMode: e.deltaMode, ctrlKey: pinch });
	return source === "touchpad" && !pinch ? zoom * TOUCHPAD_ZOOM_GAIN : zoom;
}
