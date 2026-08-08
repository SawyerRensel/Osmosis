import type { Card, StudyMode } from "../database/types";
import type { DeckScope } from "../study/types";
import {
	MATURE_INTERVAL_SECONDS,
	cardIntervalDays,
	dayKey,
	MATURE_INTERVAL_DAYS,
	type ReviewClass,
	type ReviewLogEntry,
	type Rollup,
} from "../store/ReviewLog";

/**
 * Pure aggregations behind the stats dashboard: log entries and cards in,
 * graph-shaped data out. Nothing here touches the vault, the DOM, or the
 * clock — `now` is always a parameter — so every graph is testable as a
 * function of a synthetic log.
 *
 * Two data paths feed these, and the split is structural rather than an
 * optimisation:
 *
 *   - **Day-bucketed** functions take a `Rollup`, which is cached and costs no
 *     I/O. They can answer "how much did I study" but not "in which deck",
 *     because `DayRollup` deliberately holds no card IDs — that is what keeps
 *     a deleted deck from retroactively emptying the heatmap.
 *   - **Entry-level** functions take `ReviewLogEntry[]`, which costs a parse of
 *     every shard. Deck scoping lives here of necessity: joining a review to a
 *     deck needs the card ID the rollup does not carry.
 *
 * So choosing a deck is what moves a volume graph from the cheap path to the
 * expensive one, and under a deck scope reviews of since-deleted cards drop
 * out — correctly, since they resolve to no deck.
 */

const MS_PER_DAY = 86_400_000;


/** How far back the graphs look. Today ignores this, per Anki. */
export type HistoryScope = "12m" | "all";

/** Resolves a card ID to the card, or undefined once its note is gone. */
export type CardResolver = (cardId: string) => Card | undefined;

// ── Scoping ───────────────────────────────────────────────────

/** True when a deck path falls inside a scope. */
export function deckInScope(deck: string, scope: DeckScope): boolean {
	if (scope.type === "all") return true;
	if (scope.type === "single") return deck === scope.deck;
	return deck === scope.deck || deck.startsWith(`${scope.deck}/`);
}

/** The cards a scope covers. */
export function cardsInScope(cards: readonly Card[], scope: DeckScope): Card[] {
	if (scope.type === "all") return [...cards];
	return cards.filter((card) => deckInScope(card.deck, scope));
}

/**
 * The entries a deck scope covers.
 *
 * An entry whose card no longer resolves is dropped rather than kept: it
 * belongs to no deck, so it cannot be inside one. Under "whole collection"
 * this filter is skipped entirely, which is what keeps deleted cards in the
 * collection-wide volume graphs.
 */
export function entriesInScope(
	entries: readonly ReviewLogEntry[],
	scope: DeckScope,
	resolveCard: CardResolver,
): ReviewLogEntry[] {
	if (scope.type === "all") return [...entries];
	return entries.filter((entry) => {
		const card = resolveCard(entry.c);
		return card !== undefined && deckInScope(card.deck, scope);
	});
}

/** The first day a history scope includes, as a `YYYY-MM-DD` key. */
export function historyStartDay(now: number, history: HistoryScope): string | null {
	if (history === "all") return null;
	const start = new Date(now);
	start.setMonth(start.getMonth() - 12);
	return dayKey(start.getTime());
}

/** Restrict entries to a history scope. */
export function entriesSince(
	entries: readonly ReviewLogEntry[],
	startDay: string | null,
): ReviewLogEntry[] {
	if (startDay === null) return [...entries];
	return entries.filter((entry) => dayKey(entry.t) >= startDay);
}

// ── Day keys ──────────────────────────────────────────────────

/** Every `YYYY-MM-DD` from `from` to `to` inclusive, in order. */
export function dayKeysInRange(from: number, to: number): string[] {
	const keys: string[] = [];
	const cursor = new Date(from);
	cursor.setHours(12, 0, 0, 0); // midday: immune to DST shifting the date
	const end = new Date(to);
	end.setHours(12, 0, 0, 0);

	while (cursor.getTime() <= end.getTime()) {
		keys.push(dayKey(cursor.getTime()));
		cursor.setDate(cursor.getDate() + 1);
	}
	return keys;
}

