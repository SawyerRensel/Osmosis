// @vitest-environment jsdom
// ReviewLog debounces its flush via window.setTimeout, matching ScheduleStore
// (Obsidian runs in a browser context and popout windows need window timers).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	MATURE_INTERVAL_SECONDS,
	SHARD_EXTENSION,
	SHARD_FENCE_TAG,
	SHARD_FORMAT_VERSION,
	ReviewLog,
	aggregateAnswerButtons,
	aggregateRollup,
	cardIntervalDays,
	classifyReview,
	dayKey,
	deviceLabelCandidate,
	isReviewLogPath,
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
	shardPreamble,
	slugifyDeviceLabel,
	summarizeShardSource,
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
	pi: 172_800,
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
			',"iv":345600,"pi":172800,"st":12.3,"d":6.4,"e":4200,"m":"sequential"}',
		);
	});

	it("defaults a prior interval the writer left out to zero", () => {
		// A card with no schedule going in has no prior interval, and a
		// hand-edited line that lost the field must not read as a huge one.
		expect(parseEntry('{"t":1754500000000,"c":"os-a1","r":3}')?.pi).toBe(0);
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
			pi: 0,
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

	it("reads a whole Markdown shard without changing", () => {
		// The point of the Markdown wrapper: `parseShard` needed no edit at all.
		// The preamble and the fence opener parse as neither a header nor an
		// entry, so its existing tolerance drops them and still finds the header.
		const text =
			shardPreamble("2026-08", "pixel-10a")
			+ serializeHeader({ device: "pixel-10a", install: "a3f9", v: 2 })
			+ "\n"
			+ serializeEntry(baseEntry)
			+ "\n";

		const shard = parseShard(text);
		expect(shard.header).toEqual({ device: "pixel-10a", install: "a3f9", v: 2 });
		expect(shard.entries).toEqual([baseEntry]);
	});

	it("skips a stray closing fence a hand-edit left behind", () => {
		const text =
			shardPreamble("2026-08", "pixel-10a")
			+ serializeHeader({ device: "d", install: "i", v: 2 })
			+ "\n"
			+ serializeEntry(baseEntry)
			+ "\n```\n";

		expect(parseShard(text).entries).toEqual([baseEntry]);
	});
});

describe("shard file shape", () => {
	it("opens with a readable line and an unclosed fence", () => {
		// Unclosed on purpose: CommonMark runs it to the end of the document, so
		// the file is well-formed at every moment *and* every write stays a pure
		// append. A terminator would have to move on each flush.
		const preamble = shardPreamble("2026-08", "pixel-10a");
		expect(preamble).toContain("pixel-10a");
		expect(preamble).toContain("2026-08");
		expect(preamble).toContain("do not edit");
		expect(preamble.trimEnd().endsWith(`\`\`\`${SHARD_FENCE_TAG}`)).toBe(true);
		expect(preamble).not.toContain("\n```\n");
	});

	it("does not claim the fence tag the flashcard processor owns", () => {
		expect(SHARD_FENCE_TAG).not.toBe("osmosis");
	});

	it("names shards with the configured extension", () => {
		expect(SHARD_EXTENSION).toBe(".md");
		expect(shardFileName("2026-08", "pixel-10a").endsWith(SHARD_EXTENSION)).toBe(true);
	});
});

describe("summarizeShardSource", () => {
	const source = (entries: number) =>
		serializeHeader({ device: "pixel-10a", install: "a3f9", v: 2 })
		+ "\n"
		+ Array.from({ length: entries }, (_, i) => serializeEntry(entry({ t: 1000 + i })) + "\n").join("");

	it("reads the header and counts the entries behind it", () => {
		const summary = summarizeShardSource(source(3));
		expect(summary.header).toMatchObject({ device: "pixel-10a", v: 2 });
		expect(summary.entries).toBe(3);
	});

	it("counts every line when there is no header to discount", () => {
		expect(summarizeShardSource(`${serializeEntry(baseEntry)}\n`).entries).toBe(1);
	});

	it("is empty for an empty fence", () => {
		expect(summarizeShardSource("")).toEqual({ header: null, entries: 0 });
		expect(summarizeShardSource("\n\n")).toEqual({ header: null, entries: 0 });
	});

	it("counts a last line with no trailing newline", () => {
		expect(summarizeShardSource(source(2).trimEnd()).entries).toBe(2);
	});

	it("never parses an entry line", () => {
		// It is handed the whole ~1.8 MB body on every open; a parse per line
		// would cost 100 ms+ to display one number.
		const parse = JSON.parse.bind(JSON);
		let calls = 0;
		JSON.parse = ((text: string) => {
			calls += 1;
			return parse(text) as unknown;
		}) as typeof JSON.parse;
		try {
			summarizeShardSource(source(500));
		} finally {
			JSON.parse = parse;
		}
		// Exactly one: the header line.
		expect(calls).toBe(1);
	});
});

