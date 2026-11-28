/**
 * The perf gauge's chrome, shared by the 2D Mind Map and Cosmos: a
 * toggle in the view's top-left corner (hidden by default) and the readout
 * under it, plus the browser's long animation frames while it is shown.
 * Nothing is observed or recorded while it is hidden.
 */

import { setIcon, setTooltip } from "obsidian";
import { LoafStats, type LoafEntry } from "../perf-stats";

/** How often the readout's text is rewritten. */
export const PERF_REFRESH_MS = 500;
/** Samples older than this drop out of the averages. */
export const PERF_WINDOW_MS = 1000;

const LOAF = "long-animation-frame";

export class PerfGauge {
	private readonly corner: HTMLElement;
	private readonly readout: HTMLElement;
	private readonly toggleEl: HTMLElement;
	private observer: PerformanceObserver | null = null;
	shown = false;
	/** Long animation frames (over 50 ms) seen while shown. */
	readonly loaf = new LoafStats();
	readonly loafSupported = typeof PerformanceObserver !== "undefined" && (PerformanceObserver.supportedEntryTypes ?? []).includes(LOAF);

	/**
	 * `onToggle` runs after each show or hide, to start or stop the owner's own recording.
	 * `isolate` keeps pointer and wheel events on the gauge from reaching the view under it (the 2D map pans on them).
	 */
	constructor(private container: HTMLElement, private readonly onToggle: (shown: boolean) => void, onReadoutClick?: (e: MouseEvent) => void, isolate = false) {
		this.corner = container.createDiv({ cls: "osmosis-perf" });
		if (isolate) {
			for (const type of ["pointerdown", "pointerup", "mousedown", "click", "dblclick", "contextmenu", "wheel", "touchstart"]) {
				this.corner.addEventListener(type, (e) => e.stopPropagation());
			}
		}
		this.toggleEl = this.corner.createDiv({ cls: "osmosis-perf-toggle clickable-icon" });
		setIcon(this.toggleEl, "gauge");
		setTooltip(this.toggleEl, "Performance readout");
		this.toggleEl.addEventListener("click", this.toggle);
		// Below the toggle: the corner is the viewport's top left, so the readout opens downward.
		this.readout = this.corner.createDiv({ cls: "osmosis-perf-readout is-hidden" });
		if (onReadoutClick !== undefined) {
			this.readout.addClass("is-clickable");
			this.readout.addEventListener("click", onReadoutClick);
		}
	}

	setText(text: string): void {
		if (this.shown) this.readout.setText(text);
	}

	/** Put the corner back after the container was emptied. */
	attach(): void {
		if (this.corner.parentElement !== this.container) this.container.appendChild(this.corner);
	}

	private readonly toggle = (): void => {
		this.shown = !this.shown;
		this.readout.toggleClass("is-hidden", !this.shown);
		this.toggleEl.toggleClass("is-active", this.shown);
		this.loaf.clear();
		if (this.shown && this.loafSupported) {
			this.observer = new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) this.loaf.push(entry as unknown as LoafEntry);
			});
			this.observer.observe({ type: LOAF, buffered: false });
		} else {
			this.observer?.disconnect();
			this.observer = null;
		}
		this.onToggle(this.shown);
	};

	destroy(): void {
		this.observer?.disconnect();
		this.observer = null;
		this.toggleEl.removeEventListener("click", this.toggle);
		this.corner.remove();
	}
}
