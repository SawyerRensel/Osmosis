import { describe, it, expect } from "vitest";
import { MATURE_INTERVAL_SECONDS, type ReviewLogEntry } from "../store/ReviewLog";
import type { Card } from "../database/types";
import { GRADUATED_INTERVAL_SECONDS } from "./aggregate";
import { DetailAccumulator, type DetailStats } from "./detail";

const DAY_SECONDS = 86_400;
const MATURE = MATURE_INTERVAL_SECONDS;
const GRAD = GRADUATED_INTERVAL_SECONDS;

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
		...overrides,
	};
}

const NOW = new Date(2026, 7, 8, 14, 0).getTime();
const at = (day: number, hour = 9) => new Date(2026, 7, day, hour).getTime();
const daysAgo = (days: number, hour = 9) => new Date(2026, 7, 8 - days, hour).getTime();

/** Run entries through a fresh accumulator. */
function accumulate(
	entries: readonly ReviewLogEntry[],
	resolve: (id: string) => Card | undefined = () => undefined,
	now = NOW,
): DetailStats {
	const accumulator = new DetailAccumulator(now, resolve);
	for (const e of entries) accumulator.add(e);
	return accumulator.result();
}

/** Retention for one named window. */
function window(stats: DetailStats, label: string) {
	return stats.retention.find((row) => row.label === label)?.stats;
}

// ── Volume, modes, hours ──────────────────────────────────────

describe("DetailAccumulator — volume", () => {
	it("buckets reviews by local day", () => {
		const stats = accumulate([
			entry({ t: at(6) }),
			entry({ t: at(7) }),
			entry({ t: at(7, 11) }),
		]);
		expect(stats.rollup["2026-08-06"]?.reviews).toBe(1);
		expect(stats.rollup["2026-08-07"]?.reviews).toBe(2);
	});

	it("counts reviews per study surface", () => {
		const stats = accumulate([
			entry({ m: "contextual" }),
			entry({ m: "contextual" }),
			entry({ m: "sequential" }),
		]);
		expect(stats.modeTotals).toEqual({ sequential: 1, contextual: 2, spatial: 0 });
	});

	it("collects every card it counted, for the mode-filtered card graphs", () => {
		const stats = accumulate([entry({ c: "a" }), entry({ c: "b" }), entry({ c: "a" })]);
		expect([...stats.reviewedCards].sort()).toEqual(["a", "b"]);
	});

	it("is empty but well-formed with no reviews", () => {
		const stats = accumulate([]);
		expect(stats.rollup).toEqual({});
		expect(stats.reviewedCards.size).toBe(0);
		expect(stats.modeTotals).toEqual({ sequential: 0, contextual: 0, spatial: 0 });
	});
});

describe("DetailAccumulator — hourly breakdown", () => {
	it("always reports all twenty-four hours", () => {
		const hours = accumulate([]).hours;
		expect(hours).toHaveLength(24);
		expect(hours.map((h) => h.hour)).toEqual([...Array(24).keys()]);
		expect(hours.every((h) => h.reviews === 0)).toBe(true);
	});

	it("buckets by the local hour on the clock", () => {
		const hours = accumulate([
			entry({ t: new Date(2026, 7, 7, 9, 15).getTime() }),
			entry({ t: new Date(2026, 7, 7, 9, 59).getTime() }),
			entry({ t: new Date(2026, 7, 8, 9, 5).getTime() }),
			entry({ t: new Date(2026, 7, 7, 22, 0).getTime() }),
		]).hours;
		expect(hours[9]?.reviews).toBe(3);
		expect(hours[22]?.reviews).toBe(1);
	});

	it("counts Hard and better as passed", () => {
		const hours = accumulate([
			entry({ t: at(7), r: 1 }),
			entry({ t: at(7), r: 2 }),
			entry({ t: at(7), r: 4 }),
		]).hours;
		expect(hours[9]?.reviews).toBe(3);
		expect(hours[9]?.passed).toBe(2);
	});

	it("keeps every review on a day that gains or loses an hour to DST", () => {
		// Whatever the runner's timezone, a day spanning a DST change must not
		// lose or duplicate reviews: every one lands in some hour of 0–23.
		const entries: ReviewLogEntry[] = [];
		for (let hour = 0; hour < 24; hour++) {
			entries.push(entry({ t: new Date(2026, 10, 1, hour, 30).getTime() }));
			entries.push(entry({ t: new Date(2026, 2, 8, hour, 30).getTime() }));
		}
		const hours = accumulate(entries).hours;
		expect(hours.reduce((sum, h) => sum + h.reviews, 0)).toBe(entries.length);
	});
});

