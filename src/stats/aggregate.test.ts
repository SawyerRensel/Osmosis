import { describe, it, expect } from "vitest";
import { aggregateRollup, type ReviewLogEntry } from "../store/ReviewLog";
import type { Card } from "../database/types";
import {
	bucketPoints,
	calendarYear,
	cardCounts,
	cardsInScope,
	dailySeries,
	dayKeyToDate,
	dayKeysInRange,
	deckInScope,
	difficulties,
	entryInScope,
	formatDays,
	formatDuration,
	futureDue,
	histogram,
	historyMonthRange,
	historyStartDay,
	intervalDays,
	percentile,
	rankByRecall,
	retrievability,
	stabilityDays,
	studyModeTotals,
	todaySummary,
	yearsWithActivity,
	type DayPoint,
} from "./aggregate";

const DAY_SECONDS = 86_400;

/** A review of a geography card, mid-morning on 7 August 2026 (local). */
const baseEntry: ReviewLogEntry = {
	t: new Date(2026, 7, 7, 10, 30, 0).getTime(),
	c: "os-wcfb3w",
	r: 3,
	s: "review",
	iv: 4 * DAY_SECONDS,
	pi: 2 * DAY_SECONDS,
	st: 12.3,
	d: 6.4,
	e: 4200,
	m: "sequential",
};

function entry(overrides: Partial<ReviewLogEntry>): ReviewLogEntry {
	return { ...baseEntry, ...overrides };
}

/** A card in the "Geography/Rivers" deck, reviewed and scheduled. */
function card(overrides: Partial<Card> = {}): Card {
	return {
		id: "os-wcfb3w",
		notePath: "Geography/Rivers.md",
		deck: "Geography/Rivers",
		cardType: "explicit",
		front: "Longest river in Europe",
		back: "The Volga",
		typeIn: false,
		sourceLine: 12,
		state: "review",
		stability: 12.3,
		difficulty: 6.4,
		lastReview: new Date(2026, 7, 1, 9, 0).getTime(),
		due: new Date(2026, 7, 11, 9, 0).getTime(),
		...overrides,
	};
}

const AUG_7 = new Date(2026, 7, 7, 14, 0).getTime();

// ── Scoping ───────────────────────────────────────────────────

describe("deckInScope", () => {
	it("takes everything under the whole collection", () => {
		expect(deckInScope("Geography/Rivers", { type: "all" })).toBe(true);
		expect(deckInScope("", { type: "all" })).toBe(true);
	});

	it("matches a single deck exactly, without its children", () => {
		const scope = { type: "single", deck: "Geography" } as const;
		expect(deckInScope("Geography", scope)).toBe(true);
		expect(deckInScope("Geography/Rivers", scope)).toBe(false);
	});

	it("takes a parent deck with all its descendants", () => {
		const scope = { type: "parent", deck: "Geography" } as const;
		expect(deckInScope("Geography", scope)).toBe(true);
		expect(deckInScope("Geography/Rivers", scope)).toBe(true);
		expect(deckInScope("Geography/Rivers/Europe", scope)).toBe(true);
	});

	it("does not treat a name prefix as a parent", () => {
		// "Geographyology" is not inside "Geography"; only the slash makes it so.
		expect(deckInScope("Geographyology", { type: "parent", deck: "Geography" })).toBe(false);
	});
});