/** The timestamp `days` days before `now`, same clock time. */
export function daysBefore(now: number, days: number): number {
	const d = new Date(now);
	d.setDate(d.getDate() - days);
	return d.getTime();
}

// ── Today ─────────────────────────────────────────────────────

/** The Today panel. Always today, whatever the history scope says. */
export interface TodaySummary {
	reviews: number;
	timeMs: number;
	/** Reviews answered Again — the numerator of the failure rate. */
	againCount: number;
	byClass: Record<ReviewClass, number>;
}

export function todaySummary(rollup: Rollup, now: number): TodaySummary {
	const day = rollup[dayKey(now)];
	if (!day) {
		return {
			reviews: 0,
			timeMs: 0,
			againCount: 0,
			byClass: { learning: 0, young: 0, mature: 0, relearning: 0 },
		};
	}
	return {
		reviews: day.reviews,
		timeMs: day.timeMs,
		againCount: day.byRating[1],
		byClass: { ...day.byClass },
	};
}

// ── Reviews / Review Time ─────────────────────────────────────

/** One bar of the Reviews and Review Time graphs. */
export interface DayPoint {
	day: string;
	reviews: number;
	timeMs: number;
	byClass: Record<ReviewClass, number>;
	timeByClass: Record<ReviewClass, number>;
}

/**
 * A point per day across the range, zero-filled.
 *
 * Days with no reviews must be present, not absent: a bar chart that silently
 * closes gaps would show a month of daily study and a month of three sessions
 * as the same shape.
 */
export function dailySeries(rollup: Rollup, from: number, to: number): DayPoint[] {
	return dayKeysInRange(from, to).map((day) => {
		const bucket = rollup[day];
		return {
			day,
			reviews: bucket?.reviews ?? 0,
			timeMs: bucket?.timeMs ?? 0,
			byClass: bucket
				? { ...bucket.byClass }
				: { learning: 0, young: 0, mature: 0, relearning: 0 },
			timeByClass: bucket
				? { ...bucket.timeByClass }
				: { learning: 0, young: 0, mature: 0, relearning: 0 },
		};
	});
}

// ── Calendar heatmap ──────────────────────────────────────────

/** One square of the year heatmap. */
export interface CalendarDay {
	day: string;
	count: number;
	/** Column: weeks since the first Sunday on or before 1 January. */
	week: number;
	/** Row: 0 = Sunday. */
	weekday: number;
}

/** A year of squares, plus the totals the caption reports. */
export interface CalendarYear {
	days: CalendarDay[];
	weeks: number;
	total: number;
	daysStudied: number;
	busiestCount: number;
}

/**
 * Lay a calendar year out as heatmap columns.
 *
 * Dates are stepped with `setDate`, not by adding 86.4M ms, so a DST boundary
 * inside the year cannot shift every subsequent square by a day.
 */
export function calendarYear(rollup: Rollup, year: number): CalendarYear {
	const cursor = new Date(year, 0, 1, 12, 0, 0, 0);
	const firstWeekday = cursor.getDay();
	const days: CalendarDay[] = [];
	let total = 0;
	let daysStudied = 0;
	let busiestCount = 0;

	for (let index = 0; cursor.getFullYear() === year; index++) {
		const day = dayKey(cursor.getTime());
		const count = rollup[day]?.reviews ?? 0;
		const offset = firstWeekday + index;

		days.push({ day, count, week: Math.floor(offset / 7), weekday: offset % 7 });
		total += count;
		if (count > 0) daysStudied += 1;
		if (count > busiestCount) busiestCount = count;

		cursor.setDate(cursor.getDate() + 1);
	}

	return {
		days,
		weeks: days.length === 0 ? 0 : (days[days.length - 1]?.week ?? 0) + 1,
		total,
		daysStudied,
		busiestCount,
	};
}

/** The years the log has any activity in, newest first. Always includes `now`. */
export function yearsWithActivity(rollup: Rollup, now: number): number[] {
	const years = new Set<number>([new Date(now).getFullYear()]);
	for (const [day, bucket] of Object.entries(rollup)) {
		if (bucket.reviews > 0) years.add(Number(day.slice(0, 4)));
	}
	return [...years].sort((a, b) => b - a);
}