// ── Answer buttons ────────────────────────────────────────────

describe("DetailAccumulator — answer buttons", () => {
	it("splits on the interval the card was answered at", () => {
		const counts = accumulate([
			entry({ pi: MATURE * 2, r: 4 }),
			entry({ pi: 5 * DAY_SECONDS, r: 2 }),
		]).answerButtons;
		expect(counts.mature[4]).toBe(1);
		expect(counts.young[2]).toBe(1);
	});

	it("splits exactly at the 21-day line", () => {
		const counts = accumulate([
			entry({ pi: MATURE - 1, r: 3 }),
			entry({ pi: MATURE, r: 3 }),
		]).answerButtons;
		expect(counts.young[3]).toBe(1);
		expect(counts.mature[3]).toBe(1);
	});

	it("files Again on a mature card under mature", () => {
		// The regression the discarded `iv` approach would have silently
		// inverted: pressing Again collapses the *granted* interval to minutes,
		// so classifying on `iv` would have emptied the Again bar on mature
		// cards — the entire point of the graph.
		const counts = accumulate([
			entry({ pi: MATURE * 3, iv: 600, r: 1, s: "relearning" }),
		]).answerButtons;
		expect(counts.mature[1]).toBe(1);
		expect(counts.young[1]).toBe(0);
	});

	it("does not change when an unrelated card matures", () => {
		// It used to read the card's schedule as it stands *now*, so a card
		// maturing rewrote the history of every review it had ever had.
		const entries = [entry({ c: "a", pi: 3 * DAY_SECONDS, r: 3 })];
		const young = accumulate(entries, () => card({ id: "a" }));
		const matured = accumulate(entries, () =>
			card({ id: "a", lastReview: at(1), due: at(1) + MATURE * 4000 }),
		);
		expect(matured.answerButtons).toEqual(young.answerButtons);
		expect(young.answerButtons.young[3]).toBe(1);
	});

	it("counts a review whose card no longer resolves", () => {
		// There is no `excluded` bucket any more: maturity is on the entry, so a
		// deleted card cannot take its own reviews out of the graph.
		const counts = accumulate([entry({ c: "os-gone", pi: MATURE * 2 })]).answerButtons;
		expect(counts.mature[3]).toBe(1);
	});
});

// ── True retention ────────────────────────────────────────────

