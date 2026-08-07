// @vitest-environment jsdom
// ReviewLog debounces its flush via window.setTimeout, matching ScheduleStore
// (Obsidian runs in a browser context and popout windows need window timers).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	MATURE_INTERVAL_DAYS,
	SHARD_FORMAT_VERSION,
	ReviewLog,
	aggregateAnswerButtons,
	aggregateRollup,
	cardIntervalDays,
	dayKey,
	deviceLabelCandidate,
	mergeRollups,
	mergeShards,
	monthKey,
	normalizeLogFolder,
	normalizeCache,
	parseEntry,
	parseHeader,
	parseShard,
	parseShardFileName,
	serializeEntry,
	serializeHeader,
	shardFileName,
	slugifyDeviceLabel,
	type MaturityCard,
	type ReviewLogCache,
	type ReviewLogFs,
	type ShardStat,
	type ReviewLogEntry,
} from "./ReviewLog";

/** A review of a geography card, mid-morning on 7 August 2026 (local). */
const baseEntry: ReviewLogEntry = {
	t: new Date(2026, 7, 7, 10, 30, 0).getTime(),
	c: "os-wcfb3w",
	r: 3,
	s: "review",
	iv: 345_600,
	st: 12.3,
	d: 6.4,
	e: 4200,
	m: "sequential",
};

/** An entry differing from `baseEntry` in the given fields. */
function entry(overrides: Partial<ReviewLogEntry>): ReviewLogEntry {
	return { ...baseEntry, ...overrides };
}

describe("entry serialisation", () => {
	it("round-trips an entry through a shard line", () => {
		const line = serializeEntry(baseEntry);
		expect(parseEntry(line)).toEqual(baseEntry);
	});

	it("writes fields in the documented order", () => {
		expect(serializeEntry(baseEntry)).toBe(
			'{"t":' + String(baseEntry.t) + ',"c":"os-wcfb3w","r":3,"s":"review"' +
			',"iv":345600,"st":12.3,"d":6.4,"e":4200,"m":"sequential"}',
		);
	});

	it("rounds stability and difficulty to four decimals", () => {
		const line = serializeEntry(entry({ st: 1.23456789, d: 9.87654321 }));
		expect(parseEntry(line)).toMatchObject({ st: 1.2346, d: 9.8765 });
	});

	it("rounds timestamps, intervals, and elapsed time to whole numbers", () => {
		const line = serializeEntry(entry({ t: 1_754_500_000_000.7, iv: 86_400.4, e: 4200.9 }));
		expect(parseEntry(line)).toMatchObject({ t: 1_754_500_000_001, iv: 86_400, e: 4201 });
	});

	it("round-trips every study mode and card state", () => {
		for (const m of ["sequential", "contextual", "spatial"] as const) {
			for (const s of ["new", "learning", "review", "relearning"] as const) {
				expect(parseEntry(serializeEntry(entry({ m, s })))).toMatchObject({ m, s });
			}
		}
	});

	it("round-trips every rating", () => {
		for (const r of [1, 2, 3, 4] as const) {
			expect(parseEntry(serializeEntry(entry({ r })))).toMatchObject({ r });
		}
	});
});

describe("parseEntry rejection and defaults", () => {
	it("rejects lines that are not JSON objects", () => {
		expect(parseEntry("")).toBeNull();
		expect(parseEntry("not json")).toBeNull();
		expect(parseEntry("[1,2,3]")).toBeNull();
		expect(parseEntry("null")).toBeNull();
		expect(parseEntry("42")).toBeNull();
	});

	it("rejects entries missing a timestamp, card ID, or rating", () => {
		expect(parseEntry('{"c":"os-a1","r":3}')).toBeNull();
		expect(parseEntry('{"t":1,"r":3}')).toBeNull();
		expect(parseEntry('{"t":1,"c":"","r":3}')).toBeNull();
		expect(parseEntry('{"t":1,"c":"os-a1"}')).toBeNull();
	});

	it("rejects out-of-range and non-numeric ratings", () => {
		expect(parseEntry('{"t":1,"c":"os-a1","r":0}')).toBeNull();
		expect(parseEntry('{"t":1,"c":"os-a1","r":5}')).toBeNull();
		expect(parseEntry('{"t":1,"c":"os-a1","r":"3"}')).toBeNull();
	});

	it("keeps a review whose detail fields are missing, defaulting them", () => {
		// A hand-mangled line still happened — dropping it would lose the day.
		expect(parseEntry('{"t":1754500000000,"c":"os-a1","r":2}')).toEqual({
			t: 1_754_500_000_000,
			c: "os-a1",
			r: 2,
			s: "review",
			iv: 0,
			st: 0,
			d: 0,
			e: 0,
			m: "sequential",
		});
	});

	it("falls back on unrecognised state and mode values", () => {
		const parsed = parseEntry('{"t":1,"c":"os-a1","r":3,"s":"bogus","m":"bogus"}');
		expect(parsed).toMatchObject({ s: "review", m: "sequential" });
	});
});

describe("shard header", () => {
	it("round-trips a header line", () => {
		const header = { device: "pixel-10a", install: "a3f9c1d0", v: SHARD_FORMAT_VERSION };
		expect(parseHeader(serializeHeader(header))).toEqual(header);
	});

	it("rejects lines that are not headers", () => {
		expect(parseHeader(serializeEntry(baseEntry))).toBeNull();
		expect(parseHeader('{"device":"pixel-10a"}')).toBeNull();
		expect(parseHeader('{"device":"pixel-10a","install":"a3f9"}')).toBeNull();
		expect(parseHeader('{"install":"a3f9","v":1}')).toBeNull();
	});

	it("accepts a future format version rather than refusing to read", () => {
		expect(parseHeader('{"device":"pixel-10a","install":"a3f9","v":7}')).toEqual({
			device: "pixel-10a",
			install: "a3f9",
			v: 7,
		});
	});
});

