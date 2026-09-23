import { describe, expect, it } from "vitest";
import {
	MOUSE_DRAG_THRESHOLD,
	TOUCH_DRAG_THRESHOLD,
	dragThreshold,
	exceedsDragThreshold,
	nodeDragPans,
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

describe("nodeDragPans", () => {
	const editing = { isReadingMode: false, spatialMode: "off" } as const;

	it("moves the node once a finger has held the press", () => {
		expect(
			nodeDragPans({ ...editing, pointerType: "touch", longPressTriggered: true }),
		).toBe(false);
	});

	it("pans when a finger drags a node without holding it first", () => {
		expect(
			nodeDragPans({ ...editing, pointerType: "touch", longPressTriggered: false }),
		).toBe(true);
	});

	it("moves the node from the first pixel under a mouse", () => {
		expect(
			nodeDragPans({ ...editing, pointerType: "mouse", longPressTriggered: false }),
		).toBe(false);
	});

	it("always pans in reading mode, held or not", () => {
		for (const pointerType of ["touch", "mouse"]) {
			expect(
				nodeDragPans({
					pointerType,
					longPressTriggered: true,
					isReadingMode: true,
					spatialMode: "off",
				}),
			).toBe(true);
		}
	});

	it("always pans in peek and study, so a review cannot restructure the note", () => {
		for (const spatialMode of ["peek", "study"] as const) {
			for (const pointerType of ["touch", "mouse"]) {
				expect(
					nodeDragPans({
						pointerType,
						longPressTriggered: true,
						isReadingMode: false,
						spatialMode,
					}),
				).toBe(true);
			}
		}
	});
});
