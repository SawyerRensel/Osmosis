import { describe, it, expect } from "vitest";
import { Vector3 } from "three";
import { POLE_MARGIN, rotateAboutPivot } from "./pivot";

const UP = new Vector3(0, 1, 0);

function expectNear(actual: Vector3, expected: [number, number, number]): void {
	expect(actual.x).toBeCloseTo(expected[0], 6);
	expect(actual.y).toBeCloseTo(expected[1], 6);
	expect(actual.z).toBeCloseTo(expected[2], 6);
}

describe("rotateAboutPivot", () => {
	it("orbits the target when the pivot is the target", () => {
		const camera = new Vector3(0, 0, 10);
		const target = new Vector3(0, 0, 0);
		rotateAboutPivot(camera, target, target.clone(), Math.PI / 2, 0, UP);
		expectNear(camera, [10, 0, 0]);
		expectNear(target, [0, 0, 0]);
	});

	it("turns the view in place when the pivot is the camera", () => {
		const camera = new Vector3(0, 0, 10);
		const target = new Vector3(0, 0, 0);
		rotateAboutPivot(camera, target, camera.clone(), -Math.PI / 2, 0, UP);
		expectNear(camera, [0, 0, 10]);
		// Looking down -z, a negative yaw about +y turns the view to +x.
		expectNear(target, [10, 0, 10]);
	});

	it("moves camera and target rigidly about an off-axis pivot", () => {
		const camera = new Vector3(0, 0, 10);
		const target = new Vector3(0, 0, 0);
		const pivot = new Vector3(5, 0, 0);
		rotateAboutPivot(camera, target, pivot, Math.PI, 0, UP);
		expectNear(camera, [10, 0, -10]);
		expectNear(target, [10, 0, 0]);
		expect(camera.distanceTo(target)).toBeCloseTo(10, 6);
	});

	it("tips the view up for a positive pitch", () => {
		const camera = new Vector3(0, 0, 10);
		const target = new Vector3(0, 0, 0);
		rotateAboutPivot(camera, target, camera.clone(), 0, 0.3, UP);
		const look = target.clone().sub(camera).normalize();
		expect(look.y).toBeCloseTo(Math.sin(0.3), 6);
		expectNear(camera, [0, 0, 10]);
	});

	it("keeps the view clear of straight up and straight down", () => {
		for (const pitch of [10, -10]) {
			const camera = new Vector3(0, 0, 10);
			const target = new Vector3(0, 0, 0);
			rotateAboutPivot(camera, target, target.clone(), 0, pitch, UP);
			const polar = camera.clone().sub(target).angleTo(UP);
			expect(polar).toBeCloseTo(pitch > 0 ? Math.PI - POLE_MARGIN : POLE_MARGIN, 6);
		}
	});

	it("introduces no roll: the camera's right axis stays level", () => {
		const camera = new Vector3(3, 4, 10);
		const target = new Vector3(-2, 1, 0);
		rotateAboutPivot(camera, target, new Vector3(1, -2, 4), 0.7, -0.4, UP);
		const right = target.clone().sub(camera).cross(UP);
		expect(right.y).toBeCloseTo(0, 9);
	});
});
