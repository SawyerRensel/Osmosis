import type { FileManager, TFile } from "obsidian";
import type { CardState, ScheduleData } from "../database/types";

/** Frontmatter key holding per-card FSRS schedule data for line cards. */
export const SCHEDULE_FRONTMATTER_KEY = "osmosis-schedule";

/**
 * One card's schedule as stored in frontmatter YAML.
 * Timestamps are ISO 8601 local datetimes (no timezone suffix) so the
 * source view stays human-readable. Keyed by block ID under
 * `osmosis-schedule` (see notes/02_planning/notes_as_flashcards_plan.md §3).
 */
export interface ScheduleEntryYaml {
	due: string;
	stability: number;
	difficulty: number;
	lastReview?: string;
	reps: number;
	lapses: number;
	state: CardState;
	learningSteps: number;
}

/**
 * Persists FSRS schedule data for line cards into note frontmatter.
 *
 * Ratings are applied to the in-memory CardStore immediately by the
 * caller; this store coalesces them and flushes the `osmosis-schedule`
 * frontmatter key via `FileManager.processFrontMatter` after a debounce
 * window, so rapid ratings during a study session cause one file write
 * instead of many. `flush()` forces pending writes out immediately
 * (study-session end, plugin unload).
 */
export class ScheduleStore {
	/** Staged entries per note path. `null` value = remove the entry. */
	private pending = new Map<string, Map<string, ScheduleData | null>>();
	private timers = new Map<string, ReturnType<typeof setTimeout>>();
	/** Per-path write chain — serializes processFrontMatter calls per file. */
	private inflight = new Map<string, Promise<void>>();
	private writingPaths = new Set<string>();

	constructor(
		private readonly fileManager: Pick<FileManager, "processFrontMatter">,
		private readonly resolveFile: (notePath: string) => TFile | null,
		private readonly flushDelayMs = 2000,
	) {}

	/** Stage a schedule write for a card, debouncing the frontmatter flush. */
	setSchedule(notePath: string, blockId: string, schedule: ScheduleData): void {
		this.stage(notePath, blockId, { ...schedule });
	}

	/** Stage removal of a card's schedule entry (e.g., review revert on a new card). */
	removeSchedule(notePath: string, blockId: string): void {
		this.stage(notePath, blockId, null);
	}

	/**
	 * Look up a staged-but-unflushed entry. Returns the pending schedule,
	 * `null` for a pending removal, or `undefined` when nothing is staged.
	 * Lets readers overlay pending state on top of (stale) frontmatter.
	 */
	getPendingEntry(notePath: string, blockId: string): ScheduleData | null | undefined {
		return this.pending.get(notePath)?.get(blockId);
	}

	/** All staged-but-unflushed entries for a note (empty map when none). */
	getPendingEntries(notePath: string): ReadonlyMap<string, ScheduleData | null> {
		return this.pending.get(notePath) ?? EMPTY_PENDING;
	}

	/** Check if a path is currently being written to. */
	isWriting(path: string): boolean {
		return this.writingPaths.has(path);
	}

	/** True when any staged entries have not been flushed yet. */
	hasPendingWrites(): boolean {
		return this.pending.size > 0;
	}

	/** Flush all pending entries immediately, cancelling debounce timers. */
	async flush(): Promise<void> {
		const paths = [...this.pending.keys()];
		await Promise.all(paths.map((path) => this.flushPath(path)));
	}

	/** Flush pending entries for one note immediately. */
	async flushPath(notePath: string): Promise<void> {
		this.clearTimer(notePath);
		const prev = this.inflight.get(notePath) ?? Promise.resolve();
		const next = prev.then(() => this.writePath(notePath));
		this.inflight.set(notePath, next);
		try {
			await next;
		} finally {
			if (this.inflight.get(notePath) === next) {
				this.inflight.delete(notePath);
			}
		}
	}

	// ── Private Helpers ───────────────────────────────────────

	private stage(notePath: string, blockId: string, entry: ScheduleData | null): void {
		let entries = this.pending.get(notePath);
		if (!entries) {
			entries = new Map();
			this.pending.set(notePath, entries);
		}
		entries.set(blockId, entry);

		this.clearTimer(notePath);
		this.timers.set(
			notePath,
			setTimeout(() => {
				void this.flushPath(notePath);
			}, this.flushDelayMs),
		);
	}

	private clearTimer(notePath: string): void {
		const timer = this.timers.get(notePath);
		if (timer !== undefined) {
			clearTimeout(timer);
			this.timers.delete(notePath);
		}
	}

