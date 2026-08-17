import type { App } from "obsidian";
import type { CardOcclusion, OcclusionAnnotation } from "../database/types";
import { decodeEmbedTarget } from "../card-gen/occlusion";
import { maskElements, needsAspect, type MaskElement, type OcclusionSide } from "../study/occlusion-masks";

/**
 * Draws an occluded image: the picture, with its masks painted on top.
 *
 * Shared by every study surface, so all three mask the same way — sequential
 * today, contextual and spatial in the phase that adds them.
 *
 * The overlay is an SVG stretched over the image with `viewBox="0 0 1 1"` and
 * `preserveAspectRatio="none"`, which is what makes normalised coordinates pay
 * off: the wrapper is shrink-to-fit around the image, the SVG is pinned to the
 * wrapper's edges, so a mask lands on the same pixels whatever size the image
 * renders at. Resizing the modal, a `|300` sizing suffix, or a retina variant
 * need no measurement and no resize listener.
 */

/**
 * Class names for each mask role — see `MaskRole` for what they mean.
 *
 * Arrays, not space-separated strings: `createSvg` hands `cls` straight to
 * `classList.add()`, which throws `InvalidCharacterError` on a token containing
 * a space. The HTML helpers accept a string, so the asymmetry is easy to trip —
 * and it does not fail quietly, it takes out the whole card render.
 */
const ROLE_CLASSES: Record<MaskElement["role"], string[]> = {
	hidden: ["osmosis-occlusion-mask"],
	target: ["osmosis-occlusion-mask", "is-target"],
	revealed: ["osmosis-occlusion-mask", "is-revealed"],
};

/**
 * Render `occlusion`'s image into `container` with the masks for `side`.
 *
 * `notePath` is the note the embed was written in, which is what resolves a
 * short link like `bridge.svg` to a file the way Obsidian would.
 */
export function renderOcclusion(
	app: App,
	container: HTMLElement,
	occlusion: CardOcclusion,
	side: OcclusionSide,
	notePath: string,
): void {
	const src = resolveImageSrc(app, occlusion.image, notePath);
	if (src === null) {
		container.createDiv({
			cls: "osmosis-occlusion-missing",
			text: `Image not found: ${occlusion.image}`,
		});
		return;
	}

	const wrapper = container.createDiv({ cls: "osmosis-occlusion" });
	createImage(wrapper, src, occlusion.image);

	paintMasks(wrapper, occlusion, side);
}

/** Every image this module has drawn, by source, at the size it turned out to be. */
const naturalSizes = new Map<string, { width: number; height: number }>();

/**
 * The picture, given its proportions up front whenever they are already known.
 *
 * A fresh `<img>` has no intrinsic size until it decodes — even served from
 * cache — so the element it is in has no height for a frame or two. That is the
 * scroll bug in its second form: a card *cannot* always avoid being rebuilt,
 * because rating rewrites the note's frontmatter and Obsidian answers a file
 * change by re-running a code block's processor. The rebuilt card collapses, the
 * document shortens under the reader, and reading view leaves them further down
 * the note than they were.
 *
 * `width`/`height` attributes are what the platform provides for exactly this:
 * with the stylesheet's `height: auto` they are read as the image's ratio and
 * the box is reserved before a single byte is decoded. They are only ever the
 * size this module measured on a previous render, so the first render of a
 * picture is unchanged — and there is nothing to jump on a first render anyway.
 */
function createImage(wrapper: HTMLElement, src: string, alt: string): HTMLImageElement {
	const known = naturalSizes.get(src);
	const img = wrapper.createEl("img", {
		cls: "osmosis-occlusion-image",
		attr: known === undefined
			? { src, alt }
			: { src, alt, width: String(known.width), height: String(known.height) },
	});

	if (known === undefined) {
		img.addEventListener("load", () => {
			if (img.naturalWidth > 0 && img.naturalHeight > 0) {
				naturalSizes.set(src, { width: img.naturalWidth, height: img.naturalHeight });
			}
		}, { once: true });
	}

	return img;
}

/**
 * Flip an already-rendered diagram to another side **without rebuilding it**.
 *
 * `container` is whatever `renderOcclusion` was drawn into. Everything it built
 * stays — the same `<img>`, so the file is not re-requested and the element
 * never loses its height; only the masks over it are repainted.
 *
 * That height is the whole point. A surface that redraws a card by emptying its
 * container and calling `renderOcclusion` again briefly holds a picture with no
 * intrinsic size — the image has not decoded yet — so the card collapses, the
 * document shortens, and reading view scrolls the reader somewhere else mid-
 * answer. Repainting keeps the box exactly where it was, which is why the line
 * surface never had the problem and the fence one did.
 */