// ── Study mode ────────────────────────────────────────────────

/** Reviews per study surface across a day range. Osmosis-native; Anki has none. */
export function studyModeTotals(points: readonly DayPoint[], rollup: Rollup): Record<StudyMode, number> {
	const totals: Record<StudyMode, number> = { sequential: 0, contextual: 0, spatial: 0 };
	for (const point of points) {
		const bucket = rollup[point.day];
		if (!bucket) continue;
		totals.sequential += bucket.byMode.sequential;
		totals.contextual += bucket.byMode.contextual;
		totals.spatial += bucket.byMode.spatial;
	}
	return totals;
}

/** Reviews per study surface, straight from entries — the deck-scoped path. */
export function studyModeFromEntries(
	entries: readonly ReviewLogEntry[],
): Record<StudyMode, number> {
	const totals: Record<StudyMode, number> = { sequential: 0, contextual: 0, spatial: 0 };
	for (const entry of entries) totals[entry.m] += 1;
	return totals;
}

// ── Card counts ───────────────────────────────────────────────

/** Slices of the Card Counts pie. */
export interface CardCounts {
	new: number;
	learning: number;
	relearning: number;
	young: number;
	mature: number;
	/**
	 * Cards the user has taken out of study (`disabled`), which keep their FSRS
	 * schedule and history. Anki calls this suspended; "excluded" is the word
	 * Osmosis's own UI uses, so the pie speaks the plugin's language.
	 *
	 * `excludeFromDecks` cards are *not* here. They are only out of deck totals
	 * and the sequential queue — still actively studied in place — so filing
	 * them under "not studied" would be wrong.
	 */
	excluded: number;
}

export function cardCounts(cards: readonly Card[]): CardCounts {
	const counts: CardCounts = {
		new: 0,
		learning: 0,
		relearning: 0,
		young: 0,
		mature: 0,
		excluded: 0,
	};

	for (const card of cards) {
		if (card.disabled) {
			counts.excluded += 1;
		} else if (card.state === "learning") {
			counts.learning += 1;
		} else if (card.state === "relearning") {
			counts.relearning += 1;
		} else if (card.state === "review") {
			const days = cardIntervalDays(card);
			if (days !== null && days >= MATURE_INTERVAL_DAYS) counts.mature += 1;
			else counts.young += 1;
		} else {
			counts.new += 1;
		}
	}

	return counts;
}

// ── Future due ────────────────────────────────────────────────

/** The Future Due graph. */
export interface FutureDue {
	/** One entry per day from today (index 0) out to the range's end. */
	buckets: number[];
	/** Cards already due — everything overdue collapsed into one figure. */
	backlog: number;
	/** Cards falling inside `buckets`, backlog excluded. */
	total: number;
	/** Days of the range that have at least one card due. */
	daysWithLoad: number;
}

/**
 * Cards grouped by how many days until they come up.
 *
 * Backlog is reported separately rather than as day 0. Anki's toggle exists
 * because a year's accumulated overdue cards in the first column flattens every
 * other bar to nothing, which hides exactly the shape the graph is for.
 */
export function futureDue(cards: readonly Card[], now: number, days: number): FutureDue {
	const buckets = new Array<number>(days).fill(0);
	let backlog = 0;
	let total = 0;

	const todayStart = startOfDay(now);

	for (const card of cards) {
		if (card.disabled || card.due === undefined) continue;
		const offset = Math.floor((startOfDay(card.due) - todayStart) / MS_PER_DAY);
		if (offset < 0) {
			backlog += 1;
		} else if (offset < days) {
			buckets[offset] = (buckets[offset] ?? 0) + 1;
			total += 1;
		}
	}

	return {
		buckets,
		backlog,
		total,
		daysWithLoad: buckets.filter((count) => count > 0).length,
	};
}

// ── Distributions ─────────────────────────────────────────────

/** One column of a histogram. */
export interface HistogramBin {
	/** Inclusive lower edge. */
	start: number;
	/** Exclusive upper edge; the last bin's is inclusive. */
	end: number;
	count: number;
	/** Share of all values at or below this bin, 0–1. */
	cumulative: number;
}

