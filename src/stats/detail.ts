import type { CardType, StudyMode } from "../database/types";
import {
	MATURE_INTERVAL_SECONDS,
	dayKey,
	foldEntryIntoRollup,
	type AnswerButtonCounts,
	type ReviewLogEntry,
	type Rollup,
} from "../store/ReviewLog";
import {
	GRADUATED_INTERVAL_SECONDS,
	RETENTION_PERIODS,
	finishRecall,
	foldIntoRecall,
	retentionWindowStart,
	type CardResolver,
	type HourBucket,
	type RecallStats,
	type RecallTotals,
	type RetentionPeriod,
} from "./aggregate";

/**
 * The detail half of the stats dashboard, computed by streaming the review log
 * instead of materialising it.
 *
 * Six panels each want a different cut of the same reviews. Reading the log
 * once per panel would mean six full passes over the shards; reading it once
 * into an array would mean holding every review in memory, which is what this
 * replaces — five heavy years is ~900,000 entries, hundreds of megabytes of
 * heap, and a Stats tab that freezes on open. So one pass feeds every
 * accumulator, and each entry is dropped as soon as it has been counted.
 *
 * Nothing here reads a clock or a card's current schedule beyond the deck join
 * the scope filter needs: `now` is a constructor argument, and maturity comes
 * from the entry's own `pi`. That is what makes these numbers stable — a graph
 * that consulted the live schedule would rewrite its own history every time a
 * card matured.
 */

/** Everything the detail panels draw, from one pass over the log. */
export interface DetailStats {
	/** Day buckets for the scoped volume graphs — the deck-scoped rollup. */
	rollup: Rollup;
	/** IDs of every card counted, for the mode-filtered card graphs. */
	reviewedCards: Set<string>;
	/** Reviews per study surface. */
	modeTotals: Record<StudyMode, number>;
	hours: HourBucket[];
	answerButtons: AnswerButtonCounts;
	/** True retention over each window in `RETENTION_PERIODS`. */
	retention: RetentionPeriod[];
	byMode: Map<StudyMode, RecallStats>;
	byType: Map<CardType, RecallStats>;
	byNote: Map<string, RecallStats>;
}

/** One retention window mid-accumulation. */
interface RetentionTotals {
	/** First timestamp the window includes; null is all history. */
	since: number | null;
	reviewed: number;
	passed: number;
}

/**
 * Consumes review log entries one at a time and reports what the detail panels
 * need. Feed it with `add`, read it with `result`.
 */
export class DetailAccumulator {
	private readonly rollup: Rollup = {};
	private readonly reviewedCards = new Set<string>();
	private readonly modeTotals: Record<StudyMode, number> = {
		sequential: 0,
		contextual: 0,
		spatial: 0,
	};
	private readonly hours: HourBucket[] = Array.from({ length: 24 }, (_, hour) => ({
		hour,
		reviews: 0,
		passed: 0,
	}));
	private readonly answerButtons: AnswerButtonCounts = {
		young: { 1: 0, 2: 0, 3: 0, 4: 0 },
		mature: { 1: 0, 2: 0, 3: 0, 4: 0 },
	};

	private readonly retention: RetentionTotals[];
	/**
	 * Card-days already counted toward retention, and toward recall.
	 *
	 * Two sets rather than one because the two filters admit different reviews:
	 * retention counts from 21 days, recall from one. Five retention *windows*
	 * share a single set, though — the windows are nested, so which of them a
	 * counted card-day belongs to follows from its own timestamp.
	 */
	private readonly retentionSeen = new Set<string>();
	private readonly recallSeen = new Set<string>();

	private readonly byMode = new Map<StudyMode, RecallTotals>();
	private readonly byType = new Map<CardType, RecallTotals>();
	private readonly byNote = new Map<string, RecallTotals>();

	constructor(
		private readonly now: number,
		private readonly resolveCard: CardResolver,
	) {
		this.retention = RETENTION_PERIODS.map(({ days }) => ({
			since: retentionWindowStart(now, days),
			reviewed: 0,
			passed: 0,
		}));
	}

