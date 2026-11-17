import { describe, it, expect } from "vitest";
import {
	viewBoxFit,
	viewBoxTransform,
	clientToUser,
	userToClient,
	layerTransform,
	layerTransformCss,
	moveKind,
	type ViewBox,
	type ViewportBox,
} from "./mindmap-viewport";

/**
 * The transform path only ever runs on iOS, so these tests are the place the
 * two paths are proved equivalent. `svgMeet` is `preserveAspectRatio="xMidYMid
 * meet"` written out independently — the mapping the browser applies on the
 * viewBox path — and the cases below check the transform reproduces it.
 */
function svgMeet(
	viewBox: ViewBox,
	viewport: ViewportBox,
	userX: number,
	userY: number,
): { x: number; y: number } {
	const scale = Math.min(
		viewport.width / viewBox.w,
		viewport.height / viewBox.h,
	);
	const slackX = (viewport.width - viewBox.w * scale) / 2;
	const slackY = (viewport.height - viewBox.h * scale) / 2;
	return {
		x: viewport.left + slackX + (userX - viewBox.x) * scale,
		y: viewport.top + slackY + (userY - viewBox.y) * scale,
	};
}

/** Apply a `translate(...) scale(...)` string to a point, as the browser would. */
function applyTransform(
	transform: string,
	viewport: ViewportBox,
	userX: number,
	userY: number,
): { x: number; y: number } {
	const match =
		/^translate\((-?[\d.e+-]+)px, (-?[\d.e+-]+)px\) scale\((-?[\d.e+-]+)\)$/.exec(
			transform,
		);
	if (!match) throw new Error(`unparseable transform: ${transform}`);
	const tx = Number(match[1]);
	const ty = Number(match[2]);
	const s = Number(match[3]);
	// The element's own coordinates are 1:1 with node coordinates and its box
	// starts at the viewport's top-left, so a node point sits at (userX, userY)
	// within it before the transform. transform-origin is 0 0.
	return {
		x: viewport.left + tx + s * userX,
		y: viewport.top + ty + s * userY,
	};
}

const VIEWPORT: ViewportBox = { left: 40, top: 90, width: 800, height: 600 };

/** The invariant the view maintains: viewBox aspect ratio tracks the container. */
const MATCHED: ViewBox = { x: 120, y: -45, w: 400, h: 300 };
/** Wider than the viewport — `meet` letterboxes top and bottom. */
const WIDER: ViewBox = { x: -10, y: 5, w: 1200, h: 300 };
/** Taller than the viewport — `meet` letterboxes left and right. */
const TALLER: ViewBox = { x: 7, y: 13, w: 200, h: 900 };

const CASES: [string, ViewBox][] = [
	["matched aspect ratio", MATCHED],
	["wider than the viewport", WIDER],
	["taller than the viewport", TALLER],
];

const POINTS: [number, number][] = [
	[0, 0],
	[120, -45],
	[320, 105],
	[-500, 800],
	[1e4, 1e4],
];

describe("viewBoxFit", () => {
	it("is the zoom, with no letterboxing, when the aspect ratios match", () => {
		const fit = viewBoxFit(MATCHED, VIEWPORT);
		// 800 / 400 === 600 / 300
		expect(fit.scale).toBe(2);
		expect(fit.offsetX).toBe(0);
		expect(fit.offsetY).toBe(0);
	});

	it("scales to the tighter axis and centres the slack", () => {
		const wide = viewBoxFit(WIDER, VIEWPORT);
		expect(wide.scale).toBeCloseTo(800 / 1200, 12);
		expect(wide.offsetX).toBe(0);
		expect(wide.offsetY).toBeCloseTo((600 - 300 * (800 / 1200)) / 2, 12);

		const tall = viewBoxFit(TALLER, VIEWPORT);
		expect(tall.scale).toBeCloseTo(600 / 900, 12);
		expect(tall.offsetX).toBeCloseTo((800 - 200 * (600 / 900)) / 2, 12);
		expect(tall.offsetY).toBe(0);
	});

	it("falls back to the identity rather than dividing by zero", () => {
		// The view lays out before it has a box: both of these happen for real.
		const noBox = viewBoxFit(MATCHED, { width: 0, height: 0 });
		expect(noBox).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });

		const noViewBox = viewBoxFit(
			{ x: 0, y: 0, w: 0, h: 0 },
			{ width: 800, height: 600 },
		);
		expect(noViewBox).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
	});
});

