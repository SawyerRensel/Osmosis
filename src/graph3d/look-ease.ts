/**
 * Easing for the 3D graph's mouse-look.
 *
 * A mouse-look drag does not turn the camera at once: its pixel deltas pile up
 * as a pending turn, and each frame the camera takes a share of it. The share
 * is exponential in elapsed time, so it is the same however the frames fall,
 * and what is left when the button is released keeps easing out.
 */

/** Time constant of the ease, in seconds: about this long to cover 63% of a pending turn. */
export const LOOK_EASE_SECONDS = 0.1;
/** Below this many pending pixels the turn is dropped, so the glide ends rather than creeping forever. */
export const LOOK_EASE_EPSILON = 0.01;

export interface LookEaseStep {
	/** The part of the pending turn to apply this frame. */
	step: number;
	/** The part still pending. */
	remaining: number;
}

/** Take a frame's share of `pending` after `seconds`. The wheel's zoom glide eases the same way, in its own units (`epsilon`). */
export function easeLook(pending: number, seconds: number, tau = LOOK_EASE_SECONDS, epsilon = LOOK_EASE_EPSILON): LookEaseStep {
	if (Math.abs(pending) < epsilon) return { step: pending, remaining: 0 };
	const step = pending * (1 - Math.exp(-Math.max(0, seconds) / tau));
	const remaining = pending - step;
	return Math.abs(remaining) < epsilon ? { step: pending, remaining: 0 } : { step, remaining };
}
