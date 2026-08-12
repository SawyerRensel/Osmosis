// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { App } from "obsidian";
import type { OcclusionSet } from "../database/types";
import type { Scope } from "../test/obsidian-stub";
import { rotatePoint, shapeBox } from "../study/occlusion-geometry";
import { OcclusionEditorModal } from "./OcclusionEditorModal";

/**
 * Smoke tests for the editor's DOM assembly and pointer plumbing.
 *
 * The arithmetic these exercise is already covered by
 * `study/occlusion-geometry.test.ts`; what is only testable here is the shell
 * around it — that the canvas keeps the study renderer's coordinate contract,
 * that pointer pixels reach `onSave` as normalised 0–1 shapes, and that class
 * tokens are handed to `createSvg` as *arrays*. Obsidian's helpers are
 * polyfilled faithfully by `test/obsidian-stub.ts`, whose `createSvg` throws on
 * a class token containing a space exactly as the real one does — the mistake
 * that once took out a whole card render.
 */

/** The image's rendered box, so pointer pixels have something to normalise against. */
const IMAGE_BOX = { x: 0, y: 0, width: 400, height: 200 };
/** The stage's content box, which the canvas is fitted into. */
const STAGE_BOX = { width: 600, height: 400 };
/** The image's own proportions — twice as wide as it is tall. */
const NATURAL = { width: 1600, height: 800 };

beforeAll(() => {
	// jsdom lays nothing out, and it implements none of the pointer-capture API.
	Element.prototype.getBoundingClientRect = function (): DOMRect {
		return {
			...IMAGE_BOX,
			top: IMAGE_BOX.y,
			left: IMAGE_BOX.x,
			right: IMAGE_BOX.x + IMAGE_BOX.width,
			bottom: IMAGE_BOX.y + IMAGE_BOX.height,
			toJSON: () => ({}),
		} as DOMRect;
	};
	const el = Element.prototype as unknown as Record<string, unknown>;
	el["setPointerCapture"] = () => undefined;
	el["releasePointerCapture"] = () => undefined;
	el["hasPointerCapture"] = () => false;

	// Layout the fit is measured from: the stage's box and the image's own size.
	define(Element.prototype, "clientWidth", STAGE_BOX.width);
	define(Element.prototype, "clientHeight", STAGE_BOX.height);
	define(HTMLImageElement.prototype, "naturalWidth", NATURAL.width);
	define(HTMLImageElement.prototype, "naturalHeight", NATURAL.height);
	// jsdom's scroll offsets are read-only zeroes; as writable prototype defaults
	// an assignment lands on the element and can be read back.
	define(Element.prototype, "scrollLeft", 0, true);
	define(Element.prototype, "scrollTop", 0, true);

	// Fires its first observation on observe, as the real one does — which is
	// what gives the modal a fit before the image has finished loading.
	window.ResizeObserver = class {
		constructor(private readonly callback: () => void) {}
		observe(): void { this.callback(); }
		unobserve(): void { /* nothing to stop */ }
		disconnect(): void { /* nothing to stop */ }
	} as unknown as typeof ResizeObserver;
});

function define(target: object, property: string, value: number, writable = false): void {
	Object.defineProperty(target, property, { value, writable, configurable: true });
}

const app = {} as unknown as App;

const set: OcclusionSet = {
	mode: "hide-all-guess-one",
	shapes: [
		{ group: "c1", kind: "rect", x: 0.31, y: 0.22, w: 0.14, h: 0.06 },
		{ group: "c1", kind: "rect", x: 0.62, y: 0.3, w: 0.1, h: 0.05 },
		{ group: "c2", kind: "ellipse", x: 0.55, y: 0.4, rx: 0.08, ry: 0.05 },
	],
};

interface Opened {
	modal: OcclusionEditorModal;
	content: HTMLElement;
	svg: SVGSVGElement;
	saved: OcclusionSet[];
}

function open(initial: OcclusionSet = set, reservedGroups: string[] = []): Opened {
	const saved: OcclusionSet[] = [];
	const modal = new OcclusionEditorModal(app, {
		src: "app://vault/bridge.svg",
		image: "bridge.svg",
		set: initial,
		reservedGroups,
		onSave: (edited) => saved.push(edited),
	});
	modal.open();
	const content = modal.contentEl;
	return { modal, content, svg: content.querySelector("svg")!, saved };
}

