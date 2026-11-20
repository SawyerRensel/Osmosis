/**
 * Perf readout for Cosmos, behind a toggle in the viewport's top-left
 * corner (hidden by default). Nothing is recorded while it is hidden.
 *
 * Click the readout to hide or show every plate, to compare frame cost with
 * and without them.
 */

import type { WebGLRenderer } from "three";
import type { CosmosPlates } from "./CosmosPlates";
import type { CosmosNear, NearStats } from "./CosmosNear";
import { PerfGauge, PERF_REFRESH_MS, PERF_WINDOW_MS } from "./PerfGauge";
import { Rolling, loafLine, untimedMs } from "../perf-stats";

/** Something with a `render(scene, camera)` to time: the WebGL renderer and the near tier's CSS2D/CSS3D renderers. */
interface Renders {
	render: (...args: never[]) => void;
}

export class CosmosPerf {
	private readonly gauge: PerfGauge;
	private readonly restore: (() => void)[] = [];
	private readonly frames = new Rolling();
	private readonly ticks = new Rolling();
	private readonly renders = new Rolling();
	/** The near tier's CSS2D and CSS3D renders, together, per frame. */
	private readonly panelRenders = new Rolling();
	private readonly places = new Rolling();
	private readonly masks = new Rolling();
	private readonly transforms = new Rolling();
	private readonly rasters = new Rolling();
	/** Force-engine frames: from its charge force to the WebGL render that follows. */
	private readonly engine = new Rolling();
	private engineStartAt = 0;
	private lastFrame = 0;
	private lastRefresh = 0;
	/** Panel renders of the frame in progress, summed over both renderers. */
	private panelMs = 0;
	private readonly nearStats: NearStats = { placeMs: 0, transforms: 0, masks: 0, rasters: 0 };
	/** The last time new data needed plates: how many, and how long laying them out took. */
	private lastPlating: { count: number; ms: number } | null = null;

	constructor(container: HTMLElement, private readonly renderer: WebGLRenderer, private readonly plates: CosmosPlates, private readonly near: CosmosNear) {
		this.gauge = new PerfGauge(container, this.onToggle, this.togglePlates);
		// The engine renders on its own animation loop; time each call there.
		this.wrap(renderer, (ms, start) => {
			this.renders.push(start, ms);
			if (this.engineStartAt !== 0) {
				this.engine.push(start, start - this.engineStartAt);
				this.engineStartAt = 0;
			}
		});
		for (const css of [near.renderer, near.renderer3d]) this.wrap(css, (ms) => (this.panelMs += ms));
	}

	/** Time `target.render` while shown; `record` gets its duration and start. */
	private wrap(target: Renders, record: (ms: number, start: number) => void): void {
		const render = target.render.bind(target);
		target.render = (...args: never[]) => {
			if (!this.gauge.shown) {
				render(...args);
				return;
			}
			const start = performance.now();
			render(...args);
			record(performance.now() - start, start);
		};
		this.restore.push(() => (target.render = render));
	}

	/** New data was shown: `count` plates were laid out, in `ms`. */
	plated(count: number, ms: number): void {
		if (count > 0) this.lastPlating = { count, ms };
	}

	/** The force engine began a tick (its charge force ran). */
	engineTick(): void {
		if (this.gauge.shown && this.engineStartAt === 0) this.engineStartAt = performance.now();
	}

	frame(now: number, tickMs: number): void {
		if (!this.gauge.shown) return;
		if (this.lastFrame !== 0) this.frames.push(now, now - this.lastFrame);
		this.lastFrame = now;
		this.ticks.push(now, tickMs);
		// The panels drawn since the last frame: the engine's loop renders between our ticks.
		this.panelRenders.push(now, this.panelMs);
		this.places.push(now, this.nearStats.placeMs);
		this.masks.push(now, this.nearStats.masks);
		this.transforms.push(now, this.nearStats.transforms);
		this.rasters.push(now, this.nearStats.rasters);
		this.panelMs = 0;
		this.nearStats.placeMs = 0;
		this.nearStats.masks = 0;
		this.nearStats.transforms = 0;
		this.nearStats.rasters = 0;
		if (now - this.lastRefresh < PERF_REFRESH_MS) return;
		this.lastRefresh = now;
		for (const list of [this.frames, this.ticks, this.renders, this.panelRenders, this.places, this.masks, this.transforms, this.rasters, this.engine]) list.prune(now, PERF_WINDOW_MS);
		this.gauge.loaf.prune(now, PERF_WINDOW_MS);
		this.gauge.setText(this.report());
	}

