import type { App } from "obsidian";
import type { CardOcclusion, OcclusionAnnotation } from "../database/types";
import { decodeEmbedTarget } from "../card-gen/occlusion";
import { maskElements, type MaskElement, type OcclusionSide } from "../study/occlusion-masks";

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
	wrapper.createEl("img", {
		cls: "osmosis-occlusion-image",
		attr: { src, alt: occlusion.image },
	});

	// SVG attributes go on with setAttribute rather than through the helper's
	// `attr`, matching how `stats/charts.ts` draws — case-sensitive names like
	// viewBox and preserveAspectRatio then survive verbatim.
	const svg = wrapper.createSvg("svg", { cls: "osmosis-occlusion-masks" });
	svg.setAttribute("viewBox", "0 0 1 1");
	svg.setAttribute("preserveAspectRatio", "none");

	for (const element of maskElements(occlusion, side)) {
		const mask = svg.createSvg(element.tag, { cls: ROLE_CLASSES[element.role] });
		for (const [name, value] of Object.entries(element.attrs)) {
			mask.setAttribute(name, value);
		}
	}

	// After the masks, so a label is never buried under one — and on both sides,
	// because an annotation labels the picture rather than any one group.
	renderAnnotations(wrapper, occlusion.annotations ?? []);
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
		const label = layer.createDiv({ cls: "osmosis-occlusion-annotation", text: annotation.text });
		positionAnnotation(label, annotation.x, annotation.y);
	}
}

/**
 * Place an annotation element at its normalised coordinates.
 *
 * Exported because the editor draws its own interactive labels and must place
 * them identically — a label dragged in the editor has to land on the same spot
 * when the card is studied, which is the same contract the mask overlay keeps.
 */
export function positionAnnotation(el: HTMLElement, x: number, y: number): void {
	el.setCssProps({
		"--osmosis-annotation-x": `${String(x * 100)}%`,
		"--osmosis-annotation-y": `${String(y * 100)}%`,
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