describe("entryInScope", () => {
	const cards = new Map<string, Card>([
		["os-rivers", card({ id: "os-rivers", deck: "Geography/Rivers" })],
		["os-spanish", card({ id: "os-spanish", deck: "Languages/Spanish" })],
	]);
	const resolve = (id: string) => cards.get(id);
	const scope = (over: Partial<Parameters<typeof entryInScope>[1]> = {}) => ({
		deck: { type: "all" } as const,
		mode: "all" as const,
		startDay: null,
		...over,
	});

	it("keeps every entry under the whole collection, deleted cards included", () => {
		expect(entryInScope(entry({ c: "os-rivers" }), scope(), resolve)).toBe(true);
		expect(entryInScope(entry({ c: "os-deleted" }), scope(), resolve)).toBe(true);
	});

	it("drops entries whose card is in another deck", () => {
		const deck = scope({ deck: { type: "parent", deck: "Geography" } });
		expect(entryInScope(entry({ c: "os-rivers" }), deck, resolve)).toBe(true);
		expect(entryInScope(entry({ c: "os-spanish" }), deck, resolve)).toBe(false);
	});

	it("drops entries whose card no longer resolves", () => {
		// A deleted card belongs to no deck, so it cannot be inside one. This is
		// the documented cost of narrowing the scope off "whole collection".
		const deck = scope({ deck: { type: "parent", deck: "Geography" } });
		expect(entryInScope(entry({ c: "os-deleted" }), deck, resolve)).toBe(false);
	});

	it("narrows to one study surface", () => {
		const spatial = scope({ mode: "spatial" });
		expect(entryInScope(entry({ m: "spatial" }), spatial, resolve)).toBe(true);
		expect(entryInScope(entry({ m: "sequential" }), spatial, resolve)).toBe(false);
	});

	it("drops entries before the start day and keeps the boundary day", () => {
		const since = scope({ startDay: "2025-08-07" });
		expect(
			entryInScope(entry({ t: new Date(2025, 7, 6, 23, 0).getTime() }), since, resolve),
		).toBe(false);
		expect(
			entryInScope(entry({ t: new Date(2025, 7, 7, 0, 30).getTime() }), since, resolve),
		).toBe(true);
	});

	it("does not consult the card when the scope is the whole collection", () => {
		// The join is what makes a deleted card vanish from a graph, so it must
		// not happen on the path that is supposed to keep them.
		let looked = 0;
		entryInScope(entry({ c: "os-rivers" }), scope(), (id) => {
			looked += 1;
			return cards.get(id);
		});
		expect(looked).toBe(0);
	});
});

describe("historyStartDay / historyMonthRange", () => {
	it("has no start day for all history", () => {
		expect(historyStartDay(AUG_7, "all")).toBeNull();
	});

	it("starts twelve months back", () => {
		expect(historyStartDay(AUG_7, "12m")).toBe("2025-08-07");
	});

	it("prunes shards to the months the start day can reach", () => {
		expect(historyMonthRange(AUG_7, "12m")).toEqual({ from: "2025-08" });
	});

	it("prunes nothing over all history", () => {
		expect(historyMonthRange(AUG_7, "all")).toBeUndefined();
	});

	it("leaves the upper bound open, so a clock-skewed shard is still read", () => {
		// The day filter is the authority on what counts; the month range only
		// exists to avoid opening files it would reject anyway.
		expect(historyMonthRange(AUG_7, "12m")).not.toHaveProperty("to");
	});
});

describe("cardsInScope", () => {
	it("narrows to a parent deck and its children", () => {
		const cards = [
			card({ id: "a", deck: "Geography" }),
			card({ id: "b", deck: "Geography/Rivers" }),
			card({ id: "c", deck: "Languages" }),
		];
		expect(cardsInScope(cards, { type: "parent", deck: "Geography" }).map((c) => c.id)).toEqual([
			"a",
			"b",
		]);
	});
});

// ── Day keys ──────────────────────────────────────────────────

