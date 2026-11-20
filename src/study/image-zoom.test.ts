import { describe, expect, it } from "vitest";
import {
	clampPan,
	FIT,
	isDoubleTap,
	isZoomed,
	panBy,
	pinchState,
	wheelZoomFactor,
	zoomAbout,
	zoomStyle,
	type ZoomState,
} from "./image-zoom";
import { ZOOM_MAX, ZOOM_STEP } from "./occlusion-geometry";

/** Where a box point lands on screen (box fractions) under `state`. */
function project(state: ZoomState, p: { x: number; y: number }): { x: number; y: number } {
	return { x: state.x + p.x * state.zoom, y: state.y + p.y * state.zoom };
}

describe("clampPan", () => {
	it("keeps the picture covering the box", () => {
		expect(clampPan({ zoom: 2, x: 0.3, y: -5 })).toEqual({ zoom: 2, x: 0, y: -1 });
	});

	it("pins an unzoomed picture to the box", () => {
		expect(clampPan({ zoom: 1, x: -0.2, y: 0.1 })).toEqual(FIT);
	});
});

describe("zoomAbout", () => {
	it("keeps the point under the pointer still", () => {
		const focus = { x: 0.3, y: 0.7 };
		const start: ZoomState = { zoom: 2, x: -0.4, y: -0.6 };
		// The picture point under the focus before the zoom...
		const picture = { x: (focus.x - start.x) / start.zoom, y: (focus.y - start.y) / start.zoom };
		const next = zoomAbout(start, 3, focus);
		// ...is still under it after.
		const landed = project(next, picture);
		expect(landed.x).toBeCloseTo(focus.x);
		expect(landed.y).toBeCloseTo(focus.y);
	});

	it("zooming from fit about the centre centres the zoom", () => {
		expect(zoomAbout(FIT, 2, { x: 0.5, y: 0.5 })).toEqual({ zoom: 2, x: -0.5, y: -0.5 });
	});

	it("zooming back out to fit returns to rest", () => {
		const zoomed = zoomAbout(FIT, 4, { x: 0.9, y: 0.1 });
		expect(zoomAbout(zoomed, 1, { x: 0.2, y: 0.2 })).toEqual(FIT);
	});

	it("never opens a gap at an edge", () => {
		const next = zoomAbout({ zoom: 3, x: 0, y: -2 }, 2, { x: 1, y: 0 });
		expect(next.x).toBeLessThanOrEqual(0);
		expect(next.x).toBeGreaterThanOrEqual(-1);
		expect(next.y).toBeGreaterThanOrEqual(-1);
	});
});

describe("panBy", () => {
	it("moves the picture by box fractions, clamped", () => {
		expect(panBy({ zoom: 2, x: -0.5, y: -0.5 }, 0.2, -0.1)).toEqual({ zoom: 2, x: -0.3, y: -0.6 });
		expect(panBy({ zoom: 2, x: -0.5, y: -0.5 }, 1, -1)).toEqual({ zoom: 2, x: 0, y: -1 });
	});

	it("does nothing at fit", () => {
		expect(panBy(FIT, 0.3, 0.3)).toEqual(FIT);
	});
});

describe("pinchState", () => {
	it("zooms by the spread about the starting midpoint", () => {
		const centre = { x: 0.25, y: 0.75 };
		const next = pinchState(FIT, centre, centre, 2);
		expect(next.zoom).toBe(2);
		const landed = project(next, centre);
		expect(landed.x).toBeCloseTo(centre.x);
		expect(landed.y).toBeCloseTo(centre.y);
	});

	it("follows the midpoint as it moves", () => {
		const start: ZoomState = { zoom: 2, x: -0.5, y: -0.5 };
		const next = pinchState(start, { x: 0.5, y: 0.5 }, { x: 0.6, y: 0.4 }, 1);
		expect(next.x).toBeCloseTo(-0.4);
		expect(next.y).toBeCloseTo(-0.6);
	});

	it("is clamped to the editor's zoom range", () => {
		expect(pinchState(FIT, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, 100).zoom).toBe(ZOOM_MAX);
		expect(pinchState(FIT, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, 0.1)).toEqual(FIT);
	});

	it("ignores a degenerate spread", () => {
		expect(pinchState({ zoom: 2, x: -0.5, y: -0.5 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, 0).zoom).toBe(2);
	});
});

describe("wheelZoomFactor", () => {
	it("zooms in on wheel up and out on wheel down", () => {
		expect(wheelZoomFactor(-10, 0)).toBeGreaterThan(1);
		expect(wheelZoomFactor(10, 0)).toBeLessThan(1);
	});

	it("caps a mouse notch at one editor step", () => {
		expect(wheelZoomFactor(-100, 0)).toBe(ZOOM_STEP);
		expect(wheelZoomFactor(3, 1)).toBe(1 / ZOOM_STEP);
	});

	it("is proportional for a pinch's small deltas", () => {
		expect(wheelZoomFactor(-2, 0)).toBeCloseTo(Math.exp(0.02));
	});
});

describe("isDoubleTap", () => {
	it("needs a first tap", () => {
		expect(isDoubleTap(null, { at: 0, x: 0, y: 0 })).toBe(false);
	});

	it("accepts a quick second tap in the same place", () => {
		expect(isDoubleTap({ at: 0, x: 10, y: 10 }, { at: 200, x: 20, y: 15 })).toBe(true);
	});

	it("rejects a slow or distant second tap", () => {
		expect(isDoubleTap({ at: 0, x: 10, y: 10 }, { at: 400, x: 10, y: 10 })).toBe(false);
		expect(isDoubleTap({ at: 0, x: 10, y: 10 }, { at: 100, x: 80, y: 10 })).toBe(false);
	});
});

describe("zoomStyle", () => {
	it("clears every property at fit", () => {
		expect(isZoomed(FIT)).toBe(false);
		expect(Object.values(zoomStyle(FIT))).toEqual(["", "", "", ""]);
	});

	it("clips each layer back to the box", () => {
		// Zoom 2 showing the box's middle: the layer's middle half is what lands
		// on the box, so a quarter is clipped from every side.
		expect(zoomStyle({ zoom: 2, x: -0.5, y: -0.5 })).toEqual({
			"--osmosis-zoom": "2",
			"--osmosis-zoom-x": "-50%",
			"--osmosis-zoom-y": "-50%",
			"--osmosis-zoom-clip": "inset(25% 25% 25% 25%)",
		});
	});

	it("clips only the far sides when the top-left corner shows", () => {
		expect(zoomStyle({ zoom: 4, x: 0, y: 0 })["--osmosis-zoom-clip"]).toBe("inset(0% 75% 75% 0%)");
	});
});
