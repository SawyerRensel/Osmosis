/**
 * Planets mode's far side: the hemisphere of a planet that faces away from
 * the camera. Its plates, edges and boundaries are drawn dimmed through the
 * planet instead of collapsed, and a plate seen from behind shows no text
 * (no glyphs, no near-tier panel). See
 * `vault/Planner/3D Graph - Boundaries in 3D and far side dimmed.md`.
 *
 * `FAR_SIDE_GLSL` is the same rule for the shaders; keep the two in step.
 *
 * Pure: no `three` or `obsidian` import, so it is unit-tested directly.
 */

import type { Vec3 } from "./flight";
import { facesEye } from "./tilt";

/** How far a far-side thing is dimmed, as a share of the way to the background (as `FOCUS_DIM_BEHIND` is). */
export const FAR_SIDE_DIM = 0.7;

/**
 * Whether a thing at `at`, front face (or outward surface normal) along
 * `normal`, is on the far side for an eye at `eye`: it faces away, or is seen
 * exactly edge-on. The plate shader's `plateBack` test.
 */
export function onFarSide(at: Vec3, normal: Vec3, eye: Vec3): boolean {
	return !facesEye(at, normal, eye);
}

/** The share of a thing's colour (or alpha) that survives: 1 on the near side, `1 - FAR_SIDE_DIM` on the far side. */
export function farSideKeep(far: boolean): number {
	return far ? 1 - FAR_SIDE_DIM : 1;
}

/**
 * Whether a node's text (plate glyphs, near-tier panel) is drawn: always for
 * a node that faces the camera (no `normal`: a billboard, a core, a star),
 * and for a planet's plate only while its front faces the eye.
 */
export function showsText(at: Vec3, normal: Vec3 | undefined, eye: Vec3): boolean {
	return normal === undefined || facesEye(at, normal, eye);
}

/** `farSideKeep(onFarSide(at, normal, cameraPosition))` for a shader (three's `cameraPosition` uniform, world space). */
export const FAR_SIDE_GLSL = /* glsl */ `
float farSideKeep(vec3 normal, vec3 at) {
	return dot(normal, cameraPosition - at) > 0.0 ? 1.0 : ${(1 - FAR_SIDE_DIM).toFixed(4)};
}
`;