	private report(): string {
		const info = this.renderer.info;
		const plates = this.plates.stats();
		const mb = (bytes: number) => (bytes / 1048576).toFixed(1);
		const plating = this.lastPlating === null ? "—" : `${this.lastPlating.count} in ${this.lastPlating.ms.toFixed(1)} ms`;
		const kinds = this.near.panelKinds();
		// The engine's frames per our frames: it only ticks while the layout runs.
		const engineMs = this.frames.count === 0 ? 0 : this.engine.sum() / this.frames.count;
		const frameAvg = this.frames.avg();
		const untimed = untimedMs(frameAvg, [this.ticks.avg(), this.renders.avg(), this.panelRenders.avg(), engineMs]);
		return [
			`fps ${this.frames.count}  frame avg ${frameAvg.toFixed(1)} / worst ${this.frames.max().toFixed(1)} ms`,
			`cpu: tick ${this.ticks.avg().toFixed(2)} ms  render ${this.renders.avg().toFixed(2)} ms (max ${this.renders.max().toFixed(1)})`,
			`panels: render ${this.panelRenders.avg().toFixed(2)} ms (max ${this.panelRenders.max().toFixed(1)})  place ${this.places.avg().toFixed(2)} ms  transforms ${this.transforms.avg().toFixed(0)}  masks ${this.masks.avg().toFixed(1)}  re-rasters ${this.rasters.avg().toFixed(1)} /frame`,
			`live panels ${kinds.panels} (code ${kinds.code}, image ${kinds.image}, plain ${kinds.plain})`,
			`engine: ${this.engine.count === 0 ? "idle" : `${this.engine.avg().toFixed(2)} ms/tick (max ${this.engine.max().toFixed(1)}), ${this.engine.count} ticks/s`}`,
			loafLine(this.gauge.loafSupported, this.gauge.loaf.summary(), untimed),
			`draw calls ${info.render.calls}  triangles ${info.render.triangles}  textures ${info.memory.textures}`,
			`plates ${plates.plates}  glyphs ${plates.glyphs}${this.plates.group.visible ? "" : " (hidden)"}`,
			`atlas ${plates.pages} page(s) ~${mb(plates.atlasBytes)} MB  instances ~${mb(plates.instanceBytes)} MB GPU`,
			`last plating ${plating}  queued ${plates.queued}  ·  writes: layout ${plates.layoutMs.toFixed(1)} ms  tick ${plates.tickMs.toFixed(2)} ms  glyphs ${plates.glyphMs.toFixed(1)} ms`,
		].join("\n");
	}

	private readonly togglePlates = (): void => {
		this.plates.group.visible = !this.plates.group.visible;
	};

	private readonly onToggle = (shown: boolean): void => {
		// Start the averages afresh: nothing was recorded while it was hidden.
		for (const list of [this.frames, this.ticks, this.renders, this.panelRenders, this.places, this.masks, this.transforms, this.rasters, this.engine]) list.clear();
		this.lastFrame = 0;
		this.lastRefresh = 0;
		this.panelMs = 0;
		this.engineStartAt = 0;
		this.nearStats.placeMs = 0;
		this.nearStats.masks = 0;
		this.nearStats.transforms = 0;
		this.nearStats.rasters = 0;
		this.near.stats = shown ? this.nearStats : null;
	};

	destroy(): void {
		for (const restore of this.restore) restore();
		this.near.stats = null;
		this.gauge.destroy();
	}
}