describe("dayKeysInRange", () => {
	it("includes both ends", () => {
		const keys = dayKeysInRange(
			new Date(2026, 7, 5, 23, 0).getTime(),
			new Date(2026, 7, 7, 1, 0).getTime(),
		);
		expect(keys).toEqual(["2026-08-05", "2026-08-06", "2026-08-07"]);
	});

	it("crosses a month boundary", () => {
		const keys = dayKeysInRange(
			new Date(2026, 6, 30, 9, 0).getTime(),
			new Date(2026, 7, 2, 9, 0).getTime(),
		);
		expect(keys).toEqual(["2026-07-30", "2026-07-31", "2026-08-01", "2026-08-02"]);
	});

	it("crosses a leap day", () => {
		const keys = dayKeysInRange(
			new Date(2028, 1, 28, 9, 0).getTime(),
			new Date(2028, 2, 1, 9, 0).getTime(),
		);
		expect(keys).toEqual(["2028-02-28", "2028-02-29", "2028-03-01"]);
	});

	it("returns one key when both ends are the same day", () => {
		const t = new Date(2026, 7, 7, 9, 0).getTime();
		expect(dayKeysInRange(t, t)).toEqual(["2026-08-07"]);
	});

	it("returns nothing when the range runs backwards", () => {
		expect(
			dayKeysInRange(new Date(2026, 7, 7).getTime(), new Date(2026, 7, 1).getTime()),
		).toEqual([]);
	});
});

// ── Today ─────────────────────────────────────────────────────

describe("todaySummary", () => {
	it("reports only today's bucket", () => {
		const rollup = aggregateRollup([
			entry({ t: new Date(2026, 7, 7, 9, 0).getTime(), e: 1000, r: 1, s: "relearning" }),
			entry({ t: new Date(2026, 7, 7, 10, 0).getTime(), e: 2000, r: 3 }),
			entry({ t: new Date(2026, 7, 6, 10, 0).getTime(), e: 9000, r: 3 }),
		]);

		const today = todaySummary(rollup, AUG_7);
		expect(today.reviews).toBe(2);
		expect(today.timeMs).toBe(3000);
		expect(today.againCount).toBe(1);
	});

	it("is empty on a day with no reviews", () => {
		expect(todaySummary({}, AUG_7)).toEqual({
			reviews: 0,
			timeMs: 0,
			againCount: 0,
			byClass: { learning: 0, young: 0, mature: 0, relearning: 0 },
		});
	});

	it("does not alias the rollup's own bucket", () => {
		const rollup = aggregateRollup([entry({ t: AUG_7 })]);
		const today = todaySummary(rollup, AUG_7);
		today.byClass.young = 99;
		expect(rollup["2026-08-07"]?.byClass.young).toBe(1);
	});
});

// ── Reviews / Review Time ─────────────────────────────────────

describe("dailySeries", () => {
	it("zero-fills days with no reviews", () => {
		const rollup = aggregateRollup([
			entry({ t: new Date(2026, 7, 5, 9, 0).getTime() }),
			entry({ t: new Date(2026, 7, 7, 9, 0).getTime() }),
		]);

		const points = dailySeries(
			rollup,
			new Date(2026, 7, 5, 9, 0).getTime(),
			new Date(2026, 7, 7, 9, 0).getTime(),
		);
		expect(points.map((p) => p.reviews)).toEqual([1, 0, 1]);
		expect(points.map((p) => p.day)).toEqual(["2026-08-05", "2026-08-06", "2026-08-07"]);
	});

	it("carries the maturity split through", () => {
		const rollup = aggregateRollup([
			entry({ t: new Date(2026, 7, 7, 9, 0).getTime(), s: "review", pi: DAY_SECONDS, e: 500 }),
			entry({
				t: new Date(2026, 7, 7, 10, 0).getTime(),
				s: "review",
				pi: 21 * DAY_SECONDS,
				e: 1500,
			}),
		]);

		const point = dailySeries(rollup, AUG_7, AUG_7)[0];
		expect(point?.byClass).toEqual({ learning: 0, young: 1, mature: 1, relearning: 0 });
		expect(point?.timeByClass).toEqual({ learning: 0, young: 500, mature: 1500, relearning: 0 });
	});

	it("is all zeroes for an empty log", () => {
		const points = dailySeries({}, new Date(2026, 7, 5).getTime(), new Date(2026, 7, 7).getTime());
		expect(points).toHaveLength(3);
		expect(points.every((p) => p.reviews === 0 && p.timeMs === 0)).toBe(true);
	});
});