describe("parseShard", () => {
	it("reads a header followed by entries", () => {
		const text = [
			serializeHeader({ device: "pixel-10a", install: "a3f9", v: 1 }),
			serializeEntry(baseEntry),
			serializeEntry(entry({ t: baseEntry.t + 1000, c: "os-b2" })),
		].join("\n");

		const shard = parseShard(text);
		expect(shard.header).toEqual({ device: "pixel-10a", install: "a3f9", v: 1 });
		expect(shard.entries).toHaveLength(2);
		expect(shard.entries[1]?.c).toBe("os-b2");
	});

	it("reads a headerless shard", () => {
		const shard = parseShard(serializeEntry(baseEntry));
		expect(shard.header).toBeNull();
		expect(shard.entries).toEqual([baseEntry]);
	});

	it("skips blank lines and a trailing newline", () => {
		const text = `${serializeHeader({ device: "d", install: "i", v: 1 })}\n\n${serializeEntry(baseEntry)}\n\n`;
		const shard = parseShard(text);
		expect(shard.header).not.toBeNull();
		expect(shard.entries).toEqual([baseEntry]);
	});

	it("skips unparseable lines and keeps the rest", () => {
		const text = [
			serializeHeader({ device: "d", install: "i", v: 1 }),
			serializeEntry(baseEntry),
			"{ truncated",
			serializeEntry(entry({ t: baseEntry.t + 1000, c: "os-b2" })),
		].join("\n");

		expect(parseShard(text).entries).toHaveLength(2);
	});

	it("returns nothing for an empty file", () => {
		expect(parseShard("")).toEqual({ header: null, entries: [] });
	});
});

describe("mergeShards", () => {
	it("unions shards and orders by timestamp", () => {
		const desktop = [
			entry({ t: 3000, c: "os-c3" }),
			entry({ t: 1000, c: "os-a1" }),
		];
		const phone = [entry({ t: 2000, c: "os-b2" })];

		expect(mergeShards([desktop, phone]).map((e) => e.t)).toEqual([1000, 2000, 3000]);
	});

	it("yields every review exactly once across devices", () => {
		const desktop = Array.from({ length: 50 }, (_, i) => entry({ t: 1000 + i, c: `os-d${String(i)}` }));
		const phone = Array.from({ length: 30 }, (_, i) => entry({ t: 5000 + i, c: `os-p${String(i)}` }));

		// Monday, both devices offline: different files, nothing lost.
		expect(mergeShards([desktop, phone])).toHaveLength(80);
	});

	it("dedups replayed entries", () => {
		const shard = [entry({ t: 1000, c: "os-a1" }), entry({ t: 2000, c: "os-b2" })];
		// The same shard read twice — a copied file, or a re-read after a flush.
		expect(mergeShards([shard, shard])).toHaveLength(2);
	});

	it("keeps two answers of the same card at different times", () => {
		const merged = mergeShards([[
			entry({ t: 1000, c: "os-a1", r: 1 }),
			entry({ t: 2000, c: "os-a1", r: 3 }),
		]]);
		expect(merged).toHaveLength(2);
	});

	it("keeps same-millisecond answers of different cards", () => {
		const merged = mergeShards([[
			entry({ t: 1000, c: "os-a1" }),
			entry({ t: 1000, c: "os-b2" }),
		]]);
		expect(merged).toHaveLength(2);
	});

	it("breaks timestamp ties on card ID, so every device sorts alike", () => {
		const forward = mergeShards([[entry({ t: 1000, c: "os-b2" }), entry({ t: 1000, c: "os-a1" })]]);
		const reverse = mergeShards([[entry({ t: 1000, c: "os-a1" }), entry({ t: 1000, c: "os-b2" })]]);
		expect(forward.map((e) => e.c)).toEqual(["os-a1", "os-b2"]);
		expect(reverse.map((e) => e.c)).toEqual(["os-a1", "os-b2"]);
	});

	it("handles no shards and empty shards", () => {
		expect(mergeShards([])).toEqual([]);
		expect(mergeShards([[], []])).toEqual([]);
	});
});

describe("slugifyDeviceLabel", () => {
	it("lowercases, drops apostrophes, and hyphenates the rest", () => {
		expect(slugifyDeviceLabel("Sawyer's MacBook Pro")).toBe("sawyers-macbook-pro");
	});

	it("collapses runs of non-alphanumerics into one hyphen", () => {
		expect(slugifyDeviceLabel("Studio  //  Desk")).toBe("studio-desk");
	});

	it("trims leading and trailing separators", () => {
		expect(slugifyDeviceLabel("  -- Pixel 10a -- ")).toBe("pixel-10a");
	});

	it("keeps digits", () => {
		expect(slugifyDeviceLabel("Pixel 10a")).toBe("pixel-10a");
	});

	it("caps the label at 32 characters without a trailing hyphen", () => {
		const slug = slugifyDeviceLabel("A ridiculously long device name that keeps going");
		expect(slug.length).toBeLessThanOrEqual(32);
		expect(slug).toBe("a-ridiculously-long-device-name");
	});

	it("falls back when nothing survives slugging", () => {
		expect(slugifyDeviceLabel("")).toBe("device");
		expect(slugifyDeviceLabel("＊＊＊")).toBe("device");
	});

	it("produces a label the filename parser accepts", () => {
		const device = slugifyDeviceLabel("Sawyer's MacBook Pro");
		expect(parseShardFileName(shardFileName("2026-08", device))).toEqual({
			month: "2026-08",
			device,
		});
	});
});

describe("deviceLabelCandidate", () => {
	it("returns the label unchanged for the first attempt", () => {
		expect(deviceLabelCandidate("pixel-10a", 1)).toBe("pixel-10a");
	});

	it("bumps a colliding label to -2, then -3", () => {
		expect(deviceLabelCandidate("pixel-10a", 2)).toBe("pixel-10a-2");
		expect(deviceLabelCandidate("pixel-10a", 3)).toBe("pixel-10a-3");
	});

	it("does not read a trailing number as a bump counter", () => {
		// "nexus-5" is a device name, not "nexus" at attempt 5.
		expect(deviceLabelCandidate("nexus-5", 2)).toBe("nexus-5-2");
	});

	it("keeps bumped labels inside the length cap", () => {
		const label = slugifyDeviceLabel("A ridiculously long device name that keeps going");
		const bumped = deviceLabelCandidate(label, 2);
		expect(bumped.length).toBeLessThanOrEqual(32);
		expect(bumped.endsWith("-2")).toBe(true);
		expect(bumped).not.toContain("--");
	});

	it("produces filename-safe bumped labels", () => {
		const bumped = deviceLabelCandidate("pixel-10a", 2);
		expect(parseShardFileName(shardFileName("2026-08", bumped))).toEqual({
			month: "2026-08",
			device: bumped,
		});
	});
});