	/** Count one review. Everything it contributes is folded in immediately. */
	add(entry: ReviewLogEntry): void {
		foldEntryIntoRollup(this.rollup, entry);
		this.reviewedCards.add(entry.c);
		this.modeTotals[entry.m] += 1;

		const hour = this.hours[new Date(entry.t).getHours()];
		if (hour) {
			hour.reviews += 1;
			if (entry.r > 1) hour.passed += 1;
		}

		const bucket = entry.pi >= MATURE_INTERVAL_SECONDS
			? this.answerButtons.mature
			: this.answerButtons.young;
		bucket[entry.r] += 1;

		const cardDay = `${entry.c}|${dayKey(entry.t)}`;
		this.addRetention(entry, cardDay);
		this.addRecall(entry, cardDay);
	}

	result(): DetailStats {
		return {
			rollup: this.rollup,
			reviewedCards: this.reviewedCards,
			modeTotals: this.modeTotals,
			hours: this.hours,
			answerButtons: this.answerButtons,
			retention: RETENTION_PERIODS.map(({ label, days }, index) => {
				const totals = this.retention[index];
				const reviewed = totals?.reviewed ?? 0;
				const passed = totals?.passed ?? 0;
				return {
					label,
					days,
					stats: { reviewed, passed, rate: reviewed === 0 ? 0 : passed / reviewed },
				};
			}),
			byMode: finishRecall(this.byMode),
			byType: finishRecall(this.byType),
			byNote: finishRecall(this.byNote),
		};
	}

	// ── Private Helpers ───────────────────────────────────────

	/**
	 * Retention on mature cards: the share answered Hard or better.
	 *
	 * Two filters, both Anki's, both load-bearing:
	 *
	 *  - **Mature only**, read from `pi` — the interval the card was answered
	 *    *at*. Its own `iv` would be catastrophically wrong here: answering a
	 *    mature card Again collapses its interval to minutes, so every failure
	 *    would classify as young and get filtered out, reporting a flat 100%.
	 *  - **First review of a card per day.** Removing this was considered and
	 *    rejected: the maturity filter covers the lapse-then-recover case it was
	 *    written for (a failed card drops to relearning, so the re-answer's `pi`
	 *    is minutes) but *not* answering an already-passed mature card a second
	 *    time the same day, which contextual and spatial study both allow and
	 *    which would count the same card twice.
	 *
	 * "First" is the first entry the scan reaches, which within a shard is
	 * chronological. Two devices that reviewed the same card on the same day can
	 * therefore have either answer counted — the alternative is sorting the
	 * whole log, which is the memory cost this design exists to avoid.
	 */
	private addRetention(entry: ReviewLogEntry, cardDay: string): void {
		if (entry.pi < MATURE_INTERVAL_SECONDS) return;
		if (this.retentionSeen.has(cardDay)) return;
		this.retentionSeen.add(cardDay);

		for (const window of this.retention) {
			if (window.since !== null && entry.t < window.since) continue;
			window.reviewed += 1;
			if (entry.r > 1) window.passed += 1;
		}
	}

	/**
	 * Recall grouped three ways at once — by study surface, by card type, by
	 * note — because the only thing that differs between those questions is the
	 * grouping key. The filtering underneath is subtle enough that three copies
	 * of it would be three chances to get it subtly different.
	 *
	 * An unresolvable card contributes to `byMode` but to neither of the others:
	 * a review whose card is gone still happened on a surface, but it belongs to
	 * no note and no type. Resolvability is a property of the card rather than
	 * the review, so it cannot differ between two entries sharing a card-day and
	 * the shared dedup set is safe.
	 */
	private addRecall(entry: ReviewLogEntry, cardDay: string): void {
		if (entry.pi < GRADUATED_INTERVAL_SECONDS) return;
		if (this.recallSeen.has(cardDay)) return;
		this.recallSeen.add(cardDay);

		foldIntoRecall(this.byMode, entry.m, entry);

		const card = this.resolveCard(entry.c);
		if (!card) return;
		foldIntoRecall(this.byType, card.cardType, entry);
		foldIntoRecall(this.byNote, card.notePath, entry);
	}
}
