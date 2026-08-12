// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from "vitest";
import type { App } from "obsidian";
import type { CardOcclusion } from "../database/types";
import type { OcclusionSide } from "../study/occlusion-masks";
import { overlayMasks, removeMaskOverlays, renderOcclusion } from "./OcclusionRenderer";

/**
 * Smoke tests that the mask overlay actually draws.
 *
 * They exist because the first cut of this renderer threw on its very first
 * mask and painted nothing: `createSvg` passes `cls` to `classList.add()`,
 * which rejects a token containing a space, and the study modal renders the
 * card front inside one method — so the exception took the rating bar with it
 * and the card looked like a plain unmasked image that would not flip.
 *
 * Obsidian's DOM helpers are polyfilled rather than mocked away, with that
 * asymmetry reproduced faithfully: a forgiving stub would let the bug straight
 * back in. Same reasoning as `stats/charts.dom.test.ts`.
 */
beforeAll(() => {
	const el = window.Element.prototype as unknown as Record<string, unknown>;

	const buildDiv = (o?: { cls?: string | string[]; text?: string }): HTMLDivElement => {
		const div = document.createElement("div");
		for (const token of o?.cls === undefined ? [] : [o.cls].flat()) div.classList.add(token);
		if (o?.text !== undefined) div.textContent = o.text;
		return div;
	};

	el["createDiv"] = function (this: Element, o?: { cls?: string | string[]; text?: string }) {
		return this.appendChild(buildDiv(o));
	};

	el["hasClass"] = function (this: Element, cls: string) {
		return this.classList.contains(cls);
	};

	// `overlayMasks` builds its wrapper detached, so it uses the global helper.
	(window as unknown as Record<string, unknown>)["createDiv"] = buildDiv;

	el["setCssProps"] = function (this: HTMLElement, props: Record<string, string>) {
		for (const [name, value] of Object.entries(props)) this.style.setProperty(name, value);
	};

	el["createEl"] = function (
		this: Element,
		tag: string,
		o?: { cls?: string; attr?: Record<string, string> },
	) {
		const node = document.createElement(tag);
		if (o?.cls !== undefined) node.setAttribute("class", o.cls);
		for (const [name, value] of Object.entries(o?.attr ?? {})) {
			node.setAttribute(name, value);
		}
		return this.appendChild(node);
	};

	// The strict one: one classList.add() per token, spaces and all.
	el["createSvg"] = function (this: Element, tag: string, o?: { cls?: string | string[] }) {
		const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
		for (const token of o?.cls === undefined ? [] : [o.cls].flat()) {
			node.classList.add(token);
		}
		return this.appendChild(node);
	};
});

/** An app whose vault holds exactly the image every fixture asks for. */
const app = {
	metadataCache: {
		getFirstLinkpathDest: (linkpath: string) =>
			linkpath === "bridge.svg" ? { path: linkpath } : null,
	},
	vault: {
		getResourcePath: (file: { path: string }) => `app://vault/${file.path}`,
	},
} as unknown as App;

const occlusion: CardOcclusion = {
	image: "bridge.svg",
	mode: "hide-all-guess-one",
	target: "c1",
	shapes: [
		{ group: "c1", kind: "rect", x: 0.31, y: 0.22, w: 0.14, h: 0.06 },
		{ group: "c2", kind: "ellipse", x: 0.55, y: 0.4, rx: 0.08, ry: 0.05 },
		{ group: "c3", kind: "poly", points: [[0.2, 0.18], [0.42, 0.18], [0.31, 0.34]] },
	],
};

function render(side: OcclusionSide, card: CardOcclusion = occlusion): HTMLElement {
	const container = document.createElement("div");
	renderOcclusion(app, container, card, side, "notes/bridges.md");
	return container;
}

