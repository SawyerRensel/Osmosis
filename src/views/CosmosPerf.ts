/**
 * Perf readout for Cosmos, behind a toggle in the viewport's top-left
 * corner (hidden by default). Nothing is recorded while it is hidden.
 *
 * Click the readout to hide or show every plate, to compare frame cost with
 * and without them. Shift+click it to stop or restart cutting plate and edge
 * holes out of the panels (`CosmosNear.masksOff`), to read the masks' cost.
 *
 * What the browser does outside our JS is split in two (T141): `after rAF`
 * times from the end of our frame callback to a message posted from it, which
 * runs once the browser's own rendering of that frame (style, layout, paint,
 * observers, commit) is done on the main thread; what remains of the frame is
 * off the main thread or idle (raster, GPU, compositing, waiting for vsync).
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
	/** Parts of the tick: the near tier's update, and the plate, edge and shell writes after a change. */
	private readonly nearUpdates = new Rolling();
	private readonly writes = new Rolling();
	private readonly renders = new Rolling();
	/** The near tier's CSS2D and CSS3D renders, together, per frame. */
	private readonly panelRenders = new Rolling();
	private readonly places = new Rolling();
	private readonly masks = new Rolling();
	private readonly transforms = new Rolling();
	private readonly rasters = new Rolling();
	private readonly maskLayers = new Rolling();
	/** Main-thread time from the end of our frame to the message posted then: the browser's rendering of the frame. */
	private readonly afterRaf = new Rolling();
	/** Posts the end of each frame to itself while shown; null while hidden. */
	private channel: MessageChannel | null = null;
	/** Force-engine frames: from its charge force to the WebGL render that follows. */
	private readonly engine = new Rolling();
	private engineStartAt = 0;
	private lastFrame = 0;
	private lastRefresh = 0;
	/** Panel renders of the frame in progress, summed over both renderers. */
	private panelMs = 0;
	private readonly nearStats: NearStats = { placeMs: 0, transforms: 0, masks: 0, maskLayers: 0, rasters: 0 };
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

	/** Our frame ended: it took `tickMs`, of which `nearMs` choosing the near tier and `writeMs` writing plates and edges. */
	frame(now: number, tickMs: number, nearMs: number, writeMs: number): void {
		if (!this.gauge.shown) return;
		if (this.lastFrame !== 0) this.frames.push(now, now - this.lastFrame);
		this.lastFrame = now;
		this.ticks.push(now, tickMs);
		this.nearUpdates.push(now, nearMs);
		this.writes.push(now, writeMs);
		// The panels drawn since the last frame: the engine's loop renders between our ticks.
		this.panelRenders.push(now, this.panelMs);
		this.places.push(now, this.nearStats.placeMs);
		this.masks.push(now, this.nearStats.masks);
		this.transforms.push(now, this.nearStats.transforms);
		this.rasters.push(now, this.nearStats.rasters);
		this.maskLayers.push(now, this.nearStats.maskLayers);
		this.channel?.port2.postMessage(performance.now());
		this.resetFrame();
		if (now - this.lastRefresh < PERF_REFRESH_MS) return;
		this.lastRefresh = now;
		for (const list of this.lists()) list.prune(now, PERF_WINDOW_MS);
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
		const timed = [this.ticks.avg(), this.renders.avg(), this.panelRenders.avg(), engineMs];
		const untimed = untimedMs(frameAvg, timed);
		const left = untimedMs(frameAvg, [...timed, this.afterRaf.avg()]);
		return [
			`fps ${this.frames.count}  frame avg ${frameAvg.toFixed(1)} / worst ${this.frames.max().toFixed(1)} ms`,
			`cpu: tick ${this.ticks.avg().toFixed(2)} ms (near ${this.nearUpdates.avg().toFixed(2)}, writes ${this.writes.avg().toFixed(2)})  render ${this.renders.avg().toFixed(2)} ms (max ${this.renders.max().toFixed(1)})`,
			`panels: render ${this.panelRenders.avg().toFixed(2)} ms (max ${this.panelRenders.max().toFixed(1)})  place ${this.places.avg().toFixed(2)} ms  transforms ${this.transforms.avg().toFixed(0)}  masks ${this.near.masksOff ? "off" : `${this.masks.avg().toFixed(1)} (${this.maskLayers.avg().toFixed(0)} layers)`}  re-rasters ${this.rasters.avg().toFixed(1)} /frame`,
			`live panels ${kinds.panels} (code ${kinds.code}, image ${kinds.image}, plain ${kinds.plain})`,
			`engine: ${this.engine.count === 0 ? "idle" : `${this.engine.avg().toFixed(2)} ms/tick (max ${this.engine.max().toFixed(1)}), ${this.engine.count} ticks/s`}`,
			loafLine(this.gauge.loafSupported, this.gauge.loaf.summary(), untimed),
			`untimed split: after rAF ${this.afterRaf.avg().toFixed(1)} ms (max ${this.afterRaf.max().toFixed(1)}) main thread  ·  left ${left.toFixed(1)} ms off it or idle`,
			`draw calls ${info.render.calls}  triangles ${info.render.triangles}  textures ${info.memory.textures}`,
			`plates ${plates.plates}  glyphs ${plates.glyphs}${this.plates.group.visible ? "" : " (hidden)"}`,
			`atlas ${plates.pages} page(s), ${plates.faces} face(s) ~${mb(plates.atlasBytes)} MB  instances ~${mb(plates.instanceBytes)} MB GPU`,
			`last plating ${plating}  queued ${plates.queued}  ·  writes: layout ${plates.layoutMs.toFixed(1)} ms  tick ${plates.tickMs.toFixed(2)} ms  glyphs ${plates.glyphMs.toFixed(1)} ms`,
		].join("\n");
	}

	private readonly togglePlates = (e: MouseEvent): void => {
		if (e.shiftKey) this.near.masksOff = !this.near.masksOff;
		else this.plates.group.visible = !this.plates.group.visible;
	};

	private lists(): Rolling[] {
		return [this.frames, this.ticks, this.nearUpdates, this.writes, this.renders, this.panelRenders, this.places, this.masks, this.maskLayers, this.transforms, this.rasters, this.engine, this.afterRaf];
	}

	private resetFrame(): void {
		this.panelMs = 0;
		this.nearStats.placeMs = 0;
		this.nearStats.masks = 0;
		this.nearStats.maskLayers = 0;
		this.nearStats.transforms = 0;
		this.nearStats.rasters = 0;
	}

	private readonly onAfterFrame = (e: MessageEvent<number>): void => {
		const now = performance.now();
		this.afterRaf.push(now, now - e.data);
	};

	private closeChannel(): void {
		if (this.channel === null) return;
		this.channel.port1.onmessage = null;
		this.channel.port1.close();
		this.channel.port2.close();
		this.channel = null;
	}

	private readonly onToggle = (shown: boolean): void => {
		// Start the averages afresh: nothing was recorded while it was hidden.
		for (const list of this.lists()) list.clear();
		this.lastFrame = 0;
		this.lastRefresh = 0;
		this.engineStartAt = 0;
		this.resetFrame();
		this.near.stats = shown ? this.nearStats : null;
		this.closeChannel();
		if (shown) {
			this.channel = new MessageChannel();
			this.channel.port1.onmessage = this.onAfterFrame;
		}
	};

	destroy(): void {
		for (const restore of this.restore) restore();
		this.closeChannel();
		this.near.stats = null;
		this.gauge.destroy();
	}
}
