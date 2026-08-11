// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { App } from "obsidian";
import type { OcclusionSet } from "../database/types";
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
});

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
function drag(svg: SVGSVGElement, from: [number, number], to: [number, number]): void {
	const at = (type: string, [clientX, clientY]: [number, number]) =>
		svg.dispatchEvent(new MouseEvent(type, { clientX, clientY, button: 0, bubbles: true }));
	at("pointerdown", from);
	at("pointermove", to);
	at("pointerup", to);
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

	it("discards the edit on cancel, leaving the caller's set untouched", () => {
		drag(opened.svg, [40, 20], [120, 60]);
		click(opened.content, "Cancel");

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
