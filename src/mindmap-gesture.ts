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
 * Whether a drag that began on a node moves the map rather than the node.
 *
 * Reading mode and peek/study always pan: a stray drag must not be able to
 * restructure the note, and during a review it must not flip a card either. In
 * edit mode a mouse drags the node from the first pixel, while a finger pans
 * unless the press was held long enough to mean it — a phone has no second
 * button, so the hold is what distinguishes moving the map from moving a node.
 */
export function nodeDragPans(opts: {
	pointerType: string;
	longPressTriggered: boolean;
	isReadingMode: boolean;
	spatialMode: SpatialMode;
}): boolean {
	if (opts.isReadingMode || opts.spatialMode !== "off") return true;
	return opts.pointerType === "touch" && !opts.longPressTriggered;
}