describe("isReviewLogPath", () => {
	it("matches the folder itself and everything under it", () => {
		expect(isReviewLogPath("Osmosis/Reviews", "Osmosis/Reviews")).toBe(true);
		expect(isReviewLogPath("Osmosis/Reviews/2026-08.pixel-10a.md", "Osmosis/Reviews")).toBe(true);
		expect(isReviewLogPath("Osmosis/Reviews/archive/old.md", "Osmosis/Reviews")).toBe(true);
	});

	it("does not match a same-named folder somewhere else", () => {
		expect(isReviewLogPath("Archive/Osmosis/Reviews/x.md", "Osmosis/Reviews")).toBe(false);
	});

	it("does not treat a name prefix as the folder", () => {
		expect(isReviewLogPath("Osmosis/ReviewsOld/x.md", "Osmosis/Reviews")).toBe(false);
	});

	it("matches nothing when no folder is configured", () => {
		expect(isReviewLogPath("anything.md", "")).toBe(false);
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
		expect(shardFileName("2026-08", "pixel-10a")).toBe("2026-08.pixel-10a.md");
	});

	it("round-trips through the parser", () => {
		expect(parseShardFileName("2026-07.sawyers-macbook.md")).toEqual({
			month: "2026-07",
			device: "sawyers-macbook",
		});
	});

	it("ignores files that are not shards", () => {
		expect(parseShardFileName("notes.md")).toBeNull();
		expect(parseShardFileName("2026-08.md")).toBeNull();
		expect(parseShardFileName("2026-8.pixel.md")).toBeNull();
		expect(parseShardFileName("2026-08.Pixel.md")).toBeNull();
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

	it("splits counts and time by review class", () => {
		const rollup = aggregateRollup([
			entry({ t: day(9), s: "learning", pi: 0, e: 3000 }),
			entry({ t: day(10), s: "review", pi: MATURE_INTERVAL_SECONDS - 1, e: 5000 }),
			entry({ t: day(11), s: "review", pi: MATURE_INTERVAL_SECONDS, e: 1000 }),
			entry({ t: day(12), s: "relearning", pi: MATURE_INTERVAL_SECONDS * 2, e: 7000 }),
		]);

		const bucket = rollup["2026-08-07"];
		expect(bucket?.byClass).toEqual({ learning: 1, young: 1, mature: 1, relearning: 1 });
		expect(bucket?.timeByClass).toEqual({
			learning: 3000,
			young: 5000,
			mature: 1000,
			relearning: 7000,
		});
	});

	it("keeps byClass totals equal to the day's review count", () => {
		const rollup = aggregateRollup([
			entry({ t: day(9), s: "learning" }),
			entry({ t: day(10), s: "review", pi: MATURE_INTERVAL_SECONDS * 4 }),
			entry({ t: day(11), s: "new" }),
		]);

		const bucket = rollup["2026-08-07"];
		const classTotal = Object.values(bucket?.byClass ?? {}).reduce((a, b) => a + b, 0);
		expect(classTotal).toBe(bucket?.reviews);
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

	it("sums the review-class split across shards", () => {
		const desktop = aggregateRollup([
			entry({ t: new Date(2026, 7, 7, 9, 0).getTime(), s: "review", pi: 86_400, e: 1000 }),
		]);
		const phone = aggregateRollup([
			entry({
				t: new Date(2026, 7, 7, 20, 0).getTime(),
				s: "review",
				pi: MATURE_INTERVAL_SECONDS,
				e: 500,
			}),
		]);

		const merged = mergeRollups([desktop, phone]);
		expect(merged["2026-08-07"]?.byClass).toEqual({
			learning: 0,
			young: 1,
			mature: 1,
			relearning: 0,
		});
		expect(merged["2026-08-07"]?.timeByClass).toEqual({
			learning: 0,
			young: 1000,
			mature: 500,
			relearning: 0,
		});
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

describe("classifyReview", () => {
	it("puts a review-state card either side of the 21-day line", () => {
		expect(classifyReview(entry({ s: "review", pi: MATURE_INTERVAL_SECONDS - 1 }))).toBe("young");
		expect(classifyReview(entry({ s: "review", pi: MATURE_INTERVAL_SECONDS }))).toBe("mature");
	});

	it("reads the interval the card was answered at, not the one it produced", () => {
		// A card sitting on two months, answered Good into six: mature either
		// way. A card sitting on three days, answered Easy into a month: young,
		// because that is what it was when it was recalled. `iv` would call the
		// second one mature and shift the graph a review early.
		expect(
			classifyReview(entry({ s: "review", pi: 3 * 86_400, iv: MATURE_INTERVAL_SECONDS * 2 })),
		).toBe("young");
	});

	it("classifies by state before interval for the learning states", () => {
		// A relearning card can carry a long interval; it is still relearning.
		expect(classifyReview(entry({ s: "relearning", pi: MATURE_INTERVAL_SECONDS * 10 }))).toBe(
			"relearning",
		);
		expect(classifyReview(entry({ s: "learning", pi: MATURE_INTERVAL_SECONDS * 10 }))).toBe(
			"learning",
		);
	});

	it("folds a hand-edited `new` post-state into learning", () => {
		expect(classifyReview(entry({ s: "new", pi: 0 }))).toBe("learning");
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
	it("splits ratings on the interval each card was answered at", () => {
		const counts = aggregateAnswerButtons([
			entry({ c: "os-young", r: 1, pi: 5 * 86_400 }),
			entry({ c: "os-young", r: 3, pi: 5 * 86_400 }),
			entry({ c: "os-mature", r: 4, pi: 60 * 86_400 }),
		]);

		expect(counts.young).toEqual({ 1: 1, 2: 0, 3: 1, 4: 0 });
		expect(counts.mature).toEqual({ 1: 0, 2: 0, 3: 0, 4: 1 });
	});

	it("treats the 21-day threshold as mature and a hair under it as young", () => {
		expect(aggregateAnswerButtons([entry({ r: 3, pi: MATURE_INTERVAL_SECONDS })]).mature[3])
			.toBe(1);
		expect(aggregateAnswerButtons([entry({ r: 3, pi: MATURE_INTERVAL_SECONDS - 1 })]).young[3])
			.toBe(1);
	});

	it("needs no card, so a deleted one takes nothing out of the graph", () => {
		// It used to join the store and drop what it could not resolve into an
		// `excluded` count. Maturity is on the entry now, so there is nothing to
		// resolve and nothing to exclude.
		const orphan = entry({ t: new Date(2026, 7, 7, 9, 0).getTime(), c: "os-deleted", pi: 0 });
		expect(aggregateRollup([orphan])["2026-08-07"]?.reviews).toBe(1);
		expect(aggregateAnswerButtons([orphan]).young[3]).toBe(1);
	});

	it("returns zeroed counts for an empty log", () => {
		expect(aggregateAnswerButtons([])).toEqual({
			young: { 1: 0, 2: 0, 3: 0, 4: 0 },
			mature: { 1: 0, 2: 0, 3: 0, 4: 0 },
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
		const parsed = parseShardFileName(name);
		const preamble = shardPreamble(parsed?.month ?? "2026-08", parsed?.device ?? "seeded");
		const header = serializeHeader({ device: "seeded", install, v: SHARD_FORMAT_VERSION });
		const lines = entries.map((e) => `${serializeEntry(e)}\n`).join("");
		this.files.set(`${FOLDER}/${name}`, `${preamble}${header}\n${lines}`);
		this.touch(`${FOLDER}/${name}`);
		this.folders.add(FOLDER);
	}

	/**
	 * The JSON lines of a shard: header first, then entries.
	 *
	 * The Markdown wrapper is dropped so these assertions stay about the log's
	 * contents. That the wrapper is *there* is asserted separately — see
	 * "wraps a new shard in Markdown".
	 */
	linesOf(name: string): string[] {
		return (this.files.get(`${FOLDER}/${name}`) ?? "")
			.split("\n")
			.map((line) => line.trim())
			.filter(
				(line) =>
					line !== "" && !line.startsWith("```") && !line.startsWith("Osmosis review log"),
			);
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

		const lines = fs.linesOf("2026-08.pixel-10a.md");
		expect(parseHeader(lines[0] ?? "")).toEqual({
			device: DEVICE,
			install: INSTALL,
			v: SHARD_FORMAT_VERSION,
		});
		expect(parseEntry(lines[1] ?? "")).toMatchObject({ c: "os-a1" });
	});

	it("does not re-queue entries that already reached disk", async () => {
		const cache = new FakeCacheStore();
		const { log, fs } = makeLog({ cache });
		// A localStorage quota error is the realistic version of this: the
		// rollup fold runs *after* the append, so by the time it throws the
		// entry is on disk. Re-buffering it would append it a second time.
		cache.save = () => {
			throw new Error("QuotaExceededError");
		};

		log.record(entry({ t: AUG_7, c: "os-a1" }));
		await log.flush();
		expect(fs.appends).toHaveLength(0);
		expect(parseShard(fs.files.get(`${FOLDER}/2026-08.pixel-10a.md`) ?? "").entries).toHaveLength(1);

		// Nothing is left buffered, so a later flush writes nothing at all.
		await log.flush();
		expect(fs.appends).toHaveLength(0);
		expect(parseShard(fs.files.get(`${FOLDER}/2026-08.pixel-10a.md`) ?? "").entries).toHaveLength(1);
	});

	it("wraps a new shard in Markdown, and never closes the fence", async () => {
		const { log, fs } = makeLog();
		log.record(entry({ t: AUG_7, c: "os-a1" }));
		await log.flush();

		const text = fs.files.get(`${FOLDER}/2026-08.pixel-10a.md`) ?? "";
		expect(text.startsWith("Osmosis review log — pixel-10a, 2026-08.")).toBe(true);
		expect(text).toContain(`\`\`\`${SHARD_FENCE_TAG}\n`);
		// Exactly one fence line: the opener. A closing fence would have to move
		// on every flush, which is the whole-file rewrite appends exist to avoid.
		expect(text.split("\n").filter((line) => line.startsWith("```"))).toHaveLength(1);
	});

	it("appends without rewriting the wrapper", async () => {
		const { log, fs } = makeLog();
		log.record(entry({ t: AUG_7, c: "os-a1" }));
		await log.flush();
		log.record(entry({ t: AUG_7 + 1000, c: "os-b2" }));
		await log.flush();

		const text = fs.files.get(`${FOLDER}/2026-08.pixel-10a.md`) ?? "";
		expect(text.split("\n").filter((line) => line.startsWith("```"))).toHaveLength(1);
		expect(fs.writes).toHaveLength(1);
		expect(fs.appends).toHaveLength(1);
		expect(parseShard(text).entries.map((e) => e.c)).toEqual(["os-a1", "os-b2"]);
	});

	it("records the prior interval a review was answered at", async () => {
		const { log, fs } = makeLog();
		log.record(entry({ t: AUG_7, c: "os-a1", pi: MATURE_INTERVAL_SECONDS * 2 }));
		await log.flush();

		const text = fs.files.get(`${FOLDER}/2026-08.pixel-10a.md`) ?? "";
		expect(parseShard(text).entries[0]?.pi).toBe(MATURE_INTERVAL_SECONDS * 2);
		expect(parseShard(text).header?.v).toBe(2);
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
		expect(fs.appends).toEqual([`${FOLDER}/2026-08.pixel-10a.md`]);
		expect(fs.linesOf("2026-08.pixel-10a.md")).toHaveLength(4);
	});

	it("writes one entry per answer", async () => {
		const { log, fs } = makeLog();
		for (let i = 0; i < 12; i++) {
			log.record(entry({ t: AUG_7 + i * 1000, c: `os-${String(i)}` }));
		}
		await log.flush();

		expect(fs.linesOf("2026-08.pixel-10a.md")).toHaveLength(13); // + header
	});

	it("splits a session that crosses a month boundary across two shards", async () => {
		const { log, fs } = makeLog();
		log.record(entry({ t: new Date(2026, 6, 31, 23, 59).getTime(), c: "os-jul" }));
		log.record(entry({ t: new Date(2026, 7, 1, 0, 1).getTime(), c: "os-aug" }));
		await log.flush();

		expect(fs.folderContents()).toEqual([
			"2026-07.pixel-10a.md",
			"2026-08.pixel-10a.md",
		]);
	});

	it("writes nothing when nothing was recorded", async () => {
		const { log, fs } = makeLog();
		await log.flush();
		expect(fs.folderContents()).toEqual([]);
	});

	it("re-buffers entries when the write fails, so the next flush retries", async () => {
		const { log, fs } = makeLog();
		const path = `${FOLDER}/2026-08.pixel-10a.md`;
		fs.failWrites.add(path);
		vi.spyOn(console, "error").mockImplementation(() => undefined);

		log.record(entry({ t: AUG_7, c: "os-a1" }));
		await log.flush();
		expect(log.hasPendingWrites()).toBe(true);

		fs.failWrites.delete(path);
		await log.flush();
		expect(log.hasPendingWrites()).toBe(false);
		expect(fs.linesOf("2026-08.pixel-10a.md")).toHaveLength(2);
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
		expect(fs.linesOf("2026-08.pixel-10a.md")).toHaveLength(2);
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
		expect(fs.linesOf("2026-08.pixel-10a.md")).toHaveLength(6);
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
		fs.seedShard("2026-08.pixel-10a.md", "different-install", [entry({ t: AUG_7, c: "os-theirs" })]);

		log.record(entry({ t: AUG_7 + 1000, c: "os-ours" }));
		await log.flush();

		expect(fs.folderContents()).toEqual([
			"2026-08.pixel-10a-2.md",
			"2026-08.pixel-10a.md",
		]);
		expect(parseHeader(fs.linesOf("2026-08.pixel-10a-2.md")[0] ?? "")).toMatchObject({
			device: "pixel-10a-2",
			install: INSTALL,
		});
	});

	it("loses no data when the label bumps — both shards read back", async () => {
		const { log, fs } = makeLog();
		fs.seedShard("2026-08.pixel-10a.md", "different-install", [entry({ t: AUG_7, c: "os-theirs" })]);

		log.record(entry({ t: AUG_7 + 1000, c: "os-ours" }));
		await log.flush();

		// Shard order, not timestamp order — `scan` walks files, and `-2` sorts
		// before `.` in a filename. Every aggregate it feeds is order-independent.
		expect((await collect(log)).map((e) => e.c).sort()).toEqual(["os-ours", "os-theirs"]);
	});

	it("bumps again when -2 is also taken by a third install", async () => {
		const { log, fs } = makeLog();
		fs.seedShard("2026-08.pixel-10a.md", "install-b", []);
		fs.seedShard("2026-08.pixel-10a-2.md", "install-c", []);

		log.record(entry({ t: AUG_7 }));
		await log.flush();

		expect(fs.folderContents()).toContain("2026-08.pixel-10a-3.md");
	});

	it("appends to its own shard rather than bumping", async () => {
		const { log, fs } = makeLog();
		fs.seedShard("2026-08.pixel-10a.md", INSTALL, [entry({ t: AUG_7, c: "os-earlier" })]);

		log.record(entry({ t: AUG_7 + 1000, c: "os-later" }));
		await log.flush();

		expect(fs.folderContents()).toEqual(["2026-08.pixel-10a.md"]);
		expect(fs.linesOf("2026-08.pixel-10a.md")).toHaveLength(3);
	});

	it("adopts a headerless shard rather than orphaning it", async () => {
		const { log, fs } = makeLog();
		fs.files.set(`${FOLDER}/2026-08.pixel-10a.md`, `${serializeEntry(entry({ t: AUG_7, c: "os-old" }))}\n`);
		fs.folders.add(FOLDER);

		log.record(entry({ t: AUG_7 + 1000, c: "os-new" }));
		await log.flush();

		expect(fs.folderContents()).toEqual(["2026-08.pixel-10a.md"]);
		expect(fs.linesOf("2026-08.pixel-10a.md")).toHaveLength(2);
	});

	it("resolves the label once per month, not once per flush", async () => {
		const { log, fs } = makeLog();
		fs.seedShard("2026-08.pixel-10a.md", "different-install", []);

		log.record(entry({ t: AUG_7 }));
		await log.flush();
		fs.resetCounters();

		log.record(entry({ t: AUG_7 + 1000 }));
		await log.flush();
		expect(fs.reads).toEqual([]);
	});
});

/** Everything `scan` visits, in the order it visits it. */
async function collect(
	log: ReviewLog,
	range?: { from?: string; to?: string },
): Promise<ReviewLogEntry[]> {
	const seen: ReviewLogEntry[] = [];
	await log.scan((entry) => seen.push(entry), range);
	return seen;
}

describe("ReviewLog.scan", () => {
	it("visits every device's shard, oldest month first", async () => {
		const { log, fs } = makeLog();
		fs.seedShard("2026-08.sawyers-macbook.md", "desktop-install", [
			entry({ t: AUG_7 + 3000, c: "os-desk" }),
		]);
		fs.seedShard("2026-08.pixel-10a.md", "phone-install", [
			entry({ t: AUG_7 + 1000, c: "os-phone" }),
		]);
		fs.seedShard("2026-07.sawyers-macbook.md", "desktop-install", [
			entry({ t: new Date(2026, 6, 20, 9, 0).getTime(), c: "os-july" }),
		]);

		expect((await collect(log)).map((e) => e.c)).toEqual(["os-july", "os-phone", "os-desk"]);
	});

	it("includes entries still buffered, so mid-session stats are current", async () => {
		const { log, fs } = makeLog();
		fs.seedShard("2026-08.pixel-10a.md", INSTALL, [entry({ t: AUG_7, c: "os-flushed" })]);

		log.record(entry({ t: AUG_7 + 1000, c: "os-buffered" }));

		expect((await collect(log)).map((e) => e.c)).toEqual(["os-flushed", "os-buffered"]);
	});

	it("visits a just-flushed entry exactly once", async () => {
		const { log } = makeLog();
		log.record(entry({ t: AUG_7, c: "os-a1" }));
		await log.flush();

		expect(await collect(log)).toHaveLength(1);
	});

	it("ignores files in the folder that are not shards", async () => {
		const { log, fs } = makeLog();
		fs.seedShard("2026-08.pixel-10a.md", INSTALL, [entry({ t: AUG_7, c: "os-a1" })]);
		fs.files.set(`${FOLDER}/README.md`, "Notes about my review log");
		fs.files.set(`${FOLDER}/rollup.json`, "{}");

		expect(await collect(log)).toHaveLength(1);
	});

	it("visits nothing when the folder does not exist yet", async () => {
		const { log } = makeLog();
		expect(await collect(log)).toEqual([]);
	});

	it("skips an unreadable shard rather than failing the whole scan", async () => {
		const { log, fs } = makeLog();
		fs.seedShard("2026-08.pixel-10a.md", INSTALL, [entry({ t: AUG_7, c: "os-good" })]);
		// A listed file that cannot be read — deleted between list and read.
		fs.files.set(`${FOLDER}/2026-07.ghost.md`, "");
		fs.files.delete(`${FOLDER}/2026-07.ghost.md`);
		fs.files.set(`${FOLDER}/2026-06.ghost.md`, "x");
		fs.files.delete(`${FOLDER}/2026-06.ghost.md`);

		expect(await collect(log)).toHaveLength(1);
	});

	it("opens only the shards inside a month range", async () => {
		// The whole point of pruning by month: a twelve-month view must not pay
		// to open five years of files.
		const { log, fs } = makeLog();
		for (const month of ["2026-05", "2026-06", "2026-07", "2026-08"]) {
			fs.seedShard(`${month}.pixel-10a.md`, INSTALL, [
				entry({ t: new Date(2026, Number(month.slice(5)) - 1, 10, 9, 0).getTime(), c: month }),
			]);
		}
		fs.resetCounters();

		const seen = await collect(log, { from: "2026-06", to: "2026-07" });
		expect(seen.map((e) => e.c)).toEqual(["2026-06", "2026-07"]);
		expect(fs.reads).toEqual([
			`${FOLDER}/2026-06.pixel-10a.md`,
			`${FOLDER}/2026-07.pixel-10a.md`,
		]);
	});

	it("leaves an open upper bound open", async () => {
		const { log, fs } = makeLog();
		fs.seedShard("2026-05.pixel-10a.md", INSTALL, [entry({ t: new Date(2026, 4, 10).getTime(), c: "old" })]);
		fs.seedShard("2026-08.pixel-10a.md", INSTALL, [entry({ t: AUG_7, c: "new" })]);

		expect((await collect(log, { from: "2026-06" })).map((e) => e.c)).toEqual(["new"]);
	});

	it("prunes buffered entries by month too", async () => {
		const { log, fs } = makeLog();
		fs.seedShard("2026-08.pixel-10a.md", INSTALL, []);
		log.record(entry({ t: new Date(2026, 4, 10, 9, 0).getTime(), c: "os-may" }));
		log.record(entry({ t: AUG_7, c: "os-august" }));

		expect((await collect(log, { from: "2026-08" })).map((e) => e.c)).toEqual(["os-august"]);
	});

	it("holds one shard at a time rather than the whole log", async () => {
		// The property the streaming pass exists for: peak memory is one shard,
		// whatever the history. Observed through the fs — a shard is read, fully
		// visited, and only then is the next one opened.
		const { log, fs } = makeLog();
		for (const month of ["2026-06", "2026-07", "2026-08"]) {
			fs.seedShard(`${month}.pixel-10a.md`, INSTALL, [
				entry({ t: new Date(2026, Number(month.slice(5)) - 1, 10, 9, 0).getTime(), c: month }),
			]);
		}
		fs.resetCounters();

		const order: string[] = [];
		await log.scan((e) => {
			order.push(`visit:${e.c}`);
		});
		const interleaved = fs.reads.map((path) => `read:${path.slice(FOLDER.length + 1, -3)}`);

		expect(order).toEqual(["visit:2026-06", "visit:2026-07", "visit:2026-08"]);
		expect(interleaved).toEqual(["read:2026-06.pixel-10a", "read:2026-07.pixel-10a", "read:2026-08.pixel-10a"]);
	});
});

describe("ReviewLog rollup cache", () => {
	it("does not parse any shard on construction", async () => {
		const fs = new FakeFs();
		fs.seedShard("2026-08.pixel-10a.md", INSTALL, [entry({ t: AUG_7, c: "os-a1" })]);

		const { log } = makeLog({ fs });
		log.cachedRollup();

		// Plugin start must not pay for a year of history.
		expect(fs.reads).toEqual([]);
		await Promise.resolve();
	});

	it("aggregates shards into day buckets on demand", async () => {
		const { log, fs } = makeLog();
		fs.seedShard("2026-08.pixel-10a.md", INSTALL, [
			entry({ t: AUG_7, e: 1000 }),
			entry({ t: AUG_7 + 1000, e: 500 }),
		]);

		const rollup = await log.getRollup();
		expect(rollup["2026-08-07"]).toMatchObject({ reviews: 2, timeMs: 1500 });
	});

	it("sums the same day across two devices' shards", async () => {
		const { log, fs } = makeLog();
		fs.seedShard("2026-08.pixel-10a.md", "phone", [entry({ t: AUG_7, e: 1000 })]);
		fs.seedShard("2026-08.sawyers-macbook.md", "desk", [entry({ t: AUG_7 + 5000, e: 2000 })]);

		expect(await log.getRollup()).toMatchObject({
			"2026-08-07": { reviews: 2, timeMs: 3000 },
		});
	});

	it("re-parses nothing when no shard changed", async () => {
		const { log, fs } = makeLog();
		fs.seedShard("2026-08.pixel-10a.md", INSTALL, [entry({ t: AUG_7 })]);
		await log.getRollup();
		fs.resetCounters();

		await log.getRollup();
		expect(fs.reads).toEqual([]);
	});

	it("re-parses a shard another device appended to", async () => {
		const { log, fs } = makeLog();
		fs.seedShard("2026-08.sawyers-macbook.md", "desk", [entry({ t: AUG_7 })]);
		expect((await log.getRollup())["2026-08-07"]?.reviews).toBe(1);

		fs.seedShard("2026-08.sawyers-macbook.md", "desk", [
			entry({ t: AUG_7 }),
			entry({ t: AUG_7 + 1000 }),
		]);
		expect((await log.getRollup())["2026-08-07"]?.reviews).toBe(2);
	});

	it("forgets a shard that disappeared", async () => {
		const { log, fs } = makeLog();
		fs.seedShard("2026-08.sawyers-macbook.md", "desk", [entry({ t: AUG_7 })]);
		expect((await log.getRollup())["2026-08-07"]?.reviews).toBe(1);

		fs.files.delete(`${FOLDER}/2026-08.sawyers-macbook.md`);
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
		fs.seedShard("2026-08.pixel-10a.md", INSTALL, [
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

		expect(fs.folderContents()).toEqual(["2026-08.pixel-10a.md"]);
		expect(cache.saves).toBeGreaterThan(0);
		expect(cache.peek()).not.toBeNull();
	});

	it("rebuilds from the shards when the stored cache is junk", async () => {
		const fs = new FakeFs();
		fs.seedShard("2026-08.pixel-10a.md", INSTALL, [entry({ t: AUG_7 })]);
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

		expect(fs.linesOf("2026-08.pixel-10a.md")).toHaveLength(2); // header + os-b2
		expect((await collect(log)).map((e) => e.c)).toEqual(["os-b2"]);
	});

	it("drops only the most recent entry for that card", async () => {
		const { log } = makeLog();
		log.record(entry({ t: AUG_7, c: "os-a1", r: 1 }));
		log.record(entry({ t: AUG_7 + 1000, c: "os-a1", r: 3 }));

		expect(log.discardBuffered("os-a1")).toBe(true);
		expect((await collect(log)).map((e) => e.r)).toEqual([1]);
	});

	it("reports false once the entry has been flushed", async () => {
		const { log } = makeLog();
		log.record(entry({ t: AUG_7, c: "os-a1" }));
		await log.flush();

		// A review that reached disk happened; the shard stays append-only.
		expect(log.discardBuffered("os-a1")).toBe(false);
		expect(await collect(log)).toHaveLength(1);
	});

	it("reports false for a card that was never recorded", () => {
		const { log } = makeLog();
		expect(log.discardBuffered("os-unknown")).toBe(false);
	});
});

describe("ReviewLog.moveFolder", () => {
	it("moves existing shards into the new folder", async () => {
		const fs = new FakeFs();
		fs.seedShard("2026-08.pixel-10a.md", INSTALL, [entry({ t: AUG_7, c: "os-a1" })]);
		fs.seedShard("2026-07.pixel-10a.md", INSTALL, [entry({ t: new Date(2026, 6, 5, 9, 0).getTime() })]);
		const { log, config } = makeLog({ fs });

		await log.moveFolder(FOLDER, "Study/History");
		config.folder = "Study/History";

		expect(fs.files.has("Study/History/2026-08.pixel-10a.md")).toBe(true);
		expect(fs.files.has("Study/History/2026-07.pixel-10a.md")).toBe(true);
		expect(fs.files.has(`${FOLDER}/2026-08.pixel-10a.md`)).toBe(false);
		expect(await collect(log)).toHaveLength(2);
	});

	it("leaves non-shard files where the user put them", async () => {
		const fs = new FakeFs();
		fs.seedShard("2026-08.pixel-10a.md", INSTALL, [entry({ t: AUG_7 })]);
		fs.files.set(`${FOLDER}/README.md`, "Why this folder exists");
		const { log } = makeLog({ fs });

		await log.moveFolder(FOLDER, "Study/History");

		expect(fs.files.has(`${FOLDER}/README.md`)).toBe(true);
		expect(fs.files.has("Study/History/README.md")).toBe(false);
	});

	it("keeps appending to the moved shard rather than starting a new one", async () => {
		const fs = new FakeFs();
		fs.seedShard("2026-08.pixel-10a.md", INSTALL, [entry({ t: AUG_7, c: "os-a1" })]);
		const { log, config } = makeLog({ fs });

		await log.moveFolder(FOLDER, "Study/History");
		config.folder = "Study/History";
		log.record(entry({ t: AUG_7 + 1000, c: "os-b2" }));
		await log.flush();

		expect((await collect(log)).map((e) => e.c)).toEqual(["os-a1", "os-b2"]);
	});

	it("keeps the rollup correct after a move", async () => {
		const fs = new FakeFs();
		fs.seedShard("2026-08.pixel-10a.md", INSTALL, [entry({ t: AUG_7, e: 900 })]);
		const { log, config } = makeLog({ fs });
		await log.getRollup();

		await log.moveFolder(FOLDER, "Study/History");
		config.folder = "Study/History";

		expect((await log.getRollup())["2026-08-07"]).toMatchObject({ reviews: 1, timeMs: 900 });
	});

	it("does nothing when the folder is unchanged", async () => {
		const fs = new FakeFs();
		fs.seedShard("2026-08.pixel-10a.md", INSTALL, [entry({ t: AUG_7 })]);
		const { log } = makeLog({ fs });

		await log.moveFolder(FOLDER, FOLDER);
		expect(fs.folderContents()).toEqual(["2026-08.pixel-10a.md"]);
	});

	it("does nothing when there is nothing to move", async () => {
		const { log, fs } = makeLog();
		await log.moveFolder(FOLDER, "Study/History");
		expect(fs.folderContents()).toEqual([]);
	});
});

describe("rollup cache size", () => {
	it("stays well inside localStorage after five heavy years", async () => {
		// The cache lives in `app.saveLocalStorage`, so its growth is a real
		// ceiling rather than a tidiness concern. A day bucket is 19 counters;
		// five years is ~1,825 of them. This is also the guard on ever keying a
		// bucket by day × hour, which would be ~13 MB and blow the quota.
		const { log, cache, fs } = makeLog();
		const byMonth = new Map<string, ReviewLogEntry[]>();

		for (let day = 0; day < 365 * 5; day++) {
			// One entry per day is enough: a bucket's size is fixed by its
			// counters, not by how many reviews landed in it.
			const t = new Date(2021, 7, 7 + day, 9, 0).getTime();
			const month = monthKey(t);
			const group = byMonth.get(month) ?? [];
			group.push(entry({ t, c: `os-${String(day)}` }));
			byMonth.set(month, group);
		}
		for (const [month, entries] of byMonth) {
			fs.seedShard(`${month}.pixel-10a.md`, INSTALL, entries);
		}

		await log.getRollup();

		// Every day really is in there — a ceiling met by caching nothing would
		// pass this test and tell us nothing.
		expect(Object.keys(log.cachedRollup())).toHaveLength(365 * 5);
		expect(JSON.stringify(cache.peek()).length).toBeLessThan(2_000_000);
	});
});

describe("normalizeCache", () => {
	it("accepts a cache it wrote itself", () => {
		const cache: ReviewLogCache = {
			v: 3,
			shards: {
				"2026-08.pixel-10a.md": {
					mtime: 5000,
					size: 240,
					days: aggregateRollup([entry({ t: AUG_7 })]),
				},
			},
		};
		expect(normalizeCache(JSON.parse(JSON.stringify(cache)) as unknown)).toEqual(cache);
	});

	it("discards a cache from an unknown version", () => {
		expect(normalizeCache({ v: 99, shards: { "2026-08.pixel-10a.md": {} } })).toEqual({
			v: 3,
			shards: {},
		});
	});

	// A v2 cache holds correctly-shaped but wrongly-classified `byClass` counts:
	// it was built when `classifyReview` read `iv`. Discarding costs one
	// re-parse; keeping it would leave the Reviews graph quietly wrong.
	it("discards a cache from a previous version", () => {
		expect(normalizeCache({ v: 2, shards: { "2026-08.pixel-10a.md": {} } })).toEqual({
			v: 3,
			shards: {},
		});
	});

	it("discards anything that is not a cache", () => {
		for (const junk of [null, undefined, "", 42, [], "{}"]) {
			expect(normalizeCache(junk)).toEqual({ v: 3, shards: {} });
		}
	});

	it("drops entries keyed by something that is not a shard name", () => {
		const result = normalizeCache({
			v: 3,
			shards: { "notes.md": { mtime: 1, size: 1, days: {} } },
		});
		expect(result.shards).toEqual({});
	});

	it("drops shards with an unusable fingerprint", () => {
		const result = normalizeCache({
			v: 3,
			shards: { "2026-08.pixel-10a.md": { mtime: "soon", size: 1, days: {} } },
		});
		expect(result.shards).toEqual({});
	});

	it("coerces missing and nonsense counts to zero", () => {
		const result = normalizeCache({
			v: 3,
			shards: {
				"2026-08.pixel-10a.md": {
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

		expect(result.shards["2026-08.pixel-10a.md"]?.days["2026-08-07"]).toEqual({
			reviews: 0,
			timeMs: 0,
			byRating: { 1: 2, 2: 0, 3: 0, 4: 0 },
			byState: { new: 0, learning: 0, review: 0, relearning: 0 },
			byMode: { sequential: 0, contextual: 0, spatial: 0 },
			byClass: { learning: 0, young: 0, mature: 0, relearning: 0 },
			timeByClass: { learning: 0, young: 0, mature: 0, relearning: 0 },
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
