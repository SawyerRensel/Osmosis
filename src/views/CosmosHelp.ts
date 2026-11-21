import { CONTROL_GROUPS } from "../cosmos/controls-help";

/**
 * Cosmos's controls help: the panel the Osmosis bar's last button ("?",
 * `buttonEl`, whose click calls `toggle`) opens above the bar, listing
 * `controls-help.ts`. A click anywhere else, or Escape (the view's scope asks
 * `close`), closes it.
 */
export class CosmosHelp {
	private readonly panelEl: HTMLElement;

	constructor(container: HTMLElement, private readonly buttonEl: HTMLElement | null) {
		this.panelEl = container.createDiv({ cls: "osmosis-cosmos-help is-hidden" });
		this.panelEl.createDiv({ cls: "osmosis-cosmos-help-title", text: "Cosmos controls" });
		for (const group of CONTROL_GROUPS) {
			this.panelEl.createDiv({ cls: "osmosis-cosmos-help-heading", text: group.title });
			const list = this.panelEl.createEl("dl", { cls: "osmosis-cosmos-help-list" });
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
		this.buttonEl?.toggleClass("is-active", open);
		this.buttonEl?.setAttribute("aria-pressed", String(open));
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
		if (e.target instanceof Node && (this.panelEl.contains(e.target) || this.buttonEl?.contains(e.target) === true)) return;
		this.toggle(false);
	};
}
