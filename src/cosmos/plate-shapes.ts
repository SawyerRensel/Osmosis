/**
 * The mind map's topic shapes on Cosmos plates and panels (T130). See
 * `vault/Planner/Cosmos - Every plate shape and dashed borders.md`.
 *
 * - **Sizes** mirror the mind map's layout (`assignSizes` in `../layout.ts`):
 *   a shape is inflated by its content insets (`getShapeInsets`) so the text
 *   sits in the shape's inner box, and a circle is a square sized from its
 *   content's diagonal.
 * - **Far tier:** the plate shader draws each shape as a signed distance by
 *   its id (`PLATE_SHAPE_ID`); see `CosmosPlates.ts`.
 * - **Near tier:** a panel draws its shape as an SVG path and clips to it
 *   (`shapePath`), the mind map's geometry from `../shapes.ts`.
 *
 * Pure, so it is unit-tested.
 */

import { getShapeInsets } from "../shapes";
import type { TopicShape } from "../styles";

/** A node border's dash, from `border.style` (`none` is a stroke of 0, not a dash). */
export type BorderDash = "solid" | "dashed" | "dotted";

/**
 * Each shape's id in the plate shader. The rectangles share 0 and differ by
 * corner radius (`NodeLook.corner`); `underline` and `none` are bare plates.
 */
export const PLATE_SHAPE_ID: Readonly<Record<TopicShape, number>> = {
	rect: 0,
	"rounded-rect": 0,
	pill: 0,
	ellipse: 1,
	circle: 2,
	diamond: 3,
	hexagon: 4,
	octagon: 5,
	triangle: 6,
	parallelogram: 7,
	trapezoid: 8,
	"arrow-right": 9,
	cloud: 10,
	underline: 11,
	none: 12,
};

/** Each dash's id in the plate shader. */
export const DASH_ID: Readonly<Record<BorderDash, number>> = { solid: 0, dashed: 1, dotted: 2 };

/**
 * Dash and gap lengths in ems of text: the mind map's `stroke-dasharray`
 * (`4 2` dashed, `1 2` dotted, in px at its 16 px text).
 */
export const DASH_EM: Readonly<Record<Exclude<BorderDash, "solid">, readonly [number, number]>> = {
	dashed: [4 / 16, 2 / 16],
	dotted: [1 / 16, 2 / 16],
};

/** Whether `value` is a shape the mind map draws (frontmatter can hold anything). */
export function isTopicShape(value: unknown): value is TopicShape {
	return typeof value === "string" && Object.prototype.hasOwnProperty.call(PLATE_SHAPE_ID, value);
}

/** A rectangle with corners (rect, rounded-rect, pill): drawn by corner radius, no insets. */
export function isRectShape(shape: TopicShape): boolean {
	return PLATE_SHAPE_ID[shape] === 0;
}

/** A shape with no fill of its own (underline, none): Cosmos fills it with the scene's background. */
export function isBareShape(shape: TopicShape): boolean {
	return shape === "underline" || shape === "none";
}

/**
 * The box a `shape` needs around content `width` × `height` (padding
 * included), as the mind map's layout sizes it, and where the content's
 * centre sits across it (`textX`, from the box's centre: a triangle's and an
 * arrow's inner box is off-centre). Top and bottom insets are equal for every
 * shape, so the content is always centred vertically.
 */
export function shapeBox(shape: TopicShape, width: number, height: number): { width: number; height: number; textX: number } {
	const insets = getShapeInsets(shape);
	if (shape === "circle") {
		const fromMax = Math.max(width, height) / (1 - insets.left - insets.right);
		const diameter = Math.max(fromMax, Math.hypot(width, height));
		return { width: diameter, height: diameter, textX: 0 };
	}
	const left = Math.min(insets.left, 0.45);
	const right = Math.min(insets.right, 0.45);
	const vertical = Math.min(insets.top, 0.45) + Math.min(insets.bottom, 0.45);
	const boxWidth = width / (1 - left - right);
	return { width: boxWidth, height: height / (1 - vertical), textX: (boxWidth * (left - right)) / 2 };
}

