/**
 * Gesture arbitration for the mind map's pointer handlers. It lives outside
 * `MindMapView` so it can be unit tested — Vitest cannot import `obsidian`.
 */

export type SpatialMode = "off" | "peek" | "study";

/** Pixels a mouse travels before a press becomes a drag. */
export const MOUSE_DRAG_THRESHOLD = 5;

/**
 * Pixels a finger travels before a touch becomes a drag. Wider than the mouse's
 * slop because a finger rolls as it presses and again as it lifts; 5px of that
 * wobble is not an attempt to move anything.
 */
export const TOUCH_DRAG_THRESHOLD = 10;

export function dragThreshold(pointerType: string): number {
	return pointerType === "touch" ? TOUCH_DRAG_THRESHOLD : MOUSE_DRAG_THRESHOLD;
}

/** Whether a gesture has travelled far enough to mean a drag. */
export function exceedsDragThreshold(
	dx: number,
	dy: number,
	pointerType: string,
): boolean {
	return Math.sqrt(dx * dx + dy * dy) >= dragThreshold(pointerType);
}

/**
 * Whether the tap or click that ends a pan should be swallowed.
 *
 * A pan ends wherever the pointer happens to be resting, and in peek/study a
 * tap on a node is a reveal — so a drag meant to move the map flipped the card
 * it landed on. A finger does this on any drag; a mouse only when the drag
 * begins and ends inside one node, since a click otherwise lands on the common
 * ancestor of the two. Outside those modes the tap only moves the selection,
 * which is harmless and long-standing, so it stays.
 */
export function panSwallowsTap(opts: {
	panCommitted: boolean;
	spatialMode: SpatialMode;
}): boolean {
	return opts.panCommitted && opts.spatialMode !== "off";
}