// ── Bucketing ─────────────────────────────────────────────────

describe("bucketPoints", () => {
	/** A fortnight from Sunday 2 August 2026, one review per day. */
	function fortnight(): DayPoint[] {
		const rollup = aggregateRollup(
			Array.from({ length: 14 }, (_, i) =>
				entry({ t: new Date(2026, 7, 2 + i, 9, 0).getTime(), e: 1000 }),
			),
		);
		return dailySeries(
			rollup,
			new Date(2026, 7, 2, 9, 0).getTime(),
			new Date(2026, 7, 15, 9, 0).getTime(),
		);
	}

	it("leaves daily granularity one column per day", () => {
		const buckets = bucketPoints(fortnight(), "day");
		expect(buckets).toHaveLength(14);
		expect(buckets.every((b) => b.span === 1)).toBe(true);
	});

	it("groups weeks from Sunday, matching the heatmap's rows", () => {
		const buckets = bucketPoints(fortnight(), "week");
		expect(buckets).toHaveLength(2);
		expect(buckets[0]?.key).toBe("2026-08-02");
		expect(buckets[1]?.key).toBe("2026-08-09");
		expect(buckets.every((b) => b.span === 7)).toBe(true);
	});

	it("starts a new week bucket mid-range when the range does not start on Sunday", () => {
		const rollup = aggregateRollup([entry({ t: new Date(2026, 7, 5, 9, 0).getTime() })]);
		// Wednesday 5 Aug to Monday 10 Aug crosses one Sunday.
		const points = dailySeries(
			rollup,
			new Date(2026, 7, 5, 9, 0).getTime(),
			new Date(2026, 7, 10, 9, 0).getTime(),
		);
		const buckets = bucketPoints(points, "week");
		expect(buckets).toHaveLength(2);
		expect(buckets[0]?.span).toBe(4);
		expect(buckets[1]?.span).toBe(2);
	});

	it("groups months and sums every measure across them", () => {
		const rollup = aggregateRollup([
			entry({ t: new Date(2026, 6, 30, 9, 0).getTime(), e: 1000, s: "review", iv: 86_400 }),
			entry({ t: new Date(2026, 6, 31, 9, 0).getTime(), e: 2000, s: "review", iv: 86_400 }),
			entry({ t: new Date(2026, 7, 1, 9, 0).getTime(), e: 4000, s: "learning" }),
		]);
		const points = dailySeries(
			rollup,
			new Date(2026, 6, 30, 9, 0).getTime(),
			new Date(2026, 7, 1, 9, 0).getTime(),
		);

		const buckets = bucketPoints(points, "month");
		expect(buckets).toHaveLength(2);
		expect(buckets[0]).toMatchObject({ key: "2026-07-30", reviews: 2, timeMs: 3000 });
		expect(buckets[0]?.byClass.young).toBe(2);
		expect(buckets[1]).toMatchObject({ key: "2026-08-01", reviews: 1, timeMs: 4000 });
		expect(buckets[1]?.byClass.learning).toBe(1);
	});

	it("preserves the total across every granularity", () => {
		const points = fortnight();
		for (const granularity of ["day", "week", "month"] as const) {
			const total = bucketPoints(points, granularity).reduce((sum, b) => sum + b.reviews, 0);
			expect(total).toBe(14);
		}
	});

	it("anchors a label on the first column and wherever a month opens", () => {
		const rollup = aggregateRollup([]);
		const points = dailySeries(
			rollup,
			new Date(2026, 6, 30, 9, 0).getTime(),
			new Date(2026, 7, 2, 9, 0).getTime(),
		);
		const buckets = bucketPoints(points, "day");
		expect(buckets.map((b) => b.startsMonth)).toEqual([true, false, true, false]);
	});

	it("returns nothing for no points", () => {
		expect(bucketPoints([], "month")).toEqual([]);
	});
});