/**
 * Bucket values into `bins` equal columns spanning 0…`max`.
 *
 * The cumulative share rides along because every distribution graph here wants
 * it — "95% of your intervals are under N days" is the readable claim, and
 * computing it separately would mean walking the values twice.
 */
export function histogram(
	values: readonly number[],
	max: number,
	bins: number,
): HistogramBin[] {
	const width = max > 0 ? max / bins : 1;
	const counts = new Array<number>(bins).fill(0);

	for (const value of values) {
		if (!Number.isFinite(value) || value < 0) continue;
		const index = Math.min(bins - 1, Math.floor(value / width));
		counts[index] = (counts[index] ?? 0) + 1;
	}

	const total = values.length;
	let running = 0;
	return counts.map((count, index) => {
		running += count;
		return {
			start: index * width,
			end: (index + 1) * width,
			count,
			cumulative: total === 0 ? 0 : running / total,
		};
	});
}

/**
 * The value below which `p` of the sorted values fall (p in 0–1).
 *
 * Drives the interval graph's 50% / 95% ranges: a handful of ten-year intervals
 * would otherwise squeeze the whole distribution into the first pixel.
 */
export function percentile(values: readonly number[], p: number): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
	return sorted[index] ?? 0;
}

/** Scheduled intervals in days, for cards that have one. */
export function intervalDays(cards: readonly Card[]): number[] {
	const values: number[] = [];
	for (const card of cards) {
		if (card.disabled) continue;
		const days = cardIntervalDays(card);
		if (days !== null && days > 0) values.push(days);
	}
	return values;
}

/** FSRS stability in days, for cards that have been reviewed. */
export function stabilityDays(cards: readonly Card[]): number[] {
	return cards
		.filter((card) => !card.disabled && card.stability !== undefined && card.stability > 0)
		.map((card) => card.stability ?? 0);
}

/** FSRS difficulty, 1–10, for cards that have been reviewed. */
export function difficulties(cards: readonly Card[]): number[] {
	return cards
		.filter((card) => !card.disabled && card.difficulty !== undefined && card.difficulty > 0)
		.map((card) => card.difficulty ?? 0);
}

/** The Card Retrievability graph. */
export interface RetrievabilityStats {
	/** Ten bins spanning 0–100% recall probability. */
	bins: HistogramBin[];
	/** Cards contributing — reviewed, not excluded. */
	cards: number;
	/**
	 * Expected number still remembered right now: the sum of per-card recall
	 * probabilities. A sum of probabilities, not a count of anything observed.
	 */
	estimatedRemembered: number;
}

/**
 * Recall probability across the collection.
 *
 * `retrievabilityOf` is injected rather than computed here so this stays a pure
 * function: the real one is FSRS's forgetting curve, which lives in the
 * scheduler and carries its parameters.
 */
export function retrievability(
	cards: readonly Card[],
	retrievabilityOf: (card: Card) => number | null,
): RetrievabilityStats {
	const values: number[] = [];
	let estimatedRemembered = 0;

	for (const card of cards) {
		if (card.disabled) continue;
		const r = retrievabilityOf(card);
		if (r === null || !Number.isFinite(r)) continue;
		const clamped = Math.min(1, Math.max(0, r));
		values.push(clamped * 100);
		estimatedRemembered += clamped;
	}

	return {
		bins: histogram(values, 100, 10),
		cards: values.length,
		estimatedRemembered,
	};
}

// ── Hourly breakdown ──────────────────────────────────────────

/** One hour of the Hourly Breakdown graph. */
export interface HourBucket {
	hour: number;
	reviews: number;
	/** Answers of Hard or better. */
	passed: number;
}

/**
 * Reviews by hour of the local day.
 *
 * Local, via `getHours()`, so an hour repeated or skipped by a DST change lands
 * where the clock on the wall said it did — which is the only reading of "what
 * time do I study best" that means anything.
 */
export function hourlyBreakdown(entries: readonly ReviewLogEntry[]): HourBucket[] {
	const buckets: HourBucket[] = Array.from({ length: 24 }, (_, hour) => ({
		hour,
		reviews: 0,
		passed: 0,
	}));

	for (const entry of entries) {
		const bucket = buckets[new Date(entry.t).getHours()];
		if (!bucket) continue;
		bucket.reviews += 1;
		if (entry.r > 1) bucket.passed += 1;
	}

	return buckets;
}

