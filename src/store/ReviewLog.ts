import type { FSRSRating } from "../database/FSRSScheduler";
import type { CardState, StudyMode } from "../database/types";

/**
 * Append-only review history: the record that a review *happened*, as opposed
 * to the current scheduling state that `ScheduleData` holds and overwrites on
 * every answer.
 *
 * Entries live in JSONL shards in the vault, one file per month *and* device
 * (`2026-08.pixel-10a.jsonl`), so no file ever has two writers and Obsidian
 * Sync has nothing to reconcile. Readers take the union of every shard.
 *
 * Most of this module is I/O-free — serialisation, shard naming, aggregation —
 * so the logic that matters is unit-testable. `ReviewLog` at the bottom is the
 * stateful half: buffering, the collision guard, and the local rollup cache.
 */

/** Format version written into each shard's header line. */
export const SHARD_FORMAT_VERSION = 1;

/** Shard file extension. */
export const SHARD_EXTENSION = ".jsonl";

/** Interval at or above which a card counts as mature. Anki's threshold. */
export const MATURE_INTERVAL_DAYS = 21;

/** Maximum length of a slugged device label. */
const MAX_DEVICE_LABEL_LENGTH = 32;

/** Label used when a device name slugs down to nothing. */
const FALLBACK_DEVICE_LABEL = "device";

const MS_PER_DAY = 86_400_000;

/**
 * One answered card, as written to a single shard line. Field names are
 * deliberately terse — this is the only unbounded data Osmosis produces, and
 * a year of heavy use is measured in hundreds of thousands of lines.
 */
export interface ReviewLogEntry {
	/** Answer timestamp, epoch ms. */
	t: number;
	/** Card ID. */
	c: string;
	/** Rating: 1=Again, 2=Hard, 3=Good, 4=Easy. */
	r: FSRSRating;
	/** Card state *after* the answer. */
	s: CardState;
	/** Interval granted by the answer, seconds. */
	iv: number;
	/** FSRS stability after the answer. */
	st: number;
	/** FSRS difficulty after the answer. */
	d: number;
	/** Elapsed ms the card was on screen before being answered. */
	e: number;
	/** Study surface the answer came from. */
	m: StudyMode;
}

/**
 * A shard's opening line. The install ID lives here rather than in the
 * filename so filenames stay readable while collisions stay detectable: two
 * devices that slug to the same label are told apart by their install IDs.
 */
export interface ShardHeader {
	/** Slugged device label, matching the one in the filename. */
	device: string;
	/** Install ID of the device that owns this shard. */
	install: string;
	/** Format version. Read permissively so a future version still parses. */
	v: number;
}

/** A parsed shard. `header` is null when the file has lost or never had one. */
export interface ParsedShard {
	header: ShardHeader | null;
	entries: ReviewLogEntry[];
}

// ── Serialisation ─────────────────────────────────────────────

/**
 * Serialise one entry to its shard line. Keys are written in the documented
 * order so shards stay readable and diffable by hand.
 */
export function serializeEntry(entry: ReviewLogEntry): string {
	return JSON.stringify({
		t: Math.round(entry.t),
		c: entry.c,
		r: entry.r,
		s: entry.s,
		iv: Math.round(entry.iv),
		st: round4(entry.st),
		d: round4(entry.d),
		e: Math.round(entry.e),
		m: entry.m,
	});
}

/** Serialise a shard's header line. */
export function serializeHeader(header: ShardHeader): string {
	return JSON.stringify({
		device: header.device,
		install: header.install,
		v: header.v,
	});
}

/**
 * Parse one shard line into an entry, or null when the line is not a usable
 * entry. `t`, `c`, and `r` are required — without them the line records
 * nothing. The rest fall back to defaults rather than discarding the review,
 * because a review that happened must survive into the volume graphs even if
 * a hand-edit mangled its detail fields.
 */