describe("shard filenames", () => {
	it("builds a readable month.device name", () => {
		expect(shardFileName("2026-08", "pixel-10a")).toBe("2026-08.pixel-10a.jsonl");
	});

	it("round-trips through the parser", () => {
		expect(parseShardFileName("2026-07.sawyers-macbook.jsonl")).toEqual({
			month: "2026-07",
			device: "sawyers-macbook",
		});
	});

	it("ignores files that are not shards", () => {
		expect(parseShardFileName("notes.md")).toBeNull();
		expect(parseShardFileName("2026-08.jsonl")).toBeNull();
		expect(parseShardFileName("2026-8.pixel.jsonl")).toBeNull();
		expect(parseShardFileName("2026-08.Pixel.jsonl")).toBeNull();
		expect(parseShardFileName("2026-08.pixel.json")).toBeNull();
		expect(parseShardFileName("rollup.json")).toBeNull();
	});
});

describe("monthKey / dayKey", () => {
	it("uses the local calendar month", () => {
		expect(monthKey(new Date(2026, 7, 7, 10, 30).getTime())).toBe("2026-08");
	});

	it("uses the local calendar day", () => {
		expect(dayKey(new Date(2026, 7, 7, 10, 30).getTime())).toBe("2026-08-07");
	});

	it("pads single-digit months and days", () => {
		expect(monthKey(new Date(2026, 0, 5, 9, 5).getTime())).toBe("2026-01");
		expect(dayKey(new Date(2026, 0, 5, 9, 5).getTime())).toBe("2026-01-05");
	});

	it("puts late-evening and just-past-midnight reviews on their own local days", () => {
		expect(dayKey(new Date(2026, 7, 7, 23, 59, 59).getTime())).toBe("2026-08-07");
		expect(dayKey(new Date(2026, 7, 8, 0, 0, 1).getTime())).toBe("2026-08-08");
	});

	it("rolls the shard over at a month boundary", () => {
		expect(monthKey(new Date(2026, 6, 31, 23, 59, 59).getTime())).toBe("2026-07");
		expect(monthKey(new Date(2026, 7, 1, 0, 0, 1).getTime())).toBe("2026-08");
	});
});

describe("aggregateRollup", () => {
	const day = (h: number) => new Date(2026, 7, 7, h, 0, 0).getTime();
	const nextDay = (h: number) => new Date(2026, 7, 8, h, 0, 0).getTime();

	it("counts reviews and time per local day", () => {
		const rollup = aggregateRollup([
			entry({ t: day(9), e: 1000 }),
			entry({ t: day(21), e: 2500 }),
			entry({ t: nextDay(8), e: 400 }),
		]);

		expect(rollup["2026-08-07"]).toMatchObject({ reviews: 2, timeMs: 3500 });
		expect(rollup["2026-08-08"]).toMatchObject({ reviews: 1, timeMs: 400 });
	});

	it("splits counts by rating, state, and study mode", () => {
		const rollup = aggregateRollup([
			entry({ t: day(9), r: 1, s: "relearning", m: "sequential" }),
			entry({ t: day(10), r: 3, s: "review", m: "contextual" }),
			entry({ t: day(11), r: 3, s: "review", m: "spatial" }),
			entry({ t: day(12), r: 4, s: "review", m: "spatial" }),
		]);

		const bucket = rollup["2026-08-07"];
		expect(bucket?.byRating).toEqual({ 1: 1, 2: 0, 3: 2, 4: 1 });
		expect(bucket?.byState).toEqual({ new: 0, learning: 0, review: 3, relearning: 1 });
		expect(bucket?.byMode).toEqual({ sequential: 1, contextual: 1, spatial: 2 });
	});

	it("crosses a month boundary into separate day buckets", () => {
		const rollup = aggregateRollup([
			entry({ t: new Date(2026, 6, 31, 23, 0).getTime() }),
			entry({ t: new Date(2026, 7, 1, 1, 0).getTime() }),
		]);

		expect(Object.keys(rollup).sort()).toEqual(["2026-07-31", "2026-08-01"]);
	});

	it("returns nothing for an empty log", () => {
		expect(aggregateRollup([])).toEqual({});
	});

	it("counts reviews of cards that no longer exist", () => {
		// No card lookup happens here at all — that is the point. A deleted
		// deck must not retroactively empty the heatmap.
		const rollup = aggregateRollup([entry({ t: day(9), c: "os-deleted" })]);
		expect(rollup["2026-08-07"]?.reviews).toBe(1);
	});
});

describe("mergeRollups", () => {
	it("sums the same day across two devices' shards", () => {
		const desktop = aggregateRollup([
			entry({ t: new Date(2026, 7, 7, 9, 0).getTime(), r: 3, e: 1000, m: "sequential" }),
		]);
		const phone = aggregateRollup([
			entry({ t: new Date(2026, 7, 7, 20, 0).getTime(), r: 1, e: 500, m: "spatial" }),
		]);

		const merged = mergeRollups([desktop, phone]);
		expect(merged["2026-08-07"]).toMatchObject({ reviews: 2, timeMs: 1500 });
		expect(merged["2026-08-07"]?.byRating).toEqual({ 1: 1, 2: 0, 3: 1, 4: 0 });
		expect(merged["2026-08-07"]?.byMode).toEqual({ sequential: 1, contextual: 0, spatial: 1 });
	});

	it("keeps days that only one shard saw", () => {
		const merged = mergeRollups([
			aggregateRollup([entry({ t: new Date(2026, 7, 7, 9, 0).getTime() })]),
			aggregateRollup([entry({ t: new Date(2026, 7, 9, 9, 0).getTime() })]),
		]);
		expect(Object.keys(merged).sort()).toEqual(["2026-08-07", "2026-08-09"]);
	});

	it("does not mutate its inputs", () => {
		const desktop = aggregateRollup([entry({ t: new Date(2026, 7, 7, 9, 0).getTime() })]);
		mergeRollups([desktop, desktop]);
		expect(desktop["2026-08-07"]?.reviews).toBe(1);
	});

	it("handles no rollups and empty rollups", () => {
		expect(mergeRollups([])).toEqual({});
		expect(mergeRollups([{}, {}])).toEqual({});
	});
});

describe("cardIntervalDays", () => {
	const lastReview = new Date(2026, 7, 1, 9, 0).getTime();

	it("measures the gap between last review and due date", () => {
		expect(cardIntervalDays({ lastReview, due: lastReview + 10 * 86_400_000 })).toBe(10);
	});

	it("cannot determine an interval for a missing card", () => {
		expect(cardIntervalDays(undefined)).toBeNull();
	});

	it("cannot determine an interval for a card whose schedule was reset", () => {
		// Resetting clears FSRS state but leaves the log entries intact.
		expect(cardIntervalDays({})).toBeNull();
		expect(cardIntervalDays({ due: lastReview })).toBeNull();
		expect(cardIntervalDays({ lastReview })).toBeNull();
	});
});

