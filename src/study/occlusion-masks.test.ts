import { describe, it, expect } from "vitest";
import type { CardOcclusion, OcclusionMode, OcclusionShape } from "../database/types";
import { maskElements } from "./occlusion-masks";

/** Two shapes in the asked group, one in another, plus a third group. */
const shapes: OcclusionShape[] = [
	{ group: "c1", kind: "rect", x: 0.31, y: 0.22, w: 0.14, h: 0.06 },
	{ group: "c2", kind: "ellipse", x: 0.55, y: 0.4, rx: 0.08, ry: 0.05 },
	{ group: "c1", kind: "poly", points: [[0.2, 0.18], [0.42, 0.18], [0.31, 0.34]] },
];

function occlusion(mode: OcclusionMode, target = "c1"): CardOcclusion {
	return { image: "bridge.svg", mode, shapes, target };
}

describe("hide-all-guess-one", () => {
	it("covers every group on the front, marking the one being asked", () => {
		expect(maskElements(occlusion("hide-all-guess-one"), "front").map((m) => m.role))
			.toEqual(["target", "hidden", "target"]);
	});

	it("reveals only the target on the back, leaving the others covered", () => {
		expect(maskElements(occlusion("hide-all-guess-one"), "back").map((m) => m.role))
			.toEqual(["revealed", "hidden", "revealed"]);
	});
});

describe("hide-one-guess-one", () => {
	it("covers only the target on the front", () => {
		const painted = maskElements(occlusion("hide-one-guess-one"), "front");
		expect(painted.map((m) => m.role)).toEqual(["target", "target"]);
	});

	it("paints nothing but the target's outline on the back", () => {
		const painted = maskElements(occlusion("hide-one-guess-one"), "back");
		expect(painted.map((m) => m.role)).toEqual(["revealed", "revealed"]);
	});

	it("never paints a sibling group, so the rest of the image stays readable", () => {
		const painted = maskElements(occlusion("hide-one-guess-one", "c2"), "front");
		expect(painted).toHaveLength(1);
		expect(painted[0]!.tag).toBe("ellipse");
	});
});

describe("shape geometry", () => {
	it("keeps rect coordinates in the normalised 0–1 space", () => {
		const [rect] = maskElements(occlusion("hide-one-guess-one"), "front");
		expect(rect).toEqual({
			tag: "rect",
			role: "target",
			attrs: { x: "0.31", y: "0.22", width: "0.14", height: "0.06" },
		});
	});

	it("treats an ellipse's x/y as its centre", () => {
		const [ellipse] = maskElements(occlusion("hide-one-guess-one", "c2"), "front");
		expect(ellipse).toEqual({
			tag: "ellipse",
			role: "target",
			attrs: { cx: "0.55", cy: "0.4", rx: "0.08", ry: "0.05" },
		});
	});

	it("renders a poly as an SVG points list", () => {
		const painted = maskElements(occlusion("hide-one-guess-one"), "front");
		expect(painted[1]).toEqual({
			tag: "polygon",
			role: "target",
			attrs: { points: "0.2,0.18 0.42,0.18 0.31,0.34" },
		});
	});
});

describe("grouping", () => {
	it("paints every shape of a multi-shape group as one answer", () => {
		const painted = maskElements(occlusion("hide-all-guess-one"), "front");
		const targets = painted.filter((m) => m.role === "target");
		expect(targets.map((m) => m.tag)).toEqual(["rect", "polygon"]);
	});

	it("paints nothing when the target group has no shapes on this image", () => {
		expect(maskElements(occlusion("hide-one-guess-one", "c9"), "front")).toEqual([]);
	});
});
