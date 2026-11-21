import { describe, expect, it } from "vitest";
import { PLATE_END_ATTRIBUTES, onOwnPlate, patchOwnPlate, plateInView, writePlateEnd } from "./own-plate";

// View space: the camera at the origin looking down −z.
const D = 100;
// A line plate 30 × 5 world units, as a billboard 100 units ahead.
const billboard = plateInView({ x: 0, y: 0, z: -D }, 15, 2.5, null);

describe("onOwnPlate", () => {
	it("hides an edge leaving its node toward the camera, where it is over the plate", () => {
		// 45° toward the camera: 5 units right of the centre it is 5 units nearer.
		expect(onOwnPlate({ x: 5, y: 0, z: -D + 5 }, billboard)).toBe(true);
		// Nearly straight at the camera: 40 units nearer, still over the text.
		expect(onOwnPlate({ x: 1, y: 0.5, z: -D + 40 }, billboard)).toBe(true);
	});

	it("draws it once it leaves the plate on screen", () => {
		// 20 units right and 20 nearer: at the plate's depth that is 20 · 100/80 = 25 right, past the 15 half width.
		expect(onOwnPlate({ x: 20, y: 0, z: -D + 20 }, billboard)).toBe(false);
		expect(onOwnPlate({ x: 0, y: 4, z: -D + 1 }, billboard)).toBe(false);
	});

	it("leaves a fragment behind the plate to the depth test", () => {
		expect(onOwnPlate({ x: 5, y: 0, z: -D - 5 }, billboard)).toBe(false);
	});

	it("never hides anything for an end with no plate", () => {
		expect(onOwnPlate({ x: 0, y: 0, z: -50 }, plateInView({ x: 0, y: 0, z: -D }, 0, 0, null))).toBe(false);
	});

	it("tests a planet's plate along its own axes, spun upright", () => {
		// Lying tilted 60° away from the camera about the screen's x axis, seen straight on.
		const c = Math.cos(Math.PI / 3);
		const s = Math.sin(Math.PI / 3);
		const plate = plateInView({ x: 0, y: 0, z: -D }, 15, 2.5, { right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: c, z: -s } });
		// Upright already: no spin.
		expect(plate.right.x).toBeCloseTo(15);
		expect(plate.up.y).toBeCloseTo(2.5 * c);
		// Its top edge is 2.5·cos60 = 1.25 up on screen (at the plate's depth); a point 2 up is off it, 1 up is on it.
		expect(onOwnPlate({ x: 0, y: 1 * 0.9, z: -D * 0.9 }, plate)).toBe(true);
		expect(onOwnPlate({ x: 0, y: 2 * 0.9, z: -D * 0.9 }, plate)).toBe(false);
	});
});

describe("real depth between an edge and another node's plate", () => {
	// The old fix drew every plate at 97% of its depth: 3 units nearer at 100.
	// A branch 1 unit in front of an unrelated plate lost the depth test to it.
	// Now only its own plates are tested; another plate's depth is left to the depth buffer.
	it("does not hide an edge over a plate that is not at either of its ends", () => {
		const other = plateInView({ x: 0, y: 0, z: -D }, 15, 2.5, null);
		const ownA = plateInView({ x: -40, y: 10, z: -D + 1 }, 15, 2.5, null);
		const ownB = plateInView({ x: 40, y: -10, z: -D + 1 }, 15, 2.5, null);
		const crossing = { x: 0, y: 0, z: -D + 1 };
		expect(onOwnPlate(crossing, ownA) || onOwnPlate(crossing, ownB)).toBe(false);
		// The same point, were `other` one of its ends, would pass under it.
		expect(onOwnPlate(crossing, other)).toBe(true);
	});
});

describe("writePlateEnd", () => {
	const arrays = () => ({ centre: new Float32Array(8), right: new Float32Array(8), up: new Float32Array(6) });

	it("writes the centre, half sizes and axes", () => {
		const a = arrays();
		writePlateEnd(a, 1, { x: 1, y: 2, z: 3, shape: { width: 30, height: 5 }, frame: { right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 } } });
		expect([...a.centre.slice(4)]).toEqual([1, 2, 3, 15]);
		expect([...a.right.slice(4)]).toEqual([1, 0, 0, 2.5]);
		expect([...a.up.slice(3)]).toEqual([0, 0, 1]);
	});

	it("writes no plate for an unplaced node or none", () => {
		const a = arrays();
		a.centre.fill(9);
		writePlateEnd(a, 0, { shape: { width: 30, height: 5 } });
		writePlateEnd(a, 1, null);
		expect(a.centre[3]).toBe(0);
		expect(a.centre[7]).toBe(0);
	});

	it("matches the attribute sizes", () => {
		expect(PLATE_END_ATTRIBUTES.aEndA).toBe(4);
		expect(PLATE_END_ATTRIBUTES.aEndARight).toBe(4);
		expect(PLATE_END_ATTRIBUTES.aEndAUp).toBe(3);
	});
});

describe("patchOwnPlate", () => {
	it("declares before main, passes to view space after fog, and discards first thing", () => {
		const shader = { vertexShader: "void main() {\n#include <fog_vertex>\n}", fragmentShader: "void main() {\ngl_FragColor = vec4(1.0);\n}" };
		patchOwnPlate(shader);
		expect(shader.vertexShader.indexOf("attribute vec4 aEndA;")).toBeLessThan(shader.vertexShader.indexOf("void main() {"));
		expect(shader.vertexShader.indexOf("vOwnView = mvPosition.xyz;")).toBeGreaterThan(shader.vertexShader.indexOf("#include <fog_vertex>"));
		const main = shader.fragmentShader.indexOf("void main() {");
		expect(shader.fragmentShader.indexOf("bool onOwnPlate")).toBeLessThan(main);
		expect(shader.fragmentShader.indexOf("discard")).toBeLessThan(shader.fragmentShader.indexOf("gl_FragColor"));
	});
});
