import { describe, expect, it } from "vitest";
import { enclosingSphere, fitDistance, opensFitted } from "./fit";

describe("enclosingSphere", () => {
	it("is null for nothing", () => {
		expect(enclosingSphere([])).toBeNull();
	});

	it("centres on the bounding box and reaches the farthest edge", () => {
		const s = enclosingSphere([
			{ x: -10, y: 0, z: 0, r: 2 },
			{ x: 10, y: 0, z: 0, r: 2 },
			{ x: 0, y: 3, z: 0, r: 1 },
		])!;
		expect(s).toMatchObject({ x: 0, y: 1.5, z: 0 });
		expect(s.r).toBeCloseTo(Math.hypot(10, 1.5) + 2);
	});

	it("is the plate itself for one plate", () => {
		expect(enclosingSphere([{ x: 4, y: 5, z: 6, r: 3 }])).toEqual({ x: 4, y: 5, z: 6, r: 3 });
	});
});

describe("fitDistance", () => {
	it("stands the sphere inside the narrower side of the view", () => {
		const d = fitDistance(10, 60, 1, 1);
		expect(d * Math.sin((30 * Math.PI) / 180)).toBeCloseTo(10);
	});

	it("stands farther back for a narrow view than a wide one", () => {
		expect(fitDistance(10, 60, 0.5)).toBeGreaterThan(fitDistance(10, 60, 2));
	});

	it("grows with the radius and the margin", () => {
		expect(fitDistance(20, 60, 1.5)).toBeCloseTo(2 * fitDistance(10, 60, 1.5));
		expect(fitDistance(10, 60, 1.5, 2)).toBeGreaterThan(fitDistance(10, 60, 1.5, 1));
	});
});

describe("opensFitted", () => {
	it("fits a plain open: the note header's map button, the command, the file menu", () => {
		expect(opensFitted({ focus: "Sailing.md" })).toBe(true);
		expect(opensFitted({ focus: "Sailing.md", node: null, subpath: "" })).toBe(true);
		expect(opensFitted(undefined)).toBe(true);
	});

	it("lands on a named plate, line or lift-off instead", () => {
		expect(opensFitted({ focus: "Sailing.md", node: "Sailing.md#3" })).toBe(false);
		expect(opensFitted({ focus: "Sailing.md", subpath: "Rigging" })).toBe(false);
		expect(opensFitted({ focus: "Sailing.md", liftOff: { boxes: [] } })).toBe(false);
	});
});
