/**
 * Wheel events in the 3D view: telling a touchpad's two-finger swipe from a
 * mouse wheel, and what each event does. A swipe turns the view like a drag
 * (Shift: pans; Ctrl: zooms at the wheel's rate); a mouse wheel and a pinch
 * zoom, as they always did. There is no setting, so when unsure it is a wheel.
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

/** What a wheel event does to the view. Drag deltas are in client px, as a pointer would move. */
export type WheelAction = { kind: "zoom"; logZoom: number } | { kind: "rotate" | "pan"; dx: number; dy: number };

export interface WheelInput {
	deltaX: number;
	deltaY: number;
	deltaMode: number;
	ctrlKey: boolean;
	shiftKey: boolean;
}

/**
 * What wheel event `e` from `source` does. `ctrlHeld` is whether the Control
 * key is physically down: Chromium sends a touchpad pinch as a ctrl-wheel
 * without it, and that keeps its ×10 speed-up. A real Ctrl + scroll zooms at
 * the plain wheel's rate.
 *
 * A touchpad swipe moves the content with the fingers, the way the OS scrolls
 * a page (the opposite of the scroll delta): it turns the view like a drag,
 * pans with Shift, and with Ctrl zooms in as the fingers move up.
 */
export function wheelAction(e: WheelInput, source: WheelSource, ctrlHeld: boolean): WheelAction {
	const pinch = e.ctrlKey && !ctrlHeld;
	if (pinch || source === "wheel") return { kind: "zoom", logZoom: wheelLogZoom({ deltaY: e.deltaY, deltaMode: e.deltaMode, ctrlKey: pinch }) };
	if (e.ctrlKey) return { kind: "zoom", logZoom: wheelLogZoom({ deltaY: -e.deltaY, deltaMode: e.deltaMode, ctrlKey: false }) };
	return { kind: e.shiftKey ? "pan" : "rotate", dx: -e.deltaX, dy: -e.deltaY };
}
