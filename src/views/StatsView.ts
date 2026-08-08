import { ItemView, WorkspaceLeaf } from "obsidian";
import type OsmosisPlugin from "../main";
import { FSRSScheduler } from "../database/FSRSScheduler";
import type { Card } from "../database/types";
import { buildDeckTree, pruneDeckTree } from "../study/DeckTreeBuilder";
import type { DeckNode, DeckScope } from "../study/types";
import {
	aggregateAnswerButtons,
	aggregateRollup,
	type ReviewLogEntry,
	type Rollup,
} from "../store/ReviewLog";
import {
	calendarYear,
	cardCounts,
	cardsInScope,
	dailySeries,
	daysBefore,
	difficulties,
	entriesInScope,
	entriesSince,
	formatDays,
	formatDuration,
	futureDue,
	histogram,
	historyStartDay,
	hourlyBreakdown,
	intervalDays,
	percentile,
	retrievability,
	stabilityDays,
	studyModeFromEntries,
	studyModeTotals,
	todaySummary,
	trueRetention,
	yearsWithActivity,
	type DayPoint,
	type HistoryScope,
} from "../stats/aggregate";
import {
	barChart,
	calendarHeatmap,
	chartPanel,
	histogramChart,
	pieChart,
	renderEmpty,
	renderLegend,
	type BarDatum,
	type PieSlice,
	type Series,
} from "../stats/charts";

export const VIEW_TYPE_STATS = "osmosis-stats";

/** Colour tokens, resolved in `styles.css` so a theme swap repaints everything. */
const COLOR = {
	new: "var(--osmosis-series-new)",
	learning: "var(--osmosis-series-learning)",
	young: "var(--osmosis-series-young)",
	mature: "var(--osmosis-series-mature)",
	relearning: "var(--osmosis-series-relearning)",
	excluded: "var(--osmosis-series-excluded)",
} as const;

/**
 * The four bars of the Reviews and Review Time graphs, bottom to top.
 *
 * The order is the palette's validated adjacency, not an arbitrary reading
 * order: neighbouring segments in a stack are the pairs that must stay
 * distinguishable under colour-vision deficiency, and this sequence is the one
 * that clears the separation gates in both light and dark themes. Reordering
 * these breaks that guarantee.
 */
const CLASS_SERIES: readonly Series[] = [
	{ key: "learning", label: "Learning", color: COLOR.learning },
	{ key: "young", label: "Young", color: COLOR.young },
	{ key: "mature", label: "Mature", color: COLOR.mature },
	{ key: "relearning", label: "Relearning", color: COLOR.relearning },
];

const MODE_SERIES: readonly Series[] = [
	{ key: "sequential", label: "Sequential", color: COLOR.new },
	{ key: "contextual", label: "Contextual", color: COLOR.learning },
	{ key: "spatial", label: "Spatial", color: COLOR.young },
];

const MATURITY_SERIES: readonly Series[] = [
	{ key: "young", label: "Young", color: COLOR.young },
	{ key: "mature", label: "Mature", color: COLOR.mature },
];

/** Day counts behind the range pickers. */
const RANGES = { month: 30, quarter: 90, year: 365 } as const;

type RangeKey = keyof typeof RANGES | "all";
type IntervalRange = "month" | "p50" | "p95" | "all";

const CHART_HEIGHT = 200;
const HEATMAP_CELL = 13;

/**
 * Main-area view for study statistics.
 *
 * Two data paths feed it, and which one a graph uses is a function of the deck
 * scope rather than of the graph:
 *
 *   - **Whole collection** reads the cached day rollup, which costs no I/O at
 *     all. Everything day-bucketed draws on first paint.
 *   - **Any narrower deck scope** must read raw entries, because a review is
 *     joined to a deck through its card ID and the rollup deliberately holds
 *     none.
 *
 * The three per-review graphs at the bottom (hourly, answer buttons, true
 * retention) need raw entries either way, so they are loaded when they first
 * scroll into view — a reader who opens Stats for the heatmap never pays for a
 * parse of every shard.
 */
export class StatsView extends ItemView {
	private plugin!: OsmosisPlugin;
	private scheduler!: FSRSScheduler;

	private deckScope: DeckScope = { type: "all" };
	private history: HistoryScope = "12m";
	private reviewRange: RangeKey = "month";
	private timeRange: RangeKey = "month";
	private dueRange: RangeKey = "month";
	private dueBacklog = true;
	private intervalRange: IntervalRange = "p95";
	private year = new Date().getFullYear();

	/** Day-bucketed aggregates for the whole collection. Cheap; always present. */
	private rollup: Rollup = {};
	/** Raw entries. Null until something needs them. */
	private entries: ReviewLogEntry[] | null = null;
	private entriesLoading = false;