/** Click a button by its rendered label or aria-label. */
function click(content: HTMLElement, label: string): void {
	const buttons = Array.from(content.querySelectorAll("button"));
	const button = buttons.find(
		(b) => b.textContent === label || b.getAttribute("aria-label") === label,
	);
	button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

/** Sweep the pointer from one pixel position to another over the canvas. */
function drag(
	svg: SVGSVGElement,
	from: [number, number],
	to: [number, number],
	modifiers: { shiftKey?: boolean; altKey?: boolean } = {},
): void {
	const at = (type: string, [clientX, clientY]: [number, number]) =>
		svg.dispatchEvent(new MouseEvent(type, { clientX, clientY, button: 0, bubbles: true, ...modifiers }));
	at("pointerdown", from);
	at("pointermove", to);
	at("pointerup", to);
}

/** A single click on the canvas, with no movement between down and up. */
function tap(
	svg: SVGSVGElement,
	at: [number, number],
	modifiers: { shiftKey?: boolean; altKey?: boolean } = {},
): void {
	drag(svg, at, at, modifiers);
}

/** Fire a hotkey the modal registered on its scope, returning what it claimed. */
function hotkey(modal: OcclusionEditorModal, modifiers: string[], key: string): unknown {
	return (modal as unknown as { scope: Scope }).scope.trigger(modifiers, key);
}

let opened: Opened;
beforeEach(() => {
	document.body.innerHTML = "";
	opened = open();
});

describe("OcclusionEditorModal", () => {
	it("restores the existing shape set, one element per shape", () => {
		const masks = Array.from(opened.svg.querySelectorAll(".osmosis-occlusion-mask"));

		expect(masks.map((m) => m.tagName)).toEqual(["rect", "rect", "ellipse"]);
		expect(masks[0]!.getAttribute("x")).toBe("0.31");
		expect(masks[2]!.getAttribute("cx")).toBe("0.55");
	});

	it("keeps the study renderer's coordinate contract on the canvas", () => {
		// Shapes drawn here must land on the same pixels when the card is
		// studied. That holds only while both halves share this trio.
		const wrapper = opened.content.querySelector(".osmosis-occlusion");

		expect(wrapper?.classList.contains("osmosis-occlusion-canvas")).toBe(true);
		expect(opened.svg.getAttribute("viewBox")).toBe("0 0 1 1");
		expect(opened.svg.getAttribute("preserveAspectRatio")).toBe("none");
		expect(opened.content.querySelector("img")?.classList.contains("osmosis-occlusion-image"))
			.toBe(true);
	});

	it("draws the image the editor was opened on", () => {
		const img = opened.content.querySelector("img");

		expect(img?.getAttribute("src")).toBe("app://vault/bridge.svg");
		expect(img?.getAttribute("alt")).toBe("bridge.svg");
	});

	it("counts groups rather than shapes when it reports the card total", () => {
		// Three shapes in two groups is two cards — the collapse that makes
		// grouping worth having.
		expect(opened.content.querySelector(".osmosis-occlusion-hint")?.textContent)
			.toBe("3 shapes in 2 groups — 2 cards. Shapes sharing a group become one card.");
	});

	it("hands the unchanged set back on save", () => {
		click(opened.content, "Save");

		expect(opened.saved).toHaveLength(1);
		expect(opened.saved[0]).toEqual(set);
	});

	it("discards the edit when closed unsaved, leaving the caller's set untouched", () => {
		// Closing *is* the discard: there is no Cancel button, since the dialog's
		// own close button, Escape, and the backdrop already all lead here.
		drag(opened.svg, [40, 20], [120, 60]);
		opened.modal.close();

		expect(opened.saved).toHaveLength(0);
		expect(set.shapes).toHaveLength(3);
	});

	it("converts a pointer drag into a normalised rectangle", () => {
		// 400×200 box: x 100→200 is 0.25→0.5, y 50→100 is 0.25→0.5.
		drag(opened.svg, [100, 50], [200, 100]);
		click(opened.content, "Save");

		expect(opened.saved[0]?.shapes[3]).toEqual({
			group: "c3",
			kind: "rect",
			x: 0.25,
			y: 0.25,
			w: 0.25,
			h: 0.25,
		});
	});

	it("draws an ellipse when the ellipse tool is held", () => {
		click(opened.content, "Ellipse");
		drag(opened.svg, [100, 50], [200, 100]);
		click(opened.content, "Save");

		expect(opened.saved[0]?.shapes[3]).toMatchObject({ kind: "ellipse", rx: 0.125, ry: 0.125 });
	});

	it("leaves nothing behind when a draw drag ends where it started", () => {
		drag(opened.svg, [100, 50], [100, 50]);
		click(opened.content, "Save");

		expect(opened.saved[0]?.shapes).toHaveLength(3);
	});

	it("numbers a new group above the ones reserved elsewhere in the carrier", () => {
		// A second diagram in the same fence must not reuse the first's `cN`:
		// both derive card IDs as `<fenceId>-cN` and the reuse would collide.
		const other = open({ mode: "hide-all-guess-one", shapes: [] }, ["c1", "c2", "c3"]);
		drag(other.svg, [100, 50], [200, 100]);
		click(other.content, "Save");

		expect(other.saved[0]?.shapes[0]?.group).toBe("c4");
	});

	it("selects the shape it just drew and puts handles on it", () => {
		drag(opened.svg, [100, 50], [200, 100]);

		expect(opened.svg.querySelectorAll(".osmosis-occlusion-handle")).toHaveLength(8);
		expect(opened.svg.querySelectorAll(".is-selected")).toHaveLength(1);
	});

	it("keeps drawing when the next drag lands on empty canvas", () => {
		// Drawing drops into Select on the new shape, but the common next action
		// is another mask — so an empty-canvas drag draws instead of dead-ending.
		drag(opened.svg, [100, 50], [200, 100]);
		drag(opened.svg, [220, 120], [280, 160]);
		click(opened.content, "Save");

		expect(opened.saved[0]?.shapes).toHaveLength(5);
		expect(opened.saved[0]?.shapes.slice(3).map((s) => s.kind)).toEqual(["rect", "rect"]);
	});

	it("keeps drawing in the kind last chosen, not always rectangles", () => {
		click(opened.content, "Ellipse");
		drag(opened.svg, [100, 50], [200, 100]);
		drag(opened.svg, [220, 120], [280, 160]);
		click(opened.content, "Save");

		expect(opened.saved[0]?.shapes.slice(3).map((s) => s.kind)).toEqual(["ellipse", "ellipse"]);
	});

	it("gives each freshly drawn shape its own group", () => {
		drag(opened.svg, [100, 50], [200, 100]);
		drag(opened.svg, [220, 120], [280, 160]);
		click(opened.content, "Save");

		expect(opened.saved[0]?.shapes.slice(3).map((s) => s.group)).toEqual(["c3", "c4"]);
	});

	it("still treats a click on empty canvas as a plain deselect", () => {
		click(opened.content, "Select");
		drag(opened.svg, [152, 50], [152, 50]);
		expect(opened.svg.querySelectorAll(".is-selected")).toHaveLength(1);

		drag(opened.svg, [380, 180], [380, 180]);

		expect(opened.svg.querySelectorAll(".is-selected")).toHaveLength(0);
		expect(opened.svg.querySelectorAll(".osmosis-occlusion-handle")).toHaveLength(0);
		click(opened.content, "Save");
		expect(opened.saved[0]?.shapes).toHaveLength(3);
	});

	it("moves a shape without resizing it", () => {
		click(opened.content, "Select");
		// Grab the middle of the first rect and push it right by a tenth.
		drag(opened.svg, [152, 50], [192, 50]);
		click(opened.content, "Save");

		expect(opened.saved[0]?.shapes[0]).toMatchObject({ x: 0.41, y: 0.22, w: 0.14, h: 0.06 });
	});

	it("deletes the selected shape, dropping its group from the card count", () => {
		click(opened.content, "Select");
		drag(opened.svg, [152, 50], [152, 50]);
		click(opened.content, "Delete shape");
		click(opened.content, "Save");

		expect(opened.saved[0]?.shapes).toHaveLength(2);
	});

	it("collapses two shapes into one card when they are put in the same group", () => {
		click(opened.content, "Select");
		drag(opened.svg, [222, 82], [222, 82]);
		const select = opened.content.querySelector("select")!;
		select.value = "c1";
		select.dispatchEvent(new Event("change"));

		// Read before saving: Save closes the modal, and closing empties it.
		expect(opened.content.querySelector(".osmosis-occlusion-hint")?.textContent)
			.toContain("1 card.");

		click(opened.content, "Save");
		expect(opened.saved[0]?.shapes.map((s) => s.group)).toEqual(["c1", "c1", "c1"]);
	});

	it("keeps the mode it was opened on and writes a changed one back", () => {
		const selects = Array.from(opened.content.querySelectorAll("select"));
		const modeSelect = selects[1]!;
		expect(modeSelect.value).toBe("hide-all-guess-one");

		modeSelect.value = "hide-one-guess-one";
		modeSelect.dispatchEvent(new Event("change"));
		click(opened.content, "Save");

		expect(opened.saved[0]?.mode).toBe("hide-one-guess-one");
	});

	it("empties its content on close, so reopening does not stack two canvases", () => {
		opened.modal.close();

		expect(opened.content.childElementCount).toBe(0);
	});
});

/** Compare point lists with a tolerance — normalised coordinates are floats. */
function expectPoints(actual: readonly [number, number][], expected: [number, number][]): void {
	expect(actual.length).toBe(expected.length);
	actual.forEach(([x, y], i) => {
		expect(x).toBeCloseTo(expected[i]![0]);
		expect(y).toBeCloseTo(expected[i]![1]);
	});
}

/** The toolbar button with this aria-label. */
function button(content: HTMLElement, label: string): HTMLButtonElement {
	return Array.from(content.querySelectorAll("button"))
		.find((b) => b.getAttribute("aria-label") === label)!;
}

/**
 * Polygon authoring — the one tool that is built click by click rather than
 * swept out in a single drag. Everything it does to the points themselves is
 * covered in `study/occlusion-geometry.test.ts`; what only exists here is the
 * gesture that collects them.
 */
describe("OcclusionEditorModal polygons", () => {
	const square: OcclusionSet = {
		mode: "hide-all-guess-one",
		shapes: [{ group: "c1", kind: "poly", points: [[0.1, 0.1], [0.5, 0.1], [0.5, 0.6], [0.1, 0.6]] }],
	};

	/** Select the only shape by clicking inside it. */
	function selectSquare(opened: Opened): void {
		click(opened.content, "Select");
		tap(opened.svg, [120, 70]);
	}

	it("collects vertices click by click and closes on the first one", () => {
		click(opened.content, "Polygon");
		tap(opened.svg, [40, 20]);
		tap(opened.svg, [160, 20]);
		tap(opened.svg, [100, 120]);
		tap(opened.svg, [40, 20]);
		click(opened.content, "Save");

		expect(opened.saved[0]?.shapes[3]).toEqual({
			group: "c3",
			kind: "poly",
			points: [[0.1, 0.1], [0.4, 0.1], [0.25, 0.6]],
		});
	});

	it("closes the path on Enter too", () => {
		click(opened.content, "Polygon");
		tap(opened.svg, [40, 20]);
		tap(opened.svg, [160, 20]);
		tap(opened.svg, [100, 120]);
		hotkey(opened.modal, [], "Enter");
		click(opened.content, "Save");

		expect(opened.saved[0]?.shapes).toHaveLength(4);
	});

	it("abandons the draft on Escape without touching the shapes", () => {
		click(opened.content, "Polygon");
		tap(opened.svg, [40, 20]);
		tap(opened.svg, [160, 20]);
		hotkey(opened.modal, [], "Escape");
		click(opened.content, "Save");

		expect(opened.saved[0]?.shapes).toHaveLength(3);
	});

	it("discards a draft that encloses no area", () => {
		// Two points would be an invisible mask — a card nobody could answer.
		click(opened.content, "Polygon");
		tap(opened.svg, [40, 20]);
		tap(opened.svg, [160, 20]);
		click(opened.content, "Select");
		click(opened.content, "Save");

		expect(opened.saved[0]?.shapes).toHaveLength(3);
	});

	it("draws the path being collected, but not as a finished mask", () => {
		click(opened.content, "Polygon");
		tap(opened.svg, [40, 20]);
		tap(opened.svg, [160, 20]);

		expect(opened.svg.querySelectorAll(".osmosis-occlusion-draft")).toHaveLength(1);
		expect(opened.svg.querySelectorAll(".osmosis-occlusion-mask")).toHaveLength(3);
	});

	it("puts a handle on every vertex of a selected polygon", () => {
		const opened2 = open(square);
		selectSquare(opened2);

		expect(opened2.svg.querySelectorAll(".osmosis-occlusion-vertex")).toHaveLength(4);
		// Box handles stay too, so the polygon can still be scaled as a whole.
		expect(opened2.svg.querySelectorAll(".osmosis-occlusion-handle")).toHaveLength(8);
	});

	it("drags one vertex without disturbing the others", () => {
		const opened2 = open(square);
		selectSquare(opened2);
		drag(opened2.svg, [200, 20], [240, 40]);
		click(opened2.content, "Save");

		expect(opened2.saved[0]?.shapes[0]).toEqual({
			group: "c1",
			kind: "poly",
			points: [[0.1, 0.1], [0.6, 0.2], [0.5, 0.6], [0.1, 0.6]],
		});
	});

	it("removes a vertex on alt-click, and refuses once three are left", () => {
		const opened2 = open(square);
		selectSquare(opened2);
		tap(opened2.svg, [200, 20], { altKey: true });
		tap(opened2.svg, [200, 120], { altKey: true });
		click(opened2.content, "Save");

		const shape = opened2.saved[0]?.shapes[0];
		expect(shape?.kind === "poly" && shape.points).toEqual([[0.1, 0.1], [0.5, 0.6], [0.1, 0.6]]);
	});

	it("closes the draft when a point is clicked twice", () => {
		click(opened.content, "Polygon");
		tap(opened.svg, [40, 20]);
		tap(opened.svg, [160, 20]);
		tap(opened.svg, [100, 120]);
		tap(opened.svg, [100, 120]);
		click(opened.content, "Save");

		expect(opened.saved[0]?.shapes[3]).toEqual({
			group: "c3",
			kind: "poly",
			points: [[0.1, 0.1], [0.4, 0.1], [0.25, 0.6]],
		});
	});

	it("inserts a vertex where a double-click meets the outline", () => {
		// Two real taps, not a synthetic `dblclick` fired at the SVG: the native
		// event is what phase 4 relied on and what never arrived, and a test that
		// dispatches it directly passes against exactly that broken behaviour.
		const opened2 = open(square);
		selectSquare(opened2);
		tap(opened2.svg, [48, 40]);
		tap(opened2.svg, [48, 40]);
		click(opened2.content, "Save");

		const shape = opened2.saved[0]?.shapes[0];
		expect(shape?.kind).toBe("poly");
		// Coordinates are float arithmetic, so compare with a tolerance — exact
		// equality would pin the test to IEEE noise rather than to the geometry.
		expectPoints(shape?.kind === "poly" ? shape.points : [],
			[[0.1, 0.1], [0.5, 0.1], [0.5, 0.6], [0.1, 0.6], [0.1, 0.2]]);
	});

	it("leaves the outline alone when the two clicks are far apart", () => {
		const opened2 = open(square);
		selectSquare(opened2);
		tap(opened2.svg, [48, 40]);
		tap(opened2.svg, [48, 100]);
		click(opened2.content, "Save");

		const shape = opened2.saved[0]?.shapes[0];
		expectPoints(shape?.kind === "poly" ? shape.points : [],
			[[0.1, 0.1], [0.5, 0.1], [0.5, 0.6], [0.1, 0.6]]);
	});
});

/** Multi-selection, and the arrange operations that only mean anything above one. */
describe("OcclusionEditorModal arranging", () => {
	/** Select the two c1 rectangles: click the first, shift-click the second. */
	function selectBothRects(): void {
		click(opened.content, "Select");
		tap(opened.svg, [152, 50]);
		tap(opened.svg, [268, 65], { shiftKey: true });
	}

	it("adds to the selection on shift-click", () => {
		selectBothRects();

		expect(opened.svg.querySelectorAll(".is-selected")).toHaveLength(2);
		// Handles are for reshaping, which needs one shape, not a set of them.
		expect(opened.svg.querySelectorAll(".osmosis-occlusion-handle")).toHaveLength(0);
	});

	it("takes a shape back out of the selection on a second shift-click", () => {
		selectBothRects();
		tap(opened.svg, [268, 65], { shiftKey: true });

		expect(opened.svg.querySelectorAll(".is-selected")).toHaveLength(1);
	});

	it("lines the selection up on its own leftmost edge", () => {
		selectBothRects();
		click(opened.content, "Align left");
		click(opened.content, "Save");

		expect(opened.saved[0]?.shapes[1]).toMatchObject({ x: 0.31, y: 0.3, w: 0.1, h: 0.05 });
		expect(opened.saved[0]?.shapes[0]).toMatchObject({ x: 0.31, y: 0.22 });
	});

	it("offers no alignment below two shapes, where it would mean nothing", () => {
		expect(button(opened.content, "Align left").disabled).toBe(true);

		click(opened.content, "Select");
		tap(opened.svg, [152, 50]);
		expect(button(opened.content, "Align left").disabled).toBe(true);

		tap(opened.svg, [268, 65], { shiftKey: true });
		expect(button(opened.content, "Align left").disabled).toBe(false);
	});

	it("drags every selected shape by the same delta", () => {
		selectBothRects();
		drag(opened.svg, [268, 65], [288, 65]);
		click(opened.content, "Save");

		expect(shapeBox(opened.saved[0]!.shapes[0]!).x).toBeCloseTo(0.36);
		expect(shapeBox(opened.saved[0]!.shapes[1]!).x).toBeCloseTo(0.67);
	});

	it("copies the selection into the same group, so the card is unchanged", () => {
		// A copy that started its own group would turn one card into two behind
		// the user's back.
		click(opened.content, "Select");
		tap(opened.svg, [152, 50]);
		click(opened.content, "Duplicate");
		click(opened.content, "Save");

		expect(opened.saved[0]?.shapes).toHaveLength(4);
		expect(opened.saved[0]?.shapes[3]).toMatchObject({ group: "c1", x: 0.33, y: 0.24 });
	});

	it("gives each selected shape a group of its own on ungroup", () => {
		selectBothRects();
		click(opened.content, "Ungroup");
		click(opened.content, "Save");

		// Numbered above the highest in use, never filling a gap: a reused number
		// would inherit the deleted group's schedule.
		expect(opened.saved[0]?.shapes.map((s) => s.group)).toEqual(["c3", "c4", "c2"]);
	});

	it("puts every selected shape in one group from the dropdown", () => {
		selectBothRects();
		const select = opened.content.querySelector("select")!;
		select.value = "c2";
		select.dispatchEvent(new Event("change"));
		click(opened.content, "Save");

		expect(opened.saved[0]?.shapes.map((s) => s.group)).toEqual(["c2", "c2", "c2"]);
	});

	it("deletes the whole selection at once", () => {
		selectBothRects();
		click(opened.content, "Delete shape");
		click(opened.content, "Save");

		expect(opened.saved[0]?.shapes).toHaveLength(1);
	});
});

/**
 * Undo/redo. The unit of history is a committed change, never a pointer-move
 * frame — a drag that produced fifty frames must still be one step back.
 */
describe("OcclusionEditorModal history", () => {
	it("steps a drawn shape back out and forward in again", () => {
		drag(opened.svg, [100, 50], [200, 100]);
		hotkey(opened.modal, ["Mod"], "z");
		expect(opened.svg.querySelectorAll(".osmosis-occlusion-mask")).toHaveLength(3);

		hotkey(opened.modal, ["Mod", "Shift"], "z");
		click(opened.content, "Save");

		expect(opened.saved[0]?.shapes).toHaveLength(4);
	});

	it("treats one drag as one step, however many frames it took", () => {
		click(opened.content, "Select");
		opened.svg.dispatchEvent(new MouseEvent("pointerdown", { clientX: 152, clientY: 50, button: 0 }));
		for (const x of [156, 160, 168, 176, 184, 192]) {
			opened.svg.dispatchEvent(new MouseEvent("pointermove", { clientX: x, clientY: 50, button: 0 }));
		}
		opened.svg.dispatchEvent(new MouseEvent("pointerup", { clientX: 192, clientY: 50, button: 0 }));

		hotkey(opened.modal, ["Mod"], "z");
		click(opened.content, "Save");

		expect(opened.saved[0]?.shapes[0]).toMatchObject({ x: 0.31 });
	});

	it("records nothing for a click that changed nothing", () => {
		// Otherwise the first Ctrl+Z after a stray click appears to do nothing.
		expect(button(opened.content, "Undo").disabled).toBe(true);

		click(opened.content, "Select");
		tap(opened.svg, [380, 180]);

		expect(button(opened.content, "Undo").disabled).toBe(true);
	});

	it("abandons the redo branch once a new edit lands on top", () => {
		drag(opened.svg, [100, 50], [200, 100]);
		hotkey(opened.modal, ["Mod"], "z");
		drag(opened.svg, [220, 120], [280, 160]);

		expect(button(opened.content, "Redo").disabled).toBe(true);
		click(opened.content, "Save");
		expect(opened.saved[0]?.shapes).toHaveLength(4);
	});

	it("never undoes past the set it was opened on", () => {
		hotkey(opened.modal, ["Mod"], "z");
		hotkey(opened.modal, ["Mod"], "z");
		click(opened.content, "Save");

		expect(opened.saved[0]?.shapes).toEqual(set.shapes);
	});
});

/**
 * Text annotations. They label the picture and derive no card, so what matters
 * here is that they reach `onSave` in their own list and never in `shapes`.
 */
describe("OcclusionEditorModal annotations", () => {
	/** The input a label is being typed into, or null when none is open. */
	function editing(opened2: Opened): HTMLInputElement | null {
		return opened2.content.querySelector<HTMLInputElement>(".osmosis-occlusion-annotation-input");
	}

	/** Press and release on the label at a pixel position. */
	function pressLabel(opened2: Opened, at: [number, number]): void {
		const at2 = (type: string, target: Element) =>
			target.dispatchEvent(new MouseEvent(type, { clientX: at[0], clientY: at[1], button: 0, bubbles: true }));
		at2("pointerdown", opened2.content.querySelector(".osmosis-occlusion-annotation")!);
		// On the SVG, which holds the capture — and where a real release lands.
		at2("pointerup", opened2.svg);
	}

	/** Place a label at a pixel position and type into it. */
	function label(opened2: Opened, at: [number, number], text: string): void {
		click(opened2.content, "Text");
		tap(opened2.svg, at);
		const input = editing(opened2)!;
		input.value = text;
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
	}

	/**
	 * Run `body` with a measuring chip that reports `px` wide.
	 *
	 * jsdom defines `offsetWidth` on the prototype itself, so the original
	 * descriptor has to be put back rather than deleted — deleting it leaves
	 * `offsetWidth` undefined for every later test in the file.
	 */
	function withChipWidth(px: number, body: () => void): void {
		const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
		Object.defineProperty(HTMLElement.prototype, "offsetWidth", { value: px, configurable: true });
		try {
			body();
		} finally {
			if (original) Object.defineProperty(HTMLElement.prototype, "offsetWidth", original);
			else Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth");
		}
	}

	it("narrows the label's box to the width its text needs", () => {
		// A label is placed before it has any text, so its starting width can only
		// be a guess; committing the text is the first moment the real width is
		// knowable. Measured here and stored, so every study surface still paints
		// from the box with nothing measured.
		//
		// The chip measures 90px against a 600px canvas, and is stored one spare
		// pixel wider so a rounded-down measurement cannot ellipsis its own last
		// glyph — so 91/600, still far narrower than the 0.25 it was placed with.
		withChipWidth(90, () => {
			label(opened, [100, 20], "Deck");
			click(opened.content, "Save");

			expect(opened.saved[0]?.annotations).toEqual([
				{ x: 0.25, y: 0.1, w: 91 / 600, h: 0.14, text: "Deck" },
			]);
		});
	});

	it("keeps the placed width when nothing can be measured", () => {
		// jsdom lays nothing out, so this is also why every other test here still
		// sees the default box — and it is the real guard: a modal measured before
		// its canvas has a size must not collapse a label to nothing.
		label(opened, [100, 20], "Deck");
		click(opened.content, "Save");

		expect(opened.saved[0]?.annotations).toEqual([
			{ x: 0.25, y: 0.1, w: 0.25, h: 0.14, text: "Deck" },
		]);
	});

	it("pulls a long label back onto the picture rather than growing off it", () => {
		// Placed near the right edge and then fitted to a width that no longer
		// fits there: the whole box is what has to stay on the image.
		withChipWidth(300, () => {
			label(opened, [360, 20], "a long label");
			click(opened.content, "Save");

			// 301/600 wide — the spare pixel — so its right edge lands exactly on
			// the picture's.
			expect(opened.saved[0]?.annotations?.[0]).toMatchObject({
				x: 1 - 301 / 600,
				w: 301 / 600,
			});
		});
	});

	it("places the label on release, not on press", () => {
		// Created on press, the input is built before the browser's own mousedown
		// focus handling runs — which then moves focus straight back off it, the
		// blur commits an empty label, and the tool appears to do nothing at all.
		click(opened.content, "Text");
		opened.svg.dispatchEvent(new MouseEvent("pointerdown", { clientX: 100, clientY: 20, button: 0, bubbles: true }));
		expect(editing(opened)).toBeNull();

		opened.svg.dispatchEvent(new MouseEvent("pointerup", { clientX: 100, clientY: 20, button: 0, bubbles: true }));
		expect(editing(opened)).not.toBeNull();
	});

	it("leaves Backspace to the field it is being typed into", () => {
		// The scope sees a key before the focused input does, so claiming Backspace
		// deleted the annotation being named instead of a character of its text.
		click(opened.content, "Text");
		tap(opened.svg, [100, 20]);
		const claimed = (opened.modal as unknown as { scope: Scope }).scope.trigger([], "Backspace");

		expect(claimed).toBeUndefined();
		expect(editing(opened)).not.toBeNull();
	});

	it("cancels the edit rather than closing while a label is being typed", () => {
		// Escape reaches the modal's own close handler, not ours — it shares this
		// scope and is evaluated first — so the refusal has to live in `close`.
		const opened2 = open({ ...set, annotations: [{ x: 0.25, y: 0.1, w: 0.25, h: 0.08, text: "Deck" }] });
		pressLabel(opened2, [100, 20]);
		pressLabel(opened2, [100, 20]);
		editing(opened2)!.value = "half typed";
		opened2.modal.close();

		expect(editing(opened2)).toBeNull();
		expect(opened2.content.childElementCount).toBeGreaterThan(0);
		// Reverted, rather than taking what was half typed.
		expect(opened2.content.querySelector(".osmosis-occlusion-annotation")?.textContent).toBe("Deck");

		// And a second Escape now closes as usual.
		opened2.modal.close();
		expect(opened2.content.childElementCount).toBe(0);
	});

	it("keeps a label whose field is blurred before it was ever focused", () => {
		click(opened.content, "Text");
		tap(opened.svg, [100, 20]);
		const input = editing(opened)!;
		input.dispatchEvent(new FocusEvent("blur"));

		// Still open for typing: a blur that beat the focus is a focus steal, and
		// committing on it would delete the label before a character was typed.
		expect(editing(opened)).not.toBeNull();

		input.value = "Deck";
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		click(opened.content, "Save");
		expect(opened.saved[0]?.annotations).toEqual([{ x: 0.25, y: 0.1, w: 0.25, h: 0.14, text: "Deck" }]);
	});

	it("places a label and takes the typed text", () => {
		label(opened, [100, 20], "Deck");
		click(opened.content, "Save");

		expect(opened.saved[0]?.annotations).toEqual([{ x: 0.25, y: 0.1, w: 0.25, h: 0.14, text: "Deck" }]);
		expect(opened.saved[0]?.shapes).toHaveLength(3);
	});

	it("drops a label that was left empty", () => {
		label(opened, [100, 20], "   ");
		click(opened.content, "Save");

		expect(opened.saved[0]?.annotations).toBeUndefined();
		expect(opened.content.querySelectorAll(".osmosis-occlusion-annotation")).toHaveLength(0);
	});

	it("restores the labels it was opened on", () => {
		const opened2 = open({ ...set, annotations: [{ x: 0.4, y: 0.2, w: 0.25, h: 0.08, text: "Pier" }] });

		expect(opened2.content.querySelector(".osmosis-occlusion-annotation")?.textContent).toBe("Pier");
	});

	it("drags a label to a new position", () => {
		const opened2 = open({ ...set, annotations: [{ x: 0.25, y: 0.1, w: 0.25, h: 0.08, text: "Deck" }] });
		const el = opened2.content.querySelector(".osmosis-occlusion-annotation")!;
		el.dispatchEvent(new MouseEvent("pointerdown", { clientX: 100, clientY: 20, button: 0, bubbles: true }));
		opened2.svg.dispatchEvent(new MouseEvent("pointermove", { clientX: 140, clientY: 40, button: 0 }));
		opened2.svg.dispatchEvent(new MouseEvent("pointerup", { clientX: 140, clientY: 40, button: 0 }));
		click(opened2.content, "Save");

		expect(opened2.saved[0]?.annotations).toEqual([{ x: 0.35, y: 0.2, w: 0.25, h: 0.08, text: "Deck" }]);
	});

	it("reopens a label for typing on double-click", () => {
		// Detected from the presses, like every other double click here: this
		// layer is rebuilt on each pointer move, so a label rarely survives long
		// enough to receive a native `dblclick` of its own.
		const opened2 = open({ ...set, annotations: [{ x: 0.25, y: 0.1, w: 0.25, h: 0.08, text: "Deck" }] });
		pressLabel(opened2, [100, 20]);
		pressLabel(opened2, [100, 20]);
		const input = editing(opened2)!;
		input.value = "Deck slab";
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		click(opened2.content, "Save");

		expect(opened2.saved[0]?.annotations).toEqual([{ x: 0.25, y: 0.1, w: 0.25, h: 0.08, text: "Deck slab" }]);
	});

	it("deletes the selected label without touching the masks", () => {
		const opened2 = open({ ...set, annotations: [{ x: 0.25, y: 0.1, w: 0.25, h: 0.08, text: "Deck" }] });
		opened2.content.querySelector(".osmosis-occlusion-annotation")!
			.dispatchEvent(new MouseEvent("pointerdown", { clientX: 100, clientY: 20, button: 0, bubbles: true }));
		click(opened2.content, "Delete shape");
		click(opened2.content, "Save");

		expect(opened2.saved[0]?.annotations).toBeUndefined();
		expect(opened2.saved[0]?.shapes).toHaveLength(3);
	});

	it("keeps labels out of the shape list, so they derive no card", () => {
		label(opened, [100, 20], "Deck");
		click(opened.content, "Select");

		expect(opened.content.querySelector(".osmosis-occlusion-hint")?.textContent)
			.toContain("3 shapes in 2 groups — 2 cards");
	});
});

/** View-only controls: neither writes anything into the user's note. */
describe("OcclusionEditorModal view controls", () => {
	it("scales the wrapper the overlay is pinned to, not the picture inside it", () => {
		// The phase 4 defect: zoom capped the *image*, so the picture grew while
		// the wrapper stayed put and the overlay pinned to the wrapper desynced
		// from it — masks left sitting off the features they were drawn on. The
		// element that scales has to be the one both the image and the SVG are
		// measured against, which is why this asserts the parent and not just
		// that a custom property changed somewhere.
		const canvas = opened.content.querySelector<HTMLElement>(".osmosis-occlusion-canvas")!;
		click(opened.content, "Zoom in");

		expect(opened.svg.parentElement).toBe(canvas);
		expect(opened.content.querySelector("img")?.parentElement).toBe(canvas);
		expect(canvas.style.getPropertyValue("--osmosis-occlusion-zoom")).toBe("1.25");
		// And never as a viewBox change, which would desync the canvas from the
		// study renderer, where the overlay always paints `0 0 1 1`.
		expect(opened.svg.getAttribute("viewBox")).toBe("0 0 1 1");
	});

	it("returns to fit, and never zooms out below it", () => {
		click(opened.content, "Zoom in");
		click(opened.content, "Zoom to fit");
		const canvas = opened.content.querySelector<HTMLElement>(".osmosis-occlusion-canvas")!;
		expect(canvas.style.getPropertyValue("--osmosis-occlusion-zoom")).toBe("1");

		click(opened.content, "Zoom out");
		expect(canvas.style.getPropertyValue("--osmosis-occlusion-zoom")).toBe("1");
	});

	it("sizes the canvas so the whole image fits the stage, whatever its shape", () => {
		// Fitting only the width is what gave the modal a second scrollbar: a tall
		// diagram overflowed the stage and pushed the toolbar out of reach.
		//
		// 599 rather than the stage's full 600: the fitted image gives a pixel
		// back, so that filling the stage exactly can never be the thing that
		// raises a scrollbar — see `FIT_SLACK`, and the shaking it stopped.
		const canvas = opened.content.querySelector<HTMLElement>(".osmosis-occlusion-canvas")!;

		expect(canvas.style.getPropertyValue("--osmosis-occlusion-fit")).toBe("599px");
	});

	it("zooms on Ctrl+scroll, and leaves a plain scroll to the stage", () => {
		const stage = opened.content.querySelector<HTMLElement>(".osmosis-occlusion-stage")!;
		const canvas = opened.content.querySelector<HTMLElement>(".osmosis-occlusion-canvas")!;

		stage.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true }));
		expect(canvas.style.getPropertyValue("--osmosis-occlusion-zoom")).toBe("1");

		stage.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, ctrlKey: true, bubbles: true }));
		expect(canvas.style.getPropertyValue("--osmosis-occlusion-zoom")).toBe("1.25");
	});

	it("toggles masks to solid without adding anything to the saved set", () => {
		const canvas = opened.content.querySelector(".osmosis-occlusion-canvas")!;
		click(opened.content, "Toggle translucency");
		expect(canvas.classList.contains("is-opaque")).toBe(true);

		click(opened.content, "Save");
		expect(opened.saved[0]).toEqual(set);
	});
});

