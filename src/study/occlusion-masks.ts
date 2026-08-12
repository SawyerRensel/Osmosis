import type { CardOcclusion, OcclusionShape } from "../database/types";

/**
 * Which masks an occlusion card paints, and where.
 *
 * Kept separate from `OcclusionRenderer` because this is the whole of the
 * feature's correctness: given a mode, a side, and a target group, exactly which
 * shapes are covered and which are not. That decision is pure, so it is unit
 * tested rather than eyeballed through three study surfaces.
 *
 * Coordinates pass through untouched, still normalised 0–1 against the image's
 * own dimensions. The renderer paints them into an SVG whose viewBox is the
 * same 0–1 box stretched over the rendered image, so scaling — a `|300` suffix,
 * a resized modal, a retina variant — costs no arithmetic here.
 */

/**
 * What is being drawn.
 *
 * `front` and `back` are the two sides of one card: a group is being asked, so
 * the mode decides what happens to its siblings.
 *
 * `all-hidden` and `all-revealed` are the *note* views — contextual study, a
 * mind-map node, peek on a line. There is no current card there: the reader is
 * looking at a diagram, not answering one of the three questions it carries. So
 * every group is a blank at once, exactly as a contextual cloze shows all of its
 * blanks at once, and the mode is irrelevant — `hide-one-guess-one` describes
 * how one card relates to its siblings, and in the note there are no siblings to
 * relate to.
 */
export type OcclusionSide = "front" | "back" | "all-hidden" | "all-revealed";

/**
 * What a mask is doing on the side being drawn:
 * - `hidden` — covers some other group, so it stays opaque
 * - `target` — covers the group being asked
 * - `revealed` — the target on the answer side: outlined, not filled
 */
export type MaskRole = "hidden" | "target" | "revealed";

/** One SVG element to paint, in the image's normalised 0–1 coordinate space. */
export interface MaskElement {
	tag: "rect" | "ellipse" | "polygon";
	attrs: Record<string, string>;
	role: MaskRole;
}

/**
 * The masks to paint for one side of one occlusion card.
 *
 * | mode               | side  | target group | other groups |
 * |--------------------|-------|--------------|--------------|
 * | hide-all-guess-one | front | covered      | covered      |
 * | hide-all-guess-one | back  | revealed     | covered      |
 * | hide-one-guess-one | front | covered      | untouched    |
 * | hide-one-guess-one | back  | revealed     | untouched    |
 *
 * The note views ignore both the mode and the target: `all-hidden` covers every
 * group, `all-revealed` outlines every group.
 *
 * Shapes keep their source order, so a diagram whose masks overlap paints the
 * same way every time rather than reshuffling between front and back.
 */
export function maskElements(
	occlusion: CardOcclusion,
	side: OcclusionSide,
): MaskElement[] {
	const elements: MaskElement[] = [];
	for (const shape of occlusion.shapes) {
		const role = maskRole(shape, occlusion, side);
		if (role !== null) elements.push(maskElement(shape, role));
	}
	return elements;
}

/** The role this shape plays on the given side, or null when it is not painted. */
function maskRole(
	shape: OcclusionShape,
	occlusion: CardOcclusion,
	side: OcclusionSide,
): MaskRole | null {
	// The note views ask nothing, so there is no target to single out and no
	// sibling relationship for the mode to describe.
	if (side === "all-hidden") return "hidden";
	if (side === "all-revealed") return "revealed";

	if (shape.group === occlusion.target) {
		return side === "front" ? "target" : "revealed";
	}
	// Hide-one shows everything except the group being asked, so a sibling mask
	// is simply never drawn — on either side.
	return occlusion.mode === "hide-all-guess-one" ? "hidden" : null;
}

/** One shape as the SVG element that draws it. */
function maskElement(shape: OcclusionShape, role: MaskRole): MaskElement {
	switch (shape.kind) {
		case "rect":
			return {
				tag: "rect",
				role,
				attrs: {
					x: String(shape.x),
					y: String(shape.y),
					width: String(shape.w),
					height: String(shape.h),
				},
			};
		case "ellipse":
			// `x`/`y` are the centre, matching Anki's ellipse handles.
			return {
				tag: "ellipse",
				role,
				attrs: {
					cx: String(shape.x),
					cy: String(shape.y),
					rx: String(shape.rx),
					ry: String(shape.ry),
				},
			};
		case "poly":
			return {
				tag: "polygon",
				role,
				attrs: {
					points: shape.points.map(([x, y]) => `${x},${y}`).join(" "),
				},
			};
	}
}
