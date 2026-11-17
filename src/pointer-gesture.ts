/**
 * Shared pointer-gesture rules for the 3D graph and the 2D mind map: when a
 * press that moved is a drag rather than a click, and what a mouse press means
 * in the 3D view. Pure, so it can be unit tested (Vitest cannot import
 * `obsidian`).
 */

/** A press that moves this many px or more, between down and up, is a drag; less is a click. */
export const CLICK_SLOP_PX = 4;

/** Whether a press that has moved (`dx`, `dy`) px has become a drag. */
export function movedPastSlop(dx: number, dy: number): boolean {
	return Math.hypot(dx, dy) >= CLICK_SLOP_PX;
}

/**
 * What a press starts in the 3D view.
 * - `orbit`: turn the view about its pivot.
 * - `pan`: slide the view (OrbitControls does it).
 * - `link`: drag-to-link from the line under the press (edit mode, mouse or pen only); falls back to `orbit` when the press is not on a line.
 * - `boxSelect`: reserved for box select; it must not move the camera.
 * - `panOrMenu`: the right button. A drag pans (OrbitControls), a release that never moved opens the context menu.
 * - `none`: not ours (the middle button zooms, through OrbitControls).
 */
export type PointerGesture = "orbit" | "pan" | "link" | "boxSelect" | "panOrMenu" | "none";

export interface GestureInput {
	/** `PointerEvent.button`: 0 left, 1 middle, 2 right. */
	button: number;
	/** `PointerEvent.pointerType`: "mouse", "pen" or "touch". */
	pointerType: string;
	shiftKey: boolean;
	altKey: boolean;
	ctrlKey: boolean;
	metaKey: boolean;
	/** The 3D view's edit mode is on. */
	editMode: boolean;
}

/**
 * The gesture a press starts. A finger always orbits, in edit mode too (a
 * long hold multi-selects, handled by the scene; on touch a link is made from
 * the toolbar, never by a drag). A mouse's (or pen's) left
 * button orbits; with Shift it is box select, with Ctrl or Cmd a pan, and
 * with Alt (edit mode only) a link. Shift beats Ctrl/Cmd beats Alt, so no
 * chord falls through to a gesture OrbitControls would also act on.
 */
export function gestureFor(input: GestureInput): PointerGesture {
	if (input.pointerType === "touch") return "orbit";
	if (input.button === 2) return "panOrMenu";
	if (input.button !== 0) return "none";
	if (input.shiftKey) return "boxSelect";
	if (input.ctrlKey || input.metaKey) return "pan";
	if (input.altKey && input.editMode) return "link";
	return "orbit";
}