export function repaintOcclusion(
	container: HTMLElement,
	occlusion: CardOcclusion,
	side: OcclusionSide,
): void {
	const img = container.querySelector("img");
	if (img) overlayMasks(img, occlusion, side);
}

/** Class marking a wrapper this module put *around* someone else's image. */
const OVERLAY_CLASS = "osmosis-occlusion-overlay";

/**
 * Pin masks over an image that something else already rendered.
 *
 * The alternative — drawing our own copy of the picture, as `renderOcclusion`
 * does — is wrong wherever the host has already committed to the image's size:
 * a mind-map node is laid out by measuring its rendered content, and a note's
 * own embed carries the user's `|300` suffix. Wrapping keeps whatever box the
 * image already occupies and honours the same contract, because the wrapper
 * shrinks to fit and the overlay is pinned to the wrapper.
 *
 * Idempotent: an image already inside a mask wrapper is repainted, not nested —
 * whether that wrapper came from here or from `renderOcclusion`. Repainting is
 * how a surface flips a diagram between covered and revealed without rebuilding
 * the `<img>`, which would re-request the file and flash the picture away.
 */
export function overlayMasks(
	img: HTMLImageElement,
	occlusion: CardOcclusion,
	side: OcclusionSide,
): void {
	const existing = img.parentElement;
	if (existing?.hasClass("osmosis-occlusion") === true) {
		// `paintMasks` clears everything but the image, so the picture itself is
		// never reloaded and never flashes away.
		paintMasks(existing, occlusion, side);
		return;
	}

	const wrapper = createDiv({ cls: ["osmosis-occlusion", OVERLAY_CLASS] });
	img.replaceWith(wrapper);
	wrapper.appendChild(img);
	paintMasks(wrapper, occlusion, side);
}

/** Undo every `overlayMasks` inside `root`, restoring the images it wrapped. */
export function removeMaskOverlays(root: ParentNode): void {
	for (const wrapper of Array.from(root.querySelectorAll(`.${OVERLAY_CLASS}`))) {
		const img = wrapper.querySelector("img");
		if (img) wrapper.replaceWith(img);
		else wrapper.remove();
	}
}

/**
 * Draw the mask layer and any annotations into a wrapper holding the image.
 *
 * Idempotent: everything but the image itself is cleared first, so a repaint
 * flips a diagram between covered and revealed without rebuilding the `<img>`,
 * which would re-request the file and flash the picture away.
 */
function paintMasks(wrapper: HTMLElement, occlusion: CardOcclusion, side: OcclusionSide): void {
	const img = wrapper.querySelector("img");
	for (const child of Array.from(wrapper.children)) {
		if (child !== img) child.remove();
	}

	// SVG attributes go on with setAttribute rather than through the helper's
	// `attr`, matching how `stats/charts.ts` draws — case-sensitive names like
	// viewBox and preserveAspectRatio then survive verbatim.
	const svg = wrapper.createSvg("svg", { cls: "osmosis-occlusion-masks" });
	svg.setAttribute("viewBox", "0 0 1 1");
	svg.setAttribute("preserveAspectRatio", "none");

	const elements = maskElements(occlusion, side, imageAspect(img));

	// A diagram with anything still covered is a question, not a picture to open.
	// The platform's image viewer clones the `<img>` alone — the masks are a
	// sibling SVG, so they are left behind — and what pops up over the card is the
	// unmasked picture: the answer. The class makes the image untouchable, which
	// takes the tap away from Obsidian's delegated `img` handler and hands it to
	// the wrapper, where the study surfaces are already listening for a reveal. A
	// diagram with nothing covered keeps the viewer: zooming it shows exactly what
	// is on screen already.
	wrapper.classList.toggle("is-covered", elements.some((el) => el.role !== "revealed"));

	for (const element of elements) {
		const mask = svg.createSvg(element.tag, { cls: ROLE_CLASSES[element.role] });
		for (const [name, value] of Object.entries(element.attrs)) {
			mask.setAttribute(name, value);
		}
	}

	// After the masks, so a label is never buried under one — and on both sides,
	// because an annotation labels the picture rather than any one group.
	renderAnnotations(wrapper, occlusion.annotations ?? []);

	awaitAspect(wrapper, img, occlusion, side);
}

/**
 * An image's width÷height, or 1 while it is still loading.
 *
 * Only rotation needs this — every other coordinate is normalised precisely so
 * that nothing has to be measured. A rotation is applied in the image's pixel
 * space, and the aspect ratio is what converts between the two.
 */