describe("aggregateAnswerButtons", () => {
	const lastReview = new Date(2026, 7, 1, 9, 0).getTime();
	const withInterval = (days: number): MaturityCard => ({
		lastReview,
		due: lastReview + days * 86_400_000,
	});

	/** A store holding only the cards named. */
	function store(cards: Record<string, MaturityCard>) {
		return (cardId: string): MaturityCard | undefined => cards[cardId];
	}

	it("splits ratings by maturity", () => {
		const counts = aggregateAnswerButtons(
			[
				entry({ c: "os-young", r: 1 }),
				entry({ c: "os-young", r: 3 }),
				entry({ c: "os-mature", r: 4 }),
			],
			store({ "os-young": withInterval(5), "os-mature": withInterval(60) }),
		);

		expect(counts.young).toEqual({ 1: 1, 2: 0, 3: 1, 4: 0 });
		expect(counts.mature).toEqual({ 1: 0, 2: 0, 3: 0, 4: 1 });
		expect(counts.excluded).toBe(0);
	});

	it("treats the 21-day threshold as mature", () => {
		const counts = aggregateAnswerButtons(
			[entry({ c: "os-edge", r: 3 })],
			store({ "os-edge": withInterval(MATURE_INTERVAL_DAYS) }),
		);
		expect(counts.mature[3]).toBe(1);
		expect(counts.young[3]).toBe(0);
	});

	it("treats a hair under the threshold as young", () => {
		const counts = aggregateAnswerButtons(
			[entry({ c: "os-edge", r: 3 })],
			store({ "os-edge": withInterval(MATURE_INTERVAL_DAYS - 0.01) }),
		);
		expect(counts.young[3]).toBe(1);
		expect(counts.mature[3]).toBe(0);
	});

	it("excludes entries whose card is gone, without erroring", () => {
		const counts = aggregateAnswerButtons(
			[
				entry({ c: "os-live", r: 3 }),
				entry({ c: "os-deleted", r: 1 }),
				entry({ c: "os-also-deleted", r: 2 }),
			],
			store({ "os-live": withInterval(3) }),
		);

		expect(counts.young).toEqual({ 1: 0, 2: 0, 3: 1, 4: 0 });
		expect(counts.mature).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0 });
		expect(counts.excluded).toBe(2);
	});

	it("excludes a card whose schedule was reset", () => {
		const counts = aggregateAnswerButtons(
			[entry({ c: "os-reset", r: 3 })],
			store({ "os-reset": {} }),
		);
		expect(counts.excluded).toBe(1);
	});

	it("counts an orphaned entry in volume while dropping it from the split", () => {
		const orphan = entry({ t: new Date(2026, 7, 7, 9, 0).getTime(), c: "os-deleted" });
		const lookup = store({});

		expect(aggregateRollup([orphan])["2026-08-07"]?.reviews).toBe(1);
		expect(aggregateAnswerButtons([orphan], lookup).excluded).toBe(1);
	});

	it("returns zeroed counts for an empty log", () => {
		const counts = aggregateAnswerButtons([], store({}));
		expect(counts).toEqual({
			young: { 1: 0, 2: 0, 3: 0, 4: 0 },
			mature: { 1: 0, 2: 0, 3: 0, 4: 0 },
			excluded: 0,
		});
	});
});

// ── The store ─────────────────────────────────────────────────

const FOLDER = "Osmosis/Reviews";
const INSTALL = "a3f9c1d0";
const DEVICE = "pixel-10a";

/**
 * In-memory `ReviewLogFs`. Tracks mtimes and counts calls so the append-only
 * write path and the cache's fingerprinting are both observable.
 */
class FakeFs implements ReviewLogFs {
	files = new Map<string, string>();
	folders = new Set<string>();
	mtimes = new Map<string, number>();
	/** Paths whose next write or append throws, to exercise the failure path. */
	failWrites = new Set<string>();
	reads: string[] = [];
	writes: string[] = [];
	appends: string[] = [];
	private clock = 1000;

	exists(path: string): Promise<boolean> {
		return Promise.resolve(this.files.has(path) || this.folders.has(path));
	}

	read(path: string): Promise<string> {
		this.reads.push(path);
		const data = this.files.get(path);
		if (data === undefined) return Promise.reject(new Error(`ENOENT ${path}`));
		return Promise.resolve(data);
	}

	write(path: string, data: string): Promise<void> {
		this.writes.push(path);
		if (this.failWrites.has(path)) return Promise.reject(new Error(`EACCES ${path}`));
		this.files.set(path, data);
		this.touch(path);
		return Promise.resolve();
	}

	append(path: string, data: string): Promise<void> {
		this.appends.push(path);
		if (this.failWrites.has(path)) return Promise.reject(new Error(`EACCES ${path}`));
		this.files.set(path, (this.files.get(path) ?? "") + data);
		this.touch(path);
		return Promise.resolve();
	}

	mkdir(path: string): Promise<void> {
		this.folders.add(path);
		return Promise.resolve();
	}

	list(folder: string): Promise<{ files: string[] }> {
		const prefix = `${folder}/`;
		return Promise.resolve({
			files: [...this.files.keys()].filter((path) => path.startsWith(prefix)),
		});
	}

	rename(from: string, to: string): Promise<void> {
		const data = this.files.get(from);
		if (data === undefined) return Promise.reject(new Error(`ENOENT ${from}`));
		this.files.delete(from);
		this.mtimes.delete(from);
		this.files.set(to, data);
		this.touch(to);
		return Promise.resolve();
	}

	stat(path: string): Promise<ShardStat | null> {
		const data = this.files.get(path);
		if (data === undefined) return Promise.resolve(null);
		return Promise.resolve({ mtime: this.mtimes.get(path) ?? 0, size: data.length });
	}

	/** Seed a shard as if another device had synced it in. */
	seedShard(name: string, install: string, entries: readonly ReviewLogEntry[]): void {
		const header = serializeHeader({ device: "seeded", install, v: SHARD_FORMAT_VERSION });
		const lines = entries.map((e) => `${serializeEntry(e)}\n`).join("");
		this.files.set(`${FOLDER}/${name}`, `${header}\n${lines}`);
		this.touch(`${FOLDER}/${name}`);
		this.folders.add(FOLDER);
	}

	/** Shard lines, header excluded. */
	linesOf(name: string): string[] {
		return (this.files.get(`${FOLDER}/${name}`) ?? "")
			.split("\n")
			.filter((line) => line.trim() !== "");
	}

	/** Names of every file in the log folder. */
	folderContents(): string[] {
		const prefix = `${FOLDER}/`;
		return [...this.files.keys()]
			.filter((path) => path.startsWith(prefix))
			.map((path) => path.slice(prefix.length))
			.sort();
	}