describe("DetailAccumulator — true retention", () => {
	it("counts a failure on a mature card, despite its interval collapsing", () => {
		const stats = window(
			accumulate([entry({ c: "a", t: at(5), pi: MATURE * 2, iv: 600, r: 1, s: "relearning" })]),
			"All",
		);
		expect(stats).toMatchObject({ reviewed: 1, passed: 0, rate: 0 });
	});

	it("ignores reviews of young cards", () => {
		const stats = window(accumulate([entry({ c: "a", pi: 5 * DAY_SECONDS })]), "All");
		expect(stats?.reviewed).toBe(0);
	});

	it("splits exactly at the 21-day line", () => {
		const stats = window(
			accumulate([
				entry({ c: "a", t: at(1), pi: MATURE - 1 }),
				entry({ c: "b", t: at(1), pi: MATURE }),
			]),
			"All",
		);
		expect(stats?.reviewed).toBe(1);
	});

	it("treats Hard as a pass and Again as the only failure", () => {
		const stats = window(
			accumulate([
				entry({ c: "a", t: at(2), pi: MATURE * 2, r: 2 }),
				entry({ c: "b", t: at(2), pi: MATURE * 2, r: 1 }),
			]),
			"All",
		);
		expect(stats).toMatchObject({ reviewed: 2, passed: 1, rate: 0.5 });
	});

	it("counts the same card again on a later day", () => {
		const stats = window(
			accumulate([
				entry({ c: "a", t: at(5), pi: MATURE * 2 }),
				entry({ c: "a", t: at(6), pi: MATURE * 3 }),
			]),
			"All",
		);
		expect(stats?.reviewed).toBe(2);
	});

	it("does not let a lapse and its recovery both count", () => {
		// This is the case the per-day dedup was written for, and the maturity
		// filter now covers it on its own: the recovery's prior interval is the
		// minutes the lapse granted, far below the line.
		const stats = window(
			accumulate([
				entry({ c: "a", t: at(5, 9), pi: MATURE * 2, iv: 600, r: 1, s: "relearning" }),
				entry({ c: "a", t: at(5, 10), pi: 600, iv: 86_400, r: 3, s: "review" }),
			]),
			"All",
		);
		expect(stats).toMatchObject({ reviewed: 1, passed: 0 });
	});

	it("takes only the first review of a card each day", () => {
		// Why the dedup survived the maturity filter covering the lapse case:
		// contextual and spatial study let you answer a card that is not due, so
		// a mature card *passed* twice in one day has a mature prior interval on
		// both answers and would otherwise be counted twice.
		const stats = window(
			accumulate([
				entry({ c: "a", t: at(5, 9), pi: MATURE * 2, r: 3 }),
				entry({ c: "a", t: at(5, 16), pi: MATURE * 2, r: 1 }),
			]),
			"All",
		);
		expect(stats).toMatchObject({ reviewed: 1, passed: 1 });
	});

	it("returns a row per window, widest last", () => {
		const rows = accumulate([]).retention;
		expect(rows.map((row) => row.label)).toEqual(["Today", "Week", "Month", "Year", "All"]);
		expect(rows[4]?.days).toBeNull();
	});

	it("narrows to the window", () => {
		const stats = accumulate([
			entry({ c: "a", t: daysAgo(100), pi: MATURE * 2 }),
			entry({ c: "a", t: daysAgo(0), pi: MATURE * 2 }),
		]);
		expect(window(stats, "Today")?.reviewed).toBe(1);
		expect(window(stats, "Week")?.reviewed).toBe(1);
		expect(window(stats, "Year")?.reviewed).toBe(2);
		expect(window(stats, "All")?.reviewed).toBe(2);
	});

	it("counts today from local midnight, not twenty-four hours back", () => {
		const stats = accumulate([entry({ c: "a", t: daysAgo(1, 23), pi: MATURE * 2 })]);
		expect(window(stats, "Today")?.reviewed).toBe(0);
		expect(window(stats, "Week")?.reviewed).toBe(1);
	});

	it("needs no predecessor, so a card whose history predates the log counts", () => {
		// `withPriorIntervals` had to reconstruct this from the entry before,
		// and reported everything it could not reach as `unknownInterval` —
		// "on a young log, most of them". Storing `pi` removes the whole notion.
		const stats = window(accumulate([entry({ c: "a", t: at(2), pi: MATURE * 2 })]), "All");
		expect(stats?.reviewed).toBe(1);
	});

	it("does not divide by zero on an empty log", () => {
		for (const row of accumulate([]).retention) {
			expect(row.stats).toEqual({ reviewed: 0, passed: 0, rate: 0 });
		}
	});
});

// ── Comparative recall ────────────────────────────────────────

