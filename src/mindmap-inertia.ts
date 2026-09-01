/**
 * Touch inertia maths for the mind map viewport.
 *
 * Kept out of `MindMapView.ts` so it can be unit-tested: that file imports
 * `obsidian`, which Vitest cannot resolve. Everything here is pure — the view
 * owns the rAF loop, the pointer plumbing and the viewBox itself.
 *
 * Time is milliseconds, distance is viewBox user units unless a parameter says
 * otherwise, and decay is expressed as a continuous rate so a dropped frame
 * costs the same travel as two on-time ones.
 */

/** A pointer position stamped with the time it was observed. */
export interface Sample {
	x: number;
	y: number;
	t: number;
}

export interface Vec {
	x: number;
	y: number;
}

/** An inclusive interval of valid viewBox origins along one axis. */
export interface Range {
	lo: number;
	hi: number;
}

/** How far back a flick's velocity is averaged over. */
export const SAMPLE_WINDOW_MS = 100;

/**
 * A finger that paused before lifting is a placement, not a flick. If the last
 * movement is older than this, the gesture ends at rest.
 */
export const STALE_SAMPLE_MS = 60;

/**
 * Pan deceleration rate; 1/PAN_FRICTION ms is the velocity time constant.
 *
 * This is UIKit's `UIScrollView.DecelerationRate.normal` — 0.998 of the velocity
 * survives each millisecond — written as the continuous rate `-ln(0.998)` so it
 * survives a dropped frame. A flick therefore travels `velocity / PAN_FRICTION`
 * px: exactly linear in how hard it was thrown.
 */
export const PAN_FRICTION = 0.002;

/**
 * A release slower than this doesn't coast at all — the map stops under the
 * finger. Momentum is for throwing the map across the screen; a short
 * positioning drag that ends gently should land where it was let go rather than
 * drifting on for another half a screen.
 */
export const PAN_MIN_FLING_VELOCITY = 0.25;

/** Pan coast ends below this speed, in screen px/ms (50 px/s). */
export const PAN_MIN_VELOCITY = 0.05;

/**
 * Ceiling on an accumulated fling, in screen px/ms. Well above anything a hand
 * produces in one throw; it exists so a stack of flings cannot run away.
 */
export const PAN_MAX_VELOCITY = 12;

/**
 * Zoom deceleration rate, applied to log-scale velocity. Lower than the pan's
 * because finger travel caps how much zoom one pinch can cover — the coast is
 * what makes a big zoom change reachable in a single gesture.
 */
export const ZOOM_FRICTION = 0.004;

/** Zoom coast ends below this speed, in log-scale units/ms. */
export const ZOOM_MIN_VELOCITY = 0.0002;

/**
 * Apple's rubber-band constant. Overshoot is asymptotic to
 * `dimension * RUBBER_BAND_COEFFICIENT`, so the map can never be dragged more
 * than about half a screen past its bound however hard you pull.
 */
export const RUBBER_BAND_COEFFICIENT = 0.55;

/** Spring-back rate toward an exceeded bound. */
export const SPRING_RATE = 0.012;

/** A spring is settled once it is within this many screen px of its target. */
export const SPRING_EPSILON_PX = 0.5;

/**
 * Frames longer than this are treated as this long. A backgrounded view can
 * hand back a multi-second dt, which would teleport the map on resume.
 */
export const MAX_FRAME_MS = 48;

/**
 * Mean velocity over the trailing sample window, in units/ms.
 *
 * Averaging across the window rather than differencing the last two samples
 * keeps a single jittery event from throwing the fling off course.
 */
export function estimateVelocity(samples: Sample[], now: number): Vec {
	const last = samples[samples.length - 1];
	if (!last || now - last.t > STALE_SAMPLE_MS) return { x: 0, y: 0 };

	const cutoff = last.t - SAMPLE_WINDOW_MS;
	let first = last;
	for (let i = samples.length - 1; i >= 0; i--) {
		const s = samples[i];
		if (!s || s.t < cutoff) break;
		first = s;
	}

	const dt = last.t - first.t;
	if (dt <= 0) return { x: 0, y: 0 };
	return { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt };
}

/**
 * The velocity a fling launches at: the flick that ended the drag, plus
 * whatever momentum the same touch interrupted on its way down.
 *
 * Flicking again while the map is still coasting *adds* to it, the way a scroll
 * view does — repeated throws in one direction keep gaining speed instead of
 * each one restarting from its own flick. Three constraints keep that honest:
 *
 * - The carried velocity decays across `heldMs`, the time the finger spent on
 *   the glass, at the same rate the coast would have. Stopping the map, holding
 *   it, then flicking gets no free momentum.
 * - It is only carried when the new flick agrees with it in direction, so a
 *   flick back the other way turns the map around instead of fighting itself.
 * - A release below `PAN_MIN_FLING_VELOCITY` is a placement, not a throw: it
 *   coasts nowhere, and drops the carry with it, which is what makes a tap on a
 *   moving map stop it dead.
 */
