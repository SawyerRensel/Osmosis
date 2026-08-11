// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from "vitest";
import type { App } from "obsidian";
import type { CardOcclusion } from "../database/types";
import { renderOcclusion } from "./OcclusionRenderer";

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

	el["createDiv"] = function (this: Element, o?: { cls?: string; text?: string }) {
		const div = document.createElement("div");
		if (o?.cls !== undefined) div.setAttribute("class", o.cls);
		if (o?.text !== undefined) div.textContent = o.text;
		return this.appendChild(div);
	};

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

function render(side: "front" | "back", card: CardOcclusion = occlusion): HTMLElement {
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