/**
 * The shape's outline as an SVG path in a `width` × `height` box at the
 * origin (y down), the mind map's geometry (`../shapes.ts`). `radius` is a
 * rounded rectangle's corner, in the box's units. A circle whose box isn't
 * square is drawn as an ellipse, so content that outgrew the estimate is never
 * cut off.
 */
export function shapePath(shape: TopicShape, width: number, height: number, radius: number): string {
	const w = width;
	const h = height;
	const n = (value: number): string => String(Math.round(value * 100) / 100);
	const polygon = (points: [number, number][]): string => `M ${points.map(([x, y]) => `${n(x)} ${n(y)}`).join(" L ")} Z`;
	switch (shape) {
		case "rect":
		case "none":
			return polygon([[0, 0], [w, 0], [w, h], [0, h]]);
		case "rounded-rect":
		case "pill": {
			const r = Math.max(0, Math.min(shape === "pill" ? h / 2 : radius, w / 2, h / 2));
			if (r === 0) return polygon([[0, 0], [w, 0], [w, h], [0, h]]);
			const arc = (x: number, y: number): string => `A ${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y)}`;
			return `M ${n(r)} 0 L ${n(w - r)} 0 ${arc(w, r)} L ${n(w)} ${n(h - r)} ${arc(w - r, h)} L ${n(r)} ${n(h)} ${arc(0, h - r)} L 0 ${n(r)} ${arc(r, 0)} Z`;
		}
		case "ellipse":
		case "circle": {
			const arc = `A ${n(w / 2)} ${n(h / 2)} 0 1 0`;
			return `M 0 ${n(h / 2)} ${arc} ${n(w)} ${n(h / 2)} ${arc} 0 ${n(h / 2)} Z`;
		}
		case "diamond":
			return polygon([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]);
		case "hexagon": {
			const inset = Math.min(w * 0.25, h * 0.5);
			return polygon([[inset, 0], [w - inset, 0], [w, h / 2], [w - inset, h], [inset, h], [0, h / 2]]);
		}
		case "octagon": {
			const ix = w * 0.29;
			const iy = h * 0.29;
			return polygon([[ix, 0], [w - ix, 0], [w, iy], [w, h - iy], [w - ix, h], [ix, h], [0, h - iy], [0, iy]]);
		}
		case "triangle":
			return polygon([[0, 0], [w, h / 2], [0, h]]);
		case "parallelogram": {
			const skew = Math.min(w * 0.2, h);
			return polygon([[skew, 0], [w, 0], [w - skew, h], [0, h]]);
		}
		case "trapezoid": {
			const inset = w * 0.15;
			return polygon([[inset, 0], [w - inset, 0], [w, h], [0, h]]);
		}
		case "arrow-right": {
			const notch = Math.min(w * 0.3, h);
			return polygon([[0, 0], [w - notch, 0], [w, h / 2], [w - notch, h], [0, h], [notch * 0.5, h / 2]]);
		}
		case "cloud": {
			const bx = w * 0.15;
			const by = h * 0.25;
			const c = (...xy: number[]): string => `C ${n(xy[0]!)} ${n(xy[1]!)}, ${n(xy[2]!)} ${n(xy[3]!)}, ${n(xy[4]!)} ${n(xy[5]!)}`;
			return `M ${n(bx)} ${n(h / 2)} ` +
				`${c(0, by, w * 0.25, -by, w / 2, 0)} ` +
				`${c(w * 0.75, -by, w, by, w - bx, h / 2)} ` +
				`${c(w, h - by, w * 0.75, h + by, w / 2, h)} ` +
				`${c(w * 0.25, h + by, 0, h - by, bx, h / 2)} Z`;
		}
		case "underline":
			return `M 0 ${n(h)} L ${n(w)} ${n(h)}`;
	}
}
