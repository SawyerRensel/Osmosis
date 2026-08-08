import { ItemView, setIcon, WorkspaceLeaf } from "obsidian";
import type OsmosisPlugin from "../main";
import { FSRSScheduler } from "../database/FSRSScheduler";
import type { Card, CardType, StudyMode } from "../database/types";
import { buildDeckTree, pruneDeckTree } from "../study/DeckTreeBuilder";
import type { DeckNode, DeckScope } from "../study/types";
import {
	aggregateAnswerButtons,
	aggregateRollup,
	type ReviewLogEntry,
	type Rollup,
} from "../store/ReviewLog";
import {
	bucketPoints,
	calendarYear,
	cardsReviewedInMode,
	cardCounts,
	cardsInScope,
	dailySeries,
	daysBefore,
	difficulties,
	entriesInMode,
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
	rankByRecall,
	recallBy,
	retentionByPeriod,
	retrievability,
	stabilityDays,
	studyModeFromEntries,
	studyModeTotals,
	todaySummary,
	trueRetention,
	yearsWithActivity,
	type DayPoint,
	type Granularity,
	type HistoryScope,
	type ModeFilter,
	type RecallStats,
	type SeriesBucket,
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
import { orderPanels } from "../stats/panelOrder";

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

/**
 * Card types in reading order, with the labels the dashboard shows.
 *
 * "Basic" rather than the internal `explicit`: the union is named for how the
 * parser sees a fence, but a reader is choosing between ways of writing a card.
 */
const CARD_TYPE_LABELS: Record<CardType, string> = {
	explicit: "Basic",
	explicit_bidi: "Bidirectional",
	explicit_cloze: "Cloze",
	code_cloze: "Code cloze",
	line: "Line",
};

const CARD_TYPE_ORDER: readonly CardType[] = [
	"explicit",
	"explicit_bidi",
	"explicit_cloze",
	"code_cloze",
	"line",
];

/** Below this, a note's recall rate is noise rather than a finding. */
const MIN_NOTE_REVIEWS = 5;
/** A worklist, not a census. */
const WEAKEST_NOTE_LIMIT = 10;

const CHART_HEIGHT = 200;
const HEATMAP_CELL = 13;

/** Hold before a touch on a grip arms a drag, and the slop that cancels it. */
const HOLD_MS = 200;
const TOUCH_SLOP = 10;
/** How near the view's edge a drag scrolls it, and how fast. */
const EDGE_ZONE = 60;
const EDGE_SPEED = 15;
const EDGE_INTERVAL_MS = 16;
/** Where the finger holds the drag clone. */
const CLONE_GRAB = { x: 40, y: 24 } as const;

/**
 * One panel of the dashboard: its builder, plus the ID the saved order is
 * written in terms of.
 *
 * The IDs are persisted in `statsPanelOrder`, so they are saved data — renaming
 * one resets that panel to the bottom of every reader's arrangement.
 */
interface PanelBuilder {
	id: string;
	build: (grid: HTMLElement, draws: (() => void)[]) => void;
}

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
	private modeFilter: ModeFilter = "all";
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
	/** The panel currently being dragged, on either path. */
	private dragging: HTMLElement | null = null;
	/** Touch drag: the clone under the finger, and where the finger has been. */
	private touchClone: HTMLElement | null = null;
	private touchStart: { x: number; y: number } | null = null;
	private lastTouch: { x: number; y: number } | null = null;
	/** Touch drag: the hold that arms it. */
	private holdTimer: number | null = null;
	private holdPanel: HTMLElement | null = null;
	private holdReady = false;
	private scrollTimer: number | null = null;
	private scrollStep = 0;
	/** A touch hold is also the context-menu gesture; suppressed while dragging. */
	private readonly blockContextMenu = (event: Event): void => {
		event.preventDefault();
		event.stopPropagation();
	};

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
		this.cancelHold();
		this.endTouchDrag();
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
		const byMode = entriesInMode(byDeck, this.modeFilter);
		return entriesSince(byMode, historyStartDay(Date.now(), this.history));
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
		if (!this.needsEntries()) return this.rollup;
		const entries = this.scopedEntries();
		return entries === null ? null : aggregateRollup(entries);
	}

	/**
	 * The cards in scope.
	 *
	 * Under a mode filter this narrows to cards with at least one review on that
	 * surface, reconstructed from the log — a card carries no mode of its own.
	 * Never-reviewed cards therefore drop out entirely, which is correct (an
	 * unstudied card was not studied contextually) but does mean the New slice
	 * of Card counts disappears under any mode filter.
	 */
	private scopedCards(): Card[] {
		const byDeck = cardsInScope(this.plugin.cardStore.getAllCards(), this.deckScope);
		if (this.modeFilter === "all") return byDeck;

		const entries = this.scopedEntries();
		if (entries === null) return [];
		const studied = cardsReviewedInMode(entries, this.modeFilter);
		return byDeck.filter((card) => studied.has(card.id));
	}

	/** True when the current scope cannot be answered without a shard parse. */
	private needsEntries(): boolean {
		return this.deckScope.type !== "all" || this.modeFilter !== "all";
	}

	// ── Render ────────────────────────────────────────────────

	private render(): void {
		const { contentEl } = this;
		const scrollTop = contentEl.scrollTop;
		this.lastWidth = contentEl.clientWidth;

		// The panels it was watching are about to be destroyed.
		this.detailObserver?.disconnect();

		// So is anything a drag was holding. A reorder redraws from inside the
		// drop, and a rollup refresh or a resize can land mid-gesture — either
		// way the grip whose `dragend` would have cleaned up is about to go.
		this.cancelHold();
		this.endTouchDrag();

		contentEl.empty();
		contentEl.addClass("osmosis-stats-view");

		this.renderScopeBar(contentEl);

		const grid = contentEl.createDiv({ cls: "osmosis-stats-grid" });

		// Panels are built first and drawn second: a chart needs its own
		// measured width, and the grid has not laid out until the DOM exists.
		const draws: (() => void)[] = [];

		for (const panel of orderPanels(this.panelBuilders(), this.plugin.settings.statsPanelOrder)) {
			panel.build(grid, draws);
			// Each builder appends exactly one panel, so the grid's last child is
			// the one it just made — the only handle on it a builder gives us.
			const el = grid.lastElementChild;
			if (el !== null && el.instanceOf(HTMLElement)) this.addDragHandle(el, panel.id);
		}

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

	/** Every panel, in the order a fresh install shows them. */
	private panelBuilders(): PanelBuilder[] {
		return [
			{ id: "today", build: (g, d) => { this.buildToday(g, d); } },
			{ id: "future-due", build: (g, d) => { this.buildFutureDue(g, d); } },
			{ id: "calendar", build: (g, d) => { this.buildCalendar(g, d); } },
			{ id: "reviews", build: (g, d) => { this.buildReviews(g, d); } },
			{ id: "card-counts", build: (g, d) => { this.buildCardCounts(g, d); } },
			{ id: "review-time", build: (g, d) => { this.buildReviewTime(g, d); } },
			{ id: "intervals", build: (g, d) => { this.buildIntervals(g, d); } },
			{ id: "stability", build: (g, d) => { this.buildStability(g, d); } },
			{ id: "difficulty", build: (g, d) => { this.buildDifficulty(g, d); } },
			{ id: "retrievability", build: (g, d) => { this.buildRetrievability(g, d); } },
			{ id: "study-mode", build: (g, d) => { this.buildStudyMode(g, d); } },
			{ id: "hourly", build: (g, d) => { this.buildHourly(g, d); } },
			{ id: "answer-buttons", build: (g, d) => { this.buildAnswerButtons(g, d); } },
			{ id: "true-retention", build: (g, d) => { this.buildTrueRetention(g, d); } },
			{ id: "mode-recall", build: (g, d) => { this.buildModeRecall(g, d); } },
			{ id: "type-recall", build: (g, d) => { this.buildTypeRecall(g, d); } },
			{ id: "weakest-notes", build: (g, d) => { this.buildWeakestNotes(g, d); } },
		];
	}

	// ── Reordering ────────────────────────────────────────────

	/**
	 * The grip that reorders a panel.
	 *
	 * Modelled on the kanban board in Planner, which solves the same problem in
	 * the same environment, and the two things it gets right are the two things
	 * that are not obvious:
	 *
	 *   - **Two paths.** HTML5 drag-and-drop for the mouse, touch events with a
	 *     floating clone for mobile. `dragstart` never fires from touch in the
	 *     mobile webview, and pointer events are not a substitute: the grip is
	 *     inside the panel, so capture dies the moment the panel moves.
	 *   - **Nothing moves until the drop.** A drop edge is marked on the panel
	 *     under the pointer and the order is rewritten on release. Reparenting
	 *     the dragged element mid-gesture aborts the drag outright.
	 *
	 * Only the grip is a drag surface, never the panel itself: a panel is full
	 * of hoverable bars, range pickers and checkboxes, and taking the gesture
	 * across the whole card would break all of them.
	 */
	private addDragHandle(panel: HTMLElement, id: string): void {
		panel.dataset.panelId = id;

		const handle = panel.createDiv({ cls: "osmosis-stats-drag" });
		setIcon(handle, "grip-horizontal");
		handle.setAttribute("aria-label", "Drag to reorder");
		handle.setAttribute("draggable", "true");

		this.wireMouseDrag(handle, panel);
		this.wireTouchDrag(handle, panel);
		this.wireDropTarget(panel);
	}

	private wireMouseDrag(handle: HTMLElement, panel: HTMLElement): void {
		handle.addEventListener("dragstart", (event) => {
			this.dragging = panel;
			panel.addClass("osmosis-stats-panel-dragging");
			if (event.dataTransfer === null) return;
			// Carrying no payload at all makes some targets refuse the drag.
			event.dataTransfer.setData("text/plain", panel.dataset.panelId ?? "");
			event.dataTransfer.effectAllowed = "move";
			// Drag a ghost of the panel, not of the grip.
			event.dataTransfer.setDragImage(panel, 24, 24);
		});

		handle.addEventListener("drag", (event) => {
			// The last event of a drag reports 0,0; it is not a position.
			if (event.clientY === 0) return;
			this.edgeScroll(event.clientY);
		});

		handle.addEventListener("dragend", () => {
			this.endDrag();
		});
	}

	/** Every panel is a drop target for every other one. */
	private wireDropTarget(panel: HTMLElement): void {
		panel.addEventListener("dragover", (event) => {
			if (this.dragging === null || this.dragging === panel) return;
			// Marks the panel as a valid drop target; without it, no drop fires.
			event.preventDefault();
			if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "move";
			this.markDropEdge(panel, event.clientY);
		});

		panel.addEventListener("dragleave", () => {
			panel.removeClasses(["osmosis-stats-drop-above", "osmosis-stats-drop-below"]);
		});

		panel.addEventListener("drop", (event) => {
			const dragged = this.dragging;
			if (dragged === null || dragged === panel) return;
			event.preventDefault();
			void this.applyReorder(dragged, panel, dropsAbove(panel, event.clientY));
		});
	}

	/**
	 * Touch: hold the grip, then drag.
	 *
	 * The hold is what separates a reorder from a scroll — the grip is small and
	 * there is no hover on touch to warn it is even there, so lifting on contact
	 * would turn a mistimed tap into a reorder.
	 */
	private wireTouchDrag(handle: HTMLElement, panel: HTMLElement): void {
		handle.addEventListener(
			"touchstart",
			(event) => {
				this.cancelHold();
				const touch = event.touches.item(0);
				if (touch === null) return;
				this.touchStart = { x: touch.clientX, y: touch.clientY };
				this.holdPanel = panel;
				this.holdReady = false;
				this.holdTimer = window.setTimeout(() => {
					this.holdReady = true;
					panel.addClass("osmosis-stats-panel-held");
					if (navigator.vibrate) navigator.vibrate(50);
				}, HOLD_MS);
			},
			{ passive: true },
		);

		handle.addEventListener(
			"touchmove",
			(event) => {
				const start = this.touchStart;
				const touch = event.touches.item(0);
				if (start === null || touch === null) return;
				const moved =
					Math.abs(touch.clientX - start.x) > TOUCH_SLOP ||
					Math.abs(touch.clientY - start.y) > TOUCH_SLOP;

				if (!this.holdReady) {
					// Moving before the hold completes is someone scrolling.
					if (moved) this.cancelHold();
					return;
				}
				// Held: the gesture is ours. This has to run on every move, not
				// just the one that starts the drag — iOS hands the touch to the
				// scroller the moment one goes unclaimed.
				event.preventDefault();

				if (this.touchClone === null) {
					if (!moved) return;
					this.startTouchDrag(panel);
				}
				this.updateTouchDrag(touch.clientX, touch.clientY);
			},
			{ passive: false },
		);

		handle.addEventListener("touchend", (event) => {
			this.cancelHold();
			if (this.touchClone === null) {
				this.endDrag();
				return;
			}
			const touch = event.changedTouches.item(0);
			if (touch === null) {
				this.endTouchDrag();
				return;
			}
			this.finishTouchDrag(touch.clientX, touch.clientY);
		});

		handle.addEventListener("touchcancel", () => {
			this.cancelHold();
			this.endTouchDrag();
		});
	}

	private startTouchDrag(panel: HTMLElement): void {
		const doc = this.contentEl.ownerDocument;
		this.dragging = panel;
		panel.removeClass("osmosis-stats-panel-held");
		panel.addClass("osmosis-stats-panel-dragging");

		// A hold on touch is also how the context menu is summoned.
		doc.addEventListener("contextmenu", this.blockContextMenu, true);

		// Touch has no drag ghost of its own, so the clone is the only thing
		// under the finger. It is transparent to hit testing, so the panel
		// beneath it can still be found.
		const clone = panel.cloneNode(true) as HTMLElement;
		clone.className = "osmosis-stats-drag-clone";
		clone.style.width = `${String(panel.offsetWidth)}px`;
		doc.body.appendChild(clone);
		this.touchClone = clone;
	}

	private updateTouchDrag(x: number, y: number): void {
		const clone = this.touchClone;
		if (clone === null) return;

		clone.style.transform = `translate(${String(x - CLONE_GRAB.x)}px, ${String(y - CLONE_GRAB.y)}px)`;
		// iOS reports unreliable coordinates on `touchend`, so the drop falls
		// back to the last position the drag actually saw.
		this.lastTouch = { x, y };

		this.edgeScroll(y);

		const target = this.panelAt(x, y);
		this.clearDropEdges();
		if (target !== null && target !== this.dragging) this.markDropEdge(target, y);
	}

	private finishTouchDrag(x: number, y: number): void {
		const dragged = this.dragging;
		// Resolved before the clone is removed: the clone does not block the hit
		// test, but tearing down first would mean testing against a repainted page.
		// iOS reports unreliable `touchend` coordinates, so a point that hits
		// nothing falls back to the last one the drag actually saw.
		const at = this.panelAt(x, y) !== null ? { x, y } : this.lastTouch;
		const target = at === null ? null : this.panelAt(at.x, at.y);
		const above = target !== null && at !== null && dropsAbove(target, at.y);

		this.endTouchDrag();
		if (dragged !== null && target !== null && target !== dragged) {
			void this.applyReorder(dragged, target, above);
		}
	}

	/** Tears the touch drag down without applying it. */
	private endTouchDrag(): void {
		this.contentEl.ownerDocument.removeEventListener("contextmenu", this.blockContextMenu, true);
		this.touchClone?.remove();
		this.touchClone = null;
		this.lastTouch = null;
		this.touchStart = null;
		this.endDrag();
	}

	/** Drops the pending hold, whether or not it ever armed. */
	private cancelHold(): void {
		if (this.holdTimer !== null) {
			window.clearTimeout(this.holdTimer);
			this.holdTimer = null;
		}
		this.holdPanel?.removeClass("osmosis-stats-panel-held");
		this.holdPanel = null;
		this.holdReady = false;
		this.touchStart = null;
	}

	/** Common end of both paths: the drag is over, whatever came of it. */
	private endDrag(): void {
		this.dragging?.removeClass("osmosis-stats-panel-dragging");
		this.dragging = null;
		this.clearDropEdges();
		this.stopEdgeScroll();
	}

	private panelAt(x: number, y: number): HTMLElement | null {
		const under = this.contentEl.ownerDocument.elementFromPoint(x, y);
		return under === null ? null : under.closest<HTMLElement>(".osmosis-stats-panel");
	}

	private markDropEdge(panel: HTMLElement, y: number): void {
		const above = dropsAbove(panel, y);
		panel.toggleClass("osmosis-stats-drop-above", above);
		panel.toggleClass("osmosis-stats-drop-below", !above);
	}

	private clearDropEdges(): void {
		for (const el of Array.from(
			this.contentEl.querySelectorAll(".osmosis-stats-drop-above, .osmosis-stats-drop-below"),
		)) {
			el.removeClasses(["osmosis-stats-drop-above", "osmosis-stats-drop-below"]);
		}
	}

	/**
	 * Scrolls the view while a drag hovers near its top or bottom edge.
	 *
	 * Without it a drag reaches only what is already on screen — on a phone,
	 * about one panel — so a graph could never be moved to the top of a
	 * dashboard seventeen panels long.
	 */
	private edgeScroll(y: number): void {
		const box = this.contentEl.getBoundingClientRect();
		const step =
			y < box.top + EDGE_ZONE ? -EDGE_SPEED : y > box.bottom - EDGE_ZONE ? EDGE_SPEED : 0;

		if (step === 0) {
			this.stopEdgeScroll();
			return;
		}
		if (step === this.scrollStep && this.scrollTimer !== null) return;

		// On its own clock: a finger held still at the edge sends no more events.
		this.stopEdgeScroll();
		this.scrollStep = step;
		this.scrollTimer = window.setInterval(() => {
			this.contentEl.scrollTop += step;
		}, EDGE_INTERVAL_MS);
	}

	private stopEdgeScroll(): void {
		this.scrollStep = 0;
		if (this.scrollTimer !== null) {
			window.clearInterval(this.scrollTimer);
			this.scrollTimer = null;
		}
	}

	/**
	 * Rewrites the saved order, then redraws from it.
	 *
	 * The DOM order of the panels is the current order, so the new one is that
	 * list with the dragged ID lifted out and reinserted at the target.
	 */
	private async applyReorder(
		dragged: HTMLElement,
		target: HTMLElement,
		above: boolean,
	): Promise<void> {
		const grid = dragged.parentElement;
		const draggedId = dragged.dataset.panelId;
		const targetId = target.dataset.panelId;
		if (grid === null || draggedId === undefined || targetId === undefined) return;

		const order = Array.from(grid.children)
			.map((child) => (child.instanceOf(HTMLElement) ? child.dataset.panelId : undefined))
			.filter((id): id is string => id !== undefined && id !== draggedId);

		const at = order.indexOf(targetId);
		if (at === -1) return;
		order.splice(above ? at : at + 1, 0, draggedId);

		this.plugin.settings.statsPanelOrder = order;
		this.render();
		// saveData rather than saveSettings: panel order has no bearing on card
		// generation, so the full re-sync would be wasted work.
		await this.plugin.saveData(this.plugin.settings);
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

		const modeWrap = bar.createDiv({ cls: "osmosis-stats-scope-field" });
		modeWrap.createSpan({ cls: "osmosis-stats-scope-label", text: "Mode" });
		this.segmented(
			modeWrap,
			[
				{ key: "all", label: "All" },
				{ key: "sequential", label: "Sequential" },
				{ key: "contextual", label: "Contextual" },
				{ key: "spatial", label: "Spatial" },
			],
			this.modeFilter,
			(key) => {
				this.modeFilter = key as ModeFilter;
				this.render();
			},
		);

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
			this.tile(
				tiles,
				"Per card",
				today.reviews === 0
					? "—"
					: `${String(Math.round(today.timeMs / today.reviews / 1000))}s`,
			);

			if (today.reviews === 0) {
				renderEmpty(plot, "Nothing studied yet today.");
				return;
			}
			renderLegend(plot, CLASS_SERIES, today.byClass);

			// The fortnight behind today, so the number above has somewhere to
			// sit. Today is the last column, and the panel is about today.
			const trail = bucketPoints(
				dailySeries(rollup, daysBefore(Date.now(), 13), Date.now()),
				"day",
			);
			plot.createDiv({ cls: "osmosis-stats-subtitle", text: "Last 14 days" });
			barChart(plot, {
				width: this.plotWidth(plot),
				height: 110,
				data: trail.map((bucket) => ({
					label: bucket.startsMonth ? monthLabel(bucket.key) : "",
					values: bucket.byClass,
					tooltip: `${bucketTitle(bucket, "day")}: ${bucket.reviews.toLocaleString()} reviews`,
				})),
				series: CLASS_SERIES,
				mode: "stacked",
				formatValue: (v) => Math.round(v).toLocaleString(),
				labelEvery: 1,
			});
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
			const { buckets, granularity, labelEvery } = this.volumeColumns(rollup, this.reviewRange);
			const totals = sumByClass(buckets, "byClass");

			if (sumValues(totals) === 0) {
				renderEmpty(plot, "No reviews in this range yet.");
				return;
			}

			barChart(plot, {
				width: this.plotWidth(plot),
				height: CHART_HEIGHT,
				data: buckets.map((bucket) => ({
					label: columnLabel(bucket, granularity),
					values: bucket.byClass,
					tooltip: `${bucketTitle(bucket, granularity)}: ${bucket.reviews.toLocaleString()} reviews`,
				})),
				series: CLASS_SERIES,
				mode: "stacked",
				formatValue: (v) => Math.round(v).toLocaleString(),
				labelEvery,
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
			const { buckets, granularity, labelEvery } = this.volumeColumns(rollup, this.timeRange);
			const totals = sumByClass(buckets, "timeByClass");

			if (sumValues(totals) === 0) {
				renderEmpty(plot, "No reviews in this range yet.");
				return;
			}

			// Plotted in minutes: a day of study is millions of milliseconds,
			// and an axis of those is unreadable.
			barChart(plot, {
				width: this.plotWidth(plot),
				height: CHART_HEIGHT,
				data: buckets.map((bucket) => ({
					label: columnLabel(bucket, granularity),
					values: mapValues(bucket.timeByClass, (ms) => ms / 60_000),
					tooltip: `${bucketTitle(bucket, granularity)}: ${formatDuration(bucket.timeMs)}`,
				})),
				series: CLASS_SERIES,
				mode: "stacked",
				formatValue: (v) => `${String(Math.round(v))}m`,
				labelEvery,
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
			} else {
				// One number over all history hides the trend that matters —
				// whether retention is holding up lately — so the same figure is
				// also broken out by window.
				const table = plot.createDiv({ cls: "osmosis-stats-table" });
				for (const period of retentionByPeriod(entries, Date.now())) {
					const row = table.createDiv({ cls: "osmosis-stats-row" });
					row.createSpan({ cls: "osmosis-stats-row-label", text: period.label });
					row.createSpan({
						cls: "osmosis-stats-row-value",
						text:
							period.stats.reviewed === 0
								? "—"
								: `${String(Math.round(period.stats.rate * 100))}%`,
					});
					row.createSpan({
						cls: "osmosis-stats-row-sub",
						text: `${period.stats.passed.toLocaleString()} / ${period.stats.reviewed.toLocaleString()}`,
					});
				}
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

	/**
	 * Recall by study surface — the graph Anki has no way to draw, because it
	 * has one way to study.
	 *
	 * This is the question the plugin exists to answer: does meeting a card in
	 * the note that taught it retain better than drilling it out of context? A
	 * flat result is a real answer too.
	 */
	private buildModeRecall(parent: HTMLElement, draws: (() => void)[]): void {
		const plot = chartPanel(
			parent,
			"Recall by study mode",
			"Graduated cards only (interval ≥ 1 day), first review of each card per day.",
		);

		draws.push(() => {
			const entries = this.requireEntries(plot);
			if (entries === null) return;

			const byMode = recallBy(entries, (entry) => entry.m);
			if (byMode.size === 0) {
				renderEmpty(plot, "No graduated reviews yet.");
				return;
			}

			this.recallTable(
				plot,
				MODE_SERIES.map((series) => ({
					label: series.label,
					color: series.color,
					stats: byMode.get(series.key as StudyMode),
				})),
				true,
			);
		});
	}

	/**
	 * Recall by card type — which *authoring style* is working.
	 *
	 * Anki's nearest equivalent groups by note type, which is a schema. These
	 * are ways of writing a note, so a weak row is a prompt to write differently
	 * rather than to re-model anything.
	 */
	private buildTypeRecall(parent: HTMLElement, draws: (() => void)[]): void {
		const plot = chartPanel(
			parent,
			"Recall by card type",
			"How each way of writing a card performs, on the same basis as above.",
		);

		draws.push(() => {
			const entries = this.requireEntries(plot);
			if (entries === null) return;

			const byType = recallBy(
				entries,
				(entry) => this.plugin.cardStore.getCard(entry.c)?.cardType ?? null,
			);
			if (byType.size === 0) {
				renderEmpty(plot, "No graduated reviews of resolvable cards yet.");
				return;
			}

			this.recallTable(
				plot,
				CARD_TYPE_ORDER.filter((type) => byType.has(type)).map((type) => ({
					label: CARD_TYPE_LABELS[type],
					color: COLOR.new,
					stats: byType.get(type),
				})),
				false,
			);
		});
	}

	/**
	 * The notes costing the most reviews.
	 *
	 * Cards carry a `notePath`, so a weak card points at a document you can go
	 * and edit — which is what makes this different from a deck breakdown. A
	 * high lapse rate here usually means the note never actually explained the
	 * thing, or the card is ambiguous; either way the fix is writing, not
	 * scheduling.
	 */
	private buildWeakestNotes(parent: HTMLElement, draws: (() => void)[]): void {
		const plot = chartPanel(
			parent,
			"Weakest notes",
			`Worst recall first, among notes with at least ${String(MIN_NOTE_REVIEWS)} graduated reviews.`,
		);

		draws.push(() => {
			const entries = this.requireEntries(plot);
			if (entries === null) return;

			const byNote = recallBy(
				entries,
				(entry) => this.plugin.cardStore.getCard(entry.c)?.notePath ?? null,
			);
			const ranked = rankByRecall(byNote, MIN_NOTE_REVIEWS).slice(0, WEAKEST_NOTE_LIMIT);

			if (ranked.length === 0) {
				renderEmpty(
					plot,
					byNote.size === 0
						? "No graduated reviews of resolvable cards yet."
						: `No note has ${String(MIN_NOTE_REVIEWS)} graduated reviews yet.`,
				);
				return;
			}

			this.recallTable(
				plot,
				ranked.map((row) => ({
					label: noteName(row.key),
					color: COLOR.relearning,
					stats: row.stats,
					title: row.key,
				})),
				false,
			);
		});
	}

	/**
	 * A recall comparison as rows of label, meter, rate, and sample size.
	 *
	 * The meter is what makes the comparison readable: recall rates cluster in
	 * the eighties and nineties, so a 0–100 axis flattens every difference worth
	 * seeing. The bar is scaled to the rows on screen instead, and the exact
	 * figure sits beside it.
	 */
	private recallTable(
		parent: HTMLElement,
		rows: readonly {
			label: string;
			color: string;
			stats: RecallStats | undefined;
			title?: string;
		}[],
		showPace: boolean,
	): void {
		const rates = rows.map((row) => row.stats?.rate ?? 0).filter((rate) => rate > 0);
		const floor = rates.length === 0 ? 0 : Math.min(...rates);
		// Anchor the meter a little below the worst row so the weakest is a
		// short bar rather than an empty one.
		const base = Math.max(0, floor - 0.05);

		const table = parent.createDiv({ cls: "osmosis-stats-table" });
		for (const row of rows) {
			const el = table.createDiv({ cls: "osmosis-stats-recall-row" });
			if (row.title !== undefined) el.setAttribute("title", row.title);

			el.createSpan({ cls: "osmosis-stats-row-label", text: row.label });

			const track = el.createDiv({ cls: "osmosis-stats-meter" });
			const fill = track.createDiv({ cls: "osmosis-stats-meter-fill" });
			const rate = row.stats?.rate ?? 0;
			const width = base >= 1 ? 100 : ((rate - base) / (1 - base)) * 100;
			fill.style.width = `${String(Math.max(0, Math.min(100, width)))}%`;
			fill.style.backgroundColor = row.color;

			el.createSpan({
				cls: "osmosis-stats-row-value",
				text: row.stats === undefined ? "—" : `${String(Math.round(rate * 100))}%`,
			});
			el.createSpan({
				cls: "osmosis-stats-row-sub",
				text:
					row.stats === undefined
						? "0"
						: showPace
							? `${row.stats.reviewed.toLocaleString()} · ${String(
									Math.round(row.stats.meanMs / 1000),
								)}s`
							: row.stats.reviewed.toLocaleString(),
			});
		}
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

	/**
	 * Columns and labels for a volume graph.
	 *
	 * A month stays one bar per day; longer ranges bucket, because 365 columns
	 * across a few hundred pixels is a 1px sliver per day. Bucketed ranges label
	 * only the column that opens a month — a date on every column is both
	 * unreadable and less meaningful than the month it sits in.
	 */
	private volumeColumns(
		rollup: Rollup,
		range: RangeKey,
	): { buckets: SeriesBucket[]; granularity: Granularity; labelEvery?: number } {
		const granularity: Granularity =
			range === "month" ? "day" : range === "quarter" ? "week" : "month";
		return {
			buckets: bucketPoints(this.seriesForRange(rollup, range), granularity),
			granularity,
			labelEvery: granularity === "day" ? undefined : 1,
		};
	}

	/** The pixel width a chart should draw at, floored so it never collapses. */
	private plotWidth(plot: HTMLElement): number {
		return Math.max(280, plot.clientWidth);
	}
}

// ── Private helpers ───────────────────────────────────────────

/** Which side of a panel a drop at `y` lands on. */
function dropsAbove(panel: HTMLElement, y: number): boolean {
	const box = panel.getBoundingClientRect();
	return y < box.top + box.height / 2;
}

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

/** Structural, so it sums daily points and bucketed columns alike. */
interface ClassSplit {
	byClass: Readonly<Record<string, number>>;
	timeByClass: Readonly<Record<string, number>>;
}

function sumByClass(
	points: readonly ClassSplit[],
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

const MONTHS = [
	"Jan", "Feb", "Mar", "Apr", "May", "Jun",
	"Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** A day key's month as an axis label ("Aug"). */
function monthLabel(day: string): string {
	return MONTHS[Number(day.slice(5, 7)) - 1] ?? "";
}

/** A note path as its display name — basename, no extension. */
function noteName(path: string): string {
	const base = path.slice(path.lastIndexOf("/") + 1);
	return base.endsWith(".md") ? base.slice(0, -3) : base;
}

/** A day key as a compact axis label ("7 Aug"). */
function shortDay(day: string): string {
	return `${String(Number(day.slice(8, 10)))} ${monthLabel(day)}`;
}

/**
 * A column's axis label. Daily columns carry their date; bucketed columns are
 * labelled only where a month opens, so the axis reads as months rather than as
 * a wall of dates.
 */
function columnLabel(bucket: SeriesBucket, granularity: Granularity): string {
	if (granularity === "day") return shortDay(bucket.key);
	return bucket.startsMonth ? monthLabel(bucket.key) : "";
}

/** What a column's tooltip calls it — the span, not just its first day. */
function bucketTitle(bucket: SeriesBucket, granularity: Granularity): string {
	const year = bucket.key.slice(0, 4);
	if (granularity === "day") return `${shortDay(bucket.key)} ${year}`;
	if (granularity === "month") return `${monthLabel(bucket.key)} ${year}`;
	return `Week of ${shortDay(bucket.key)}`;
}