export function parseEntry(line: string): ReviewLogEntry | null {
	const raw = parseJsonObject(line);
	if (!raw) return null;

	const t = toFiniteNumber(raw["t"]);
	const c = typeof raw["c"] === "string" ? raw["c"] : "";
	const r = parseRating(raw["r"]);
	if (t === null || c === "" || r === null) return null;

	return {
		t,
		c,
		r,
		s: parseCardState(raw["s"]),
		iv: toFiniteNumber(raw["iv"]) ?? 0,
		st: toFiniteNumber(raw["st"]) ?? 0,
		d: toFiniteNumber(raw["d"]) ?? 0,
		e: toFiniteNumber(raw["e"]) ?? 0,
		m: parseStudyMode(raw["m"]),
	};
}

/** Parse a shard's header line, or null when the line isn't a header. */
export function parseHeader(line: string): ShardHeader | null {
	const raw = parseJsonObject(line);
	if (!raw) return null;

	const device = raw["device"];
	const install = raw["install"];
	const v = toFiniteNumber(raw["v"]);
	if (typeof device !== "string" || typeof install !== "string" || v === null) {
		return null;
	}
	return { device, install, v };
}

/**
 * Parse a whole shard. The header is expected first, but a truncated or
 * hand-assembled file may have lost it, so anything that doesn't parse as a
 * header is tried as an entry. Unparseable lines are skipped, never thrown on.
 */
export function parseShard(text: string): ParsedShard {
	let header: ShardHeader | null = null;
	const entries: ReviewLogEntry[] = [];

	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (trimmed === "") continue;

		if (header === null && entries.length === 0) {
			header = parseHeader(trimmed);
			if (header !== null) continue;
		}

		const entry = parseEntry(trimmed);
		if (entry) entries.push(entry);
	}

	return { header, entries };
}

/**
 * Union of several shards' entries: every review exactly once, ordered by
 * timestamp. Duplicates are dropped by timestamp + card + rating, which
 * absorbs a shard that got copied or replayed (two answers of the same card in
 * the same millisecond with the same rating are not a thing). Ties break on
 * card ID so the order is identical on every device.
 */
export function mergeShards(
	shards: readonly (readonly ReviewLogEntry[])[],
): ReviewLogEntry[] {
	const seen = new Set<string>();
	const merged: ReviewLogEntry[] = [];

	for (const shard of shards) {
		for (const entry of shard) {
			const key = `${String(entry.t)}|${entry.c}|${String(entry.r)}`;
			if (seen.has(key)) continue;
			seen.add(key);
			merged.push(entry);
		}
	}

	merged.sort((a, b) => {
		if (a.t !== b.t) return a.t - b.t;
		if (a.c === b.c) return 0;
		return a.c < b.c ? -1 : 1;
	});
	return merged;
}

// ── Shard naming ──────────────────────────────────────────────

/**
 * Slug a device name into a filename-safe label: lowercase, non-alphanumerics
 * collapsed to `-`, trimmed, capped. Apostrophes are dropped rather than
 * becoming separators, so "Sawyer's MacBook Pro" reads as
 * "sawyers-macbook-pro" instead of "sawyer-s-macbook-pro".
 */
