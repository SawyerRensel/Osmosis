/**
 * The 3D view's navigation gizmos, as data: three round buttons at the top
 * right (Blender's navigation gizmo, without its axis ball). Press one and
 * drag anywhere to rotate, pan or zoom the view until release. The buttons are
 * `Graph3DGizmos`; `Graph3DScene` turns what they report into the camera's own
 * rotate, pan and zoom. Pure, so the mapping and the gate are tested.
 */

export type GizmoKind = "rotate" | "pan" | "zoom";

export interface GizmoDef {
	kind: GizmoKind;
	icon: string;
	label: string;
	/** The cursor while the pointer is over the gizmo and while it is dragged (the held cursor follows a captured pointer). */
	cursor: { rest: string; drag: string };
}

/** Top to bottom. */
export const GIZMOS: readonly GizmoDef[] = [
	{ kind: "rotate", icon: "rotate-3d", label: "Drag to rotate the view", cursor: { rest: "grab", drag: "grabbing" } },
	{ kind: "pan", icon: "hand", label: "Drag to pan the view", cursor: { rest: "move", drag: "move" } },
	{ kind: "zoom", icon: "search", label: "Drag up to zoom in, down to zoom out", cursor: { rest: "ns-resize", drag: "ns-resize" } },
];

/** Natural-log zoom for a drag the height of the view: ×8 in or out. */
export const GIZMO_ZOOM_PER_HEIGHT = Math.log(8);

/**
 * The gizmos stand in for modifier drags on a mouse or touchpad, so a touch
 * screen (a phone, or a laptop with one) does without them; it has the
 * joysticks instead. The inverse of the joystick toggle's gate.
 */
export function gizmosAvailable(device: { isMobile: boolean; maxTouchPoints: number }): boolean {
	return !device.isMobile && !(device.maxTouchPoints > 0);
}

/** The natural-log zoom for a vertical drag of `dy` px (down is positive) in a view `height` px tall: up zooms in, so it is positive. */
export function gizmoZoom(dy: number, height: number): number {
	return (-dy / Math.max(1, height)) * GIZMO_ZOOM_PER_HEIGHT;
}
