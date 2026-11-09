import { setIcon, setTooltip } from "obsidian";
import { CONTROL_GROUPS } from "../graph3d/controls-help";

/**
 * The "?" button in the 3D view's corner and the panel it opens: the controls
 * list from `controls-help.ts`. A click anywhere else, or Escape (the view's
 * scope asks `close`), closes it.
 */
export class Graph3DHelp {
	private readonly buttonEl: HTMLElement;
	private readonly panelEl: HTMLElement;

	constructor(container: HTMLElement, corner: HTMLElement) {
		this.buttonEl = corner.createDiv({ cls: "osmosis-graph3d-help-toggle clickable-icon" });
		setIcon(this.buttonEl, "help");
		setTooltip(this.buttonEl, "Controls");
		this.buttonEl.addEventListener("click", () => this.toggle(!this.isOpen));

		this.panelEl = container.createDiv({ cls: "osmosis-graph3d-help is-hidden" });
		this.panelEl.createDiv({ cls: "osmosis-graph3d-help-title", text: "3D graph controls" });
		for (const group of CONTROL_GROUPS) {
			this.panelEl.createDiv({ cls: "osmosis-graph3d-help-heading", text: group.title });
			const list = this.panelEl.createEl("dl", { cls: "osmosis-graph3d-help-list" });
			for (const entry of group.entries) {
				list.createEl("dt", { text: entry.input });
				list.createEl("dd", { text: entry.action });
			}
		}
	}

	get isOpen(): boolean {
		return !this.panelEl.hasClass("is-hidden");
	}

	toggle(open: boolean): void {
		this.panelEl.toggleClass("is-hidden", !open);
		this.buttonEl.toggleClass("is-active", open);
		if (open) activeDocument.addEventListener("pointerdown", this.onOutside, true);
		else activeDocument.removeEventListener("pointerdown", this.onOutside, true);
	}

	/** Close it; true when it was open (so Escape is spent). */
	close(): boolean {
		if (!this.isOpen) return false;
		this.toggle(false);
		return true;
	}

	destroy(): void {
		activeDocument.removeEventListener("pointerdown", this.onOutside, true);
	}

	private readonly onOutside = (e: PointerEvent): void => {
		if (e.target instanceof Node && (this.panelEl.contains(e.target) || this.buttonEl.contains(e.target))) return;
		this.toggle(false);
	};
}
