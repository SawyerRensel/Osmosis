/**
 * Plates in front of a near-tier panel. A panel is DOM, layered over the
 * WebGL canvas, so left alone it covers every plate, nearer or farther. Each
 * plate nearer than a panel and overlapping it is cut out of the panel with a
 * CSS mask instead, so the plate on the canvas shows through, exactly as a
 * nearer plate covers a farther one in the depth buffer. Nothing is hidden or
 * moved: the panel just stops drawing where it is behind something. See
 * `vault/Planner/3D Graph - Note title and H1 plates draw in a fixed order.md`.
 *
 * All lengths here are CSS px. Screen positions run right and down from the
 * viewport's top-left corner.
 */

/** A plate as drawn on screen this frame: a rounded rectangle at one view depth. */
export interface ScreenPlate {
	id: string;
	/** Centre on screen. */
	x: number;
	y: number;
	halfWidth: number;
	halfHeight: number;
	/** Corner radius. */
	radius: number;
	/** View depth: every point of a camera-facing plate has its centre's. */
	depth: number;
}

/** A panel as drawn on screen: laid out `width` × `height`, centred on (`x`, `y`) and scaled by `scale`. */
export interface ScreenPanel {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	scale: number;
	depth: number;
}

/** A hole to cut, in the panel's own layout px (before its scale), from its top-left corner. */
export interface PanelHole {
	left: number;
	top: number;
	width: number;
	height: number;
	radius: number;
}

/**
 * The plates in front of `panel` that overlap it, as holes in its own layout
 * px. The panel's own plate (same `id`) lies under it and is never a hole.
 */
export function panelHoles(panel: ScreenPanel, plates: readonly ScreenPlate[]): PanelHole[] {
	const holes: PanelHole[] = [];
	if (panel.scale <= 0 || panel.width <= 0 || panel.height <= 0) return holes;
	const halfWidth = (panel.width * panel.scale) / 2;
	const halfHeight = (panel.height * panel.scale) / 2;
	for (const plate of plates) {
		if (plate.depth >= panel.depth || plate.id === panel.id) continue;
		if (Math.abs(plate.x - panel.x) >= halfWidth + plate.halfWidth || Math.abs(plate.y - panel.y) >= halfHeight + plate.halfHeight) continue;
		holes.push({
			left: (plate.x - plate.halfWidth - panel.x) / panel.scale + panel.width / 2,
			top: (plate.y - plate.halfHeight - panel.y) / panel.scale + panel.height / 2,
			width: (2 * plate.halfWidth) / panel.scale,
			height: (2 * plate.halfHeight) / panel.scale,
			radius: plate.radius / panel.scale,
		});
	}
	return holes;
}

/** The CSS mask layers that cut `holes` out of an element; `null` for no mask. */
export interface HoleMask {
	image: string;
	size: string;
	position: string;
	composite: string;
}

const FILL = "linear-gradient(#000 0 0)";
/** A disc filling its layer, for a rounded corner. The half-px ramp anti-aliases it like the plate's edge. */
const DISC = "radial-gradient(circle closest-side, #000 calc(100% - 0.5px), transparent)";
const px = (n: number): string => `${Math.round(n * 100) / 100}px`;

/**
 * The mask that leaves an element showing everywhere except `holes`. The top
 * layer fills the element and subtracts every layer under it; those add up to
 * the union of the holes, so overlapping holes stay holes. Each rounded
 * rectangle is two crossed rectangles and four corner discs, because CSS
 * gradients have no rounded rectangle.
 */
export function holeMask(holes: readonly PanelHole[]): HoleMask | null {
	if (holes.length === 0) return null;
	const image = [FILL];
	const size = ["100% 100%"];
	const position = ["0 0"];
	const layer = (img: string, left: number, top: number, width: number, height: number): void => {
		image.push(img);
		size.push(`${px(width)} ${px(height)}`);
		position.push(`${px(left)} ${px(top)}`);
	};
	for (const hole of holes) {
		const { left, top, width, height } = hole;
		const r = Math.min(Math.max(0, hole.radius), width / 2, height / 2);
		layer(FILL, left, top + r, width, height - 2 * r);
		layer(FILL, left + r, top, width - 2 * r, height);
		if (r > 0) {
			const d = 2 * r;
			layer(DISC, left, top, d, d);
			layer(DISC, left + width - d, top, d, d);
			layer(DISC, left, top + height - d, d, d);
			layer(DISC, left + width - d, top + height - d, d, d);
		}
	}
	const composite = ["subtract", ...image.slice(1).map(() => "add")];
	return { image: image.join(", "), size: size.join(", "), position: position.join(", "), composite: composite.join(", ") };
}