describe("renderOcclusion", () => {
	it("draws the image with one mask per painted shape", () => {
		const container = render("front");

		const img = container.querySelector("img");
		expect(img?.getAttribute("src")).toBe("app://vault/bridge.svg");
		expect(container.querySelectorAll(".osmosis-occlusion-mask")).toHaveLength(3);
	});

	it("marks the target and leaves the siblings plain", () => {
		const container = render("front");
		const masks = Array.from(container.querySelectorAll(".osmosis-occlusion-mask"));

		expect(masks[0]!.classList.contains("is-target")).toBe(true);
		expect(masks[1]!.classList.contains("is-target")).toBe(false);
	});

	it("switches the target to its revealed outline on the back", () => {
		const masks = Array.from(render("back").querySelectorAll(".osmosis-occlusion-mask"));

		expect(masks[0]!.classList.contains("is-revealed")).toBe(true);
		expect(masks[1]!.classList.contains("is-revealed")).toBe(false);
	});

	it("stretches the overlay across the image in normalised coordinates", () => {
		const svg = render("front").querySelector(".osmosis-occlusion-masks");

		expect(svg?.getAttribute("viewBox")).toBe("0 0 1 1");
		expect(svg?.getAttribute("preserveAspectRatio")).toBe("none");
	});

	it("gives each shape kind its own element and geometry", () => {
		const masks = Array.from(render("front").querySelectorAll(".osmosis-occlusion-mask"));

		expect(masks.map((m) => m.tagName)).toEqual(["rect", "ellipse", "polygon"]);
		expect(masks[0]!.getAttribute("width")).toBe("0.14");
		expect(masks[1]!.getAttribute("cx")).toBe("0.55");
		expect(masks[2]!.getAttribute("points")).toBe("0.2,0.18 0.42,0.18 0.31,0.34");
	});

	it("says so instead of drawing a blank when the image does not resolve", () => {
		const container = render("front", { ...occlusion, image: "missing.svg" });

		expect(container.querySelector("img")).toBeNull();
		expect(container.querySelector(".osmosis-occlusion-missing")?.textContent)
			.toContain("missing.svg");
	});

	it("uses an external URL as the source unchanged", () => {
		const url = "https://example.com/bridge.svg";
		const container = render("front", { ...occlusion, image: url });

		expect(container.querySelector("img")?.getAttribute("src")).toBe(url);
	});
});

/**
 * Annotations are HTML, not SVG `<text>`. The mask overlay is stretched by
 * `preserveAspectRatio="none"` — the very thing that makes normalised
 * coordinates land without measurement — so glyphs drawn inside it would be
 * stretched with it and come out squashed on any non-square image.
 */
describe("renderOcclusion annotations", () => {
	const annotated: CardOcclusion = {
		...occlusion,
		annotations: [
			{ x: 0.25, y: 0.1, text: "Deck" },
			{ x: 0.5, y: 0.9, text: "Pier" },
		],
	};

	it("draws one positioned label per annotation", () => {
		const labels = Array.from(render("front", annotated).querySelectorAll(".osmosis-occlusion-annotation"));

		expect(labels.map((l) => l.textContent)).toEqual(["Deck", "Pier"]);
		expect((labels[0] as HTMLElement).style.getPropertyValue("--osmosis-annotation-x")).toBe("25%");
		expect((labels[0] as HTMLElement).style.getPropertyValue("--osmosis-annotation-y")).toBe("10%");
	});

	it("keeps labels out of the mask overlay so they are not stretched with it", () => {
		const container = render("front", annotated);

		expect(container.querySelectorAll(".osmosis-occlusion-masks .osmosis-occlusion-annotation"))
			.toHaveLength(0);
		expect(container.querySelector(".osmosis-occlusion-annotations")).not.toBeNull();
	});

	it("shows the same labels on the back — they label the picture, not a group", () => {
		expect(render("back", annotated).querySelectorAll(".osmosis-occlusion-annotation"))
			.toHaveLength(2);
	});

	it("adds no layer at all when there are none", () => {
		expect(render("front").querySelector(".osmosis-occlusion-annotations")).toBeNull();
	});
});

/**
 * The note views: contextual study, a mind-map node, peek on a line. Nobody is
 * answering one of the diagram's questions there, so every group is a blank at
 * once and the mode has nothing to say.
 */
describe("renderOcclusion in a note", () => {
	it("covers every group with no target, whatever the mode", () => {
		for (const mode of ["hide-all-guess-one", "hide-one-guess-one"] as const) {
			const masks = Array.from(
				render("all-hidden", { ...occlusion, mode, target: "" })
					.querySelectorAll(".osmosis-occlusion-mask"),
			);

			expect(masks).toHaveLength(3);
			expect(masks.some((m) => m.classList.contains("is-target"))).toBe(false);
		}
	});

	it("rings every group when revealed, so the answer says where the questions were", () => {
		const masks = Array.from(
			render("all-revealed", { ...occlusion, target: "" })
				.querySelectorAll(".osmosis-occlusion-mask"),
		);

		expect(masks).toHaveLength(3);
		expect(masks.every((m) => m.classList.contains("is-revealed"))).toBe(true);
	});
});