describe("dayKeyToDate", () => {
	it("round-trips a day key", () => {
		const date = dayKeyToDate("2026-08-07");
		expect(date.getFullYear()).toBe(2026);
		expect(date.getMonth()).toBe(7);
		expect(date.getDate()).toBe(7);
	});

	it("lands at midday, so a DST shift cannot move the date", () => {
		expect(dayKeyToDate("2026-11-01").getHours()).toBe(12);
	});
});

// ── Calendar ──────────────────────────────────────────────────

describe("calendarYear", () => {
	it("lays out every day of the year", () => {
		expect(calendarYear({}, 2026).days).toHaveLength(365);
		expect(calendarYear({}, 2028).days).toHaveLength(366);
	});

	it("places 1 January in its real weekday row", () => {
		// 1 January 2026 is a Thursday.
		const grid = calendarYear({}, 2026);
		expect(grid.days[0]?.weekday).toBe(new Date(2026, 0, 1).getDay());
		expect(grid.days[0]?.week).toBe(0);
	});

	it("advances a column every seven days", () => {
		const grid = calendarYear({}, 2026);
		const first = grid.days[0];
		const eighth = grid.days[7];
		expect(eighth?.week).toBe((first?.week ?? 0) + 1);
		expect(eighth?.weekday).toBe(first?.weekday);
	});

	it("totals counts and counts the days studied", () => {
		const rollup = aggregateRollup([
			entry({ t: new Date(2026, 7, 7, 9, 0).getTime() }),
			entry({ t: new Date(2026, 7, 7, 10, 0).getTime() }),
			entry({ t: new Date(2026, 7, 9, 9, 0).getTime() }),
		]);

		const grid = calendarYear(rollup, 2026);
		expect(grid.total).toBe(3);
		expect(grid.daysStudied).toBe(2);
		expect(grid.busiestCount).toBe(2);
	});

	it("ignores reviews from other years", () => {
		const rollup = aggregateRollup([entry({ t: new Date(2025, 7, 7, 9, 0).getTime() })]);
		expect(calendarYear(rollup, 2026).total).toBe(0);
	});

	it("is empty but well-formed with no log", () => {
		const grid = calendarYear({}, 2026);
		expect(grid.total).toBe(0);
		expect(grid.daysStudied).toBe(0);
		expect(grid.busiestCount).toBe(0);
		expect(grid.weeks).toBeGreaterThan(51);
	});
});

describe("yearsWithActivity", () => {
	it("always offers the current year", () => {
		expect(yearsWithActivity({}, AUG_7)).toEqual([2026]);
	});

	it("adds years the log has reviews in, newest first", () => {
		const rollup = aggregateRollup([
			entry({ t: new Date(2024, 3, 1, 9, 0).getTime() }),
			entry({ t: new Date(2025, 3, 1, 9, 0).getTime() }),
		]);
		expect(yearsWithActivity(rollup, AUG_7)).toEqual([2026, 2025, 2024]);
	});
});

// ── Study mode ────────────────────────────────────────────────

describe("study mode totals", () => {
	it("sums modes across the range from the rollup", () => {
		const rollup = aggregateRollup([
			entry({ t: new Date(2026, 7, 6, 9, 0).getTime(), m: "sequential" }),
			entry({ t: new Date(2026, 7, 7, 9, 0).getTime(), m: "spatial" }),
			entry({ t: new Date(2026, 7, 7, 10, 0).getTime(), m: "spatial" }),
		]);
		const points = dailySeries(rollup, new Date(2026, 7, 6, 9, 0).getTime(), AUG_7);

		expect(studyModeTotals(points, rollup)).toEqual({
			sequential: 1,
			contextual: 0,
			spatial: 2,
		});
	});

	it("is all zeroes with no reviews", () => {
		expect(studyModeTotals([], {})).toEqual({ sequential: 0, contextual: 0, spatial: 0 });
	});
});