	resetCounters(): void {
		this.reads = [];
		this.writes = [];
		this.appends = [];
	}

	private touch(path: string): void {
		this.clock += 1000;
		this.mtimes.set(path, this.clock);
	}
}

/** Cache store that round-trips through JSON, the way localStorage does. */
class FakeCacheStore {
	saves = 0;
	constructor(private stored: unknown = null) {}

	load(): unknown {
		return this.stored;
	}

	save(cache: ReviewLogCache): void {
		this.saves += 1;
		this.stored = JSON.parse(JSON.stringify(cache)) as unknown;
	}

	peek(): unknown {
		return this.stored;
	}
}

/** A log wired to a fresh fake filesystem and cache. */
function makeLog(options?: { fs?: FakeFs; cache?: FakeCacheStore; folder?: string }) {
	const fs = options?.fs ?? new FakeFs();
	const cache = options?.cache ?? new FakeCacheStore();
	const config = {
		folder: options?.folder ?? FOLDER,
		deviceLabel: DEVICE,
		installId: INSTALL,
	};
	const log = new ReviewLog(fs, () => config, cache, 2000);
	return { log, fs, cache, config };
}

const AUG_7 = new Date(2026, 7, 7, 10, 30, 0).getTime();

describe("ReviewLog writes", () => {
	it("creates the shard with a header line, then the entries", async () => {
		const { log, fs } = makeLog();
		log.record(entry({ t: AUG_7, c: "os-a1" }));
		await log.flush();

		const lines = fs.linesOf("2026-08.pixel-10a.jsonl");
		expect(parseHeader(lines[0] ?? "")).toEqual({
			device: DEVICE,
			install: INSTALL,
			v: SHARD_FORMAT_VERSION,
		});
		expect(parseEntry(lines[1] ?? "")).toMatchObject({ c: "os-a1" });
	});

	it("creates the log folder, including its parent", async () => {
		const { log, fs } = makeLog();
		log.record(entry({ t: AUG_7 }));
		await log.flush();

		expect(fs.folders.has("Osmosis")).toBe(true);
		expect(fs.folders.has("Osmosis/Reviews")).toBe(true);
	});

	it("appends later entries instead of rewriting the shard", async () => {
		const { log, fs } = makeLog();
		log.record(entry({ t: AUG_7, c: "os-a1" }));
		await log.flush();
		fs.resetCounters();

		log.record(entry({ t: AUG_7 + 1000, c: "os-b2" }));
		log.record(entry({ t: AUG_7 + 2000, c: "os-c3" }));
		await log.flush();

		// The whole point of JSONL: never a whole-file rewrite.
		expect(fs.writes).toEqual([]);
		expect(fs.appends).toEqual([`${FOLDER}/2026-08.pixel-10a.jsonl`]);
		expect(fs.linesOf("2026-08.pixel-10a.jsonl")).toHaveLength(4);
	});

	it("writes one entry per answer", async () => {
		const { log, fs } = makeLog();
		for (let i = 0; i < 12; i++) {
			log.record(entry({ t: AUG_7 + i * 1000, c: `os-${String(i)}` }));
		}
		await log.flush();

		expect(fs.linesOf("2026-08.pixel-10a.jsonl")).toHaveLength(13); // + header
	});

	it("splits a session that crosses a month boundary across two shards", async () => {
		const { log, fs } = makeLog();
		log.record(entry({ t: new Date(2026, 6, 31, 23, 59).getTime(), c: "os-jul" }));
		log.record(entry({ t: new Date(2026, 7, 1, 0, 1).getTime(), c: "os-aug" }));
		await log.flush();

		expect(fs.folderContents()).toEqual([
			"2026-07.pixel-10a.jsonl",
			"2026-08.pixel-10a.jsonl",
		]);
	});

	it("writes nothing when nothing was recorded", async () => {
		const { log, fs } = makeLog();
		await log.flush();
		expect(fs.folderContents()).toEqual([]);
	});

	it("re-buffers entries when the write fails, so the next flush retries", async () => {
		const { log, fs } = makeLog();
		const path = `${FOLDER}/2026-08.pixel-10a.jsonl`;
		fs.failWrites.add(path);
		vi.spyOn(console, "error").mockImplementation(() => undefined);

		log.record(entry({ t: AUG_7, c: "os-a1" }));
		await log.flush();
		expect(log.hasPendingWrites()).toBe(true);

		fs.failWrites.delete(path);
		await log.flush();
		expect(log.hasPendingWrites()).toBe(false);
		expect(fs.linesOf("2026-08.pixel-10a.jsonl")).toHaveLength(2);
		vi.restoreAllMocks();
	});
});

describe("ReviewLog debounce", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("holds entries in memory, then flushes after the debounce window", async () => {
		const { log, fs } = makeLog();
		log.record(entry({ t: AUG_7 }));

		expect(fs.folderContents()).toEqual([]);
		expect(log.hasPendingWrites()).toBe(true);

		await vi.advanceTimersByTimeAsync(2000);
		expect(fs.linesOf("2026-08.pixel-10a.jsonl")).toHaveLength(2);
		expect(log.hasPendingWrites()).toBe(false);
	});

	it("coalesces a burst of answers into one append", async () => {
		const { log, fs } = makeLog();
		for (let i = 0; i < 5; i++) {
			log.record(entry({ t: AUG_7 + i * 100, c: `os-${String(i)}` }));
			await vi.advanceTimersByTimeAsync(300);
		}
		await vi.advanceTimersByTimeAsync(2000);

		expect(fs.writes).toHaveLength(1);
		expect(fs.appends).toEqual([]);
		expect(fs.linesOf("2026-08.pixel-10a.jsonl")).toHaveLength(6);
	});

	it("an explicit flush cancels the pending timer", async () => {
		const { log, fs } = makeLog();
		log.record(entry({ t: AUG_7 }));
		await log.flush();
		fs.resetCounters();

		await vi.advanceTimersByTimeAsync(5000);
		expect(fs.writes).toEqual([]);
		expect(fs.appends).toEqual([]);
	});
});