	private resizeObserver: ResizeObserver | null = null;
	/** Watches the detail panels for their first scroll into view. */
	private detailObserver: IntersectionObserver | null = null;
	private lastWidth = 0;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_STATS;
	}

	getDisplayText(): string {
		return "Osmosis stats";
	}

	getIcon(): string {
		return "bar-chart";
	}

	async onOpen(): Promise<void> {
		this.plugin = this.app.plugins.plugins["osmosis"] as OsmosisPlugin;
		this.scheduler = new FSRSScheduler({
			learningSteps: this.plugin.settings.learningSteps,
			relearningSteps: this.plugin.settings.relearningSteps,
		});

		// Synchronous and I/O-free: the first paint never waits on the vault.
		this.rollup = this.plugin.reviewLog.cachedRollup();
		this.render();

		// Then reconcile against any shard another device has synced in.
		void this.refreshRollup();

		this.resizeObserver = new ResizeObserver(() => {
			const width = this.contentEl.clientWidth;
			// Charts are drawn at a pixel width, so only a real width change
			// needs a redraw — a height change (the tab growing) does not.
			if (Math.abs(width - this.lastWidth) < 8) return;
			this.render();
		});
		this.resizeObserver.observe(this.contentEl);
	}

	async onClose(): Promise<void> {
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.detailObserver?.disconnect();
		this.detailObserver = null;
		this.contentEl.empty();
	}

	// ── Data ──────────────────────────────────────────────────

	private async refreshRollup(): Promise<void> {
		try {
			this.rollup = await this.plugin.reviewLog.getRollup();
		} catch (error) {
			// The cached rollup is already on screen; a failed refresh means
			// stale numbers, not a broken view.
			console.error("Osmosis: failed to refresh the review rollup", error);
			return;
		}
		this.render();
	}

	/** Parse raw shards once, then redraw whatever was waiting on them. */
	private async loadEntries(): Promise<void> {
		if (this.entries !== null || this.entriesLoading) return;
		this.entriesLoading = true;
		try {
			this.entries = await this.plugin.reviewLog.readAll();
		} catch (error) {
			console.error("Osmosis: failed to read the review log", error);
			this.entries = [];
		} finally {
			this.entriesLoading = false;
		}
		this.render();
	}

	/** Entries narrowed to the current deck and history scope, or null if unread. */
	private scopedEntries(): ReviewLogEntry[] | null {
		if (this.entries === null) return null;
		const byDeck = entriesInScope(this.entries, this.deckScope, (id) =>
			this.plugin.cardStore.getCard(id),
		);
		return entriesSince(byDeck, historyStartDay(Date.now(), this.history));
	}

	/**
	 * The day-bucketed data the volume graphs read.
	 *
	 * Under the whole collection this is the cached rollup. Under a deck scope
	 * it is rebuilt from the scoped entries — the same aggregation the cache
	 * itself is built with, so every downstream graph is identical either way
	 * and none of them needs to know which path it got.
	 */
	private scopedRollup(): Rollup | null {
		if (this.deckScope.type === "all") return this.rollup;
		const entries = this.scopedEntries();
		return entries === null ? null : aggregateRollup(entries);
	}

	private scopedCards(): Card[] {
		return cardsInScope(this.plugin.cardStore.getAllCards(), this.deckScope);
	}

	/** True when the current scope cannot be answered without a shard parse. */
	private needsEntries(): boolean {
		return this.deckScope.type !== "all";
	}

	// ── Render ────────────────────────────────────────────────

	private render(): void {
		const { contentEl } = this;
		const scrollTop = contentEl.scrollTop;
		this.lastWidth = contentEl.clientWidth;

		// The panels it was watching are about to be destroyed.
		this.detailObserver?.disconnect();

		contentEl.empty();
		contentEl.addClass("osmosis-stats-view");

		this.renderScopeBar(contentEl);

		const grid = contentEl.createDiv({ cls: "osmosis-stats-grid" });

		// Panels are built first and drawn second: a chart needs its own
		// measured width, and the grid has not laid out until the DOM exists.
		const draws: (() => void)[] = [];

		this.buildToday(grid, draws);
		this.buildFutureDue(grid, draws);
		this.buildCalendar(grid, draws);
		this.buildReviews(grid, draws);
		this.buildCardCounts(grid, draws);
		this.buildReviewTime(grid, draws);
		this.buildIntervals(grid, draws);
		this.buildStability(grid, draws);
		this.buildDifficulty(grid, draws);
		this.buildRetrievability(grid, draws);
		this.buildStudyMode(grid, draws);
		this.buildHourly(grid, draws);
		this.buildAnswerButtons(grid, draws);
		this.buildTrueRetention(grid, draws);

		// Each panel is drawn inside its own guard. They share one loop, so an
		// unguarded throw in any one of them blanks every panel after it — and
		// takes `render()` down with it, which on the first render means the
		// rollup refresh on the next line of `onOpen` never runs either. One
		// broken graph must cost one graph.
		for (const [index, draw] of draws.entries()) {
			try {
				draw();
			} catch (error) {
				console.error("Osmosis: a stats panel failed to draw", error);
				// Each builder above appends exactly one panel and pushes
				// exactly one draw, in the same order, so the nth panel is the
				// nth draw's. Report into it rather than leaving a blank card.
				grid.children.item(index)?.createDiv({
					cls: "osmosis-stats-empty",
					text: `This graph failed to draw: ${String(error)}`,
				});
			}
		}

		contentEl.scrollTop = scrollTop;

		if (this.needsEntries() && this.entries === null) void this.loadEntries();
	}

	private renderScopeBar(parent: HTMLElement): void {
		const bar = parent.createDiv({ cls: "osmosis-stats-scopebar" });

		const deckWrap = bar.createDiv({ cls: "osmosis-stats-scope-field" });
		deckWrap.createSpan({ cls: "osmosis-stats-scope-label", text: "Deck" });
		const select = deckWrap.createEl("select", { cls: "dropdown" });
		select.createEl("option", { value: "all", text: "Whole collection" });
		for (const option of this.deckOptions()) {
			select.createEl("option", { value: option.value, text: option.label });
		}
		select.value = scopeToValue(this.deckScope);
		select.addEventListener("change", () => {
			this.deckScope = valueToScope(select.value);
			this.render();
		});

		const historyWrap = bar.createDiv({ cls: "osmosis-stats-scope-field" });
		historyWrap.createSpan({ cls: "osmosis-stats-scope-label", text: "History" });
		this.segmented(
			historyWrap,
			[
				{ key: "12m", label: "12 months" },
				{ key: "all", label: "All" },
			],
			this.history,
			(key) => {
				this.history = key as HistoryScope;
				this.render();
			},
		);

		if (this.entriesLoading) {
			bar.createSpan({ cls: "osmosis-stats-loading", text: "Reading review log…" });
		}
	}

	/**
	 * Deck options, indented to show the hierarchy.
	 *
	 * Built from the same tree the sidebar renders, so the two agree about what
	 * a deck is. A deck with children is offered as a parent scope — selecting
	 * it includes its sub-decks, which is what `DeckScope` already models.
	 */
	private deckOptions(): { value: string; label: string }[] {
		const decks = this.plugin.cardStore.getAllDecks();
		const counts = this.plugin.cardStore.getCardCountsByDeck(Date.now());
		const folderDerived = this.plugin.cardStore.getFolderDerivedDecks();

		const keepPaths = new Set(decks);
		for (const deck of decks) {
			if (folderDerived.has(deck)) continue;
			const parts = deck.split("/");
			for (let i = 1; i < parts.length; i++) keepPaths.add(parts.slice(0, i).join("/"));
		}
		const tree = pruneDeckTree(buildDeckTree(decks, counts), keepPaths);

		const options: { value: string; label: string }[] = [];
		const walk = (nodes: DeckNode[], depth: number): void => {
			for (const node of nodes) {
				const scope: DeckScope =
					node.children.length > 0
						? { type: "parent", deck: node.fullPath }
						: { type: "single", deck: node.fullPath };
				options.push({
					value: scopeToValue(scope),
					label: `${"  ".repeat(depth)}${node.name}`,
				});
				walk(node.children, depth + 1);
			}
		};
		walk(tree, 0);
		return options;
	}

	// ── Panels ────────────────────────────────────────────────

	/**
	 * Today. Deliberately ignores the history scope — "today" is not a window
	 * into history, it is the session you are in the middle of.
	 */
	private buildToday(parent: HTMLElement, draws: (() => void)[]): void {
		const rollup = this.scopedRollup();
		const plot = chartPanel(parent, "Today", "Always today, whatever the history scope.");

		draws.push(() => {
			if (rollup === null) {
				renderEmpty(plot, "Reading review log…");
				return;
			}
			const today = todaySummary(rollup, Date.now());
			const tiles = plot.createDiv({ cls: "osmosis-stats-tiles" });
			this.tile(tiles, "Reviews", today.reviews.toLocaleString());
			this.tile(tiles, "Time", formatDuration(today.timeMs));
			this.tile(
				tiles,
				"Again",
				today.reviews === 0
					? "—"
					: `${String(Math.round((today.againCount / today.reviews) * 100))}%`,
			);

			if (today.reviews === 0) {
				renderEmpty(plot, "Nothing studied yet today.");
				return;
			}
			renderLegend(plot, CLASS_SERIES, today.byClass);
		});
	}

	private buildFutureDue(parent: HTMLElement, draws: (() => void)[]): void {
		const plot = chartPanel(parent, "Future due", "Cards coming up, by day.");
		this.rangePicker(plot, this.dueRange, (key) => {
			this.dueRange = key;
			this.render();
		});

		const toggle = plot.createEl("label", { cls: "osmosis-stats-toggle" });
		const checkbox = toggle.createEl("input", { type: "checkbox" });
		checkbox.checked = this.dueBacklog;
		toggle.createSpan({ text: "Show backlog" });
		checkbox.addEventListener("change", () => {
			this.dueBacklog = checkbox.checked;
			this.render();
		});

		draws.push(() => {
			const days = this.dueRange === "all" ? 365 : RANGES[this.dueRange];
			const result = futureDue(this.scopedCards(), Date.now(), days);

			const summary = plot.createDiv({ cls: "osmosis-stats-summary" });
			summary.setText(
				`${result.total.toLocaleString()} cards due over ${String(days)} days` +
					` · ${result.daysWithLoad.toLocaleString()} days with load` +
					(this.dueBacklog ? ` · ${result.backlog.toLocaleString()} overdue` : ""),
			);

			if (result.total === 0 && result.backlog === 0) {
				renderEmpty(plot, "No cards are scheduled yet.");
				return;
			}

			const data: BarDatum[] = result.buckets.map((count, offset) => ({
				label: offset === 0 ? "Today" : `+${String(offset)}d`,
				values: { due: count },
				tooltip: `${offset === 0 ? "Today" : `In ${String(offset)} days`}: ${count.toLocaleString()} cards`,
			}));

			if (this.dueBacklog && result.backlog > 0) {
				// Backlog leads the axis as its own column rather than being
				// folded into today: a year of accumulated overdue cards added
				// to day 0 flattens every other bar to nothing.
				data.unshift({
					label: "Late",
					values: { due: result.backlog },
					tooltip: `Overdue: ${result.backlog.toLocaleString()} cards`,
				});
			}

			barChart(plot, {
				width: this.plotWidth(plot),
				height: CHART_HEIGHT,
				data,
				series: [{ key: "due", label: "Due", color: COLOR.new }],
				mode: "stacked",
				formatValue: (v) => Math.round(v).toLocaleString(),
			});
		});
	}

	private buildCalendar(parent: HTMLElement, draws: (() => void)[]): void {
		const rollup = this.scopedRollup();
		const plot = chartPanel(parent, "Calendar", "A year of study, one square per day.");

		const years = yearsWithActivity(rollup ?? {}, Date.now());
		const stepper = plot.createDiv({ cls: "osmosis-stats-stepper" });
		for (const year of years) {
			const btn = stepper.createEl("button", {
				cls: `osmosis-stats-seg${year === this.year ? " osmosis-stats-seg-active" : ""}`,
				text: String(year),
			});
			btn.addEventListener("click", () => {
				this.year = year;
				this.render();
			});
		}

		draws.push(() => {
			if (rollup === null) {
				renderEmpty(plot, "Reading review log…");
				return;
			}
			const grid = calendarYear(rollup, this.year);

			plot.createDiv({
				cls: "osmosis-stats-summary",
				text:
					`${grid.total.toLocaleString()} reviews on ${grid.daysStudied.toLocaleString()} days` +
					` · busiest ${grid.busiestCount.toLocaleString()}`,
			});

			calendarHeatmap(plot, {
				days: grid.days,
				weeks: grid.weeks,
				busiest: grid.busiestCount,
				cell: HEATMAP_CELL,
				describe: (day) =>
					day.count === 0
						? `${day.day}: no reviews`
						: `${day.day}: ${day.count.toLocaleString()} reviews`,
			});
		});
	}

	private buildReviews(parent: HTMLElement, draws: (() => void)[]): void {
		const rollup = this.scopedRollup();
		const plot = chartPanel(parent, "Reviews", "Answers per day, split by card maturity.");
		this.rangePicker(plot, this.reviewRange, (key) => {
			this.reviewRange = key;
			this.render();
		});

		draws.push(() => {
			if (rollup === null) {
				renderEmpty(plot, "Reading review log…");
				return;
			}
			const points = this.seriesForRange(rollup, this.reviewRange);
			const totals = sumByClass(points, "byClass");

			if (sumValues(totals) === 0) {
				renderEmpty(plot, "No reviews in this range yet.");
				return;
			}

			barChart(plot, {
				width: this.plotWidth(plot),
				height: CHART_HEIGHT,
				data: points.map((point) => ({
					label: shortDay(point.day),
					values: point.byClass,
					tooltip: `${point.day}: ${point.reviews.toLocaleString()} reviews`,
				})),
				series: CLASS_SERIES,
				mode: "stacked",
				formatValue: (v) => Math.round(v).toLocaleString(),
			});
			renderLegend(plot, CLASS_SERIES, totals);
		});
	}

	private buildReviewTime(parent: HTMLElement, draws: (() => void)[]): void {
		const rollup = this.scopedRollup();
		const plot = chartPanel(parent, "Review time", "Time on screen per day.");
		this.rangePicker(plot, this.timeRange, (key) => {
			this.timeRange = key;
			this.render();
		});

		draws.push(() => {
			if (rollup === null) {
				renderEmpty(plot, "Reading review log…");
				return;
			}
			const points = this.seriesForRange(rollup, this.timeRange);
			const totals = sumByClass(points, "timeByClass");

			if (sumValues(totals) === 0) {
				renderEmpty(plot, "No reviews in this range yet.");
				return;
			}

			// Plotted in minutes: a day of study is millions of milliseconds,
			// and an axis of those is unreadable.
			barChart(plot, {
				width: this.plotWidth(plot),
				height: CHART_HEIGHT,
				data: points.map((point) => ({
					label: shortDay(point.day),
					values: mapValues(point.timeByClass, (ms) => ms / 60_000),
					tooltip: `${point.day}: ${formatDuration(point.timeMs)}`,
				})),
				series: CLASS_SERIES,
				mode: "stacked",
				formatValue: (v) => `${String(Math.round(v))}m`,
			});
			renderLegend(plot, CLASS_SERIES, totals, formatDuration);
		});
	}

	private buildCardCounts(parent: HTMLElement, draws: (() => void)[]): void {
		const plot = chartPanel(parent, "Card counts", "Every card in scope, by state.");

		draws.push(() => {
			const counts = cardCounts(this.scopedCards());
			// Slice order is the palette's validated adjacency; "Excluded" is
			// last and grey because it is out of play, not another state.
			const slices: PieSlice[] = [
				{ key: "new", label: "New", color: COLOR.new, value: counts.new },
				{ key: "learning", label: "Learning", color: COLOR.learning, value: counts.learning },
				{ key: "young", label: "Young", color: COLOR.young, value: counts.young },
				{ key: "mature", label: "Mature", color: COLOR.mature, value: counts.mature },
				{
					key: "relearning",
					label: "Relearning",
					color: COLOR.relearning,
					value: counts.relearning,
				},
				{ key: "excluded", label: "Excluded", color: COLOR.excluded, value: counts.excluded },
			];

			const total = slices.reduce((sum, slice) => sum + slice.value, 0);
			plot.createDiv({
				cls: "osmosis-stats-summary",
				text: `${total.toLocaleString()} cards`,
			});

			pieChart(plot, slices, Math.min(200, this.plotWidth(plot)));
			renderLegend(
				plot,
				slices.map((slice) => ({ key: slice.key, label: slice.label, color: slice.color })),
				Object.fromEntries(slices.map((slice) => [slice.key, slice.value])),
			);
		});
	}

	private buildIntervals(parent: HTMLElement, draws: (() => void)[]): void {
		const plot = chartPanel(parent, "Review intervals", "How far out cards are scheduled.");

		this.segmented(
			plot,
			[
				{ key: "month", label: "1 month" },
				{ key: "p50", label: "50%" },
				{ key: "p95", label: "95%" },
				{ key: "all", label: "All" },
			],
			this.intervalRange,
			(key) => {
				this.intervalRange = key as IntervalRange;
				this.render();
			},
		);

		draws.push(() => {
			const values = intervalDays(this.scopedCards());
			if (values.length === 0) {
				renderEmpty(plot, "No scheduled cards yet.");
				return;
			}

			// The percentile caps exist because a handful of multi-year
			// intervals would otherwise squeeze the whole distribution into the
			// first column.
			const max =
				this.intervalRange === "month"
					? 30
					: this.intervalRange === "p50"
						? percentile(values, 0.5)
						: this.intervalRange === "p95"
							? percentile(values, 0.95)
							: Math.max(...values);

			plot.createDiv({
				cls: "osmosis-stats-summary",
				text:
					`${values.length.toLocaleString()} cards · median ` +
					`${formatDays(percentile(values, 0.5))}`,
			});

			histogramChart(plot, {
				width: this.plotWidth(plot),
				height: CHART_HEIGHT,
				bins: histogram(values, Math.max(1, max), 20),
				color: COLOR.new,
				formatBin: formatDays,
				showCumulative: true,
			});
		});
	}

	private buildStability(parent: HTMLElement, draws: (() => void)[]): void {
		const plot = chartPanel(parent, "Card stability", "FSRS stability — days until recall falls to 90%.");

		draws.push(() => {
			const values = stabilityDays(this.scopedCards());
			if (values.length === 0) {
				renderEmpty(plot, "No reviewed cards yet.");
				return;
			}
			plot.createDiv({
				cls: "osmosis-stats-summary",
				text:
					`${values.length.toLocaleString()} cards · median ` +
					`${formatDays(percentile(values, 0.5))}`,
			});
			histogramChart(plot, {
				width: this.plotWidth(plot),
				height: CHART_HEIGHT,
				bins: histogram(values, Math.max(1, percentile(values, 0.95)), 20),
				color: COLOR.mature,
				formatBin: formatDays,
				showCumulative: true,
			});
		});
	}

	private buildDifficulty(parent: HTMLElement, draws: (() => void)[]): void {
		const plot = chartPanel(parent, "Card difficulty", "FSRS difficulty, 1 (easiest) to 10.");

		draws.push(() => {
			const values = difficulties(this.scopedCards());
			if (values.length === 0) {
				renderEmpty(plot, "No reviewed cards yet.");
				return;
			}
			plot.createDiv({
				cls: "osmosis-stats-summary",
				text:
					`${values.length.toLocaleString()} cards · median ` +
					`${percentile(values, 0.5).toFixed(1)}`,
			});
			histogramChart(plot, {
				width: this.plotWidth(plot),
				height: CHART_HEIGHT,
				bins: histogram(values, 10, 10),
				color: COLOR.relearning,
				formatBin: (v) => v.toFixed(0),
				showCumulative: false,
			});
		});
	}

	private buildRetrievability(parent: HTMLElement, draws: (() => void)[]): void {
		const plot = chartPanel(
			parent,
			"Card retrievability",
			"Probability each card would be recalled right now.",
		);

		draws.push(() => {
			const now = Date.now();
			const stats = retrievability(this.scopedCards(), (card) =>
				this.scheduler.retrievability(
					{
						stability: card.stability ?? 0,
						difficulty: card.difficulty ?? 0,
						due: card.due ?? now,
						lastReview: card.lastReview ?? null,
						reps: card.reps ?? 0,
						lapses: card.lapses ?? 0,
						state: card.state ?? "new",
						learningSteps: card.learningSteps ?? 0,
					},
					now,
				),
			);

			if (stats.cards === 0) {
				renderEmpty(plot, "No reviewed cards yet.");
				return;
			}

			plot.createDiv({
				cls: "osmosis-stats-summary",
				text:
					`${stats.cards.toLocaleString()} cards · about ` +
					`${String(Math.round(stats.estimatedRemembered))} remembered right now`,
			});

			histogramChart(plot, {
				width: this.plotWidth(plot),
				height: CHART_HEIGHT,
				bins: stats.bins,
				color: COLOR.young,
				formatBin: (v) => `${String(Math.round(v))}%`,
				showCumulative: false,
			});
		});
	}

	private buildStudyMode(parent: HTMLElement, draws: (() => void)[]): void {
		const rollup = this.scopedRollup();
		const plot = chartPanel(
			parent,
			"Study mode",
			"Which surface your answers came from. Osmosis-native; Anki has no equivalent.",
		);

		draws.push(() => {
			if (rollup === null) {
				renderEmpty(plot, "Reading review log…");
				return;
			}
			const points = this.seriesForRange(rollup, this.history === "all" ? "all" : "year");
			const scoped = this.scopedEntries();
			const totals =
				this.deckScope.type === "all" || scoped === null
					? studyModeTotals(points, rollup)
					: studyModeFromEntries(scoped);

			if (sumValues(totals) === 0) {
				renderEmpty(plot, "No reviews recorded yet.");
				return;
			}

			barChart(plot, {
				width: this.plotWidth(plot),
				height: 120,
				data: MODE_SERIES.map((series) => ({
					label: series.label,
					values: { [series.key]: totals[series.key as keyof typeof totals] },
					tooltip: `${series.label}: ${totals[
						series.key as keyof typeof totals
					].toLocaleString()} reviews`,
				})),
				series: MODE_SERIES,
				// Stacked, not grouped: each column carries exactly one mode's
				// value, so grouping would divide the slot three ways and leave
				// each bar a third-width sliver hugging the left of its column.
				// One non-zero segment in a stack is a full-width bar.
				mode: "stacked",
				formatValue: (v) => Math.round(v).toLocaleString(),
				labelEvery: 1,
			});
			renderLegend(plot, MODE_SERIES, totals);
		});
	}

	private buildHourly(parent: HTMLElement, draws: (() => void)[]): void {
		const plot = chartPanel(parent, "Hourly breakdown", "When you study, and how it goes.");

		draws.push(() => {
			const entries = this.requireEntries(plot);
			if (entries === null) return;

			const buckets = hourlyBreakdown(entries);
			if (buckets.every((bucket) => bucket.reviews === 0)) {
				renderEmpty(plot, "No reviews recorded yet.");
				return;
			}

			const width = this.plotWidth(plot);
			barChart(plot, {
				width,
				height: 150,
				data: buckets.map((bucket) => ({
					label: `${String(bucket.hour)}`,
					values: { reviews: bucket.reviews },
					tooltip:
						`${String(bucket.hour)}:00 — ${bucket.reviews.toLocaleString()} reviews` +
						(bucket.reviews === 0
							? ""
							: `, ${String(Math.round((bucket.passed / bucket.reviews) * 100))}% correct`),
				})),
				series: [{ key: "reviews", label: "Reviews", color: COLOR.new }],
				mode: "stacked",
				formatValue: (v) => Math.round(v).toLocaleString(),
				labelEvery: 3,
			});

			// Success rate is a second measure on a different scale, so it gets
			// its own frame rather than a second y-axis on the frame above.
			plot.createDiv({ cls: "osmosis-stats-subtitle", text: "Correct answers, %" });
			barChart(plot, {
				width,
				height: 110,
				data: buckets.map((bucket) => ({
					label: `${String(bucket.hour)}`,
					values: {
						rate: bucket.reviews === 0 ? 0 : (bucket.passed / bucket.reviews) * 100,
					},
					tooltip:
						bucket.reviews === 0
							? `${String(bucket.hour)}:00 — no reviews`
							: `${String(bucket.hour)}:00 — ${String(
									Math.round((bucket.passed / bucket.reviews) * 100),
								)}% correct`,
				})),
				series: [{ key: "rate", label: "Correct", color: COLOR.young }],
				mode: "stacked",
				formatValue: (v) => `${String(Math.round(v))}%`,
				labelEvery: 3,
			});
		});
	}

	private buildAnswerButtons(parent: HTMLElement, draws: (() => void)[]): void {
		const plot = chartPanel(parent, "Answer buttons", "Which button you press, by card maturity.");

		draws.push(() => {
			const entries = this.requireEntries(plot);
			if (entries === null) return;

			const counts = aggregateAnswerButtons(entries, (id) => this.plugin.cardStore.getCard(id));
			const labels = ["Again", "Hard", "Good", "Easy"] as const;
			const totalYoung = sumValues(counts.young);
			const totalMature = sumValues(counts.mature);

			if (totalYoung + totalMature === 0) {
				renderEmpty(plot, "No reviews of resolvable cards yet.");
				return;
			}

			barChart(plot, {
				width: this.plotWidth(plot),
				height: CHART_HEIGHT,
				data: labels.map((label, index) => {
					const rating = (index + 1) as 1 | 2 | 3 | 4;
					return {
						label,
						values: { young: counts.young[rating], mature: counts.mature[rating] },
						tooltip:
							`${label} — young ${counts.young[rating].toLocaleString()},` +
							` mature ${counts.mature[rating].toLocaleString()}`,
					};
				}),
				series: MATURITY_SERIES,
				mode: "grouped",
				formatValue: (v) => Math.round(v).toLocaleString(),
				labelEvery: 1,
			});

			renderLegend(plot, MATURITY_SERIES, { young: totalYoung, mature: totalMature });

			if (counts.excluded > 0) {
				plot.createDiv({
					cls: "osmosis-stats-note",
					text: `${counts.excluded.toLocaleString()} reviews left out — their card no longer resolves.`,
				});
			}
		});
	}

	private buildTrueRetention(parent: HTMLElement, draws: (() => void)[]): void {
		const plot = chartPanel(
			parent,
			"True retention",
			`Mature cards only (interval ≥ 21 days), first review of each card per day.`,
		);

		draws.push(() => {
			const entries = this.requireEntries(plot);
			if (entries === null) return;

			const stats = trueRetention(entries);
			const tiles = plot.createDiv({ cls: "osmosis-stats-tiles" });
			this.tile(
				tiles,
				"Retention",
				stats.reviewed === 0 ? "—" : `${String(Math.round(stats.rate * 100))}%`,
			);
			this.tile(tiles, "Mature reviews", stats.reviewed.toLocaleString());
			this.tile(tiles, "Passed", stats.passed.toLocaleString());

			if (stats.reviewed === 0) {
				renderEmpty(plot, "No mature reviews in this range yet.");
			}

			if (stats.unknownInterval > 0) {
				plot.createDiv({
					cls: "osmosis-stats-note",
					text:
						`${stats.unknownInterval.toLocaleString()} mature reviews left out — ` +
						"their card's history starts before the log did.",
				});
			}
		});
	}

	// ── Small pieces ──────────────────────────────────────────

	/**
	 * Entries, or a placeholder plus a load kicked off when they first scroll
	 * into view.
	 *
	 * The observer is what keeps the promise that opening this view costs no
	 * shard parse: these three panels sit below the fold, so a reader who came
	 * for the heatmap never triggers one.
	 */
	private requireEntries(plot: HTMLElement): ReviewLogEntry[] | null {
		const scoped = this.scopedEntries();
		if (scoped !== null) return scoped;

		renderEmpty(plot, this.entriesLoading ? "Reading review log…" : "Scroll to load…");
		if (this.entriesLoading) return null;

		// One observer for all three detail panels, replaced wholesale on each
		// render — a fresh observer per panel per render would pile up across
		// every scope change and resize.
		this.detailObserver ??= new IntersectionObserver((records) => {
			if (!records.some((record) => record.isIntersecting)) return;
			this.detailObserver?.disconnect();
			this.detailObserver = null;
			void this.loadEntries();
		});
		this.detailObserver.observe(plot);
		return null;
	}

	private tile(parent: HTMLElement, label: string, value: string): void {
		const tile = parent.createDiv({ cls: "osmosis-stats-tile" });
		tile.createDiv({ cls: "osmosis-stats-tile-label", text: label });
		tile.createDiv({ cls: "osmosis-stats-tile-value", text: value });
	}

	private segmented(
		parent: HTMLElement,
		options: readonly { key: string; label: string }[],
		active: string,
		onPick: (key: string) => void,
	): void {
		const group = parent.createDiv({ cls: "osmosis-stats-segmented" });
		for (const option of options) {
			const btn = group.createEl("button", {
				cls: `osmosis-stats-seg${option.key === active ? " osmosis-stats-seg-active" : ""}`,
				text: option.label,
			});
			btn.addEventListener("click", () => {
				onPick(option.key);
			});
		}
	}

	private rangePicker(
		parent: HTMLElement,
		active: RangeKey,
		onPick: (key: RangeKey) => void,
	): void {
		this.segmented(
			parent,
			[
				{ key: "month", label: "1 month" },
				{ key: "quarter", label: "3 months" },
				{ key: "year", label: "1 year" },
			],
			active,
			(key) => {
				onPick(key as RangeKey);
			},
		);
	}

	private seriesForRange(rollup: Rollup, range: RangeKey): DayPoint[] {
		const now = Date.now();
		const days = range === "all" ? 365 : RANGES[range];
		return dailySeries(rollup, daysBefore(now, days - 1), now);
	}

	/** The pixel width a chart should draw at, floored so it never collapses. */
	private plotWidth(plot: HTMLElement): number {
		return Math.max(280, plot.clientWidth);
	}
}

