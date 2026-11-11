import { describe, it, expect } from "vitest";
import { Vector3 } from "three";
import { grabPoint, stickyTurn } from "./globe";
import { rotateAboutPivot } from "./pivot";

const UP = new Vector3(0, 1, 0);

/** Where `point` shows from a camera at `camera` looking at `target` (no roll): its view direction in camera axes. */
function seen(camera: Vector3, target: Vector3, point: Vector3): Vector3 {
	const forward = target.clone().sub(camera).normalize();
	const right = forward.clone().cross(UP).normalize();
	const up = right.clone().cross(forward);
	const d = point.clone().sub(camera).normalize();
	return new Vector3(d.dot(right), d.dot(up), d.dot(forward));
}

/** Turn the rig by `stickyTurn` and say how far (radians of view angle) the grabbed point lands from where `aim` showed. */
function miss(camera: Vector3, target: Vector3, centre: Vector3, grabbed: Vector3, aim: Vector3): number {
	const before = seen(camera, target, aim);
	const { yaw, pitch } = stickyTurn(camera, target, UP, centre, grabbed, aim);
	const cam = camera.clone();
	const tgt = target.clone();
	rotateAboutPivot(cam, tgt, centre, yaw, pitch, UP);
	return seen(cam, tgt, grabbed).angleTo(before);
}

/** The point at `lat`, `lon` (radians) on the sphere about `centre`, +z facing a camera on the +z axis. */
function onSphere(centre: Vector3, radius: number, lat: number, lon: number): Vector3 {
	return new Vector3(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)).multiplyScalar(radius).add(centre);
}

describe("grabPoint", () => {
	it("is the near hit of a ray that meets the sphere", () => {
		const p = grabPoint(new Vector3(0, 0, 10), new Vector3(0, 0, -1), new Vector3(0, 0, 0), 2);
		expect(p.z).toBeCloseTo(2, 9);
		expect(p.x).toBeCloseTo(0, 9);
	});

	it("holds a ray past the silhouette at the rim on the cursor's side, continuous with the grazing hit", () => {
		const centre = new Vector3(0, 0, 0);
		const origin = new Vector3(0, 0, 10);
		const edge = Math.asin(2 / 10);
		const ray = (angle: number) => new Vector3(Math.sin(angle), 0, -Math.cos(angle));
		const inside = grabPoint(origin, ray(edge - 1e-6), centre, 2);
		const outside = grabPoint(origin, ray(edge + 1e-6), centre, 2);
		expect(inside.distanceTo(outside)).toBeLessThan(0.01);
		const far = grabPoint(origin, ray(edge + 0.5), centre, 2);
		expect(far.distanceTo(outside)).toBeLessThan(1e-4);
		expect(far.length()).toBeCloseTo(2, 9);
		// A tangent point: square to the line of sight.
		expect(far.clone().sub(origin).dot(far)).toBeCloseTo(0, 9);
		// On the cursor's side.
		expect(grabPoint(origin, ray(-edge - 0.5), centre, 2).x).toBeLessThan(0);
	});
});

describe("stickyTurn", () => {
	it("keeps the grabbed point under the cursor at any distance and planet size", () => {
		for (const radius of [5, 60, 400]) {
			for (const away of [1.5, 4, 20]) {
				const centre = new Vector3(30, -10, 5);
				const camera = centre.clone().add(new Vector3(0, radius * 0.3, radius * away));
				const target = centre.clone();
				const grabbed = onSphere(centre, radius, 0.2, -0.15);
				for (const [lat, lon] of [
					[0.25, -0.1],
					[0.1, 0.2],
					[-0.3, 0.05],
					[0.5, -0.4],
				] as const) {
					const aim = onSphere(centre, radius, lat, lon);
					expect(miss(camera, target, centre, grabbed, aim)).toBeLessThan(1e-6);
				}
			}
		}
	});

	it("turns the globe the way it is dragged: a drag to the right yaws the camera left about the core", () => {
		const centre = new Vector3(0, 0, 0);
		const grabbed = onSphere(centre, 10, 0, 0);
		const aim = onSphere(centre, 10, 0, 0.2);
		const { yaw, pitch } = stickyTurn(new Vector3(0, 0, 40), centre, UP, centre, grabbed, aim);
		expect(yaw).toBeCloseTo(-0.2, 6);
		expect(pitch).toBeCloseTo(0, 6);
	});

	it("is no turn when the cursor is still on the grabbed point", () => {
		const centre = new Vector3(0, 0, 0);
		const grabbed = onSphere(centre, 10, 0.3, 0.2);
		const { yaw, pitch } = stickyTurn(new Vector3(5, 8, 40), new Vector3(0, 2, 0), UP, centre, grabbed, grabbed.clone());
		expect(yaw).toBeCloseTo(0, 9);
		expect(pitch).toBeCloseTo(0, 9);
	});

	it("tracks from the target off to one side of the core, with the camera looking past it", () => {
		const centre = new Vector3(0, 0, 0);
		const camera = new Vector3(20, 5, 60);
		const target = new Vector3(-10, 0, 0);
		const grabbed = onSphere(centre, 15, 0.1, 0.3);
		const aim = onSphere(centre, 15, 0.2, 0.45);
		expect(miss(camera, target, centre, grabbed, aim)).toBeLessThan(1e-6);
	});

	it("takes the smaller of the two pitches, so a drag never flips the globe over", () => {
		const centre = new Vector3(0, 0, 0);
		const grabbed = onSphere(centre, 10, 0.4, 0);
		const aim = onSphere(centre, 10, 0.45, 0);
		const { pitch } = stickyTurn(new Vector3(0, 0, 40), centre, UP, centre, grabbed, aim);
		expect(Math.abs(pitch)).toBeLessThan(0.1);
	});

	it("is finite and comes as close as it can when the grabbed height is out of reach near a pole", () => {
		const centre = new Vector3(0, 0, 0);
		const camera = new Vector3(0, 0, 40);
		const grabbed = onSphere(centre, 10, 1.4, 0);
		// Far round to the side, where no pitch about the right axis reaches the grabbed point's height.
		const aim = new Vector3(10, 0, 0);
		const { yaw, pitch } = stickyTurn(camera, centre, UP, centre, grabbed, aim);
		expect(Number.isFinite(yaw)).toBe(true);
		expect(Number.isFinite(pitch)).toBe(true);
	});

	it("does nothing when the camera looks straight along up", () => {
		const centre = new Vector3(0, 0, 0);
		expect(stickyTurn(new Vector3(0, 40, 0), centre, UP, centre, onSphere(centre, 10, 0, 0), onSphere(centre, 10, 0, 0.3))).toEqual({ yaw: 0, pitch: 0 });
	});
});