export function slugifyDeviceLabel(raw: string): string {
	const slug = raw
		.toLowerCase()
		.replace(/['’]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, MAX_DEVICE_LABEL_LENGTH)
		.replace(/-+$/, "");
	return slug === "" ? FALLBACK_DEVICE_LABEL : slug;
}

/**
 * The nth candidate label for this device, for the collision guard. Attempt 1
 * is the label itself; later attempts append `-2`, `-3`, and so on.
 *
 * The attempt number is passed in rather than parsed back off the label on
 * purpose: a device legitimately named `nexus-5` must not "bump" to `nexus-6`.
 */
export function deviceLabelCandidate(label: string, attempt: number): string {
	if (attempt <= 1) return label;
	const suffix = `-${String(attempt)}`;
	const room = MAX_DEVICE_LABEL_LENGTH - suffix.length;
	const base = label.length > room
		? label.slice(0, room).replace(/-+$/, "")
		: label;
	return `${base}${suffix}`;
}

/**
 * Clean a user-typed folder path: trimmed, no leading or trailing slashes, no
 * empty segments. Falls back when nothing usable is left, so clearing the
 * settings field cannot aim the log at the vault root.
 */
export function normalizeLogFolder(raw: string, fallback: string): string {
	const cleaned = raw
		.split("/")
		.map((segment) => segment.trim())
		.filter((segment) => segment !== "")
		.join("/");
	return cleaned === "" ? fallback : cleaned;
}

/**
 * The platform flags the fallback label reads. Mirrors Obsidian's `Platform`,
 * declared structurally so this module stays free of runtime imports.
 */
export interface PlatformFlags {
	isIosApp: boolean;
	isAndroidApp: boolean;
	isMacOS: boolean;
	isWin: boolean;
	isLinux: boolean;
}

/**
 * Device label derived from the platform — the public fallback for people not
 * on Obsidian Sync (Drive, Dropbox, Syncthing), who have no device name to
 * borrow. Mobile is tested first because `isMacOS` is also true on iOS.
 */
export function platformDeviceLabel(flags: PlatformFlags): string {
	if (flags.isIosApp) return "mobile-ios";
	if (flags.isAndroidApp) return "mobile-android";
	if (flags.isMacOS) return "desktop-mac";
	if (flags.isWin) return "desktop-win";
	if (flags.isLinux) return "desktop-linux";
	return FALLBACK_DEVICE_LABEL;
}

/** Shard filename for a month key and device label. */
export function shardFileName(month: string, device: string): string {
	return `${month}.${device}${SHARD_EXTENSION}`;
}

const SHARD_NAME_PATTERN = /^(\d{4}-\d{2})\.([a-z0-9-]+)\.jsonl$/;

/**
 * Split a shard filename back into month and device, or null when the name
 * isn't one of ours — the log folder is a normal vault folder and may hold
 * anything the user put there.
 */
export function parseShardFileName(
	name: string,
): { month: string; device: string } | null {
	const match = SHARD_NAME_PATTERN.exec(name);
	const month = match?.[1];
	const device = match?.[2];
	if (month === undefined || device === undefined) return null;
	return { month, device };
}

/** Local month key (`YYYY-MM`) for a timestamp — the shard a review lands in. */
export function monthKey(epochMs: number): string {
	const d = new Date(epochMs);
	return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}`;
}

/**
 * Local day key (`YYYY-MM-DD`) for a timestamp — the rollup bucket a review
 * lands in. Local midnight, not Anki's configurable rollover hour: Osmosis has
 * no such setting, and inventing one here would be a side effect of a
 * storage task.
 */
export function dayKey(epochMs: number): string {
	const d = new Date(epochMs);
	return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ── Aggregation ───────────────────────────────────────────────

/** Counts indexed by FSRS rating. */
export type RatingCounts = Record<FSRSRating, number>;

/** One day's aggregate — everything the day-bucketed graphs need. */
export interface DayRollup {
	reviews: number;
	/** Total time on screen, ms. */
	timeMs: number;
	byRating: RatingCounts;
	byState: Record<CardState, number>;
	byMode: Record<StudyMode, number>;
}

/** Day-bucketed aggregates, keyed by local `YYYY-MM-DD`. */
export type Rollup = Record<string, DayRollup>;

const RATINGS: readonly FSRSRating[] = [1, 2, 3, 4];
const CARD_STATES: readonly CardState[] = ["new", "learning", "review", "relearning"];
const STUDY_MODES: readonly StudyMode[] = ["sequential", "contextual", "spatial"];

/** A zeroed day bucket. */
export function emptyDayRollup(): DayRollup {
	return {
		reviews: 0,
		timeMs: 0,
		byRating: { 1: 0, 2: 0, 3: 0, 4: 0 },
		byState: { new: 0, learning: 0, review: 0, relearning: 0 },
		byMode: { sequential: 0, contextual: 0, spatial: 0 },
	};
}

/**
 * Bucket entries by local day.
 *
 * Note what this function does *not* do: look a card up. Volume is a fact
 * about the day, not about the card — you studied that day whether or not the
 * deck still exists — so the heatmap must not retroactively empty when a note
 * is deleted. Keeping the join out of here is what makes that true by
 * construction rather than by remembering to handle it.
 */
export function aggregateRollup(entries: readonly ReviewLogEntry[]): Rollup {
	const rollup: Rollup = {};

	for (const entry of entries) {
		const day = (rollup[dayKey(entry.t)] ??= emptyDayRollup());
		day.reviews += 1;
		day.timeMs += entry.e;
		day.byRating[entry.r] += 1;
		day.byState[entry.s] += 1;
		day.byMode[entry.m] += 1;
	}

	return rollup;
}

/**
 * Sum per-shard rollups into one. Each shard has a single writer, so their
 * day buckets are disjoint sets of reviews that simply add.
 */
export function mergeRollups(rollups: readonly Rollup[]): Rollup {
	const merged: Rollup = {};

	for (const rollup of rollups) {
		for (const [key, day] of Object.entries(rollup)) {
			const target = (merged[key] ??= emptyDayRollup());
			target.reviews += day.reviews;
			target.timeMs += day.timeMs;
			for (const r of RATINGS) target.byRating[r] += day.byRating[r];
			for (const s of CARD_STATES) target.byState[s] += day.byState[s];
			for (const m of STUDY_MODES) target.byMode[m] += day.byMode[m];
		}
	}

	return merged;
}

/** The card fields a maturity split needs. */
export interface MaturityCard {
	due?: number;
	lastReview?: number;
}

/** Answer-button frequency split by card maturity. */
export interface AnswerButtonCounts {
	young: RatingCounts;
	mature: RatingCounts;
	/**
	 * Entries left out of the split because maturity is undeterminable: the
	 * card no longer resolves (its note was deleted, or its ID regenerated),
	 * or its schedule was reset. These still count in `aggregateRollup` —
	 * excluding them here is about what can be *known*, not about pruning.
	 */
	excluded: number;
}

/**
 * Answer-button counts split young/mature.
 *
 * Unlike volume, this needs the card: maturity is a property of the current
 * schedule, which only the card carries. An unresolvable card ID is therefore
 * a normal outcome here, not an error — it lands in `excluded`.
 */
export function aggregateAnswerButtons(
	entries: readonly ReviewLogEntry[],
	resolveCard: (cardId: string) => MaturityCard | undefined,
): AnswerButtonCounts {
	const counts: AnswerButtonCounts = {
		young: { 1: 0, 2: 0, 3: 0, 4: 0 },
		mature: { 1: 0, 2: 0, 3: 0, 4: 0 },
		excluded: 0,
	};

	for (const entry of entries) {
		const intervalDays = cardIntervalDays(resolveCard(entry.c));
		if (intervalDays === null) {
			counts.excluded += 1;
			continue;
		}
		const bucket = intervalDays >= MATURE_INTERVAL_DAYS ? counts.mature : counts.young;
		bucket[entry.r] += 1;
	}

	return counts;
}

/**
 * A card's current scheduled interval in days, or null when it cannot be
 * determined — no card, or a card with no schedule (new, or reset).
 */
export function cardIntervalDays(card: MaturityCard | undefined): number | null {
	if (!card) return null;
	const { due, lastReview } = card;
	if (due === undefined || lastReview === undefined) return null;
	return (due - lastReview) / MS_PER_DAY;
}

// ── The store ─────────────────────────────────────────────────

/**
 * The file operations the log needs. `Vault.adapter` satisfies this as-is;
 * declaring the narrow surface keeps the store unit-testable against an
 * in-memory fake instead of a live vault.
 */
export interface ReviewLogFs {
	exists(path: string): Promise<boolean>;
	read(path: string): Promise<string>;
	write(path: string, data: string): Promise<void>;
	append(path: string, data: string): Promise<void>;
	mkdir(path: string): Promise<void>;
	list(path: string): Promise<{ files: string[] }>;
	rename(from: string, to: string): Promise<void>;
	stat(path: string): Promise<ShardStat | null>;
}

/** The parts of a file's stat the cache fingerprints. */
export interface ShardStat {
	mtime: number;
	size: number;
}

/** Live configuration, re-read on every operation so settings changes apply. */
export interface ReviewLogConfig {
	/** Vault folder holding the shards. */
	folder: string;
	/** This device's slugged label, before the collision guard bumps it. */
	deviceLabel: string;
	/** This install's ID, written into the shard header. */
	installId: string;
}

/** Cache format version. A bump discards old caches rather than migrating. */
const CACHE_VERSION = 1;

/** How many `-2`, `-3`, … labels the collision guard will try. */
const MAX_LABEL_ATTEMPTS = 50;

/** One shard's cached day rollup, with the fingerprint it was computed from. */
export interface CachedShard {
	mtime: number;
	size: number;
	days: Rollup;
}

/**
 * Per-shard rollups as cached on this device.
 *
 * This **must never sync**. If every device wrote it, it would become a
 * shared-write file and reintroduce exactly the conflict that per-device
 * sharding removes. It is also purely disposable: every byte is recomputable
 * from the shards this device holds, so a corrupt or missing cache costs one
 * re-parse, never data.
 */
export interface ReviewLogCache {
	v: number;
	/** Keyed by shard filename. */
	shards: Record<string, CachedShard>;
}

/** Where the rollup cache is persisted. Backed by vault-local storage. */
export interface RollupCacheStore {
	load(): unknown;
	save(cache: ReviewLogCache): void;
}

/**
 * Buffers answered reviews and appends them to this device's shards.
 *
 * Writes are appends, never whole-file rewrites: that is the entire reason the
 * log does not live in `data.json`, where `saveData()` would re-serialise
 * megabytes of history on every answered card.
 */
export class ReviewLog {
	private buffer: ReviewLogEntry[] = [];
	private flushTimer: number | null = null;
	/** Collision-guard result per month, memoized. */
	private resolvedLabels = new Map<string, string>();
	private cache: ReviewLogCache;
	/** Write chain — serialises flushes so two appends cannot interleave. */
	private inflight: Promise<void> = Promise.resolve();

	constructor(
		private readonly fs: ReviewLogFs,
		private readonly config: () => ReviewLogConfig,
		private readonly cacheStore: RollupCacheStore,
		private readonly flushDelayMs = 2000,
	) {
		this.cache = normalizeCache(cacheStore.load());
	}

	/** Record an answered card. Buffers in memory; the shard write is debounced. */
	record(entry: ReviewLogEntry): void {
		this.buffer.push(entry);
		this.armTimer();
	}

	/**
	 * Drop a card's most recent buffered entry — an undo that arrived before
	 * the buffer flushed. Returns true when one was removed.
	 *
	 * Once flushed the entry stays. Rewriting a shard to delete a line would
	 * break the append-only property that makes concurrent devices safe, and a
	 * review that reached disk did happen.
	 */
	discardBuffered(cardId: string): boolean {
		for (let i = this.buffer.length - 1; i >= 0; i--) {
			if (this.buffer[i]?.c === cardId) {
				this.buffer.splice(i, 1);
				return true;
			}
		}
		return false;
	}

	/** True when entries are buffered but not yet on disk. */
	hasPendingWrites(): boolean {
		return this.buffer.length > 0;
	}

	/** Append buffered entries to their shards now, cancelling the debounce. */
	async flush(): Promise<void> {
		this.clearTimer();
		const next = this.inflight.then(() => this.writeBuffer());
		this.inflight = next;
		await next;
	}

	/**
	 * Every logged review from every device, exactly once, ordered by
	 * timestamp — including entries still buffered, so Stats opened mid-session
	 * shows what you just did.
	 *
	 * This parses raw shards. Call it only for graphs that need per-review
	 * detail, never on plugin start.
	 */
	async readAll(): Promise<ReviewLogEntry[]> {
		const { folder } = this.config();
		const shards: ReviewLogEntry[][] = [];
		for (const name of await this.listShardFiles(folder)) {
			shards.push(await this.readShardEntries(`${folder}/${name}`));
		}
		shards.push([...this.buffer]);
		return mergeShards(shards);
	}

	/**
	 * The rollup as currently cached — synchronous and I/O-free, for the
	 * eager path on plugin start.
	 */
	cachedRollup(): Rollup {
		return mergeRollups([
			...Object.values(this.cache.shards).map((shard) => shard.days),
			aggregateRollup(this.buffer),
		]);
	}

	/**
	 * The rollup, re-parsing only shards whose fingerprint changed. Steady
	 * state costs one folder listing plus a stat per shard — no entry parsing.
	 */
	async getRollup(): Promise<Rollup> {
		await this.refreshCache();
		return this.cachedRollup();
	}

	/**
	 * Move existing shards into a new folder after the setting changes. Files
	 * that are not shards stay put — the old folder may hold the user's notes.
	 *
	 * Callers must `flush()` *before* changing the folder setting, so buffered
	 * entries drain into the folder they were recorded against.
	 */
	async moveFolder(from: string, to: string): Promise<void> {
		if (from === to) return;
		// Labels are resolved against a folder's contents.
		this.resolvedLabels.clear();

		const names = await this.listShardFiles(from);
		if (names.length === 0) return;

		await this.ensureFolder(to);
		for (const name of names) {
			try {
				await this.fs.rename(`${from}/${name}`, `${to}/${name}`);
			} catch (error) {
				console.error(`Osmosis: failed to move review log shard ${name}`, error);
			}
		}
		// Fingerprints are keyed by filename, but the files moved; rebuild.
		await this.refreshCache();
	}

	// ── Private Helpers ───────────────────────────────────────

	private armTimer(): void {
		if (this.flushTimer !== null) return;
		this.flushTimer = window.setTimeout(() => {
			this.flushTimer = null;
			void this.flush();
		}, this.flushDelayMs);
	}

	private clearTimer(): void {
		if (this.flushTimer !== null) {
			window.clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}
	}

	private async writeBuffer(): Promise<void> {
		if (this.buffer.length === 0) return;
		const pending = this.buffer;
		this.buffer = [];

		// Group by target shard: a session running past midnight on the last of
		// the month writes into two.
		const byMonth = new Map<string, ReviewLogEntry[]>();
		for (const entry of pending) {
			const month = monthKey(entry.t);
			const group = byMonth.get(month);
			if (group) group.push(entry);
			else byMonth.set(month, [entry]);
		}

		const { folder } = this.config();
		for (const [month, entries] of byMonth) {
			try {
				await this.ensureFolder(folder);
				await this.appendToShard(folder, month, entries);
			} catch (error) {
				console.error("Osmosis: failed to write review log entries", error);
				// Re-buffer so the next flush or unload retries. No timer —
				// that would spin. Only the failed group is re-queued.
				this.buffer.push(...entries);
			}
		}
	}

	private async appendToShard(
		folder: string,
		month: string,
		entries: readonly ReviewLogEntry[],
	): Promise<void> {
		const { installId } = this.config();
		const label = await this.resolveShardLabel(folder, month);
		const name = shardFileName(month, label);
		const path = `${folder}/${name}`;
		const lines = entries.map((entry) => `${serializeEntry(entry)}\n`).join("");

		// Fingerprint before the write, so the cache fold below can tell
		// whether it held this shard's full contents.
		const before = await this.fs.stat(path);

		if (await this.fs.exists(path)) {
			await this.fs.append(path, lines);
		} else {
			const header = serializeHeader({
				device: label,
				install: installId,
				v: SHARD_FORMAT_VERSION,
			});
			await this.fs.write(path, `${header}\n${lines}`);
		}

		await this.foldIntoCache(path, name, entries, before);
	}

	/**
	 * The shard label this device owns for a month.
	 *
	 * Attempt 1 is the plain label. If that shard exists and its header carries
	 * a *different* install ID, another device slugged to the same name, so the
	 * label bumps to `-2`, `-3`, … until it finds a shard this install already
	 * owns or a free name. Filenames stay readable; collisions stay harmless.
	 */
	private async resolveShardLabel(folder: string, month: string): Promise<string> {
		const { deviceLabel, installId } = this.config();
		const memoKey = `${month}|${deviceLabel}|${installId}`;
		const memo = this.resolvedLabels.get(memoKey);
		if (memo !== undefined) return memo;

		let label = deviceLabel;
		for (let attempt = 1; attempt <= MAX_LABEL_ATTEMPTS; attempt++) {
			label = deviceLabelCandidate(deviceLabel, attempt);
			const path = `${folder}/${shardFileName(month, label)}`;
			if (!(await this.fs.exists(path))) break;

			const { header } = parseShard(await this.fs.read(path));
			// A headerless shard is adopted: it was hand-made or predates the
			// header, and nothing suggests another install owns it.
			if (header === null || header.install === installId) break;
		}

		this.resolvedLabels.set(memoKey, label);
		return label;
	}

	private async listShardFiles(folder: string): Promise<string[]> {
		if (folder === "" || !(await this.fs.exists(folder))) return [];
		try {
			const listed = await this.fs.list(folder);
			return listed.files
				.map((path) => basename(path))
				.filter((name) => parseShardFileName(name) !== null)
				.sort();
		} catch (error) {
			console.error(`Osmosis: failed to list review log folder ${folder}`, error);
			return [];
		}
	}

	private async readShardEntries(path: string): Promise<ReviewLogEntry[]> {
		try {
			return parseShard(await this.fs.read(path)).entries;
		} catch (error) {
			console.error(`Osmosis: failed to read review log shard ${path}`, error);
			return [];
		}
	}

	/** Re-parse shards whose fingerprint moved; forget shards that are gone. */
	private async refreshCache(): Promise<void> {
		const { folder } = this.config();
		const names = await this.listShardFiles(folder);
		const live = new Set(names);
		let changed = false;

		for (const name of Object.keys(this.cache.shards)) {
			if (!live.has(name)) {
				delete this.cache.shards[name];
				changed = true;
			}
		}

		for (const name of names) {
			const path = `${folder}/${name}`;
			const stat = await this.fs.stat(path);
			const cached = this.cache.shards[name];
			if (stat && cached && cached.mtime === stat.mtime && cached.size === stat.size) {
				continue;
			}
			this.cache.shards[name] = {
				mtime: stat?.mtime ?? 0,
				size: stat?.size ?? 0,
				days: aggregateRollup(await this.readShardEntries(path)),
			};
			changed = true;
		}

		if (changed) this.cacheStore.save(this.cache);
	}

	/**
	 * Fold just-appended entries into the cached rollup, so a study session
	 * never costs a shard re-parse.
	 *
	 * Only safe when the cache held this shard's *whole* contents immediately
	 * before the append — otherwise it holds an unknown subset, and adding to
	 * it while stamping a current fingerprint would hide the rest forever. When
	 * that cannot be established the entry is dropped instead, so the next
	 * `getRollup()` rebuilds it from the file.
	 */
	private async foldIntoCache(
		path: string,
		name: string,
		entries: readonly ReviewLogEntry[],
		before: ShardStat | null,
	): Promise<void> {
		const cached = this.cache.shards[name];
		const wasCurrent = before === null
			? cached === undefined
			: cached !== undefined && cached.mtime === before.mtime && cached.size === before.size;

		if (!wasCurrent) {
			delete this.cache.shards[name];
			this.cacheStore.save(this.cache);
			return;
		}

		const stat = await this.fs.stat(path);
		this.cache.shards[name] = {
			mtime: stat?.mtime ?? 0,
			size: stat?.size ?? 0,
			days: mergeRollups([cached?.days ?? {}, aggregateRollup(entries)]),
		};
		this.cacheStore.save(this.cache);
	}

	/** Create the log folder, and any missing parent, if it isn't there. */
	private async ensureFolder(folder: string): Promise<void> {
		if (folder === "" || (await this.fs.exists(folder))) return;

		let current = "";
		for (const part of folder.split("/")) {
			if (part === "") continue;
			current = current === "" ? part : `${current}/${part}`;
			if (!(await this.fs.exists(current))) await this.fs.mkdir(current);
		}
	}
}

/**
 * Validate a persisted cache, discarding anything unrecognised. Counts are
 * rebuilt from a zeroed bucket so a hand-edited or half-written cache cannot
 * feed `undefined` or `NaN` into the aggregation.
 */
export function normalizeCache(raw: unknown): ReviewLogCache {
	if (!isPlainObject(raw) || raw["v"] !== CACHE_VERSION) {
		return { v: CACHE_VERSION, shards: {} };
	}

	const shards: Record<string, CachedShard> = {};
	const rawShards = raw["shards"];
	if (isPlainObject(rawShards)) {
		for (const [name, value] of Object.entries(rawShards)) {
			if (parseShardFileName(name) === null || !isPlainObject(value)) continue;
			const mtime = toFiniteNumber(value["mtime"]);
			const size = toFiniteNumber(value["size"]);
			if (mtime === null || size === null) continue;
			shards[name] = { mtime, size, days: normalizeRollup(value["days"]) };
		}
	}

	return { v: CACHE_VERSION, shards };
}

/** Rebuild a rollup from untrusted JSON, coercing every count. */
function normalizeRollup(raw: unknown): Rollup {
	const rollup: Rollup = {};
	if (!isPlainObject(raw)) return rollup;

	for (const [day, value] of Object.entries(raw)) {
		if (!isPlainObject(value)) continue;
		const bucket = emptyDayRollup();
		bucket.reviews = toCount(value["reviews"]);
		bucket.timeMs = toCount(value["timeMs"]);

		const byRating = value["byRating"];
		if (isPlainObject(byRating)) {
			for (const r of RATINGS) bucket.byRating[r] = toCount(byRating[String(r)]);
		}
		const byState = value["byState"];
		if (isPlainObject(byState)) {
			for (const s of CARD_STATES) bucket.byState[s] = toCount(byState[s]);
		}
		const byMode = value["byMode"];
		if (isPlainObject(byMode)) {
			for (const m of STUDY_MODES) bucket.byMode[m] = toCount(byMode[m]);
		}

		rollup[day] = bucket;
	}

	return rollup;
}

// ── Private Helpers ───────────────────────────────────────────

function parseJsonObject(line: string): Record<string, unknown> | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(line);
	} catch {
		return null;
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		return null;
	}
	return parsed as Record<string, unknown>;
}

function parseRating(value: unknown): FSRSRating | null {
	return RATINGS.includes(value as FSRSRating) ? (value as FSRSRating) : null;
}

/** Entries only exist after a review, so an unknown state means "review". */
function parseCardState(value: unknown): CardState {
	return CARD_STATES.includes(value as CardState) ? (value as CardState) : "review";
}

/**
 * Study mode, defaulting to sequential. Every entry Osmosis writes carries
 * `m`, so this only fires on a hand-edited or truncated line; keeping the
 * review (mis-attributed in one graph) beats dropping it from all of them.
 */
function parseStudyMode(value: unknown): StudyMode {
	return STUDY_MODES.includes(value as StudyMode) ? (value as StudyMode) : "sequential";
}

function toFiniteNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** A cached count: finite and non-negative, or zero. */
function toCount(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function basename(path: string): string {
	const index = path.lastIndexOf("/");
	return index === -1 ? path : path.slice(index + 1);
}

function pad(n: number): string {
	return String(n).padStart(2, "0");
}

function round4(value: number): number {
	return Math.round(value * 10000) / 10000;
}