describe("ReviewLog collision guard", () => {
	it("bumps the label when another install already owns the shard", async () => {
		const { log, fs } = makeLog();
		fs.seedShard("2026-08.pixel-10a.jsonl", "different-install", [entry({ t: AUG_7, c: "os-theirs" })]);

		log.record(entry({ t: AUG_7 + 1000, c: "os-ours" }));
		await log.flush();

		expect(fs.folderContents()).toEqual([
			"2026-08.pixel-10a-2.jsonl",
			"2026-08.pixel-10a.jsonl",
		]);
		expect(parseHeader(fs.linesOf("2026-08.pixel-10a-2.jsonl")[0] ?? "")).toMatchObject({
			device: "pixel-10a-2",
			install: INSTALL,
		});
	});

	it("loses no data when the label bumps — both shards read back", async () => {
		const { log, fs } = makeLog();
		fs.seedShard("2026-08.pixel-10a.jsonl", "different-install", [entry({ t: AUG_7, c: "os-theirs" })]);

		log.record(entry({ t: AUG_7 + 1000, c: "os-ours" }));
		await log.flush();

		expect((await log.readAll()).map((e) => e.c)).toEqual(["os-theirs", "os-ours"]);
	});

	it("bumps again when -2 is also taken by a third install", async () => {
		const { log, fs } = makeLog();
		fs.seedShard("2026-08.pixel-10a.jsonl", "install-b", []);
		fs.seedShard("2026-08.pixel-10a-2.jsonl", "install-c", []);

		log.record(entry({ t: AUG_7 }));
		await log.flush();

		expect(fs.folderContents()).toContain("2026-08.pixel-10a-3.jsonl");
	});

	it("appends to its own shard rather than bumping", async () => {
		const { log, fs } = makeLog();
		fs.seedShard("2026-08.pixel-10a.jsonl", INSTALL, [entry({ t: AUG_7, c: "os-earlier" })]);

		log.record(entry({ t: AUG_7 + 1000, c: "os-later" }));
		await log.flush();

		expect(fs.folderContents()).toEqual(["2026-08.pixel-10a.jsonl"]);
		expect(fs.linesOf("2026-08.pixel-10a.jsonl")).toHaveLength(3);
	});

	it("adopts a headerless shard rather than orphaning it", async () => {
		const { log, fs } = makeLog();
		fs.files.set(`${FOLDER}/2026-08.pixel-10a.jsonl`, `${serializeEntry(entry({ t: AUG_7, c: "os-old" }))}\n`);
		fs.folders.add(FOLDER);

		log.record(entry({ t: AUG_7 + 1000, c: "os-new" }));
		await log.flush();

		expect(fs.folderContents()).toEqual(["2026-08.pixel-10a.jsonl"]);
		expect(fs.linesOf("2026-08.pixel-10a.jsonl")).toHaveLength(2);
	});

	it("resolves the label once per month, not once per flush", async () => {
		const { log, fs } = makeLog();
		fs.seedShard("2026-08.pixel-10a.jsonl", "different-install", []);

		log.record(entry({ t: AUG_7 }));
		await log.flush();
		fs.resetCounters();

		log.record(entry({ t: AUG_7 + 1000 }));
		await log.flush();
		expect(fs.reads).toEqual([]);
	});
});

describe("ReviewLog reads", () => {
	it("unions every device's shard, ordered by timestamp", async () => {
		const { log, fs } = makeLog();
		fs.seedShard("2026-08.sawyers-macbook.jsonl", "desktop-install", [
			entry({ t: AUG_7 + 3000, c: "os-desk" }),
		]);
		fs.seedShard("2026-08.pixel-10a.jsonl", "phone-install", [
			entry({ t: AUG_7 + 1000, c: "os-phone" }),
		]);
		fs.seedShard("2026-07.sawyers-macbook.jsonl", "desktop-install", [
			entry({ t: new Date(2026, 6, 20, 9, 0).getTime(), c: "os-july" }),
		]);

		expect((await log.readAll()).map((e) => e.c)).toEqual(["os-july", "os-phone", "os-desk"]);
	});

	it("includes entries still buffered, so mid-session stats are current", async () => {
		const { log, fs } = makeLog();
		fs.seedShard("2026-08.pixel-10a.jsonl", INSTALL, [entry({ t: AUG_7, c: "os-flushed" })]);

		log.record(entry({ t: AUG_7 + 1000, c: "os-buffered" }));

		expect((await log.readAll()).map((e) => e.c)).toEqual(["os-flushed", "os-buffered"]);
	});

	it("counts a just-flushed entry exactly once", async () => {
		const { log } = makeLog();
		log.record(entry({ t: AUG_7, c: "os-a1" }));
		await log.flush();

		expect(await log.readAll()).toHaveLength(1);
	});

	it("ignores files in the folder that are not shards", async () => {
		const { log, fs } = makeLog();
		fs.seedShard("2026-08.pixel-10a.jsonl", INSTALL, [entry({ t: AUG_7, c: "os-a1" })]);
		fs.files.set(`${FOLDER}/README.md`, "Notes about my review log");
		fs.files.set(`${FOLDER}/rollup.json`, "{}");

		expect(await log.readAll()).toHaveLength(1);
	});

	it("returns nothing when the folder does not exist yet", async () => {
		const { log } = makeLog();
		expect(await log.readAll()).toEqual([]);
	});

	it("skips an unreadable shard rather than failing the whole read", async () => {
		const { log, fs } = makeLog();
		fs.seedShard("2026-08.pixel-10a.jsonl", INSTALL, [entry({ t: AUG_7, c: "os-good" })]);
		// A listed file that cannot be read — deleted between list and read.
		fs.files.set(`${FOLDER}/2026-07.ghost.jsonl`, "");
		fs.files.delete(`${FOLDER}/2026-07.ghost.jsonl`);
		fs.files.set(`${FOLDER}/2026-06.ghost.jsonl`, "x");
		fs.files.delete(`${FOLDER}/2026-06.ghost.jsonl`);

		expect(await log.readAll()).toHaveLength(1);
	});
});