describe("viewBoxTransform", () => {
	it.each(CASES)("paints the same pixels as the viewBox would (%s)", (_name, viewBox) => {
		const transform = viewBoxTransform(viewBox, VIEWPORT);
		for (const [ux, uy] of POINTS) {
			const viaTransform = applyTransform(transform, VIEWPORT, ux, uy);
			const viaViewBox = svgMeet(viewBox, VIEWPORT, ux, uy);
			expect(viaTransform.x).toBeCloseTo(viaViewBox.x, 9);
			expect(viaTransform.y).toBeCloseTo(viaViewBox.y, 9);
		}
	});

	it("puts the viewBox origin at the viewport's top-left when ratios match", () => {
		const transform = viewBoxTransform(MATCHED, VIEWPORT);
		const origin = applyTransform(transform, VIEWPORT, MATCHED.x, MATCHED.y);
		expect(origin.x).toBeCloseTo(VIEWPORT.left, 9);
		expect(origin.y).toBeCloseTo(VIEWPORT.top, 9);
	});

	it("emits a transform CSS can parse", () => {
		expect(viewBoxTransform(MATCHED, VIEWPORT)).toBe(
			"translate(-240px, 90px) scale(2)",
		);
	});
});

describe("clientToUser", () => {
	it.each(CASES)("inverts the transform (%s)", (_name, viewBox) => {
		for (const [ux, uy] of POINTS) {
			const client = userToClient(viewBox, VIEWPORT, ux, uy);
			const back = clientToUser(viewBox, VIEWPORT, client.x, client.y);
			expect(back.x).toBeCloseTo(ux, 9);
			expect(back.y).toBeCloseTo(uy, 9);
		}
	});

	it.each(CASES)("agrees with the viewBox mapping (%s)", (_name, viewBox) => {
		for (const [ux, uy] of POINTS) {
			const client = svgMeet(viewBox, VIEWPORT, ux, uy);
			const user = clientToUser(viewBox, VIEWPORT, client.x, client.y);
			expect(user.x).toBeCloseTo(ux, 9);
			expect(user.y).toBeCloseTo(uy, 9);
		}
	});

	it("is a pure translation of the delta, which is what panning uses", () => {
		// handlePointerMove converts two client points and pans by the
		// difference, so the difference has to be scale-only — no dependence on
		// where in the viewport the drag happened.
		const a = clientToUser(MATCHED, VIEWPORT, 300, 400);
		const b = clientToUser(MATCHED, VIEWPORT, 330, 380);
		expect(b.x - a.x).toBeCloseTo(30 / 2, 9);
		expect(b.y - a.y).toBeCloseTo(-20 / 2, 9);
	});

	it("returns finite coordinates when the view has no box yet", () => {
		const user = clientToUser(
			MATCHED,
			{ left: 0, top: 0, width: 0, height: 0 },
			10,
			10,
		);
		expect(Number.isFinite(user.x)).toBe(true);
		expect(Number.isFinite(user.y)).toBe(true);
	});
});

