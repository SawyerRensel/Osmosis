import { describe, expect, it } from "vitest";
import { CLICK_SLOP_PX, gestureFor, movedPastSlop, type GestureInput } from "./pointer-gesture";

const mouse = (over: Partial<GestureInput> = {}): GestureInput => ({
	button: 0,
	pointerType: "mouse",
	shiftKey: false,
	altKey: false,
	ctrlKey: false,
	metaKey: false,
	editMode: false,
	...over,
});

describe("movedPastSlop", () => {
	it("keeps a press under the slop a click", () => {
		expect(movedPastSlop(0, 0)).toBe(false);
		expect(movedPastSlop(CLICK_SLOP_PX - 1, 0)).toBe(false);
		expect(movedPastSlop(2, 2)).toBe(false);
	});

	it("counts the slop itself, on either axis or diagonally, as a drag", () => {
		expect(movedPastSlop(CLICK_SLOP_PX, 0)).toBe(true);
		expect(movedPastSlop(0, -CLICK_SLOP_PX)).toBe(true);
		expect(movedPastSlop(3, 3)).toBe(true);
	});
});

describe("gestureFor", () => {
	it("orbits on a plain left drag, in edit mode too", () => {
		expect(gestureFor(mouse())).toBe("orbit");
		expect(gestureFor(mouse({ editMode: true }))).toBe("orbit");
	});

	it("pans with Ctrl or Cmd", () => {
		expect(gestureFor(mouse({ ctrlKey: true }))).toBe("pan");
		expect(gestureFor(mouse({ metaKey: true, editMode: true }))).toBe("pan");
	});

	it("links with Alt in edit mode only", () => {
		expect(gestureFor(mouse({ altKey: true, editMode: true }))).toBe("link");
		expect(gestureFor(mouse({ altKey: true }))).toBe("orbit");
	});

	it("reserves Shift for box select, over every other modifier", () => {
		expect(gestureFor(mouse({ shiftKey: true }))).toBe("boxSelect");
		expect(gestureFor(mouse({ shiftKey: true, ctrlKey: true }))).toBe("boxSelect");
		expect(gestureFor(mouse({ shiftKey: true, altKey: true, editMode: true }))).toBe("boxSelect");
	});

	it("lets Ctrl beat Alt, so OrbitControls never pans under a link", () => {
		expect(gestureFor(mouse({ ctrlKey: true, altKey: true, editMode: true }))).toBe("pan");
	});

	it("gives the right button pan-or-menu, whatever the modifiers", () => {
		expect(gestureFor(mouse({ button: 2 }))).toBe("panOrMenu");
		expect(gestureFor(mouse({ button: 2, shiftKey: true, editMode: true }))).toBe("panOrMenu");
	});

	it("leaves the middle and extra buttons alone", () => {
		expect(gestureFor(mouse({ button: 1 }))).toBe("none");
		expect(gestureFor(mouse({ button: 3 }))).toBe("none");
	});

	it("orbits with a finger, and links from a line in edit mode", () => {
		const finger = { pointerType: "touch" };
		expect(gestureFor(mouse(finger))).toBe("orbit");
		expect(gestureFor(mouse({ ...finger, editMode: true }))).toBe("link");
	});

	it("treats a pen like a mouse", () => {
		expect(gestureFor(mouse({ pointerType: "pen", altKey: true, editMode: true }))).toBe("link");
	});
});
