/**
 * Momentum for the 3D graph's camera: a released drag spins, pans or zooms on
 * and slows to a stop, like the mind map's touch inertia, whose maths
 * (`src/mindmap-inertia.ts`: velocity estimate, frame-rate independent decay,
 * fling threshold) this builds on. What is new here is the spin, which coasts
 * in radians rather than screen pixels, since a grabbed planet turns by
 * however much keeps the surface under the cursor, not a fixed rate per pixel.
 */

import { PAN_FRICTION, PAN_MIN_FLING_VELOCITY, PAN_MIN_VELOCITY, integrateDecay, type Vec } from "../mindmap-inertia";

/**
 * How fast a coasting spin slows: 1/SPIN_FRICTION ms (500 ms) is its time
 * constant. The mind map's pan rate, so a thrown globe and a thrown map slow
 * alike. Tune the spin's feel here.
 */
export const SPIN_FRICTION = PAN_FRICTION;

/**
 * Ceiling on a spin's speed, in radians/ms (about 8 turns a second). Far above
 * a hand's flick at the orbit rate; it guards against the near-pole case, where
 * a small cursor move can need a large yaw to keep the surface under it.
 */
export const SPIN_MAX_VELOCITY = 0.05;

/** A velocity that decays to a stop: px/ms for a pan, radians/ms for a spin. */
export interface Coast {
	velocity: Vec;
	/** The coast ends once its speed falls below this. */
	stopBelow: number;
}

/**
 * A spin to launch on release, or null for none. `flick` is the pointer's own
 * velocity (px/ms), which decides whether the release was a throw at all, by
 * the mind map's threshold (`PAN_MIN_FLING_VELOCITY`): a still release, or a
 * slow one, is a placement and does not coast. `spin` is the turn the drag was
 * making (radians/ms), and `carry` what was left of a spin this press stopped,
 * `heldMs` ago: a flick the same way adds to it, as in the mind map.
 *
 * The spin stops at the speed where the pointer, turning the view at the
 * drag's own rate, would fall below the mind map's stopping speed.
 */
export function launchSpin(flick: Vec, spin: Vec, carry: Vec, heldMs: number): Coast | null {
	const speed = Math.hypot(flick.x, flick.y);
	const turning = Math.hypot(spin.x, spin.y);
	if (speed < PAN_MIN_FLING_VELOCITY || turning === 0) return null;
	const decay = Math.exp(-SPIN_FRICTION * Math.max(heldMs, 0));
	const combine = (flicked: number, carried: number): number => {
		const kept = carried * decay;
		const total = Math.sign(flicked) === Math.sign(kept) ? flicked + kept : flicked;
		return Math.max(-SPIN_MAX_VELOCITY, Math.min(SPIN_MAX_VELOCITY, total));
	};
	return { velocity: { x: combine(spin.x, carry.x), y: combine(spin.y, carry.y) }, stopBelow: (PAN_MIN_VELOCITY * turning) / speed };
}

/**
 * One frame (`ms`) of a coast slowing at `friction`: how far it moves on each
 * axis this frame, and whether it has now stopped. The step is the exact
 * integral of the decaying velocity, so a coast covers the same ground at 30
 * or 120 frames a second.
 */
export function stepCoast(coast: Coast, friction: number, ms: number): { delta: Vec; done: boolean } {
	const x = integrateDecay(coast.velocity.x, friction, ms);
	const y = integrateDecay(coast.velocity.y, friction, ms);
	coast.velocity = { x: x.velocity, y: y.velocity };
	return { delta: { x: x.delta, y: y.delta }, done: Math.hypot(x.velocity, y.velocity) < coast.stopBelow };
}

/**
 * Time constant, in seconds, of the wheel's zoom glide. A wheel notch (or a
 * trackpad's stream of small deltas) is not applied at once: it joins a
 * pending zoom that the camera takes a share of each frame, so the zoom starts
 * at once and decelerates to a stop. The total is exactly what the wheel asked
 * for, so a trackpad's own momentum events are smoothed, never compounded.
 */
export const WHEEL_EASE_SECONDS = 0.2;

/** Below this much pending ln(zoom) the glide is finished off, so it ends rather than creeping. */
export const WHEEL_EASE_EPSILON = 1e-4;