function imageAspect(img: HTMLImageElement | null): number {
	if (img === null) return 1;
	return img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1;
}

/**
 * Repaint once the image's proportions are known, when — and only when — the
 * masks actually depend on them.
 *
 * A rotated shape painted at `aspect = 1` shears until the picture has loaded,
 * so the first paint is provisional and this corrects it. Registered only for
 * an occlusion that has a rotation in it, so the overwhelmingly common case
 * adds no listener at all; `{ once: true }` plus the loaded check make a repaint
 * loop impossible, since by then `imageAspect` has a real number to hand.
 */
function awaitAspect(
	wrapper: HTMLElement,
	img: HTMLImageElement | null,
	occlusion: CardOcclusion,
	side: OcclusionSide,
): void {
	if (img === null || img.naturalWidth > 0) return;
	if (!needsAspect(occlusion)) return;
	img.addEventListener("load", () => { paintMasks(wrapper, occlusion, side); }, { once: true });
}

/**
 * Draw text labels over the image as positioned HTML, not SVG.
 *
 * The mask overlay is deliberately stretched — `viewBox="0 0 1 1"` with
 * `preserveAspectRatio="none"` — which is exactly what lets normalised
 * coordinates land without measuring anything. Text drawn in that space would
 * be stretched by the image's aspect ratio along with it, so a label on a wide
 * diagram would come out squashed. An absolutely positioned element sidesteps
 * the whole problem: percentages of the wrapper are the same normalised 0–1
 * coordinates, and the glyphs render at their true shape.
 *
 * The font size is a fixed UI size rather than a fraction of the image. A label
 * is chrome on the picture, not part of it, and one scaled to the image becomes
 * illegible the moment the card renders small — which is exactly what phase 5's
 * mind-map nodes will do to it.
 */
export function renderAnnotations(
	wrapper: HTMLElement,
	annotations: readonly OcclusionAnnotation[],
): void {
	if (annotations.length === 0) return;

	const layer = wrapper.createDiv({ cls: "osmosis-occlusion-annotations" });
	for (const annotation of annotations) {
		const label = layer.createDiv({ cls: "osmosis-occlusion-annotation" });
		// The text sits in a child so the label itself can centre it vertically
		// while the child does the horizontal clipping — a flex parent cannot
		// ellipsis its own anonymous text.
		label.createSpan({ cls: "osmosis-occlusion-annotation-text", text: annotation.text });
		placeAnnotation(label, annotation);
	}
}

/**
 * Place and size an annotation element from its box.
 *
 * Exported because the editor draws its own interactive labels and must place
 * them identically — a label dragged or resized in the editor has to land the
 * same way when the card is studied, which is the contract the mask overlay
 * keeps too.
 *
 * The box goes over as **percentages of the annotation layer**, which is pinned
 * to the wrapper and so is the image's own box — the same trick the whole
 * feature runs on, and it needs no container query to work.
 *
 * The *size* is the one thing percentages cannot express: `font-size` resolves
 * a percentage against the parent's font size, not against any box. So the
 * height goes over a second time in `cqh`, which the layer answers as a size
 * container. That is what makes a label's glyphs a fraction of the picture with
 * nothing measured, and it is why only the font degrades where container
 * queries are missing.
 *
 * The rotation is a plain CSS `rotate()` about the box's centre, with none of
 * the aspect compensation a mask needs: a label is positioned HTML precisely so
 * that it escapes the overlay's stretch, so screen space is the space it is
 * already in.
 */
export function placeAnnotation(el: HTMLElement, annotation: OcclusionAnnotation): void {
	el.setCssProps({
		"--osmosis-annotation-x": `${String(annotation.x * 100)}%`,
		"--osmosis-annotation-y": `${String(annotation.y * 100)}%`,
		"--osmosis-annotation-w": `${String(annotation.w * 100)}%`,
		"--osmosis-annotation-h": `${String(annotation.h * 100)}%`,
		"--osmosis-annotation-size": `${String(annotation.h * 100)}cqh`,
		"--osmosis-annotation-rotation": `${String(annotation.rotation ?? 0)}deg`,
	});
}

/**
 * The URL to load the embedded image from, or null when it does not resolve.
 *
 * The target is whatever the embed was written as — a vault-relative path, a
 * short link, or an external URL — so it goes through the metadata cache rather
 * than being treated as a path.
 */
function resolveImageSrc(app: App, image: string, notePath: string): string | null {
	if (/^https?:\/\//i.test(image)) return image;

	const file = app.metadataCache.getFirstLinkpathDest(decodeEmbedTarget(image), notePath);
	return file === null ? null : app.vault.getResourcePath(file);
}
