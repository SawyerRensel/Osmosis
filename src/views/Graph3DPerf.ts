/**
 * Perf readout for the 3D graph, behind a toggle in the viewport's bottom-left
 * corner (hidden by default).
 *
 * Click the readout to hide or show every plate, to compare frame cost with
 * and without them.
 */

import { setIcon, setTooltip } from "obsidian";
import type { WebGLRenderer } from "three";
import type { Graph3DPlates } from "./Graph3DPlates";

const REFRESH_MS = 500;
/** Frames, renders and passes older than this drop out of the averages. */
const WINDOW_MS = 1000;

interface Timed {
	at: number;
	ms: number;
}

export class Graph3DPerf {
	private readonly corner: HTMLElement;
	private readonly el: HTMLElement;
	private readonly toggleEl: HTMLElement;
	private shown = false;
	private readonly render: WebGLRenderer["render"];
	private frames: Timed[] = [];
	private ticks: Timed[] = [];
	private renders: Timed[] = [];
	private lastFrame = 0;
	private lastRefresh = 0;
	/** The last time new data needed plates: how many, and how long laying them out took. */
	private lastPlating: { count: number; ms: number } | null = null;

	constructor(container: HTMLElement, private readonly renderer: WebGLRenderer, private readonly plates: Graph3DPlates) {
		this.corner = container.createDiv({ cls: "osmosis-graph3d-perf" });
		this.el = this.corner.createDiv({ cls: "osmosis-graph3d-perf-readout is-hidden" });
		this.el.addEventListener("click", this.togglePlates);
		this.toggleEl = this.corner.createDiv({ cls: "osmosis-graph3d-perf-toggle clickable-icon" });
		setIcon(this.toggleEl, "gauge");
		setTooltip(this.toggleEl, "Performance readout");
		this.toggleEl.addEventListener("click", this.toggleReadout);
		// The engine renders on its own animation loop; time each call there.
		this.render = renderer.render.bind(renderer);
		renderer.render = (scene, camera) => {
			if (!this.shown) {
				this.render(scene, camera);
				return;
			}
			const start = performance.now();
			this.render(scene, camera);
			this.renders.push({ at: start, ms: performance.now() - start });
		};
	}

	/** New data was shown: `count` plates were laid out, in `ms`. */
	plated(count: number, ms: number): void {
		if (count > 0) this.lastPlating = { count, ms };
	}

	frame(now: number, tickMs: number): void {
		if (!this.shown) return;
		if (this.lastFrame !== 0) this.frames.push({ at: now, ms: now - this.lastFrame });
		this.lastFrame = now;
		this.ticks.push({ at: now, ms: tickMs });
		if (now - this.lastRefresh < REFRESH_MS) return;
		this.lastRefresh = now;
		for (const list of [this.frames, this.ticks, this.renders]) {
			while (list.length > 0 && now - list[0]!.at > WINDOW_MS) list.shift();
		}
		if (this.shown) this.el.setText(this.report());
	}

	private report(): string {
		const info = this.renderer.info;
		const avg = (list: Timed[]) => (list.length === 0 ? 0 : list.reduce((sum, t) => sum + t.ms, 0) / list.length);
		const max = (list: Timed[]) => list.reduce((m, t) => Math.max(m, t.ms), 0);
		const plates = this.plates.stats();
		const mb = (bytes: number) => (bytes / 1048576).toFixed(1);
		const plating = this.lastPlating === null ? "—" : `${this.lastPlating.count} in ${this.lastPlating.ms.toFixed(1)} ms`;
		return [
			`fps ${this.frames.length}  frame avg ${avg(this.frames).toFixed(1)} / worst ${max(this.frames).toFixed(1)} ms`,
			`cpu: tick ${avg(this.ticks).toFixed(2)} ms  render ${avg(this.renders).toFixed(2)} ms (max ${max(this.renders).toFixed(1)})`,
			`draw calls ${info.render.calls}  triangles ${info.render.triangles}  textures ${info.memory.textures}`,
			`plates ${plates.plates}  glyphs ${plates.glyphs}${this.plates.group.visible ? "" : " (hidden)"}`,
			`atlas ${plates.pages} page(s) ~${mb(plates.atlasBytes)} MB  instances ~${mb(plates.instanceBytes)} MB GPU`,
			`last plating ${plating}`,
		].join("\n");
	}

	private readonly togglePlates = (): void => {
		this.plates.group.visible = !this.plates.group.visible;
	};

	private readonly toggleReadout = (): void => {
		this.shown = !this.shown;
		this.el.toggleClass("is-hidden", !this.shown);
		this.toggleEl.toggleClass("is-active", this.shown);
		// Start the averages afresh: nothing was recorded while it was hidden.
		this.frames = [];
		this.ticks = [];
		this.renders = [];
		this.lastFrame = 0;
		this.lastRefresh = 0;
	};

	destroy(): void {
		this.renderer.render = this.render;
		this.el.removeEventListener("click", this.togglePlates);
		this.toggleEl.removeEventListener("click", this.toggleReadout);
		this.corner.remove();
	}
}