// ── Private helpers ───────────────────────────────────────────

function scopeToValue(scope: DeckScope): string {
	return scope.type === "all" ? "all" : `${scope.type}:${scope.deck}`;
}

function valueToScope(value: string): DeckScope {
	if (value === "all") return { type: "all" };
	const separator = value.indexOf(":");
	const type = value.slice(0, separator);
	const deck = value.slice(separator + 1);
	return type === "parent" ? { type: "parent", deck } : { type: "single", deck };
}

function sumValues(counts: Readonly<Record<string, number>>): number {
	return Object.values(counts).reduce((sum, value) => sum + value, 0);
}

function sumByClass(
	points: readonly DayPoint[],
	field: "byClass" | "timeByClass",
): Record<string, number> {
	const totals: Record<string, number> = {
		learning: 0,
		young: 0,
		mature: 0,
		relearning: 0,
	};
	for (const point of points) {
		for (const [key, value] of Object.entries(point[field])) {
			totals[key] = (totals[key] ?? 0) + value;
		}
	}
	return totals;
}

function mapValues(
	values: Readonly<Record<string, number>>,
	transform: (value: number) => number,
): Record<string, number> {
	return Object.fromEntries(
		Object.entries(values).map(([key, value]) => [key, transform(value)]),
	);
}

/** A day key as a compact axis label ("7 Aug"). */
function shortDay(day: string): string {
	const [, month, date] = day.split("-");
	const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	const index = Number(month) - 1;
	return `${String(Number(date))} ${months[index] ?? ""}`;
}
