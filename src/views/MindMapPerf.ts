/**
 * Perf readout for the 2D Mind Map, behind the same top-left toggle as the 3D
 * graph's (`PerfGauge`), hidden by default. While it is shown it runs its own
 * animation-frame clock for fps; while hidden it records nothing and every
 * hook below returns straight away.
 *
 * The frame is split as in Cosmos (T141, T142): `gesture` is our pan and zoom
 * handlers (pointer, wheel, fling), including any layout their reads force;
 * `cull` the cull passes; `after rAF` runs from the end of the readout's frame
 * callback to a message posted from it, which is handled once the browser's
 * own rendering of that frame (style, layout, paint, commit) is done on the
 * main thread, less our JS that ran in between; `left` is the rest of the
 * frame: raster, GPU, compositing, or idle waiting for vsync.
 *
 * Click the readout to put Obsidian's `mix-blend-mode` back on callouts in
 * nodes (T142 turns it off in 2D), to read what the blend costs.
 */

import type { ParseCache } from "../cache";
import { Rolling, loafLine, untimedMs } from "../perf-stats";
import { PerfGauge, PERF_REFRESH_MS, PERF_WINDOW_MS } from "./PerfGauge";

/** On the map container: Obsidian's callout blend restored, for the readout's A/B (see styles.css). */
const BLEND_CLASS = "osmosis-perf-callout-blend";

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
	/** Viewport moves shown by moving the composited layer (T87): no repaint. */
	private readonly layerMoves = new Rolling();
	/** Viewport changes that repainted the SVG for a new viewBox. */
	private readonly repaints = new Rolling();
	private lastRepaintReason: string | null = null;
	/** Our gesture JS per frame, and how many gesture events ran in it. */
	private readonly gestures = new Rolling();
	private readonly gestureEvents = new Rolling();
	/** Main-thread rendering per frame, after our rAF JS (see the header). */
	private readonly afterRaf = new Rolling();
	private gestureMs = 0;
	private gestureCount = 0;
	/** Our JS (cull, fling) between the posted message and its handling, taken out of `afterRaf`. */
	private jsSincePost = 0;
	private channel: MessageChannel | null = null;
	private frameId: number | null = null;
	private lastFrame = 0;
	private lastRefresh = 0;
	private lastParse: number | null = null;
	private lastRender: { measure: number; layout: number; total: number } | null = null;
	private lastCommit: { total: number; beforeRender: number; paint: number | null } | null = null;
	private lastKept: { kept: number; drawn: number } | null = null;
	private lastOpen: { firstView: number; settled: number | null } | null = null;
	/** When the edit in flight began, or 0. */
	private editAt = 0;
	private readonly restoreParse: () => void;

	constructor(private readonly container: HTMLElement, cache: ParseCache, private readonly counts: () => MindMapCounts) {
		this.gauge = new PerfGauge(container, this.onToggle, this.toggleBlend, true);
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
		if (start === 0 || !this.gauge.shown) return;
		const ms = performance.now() - start;
		this.culls.push(start, ms);
		this.jsSincePost += ms;
	}

	/** A pan or zoom handler (pointer move, wheel, a fling step) that started at `start` returned. */
	gesture(start: number): void {
		if (start === 0 || !this.gauge.shown) return;
		const ms = performance.now() - start;
		this.gestureMs += ms;
		this.gestureCount++;
		this.jsSincePost += ms;
	}

	/** The viewport moved by transforming the painted layer (T87). */
	viewMoved(): void {
		if (this.gauge.shown) this.layerMoves.push(performance.now(), 0);
	}

	/** The SVG was repainted for a new viewBox, and why. */
	viewRepainted(reason: string): void {
		if (!this.gauge.shown) return;
		this.repaints.push(performance.now(), 0);
		this.lastRepaintReason = reason;
	}

	/** A map edit began (the op passed its guard). */
	editStarted(): void {
		if (this.gauge.shown) this.editAt = performance.now();
	}

	/**
	 * A full render pass finished; its parts in ms, and how many of the nodes it
	 * left drawn were kept from the pass before (an edit's pass, T80). Closes
	 * the edit in flight; the time to the next paint is filled in after it.
	 */
	rendered(start: number, measure: number, layout: number, kept: number, drawn: number): void {
		if (start === 0 || !this.gauge.shown) return;
		const end = performance.now();
		this.lastRender = { measure, layout, total: end - start };
		this.lastKept = { kept, drawn };
		if (this.editAt !== 0) {
			const commit = { total: end - this.editAt, beforeRender: start - this.editAt, paint: null as number | null };
			this.lastCommit = commit;
			this.editAt = 0;
			// The frame after the pass runs style, layout and paint for what it
			// changed; a task queued from its animation-frame callback runs once
			// that frame is done.
			window.requestAnimationFrame(() => window.setTimeout(() => {
				commit.paint = performance.now() - end;
			}, 0));
		}
	}

	/**
	 * A large map opened from its first view (T84): ms from the opening pass's
	 * start to the first view drawn. Recorded even while the gauge is hidden,
	 * so opening it afterwards still shows how the note opened.
	 */
	openFirstView(ms: number): void {
		this.lastOpen = { firstView: ms, settled: null };
	}

	/** ...and to the last node measured and drawn. */
	openSettled(ms: number): void {
		if (this.lastOpen) this.lastOpen.settled = ms;
	}

	/** Put the gauge back after the view emptied its container. */
	attach(): void {
		this.gauge.attach();
	}

	private readonly tick = (now: number): void => {
		this.frameId = window.requestAnimationFrame(this.tick);
		if (this.lastFrame !== 0) {
			this.frames.push(now, now - this.lastFrame);
			this.gestures.push(now, this.gestureMs);
			this.gestureEvents.push(now, this.gestureCount);
		}
		this.lastFrame = now;
		this.gestureMs = 0;
		this.gestureCount = 0;
		this.jsSincePost = 0;
		this.channel?.port2.postMessage(performance.now());
		if (now - this.lastRefresh < PERF_REFRESH_MS) return;
		this.lastRefresh = now;
		for (const list of this.lists()) list.prune(now, PERF_WINDOW_MS);
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
		const gestureMs = this.gestures.avg();
		const left = untimedMs(frameAvg, [gestureMs, cullPerFrame, this.afterRaf.avg()]);
		return [
			`fps ${this.frames.count}  frame avg ${frameAvg.toFixed(1)} / worst ${this.frames.max().toFixed(1)} ms`,
			`cull: ${this.culls.count} passes/s  avg ${this.culls.avg().toFixed(2)} ms (max ${this.culls.max().toFixed(1)})`,
			`view: ${this.layerMoves.count} layer moves/s  ${this.repaints.count} repaints/s (last ${this.lastRepaintReason ?? "—"})`,
			`nodes ${total}  drawn ${drawn}  in DOM ${dom}`,
			`last parse ${ms(this.lastParse, 2)}  render ${ms(render?.total ?? null)} (measure ${ms(render?.measure ?? null)}, layout ${ms(render?.layout ?? null)})`,
			this.commitLine(ms),
			`open: first view ${ms(this.lastOpen?.firstView ?? null, 0)}  all measured ${ms(this.lastOpen?.settled ?? null, 0)}`,
			`main: gesture ${gestureMs.toFixed(2)} ms (${this.gestureEvents.avg().toFixed(1)} events/frame, max ${this.gestures.max().toFixed(1)})  cull ${cullPerFrame.toFixed(2)} ms/frame`,
			loafLine(this.gauge.loafSupported, this.gauge.loaf.summary(), untimedMs(frameAvg, [gestureMs, cullPerFrame])),
			`untimed split: after rAF ${this.afterRaf.avg().toFixed(1)} ms (max ${this.afterRaf.max().toFixed(1)}) main thread  ·  left ${left.toFixed(1)} ms off it or idle`,
			`callout blend ${this.container.hasClass(BLEND_CLASS) ? "on (Obsidian's)" : "off"}  (click the readout to switch)`,
		].join("\n");
	}

	private commitLine(ms: (value: number | null, digits?: number) => string): string {
		const commit = this.lastCommit;
		const kept = this.lastKept;
		const keptText = kept === null ? "" : `  kept ${kept.kept}/${kept.drawn}`;
		if (commit === null) return `last edit commit ${ms(null)}${keptText}`;
		return `last edit commit ${ms(commit.total)} (before render ${ms(commit.beforeRender)}) + paint ${ms(commit.paint)}${keptText}`;
	}

	private lists(): Rolling[] {
		return [this.frames, this.culls, this.layerMoves, this.repaints, this.gestures, this.gestureEvents, this.afterRaf];
	}

	private readonly onAfterFrame = (e: MessageEvent<number>): void => {
		this.afterRaf.push(performance.now(), Math.max(0, performance.now() - e.data - this.jsSincePost));
	};

	private closeChannel(): void {
		if (this.channel === null) return;
		this.channel.port1.onmessage = null;
		this.channel.port1.close();
		this.channel.port2.close();
		this.channel = null;
	}

	/** The A/B for callouts' blend: Obsidian's `mix-blend-mode` back on, or off as T142 ships it. */
	private readonly toggleBlend = (): void => {
		this.container.toggleClass(BLEND_CLASS, !this.container.hasClass(BLEND_CLASS));
		this.gauge.setText(this.report());
	};

	private readonly onToggle = (shown: boolean): void => {
		for (const list of this.lists()) list.clear();
		this.lastRepaintReason = null;
		this.lastFrame = 0;
		this.lastRefresh = 0;
		this.editAt = 0;
		this.gestureMs = 0;
		this.gestureCount = 0;
		this.jsSincePost = 0;
		this.closeChannel();
		if (shown) {
			this.channel = new MessageChannel();
			this.channel.port1.onmessage = this.onAfterFrame;
		}
		if (this.frameId !== null) window.cancelAnimationFrame(this.frameId);
		this.frameId = shown ? window.requestAnimationFrame(this.tick) : null;
	};

	destroy(): void {
		if (this.frameId !== null) window.cancelAnimationFrame(this.frameId);
		this.frameId = null;
		this.closeChannel();
		this.container.removeClass(BLEND_CLASS);
		this.restoreParse();
		this.gauge.destroy();
	}
}