// ── Card counts ───────────────────────────────────────────────

describe("cardCounts", () => {
	const lastReview = new Date(2026, 7, 1, 9, 0).getTime();
	const scheduled = (days: number) => ({
		lastReview,
		due: lastReview + days * 86_400_000,
	});

	it("splits review cards at the 21-day line", () => {
		const counts = cardCounts([
			card({ id: "a", state: "review", ...scheduled(20.9) }),
			card({ id: "b", state: "review", ...scheduled(21) }),
			card({ id: "c", state: "review", ...scheduled(400) }),
		]);
		expect(counts.young).toBe(1);
		expect(counts.mature).toBe(2);
	});

	it("counts the learning states separately", () => {
		const counts = cardCounts([
			card({ id: "a", state: "learning" }),
			card({ id: "b", state: "relearning" }),
		]);
		expect(counts.learning).toBe(1);
		expect(counts.relearning).toBe(1);
	});

	it("counts unreviewed cards as new", () => {
		const counts = cardCounts([
			card({ id: "a", state: undefined, due: undefined, lastReview: undefined }),
			card({ id: "b", state: "new" }),
		]);
		expect(counts.new).toBe(2);
	});

	it("counts a disabled card as excluded whatever its state", () => {
		const counts = cardCounts([
			card({ id: "a", state: "review", disabled: true, ...scheduled(400) }),
		]);
		expect(counts).toMatchObject({ excluded: 1, mature: 0, young: 0 });
	});

	it("counts an excludeFromDecks card normally", () => {
		// Out of deck totals and the sequential queue, but still studied in
		// place — it has not been taken out of study.
		const counts = cardCounts([
			card({ id: "a", state: "review", excludeFromDecks: true, ...scheduled(400) }),
		]);
		expect(counts.mature).toBe(1);
		expect(counts.excluded).toBe(0);
	});

	it("counts a review card with no resolvable interval as young", () => {
		const counts = cardCounts([
			card({ id: "a", state: "review", due: undefined, lastReview: undefined }),
		]);
		expect(counts.young).toBe(1);
	});

	it("is all zeroes with no cards", () => {
		expect(cardCounts([])).toEqual({
			new: 0,
			learning: 0,
			relearning: 0,
			young: 0,
			mature: 0,
			excluded: 0,
		});
	});
});

// ── Future due ────────────────────────────────────────────────

describe("futureDue", () => {
	const at = (day: number, hour = 9) => new Date(2026, 7, day, hour).getTime();

	it("buckets by whole days from today", () => {
		const result = futureDue(
			[
				card({ id: "a", due: at(7, 23) }),
				card({ id: "b", due: at(8) }),
				card({ id: "c", due: at(10) }),
			],
			AUG_7,
			7,
		);
		expect(result.buckets[0]).toBe(1);
		expect(result.buckets[1]).toBe(1);
		expect(result.buckets[3]).toBe(1);
		expect(result.total).toBe(3);
	});

	it("collapses everything overdue into the backlog, not day zero", () => {
		const result = futureDue(
			[card({ id: "a", due: at(1) }), card({ id: "b", due: at(6) }), card({ id: "c", due: at(8) })],
			AUG_7,
			7,
		);
		expect(result.backlog).toBe(2);
		expect(result.buckets[0]).toBe(0);
		expect(result.total).toBe(1);
	});

	it("drops cards due beyond the range", () => {
		const result = futureDue([card({ id: "a", due: at(30) })], AUG_7, 7);
		expect(result.total).toBe(0);
		expect(result.buckets.every((n) => n === 0)).toBe(true);
	});

	it("ignores new and disabled cards", () => {
		const result = futureDue(
			[
				card({ id: "a", due: undefined }),
				card({ id: "b", due: at(8), disabled: true }),
			],
			AUG_7,
			7,
		);
		expect(result.total).toBe(0);
		expect(result.backlog).toBe(0);
	});

	it("counts the days carrying load", () => {
		const result = futureDue(
			[card({ id: "a", due: at(8) }), card({ id: "b", due: at(8, 20) }), card({ id: "c", due: at(9) })],
			AUG_7,
			7,
		);
		expect(result.daysWithLoad).toBe(2);
	});
});