describe("layerTransform", () => {
	const viewport = { width: 800, height: 600 };
	/** Where the layer transform puts a point painted for `painted`. */
	function shown(painted: ViewBox, live: ViewBox, ux: number, uy: number, dpr = 1) {
		const t = layerTransform(painted, live, viewport, dpr);
		const at = userToClient(painted, { left: 0, top: 0, ...viewport }, ux, uy);
		return { x: t.tx + at.x * t.scale, y: t.ty + at.y * t.scale };
	}

	it("is the identity when nothing moved", () => {
		const box = { x: 10, y: 20, w: 400, h: 300 };
		expect(layerTransform(box, { ...box }, viewport)).toEqual({ tx: 0, ty: 0, scale: 1 });
		expect(layerTransformCss(layerTransform(box, { ...box }, viewport))).toBe("");
	});

	it("puts every point where the live viewBox paints it, for a pan", () => {
		const painted = { x: 0, y: 0, w: 400, h: 300 };
		const live = { x: 37, y: -12, w: 400, h: 300 };
		for (const [ux, uy] of [[0, 0], [100, 250], [-300, 900]] as const) {
			const want = userToClient(live, { left: 0, top: 0, ...viewport }, ux, uy);
			const got = shown(painted, live, ux, uy);
			expect(got.x).toBeCloseTo(want.x, 9);
			expect(got.y).toBeCloseTo(want.y, 9);
		}
	});

	it("puts every point where the live viewBox paints it, for a zoom out", () => {
		const painted = { x: 0, y: 0, w: 400, h: 300 };
		const live = { x: -100, y: -60, w: 640, h: 480 };
		const t = layerTransform(painted, live, viewport);
		expect(t.scale).toBeCloseTo(0.625, 12);
		for (const [ux, uy] of [[0, 0], [200, 150], [-500, 700]] as const) {
			const want = userToClient(live, { left: 0, top: 0, ...viewport }, ux, uy);
			const got = shown(painted, live, ux, uy);
			expect(got.x).toBeCloseTo(want.x, 9);
			expect(got.y).toBeCloseTo(want.y, 9);
		}
	});

	it("follows the meet rule when the aspect ratios differ", () => {
		const painted = { x: 0, y: 0, w: 400, h: 400 };
		const live = { x: 50, y: 50, w: 800, h: 400 };
		const want = userToClient(live, { left: 0, top: 0, ...viewport }, 300, 120);
		const got = shown(painted, live, 300, 120);
		expect(got.x).toBeCloseTo(want.x, 9);
		expect(got.y).toBeCloseTo(want.y, 9);
	});

	it("rounds a pure translation to whole device pixels", () => {
		const painted = { x: 0, y: 0, w: 400, h: 300 };
		const live = { x: 0.3, y: -0.26, w: 400, h: 300 };
		// Zoom 2: the pan is -0.6 and 0.52 CSS px.
		expect(layerTransform(painted, live, viewport, 1)).toEqual({ tx: -1, ty: 1, scale: 1 });
		expect(layerTransform(painted, live, viewport, 2)).toEqual({ tx: -0.5, ty: 0.5, scale: 1 });
	});

	it("treats a scale within rounding of 1 as a translation", () => {
		const painted = { x: 0, y: 0, w: 400, h: 300 };
		const live = { x: 5, y: 5, w: 400 * (1 + 1e-12), h: 300 * (1 + 1e-12) };
		expect(layerTransform(painted, live, viewport).scale).toBe(1);
	});
});

describe("moveKind", () => {
	it("translates at the same zoom, shrinks zooming out, repaints zooming in", () => {
		expect(moveKind({ tx: 4, ty: 0, scale: 1 })).toBe("translate");
		expect(moveKind({ tx: 0, ty: 0, scale: 0.8 })).toBe("shrink");
		expect(moveKind({ tx: 0, ty: 0, scale: 1.01 })).toBe("repaint");
	});
});

describe("layerTransformCss", () => {
	it("omits the scale for a translation", () => {
		expect(layerTransformCss({ tx: 3, ty: -2, scale: 1 })).toBe("translate(3px, -2px)");
		expect(layerTransformCss({ tx: 3, ty: -2, scale: 0.5 })).toBe("translate(3px, -2px) scale(0.5)");
	});
});
