/**
 * TEMPORARY diagnostic instrumentation for the study-mode crash investigation.
 *
 * See `vault/Planner/Study mode stops before transcluded reviews are
 * finished..md` → "Investigation — session 3". Two fixes have already shipped
 * against that ticket on an unverified mechanism; this module exists to settle
 * the question with device evidence before a third is written.
 *
 * **Revert this file and its call sites before merging anything.**
 *
 * Records land as JSON lines in `<reviewLogFolder>/debug-trace.md`. That path
 * is chosen so nothing else in the plugin reacts to the writes — which matters,
 * because the trace must not perturb the timing it is measuring:
 *
 * - `main.ts`'s `isNoteFile` excludes everything under the review log folder,
 *   so the trace cannot kick `debouncedSync`.
 * - `ReviewLog.listShardFiles` keeps only names matching
 *   `YYYY-MM.<device>.md`, so `debug-trace.md` is never read as a shard.
 * - It is neither a map's host note nor anything one transcludes, so
 *   `MindMapView`'s `modify` handler drops it.
 *
 * Markdown rather than `.log` so it can be opened and copied out of Obsidian on
 * a phone, which is the only place this bug reproduces. As in `ReviewLog`, the
 * opening fence is deliberately never closed: the file reads correctly at every
 * moment and every write stays a pure append.
 *
 * Tracing is inert until {@link startTrace} runs, which only `main.ts` does —
 * so unit tests importing an instrumented module pay a null check and nothing
 * else, and never touch `window`.
 */

/** The file operations the trace needs. `Vault.adapter` satisfies this as-is. */
export interface TraceFs {
	exists(path: string): Promise<boolean>;
	append(path: string, data: string): Promise<void>;
	write(path: string, data: string): Promise<void>;
	mkdir(path: string): Promise<void>;
}

/** Chromium's non-standard heap readout, present on Android WebView. */
interface JSHeapMemory {
	usedJSHeapSize: number;
	totalJSHeapSize: number;
	jsHeapSizeLimit: number;
}

/**
 * Sharded per device, exactly as `ReviewLog` shards its months.
 *
 * The trace lives inside the user's synced vault, and both the phone and the
 * laptop run this plugin. Sharing one filename meant both appended to the same
 * file and Sync resolved the conflict by keeping one copy — silently discarding
 * the phone's records, which are the only ones that matter here. That is how a
 * whole crash session went missing, and it is very likely what the "stale copy"
 * in round 3 actually was.
 */
let TRACE_NAME = "debug-trace.md";

const PREAMBLE = [
	"Osmosis debug trace — temporary study-mode crash instrumentation.",
	"Generated file; safe to delete. One JSON record per line.",
	"",
	"```json",
	"",
].join("\n");

/**
 * Records are flushed at most this often, from a timer armed by the *first*
 * record of a batch and not re-armed by later ones. A reset-on-every-call
 * debounce would never fire during a rating burst — exactly the window this is
 * meant to capture.
 *
 * Deliberately short. **While the main thread is blocked no timer fires — this
 * one included** — so anything buffered when the renderer is killed dies with
 * it, and that is exactly the window under investigation. The shorter this is,
 * the closer the last surviving record sits to the moment of death.
 */
const FLUSH_DELAY_MS = 250;

let fs: TraceFs | null = null;
let folder = "";
let buffer: string[] = [];
let flushTimer: number | null = null;
let inflight: Promise<void> = Promise.resolve();

/** Where the trace is being written, for the Notice the flush command shows. */
export function tracePath(): string {
	return folder === "" ? TRACE_NAME : `${folder}/${TRACE_NAME}`;
}

function heapMb(): number | undefined {
	const memory = (performance as Performance & { memory?: JSHeapMemory }).memory;
	if (!memory) return undefined;
	return Math.round(memory.usedJSHeapSize / 1e5) / 10;
}

/** Begin tracing, opening a session marker at the tail of the file. */
export function startTrace(next: TraceFs, reviewLogFolder: string, device: string): void {
	fs = next;
	folder = reviewLogFolder;
	TRACE_NAME = `debug-trace.${device}.md`;
	const memory = (performance as Performance & { memory?: JSHeapMemory }).memory;
	trace("session-start", {
		iso: new Date().toISOString(),
		heapLimitMb: memory ? Math.round(memory.jsHeapSizeLimit / 1e6) : undefined,
	});
	startHeartbeat();
}

