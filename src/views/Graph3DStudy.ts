/**
 * Relational study: the 3D graph's study mode (`StudyMode` `"relational"`).
 * A due card's node is hidden in place, and you recall it with its
 * neighbourhood around you, reveal it and rate it. Ratings go through
 * `plugin.createSessionManager("relational")`, so they move the same FSRS
 * schedules every other mode uses, and the review log counts them separately.
 *
 * This slice has one path mode, **free exploration**: every due card in the
 * loaded area is hidden, and the area follows you as you hop. "Next" flies to
 * the nearest hidden card. Due-driven and authored-trail paths are later
 * slices (see the task note's "Slice plan"); they plug in as other ways of
 * choosing `next()`'s destination and the target set.
 *
 * The pure parts (which node carries which card, what a hidden node shows) are
 * `src/graph3d/study.ts`. This class owns the session and its panel; the view
 * owns the scene and calls `decorate` whenever it hands the scene a model.
 */

import { Notice } from "obsidian";
import type { FSRSRating } from "../database/FSRSScheduler";
import type { Card } from "../database/types";
import type { GraphModel, GraphNode } from "../graph3d/model";
import { nodeStep, studyNode, studyTargets } from "../graph3d/study";
import type OsmosisPlugin from "../main";
import { cardIdsForSpatialKey } from "../study/spatial-study";
import type { StudySessionManager } from "../study/StudySessionManager";

/** What the session needs from the view. */
export interface StudyHost {
	/** Hand the scene the current model again, through `decorate`. */
	redraw(): void;
	/** Fly to a node and recentre the loaded area on its note, as a click does. */
	hop(node: GraphNode): void;
	/** The node among `ids` nearest the camera, or null. */
	nearest(ids: readonly string[]): string | null;
}

const RATINGS: readonly { label: string; rating: FSRSRating; cls: string }[] = [
	{ label: "Again", rating: 1, cls: "osmosis-rate-again" },
	{ label: "Hard", rating: 2, cls: "osmosis-rate-hard" },
	{ label: "Good", rating: 3, cls: "osmosis-rate-good" },
	{ label: "Easy", rating: 4, cls: "osmosis-rate-easy" },
];

export class Graph3DStudy {
	private panel: HTMLElement | null = null;
	private session: StudySessionManager | null = null;
	/** Hidden nodes in the model last decorated: node ID → keys still to ask. */
	private targets = new Map<string, string[]>();
	/** The cards of the model last decorated, by ID. */
	private cards = new Map<string, Card>();
	private allCards: Card[] = [];
	private model: GraphModel | null = null;
	private readonly revealed = new Set<string>();
	private readonly rated = new Set<string>();
	/** The hidden node you arrived at: the one Reveal and the rating keys act on. */
	private current: string | null = null;
	/** When the current card's answer went up, for the review log's time on screen. */
	private revealedAt = 0;
	private reviewed = 0;

	constructor(private readonly root: HTMLElement, private readonly plugin: OsmosisPlugin, private readonly host: StudyHost) {}

	get active(): boolean {
		return this.panel !== null;
	}

	/** Start a session, once the card store has finished its first scan. */
	start(): void {
		if (this.active) return;
		if (!this.plugin.isCardStoreReady) {
			new Notice("Osmosis is still scanning the vault — study will start in a moment.");
			void this.plugin.cardStoreReady.then(() => {
				if (this.root.isConnected) this.start();
			});
			return;
		}
		this.panel = this.root.createDiv({ cls: "osmosis-graph3d-study" });
		this.revealed.clear();
		this.rated.clear();
		this.current = null;
		this.reviewed = 0;
		this.host.redraw();
		if (this.targets.size === 0) new Notice("No cards are due in the loaded area. Hop to another note to look further.");
	}

	/** End the session, and push its schedule writes and review-log entries out now, as 2D study does. */
	stop(): void {
		if (!this.active) return;
		this.panel?.remove();
		this.panel = null;
		this.targets.clear();
		this.cards.clear();
		this.allCards = [];
		this.current = null;
		if (this.session !== null) {
			this.session = null;
			this.plugin.scheduleStore.flush().catch((error: unknown) => console.error("Osmosis: schedule flush at study-session end failed", error));
			void this.plugin.reviewLog.flush();
		}
		this.host.redraw();
	}

