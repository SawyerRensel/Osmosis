/**
 * Focus dimming: plates and edges away from the focus depth mix toward the
 * background colour, on top of the mist, so a dense cluster reads as in front
 * of and behind the node you're looking at. See
 * `vault/Planner/3D Graph - Focus dimming.md`.
 *
 * The focus depth is the view depth of the orbit target. Ramp lengths are in
 * focus depths, so the dim scales with how far away you're looking.
 * `FOCUS_DIM_GLSL` is the same curve for the shaders; keep the two in step.
 */

/** Strongest dim behind the focus, as a share of the way to the background colour. */
export const FOCUS_DIM_BEHIND = 0.7;
/** Strongest dim in front of the focus: lighter, so nearer plates don't vanish. */
export const FOCUS_DIM_FRONT = 0.3;
/** Behind the focus, the dim reaches its maximum this many focus depths further on. */
export const FOCUS_RAMP_BEHIND = 1;
/** In front, the dim reaches its maximum this many focus depths nearer (1 = at the camera). */
export const FOCUS_RAMP_FRONT = 1;

function smoothstep(t: number): number {
	const x = Math.min(1, Math.max(0, t));
	return x * x * (3 - 2 * x);
}

/**
 * How far (0–1) something at view `depth` is mixed toward the background,
 * with the focus at view depth `focus`. 0 at the focus, rising smoothly on
 * either side to its maximum.
 */
export function focusDim(depth: number, focus: number): number {
	const f = Math.max(focus, 1e-3);
	const offset = (depth - f) / f;
	return offset >= 0 ? FOCUS_DIM_BEHIND * smoothstep(offset / FOCUS_RAMP_BEHIND) : FOCUS_DIM_FRONT * smoothstep(-offset / FOCUS_RAMP_FRONT);
}

const glsl = (n: number): string => n.toFixed(4);

/** `focusDim` for the shaders: needs `uniform float uFocus`, then call `focusDim(viewDepth)`. */
export const FOCUS_DIM_GLSL = /* glsl */ `
uniform float uFocus;
float focusDim(float depth) {
	float f = max(uFocus, 1e-3);
	float offset = (depth - f) / f;
	return offset >= 0.0
		? ${glsl(FOCUS_DIM_BEHIND)} * smoothstep(0.0, 1.0, offset / ${glsl(FOCUS_RAMP_BEHIND)})
		: ${glsl(FOCUS_DIM_FRONT)} * smoothstep(0.0, 1.0, -offset / ${glsl(FOCUS_RAMP_FRONT)});
}
`;

/**
 * How much of a node's own colour survives at view `depth` (0–1), as the
 * plate shaders compute it: its arrival/departure `opacity`, less the focus
 * dim, less the `FogExp2` mist of `density`. The near tier's DOM panels use it
 * so they fade into the mist exactly with the plates underneath them.
 */
export function plateVisibility(opacity: number, depth: number, focus: number, density: number): number {
	const mist = density * depth;
	return opacity * (1 - focusDim(depth, focus)) * Math.exp(-mist * mist);
}