export function launchVelocity(flick: Vec, carry: Vec, heldMs: number): Vec {
	if (Math.hypot(flick.x, flick.y) < PAN_MIN_FLING_VELOCITY) {
		return { x: 0, y: 0 };
	}
	const decay = Math.exp(-PAN_FRICTION * Math.max(heldMs, 0));
	const combine = (flicked: number, carried: number): number => {
		const kept = carried * decay;
		const total = Math.sign(flicked) === Math.sign(kept) ? flicked + kept : flicked;
		return Math.max(-PAN_MAX_VELOCITY, Math.min(PAN_MAX_VELOCITY, total));
	};
	return {
		x: combine(flick.x, carry.x),
		y: combine(flick.y, carry.y),
	};
}

/** Drop samples that have aged out of the velocity window. */
export function pruneSamples(samples: Sample[], now: number): Sample[] {
	return samples.filter((s) => s.t >= now - SAMPLE_WINDOW_MS);
}

/**
 * Advance one frame of exponential decay.
 *
 * `delta` is the exact integral of the decaying velocity across `dt`, not
 * `velocity * dt`, so the total distance a flick travels does not depend on the
 * frame rate it was animated at.
 */
export function integrateDecay(
	velocity: number,
	friction: number,
	dt: number,
): { velocity: number; delta: number } {
	if (dt <= 0 || friction <= 0) return { velocity, delta: 0 };
	const decay = Math.exp(-friction * dt);
	return {
		velocity: velocity * decay,
		delta: (velocity / friction) * (1 - decay),
	};
}

/**
 * How much content has to stay on screen along each axis, in screen px.
 *
 * The bound is deliberately loose. Panning past the last node is *useful* —
 * it is how you make room before adding a child that would otherwise be laid
 * out off screen — so the rubber band only catches the map when the last sliver
 * of it is about to leave the viewport, at any zoom level.
 */
export const KEEP_VISIBLE_PX = 48;

/**
 * The valid range for a viewBox origin along one axis: every position where at
 * least `keepVisible` of the content is still on screen.
 *
 * Content spans `[0, contentExtent]` in viewBox user units — `getOffsetX/Y`
 * place the layout's top-left at `LAYOUT_PADDING`, which is the frame
 * `fitToView` works in. For a viewport `[x, x + viewportExtent]`, an overlap of
 * at least `keepVisible` with `[0, contentExtent]` gives `x >= keepVisible -
 * viewportExtent` on one side and `x <= contentExtent - keepVisible` on the
 * other.
 *
 * The two bounds only cross for content and viewport that together measure less
 * than one sliver, which real layouts never hit; that case pins the axis at the
 * midpoint rather than inverting.
 */
export function clampRange(
	contentExtent: number,
	viewportExtent: number,
	keepVisible: number,
): Range {
	const lo = keepVisible - viewportExtent;
	const hi = contentExtent - keepVisible;
	if (lo > hi) {
		const mid = (lo + hi) / 2;
		return { lo: mid, hi: mid };
	}
	return { lo, hi };
}

/** Signed distance outside the range; 0 when inside it. */
export function overshoot(value: number, range: Range): number {
	if (value < range.lo) return value - range.lo;
	if (value > range.hi) return value - range.hi;
	return 0;
}

/**
 * Apple's rubber-band curve: monotonic in `distance`, starting out at
 * `coefficient` of the pull and flattening toward `dimension`. So the first
 * pixels past the bound still track the finger, and no pull however hard drags
 * the map more than one viewport past its edge.
 */
export function rubberBand(
	distance: number,
	dimension: number,
	coefficient = RUBBER_BAND_COEFFICIENT,
): number {
	if (distance <= 0 || dimension <= 0) return 0;
	return (1 - 1 / ((distance * coefficient) / dimension + 1)) * dimension;
}

/**
 * Where a raw (unclamped) drag position should actually be drawn: unchanged
 * inside the range, damped by the rubber-band curve outside it.
 */
export function applyRubberBand(value: number, range: Range, dimension: number): number {
	const over = overshoot(value, range);
	if (over === 0) return value;
	const bound = over < 0 ? range.lo : range.hi;
	return bound + Math.sign(over) * rubberBand(Math.abs(over), dimension);
}

/** One frame of exponential ease toward `target`. */
export function springStep(
	value: number,
	target: number,
	dt: number,
	rate = SPRING_RATE,
): number {
	if (dt <= 0) return value;
	return value + (target - value) * (1 - Math.exp(-rate * dt));
}

/** The bound an out-of-range value should spring back to. */
export function springTarget(value: number, range: Range): number {
	if (value < range.lo) return range.lo;
	if (value > range.hi) return range.hi;
	return value;
}