// ── Distributions ─────────────────────────────────────────────

describe("histogram", () => {
	it("spreads values across equal bins", () => {
		const bins = histogram([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 10, 10);
		expect(bins).toHaveLength(10);
		expect(bins.every((b) => b.count === 1)).toBe(true);
	});

	it("puts a value on a boundary in the upper bin", () => {
		const bins = histogram([5], 10, 2);
		expect(bins[0]?.count).toBe(0);
		expect(bins[1]?.count).toBe(1);
	});

	it("clamps values at or above the maximum into the last bin", () => {
		const bins = histogram([10, 40], 10, 2);
		expect(bins[1]?.count).toBe(2);
	});

	it("accumulates to one across the bins", () => {
		// Width 2: bin 0 holds [0,2), bin 1 holds [2,4).
		const bins = histogram([1, 2, 3, 8], 10, 5);
		expect(bins[bins.length - 1]?.cumulative).toBeCloseTo(1);
		expect(bins[0]?.cumulative).toBeCloseTo(0.25);
		expect(bins[1]?.cumulative).toBeCloseTo(0.75);
	});

	it("ignores negative and non-finite values", () => {
		const bins = histogram([-1, Number.NaN, Number.POSITIVE_INFINITY, 5], 10, 2);
		expect(bins.reduce((sum, b) => sum + b.count, 0)).toBe(1);
	});

	it("returns empty bins for no values", () => {
		const bins = histogram([], 10, 4);
		expect(bins).toHaveLength(4);
		expect(bins.every((b) => b.count === 0 && b.cumulative === 0)).toBe(true);
	});

	it("does not divide by zero when the maximum is zero", () => {
		const bins = histogram([0, 0], 0, 3);
		expect(bins[0]?.count).toBe(2);
	});
});

describe("percentile", () => {
	it("finds the median", () => {
		expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
	});

	it("finds the 95th percentile, ignoring input order", () => {
		const values = [100, 1, 2, 3, 4, 5, 6, 7, 8, 9];
		expect(percentile(values, 0.95)).toBe(100);
	});

	it("returns zero for no values", () => {
		expect(percentile([], 0.5)).toBe(0);
	});

	it("clamps at both ends", () => {
		expect(percentile([1, 2, 3], 0)).toBe(1);
		expect(percentile([1, 2, 3], 1)).toBe(3);
	});
});

describe("card distributions", () => {
	const lastReview = new Date(2026, 7, 1, 9, 0).getTime();

	it("reads intervals off the schedule, skipping unscheduled cards", () => {
		const values = intervalDays([
			card({ id: "a", lastReview, due: lastReview + 10 * 86_400_000 }),
			card({ id: "b", due: undefined, lastReview: undefined }),
		]);
		expect(values).toEqual([10]);
	});

	it("skips disabled cards in every distribution", () => {
		const disabled = card({ id: "a", disabled: true, stability: 9, difficulty: 5 });
		expect(intervalDays([disabled])).toEqual([]);
		expect(stabilityDays([disabled])).toEqual([]);
		expect(difficulties([disabled])).toEqual([]);
	});

	it("skips never-reviewed cards in stability and difficulty", () => {
		const fresh = card({ id: "a", stability: undefined, difficulty: undefined });
		expect(stabilityDays([fresh])).toEqual([]);
		expect(difficulties([fresh])).toEqual([]);
	});

	it("is empty with no cards", () => {
		expect(intervalDays([])).toEqual([]);
		expect(stabilityDays([])).toEqual([]);
		expect(difficulties([])).toEqual([]);
	});
});

describe("retrievability", () => {
	it("bins recall probability as a percentage", () => {
		const cards = [card({ id: "a" }), card({ id: "b" })];
		const stats = retrievability(cards, (c) => (c.id === "a" ? 0.95 : 0.15));

		expect(stats.cards).toBe(2);
		expect(stats.bins[9]?.count).toBe(1);
		expect(stats.bins[1]?.count).toBe(1);
	});

	it("estimates the remembered total as a sum of probabilities", () => {
		const cards = [card({ id: "a" }), card({ id: "b" }), card({ id: "c" })];
		const stats = retrievability(cards, () => 0.8);
		expect(stats.estimatedRemembered).toBeCloseTo(2.4);
	});

	it("skips cards with no curve to sit on", () => {
		const stats = retrievability([card({ id: "a" })], () => null);
		expect(stats.cards).toBe(0);
		expect(stats.estimatedRemembered).toBe(0);
	});

	it("skips disabled cards", () => {
		const stats = retrievability([card({ id: "a", disabled: true })], () => 0.9);
		expect(stats.cards).toBe(0);
	});

	it("clamps a probability outside 0–1", () => {
		const stats = retrievability([card({ id: "a" })], () => 1.4);
		expect(stats.estimatedRemembered).toBe(1);
		expect(stats.bins[9]?.count).toBe(1);
	});

	it("is empty with no cards", () => {
		const stats = retrievability([], () => 0.9);
		expect(stats.cards).toBe(0);
		expect(stats.bins).toHaveLength(10);
	});
});

// ── Hourly breakdown ──────────────────────────────────────────

// ── Comparative recall ────────────────────────────────────────

describe("rankByRecall", () => {
	const stats = (reviewed: number, passed: number) => ({
		reviewed,
		passed,
		rate: passed / reviewed,
		meanMs: 1000,
	});

	it("puts the worst group first", () => {
		const ranked = rankByRecall(
			new Map([
				["good", stats(20, 19)],
				["bad", stats(20, 10)],
				["middling", stats(20, 15)],
			]),
			5,
		);
		expect(ranked.map((row) => row.key)).toEqual(["bad", "middling", "good"]);
	});

	it("drops groups with too few reviews to mean anything", () => {
		// One review that happened to be a lapse is not the weakest note in the
		// vault; without the threshold it would top every ranking.
		const ranked = rankByRecall(
			new Map([
				["noise", stats(1, 0)],
				["real", stats(20, 18)],
			]),
			5,
		);
		expect(ranked.map((row) => row.key)).toEqual(["real"]);
	});

	it("breaks ties towards the better-evidenced group", () => {
		const ranked = rankByRecall(
			new Map([
				["thin", stats(6, 3)],
				["thick", stats(40, 20)],
			]),
			5,
		);
		expect(ranked[0]?.key).toBe("thick");
	});

	it("returns nothing when no group qualifies", () => {
		expect(rankByRecall(new Map([["a", stats(2, 1)]]), 5)).toEqual([]);
	});
});

// ── Study-mode filtering ──────────────────────────────────────

// ── Formatting ────────────────────────────────────────────────

describe("formatDuration", () => {
	it("uses seconds below a minute", () => {
		expect(formatDuration(0)).toBe("0s");
		expect(formatDuration(45_000)).toBe("45s");
	});

	it("uses minutes below an hour", () => {
		expect(formatDuration(90_000)).toBe("2m");
		expect(formatDuration(30 * 60_000)).toBe("30m");
	});

	it("uses hours and minutes above an hour", () => {
		expect(formatDuration(60 * 60_000)).toBe("1h");
		expect(formatDuration(134 * 60_000)).toBe("2h 14m");
	});
});

describe("formatDays", () => {
	it("scales the unit to the magnitude", () => {
		expect(formatDays(0.5)).toBe("12h");
		expect(formatDays(3)).toBe("3d");
		expect(formatDays(150)).toBe("5mo");
		expect(formatDays(760)).toBe("2.1y");
	});
});
