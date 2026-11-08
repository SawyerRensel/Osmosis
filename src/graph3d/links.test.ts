import { describe, it, expect } from "vitest";
import { LINK_REACH, frontPanelAt, linkClickAction, type DrawnPanel, type DrawnPlate, type LinkClickInput } from "./links";

const plain: LinkClickInput = { click: true, link: { external: false }, isFocus: true, focusDistance: 0, mod: false, alt: false, panKey: false };

describe("linkClickAction", () => {
	it("follows a link within the graph on a plain click on the focused node", () => {
		expect(linkClickAction(plain)).toBe("follow");
	});

	it("never acts on a drag", () => {
		expect(linkClickAction({ ...plain, click: false })).toBe("none");
		expect(linkClickAction({ ...plain, click: false, link: null })).toBe("none");
	});

	it("follows links on nodes close to the focus", () => {
		expect(linkClickAction({ ...plain, isFocus: false, focusDistance: LINK_REACH })).toBe("follow");
	});

	it("flies to a far node instead of following its link, whatever the modifiers", () => {
		const far = { ...plain, isFocus: false, focusDistance: LINK_REACH + 1 };
		expect(linkClickAction(far)).toBe("node");
		expect(linkClickAction({ ...far, mod: true, panKey: true })).toBe("node");
		expect(linkClickAction({ ...far, link: { external: true } })).toBe("node");
		expect(linkClickAction({ ...plain, isFocus: false, focusDistance: Infinity })).toBe("node");
	});

	it("mirrors the mind map's modifiers: Mod opens a new graph tab, Mod+Alt a note view", () => {
		expect(linkClickAction({ ...plain, mod: true, panKey: true })).toBe("follow-tab");
		expect(linkClickAction({ ...plain, mod: true, alt: true, panKey: true })).toBe("open-note");
		// Alt or Shift alone change nothing.
		expect(linkClickAction({ ...plain, alt: true })).toBe("follow");
		expect(linkClickAction({ ...plain, panKey: true })).toBe("follow");
	});

	it("opens external links in the browser", () => {
		expect(linkClickAction({ ...plain, link: { external: true } })).toBe("external");
		expect(linkClickAction({ ...plain, link: { external: true }, mod: true, panKey: true })).toBe("external");
	});

	it("flies to the node under a plain click off any link, and leaves a pan-key click alone", () => {
		expect(linkClickAction({ ...plain, link: null, isFocus: false, focusDistance: Infinity })).toBe("node");
		expect(linkClickAction({ ...plain, link: null, alt: true })).toBe("node");
		expect(linkClickAction({ ...plain, link: null, mod: true, panKey: true })).toBe("none");
		expect(linkClickAction({ ...plain, link: null, panKey: true })).toBe("none");
	});
});

const panel = (id: string, left: number, top: number, depth: number): DrawnPanel => ({ id, rect: { left, top, right: left + 100, bottom: top + 50 }, depth });
const plate = (id: string, x: number, y: number, depth: number): DrawnPlate => ({ id, x, y, halfWidth: 10, halfHeight: 5, depth });

describe("frontPanelAt", () => {
	it("finds no panel off every panel", () => {
		expect(frontPanelAt(500, 500, [panel("a", 0, 0, 10)], [])).toBeNull();
	});

	it("picks the nearest of overlapping panels", () => {
		const panels = [panel("far", 0, 0, 30), panel("near", 50, 20, 10)];
		expect(frontPanelAt(60, 30, panels, [])).toBe("near");
		expect(frontPanelAt(20, 10, panels, [])).toBe("far");
	});

	it("is covered by a nearer plate, which is cut out of the panel", () => {
		expect(frontPanelAt(50, 25, [panel("a", 0, 0, 30)], [plate("b", 50, 25, 10)])).toBeNull();
		expect(frontPanelAt(80, 25, [panel("a", 0, 0, 30)], [plate("b", 50, 25, 10)])).toBe("a");
	});

	it("ignores farther plates and the panel's own plate", () => {
		expect(frontPanelAt(50, 25, [panel("a", 0, 0, 30)], [plate("c", 50, 25, 40), plate("a", 50, 25, 30)])).toBe("a");
	});

	it("leaves a nearer node's plate to its panel", () => {
		const panels = [panel("far", 0, 0, 30), panel("near", 40, 20, 10)];
		expect(frontPanelAt(50, 25, panels, [plate("near", 50, 25, 10)])).toBe("near");
	});
});
