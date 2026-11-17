import { describe, expect, it } from "vitest";
import { GIZMOS, GIZMO_ZOOM_PER_HEIGHT, gizmoZoom, gizmosAvailable } from "./gizmos";

describe("GIZMOS", () => {
	it("lists rotate, pan, zoom from the top down", () => {
		expect(GIZMOS.map((g) => g.kind)).toEqual(["rotate", "pan", "zoom"]);
	});
});

describe("gizmosAvailable", () => {
	it("is on for a desktop with no touch screen", () => {
		expect(gizmosAvailable({ isMobile: false, maxTouchPoints: 0 })).toBe(true);
	});

	it("is off on mobile and wherever a touch screen is present", () => {
		expect(gizmosAvailable({ isMobile: true, maxTouchPoints: 5 })).toBe(false);
		expect(gizmosAvailable({ isMobile: true, maxTouchPoints: 0 })).toBe(false);
		expect(gizmosAvailable({ isMobile: false, maxTouchPoints: 10 })).toBe(false);
	});
});

describe("gizmoZoom", () => {
	it("zooms in when dragged up and out when dragged down", () => {
		expect(gizmoZoom(-100, 500)).toBeGreaterThan(0);
		expect(gizmoZoom(100, 500)).toBeLessThan(0);
		expect(gizmoZoom(0, 500)).toBeCloseTo(0);
	});

	it("is ×8 for a drag the height of the view, and mirrors for the opposite drag", () => {
		expect(gizmoZoom(-600, 600)).toBeCloseTo(GIZMO_ZOOM_PER_HEIGHT);
		expect(gizmoZoom(600, 600)).toBeCloseTo(-GIZMO_ZOOM_PER_HEIGHT);
		expect(gizmoZoom(-30, 600) + gizmoZoom(30, 600)).toBeCloseTo(0);
	});

	it("survives a zero-height view", () => {
		expect(Number.isFinite(gizmoZoom(-10, 0))).toBe(true);
	});
});
