/**
 * Planets mode's core layer shells, drawn: with Core layers above 1, each
 * inner shell of a planet (1…N−1; the surface, shell N, is drawn by its
 * plates alone, as it always was) shows as a faint translucent sphere that
 * fades out as the camera comes close to it and is gone once the camera is
 * inside it, so the plates on the shells within read clearly. See
 * `vault/Planner/3D Graph - Planet core layer shells drawn.md`.
 *
 * `SHELL_FADE_GLSL` is `shellFade` for the shader; keep the two in step.
 *
 * Pure: no `three` or `obsidian` import, so it is unit-tested directly.
 */

/** A shell's opacity at its rim (where it turns edge-on), fully shown. */
export const SHELL_ALPHA = 0.16;
/** The share of `SHELL_ALPHA` a shell keeps where it faces the camera: it veils the plates within only faintly. */
export const SHELL_FACE_SHARE = 0.2;
/** A shell is fully shown while the camera is at least this many radii from its centre… */
export const SHELL_FADE_FAR = 1.6;
/** …and gone once the camera is this close (just outside it) or inside it. */
export const SHELL_FADE_NEAR = 1.05;

/** How much of a shell of `radius` shows (0…1) with the camera `distance` from its centre: a smoothstep from `SHELL_FADE_NEAR` to `SHELL_FADE_FAR` radii. */
export function shellFade(distance: number, radius: number): number {
	if (radius <= 0) return 0;
	const t = Math.min(1, Math.max(0, (distance / radius - SHELL_FADE_NEAR) / (SHELL_FADE_FAR - SHELL_FADE_NEAR)));
	return t * t * (3 - 2 * t);
}

/**
 * The radius a grab on a planet holds: the outermost of its surface and inner
 * `shells` that the camera, `distance` from the centre, is still outside of,
 * so the plates under the pointer are the ones that turn with it. From
 * outside the surface that is the surface (as with one layer); from inside
 * the innermost shell it stays the surface too (the old grab from inside).
 */
export function grabRadius(distance: number, surface: number, shells: readonly number[]): number {
	if (distance > surface) return surface;
	let best = 0;
	for (const r of shells) if (r < distance && r > best) best = r;
	return best > 0 ? best : surface;
}

/** `shellFade(distance, radius)` for a shader. */
export const SHELL_FADE_GLSL = /* glsl */ `
float shellFade(float eyeDistance, float shellRadius) {
	return shellRadius <= 0.0 ? 0.0 : smoothstep(${SHELL_FADE_NEAR.toFixed(4)}, ${SHELL_FADE_FAR.toFixed(4)}, eyeDistance / shellRadius);
}
`;
