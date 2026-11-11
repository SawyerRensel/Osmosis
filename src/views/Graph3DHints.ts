/**
 * The edge-hint labels (`../graph3d/edge-hints.ts`): a small fixed pool of
 * CSS2D labels, not one per edge. The scene says each frame which hints show
 * (`place`) and `end` eases the pool toward that: a label fades in as it is
 * chosen and out when it is not, and its slot is then free again. Labels are
 * inert (the near layer passes the pointer through, and so do they) and are
 * drawn by the near tier's CSS2D renderer, so they stack over the canvas.
 */

import { Group, Vector3 } from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { HINT_MAX, labelShift } from "../graph3d/edge-hints";

/** Slots beyond `HINT_MAX`, so a hint that has just left can finish fading while its replacement fades in. */
const SPARE_SLOTS = 4;

/** Seconds for a label's opacity to close most of the way to its target. */
const EASE_SECONDS = 0.12;

/** Below this opacity a fading label is gone and its slot is free. */
const GONE = 0.02;

interface Slot {
	object: CSS2DObject;
	box: HTMLElement;
	id: string | null;
	opacity: number;
	target: number;
	/** What was last written to the DOM, so an unchanged label costs nothing. */
	written: { opacity: string; transform: string };
}

export class Graph3DHints {
	readonly group = new Group();
	private readonly slots: Slot[] = [];
	private readonly shown = new Set<string>();

	constructor() {
		for (let i = 0; i < HINT_MAX + SPARE_SLOTS; i++) {
			const anchor = createDiv({ cls: "osmosis-graph3d-hint-anchor" });
			const box = anchor.createDiv({ cls: "osmosis-graph3d-hint" });
			const object = new CSS2DObject(anchor);
			object.visible = false;
			this.group.add(object);
			this.slots.push({ object, box, id: null, opacity: 0, target: 0, written: { opacity: "", transform: "" } });
		}
	}

	/** The hints currently chosen (fading in or shown), for `chooseHints`' hysteresis. */
	ids(): ReadonlySet<string> {
		return this.shown;
	}

	/** Start a frame: nothing is chosen until `place` says so. */
	begin(): void {
		this.shown.clear();
		for (const slot of this.slots) slot.target = 0;
	}

	/**
	 * Choose hint `id` this frame, anchored at `at` (world) with the label on
	 * the far side of it from the node, `direction` being the edge's screen
	 * direction (y up); `depth` stacks it like a panel at that depth. `text`
	 * is asked for only when the hint takes a slot. A full pool drops it.
	 */
	place(id: string, text: () => string, at: Vector3, direction: { x: number; y: number }, depth: number, opacity: number): void {
		let slot = this.slots.find((s) => s.id === id);
		if (slot === undefined) {
			slot = this.slots.find((s) => s.id === null);
			if (slot === undefined) return;
			slot.id = id;
			slot.opacity = 0;
			slot.box.setText(text());
		}
		this.shown.add(id);
		slot.target = opacity;
		slot.object.position.copy(at);
		slot.object.renderOrder = -depth;
		const shift = labelShift(direction.x, direction.y);
		const transform = `translate(${shift.x}%, ${shift.y}%)`;
		if (transform !== slot.written.transform) {
			slot.box.setCssStyles({ transform });
			slot.written.transform = transform;
		}
	}

	/** End a frame: ease every label toward its target, hide the ones that have faded out. */
	end(seconds: number): void {
		const ease = 1 - Math.exp(-seconds / EASE_SECONDS);
		for (const slot of this.slots) {
			if (slot.id === null) continue;
			slot.opacity += (slot.target - slot.opacity) * ease;
			if (slot.target === 0 && slot.opacity < GONE) {
				slot.id = null;
				slot.opacity = 0;
				slot.object.visible = false;
				slot.written.opacity = "";
				continue;
			}
			slot.object.visible = true;
			const opacity = slot.opacity.toFixed(3);
			if (opacity !== slot.written.opacity) {
				slot.object.element.setCssStyles({ opacity });
				slot.written.opacity = opacity;
			}
		}
	}

	dispose(): void {
		// CSS2DObject removes its element from the page when it leaves the scene.
		this.group.removeFromParent();
		this.group.clear();
	}
}
