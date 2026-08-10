import type { App } from "obsidian";
import type { CardOcclusion } from "../database/types";
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

	const file = app.metadataCache.getFirstLinkpathDest(decodePath(image), notePath);
	return file === null ? null : app.vault.getResourcePath(file);
}

/** Markdown-style embeds percent-encode spaces; wikilinks do not. */
function decodePath(path: string): string {
	if (!path.includes("%")) return path;
	try {
		return decodeURIComponent(path);
	} catch {
		return path;
	}
}