describe("ReviewLog rollup cache", () => {
	it("does not parse any shard on construction", async () => {
		const fs = new FakeFs();
		fs.seedShard("2026-08.pixel-10a.jsonl", INSTALL, [entry({ t: AUG_7, c: "os-a1" })]);

		const { log } = makeLog({ fs });
		log.cachedRollup();

		// Plugin start must not pay for a year of history.
		expect(fs.reads).toEqual([]);
		await Promise.resolve();
	});

	it("aggregates shards into day buckets on demand", async () => {
		const { log, fs } = makeLog();
		fs.seedShard("2026-08.pixel-10a.jsonl", INSTALL, [
			entry({ t: AUG_7, e: 1000 }),
			entry({ t: AUG_7 + 1000, e: 500 }),
		]);

		const rollup = await log.getRollup();
		expect(rollup["2026-08-07"]).toMatchObject({ reviews: 2, timeMs: 1500 });
	});

	it("sums the same day across two devices' shards", async () => {
		const { log, fs } = makeLog();
		fs.seedShard("2026-08.pixel-10a.jsonl", "phone", [entry({ t: AUG_7, e: 1000 })]);
		fs.seedShard("2026-08.sawyers-macbook.jsonl", "desk", [entry({ t: AUG_7 + 5000, e: 2000 })]);

		expect(await log.getRollup()).toMatchObject({
			"2026-08-07": { reviews: 2, timeMs: 3000 },
		});
	});

	it("re-parses nothing when no shard changed", async () => {
		const { log, fs } = makeLog();
		fs.seedShard("2026-08.pixel-10a.jsonl", INSTALL, [entry({ t: AUG_7 })]);
		await log.getRollup();
		fs.resetCounters();

		await log.getRollup();
		expect(fs.reads).toEqual([]);
	});

	it("re-parses a shard another device appended to", async () => {
		const { log, fs } = makeLog();
		fs.seedShard("2026-08.sawyers-macbook.jsonl", "desk", [entry({ t: AUG_7 })]);
		expect((await log.getRollup())["2026-08-07"]?.reviews).toBe(1);

		fs.seedShard("2026-08.sawyers-macbook.jsonl", "desk", [
			entry({ t: AUG_7 }),
			entry({ t: AUG_7 + 1000 }),
		]);
		expect((await log.getRollup())["2026-08-07"]?.reviews).toBe(2);
	});

	it("forgets a shard that disappeared", async () => {
		const { log, fs } = makeLog();
		fs.seedShard("2026-08.sawyers-macbook.jsonl", "desk", [entry({ t: AUG_7 })]);
		expect((await log.getRollup())["2026-08-07"]?.reviews).toBe(1);

		fs.files.delete(`${FOLDER}/2026-08.sawyers-macbook.jsonl`);
		expect(await log.getRollup()).toEqual({});
	});

	it("folds its own appends in without re-parsing the shard", async () => {
		const { log, fs } = makeLog();
		log.record(entry({ t: AUG_7, e: 1000 }));
		await log.flush();
		await log.getRollup();
		fs.resetCounters();

		log.record(entry({ t: AUG_7 + 1000, e: 250 }));
		await log.flush();

		expect(fs.reads).toEqual([]);
		expect((await log.getRollup())["2026-08-07"]).toMatchObject({ reviews: 2, timeMs: 1250 });
	});

	it("counts pre-existing entries when appending to an uncached shard", async () => {
		// Cache cleared (new device, cleared storage) but the shard has history:
		// folding only the new entries under a fresh fingerprint would hide it.
		const { log, fs } = makeLog();
		fs.seedShard("2026-08.pixel-10a.jsonl", INSTALL, [
			entry({ t: AUG_7, c: "os-a1" }),
			entry({ t: AUG_7 + 1000, c: "os-b2" }),
		]);

		log.record(entry({ t: AUG_7 + 2000, c: "os-c3" }));
		await log.flush();

		expect((await log.getRollup())["2026-08-07"]?.reviews).toBe(3);
	});

	it("counts buffered entries that have not reached a shard", async () => {
		const { log } = makeLog();
		log.record(entry({ t: AUG_7, e: 800 }));

		expect(log.cachedRollup()["2026-08-07"]).toMatchObject({ reviews: 1, timeMs: 800 });
		expect((await log.getRollup())["2026-08-07"]).toMatchObject({ reviews: 1 });
	});

	it("survives a plugin restart without re-parsing", async () => {
		const fs = new FakeFs();
		const cache = new FakeCacheStore();
		const first = makeLog({ fs, cache });
		first.log.record(entry({ t: AUG_7, e: 1000 }));
		await first.log.flush();
		await first.log.getRollup();

		// Restart: same vault, same local cache, fresh instance.
		const second = makeLog({ fs, cache });
		expect(second.log.cachedRollup()["2026-08-07"]).toMatchObject({ reviews: 1, timeMs: 1000 });
		expect(fs.reads.length).toBeGreaterThanOrEqual(0);
		second.fs.resetCounters();
	});

	it("never writes the cache into the shard folder", async () => {
		const { log, fs, cache } = makeLog();
		log.record(entry({ t: AUG_7 }));
		await log.flush();
		await log.getRollup();

		expect(fs.folderContents()).toEqual(["2026-08.pixel-10a.jsonl"]);
		expect(cache.saves).toBeGreaterThan(0);
		expect(cache.peek()).not.toBeNull();
	});

	it("rebuilds from the shards when the stored cache is junk", async () => {
		const fs = new FakeFs();
		fs.seedShard("2026-08.pixel-10a.jsonl", INSTALL, [entry({ t: AUG_7 })]);
		const cache = new FakeCacheStore({ v: 99, shards: "not an object" });

		const { log } = makeLog({ fs, cache });
		expect(log.cachedRollup()).toEqual({});
		expect((await log.getRollup())["2026-08-07"]?.reviews).toBe(1);
	});
});

describe("ReviewLog.discardBuffered", () => {
	it("drops a buffered entry so an undone review is never written", async () => {
		const { log, fs } = makeLog();
		log.record(entry({ t: AUG_7, c: "os-a1" }));
		log.record(entry({ t: AUG_7 + 1000, c: "os-b2" }));

		expect(log.discardBuffered("os-a1")).toBe(true);
		await log.flush();

		expect(fs.linesOf("2026-08.pixel-10a.jsonl")).toHaveLength(2); // header + os-b2
		expect((await log.readAll()).map((e) => e.c)).toEqual(["os-b2"]);
	});

	it("drops only the most recent entry for that card", async () => {
		const { log } = makeLog();
		log.record(entry({ t: AUG_7, c: "os-a1", r: 1 }));
		log.record(entry({ t: AUG_7 + 1000, c: "os-a1", r: 3 }));

		expect(log.discardBuffered("os-a1")).toBe(true);
		expect((await log.readAll()).map((e) => e.r)).toEqual([1]);
	});

	it("reports false once the entry has been flushed", async () => {
		const { log } = makeLog();
		log.record(entry({ t: AUG_7, c: "os-a1" }));
		await log.flush();

		// A review that reached disk happened; the shard stays append-only.
		expect(log.discardBuffered("os-a1")).toBe(false);
		expect(await log.readAll()).toHaveLength(1);
	});

	it("reports false for a card that was never recorded", () => {
		const { log } = makeLog();
		expect(log.discardBuffered("os-unknown")).toBe(false);
	});
});

