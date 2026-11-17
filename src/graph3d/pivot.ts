/**
 * Camera rotation about a pivot, for the 3D graph's own drag handler. See the
 * `# Spec` section of `vault/Planner/Develop Mind-Map Graph View.md`
 * ("Navigation").
 *
 * OrbitControls can only orbit its own target. The graph also orbits the point
 * under the cursor and turns the camera in place (mouse-look), so rotation is
 * done here instead: the camera and the orbit target turn together as one rigid
 * rig about the pivot, and OrbitControls' `update()` then aims the camera at the
 * moved target. Orientation follows from the two points, so no roll creeps in.
 *
 * This imports `three` math, so only `Graph3DScene` (itself loaded lazily) may
 * import it.
 */

import { Quaternion, Vector3 } from "three";

/** Keeps the view direction this far (radians) from straight up or down, where `lookAt` loses its heading. */
export const POLE_MARGIN = 0.01;

/**
 * Turn the camera rig about `pivot` in place: `yaw` radians about `up`, then
 * `pitch` radians about the camera's right axis. A positive pitch tips the view
 * up. The pitch is clamped so the view never passes within `POLE_MARGIN` of
 * `up` or its opposite.
 *
 * With `pivot` at the camera, the camera stays put and only the target moves:
 * that is looking around. With `pivot` at the target, this is a plain orbit.
 */
export function rotateAboutPivot(
	camera: Vector3,
	target: Vector3,
	pivot: Vector3,
	yaw: number,
	pitch: number,
	up: Vector3,
): void {
	// Polar angle of the camera seen from the target, as OrbitControls measures it.
	// A pitch about the right axis changes it by exactly the pitch.
	const offset = camera.clone().sub(target);
	const polar = offset.angleTo(up);
	const clamped = Math.min(Math.PI - POLE_MARGIN - polar, Math.max(POLE_MARGIN - polar, pitch));

	const right = target.clone().sub(camera).cross(up);
	const rotation = new Quaternion().setFromAxisAngle(up, yaw);
	if (right.lengthSq() > 0) rotation.multiply(new Quaternion().setFromAxisAngle(right.normalize(), clamped));

	camera.sub(pivot).applyQuaternion(rotation).add(pivot);
	target.sub(pivot).applyQuaternion(rotation).add(pivot);
}