	private async writePath(notePath: string): Promise<void> {
		const entries = this.pending.get(notePath);
		this.pending.delete(notePath);
		if (!entries || entries.size === 0) return;

		const file = this.resolveFile(notePath);
		if (!file) return; // note deleted — drop the pending entries

		this.writingPaths.add(notePath);
		try {
			await this.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
				applyScheduleEntries(fm, entries);
			});
		} catch (error) {
			console.error(`Osmosis: failed to write schedule frontmatter for ${notePath}`, error);
			// Re-stage what wasn't superseded while writing, so the next
			// rating or forced flush retries (no timer — avoids retry loops).
			const current = this.pending.get(notePath);
			if (!current) {
				this.pending.set(notePath, entries);
			} else {
				for (const [blockId, entry] of entries) {
					if (!current.has(blockId)) current.set(blockId, entry);
				}
			}
		} finally {
			this.writingPaths.delete(notePath);
		}
	}
}

const EMPTY_PENDING: ReadonlyMap<string, ScheduleData | null> = new Map();

/**
 * Pure function: apply staged schedule entries to a frontmatter object
 * in place. Removes the `osmosis-schedule` key entirely when it ends up
 * empty. Exported for unit testing.
 */
export function applyScheduleEntries(
	fm: Record<string, unknown>,
	entries: Map<string, ScheduleData | null>,
): void {
	const raw = fm[SCHEDULE_FRONTMATTER_KEY];
	const map: Record<string, unknown> = isPlainObject(raw) ? raw : {};

	for (const [blockId, entry] of entries) {
		if (entry === null) {
			delete map[blockId];
		} else {
			map[blockId] = serializeScheduleEntry(entry);
		}
	}

	if (Object.keys(map).length === 0) {
		delete fm[SCHEDULE_FRONTMATTER_KEY];
	} else {
		fm[SCHEDULE_FRONTMATTER_KEY] = map;
	}
}

/** Serialize schedule data into its frontmatter YAML shape. */
export function serializeScheduleEntry(schedule: ScheduleData): ScheduleEntryYaml {
	return {
		due: formatLocalTimestamp(schedule.due),
		stability: round4(schedule.stability),
		difficulty: round4(schedule.difficulty),
		...(schedule.lastReview !== null
			? { lastReview: formatLocalTimestamp(schedule.lastReview) }
			: {}),
		reps: schedule.reps,
		lapses: schedule.lapses,
		state: schedule.state,
		learningSteps: schedule.learningSteps,
	};
}

/**
 * Parse one card's schedule entry from frontmatter. Returns null when the
 * value isn't a valid entry (missing/unparseable `due` or not an object) —
 * callers skip such entries rather than crash on hand-edited YAML.
 */
export function parseScheduleEntry(raw: unknown): ScheduleData | null {
	if (!isPlainObject(raw)) return null;

	const due = parseTimestamp(raw["due"]);
	if (due === null) return null;

	return {
		stability: toFiniteNumber(raw["stability"]) ?? 0,
		difficulty: toFiniteNumber(raw["difficulty"]) ?? 0,
		due,
		lastReview: parseTimestamp(raw["lastReview"]),
		reps: toNonNegativeInt(raw["reps"]) ?? 0,
		lapses: toNonNegativeInt(raw["lapses"]) ?? 0,
		state: parseCardState(raw["state"]),
		learningSteps: toNonNegativeInt(raw["learningSteps"]) ?? 0,
	};
}

/**
 * Parse the whole `osmosis-schedule` frontmatter value into a map of
 * block ID → schedule. Invalid entries are skipped.
 */
export function parseScheduleFrontmatter(raw: unknown): Map<string, ScheduleData> {
	const result = new Map<string, ScheduleData>();
	if (!isPlainObject(raw)) return result;

	for (const [blockId, value] of Object.entries(raw)) {
		const entry = parseScheduleEntry(value);
		if (entry) result.set(blockId, entry);
	}
	return result;
}

/** Format an epoch-ms timestamp as a local ISO 8601 datetime (no timezone suffix). */
export function formatLocalTimestamp(epochMs: number): string {
	const d = new Date(epochMs);
	const pad = (n: number) => String(n).padStart(2, "0");
	return (
		`${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
		`T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
	);
}

/**
 * Parse a frontmatter timestamp value to epoch ms. Accepts ISO strings
 * (timezone-less strings are interpreted as local time), Date objects
 * (YAML parsers may produce these for unquoted timestamps), and finite
 * numbers (epoch ms). Returns null for anything else.
 */
export function parseTimestamp(value: unknown): number | null {
	if (value instanceof Date) {
		const t = value.getTime();
		return Number.isFinite(t) ? t : null;
	}
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "string") {
		const t = new Date(value).getTime();
		return Number.isFinite(t) ? t : null;
	}
	return null;
}

const CARD_STATES: readonly CardState[] = ["new", "learning", "review", "relearning"];

/** Entries only exist after a review, so unknown states fall back to "review". */
function parseCardState(value: unknown): CardState {
	return CARD_STATES.includes(value as CardState) ? (value as CardState) : "review";
}

function toFiniteNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toNonNegativeInt(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return null;
	return value;
}

function round4(value: number): number {
	return Math.round(value * 10000) / 10000;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);
}
