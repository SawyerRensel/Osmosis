/**
 * Perf readout for the 3D graph, behind a toggle in the viewport's bottom-left
 * corner (hidden by default).
 *
 * Click the readout to hide or show every label, to compare frame cost with
 * and without them.
 */

import { setIcon, setTooltip } from "obsidian";
import type { Group, Sprite, WebGLRenderer } from "three";

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
	private passes: Timed[] = [];
	private lastFrame = 0;
	private lastRefresh = 0;
	private wanted = 0;
	private missing = 0;
	private backlogSince: number | null = null;
	private lastFill: { ms: number; peak: number } | null = null;
	private backlogPeak = 0;
	private created = 0;

	constructor(container: HTMLElement, private readonly renderer: WebGLRenderer, private readonly labels: Group) {
		this.corner = container.createDiv({ cls: "osmosis-graph3d-perf" });
		this.el = this.corner.createDiv({ cls: "osmosis-graph3d-perf-readout is-hidden" });
		this.el.addEventListener("click", this.toggleLabels);
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

	/** One label pass: how many labels are wanted, how many still lack one after it, and its cost. */
	labelPass(now: number, wanted: number, missing: number, created: number, ms: number): void {
		if (!this.shown) return;
		this.wanted = wanted;
		this.missing = missing;
		this.created += created;
		if (created > 0) this.passes.push({ at: now, ms });
		if (missing > 0) {
			this.backlogSince ??= now;
			this.backlogPeak = Math.max(this.backlogPeak, missing + created);
		} else if (this.backlogSince !== null) {
			this.lastFill = { ms: now - this.backlogSince, peak: this.backlogPeak };
			this.backlogSince = null;
			this.backlogPeak = 0;
		}
	}

	frame(now: number, tickMs: number): void {
		if (!this.shown) return;
		if (this.lastFrame !== 0) this.frames.push({ at: now, ms: now - this.lastFrame });
		this.lastFrame = now;
		this.ticks.push({ at: now, ms: tickMs });
		if (now - this.lastRefresh < REFRESH_MS) return;
		this.lastRefresh = now;
		for (const list of [this.frames, this.ticks, this.renders, this.passes]) {
			while (list.length > 0 && now - list[0]!.at > WINDOW_MS) list.shift();
		}
		if (this.shown) this.el.setText(this.report(now));
	}

	private report(now: number): string {
		const info = this.renderer.info;
		const avg = (list: Timed[]) => (list.length === 0 ? 0 : list.reduce((sum, t) => sum + t.ms, 0) / list.length);
		const max = (list: Timed[]) => list.reduce((m, t) => Math.max(m, t.ms), 0);
		let bytes = 0;
		let sprites = 0;
		for (const child of this.labels.children) {
			const image = (child as Sprite).material.map?.image as { width: number; height: number } | undefined;
			if (image === undefined) continue;
			sprites++;
			// RGBA, plus a third again for the mipmap chain.
			bytes += image.width * image.height * 4 * (4 / 3);
		}
		const fill = this.backlogSince !== null
			? `filling ${((now - this.backlogSince) / 1000).toFixed(1)} s…`
			: this.lastFill === null ? "—" : `${(this.lastFill.ms / 1000).toFixed(2)} s for ${this.lastFill.peak}`;
		return [
			`fps ${this.frames.length}  frame avg ${avg(this.frames).toFixed(1)} / worst ${max(this.frames).toFixed(1)} ms`,
			`cpu: tick ${avg(this.ticks).toFixed(2)} ms  render ${avg(this.renders).toFixed(2)} ms (max ${max(this.renders).toFixed(1)})`,
			`draw calls ${info.render.calls}  triangles ${info.render.triangles}  textures ${info.memory.textures}`,
			`labels ${sprites}${this.labels.visible ? "" : " (hidden)"}  ~${(bytes / 1048576).toFixed(1)} MB GPU`,
			`middle tier: wanted ${this.wanted}  missing ${this.missing}  created ${this.created}`,
			`creation pass avg ${avg(this.passes).toFixed(1)} / max ${max(this.passes).toFixed(1)} ms  last fill ${fill}`,
		].join("\n");
	}

	private readonly toggleLabels = (): void => {
		this.labels.visible = !this.labels.visible;
	};

	private readonly toggleReadout = (): void => {
		this.shown = !this.shown;
		this.el.toggleClass("is-hidden", !this.shown);
		this.toggleEl.toggleClass("is-active", this.shown);
		// Start the averages afresh: nothing was recorded while it was hidden.
		this.frames = [];
		this.ticks = [];
		this.renders = [];
		this.passes = [];
		this.lastFrame = 0;
		this.lastRefresh = 0;
	};

	destroy(): void {
		this.renderer.render = this.render;
		this.el.removeEventListener("click", this.toggleLabels);
		this.toggleEl.removeEventListener("click", this.toggleReadout);
		this.corner.remove();
	}
}