describe("ReviewLog.moveFolder", () => {
	it("moves existing shards into the new folder", async () => {
		const fs = new FakeFs();
		fs.seedShard("2026-08.pixel-10a.jsonl", INSTALL, [entry({ t: AUG_7, c: "os-a1" })]);
		fs.seedShard("2026-07.pixel-10a.jsonl", INSTALL, [entry({ t: new Date(2026, 6, 5, 9, 0).getTime() })]);
		const { log, config } = makeLog({ fs });

		await log.moveFolder(FOLDER, "Study/History");
		config.folder = "Study/History";

		expect(fs.files.has("Study/History/2026-08.pixel-10a.jsonl")).toBe(true);
		expect(fs.files.has("Study/History/2026-07.pixel-10a.jsonl")).toBe(true);
		expect(fs.files.has(`${FOLDER}/2026-08.pixel-10a.jsonl`)).toBe(false);
		expect(await log.readAll()).toHaveLength(2);
	});

	it("leaves non-shard files where the user put them", async () => {
		const fs = new FakeFs();
		fs.seedShard("2026-08.pixel-10a.jsonl", INSTALL, [entry({ t: AUG_7 })]);
		fs.files.set(`${FOLDER}/README.md`, "Why this folder exists");
		const { log } = makeLog({ fs });

		await log.moveFolder(FOLDER, "Study/History");

		expect(fs.files.has(`${FOLDER}/README.md`)).toBe(true);
		expect(fs.files.has("Study/History/README.md")).toBe(false);
	});

	it("keeps appending to the moved shard rather than starting a new one", async () => {
		const fs = new FakeFs();
		fs.seedShard("2026-08.pixel-10a.jsonl", INSTALL, [entry({ t: AUG_7, c: "os-a1" })]);
		const { log, config } = makeLog({ fs });

		await log.moveFolder(FOLDER, "Study/History");
		config.folder = "Study/History";
		log.record(entry({ t: AUG_7 + 1000, c: "os-b2" }));
		await log.flush();

		expect((await log.readAll()).map((e) => e.c)).toEqual(["os-a1", "os-b2"]);
	});

	it("keeps the rollup correct after a move", async () => {
		const fs = new FakeFs();
		fs.seedShard("2026-08.pixel-10a.jsonl", INSTALL, [entry({ t: AUG_7, e: 900 })]);
		const { log, config } = makeLog({ fs });
		await log.getRollup();

		await log.moveFolder(FOLDER, "Study/History");
		config.folder = "Study/History";

		expect((await log.getRollup())["2026-08-07"]).toMatchObject({ reviews: 1, timeMs: 900 });
	});

	it("does nothing when the folder is unchanged", async () => {
		const fs = new FakeFs();
		fs.seedShard("2026-08.pixel-10a.jsonl", INSTALL, [entry({ t: AUG_7 })]);
		const { log } = makeLog({ fs });

		await log.moveFolder(FOLDER, FOLDER);
		expect(fs.folderContents()).toEqual(["2026-08.pixel-10a.jsonl"]);
	});

	it("does nothing when there is nothing to move", async () => {
		const { log, fs } = makeLog();
		await log.moveFolder(FOLDER, "Study/History");
		expect(fs.folderContents()).toEqual([]);
	});
});

describe("normalizeCache", () => {
	it("accepts a cache it wrote itself", () => {
		const cache: ReviewLogCache = {
			v: 1,
			shards: {
				"2026-08.pixel-10a.jsonl": {
					mtime: 5000,
					size: 240,
					days: aggregateRollup([entry({ t: AUG_7 })]),
				},
			},
		};
		expect(normalizeCache(JSON.parse(JSON.stringify(cache)) as unknown)).toEqual(cache);
	});

	it("discards a cache from an unknown version", () => {
		expect(normalizeCache({ v: 99, shards: { "2026-08.pixel-10a.jsonl": {} } })).toEqual({
			v: 1,
			shards: {},
		});
	});

	it("discards anything that is not a cache", () => {
		for (const junk of [null, undefined, "", 42, [], "{}"]) {
			expect(normalizeCache(junk)).toEqual({ v: 1, shards: {} });
		}
	});

	it("drops entries keyed by something that is not a shard name", () => {
		const result = normalizeCache({
			v: 1,
			shards: { "notes.md": { mtime: 1, size: 1, days: {} } },
		});
		expect(result.shards).toEqual({});
	});

	it("drops shards with an unusable fingerprint", () => {
		const result = normalizeCache({
			v: 1,
			shards: { "2026-08.pixel-10a.jsonl": { mtime: "soon", size: 1, days: {} } },
		});
		expect(result.shards).toEqual({});
	});

	it("coerces missing and nonsense counts to zero", () => {
		const result = normalizeCache({
			v: 1,
			shards: {
				"2026-08.pixel-10a.jsonl": {
					mtime: 1,
					size: 1,
					days: {
						"2026-08-07": {
							reviews: -5,
							timeMs: null,
							byRating: { 1: 2, 3: "many" },
							byState: {},
						},
					},
				},
			},
		});

		expect(result.shards["2026-08.pixel-10a.jsonl"]?.days["2026-08-07"]).toEqual({
			reviews: 0,
			timeMs: 0,
			byRating: { 1: 2, 2: 0, 3: 0, 4: 0 },
			byState: { new: 0, learning: 0, review: 0, relearning: 0 },
			byMode: { sequential: 0, contextual: 0, spatial: 0 },
		});
	});
});

describe("normalizeLogFolder", () => {
	const FALLBACK = "Osmosis/Reviews";

	it("keeps a well-formed path unchanged", () => {
		expect(normalizeLogFolder("Study/History", FALLBACK)).toBe("Study/History");
	});

	it("trims surrounding whitespace", () => {
		expect(normalizeLogFolder("  Study/History  ", FALLBACK)).toBe("Study/History");
	});

	it("strips leading and trailing slashes", () => {
		expect(normalizeLogFolder("/Study/History/", FALLBACK)).toBe("Study/History");
	});

	it("collapses empty segments", () => {
		expect(normalizeLogFolder("Study//History", FALLBACK)).toBe("Study/History");
	});

	it("trims whitespace inside segments", () => {
		expect(normalizeLogFolder("Study / History", FALLBACK)).toBe("Study/History");
	});

	it("falls back rather than aiming the log at the vault root", () => {
		expect(normalizeLogFolder("", FALLBACK)).toBe(FALLBACK);
		expect(normalizeLogFolder("   ", FALLBACK)).toBe(FALLBACK);
		expect(normalizeLogFolder("/", FALLBACK)).toBe(FALLBACK);
		expect(normalizeLogFolder("///", FALLBACK)).toBe(FALLBACK);
	});
});