/**
 * Main-thread stall detector.
 *
 * A timer that should fire every {@link HEARTBEAT_MS} records only when it
 * fires *late*, which on a single-threaded renderer means the main thread was
 * blocked for the overshoot. This is the direct test of the
 * unresponsive-renderer theory: Android WebView reaps a renderer that stops
 * pumping its message loop, and a growing run of overruns ending in silence is
 * what that looks like from inside.
 *
 * Only overruns are recorded, so a healthy session costs nothing in the file.
 */
const HEARTBEAT_MS = 250;
const STALL_MS = 400;
/** Beats between sampler calls — 4 × 250 ms ≈ one census per second. */
const SAMPLE_EVERY = 4;

let heartbeatTimer: number | null = null;
let lastBeat = 0;
let beatCount = 0;
let sampler: (() => void) | null = null;

/**
 * Sample `fn` every {@link BURST_MS} for {@link BURST_FOR_MS}, flushing each
 * record to disk immediately.
 *
 * Every crash so far has landed 1–2 s after a rating, and the ordinary 250 ms
 * throttle means whatever was buffered at the moment of death is lost — which
 * is precisely the window in question. This trades I/O for resolution over just
 * that window: if death is instantaneous the last record sits ~50 ms before it,
 * and if something ramps first, the ramp is visible.
 */
const BURST_MS = 50;
const BURST_FOR_MS = 2500;

export function traceBurst(fn: () => void): void {
	if (!fs) return;
	const until = performance.now() + BURST_FOR_MS;
	const timer = window.setInterval(() => {
		if (performance.now() >= until) {
			window.clearInterval(timer);
			return;
		}
		fn();
		void flushTrace();
	}, BURST_MS);
}

/**
 * Register a callback the heartbeat invokes about once a second.
 *
 * Round 3 recorded a census only on a rating, a reveal or a full render — so a
 * crash during the cull-and-pan storm *before* the first rating would leave no
 * curve at all. Sampling on the timer means the shape of the session is
 * captured whether or not the user is tapping.
 */
export function setTraceSampler(next: (() => void) | null): void {
	sampler = next;
}

function startHeartbeat(): void {
	lastBeat = performance.now();
	beatCount = 0;
	heartbeatTimer = window.setInterval(() => {
		const now = performance.now();
		const gap = now - lastBeat;
		lastBeat = now;
		if (gap >= STALL_MS) trace("stall", { gapMs: Math.round(gap) });
		if (++beatCount % SAMPLE_EVERY === 0) sampler?.();
	}, HEARTBEAT_MS);
}

function stopHeartbeat(): void {
	sampler = null;
	if (heartbeatTimer !== null) {
		window.clearInterval(heartbeatTimer);
		heartbeatTimer = null;
	}
}

/** Stop tracing and write out whatever is buffered (plugin unload). */
export function stopTrace(): Promise<void> {
	stopHeartbeat();
	trace("session-stop");
	const done = flushTrace();
	fs = null;
	return done;
}

/**
 * Record one event. Cheap and synchronous: stringify into a buffer, arm a
 * timer. Costs a null check when tracing is off.
 */
export function trace(event: string, data?: Record<string, unknown>): void {
	if (!fs) return;
	buffer.push(JSON.stringify({
		t: Date.now(),
		ms: Math.round(performance.now()),
		ev: event,
		heapMb: heapMb(),
		...data,
	}));
	if (flushTimer !== null) return;
	flushTimer = window.setTimeout(() => {
		flushTimer = null;
		void flushTrace();
	}, FLUSH_DELAY_MS);
}

/**
 * Write the buffered records out now.
 *
 * Chained on the previous flush so two appends cannot interleave. A failed
 * append drops its batch rather than re-queueing it — the opposite of
 * `ReviewLog`, and deliberate: this is diagnostic data, and re-queueing on
 * error is itself one of the bugs under investigation.
 */
export function flushTrace(): Promise<void> {
	if (buffer.length === 0) return inflight;
	const pending = buffer;
	buffer = [];
	const target = fs;
	if (!target) return inflight;

	const path = tracePath();
	inflight = inflight.then(async () => {
		const lines = pending.map((line) => `${line}\n`).join("");
		try {
			if (await target.exists(path)) {
				await target.append(path, lines);
			} else {
				if (folder !== "" && !(await target.exists(folder))) await target.mkdir(folder);
				await target.write(path, `${PREAMBLE}${lines}`);
			}
		} catch (error) {
			console.error("Osmosis: failed to write debug trace", error);
		}
	});
	return inflight;
}
