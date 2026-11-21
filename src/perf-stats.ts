/**
 * Frame statistics shared by the 2D and 3D perf gauges (`PerfGauge`,
 * `CosmosPerf`, the Mind Map view). Pure, so vitest can test it.
 */

/** One timed sample: when it happened and how long it took, in ms. */
export interface Timed {
	at: number;
	ms: number;
}

/** Samples over a sliding time window: frames, renders, passes. */
export class Rolling {
	private samples: Timed[] = [];

	push(at: number, ms: number): void {
		this.samples.push({ at, ms });
	}

	/** Drop samples more than `windowMs` older than `now`. */
	prune(now: number, windowMs: number): void {
		let drop = 0;
		while (drop < this.samples.length && now - this.samples[drop]!.at > windowMs) drop++;
		if (drop > 0) this.samples.splice(0, drop);
	}

	get count(): number {
		return this.samples.length;
	}

	avg(): number {
		return this.samples.length === 0 ? 0 : this.sum() / this.samples.length;
	}

	max(): number {
		return this.samples.reduce((m, t) => Math.max(m, t.ms), 0);
	}

	sum(): number {
		return this.samples.reduce((s, t) => s + t.ms, 0);
	}

	clear(): void {
		this.samples = [];
	}
}

/** The fields of a Long Animation Frame entry the gauges read (`PerformanceLongAnimationFrameTiming`). */
export interface LoafEntry {
	startTime: number;
	duration: number;
	/** Start of the frame's rendering phase (rAF callbacks, ResizeObserver), or 0 when the frame did not render. */
	renderStart: number;
	/** Start of style recalculation and layout, or 0 when the frame did not render. */
	styleAndLayoutStart: number;
}

/** A long animation frame split into its phases, in ms. */
export interface LoafPhases {
	/** Tasks before rendering: input handlers, timers, promise callbacks. */
	scriptMs: number;
	/** rAF callbacks and ResizeObserver callbacks. */
	renderMs: number;
	/** Style recalculation and layout (paint is not in the entry). */
	styleLayoutMs: number;
}

export function loafPhases(entry: LoafEntry): LoafPhases {
	const end = entry.startTime + entry.duration;
	if (entry.renderStart <= 0) return { scriptMs: entry.duration, renderMs: 0, styleLayoutMs: 0 };
	const styleStart = entry.styleAndLayoutStart > 0 ? entry.styleAndLayoutStart : end;
	return {
		scriptMs: Math.max(0, entry.renderStart - entry.startTime),
		renderMs: Math.max(0, styleStart - entry.renderStart),
		styleLayoutMs: Math.max(0, end - styleStart),
	};
}

/** What is left of the average frame once the timed parts are taken out: the browser's own work, mostly. Never negative. */
export function untimedMs(frameAvg: number, timed: readonly number[]): number {
	return Math.max(0, frameAvg - timed.reduce((s, ms) => s + ms, 0));
}

/** Long animation frames over the window, split into phases. */
interface LoafSample {
	at: number;
	phases: LoafPhases;
	duration: number;
}

export class LoafStats {
	private readonly entries: LoafSample[] = [];

	push(entry: LoafEntry): void {
		this.entries.push({ at: entry.startTime, phases: loafPhases(entry), duration: entry.duration });
	}

	prune(now: number, windowMs: number): void {
		while (this.entries.length > 0 && now - this.entries[0]!.at > windowMs) this.entries.shift();
	}

	clear(): void {
		this.entries.length = 0;
	}

	/** Count and average phases of the long frames in the window; zeros when there were none. */
	summary(): { count: number; durationMs: number } & LoafPhases {
		const n = this.entries.length;
		const avg = (pick: (e: LoafSample) => number) => (n === 0 ? 0 : this.entries.reduce((s, e) => s + pick(e), 0) / n);
		return {
			count: n,
			durationMs: avg((e) => e.duration),
			scriptMs: avg((e) => e.phases.scriptMs),
			renderMs: avg((e) => e.phases.renderMs),
			styleLayoutMs: avg((e) => e.phases.styleLayoutMs),
		};
	}
}

/** The readout line for long animation frames, or the untimed remainder where the API is missing. */
export function loafLine(supported: boolean, stats: ReturnType<LoafStats["summary"]>, untimed: number): string {
	const rest = `untimed ${untimed.toFixed(1)} ms/frame`;
	if (!supported) return `browser: LoAF unsupported · ${rest}`;
	if (stats.count === 0) return `browser: no frame over 50 ms · ${rest}`;
	return `browser (${stats.count} frames >50 ms, avg ${stats.durationMs.toFixed(0)}): script ${stats.scriptMs.toFixed(1)}  rAF ${stats.renderMs.toFixed(1)}  style+layout ${stats.styleLayoutMs.toFixed(1)} ms · ${rest}`;
}