/**
 * Getting around a zoomed canvas. The overlay sets `touch-action: none` so one
 * finger can draw, which leaves the browser scrolling nothing for touch at all
 * — so both ways of moving the picture are the modal's own work.
 */
describe("OcclusionEditorModal panning", () => {
	/** A pointer event carrying an id, which `MouseEvent` alone does not. */
	function finger(type: string, id: number, [clientX, clientY]: [number, number]): MouseEvent {
		return Object.assign(
			new MouseEvent(type, { clientX, clientY, button: 0, bubbles: true }),
			{ pointerId: id },
		);
	}

	function stageOf(opened2: Opened): HTMLElement {
		return opened2.content.querySelector<HTMLElement>(".osmosis-occlusion-stage")!;
	}

	it("scrolls the stage under the Pan tool instead of drawing", () => {
		const stage = stageOf(opened);
		click(opened.content, "Pan");
		drag(opened.svg, [200, 100], [140, 70]);

		expect(stage.scrollLeft).toBe(60);
		expect(stage.scrollTop).toBe(30);

		click(opened.content, "Save");
		expect(opened.saved[0]?.shapes).toHaveLength(3);
	});

	it("marks the overlay so the cursor says the drag will pan", () => {
		click(opened.content, "Pan");

		expect(opened.svg.classList.contains("is-panning")).toBe(true);
	});

	it("zooms on a two-finger pinch", () => {
		const canvas = opened.content.querySelector<HTMLElement>(".osmosis-occlusion-canvas")!;
		opened.svg.dispatchEvent(finger("pointerdown", 1, [180, 100]));
		opened.svg.dispatchEvent(finger("pointerdown", 2, [220, 100]));
		opened.svg.dispatchEvent(finger("pointermove", 2, [260, 100]));

		expect(canvas.style.getPropertyValue("--osmosis-occlusion-zoom")).toBe("2");
	});

	it("abandons what the first finger had started when the second lands", () => {
		// The opening of a pinch is not a mask, and committing one would leave a
		// stray rectangle behind every zoom.
		opened.svg.dispatchEvent(finger("pointerdown", 1, [40, 20]));
		opened.svg.dispatchEvent(finger("pointermove", 1, [160, 120]));
		opened.svg.dispatchEvent(finger("pointerdown", 2, [200, 140]));
		opened.svg.dispatchEvent(finger("pointerup", 1, [160, 120]));
		opened.svg.dispatchEvent(finger("pointerup", 2, [200, 140]));
		click(opened.content, "Save");

		expect(opened.saved[0]?.shapes).toHaveLength(3);
	});

	it("draws again once the gesture's fingers have all lifted", () => {
		opened.svg.dispatchEvent(finger("pointerdown", 1, [40, 20]));
		opened.svg.dispatchEvent(finger("pointerdown", 2, [200, 140]));
		opened.svg.dispatchEvent(finger("pointerup", 1, [40, 20]));
		opened.svg.dispatchEvent(finger("pointerup", 2, [200, 140]));
		drag(opened.svg, [40, 20], [160, 120]);
		click(opened.content, "Save");

		expect(opened.saved[0]?.shapes).toHaveLength(4);
	});
});

