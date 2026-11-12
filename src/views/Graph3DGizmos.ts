/**
 * Three round navigation gizmos at the top right of the 3D view (rotate, pan,
 * zoom), for a mouse or touchpad: press one and drag anywhere to turn the
 * view until release. Which gizmos there are is `GIZMOS`; the camera work is
 * `Graph3DScene`'s, reached through `GizmoHandlers`.
 *
 * Each button is its own element over the canvas and captures its pointer, so
 * the drag goes on off the button and the canvas never also starts one. A
 * press that never moves does nothing: `begin` waits for the first move.
 */

import { setIcon, setTooltip } from "obsidian";
import { GIZMOS, type GizmoKind } from "../graph3d/gizmos";

export interface GizmoHandlers {
	/** The first move of a drag on gizmo `kind`. */
	begin: (kind: GizmoKind) => void;
	/** The pointer moved (`dx`, `dy`) px since the last report. */
	move: (kind: GizmoKind, dx: number, dy: number) => void;
	/** The drag ended; `released` is false when the system took the pointer (a cancel). */
	end: (kind: GizmoKind, released: boolean) => void;
}

interface Hold {
	pointerId: number;
	x: number;
	y: number;
	started: boolean;
}

export class Graph3DGizmos {
	constructor(container: HTMLElement, private readonly handlers: GizmoHandlers) {
		const column = container.createDiv({ cls: "osmosis-graph3d-gizmos" });
		for (const gizmo of GIZMOS) {
			const button = column.createDiv({ cls: `osmosis-graph3d-gizmo is-${gizmo.kind}` });
			button.setCssProps({ "--osmosis-gizmo-cursor": gizmo.cursor.rest, "--osmosis-gizmo-cursor-drag": gizmo.cursor.drag });
			setIcon(button, gizmo.icon);
			setTooltip(button, gizmo.label, { placement: "left" });
			this.listen(button, gizmo.kind);
		}
	}

	private listen(button: HTMLElement, kind: GizmoKind): void {
		let hold: Hold | null = null;
		const finish = (e: PointerEvent, released: boolean) => {
			if (hold === null || e.pointerId !== hold.pointerId) return;
			const { started, pointerId } = hold;
			hold = null;
			button.removeClass("is-dragging");
			if (button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
			if (started) this.handlers.end(kind, released);
		};
		button.addEventListener("pointerdown", (e) => {
			// The primary button only; a second pointer never steals a held gizmo.
			if (e.button !== 0 || hold !== null) return;
			e.preventDefault();
			e.stopPropagation();
			hold = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, started: false };
			button.addClass("is-dragging");
			button.setPointerCapture(e.pointerId);
		});
		button.addEventListener("pointermove", (e) => {
			if (hold === null || e.pointerId !== hold.pointerId) return;
			const dx = e.clientX - hold.x;
			const dy = e.clientY - hold.y;
			if (dx === 0 && dy === 0) return;
			hold.x = e.clientX;
			hold.y = e.clientY;
			if (!hold.started) {
				hold.started = true;
				this.handlers.begin(kind);
			}
			this.handlers.move(kind, dx, dy);
		});
		button.addEventListener("pointerup", (e) => finish(e, true));
		button.addEventListener("pointercancel", (e) => finish(e, false));
		button.addEventListener("lostpointercapture", (e) => finish(e, false));
	}
}