describe("DetailAccumulator — recall", () => {
	it("groups by study surface", () => {
		const stats = accumulate([
			entry({ c: "a", t: at(3), pi: GRAD * 5, r: 3, m: "contextual" }),
			entry({ c: "b", t: at(3), pi: GRAD * 5, r: 1, m: "spatial" }),
		]);
		expect(stats.byMode.get("contextual")).toMatchObject({ reviewed: 1, passed: 1, rate: 1 });
		expect(stats.byMode.get("spatial")).toMatchObject({ reviewed: 1, passed: 0, rate: 0 });
		expect(stats.byMode.has("sequential")).toBe(false);
	});

	it("ignores reviews the card had not graduated into", () => {
		// A learning-step answer minutes after the last one says nothing about
		// memory, and there are far more of them than real reviews.
		const stats = accumulate([entry({ c: "a", pi: 600 }), entry({ c: "a", pi: 0 })]);
		expect(stats.byMode.size).toBe(0);
	});

	it("splits exactly at the one-day line", () => {
		const stats = accumulate([
			entry({ c: "a", t: at(1), pi: GRAD - 1 }),
			entry({ c: "b", t: at(1), pi: GRAD }),
		]);
		expect(stats.byMode.get("sequential")?.reviewed).toBe(1);
	});

	it("takes only the first review of a card each day", () => {
		const stats = accumulate([
			entry({ c: "a", t: at(5, 9), pi: GRAD * 5, r: 1 }),
			entry({ c: "a", t: at(5, 10), pi: GRAD * 5, r: 3 }),
		]);
		expect(stats.byMode.get("sequential")).toMatchObject({ reviewed: 1, passed: 0 });
	});

	it("groups by card type and note when the card resolves", () => {
		const stats = accumulate(
			[entry({ c: "a", t: at(3), pi: GRAD * 5 })],
			() => card({ cardType: "explicit_cloze", notePath: "Geography/Rivers.md" }),
		);
		expect(stats.byType.get("explicit_cloze")?.reviewed).toBe(1);
		expect(stats.byNote.get("Geography/Rivers.md")?.reviewed).toBe(1);
	});

	it("keeps an unresolvable card in byMode but out of byType and byNote", () => {
		// A review whose card is gone still happened on a surface, but it
		// belongs to no note and no type.
		const stats = accumulate([entry({ c: "os-gone", t: at(3), pi: GRAD * 5 })]);
		expect(stats.byMode.get("sequential")?.reviewed).toBe(1);
		expect(stats.byType.size).toBe(0);
		expect(stats.byNote.size).toBe(0);
	});

	it("averages time on screen across counted reviews only", () => {
		const stats = accumulate([
			entry({ c: "a", t: at(1), pi: 600, e: 99_999 }),
			entry({ c: "a", t: at(3), pi: GRAD * 5, e: 2000 }),
			entry({ c: "b", t: at(3), pi: GRAD * 5, e: 4000 }),
		]);
		expect(stats.byMode.get("sequential")?.meanMs).toBe(3000);
	});

	it("returns nothing for an empty log", () => {
		const stats = accumulate([]);
		expect(stats.byMode.size).toBe(0);
		expect(stats.byType.size).toBe(0);
		expect(stats.byNote.size).toBe(0);
	});
});

// ── Order independence ────────────────────────────────────────

describe("DetailAccumulator — order independence", () => {
	it("gives the same answer whatever order the shards arrive in", () => {
		// `scan` walks shards, not a sorted list, so nothing here may depend on
		// entries arriving in timestamp order.
		const entries = [
			entry({ c: "a", t: at(1), pi: MATURE * 2, r: 3 }),
			entry({ c: "b", t: at(2), pi: GRAD * 2, r: 1, m: "spatial" }),
			entry({ c: "a", t: at(3), pi: MATURE * 3, r: 2 }),
			entry({ c: "c", t: at(4), pi: 0, r: 4 }),
		];
		const forwards = accumulate(entries);
		const backwards = accumulate([...entries].reverse());

		expect(backwards.rollup).toEqual(forwards.rollup);
		expect(backwards.answerButtons).toEqual(forwards.answerButtons);
		expect(backwards.hours).toEqual(forwards.hours);
		expect(backwards.retention).toEqual(forwards.retention);
		expect([...backwards.byMode]).toEqual([...forwards.byMode]);
	});
});
