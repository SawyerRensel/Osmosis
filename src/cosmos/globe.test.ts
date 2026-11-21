import { describe, it, expect } from "vitest";
import { Vector3 } from "three";
import { GRIP_LIMIT, grabPoint, gripPoint, slipRate, sphereOnRay, stickyTurn } from "./globe";
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

describe("sphereOnRay", () => {
	const origin = new Vector3(0, 0, 100);
	const ahead = new Vector3(0, 0, -1);

	it("finds the sphere the ray meets, where and how far along", () => {
		const planet = { centre: new Vector3(0, 0, 0), radius: 10 };
		const hit = sphereOnRay(origin, ahead, [planet]);
		expect(hit?.sphere).toBe(planet);
		expect(hit?.distance).toBeCloseTo(90);
		expect(hit?.point.distanceTo(new Vector3(0, 0, 10))).toBeCloseTo(0);
	});

	it("meets a sphere off its centre, between where plates would sit", () => {
		const planet = { centre: new Vector3(0, 0, 0), radius: 10 };
		const direction = new Vector3(6, 0, 0).sub(origin).normalize();
		const hit = sphereOnRay(origin, direction, [planet]);
		expect(hit).not.toBeNull();
		expect(hit!.point.length()).toBeCloseTo(10);
		expect(hit!.point.z).toBeGreaterThan(0);
	});

	it("is null when the ray passes beside every sphere, or there are none", () => {
		const planets = [
			{ centre: new Vector3(30, 0, 0), radius: 10 },
			{ centre: new Vector3(-30, 0, 0), radius: 10 },
		];
		expect(sphereOnRay(origin, ahead, planets)).toBeNull();
		expect(sphereOnRay(origin, ahead, [])).toBeNull();
	});

	it("ignores a sphere behind the ray's origin", () => {
		expect(sphereOnRay(origin, ahead, [{ centre: new Vector3(0, 0, 200), radius: 10 }])).toBeNull();
	});

	it("picks the nearer of two spheres on the ray, in either order", () => {
		const far = { centre: new Vector3(0, 0, -100), radius: 40 };
		const near = { centre: new Vector3(0, 0, 20), radius: 5 };
		expect(sphereOnRay(origin, ahead, [far, near])?.sphere).toBe(near);
		expect(sphereOnRay(origin, ahead, [near, far])?.sphere).toBe(near);
		expect(sphereOnRay(origin, ahead, [near, far])?.distance).toBeCloseTo(75);
	});

	it("from inside a sphere, meets it on the way out", () => {
		const planet = { centre: new Vector3(0, 0, 90), radius: 20 };
		const hit = sphereOnRay(origin, ahead, [planet]);
		expect(hit?.sphere).toBe(planet);
		expect(hit?.point.distanceTo(new Vector3(0, 0, 70))).toBeCloseTo(0);
	});

	it("agrees with grabPoint, so the drag starts on the point pressed", () => {
		const planet = { centre: new Vector3(5, -3, 0), radius: 12 };
		const direction = new Vector3(8, 2, 0).sub(origin).normalize();
		const hit = sphereOnRay(origin, direction, [planet]);
		expect(hit!.point.distanceTo(grabPoint(origin, direction, planet.centre, planet.radius))).toBeCloseTo(0);
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

describe("gripPoint", () => {
	const centre = new Vector3(0, 0, 0);
	const origin = new Vector3(0, 0, 40);
	const ray = (angle: number) => new Vector3(Math.sin(angle), 0, -Math.cos(angle));
	/** The view angle at which the ray meets the radius-10 sphere facing away from it by `incidence`. */
	const at = (incidence: number) => Math.asin((10 * Math.sin(incidence)) / 40);

	it("is the near hit while the surface faces the ray within GRIP_LIMIT", () => {
		expect(gripPoint(origin, ray(0), centre, 10)?.distanceTo(new Vector3(0, 0, 10))).toBeCloseTo(0, 9);
		const hit = gripPoint(origin, ray(at(GRIP_LIMIT - 0.01)), centre, 10);
		expect(hit?.distanceTo(sphereOnRay(origin, ray(at(GRIP_LIMIT - 0.01)), [{ centre, radius: 10 }])!.point)).toBeCloseTo(0, 9);
	});

	it("is null past GRIP_LIMIT, past the silhouette, and from inside the sphere", () => {
		expect(gripPoint(origin, ray(at(GRIP_LIMIT + 0.01)), centre, 10)).toBeNull();
		expect(gripPoint(origin, ray(0.5), centre, 10)).toBeNull();
		expect(gripPoint(new Vector3(0, 0, 5), ray(0), centre, 10)).toBeNull();
	});
});

describe("slipRate", () => {
	it("is the rate the surface turns under the pointer at GRIP_LIMIT", () => {
		const perPx = Math.tan(Math.PI / 7.2) / 400;
		const distance = 40;
		const radius = 10;
		// Surface angle from the near point under the ray `px` pixels from the core's place on screen.
		const surface = (px: number) => {
			const a = Math.atan(px * perPx);
			return Math.asin((distance * Math.sin(a)) / radius) - a;
		};
		const edge = Math.tan(Math.asin((radius * Math.sin(GRIP_LIMIT)) / distance)) / perPx;
		expect(slipRate(distance, radius, perPx)).toBeCloseTo((surface(edge + 1e-4) - surface(edge - 1e-4)) / 2e-4, 6);
	});

	it("is 0 from on or inside the surface", () => {
		expect(slipRate(10, 10, 0.001)).toBe(0);
		expect(slipRate(5, 10, 0.001)).toBe(0);
	});
});

/**
 * A planet drag the way `CosmosScene.rotate` runs it, from a camera looking
 * at a radius-10 planet at the origin: the grabbed point stays under the
 * pointer while the ray holds the surface (`gripPoint`), and slips into a
 * turn of `slipRate` per px (no faster than a plain orbit) once it doesn't,
 * grabbing again where the ray holds once more. Returns each step's turn and
 * how far (radians) the grabbed point sat from the pointer after each step
 * that held.
 */
function dragPlanet(distance: number, steps: [number, number][]): { turns: number[]; misses: number[]; camera: Vector3 } {
	const height = 800;
	const perPx = Math.tan(Math.PI / 7.2) / (height / 2);
	const centre = new Vector3(0, 0, 0);
	const camera = new Vector3(0, 0, distance);
	const target = new Vector3(0, 0, 0);
	const rayAt = (x: number, y: number) => {
		const forward = target.clone().sub(camera).normalize();
		const right = forward.clone().cross(UP).normalize();
		const up = right.clone().cross(forward);
		return forward.addScaledVector(right, x * perPx).addScaledVector(up, -y * perPx).normalize();
	};
	let x = 0;
	let y = 0;
	let grabbed: Vector3 | null = gripPoint(camera, rayAt(x, y), centre, 10);
	const turns: number[] = [];
	const misses: number[] = [];
	for (const [dx, dy] of steps) {
		x += dx;
		y += dy;
		const before = camera.clone();
		const hold = grabbed === null ? null : gripPoint(camera, rayAt(x, y), centre, 10);
		if (grabbed !== null && hold !== null) {
			const { yaw, pitch } = stickyTurn(camera, target, UP, centre, grabbed, hold);
			rotateAboutPivot(camera, target, centre, yaw, pitch, UP);
			misses.push(seen(camera, target, grabbed).angleTo(new Vector3(x * perPx, -y * perPx, 1).normalize()));
		} else {
			const rate = Math.min(slipRate(camera.distanceTo(centre), 10, perPx), (2 * Math.PI) / height);
			rotateAboutPivot(camera, target, centre, -rate * dx, -rate * dy, UP);
			grabbed = gripPoint(camera, rayAt(x, y), centre, 10);
		}
		turns.push(before.angleTo(camera));
	}
	return { turns, misses, camera };
}

const repeat = (n: number, step: [number, number]): [number, number][] => Array.from({ length: n }, () => step);

describe("a planet drag past the planet's edge", () => {
	it("keeps turning at an even rate, with no leap where the grab slips", () => {
		const perPx = Math.tan(Math.PI / 7.2) / 400;
		const slip = slipRate(40, 10, perPx) * 10;
		for (const step of [
			[10, 0],
			[-10, 0],
			[10, 6],
		] as [number, number][]) {
			// 2000 px: far past the disc (about 220 px across from its centre) and off any view.
			const { turns } = dragPlanet(40, repeat(200, step));
			// Before, a 10 px step near the rim turned the planet up to 0.44 rad, and then every step past it turned it not at all.
			expect(Math.max(...turns)).toBeLessThan(slip * Math.hypot(...step) / 10 * 1.05);
			expect(Math.min(...turns)).toBeGreaterThan(0);
		}
	});

	it("turns back when the drag reverses, and grabs again on the disc with the point under the pointer", () => {
		const { turns, misses, camera } = dragPlanet(40, [...repeat(100, [10, 0]), ...repeat(100, [-10, 0])]);
		expect(Math.min(...turns)).toBeGreaterThan(0);
		// It came back over the disc and held.
		expect(misses.length).toBeGreaterThan(20);
		expect(Math.max(...misses)).toBeLessThan(1e-6);
		// Back where it started: the same distance out and back undoes the same turn.
		expect(camera.distanceTo(new Vector3(0, 0, 40))).toBeLessThan(0.5);
	});

	it("turns a small, far planet no faster than a plain orbit once off it", () => {
		const { turns } = dragPlanet(1000, repeat(200, [10, 0]));
		expect(Math.max(...turns.slice(10))).toBeLessThanOrEqual((2 * Math.PI * 10) / 800 + 1e-9);
		expect(Math.min(...turns)).toBeGreaterThan(0);
	});
});