// ── True retention ────────────────────────────────────────────

/**
 * An entry paired with the interval the card was *sitting on* when it was
 * answered — the previous entry's granted interval, in seconds.
 */
export interface EntryWithPriorInterval {
	entry: ReviewLogEntry;
	/** Null for a card's first logged review: nothing precedes it to ask. */
	priorIv: number | null;
}

/**
 * Annotate each entry with the interval it was answered at.
 *
 * This exists because an entry's own `iv` is the interval the answer
 * *produced*, and using it to judge maturity would be catastrophically wrong
 * for retention: answering a mature card Again collapses its interval to
 * minutes, so every failure would classify as young and get filtered out,
 * reporting retention as a flat 100%.
 *
 * The interval going in is the interval the previous review handed out, so a
 * per-card walk in timestamp order recovers it exactly.
 */
export function withPriorIntervals(
	entries: readonly ReviewLogEntry[],
): EntryWithPriorInterval[] {
	const ordered = [...entries].sort((a, b) => a.t - b.t);
	const lastIv = new Map<string, number>();

	return ordered.map((entry) => {
		const priorIv = lastIv.get(entry.c) ?? null;
		lastIv.set(entry.c, entry.iv);
		return { entry, priorIv };
	});
}

/** The True Retention panel. */
export interface RetentionStats {
	reviewed: number;
	passed: number;
	/** Pass rate, 0–1. Zero when nothing qualified. */
	rate: number;
	/**
	 * Mature reviews skipped because the card's history starts inside the log —
	 * there is no preceding entry to read an interval from. Reported rather than
	 * hidden, because on a young log it can be most of them.
	 */
	unknownInterval: number;
}

/**
 * Retention on mature cards: the share answered Hard or better.
 *
 * Two filters, both Anki's, both load-bearing:
 *
 *  - **Mature only.** Learning-step reviews are answered many times a day and
 *    would swamp the ratio with numbers that say nothing about memory.
 *  - **First review of a card per day.** Without it, failing a card and
 *    immediately re-answering it correctly would *raise* retention, which
 *    inverts the meaning of the graph.
 */
export function trueRetention(entries: readonly ReviewLogEntry[]): RetentionStats {
	const seen = new Set<string>();
	let reviewed = 0;
	let passed = 0;
	let unknownInterval = 0;

	for (const { entry, priorIv } of withPriorIntervals(entries)) {
		if (priorIv === null) {
			// Only worth reporting for reviews that could plausibly be mature;
			// a card's first-ever review never is.
			if (entry.iv >= MATURE_INTERVAL_SECONDS) unknownInterval += 1;
			continue;
		}
		if (priorIv < MATURE_INTERVAL_SECONDS) continue;

		const key = `${entry.c}|${dayKey(entry.t)}`;
		if (seen.has(key)) continue;
		seen.add(key);

		reviewed += 1;
		if (entry.r > 1) passed += 1;
	}

	return {
		reviewed,
		passed,
		rate: reviewed === 0 ? 0 : passed / reviewed,
		unknownInterval,
	};
}

// ── Formatting ────────────────────────────────────────────────

/** A duration as the compact string the panels show ("2h 14m", "45s"). */
export function formatDuration(ms: number): string {
	const seconds = Math.round(ms / 1000);
	if (seconds < 60) return `${String(seconds)}s`;

	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${String(minutes)}m`;

	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest === 0 ? `${String(hours)}h` : `${String(hours)}h ${String(rest)}m`;
}

/** An interval in days as an axis label ("3d", "5mo", "2.1y"). */
export function formatDays(days: number): string {
	if (days < 1) return `${String(Math.round(days * 24))}h`;
	if (days < 30) return `${String(Math.round(days))}d`;
	if (days < 365) return `${String(Math.round(days / 30))}mo`;
	return `${(days / 365).toFixed(1)}y`;
}

// ── Private helpers ───────────────────────────────────────────

function startOfDay(ms: number): number {
	const d = new Date(ms);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}
