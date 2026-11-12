/**
 * Perf readout for the 2D Mind Map, behind the same top-left toggle as the 3D
 * graph's (`PerfGauge`), hidden by default. While it is shown it runs its own
 * animation-frame clock for fps; while hidden it records nothing and every
 * hook below returns straight away.
 */

import type { ParseCache } from "../cache";
import { Rolling, loafLine, untimedMs } from "../perf-stats";
import { PerfGauge, PERF_REFRESH_MS, PERF_WINDOW_MS } from "./PerfGauge";

/** The map's node counts, read at each refresh. */
export interface MindMapCounts {
	/** Nodes in the layout. */
	total: number;
	/** Nodes the cull pass has drawn. */
	drawn: number;
	/** Node groups in the DOM (more than `drawn` means stale groups). */
	dom: number;
}

export class MindMapPerf {
	private readonly gauge: PerfGauge;
	private readonly frames = new Rolling();
	private readonly culls = new Rolling();
	private frameId: number | null = null;
	private lastFrame = 0;
	private lastRefresh = 0;
	private lastParse: number | null = null;
	private lastRender: { measure: number; layout: number; total: number } | null = null;
	private lastCommit: number | null = null;
	/** When the edit in flight began, or 0. */
	private editAt = 0;
	private readonly restoreParse: () => void;

	constructor(container: HTMLElement, cache: ParseCache, private readonly counts: () => MindMapCounts) {
		this.gauge = new PerfGauge(container, this.onToggle, undefined, true);
		// Every parse goes through the view's cache: time each `get` that parsed. A hit hands
		// back a tree it handed out before, and is not recorded.
		const get = cache.get.bind(cache);
		const seen = new WeakSet<object>();
		cache.get = (path, markdown) => {
			if (!this.gauge.shown) return get(path, markdown);
			const start = performance.now();
			const tree = get(path, markdown);
			if (!seen.has(tree)) this.lastParse = performance.now() - start;
			seen.add(tree);
			return tree;
		};
		this.restoreParse = () => (cache.get = get);
	}

	/** A timestamp to hand back to a hook, or 0 (nothing recorded) while hidden. */
	start(): number {
		return this.gauge.shown ? performance.now() : 0;
	}

	cull(start: number): void {
		if (start !== 0 && this.gauge.shown) this.culls.push(start, performance.now() - start);
	}

	/** A map edit began (the op passed its guard). */
	editStarted(): void {
		if (this.gauge.shown) this.editAt = performance.now();
	}

	/** A full render pass finished; its parts in ms. Closes the edit in flight. */
	rendered(start: number, measure: number, layout: number): void {
		if (start === 0 || !this.gauge.shown) return;
		const end = performance.now();
		this.lastRender = { measure, layout, total: end - start };
		if (this.editAt !== 0) {
			this.lastCommit = end - this.editAt;
			this.editAt = 0;
		}
	}

	/** Put the gauge back after the view emptied its container. */
	attach(): void {
		this.gauge.attach();
	}

	private readonly tick = (now: number): void => {
		this.frameId = window.requestAnimationFrame(this.tick);
		if (this.lastFrame !== 0) this.frames.push(now, now - this.lastFrame);
		this.lastFrame = now;
		if (now - this.lastRefresh < PERF_REFRESH_MS) return;
		this.lastRefresh = now;
		this.frames.prune(now, PERF_WINDOW_MS);
		this.culls.prune(now, PERF_WINDOW_MS);
		this.gauge.loaf.prune(now, PERF_WINDOW_MS);
		this.gauge.setText(this.report());
	};

	private report(): string {
		const ms = (value: number | null, digits = 1) => (value === null ? "—" : `${value.toFixed(digits)} ms`);
		const { total, drawn, dom } = this.counts();
		const frameAvg = this.frames.avg();
		// Culls per frame: a pass runs at most once a frame, and only when the viewBox moved.
		const cullPerFrame = this.frames.count === 0 ? 0 : this.culls.sum() / this.frames.count;
		const render = this.lastRender;
		return [
			`fps ${this.frames.count}  frame avg ${frameAvg.toFixed(1)} / worst ${this.frames.max().toFixed(1)} ms`,
			`cull: ${this.culls.count} passes/s  avg ${this.culls.avg().toFixed(2)} ms (max ${this.culls.max().toFixed(1)})`,
			`nodes ${total}  drawn ${drawn}  in DOM ${dom}`,
			`last parse ${ms(this.lastParse, 2)}  render ${ms(render?.total ?? null)} (measure ${ms(render?.measure ?? null)}, layout ${ms(render?.layout ?? null)})`,
			`last edit commit ${ms(this.lastCommit)}`,
			loafLine(this.gauge.loafSupported, this.gauge.loaf.summary(), untimedMs(frameAvg, [cullPerFrame])),
		].join("\n");
	}

	private readonly onToggle = (shown: boolean): void => {
		this.frames.clear();
		this.culls.clear();
		this.lastFrame = 0;
		this.lastRefresh = 0;
		this.editAt = 0;
		if (this.frameId !== null) window.cancelAnimationFrame(this.frameId);
		this.frameId = shown ? window.requestAnimationFrame(this.tick) : null;
	};

	destroy(): void {
		if (this.frameId !== null) window.cancelAnimationFrame(this.frameId);
		this.frameId = null;
		this.restoreParse();
		this.gauge.destroy();
	}
}
