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

	// A label's text sits in a child span, so the label itself can centre it
	// while the child clips it.
	el["createSpan"] = function (this: Element, o?: { cls?: string | string[]; text?: string }) {
		const span = document.createElement("span");
		for (const token of o?.cls === undefined ? [] : [o.cls].flat()) span.classList.add(token);
		if (o?.text !== undefined) span.textContent = o.text;
		return this.appendChild(span);
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
			{ x: 0.25, y: 0.1, w: 0.25, h: 0.08, text: "Deck" },
			{ x: 0.5, y: 0.9, w: 0.25, h: 0.08, text: "Pier" },
		],
	};

	it("draws one positioned label per annotation", () => {
		const labels = Array.from(render("front", annotated).querySelectorAll(".osmosis-occlusion-annotation"));

		expect(labels.map((l) => l.textContent)).toEqual(["Deck", "Pier"]);
		expect((labels[0] as HTMLElement).style.getPropertyValue("--osmosis-annotation-x")).toBe("25%");
		expect((labels[0] as HTMLElement).style.getPropertyValue("--osmosis-annotation-y")).toBe("10%");
	});

	it("sizes the label from its box, as a fraction of the picture", () => {
		// Percentages of the annotation layer, which is pinned to the wrapper and
		// so is the image's own box — no measurement anywhere.
		const label = render("front", annotated).querySelector<HTMLElement>(".osmosis-occlusion-annotation");

		expect(label?.style.getPropertyValue("--osmosis-annotation-w")).toBe("25%");
		expect(label?.style.getPropertyValue("--osmosis-annotation-h")).toBe("8%");
	});

	it("hands the height over a second time in container units, for the font size", () => {
		// `font-size` resolves a percentage against the parent's font size, not
		// against any box, so the one thing percentages cannot express goes over
		// as `cqh` — which is why only the font degrades without container
		// queries, and the label still lands and turns correctly.
		const label = render("front", annotated).querySelector<HTMLElement>(".osmosis-occlusion-annotation");

		expect(label?.style.getPropertyValue("--osmosis-annotation-size")).toBe("8cqh");
	});

	it("puts the text in its own child, so the label can centre what the child clips", () => {
		const label = render("front", annotated).querySelector(".osmosis-occlusion-annotation");

		expect(label?.querySelector(".osmosis-occlusion-annotation-text")?.textContent).toBe("Deck");
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

/**
 * The picture and its masks are the whole of what this renderer draws. Anki's
 * Header and Back Extra are deliberately not part of the format — a card's text
 * is the note's own prose around the embed, which every study surface already
 * renders itself.
 */
describe("renderOcclusion content", () => {
	it("puts nothing around the picture on any side", () => {
		for (const side of ["front", "back", "all-hidden", "all-revealed"] as const) {
			const children = Array.from(render(side).children);

			expect(children.map((el) => el.className)).toEqual(["osmosis-occlusion"]);
		}
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

/**
 * Rotation is the one thing here that cannot be done in normalised coordinates
 * alone. The overlay is stretched by `preserveAspectRatio="none"`, so a plain
 * `rotate()` inside it is applied *after* the stretch and a tilted rectangle
 * renders as a parallelogram. The renderer therefore reads the image's
 * proportions and hands them to `maskElements`, painting at square until the
 * picture has loaded and repainting once it has.
 */
describe("rotation", () => {
	/** A deliberately wide image, where a shear would be unmistakable. */
	const WIDE = { width: 1600, height: 800 };

	const tilted: CardOcclusion = {
		image: "bridge.svg",
		mode: "hide-all-guess-one",
		target: "c1",
		// A deliberately oblique angle: at 90° the matrix's diagonal is all zeroes
		// and a sheared transform would pass the perpendicularity test below by
		// accident.
		shapes: [{ group: "c1", kind: "rect", x: 0.3, y: 0.45, w: 0.4, h: 0.1, rotation: 37 }],
	};

	/** Give the container's image a natural size, as a loaded one would have. */
	function loaded(container: HTMLElement, natural = WIDE): HTMLImageElement {
		const img = container.querySelector("img")!;
		Object.defineProperty(img, "naturalWidth", { value: natural.width, configurable: true });
		Object.defineProperty(img, "naturalHeight", { value: natural.height, configurable: true });
		return img;
	}

	it("paints a rotated mask through a matrix, never a bare rotate()", () => {
		const mask = render("front", tilted).querySelector(".osmosis-occlusion-mask");

		expect(mask?.getAttribute("transform")).toMatch(/^matrix\(/);
	});

	it("keeps a rotated rect a rectangle on a wide image, not a parallelogram", () => {
		// The two edges leaving a corner must still meet at a right angle once
		// the overlay's own stretch has been applied — that is the whole test.
		const container = document.createElement("div");
		const img = document.createElement("img");
		Object.defineProperty(img, "naturalWidth", { value: WIDE.width, configurable: true });
		Object.defineProperty(img, "naturalHeight", { value: WIDE.height, configurable: true });
		container.appendChild(img);
		overlayMasks(img, tilted, "front");

		const [a, b, c, d] = matrixParts(
			container.querySelector(".osmosis-occlusion-mask")!.getAttribute("transform")!,
		) as [number, number, number, number];
		// Each column, scaled back into pixel proportions by the stretch the SVG
		// applies: (a·W, b·H) and (c·W, d·H). Perpendicular means the dot product
		// of those two is zero.
		// To five places, not ten: the matrix is written to six decimals, which is
		// sub-pixel on any image but leaves a floor no assertion can go under.
		const aspect = WIDE.width / WIDE.height;
		expect(a * c * aspect * aspect + b * d).toBeCloseTo(0, 5);
	});

	it("shears at square, which is exactly why it repaints once the image loads", () => {
		// Painted before the picture's proportions are known, the same matrix has
		// no compensation in it — so the first paint is provisional by design.
		const container = render("front", tilted);
		const [a, b, c, d] = matrixParts(
			container.querySelector(".osmosis-occlusion-mask")!.getAttribute("transform")!,
		) as [number, number, number, number];

		expect(a * c * 4 + b * d).not.toBeCloseTo(0, 10);
	});

	it("repaints with the real aspect when the image finishes loading", () => {
		const container = render("front", tilted);
		const before = container.querySelector(".osmosis-occlusion-mask")!.getAttribute("transform");

		loaded(container).dispatchEvent(new Event("load"));

		const after = container.querySelector(".osmosis-occlusion-mask")!.getAttribute("transform");
		expect(after).not.toBe(before);
		expect(container.querySelectorAll(".osmosis-occlusion-masks")).toHaveLength(1);
	});

	it("keeps the image itself across the repaint, so it is never re-requested", () => {
		const container = render("front", tilted);
		const img = loaded(container);

		img.dispatchEvent(new Event("load"));

		expect(container.querySelector("img")).toBe(img);
	});

	it("registers no load listener at all when nothing is rotated", () => {
		// The overwhelmingly common case must cost nothing — and a repaint on a
		// listener that fires again would be a loop.
		const container = render("front");
		const before = container.innerHTML;

		loaded(container).dispatchEvent(new Event("load"));

		expect(container.innerHTML).toBe(before);
	});

	it("does not repaint a second time, so a load cannot loop", () => {
		const container = render("front", tilted);
		const img = loaded(container);
		img.dispatchEvent(new Event("load"));
		const after = container.innerHTML;

		img.dispatchEvent(new Event("load"));

		expect(container.innerHTML).toBe(after);
	});

	it("turns a label with CSS, which needs no aspect compensation of its own", () => {
		// An annotation is positioned HTML precisely so that it escapes the
		// overlay's stretch, so screen space is the space it is already in.
		const container = render("front", {
			...tilted,
			annotations: [{ x: 0.5, y: 0.12, w: 0.25, h: 0.08, rotation: 45, text: "Deck" }],
		});
		const label = container.querySelector<HTMLElement>(".osmosis-occlusion-annotation");

		expect(label?.style.getPropertyValue("--osmosis-annotation-rotation")).toBe("45deg");
	});

	it("leaves an unturned label at zero rather than omitting the property", () => {
		const container = render("front", {
			...tilted,
			annotations: [{ x: 0.5, y: 0.12, w: 0.25, h: 0.08, text: "Deck" }],
		});
		const label = container.querySelector<HTMLElement>(".osmosis-occlusion-annotation");

		expect(label?.style.getPropertyValue("--osmosis-annotation-rotation")).toBe("0deg");
	});
});

/** The six numbers out of a `matrix(...)` transform. */
function matrixParts(transform: string): number[] {
	return /^matrix\(([^)]*)\)$/.exec(transform)![1]!.split(",").map((part) => Number(part.trim()));
}