/** The two text fields the renderer draws. */
describe("renderOcclusion text fields", () => {
	const withFields: CardOcclusion = {
		...occlusion,
		header: "Which member carries the deck?",
		backExtra: "The truss chord, in tension.",
	};

	it("puts the header above the picture on both sides", () => {
		for (const side of ["front", "back"] as const) {
			const container = render(side, withFields);
			const header = container.querySelector(".osmosis-occlusion-header");

			expect(header?.textContent).toBe(withFields.header);
			// Before the image, not after it.
			expect(header?.nextElementSibling?.classList.contains("osmosis-occlusion")).toBe(true);
		}
	});

	it("holds Back Extra until the answer side, on cards and in the note alike", () => {
		// Built on every side and *hidden* on the question ones, never withheld: the
		// mind map renders a node once and flips it by repainting, and Back Extra
		// sits outside the wrapper a repaint reaches — so an element that was never
		// created could not be taken back.
		for (const side of ["front", "all-hidden"] as const) {
			const backExtra = render(side, withFields).querySelector(".osmosis-occlusion-back-extra");
			expect(backExtra?.textContent).toBe(withFields.backExtra);
			expect(backExtra?.classList.contains("osmosis-hidden")).toBe(true);
		}

		for (const side of ["back", "all-revealed"] as const) {
			const backExtra = render(side, withFields).querySelector(".osmosis-occlusion-back-extra");
			expect(backExtra?.textContent).toBe(withFields.backExtra);
			expect(backExtra?.classList.contains("osmosis-hidden")).toBe(false);
		}
	});

	it("adds nothing when a card carries neither", () => {
		const container = render("back");

		expect(container.querySelector(".osmosis-occlusion-header")).toBeNull();
		expect(container.querySelector(".osmosis-occlusion-back-extra")).toBeNull();
	});
});

/**
 * Masks pinned over an image something else rendered — a mind-map node, whose
 * size was measured from its rendered content, or a note's own embed carrying
 * the user's `|300` suffix. Drawing our own copy would change both.
 */
describe("overlayMasks", () => {
	/** An embed as Obsidian renders one: the image inside its `.internal-embed`. */
	function rendered(): { host: HTMLElement; img: HTMLImageElement } {
		const host = document.createElement("div");
		const embed = document.createElement("span");
		embed.className = "internal-embed";
		const img = document.createElement("img");
		img.setAttribute("src", "app://vault/bridge.svg");
		embed.appendChild(img);
		host.appendChild(embed);
		return { host, img };
	}

	it("wraps the image it was given rather than drawing another", () => {
		const { host, img } = rendered();
		overlayMasks(img, { ...occlusion, target: "" }, "all-hidden");

		expect(host.querySelectorAll("img")).toHaveLength(1);
		expect(host.querySelector("img")).toBe(img);
		expect(img.parentElement?.classList.contains("osmosis-occlusion")).toBe(true);
		expect(host.querySelectorAll(".osmosis-occlusion-mask")).toHaveLength(3);
	});

	it("repaints rather than nesting when called again, and never reloads the image", () => {
		const { host, img } = rendered();
		overlayMasks(img, { ...occlusion, target: "" }, "all-hidden");
		const wrapper = img.parentElement;
		overlayMasks(img, { ...occlusion, target: "" }, "all-revealed");

		expect(img.parentElement).toBe(wrapper);
		expect(host.querySelectorAll(".osmosis-occlusion")).toHaveLength(1);
		expect(host.querySelectorAll(".osmosis-occlusion-masks")).toHaveLength(1);
		expect(host.querySelector(".osmosis-occlusion-mask")?.classList.contains("is-revealed"))
			.toBe(true);
	});

	it("puts the image back exactly where it was when the overlay is removed", () => {
		const { host, img } = rendered();
		const before = host.innerHTML;
		overlayMasks(img, { ...occlusion, target: "" }, "all-hidden");
		removeMaskOverlays(host);

		expect(host.innerHTML).toBe(before);
		expect(host.querySelector("img")).toBe(img);
	});

	it("leaves a host with no overlay untouched", () => {
		const { host } = rendered();
		const before = host.innerHTML;
		removeMaskOverlays(host);

		expect(host.innerHTML).toBe(before);
	});
});