/**
 * Rotation. The fixture image is 400×200 on screen and 1600×800 naturally, so
 * its aspect is 2 — a deliberately wide picture, which is the only kind on
 * which the aspect compensation is visible at all.
 *
 * Shape 0 is the rect at x 0.31–0.45, y 0.22–0.28: on screen 124–180 across and
 * 44–56 down, with its centre at (152, 50). Its rotation grip sits
 * `ROTATE_HANDLE_PX` (22) above the box's top edge, at (152, 22).
 */
describe("OcclusionEditorModal rotation", () => {
	const CENTER: [number, number] = [152, 50];
	const GRIP: [number, number] = [152, 22];

	/** Select shape 0 by pressing inside it, which is what puts grips on it. */
	function selectFirst(o: Opened): void {
		tap(o.svg, CENTER);
	}

	/** The saved rotation of shape 0, or undefined when it has none. */
	function savedRotation(o: Opened): number | undefined {
		click(o.content, "Save");
		return o.saved[o.saved.length - 1]?.shapes[0]?.rotation;
	}

	it("puts a rotation grip and its stem on the selected shape", () => {
		selectFirst(opened);

		expect(opened.svg.querySelectorAll(".osmosis-occlusion-rotate")).toHaveLength(1);
		expect(opened.svg.querySelectorAll(".osmosis-occlusion-rotate-stem")).toHaveLength(1);
	});

	it("offers no grip while nothing is selected", () => {
		expect(opened.svg.querySelectorAll(".osmosis-occlusion-rotate")).toHaveLength(0);
	});

	it("turns the shape by dragging the grip, clockwise", () => {
		// Grip straight up from the centre is 0°; dragging it out to the right is
		// a quarter turn.
		selectFirst(opened);
		drag(opened.svg, GRIP, [252, 50]);

		expect(savedRotation(opened)).toBeCloseTo(90, 6);
	});

	it("applies the change in bearing, so grabbing the grip never snaps the shape", () => {
		selectFirst(opened);
		// Press slightly off the grip's exact centre, still within grabbing range,
		// and release without moving: the shape must not jump to that bearing.
		drag(opened.svg, [156, 24], [156, 24]);

		expect(savedRotation(opened)).toBeUndefined();
	});

	it("snaps to 15° while shift is held", () => {
		selectFirst(opened);
		drag(opened.svg, GRIP, [176, 22], { shiftKey: true });

		expect(savedRotation(opened)).toBe(45);
	});

	it("turns freely without shift", () => {
		selectFirst(opened);
		drag(opened.svg, GRIP, [176, 22]);

		const rotation = savedRotation(opened)!;
		expect(rotation).toBeGreaterThan(35);
		expect(rotation).toBeLessThan(45);
	});

	it("paints the turned shape through a matrix, and its grips with it", () => {
		selectFirst(opened);
		drag(opened.svg, GRIP, [252, 50]);

		const mask = opened.svg.querySelectorAll(".osmosis-occlusion-mask")[0];
		expect(mask?.getAttribute("transform")).toMatch(/^matrix\(/);
		// Handles, vertices and the grip live in one group carrying the same
		// transform — which is what keeps the picture and the pointer test in
		// agreement about where a grip is.
		expect(opened.svg.querySelector(".osmosis-occlusion-grips")?.getAttribute("transform"))
			.toBe(mask?.getAttribute("transform"));
	});

	it("leaves the unrotated shapes without a transform", () => {
		selectFirst(opened);
		drag(opened.svg, GRIP, [252, 50]);

		expect(opened.svg.querySelectorAll(".osmosis-occlusion-mask")[1]?.getAttribute("transform"))
			.toBeNull();
	});

	it("grabs a turned shape where it is drawn, not where its box was", () => {
		// A quarter turn stands the flat rect on end: it now covers ground well
		// below its own bounding box and no longer covers its own right-hand end.
		selectFirst(opened);
		drag(opened.svg, GRIP, [252, 50]);
		tap(opened.svg, [300, 150]);
		expect(opened.svg.querySelectorAll(".is-selected")).toHaveLength(0);

		tap(opened.svg, [152, 70]);

		const masks = Array.from(opened.svg.querySelectorAll(".osmosis-occlusion-mask"));
		expect(masks[0]?.classList.contains("is-selected")).toBe(true);
	});

	it("undoes a rotation and nothing else", () => {
		selectFirst(opened);
		drag(opened.svg, GRIP, [252, 50]);
		hotkey(opened.modal, ["Mod"], "z");

		click(opened.content, "Save");
		expect(opened.saved[0]?.shapes).toEqual(set.shapes);
	});

	it("keeps the rotation through a move, so the two edits compose", () => {
		// A shape big enough that its middle is clear of its own resize handles —
		// the fixture rect is only 12px tall, which is the grab tolerance itself.
		const opened2 = open({
			mode: "hide-all-guess-one",
			shapes: [{ group: "c1", kind: "rect", x: 0.3, y: 0.4, w: 0.2, h: 0.2, rotation: 90 }],
		});
		// One gesture: pressing an unselected shape picks it up and moves it.
		drag(opened2.svg, [160, 100], [180, 100]);

		click(opened2.content, "Save");
		expect(opened2.saved[0]?.shapes[0]).toMatchObject({ kind: "rect", x: 0.35, rotation: 90 });
	});

	it("resizes a turned shape without sliding it across the picture", () => {
		// Resizing moves the box's centre, and the shape turns about that centre,
		// so the opposite corner has to be pinned back where it was on screen.
		const rotation = 37;
		const opened2 = open({
			mode: "hide-all-guess-one",
			shapes: [{ group: "c1", kind: "rect", x: 0.3, y: 0.4, w: 0.2, h: 0.2, rotation }],
		});
		// Select it, then drag its south-east handle outwards.
		tap(opened2.svg, [160, 100]);
		drag(opened2.svg, cornerPixels(0.5, 0.6, rotation), [260, 160]);

		click(opened2.content, "Save");
		const box = shapeBox(opened2.saved[0]!.shapes[0]!);
		const before = rotatePoint({ x: 0.3, y: 0.4 }, { x: 0.4, y: 0.5 }, rotation, 2);
		const after = rotatePoint(
			{ x: box.x, y: box.y },
			{ x: box.x + box.w / 2, y: box.y + box.h / 2 },
			rotation,
			2,
		);
		expect(after.x).toBeCloseTo(before.x, 6);
		expect(after.y).toBeCloseTo(before.y, 6);
		expect(box.w).toBeGreaterThan(0.2);
	});

	/** Where a corner of the 0.3–0.5 / 0.4–0.6 box lands on screen once turned. */
	function cornerPixels(x: number, y: number, rotation: number): [number, number] {
		const at = rotatePoint({ x, y }, { x: 0.4, y: 0.5 }, rotation, 2);
		return [at.x * IMAGE_BOX.width, at.y * IMAGE_BOX.height];
	}

	it("turns a label about the centre of its box, through its own grip", () => {
		// The label's box is 100×40 screen pixels at (100, 100), so its centre is
		// (150, 120) and its grip hangs 22px above the box's top-centre: (150, 78).
		const opened2 = openLabel();
		selectLabel(opened2);

		expect(opened2.svg.querySelectorAll(".osmosis-occlusion-rotate")).toHaveLength(1);
		// Dragging the grip round to due east of the centre is a quarter turn.
		drag(opened2.svg, [150, 78], [250, 120]);

		click(opened2.content, "Save");
		expect(opened2.saved[0]?.annotations?.[0]?.rotation).toBeCloseTo(90, 6);
		// Turning changes the angle and nothing else: the box is untouched.
		expect(opened2.saved[0]?.annotations?.[0])
			.toMatchObject({ x: 0.25, y: 0.5, w: 0.25, h: 0.2 });
	});

	it("gives the label a stem, so its grip reads as belonging to it", () => {
		const opened2 = openLabel();
		selectLabel(opened2);

		expect(opened2.svg.querySelectorAll(".osmosis-occlusion-rotate-stem")).toHaveLength(1);
	});

	it("puts eight resize handles on a selected label, as on any other shape", () => {
		const opened2 = openLabel();
		selectLabel(opened2);

		expect(opened2.svg.querySelectorAll(".osmosis-occlusion-handle")).toHaveLength(8);
	});

	it("resizes a label by dragging a handle", () => {
		// The south-east handle sits at the box's bottom-right, (200, 140).
		const opened2 = openLabel();
		selectLabel(opened2);
		drag(opened2.svg, [200, 140], [280, 160]);

		click(opened2.content, "Save");
		const label = opened2.saved[0]!.annotations![0]!;
		expect(label.w).toBeCloseTo(0.45, 6);
		expect(label.h).toBeCloseTo(0.3, 6);
		// The corner the drag pivots on stays exactly where it was.
		expect(label).toMatchObject({ x: 0.25, y: 0.5 });
	});

	it("keeps a label's box within the picture when it is dragged", () => {
		// The whole box is clamped, not the anchor — otherwise a label's far end
		// travels off the image while its corner stays put.
		const opened2 = openLabel();
		const label = opened2.content.querySelector(".osmosis-occlusion-annotation")!;
		label.dispatchEvent(new MouseEvent("pointerdown", { clientX: 100, clientY: 100, button: 0, bubbles: true }));
		opened2.svg.dispatchEvent(new MouseEvent("pointermove", { clientX: 400, clientY: 100, button: 0, bubbles: true }));
		opened2.svg.dispatchEvent(new MouseEvent("pointerup", { clientX: 400, clientY: 100, button: 0, bubbles: true }));

		click(opened2.content, "Save");
		expect(opened2.saved[0]?.annotations?.[0]?.x).toBeCloseTo(0.75, 6);
	});

	it("gives a newly placed label the default box", () => {
		click(opened.content, "Text");
		tap(opened.svg, [100, 20]);
		const input = opened.content.querySelector<HTMLInputElement>(".osmosis-occlusion-annotation-input")!;
		input.value = "Deck";
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

		click(opened.content, "Save");
		expect(opened.saved[0]?.annotations?.[0]).toEqual({ x: 0.25, y: 0.1, w: 0.25, h: 0.14, text: "Deck" });
	});

	/**
	 * A modal holding one label whose box is 100×40 pixels at (100, 100).
	 *
	 * Taller than the default box on purpose: at the default 16px a label is
	 * shorter than the 12px handle tolerance, so its corner and edge handles
	 * overlap and a press cannot say which was meant.
	 */
	function openLabel(): Opened {
		return open({ ...set, annotations: [{ x: 0.25, y: 0.5, w: 0.25, h: 0.2, text: "Deck" }] });
	}

	/** Press the label once, which selects it — a second press opens it for typing. */
	function selectLabel(o: Opened): void {
		o.content.querySelector(".osmosis-occlusion-annotation")!
			.dispatchEvent(new MouseEvent("pointerdown", { clientX: 100, clientY: 100, button: 0, bubbles: true }));
		o.svg.dispatchEvent(new MouseEvent("pointerup", { clientX: 100, clientY: 100, button: 0, bubbles: true }));
	}

	it("hides the label's grip while it is being typed into", () => {
		const opened2 = open({ ...set, annotations: [{ x: 0.25, y: 0.5, w: 0.25, h: 0.08, text: "Deck" }] });
		const press = () => {
			opened2.content.querySelector(".osmosis-occlusion-annotation")!
				.dispatchEvent(new MouseEvent("pointerdown", { clientX: 100, clientY: 100, button: 0, bubbles: true }));
			opened2.svg.dispatchEvent(new MouseEvent("pointerup", { clientX: 100, clientY: 100, button: 0, bubbles: true }));
		};
		press();
		press();

		expect(opened2.content.querySelector(".osmosis-occlusion-annotation-input")).not.toBeNull();
		expect(opened2.svg.querySelectorAll(".osmosis-occlusion-rotate")).toHaveLength(0);
	});
});