	/**
	 * `model` as the scene should show it: with every target node hidden in
	 * place (`studyNode`). Outside a session, `model` itself. Called on every
	 * model the view shows, so the targets follow the loaded area.
	 */
	decorate(model: GraphModel): GraphModel {
		this.model = model;
		if (!this.active) return model;
		const paths = model.nodes.filter((node) => node.kind === "note" && node.path !== undefined).map((node) => node.path!);
		this.allCards = paths.flatMap((path) => this.plugin.cardStore.getCardsByNote(path));
		this.cards = new Map(this.allCards.map((card) => [card.id, card]));
		this.targets = studyTargets(model.nodes, this.allCards, Date.now(), this.rated);
		// A fence's node is re-created when its schedule is written into it; a revealed card awaiting its rating stays current through that.
		if (this.current === null || !this.targets.has(this.current)) {
			this.current = [...this.targets].find(([, keys]) => nodeStep(keys, this.revealed)?.revealed === true)?.[0] ?? null;
		}
		this.renderPanel();
		return {
			nodes: model.nodes.map((node) => {
				const keys = this.targets.get(node.id);
				const step = keys === undefined ? null : nodeStep(keys, this.revealed);
				return step === null ? node : studyNode(node, step, this.cards.get(step.asking));
			}),
			edges: model.edges,
		};
	}

	/**
	 * A click on `node` during a session. Arriving at a hidden node makes it the
	 * current card; clicking the current card again reveals it. The view still
	 * flies and hops as it would for any click.
	 */
	clicked(node: GraphNode): void {
		if (!this.active || !this.targets.has(node.id)) return;
		if (this.current === node.id) {
			this.reveal();
			return;
		}
		if (this.pendingKey() !== null) return; // One rating at a time: the revealed card must be rated first.
		this.current = node.id;
		this.renderPanel();
	}

	/** Show the current card's answer. */
	reveal(): boolean {
		const step = this.currentStep();
		if (step === null || step.revealed) return false;
		this.revealed.add(step.asking);
		this.revealedAt = Date.now();
		this.host.redraw();
		return true;
	}

	/** Rate the revealed card on the shared schedule, then put up the node's next question or let it go. */
	async rate(rating: FSRSRating): Promise<boolean> {
		const key = this.pendingKey();
		// A second key press while the first rating is still being written.
		if (key === null || this.rated.has(key)) return false;
		const elapsedMs = Date.now() - this.revealedAt;
		this.rated.add(key);
		this.reviewed++;
		// One card per key (`spatialStudyKeys` splits a node into its due cards); looked up the way 2D study does.
		const ids = cardIdsForSpatialKey(this.allCards, key);
		this.session ??= this.plugin.createSessionManager("relational");
		for (const id of ids) await this.session.recordReview(id, rating, { elapsedMs });
		if (ids.length > 0) this.plugin.refreshDashboard();
		this.host.redraw();
		return true;
	}

	/** Fly to the nearest hidden card other than the current one. */
	next(): void {
		if (!this.active || this.pendingKey() !== null) return;
		const ids = [...this.targets.keys()].filter((id) => id !== this.current);
		const id = this.host.nearest(ids);
		const node = id === null ? undefined : this.model?.nodes.find((n) => n.id === id);
		if (node === undefined) {
			new Notice("No more due cards in the loaded area. Hop to another note to look further.");
			return;
		}
		this.current = node.id;
		this.renderPanel();
		this.host.hop(node);
	}

	destroy(): void {
		this.stop();
	}

	private currentStep(): ReturnType<typeof nodeStep> {
		const keys = this.current === null ? undefined : this.targets.get(this.current);
		return keys === undefined ? null : nodeStep(keys, this.revealed);
	}

	/** The key revealed and awaiting its rating, if any. */
	private pendingKey(): string | null {
		const step = this.currentStep();
		return step?.revealed === true ? step.asking : null;
	}

	private renderPanel(): void {
		const panel = this.panel;
		if (panel === null) return;
		panel.empty();
		const hidden = [...this.targets.values()].reduce((sum, keys) => sum + keys.length, 0);
		panel.createDiv({ cls: "osmosis-graph3d-study-title", text: "Relational study: free exploration" });
		panel.createDiv({
			cls: "osmosis-graph3d-study-progress",
			text: `${String(this.reviewed)} reviewed · ${String(hidden)} hidden here`,
		});
		const row = panel.createDiv({ cls: "osmosis-graph3d-study-actions" });
		const step = this.currentStep();
		if (step?.revealed === true) {
			const rating = row.createDiv({ cls: "osmosis-contextual-rating osmosis-graph3d-study-rating" });
			for (const { label, rating: value, cls } of RATINGS) {
				rating.createEl("button", { text: label, cls }).addEventListener("click", () => void this.rate(value));
			}
		} else {
			if (step !== null) row.createEl("button", { text: "Reveal", cls: "mod-cta" }).addEventListener("click", () => this.reveal());
			const next = row.createEl("button", { text: "Next" });
			next.disabled = hidden === 0 || (hidden === 1 && step !== null);
			next.addEventListener("click", () => this.next());
		}
		row.createEl("button", { text: "Stop" }).addEventListener("click", () => this.stop());
		panel.createDiv({
			cls: "osmosis-graph3d-study-hint",
			text: step === null ? (hidden === 0 ? "No due cards here: hop on to look further." : "Fly to a ? and click it, or press Next.") : step.revealed ? "Rate it: keys 1–4." : "Recall it, then reveal: space, or click it again.",
		});
	}
}
