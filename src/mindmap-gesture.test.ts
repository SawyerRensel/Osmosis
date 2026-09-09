import { describe, expect, it } from "vitest";
import {
	MOUSE_DRAG_THRESHOLD,
	TOUCH_DRAG_THRESHOLD,
	dragThreshold,
	exceedsDragThreshold,
	panSwallowsTap,
} from "./mindmap-gesture";

describe("dragThreshold", () => {
	it("gives a finger more slop than a mouse", () => {
		expect(dragThreshold("touch")).toBe(TOUCH_DRAG_THRESHOLD);
		expect(dragThreshold("mouse")).toBe(MOUSE_DRAG_THRESHOLD);
		expect(dragThreshold("pen")).toBe(MOUSE_DRAG_THRESHOLD);
	});
});

describe("exceedsDragThreshold", () => {
	it("holds a finger still through wobble that would move a mouse", () => {
		expect(exceedsDragThreshold(6, 0, "touch")).toBe(false);
		expect(exceedsDragThreshold(6, 0, "mouse")).toBe(true);
	});

	it("measures distance, not either axis alone", () => {
		expect(exceedsDragThreshold(8, 8, "touch")).toBe(true);
		expect(exceedsDragThreshold(-8, -8, "touch")).toBe(true);
		expect(exceedsDragThreshold(7, 0, "touch")).toBe(false);
	});

	it("counts the threshold itself as a drag", () => {
		expect(exceedsDragThreshold(TOUCH_DRAG_THRESHOLD, 0, "touch")).toBe(true);
		expect(exceedsDragThreshold(MOUSE_DRAG_THRESHOLD, 0, "mouse")).toBe(true);
	});
});

describe("panSwallowsTap", () => {
	it("swallows the tap that ends a committed pan in peek and study", () => {
		for (const spatialMode of ["peek", "study"] as const) {
			expect(
				panSwallowsTap({
					pointerType: "touch",
					panCommitted: true,
					spatialMode,
				}),
			).toBe(true);
		}
	});

	it("leaves a tap alone when the finger never committed to a pan", () => {
		expect(
			panSwallowsTap({
				pointerType: "touch",
				panCommitted: false,
				spatialMode: "study",
			}),
		).toBe(false);
	});

	it("leaves normal editing taps alone", () => {
		expect(
			panSwallowsTap({
				pointerType: "touch",
				panCommitted: true,
				spatialMode: "off",
			}),
		).toBe(false);
	});

	it("ignores the mouse, whose click path guards itself", () => {
		expect(
			panSwallowsTap({
				pointerType: "mouse",
				panCommitted: true,
				spatialMode: "study",
			}),
		).toBe(false);
	});
});
