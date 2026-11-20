import { describe, expect, it } from "vitest";
import {
	BOX,
	clampPan,
	FIT,
	isDoubleTap,
	isZoomed,
	panBy,
	pinchState,
	wheelZoomFactor,
	windowIn,
	zoomAbout,
	zoomStyle,
	type ZoomState,
	type ZoomWindow,
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

	// A picture in the middle third of a card, across; down to twice its height below.
	const card: ZoomWindow = { left: -1, top: 0, right: 2, bottom: 3 };

	it("keeps a picture smaller than the window inside it", () => {
		expect(clampPan({ zoom: 2, x: -5, y: 4 }, card)).toEqual({ zoom: 2, x: -1, y: 1 });
		expect(clampPan({ zoom: 2, x: -0.5, y: 0.5 }, card)).toEqual({ zoom: 2, x: -0.5, y: 0.5 });
	});

	it("keeps a picture larger than the window covering it", () => {
		expect(clampPan({ zoom: 4, x: 0, y: 1 }, card)).toEqual({ zoom: 4, x: -1, y: 0 });
		expect(clampPan({ zoom: 4, x: -3, y: -3 }, card)).toEqual({ zoom: 4, x: -2, y: -1 });
	});

	it("pins a picture exactly the window's size to it", () => {
		expect(clampPan({ zoom: 3, x: 0.4, y: -0.4 }, card)).toEqual({ zoom: 3, x: -1, y: 0 });
	});

	it("holds a picture partly scrolled out of view to the part on screen", () => {
		// Only the box's middle half is on screen, so a zoom of 1.5 covers it.
		const next = clampPan({ zoom: 1.5, x: 0, y: 0.5 }, { left: 0, top: 0.25, right: 1, bottom: 0.75 });
		expect(next.y).toBe(0.25);
		expect(next.x).toBe(0);
	});
});

describe("windowIn", () => {
	it("measures the area in fractions of the box", () => {
		const box = { left: 100, top: 50, right: 300, bottom: 150 };
		expect(windowIn(box, { left: 0, top: 50, right: 500, bottom: 350 })).toEqual({ left: -0.5, top: 0, right: 2, bottom: 3 });
	});

	it("falls back to the box for a box of no size", () => {
		expect(windowIn({ left: 10, top: 10, right: 10, bottom: 40 }, { left: 0, top: 0, right: 99, bottom: 99 })).toBe(BOX);
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

	it("lets the zoom spill into the window, about the pointer", () => {
		const next = zoomAbout(FIT, 2, { x: 0.5, y: 0.5 }, { left: -1, top: -1, right: 2, bottom: 2 });
		expect(next).toEqual({ zoom: 2, x: -0.5, y: -0.5 });
	});

	it("returns to rest at fit whatever the window", () => {
		expect(zoomAbout({ zoom: 2, x: 0.3, y: 0.2 }, 1, { x: 0.5, y: 0.5 }, { left: -1, top: -1, right: 2, bottom: 2 })).toEqual(FIT);
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
		expect(panBy(FIT, 0.3, 0.3, { left: -1, top: -1, right: 2, bottom: 2 })).toEqual(FIT);
	});

	it("moves the picture across the window, not just its box", () => {
		const card: ZoomWindow = { left: -1, top: 0, right: 2, bottom: 3 };
		expect(panBy({ zoom: 2, x: -0.5, y: 0 }, -0.4, 0.5, card)).toEqual({ zoom: 2, x: -0.9, y: 0.5 });
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

	it("holds the pinch to the window", () => {
		const card: ZoomWindow = { left: -1, top: 0, right: 2, bottom: 3 };
		const next = pinchState(FIT, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, 2, card);
		// About the middle would put the top half a box above the window; it is pushed back in.
		expect(next).toEqual({ zoom: 2, x: -0.5, y: 0 });
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
		expect(Object.values(zoomStyle(FIT))).toEqual(["", "", ""]);
	});

	it("writes the zoom and the offsets as percentages of the box", () => {
		expect(zoomStyle({ zoom: 2, x: -0.5, y: 0.25 })).toEqual({
			"--osmosis-zoom": "2",
			"--osmosis-zoom-x": "-50%",
			"--osmosis-zoom-y": "25%",
		});
	});
});
