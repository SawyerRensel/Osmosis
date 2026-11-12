import { describe, it, expect } from "vitest";
import { LINK_LABEL_MAX, LINK_REACH, frontPanelAt, linkClickAction, linkMarker, nextLinkMarker, openLinkTitle, releaseIsClick, textLinks, type DrawnPanel, type DrawnPlate, type LinkClickInput } from "./links";

const plain: LinkClickInput = { click: true, link: { external: false }, isFocus: true, focusDistance: 0, mod: false, alt: false, panKey: false, touch: false };

describe("linkClickAction", () => {
	it("follows a link within the graph on a plain click on the focused node", () => {
		expect(linkClickAction(plain)).toBe("follow");
	});

	it("never follows a link on touch: a tap there is a tap on its node", () => {
		expect(linkClickAction({ ...plain, touch: true })).toBe("node");
		expect(linkClickAction({ ...plain, touch: true, link: { external: true } })).toBe("node");
		expect(linkClickAction({ ...plain, touch: true, link: null })).toBe("node");
		expect(linkClickAction({ ...plain, touch: true, click: false })).toBe("none");
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

describe("nextLinkMarker", () => {
	it("is 1 in a note with no markers", () => {
		expect(nextLinkMarker("")).toBe(1);
		expect(nextLinkMarker("- Sheet [[Deck#^cleat]]\n- Fender [[Deck|the deck]]\n")).toBe(1);
	});

	it("takes one past the highest marker, leaving gaps where links were deleted", () => {
		expect(nextLinkMarker("- A [[Deck#^a|^1]]\n- B [[Deck#^b|^2]]\n")).toBe(3);
		expect(nextLinkMarker("- B [[Deck#^b|^2]]\n")).toBe(3);
		expect(nextLinkMarker("- A [[Deck#^a|^7]] and [[Galley|^3]]\n")).toBe(8);
	});

	it("counts markdown-style marker links, and ignores markers that are not a link's whole display text", () => {
		expect(nextLinkMarker("- A [^4](Deck.md#^a)\n")).toBe(5);
		expect(nextLinkMarker("- A [[Deck#^a|see ^9]] ^12 [^5]\n[^5]: a footnote\n")).toBe(1);
	});

	it("writes the marker as plain text", () => {
		expect(linkMarker(3)).toBe("^3");
	});
});

describe("releaseIsClick", () => {
	const press = { x: 100, y: 100 };

	it("is a click when released in place or within the slop", () => {
		expect(releaseIsClick(press, 100, 100, false, 6)).toBe(true);
		expect(releaseIsClick(press, 104, 104, false, 6)).toBe(true);
	});

	it("is no click when the release lands past the slop, even with no move seen before it", () => {
		expect(releaseIsClick(press, 107, 100, false, 6)).toBe(false);
		expect(releaseIsClick(press, 140, 160, false, 6)).toBe(false);
	});

	it("is no click when the system cancelled the pointer", () => {
		expect(releaseIsClick(press, 100, 100, true, 6)).toBe(false);
	});
});

describe("openLinkTitle", () => {
	it("names a short link", () => {
		expect(openLinkTitle("Knots")).toBe('Open link "Knots"');
		expect(openLinkTitle("  Obsidian\n help ")).toBe('Open link "Obsidian help"');
	});

	it("falls back to plain text for a long or empty link", () => {
		expect(openLinkTitle("x".repeat(LINK_LABEL_MAX))).toBe(`Open link "${"x".repeat(LINK_LABEL_MAX)}"`);
		expect(openLinkTitle("x".repeat(LINK_LABEL_MAX + 1))).toBe("Open link");
		expect(openLinkTitle("   ")).toBe("Open link");
	});
});

describe("textLinks", () => {
	it("lists wikilinks, Markdown links and bare URLs in order", () => {
		const links = textLinks("The loop is at [[Knots#^bowline|the bowline]], see [help](https://help.obsidian.md) and https://example.com/tides");
		expect(links).toEqual([
			{ href: "Knots#^bowline", text: "the bowline", external: false },
			{ href: "https://help.obsidian.md", text: "help", external: true },
			{ href: "https://example.com/tides", text: "https://example.com/tides", external: true },
		]);
	});

	it("shows a wikilink without an alias by its link text", () => {
		expect(textLinks("Down to [[#Far shore]] or [[Knots]]")).toEqual([
			{ href: "#Far shore", text: "#Far shore", external: false },
			{ href: "Knots", text: "Knots", external: false },
		]);
	});

	it("reads an internal Markdown link's path, decoded", () => {
		expect(textLinks("[Bends](Rope%20Work.md#Bends) and [chart](<Sea Charts.md>)")).toEqual([
			{ href: "Rope Work.md#Bends", text: "Bends", external: false },
			{ href: "Sea Charts.md", text: "chart", external: false },
		]);
	});

	it("skips embeds, images and inline code", () => {
		expect(textLinks("![[Knots]] ![map](harbour.png) `[[Not a link]]` [[Real]]")).toEqual([{ href: "Real", text: "Real", external: false }]);
	});

	it("lists a target once, and at most the cap", () => {
		expect(textLinks("[[A]] [[A|again]] [[B]]")).toHaveLength(2);
		expect(textLinks("[[A]] [[B]] [[C]] [[D]] [[E]] [[F]] [[G]]")).toHaveLength(5);
		expect(textLinks("[[A]] [[B]] [[C]]", 2).map((l) => l.href)).toEqual(["A", "B"]);
	});

	it("finds nothing in plain text", () => {
		expect(textLinks("Coil the line clockwise")).toEqual([]);
	});
});
