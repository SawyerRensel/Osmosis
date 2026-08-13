import { describe, it, expect } from "vitest";
import type { CardOcclusion, OcclusionMode, OcclusionShape } from "../database/types";
import { maskElements, needsAspect } from "./occlusion-masks";

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

/**
 * The note views — contextual study, a mind-map node, peek on a line. Nobody is
 * answering one of the diagram's questions there, so every group is a blank at
 * once and the mode has nothing to describe.
 */
describe("note views", () => {
	it("covers every group whatever the mode, with no target singled out", () => {
		for (const mode of ["hide-all-guess-one", "hide-one-guess-one"] as const) {
			expect(maskElements(occlusion(mode), "all-hidden").map((m) => m.role))
				.toEqual(["hidden", "hidden", "hidden"]);
		}
	});

	it("rings every group when revealed, so the answer still says where the questions were", () => {
		for (const mode of ["hide-all-guess-one", "hide-one-guess-one"] as const) {
			expect(maskElements(occlusion(mode), "all-revealed").map((m) => m.role))
				.toEqual(["revealed", "revealed", "revealed"]);
		}
	});

	it("ignores the target, which the note has no way to choose", () => {
		const painted = maskElements({ ...occlusion("hide-all-guess-one"), target: "" }, "all-hidden");
		expect(painted.map((m) => m.role)).toEqual(["hidden", "hidden", "hidden"]);
	});

	it("paints the same shapes in the same order as a card side, so nothing reflows", () => {
		const hidden = maskElements(occlusion("hide-all-guess-one"), "all-hidden");
		const revealed = maskElements(occlusion("hide-all-guess-one"), "all-revealed");
		expect(hidden.map((m) => m.tag)).toEqual(revealed.map((m) => m.tag));
		expect(hidden.map((m) => m.attrs)).toEqual(revealed.map((m) => m.attrs));
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

describe("rotation", () => {
	const rotated: OcclusionShape[] = [
		{ group: "c1", kind: "rect", x: 0.3, y: 0.45, w: 0.4, h: 0.1, rotation: 90 },
		{ group: "c2", kind: "rect", x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
	];
	const turned: CardOcclusion = {
		image: "bridge.svg", mode: "hide-all-guess-one", shapes: rotated, target: "c1",
	};

	it("carries a rotated shape's angle as a transform, alongside its geometry", () => {
		const [mask] = maskElements(turned, "front", 2);

		expect(mask?.attrs["transform"]).toMatch(/^matrix\(/);
		expect(mask?.attrs["x"]).toBe("0.3");
	});

	it("leaves an unrotated shape with no transform at all", () => {
		// The overwhelmingly common case has to render exactly as it did before
		// rotation existed, attribute for attribute.
		expect(maskElements(turned, "front", 2)[1]?.attrs["transform"]).toBeUndefined();
	});

	it("bakes the aspect into the matrix, so the same shape paints differently", () => {
		// A rotation inside a `preserveAspectRatio="none"` overlay is applied
		// after the stretch, so the aspect has to be pre-compensated or a tilted
		// rectangle comes out a parallelogram.
		const wide = maskElements(turned, "front", 2)[0]?.attrs["transform"];
		const square = maskElements(turned, "front", 1)[0]?.attrs["transform"];

		expect(wide).not.toBe(square);
	});

	it("defaults to square, which is what a caller that cannot measure yet passes", () => {
		expect(maskElements(turned, "front")[0]?.attrs["transform"])
			.toBe(maskElements(turned, "front", 1)[0]?.attrs["transform"]);
	});
});

describe("needsAspect", () => {
	const base = { image: "bridge.svg", mode: "hide-all-guess-one" as const, target: "c1" };

	it("is false when nothing is rotated, so no load listener is ever registered", () => {
		expect(needsAspect({ ...base, shapes })).toBe(false);
	});

	it("is true as soon as one shape carries an angle", () => {
		expect(needsAspect({
			...base,
			shapes: [...shapes, { group: "c3", kind: "rect", x: 0, y: 0, w: 0.1, h: 0.1, rotation: 5 }],
		})).toBe(true);
	});
});
