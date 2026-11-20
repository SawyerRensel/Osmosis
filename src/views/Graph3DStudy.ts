/**
 * Cosmos study: the 3D graph's study mode (`StudyMode` `"cosmos"`).
 * A due card's node is hidden in place, and you recall it with its
 * neighbourhood around you, reveal it and rate it. Ratings go through
 * `plugin.createSessionManager("cosmos")`, so they move the same FSRS
 * schedules every other mode uses, and the review log counts them separately.
 * The view's graduation-cap header action starts and ends a session; the
 * panel has no Stop button of its own.
 *
 * It has two path modes, picked in the panel:
 * - **Free exploration:** every due card in the loaded area is hidden, and the
 *   area follows you as you hop (on purpose: see `graph3d/refocus.ts`). "Next"
 *   flies to the nearest hidden card.
 * - **Due-driven:** the cards due within the configured depth of the note you
 *   started the route from (at the moment you chose it) are the route. "Next"
 *   flies to the next stop along graph paths (`nextStop`), loading its note
 *   first when it is beyond the loaded area, and a thread is drawn through the
 *   stops you have visited. Only route cards are hidden.
 *
 * - **Trail:** a vault note marked `osmosis-trail: true` whose list items are
 *   links (`src/graph3d/trail-note.ts`). "Next" walks its stops in the author's
 *   order, flying to each (loading its note first when needed), and the thread
 *   draws the trail. A stop with a due card hides it and asks for a rating; any
 *   other stop (a heading, a plain note, a card not due) is visited and shown.
 *
 * The pure parts (which node carries which card, what a hidden node shows) are
 * `src/graph3d/study.ts`. This class owns the session and its panel; the view
 * owns the scene and calls `decorate` whenever it hands the scene a model.
 */

import { Notice } from "obsidian";
import type { FSRSRating } from "../database/FSRSScheduler";
import type { Card } from "../database/types";
import { isNoteRoot, linkTargetNode, noteNodeId, type GraphModel, type GraphNode } from "../graph3d/model";
import { nodeCardKey, nodeStep, studyNode, studyTargets, targetNodeFor } from "../graph3d/study";
import { parseTrail } from "../graph3d/trail-note";
import { cardsToGo, nextStop, routeStops, stopDone, threadNodeIds, trailSteps, type RouteStop, type TrailStep } from "../graph3d/trails";
import type OsmosisPlugin from "../main";
import { cardIdsForMindmapKey } from "../study/mindmap-study";
import type { StudySessionManager } from "../study/StudySessionManager";

/** What the session needs from the view. */
export interface StudyHost {
	/** Hand the scene the current model again, through `decorate`. */
	redraw(): void;
	/** Fly to a node, as a click does. The focus note stays as it is. */
	visit(node: GraphNode): void;
	/** The node among `ids` nearest the camera, or null. */
	nearest(ids: readonly string[]): string | null;
	/** The note the loaded area is centred on, or null before one is chosen. */
	focusPath(): string | null;
	/** The notes a due-driven route is collected from: those within the configured depth of the focus (at depth 0, within one hop). */
	loadedNotes(): string[];
	/** Hop distance from `path` to every note it reaches, over links in either direction. */
	hopsFrom(path: string): ReadonlyMap<string, number>;
	/**
	 * Fly to the node `find` picks from the model, loading `path`'s note first
	 * when the node is not in the model shown now.
	 */
	goTo(path: string, find: (model: GraphModel) => string | null): void;
	/** Draw the travelled thread through these nodes (null: a stop not loaded now). */
	thread(ids: readonly (string | null)[]): void;
	/** Let the user pick a trail note (one marked `osmosis-trail: true`): its path and text, or null if there is none or the picker is dismissed. */
	pickTrail(): Promise<{ path: string; text: string } | null>;
	/** The vault path a link written in the note `from` resolves to, or null. */
	resolveLink(target: string, from: string): string | null;
}

/** How the session picks the next card. */
export type StudyPath = "free" | "due" | "trail";

const PATHS: readonly { path: StudyPath; label: string }[] = [
	{ path: "free", label: "Free" },
	{ path: "due", label: "Due-driven" },
	{ path: "trail", label: "Trail" },
];

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
	/**
	 * The card key of that node (`nodeCardKey`), which is what the session
	 * really tracks: a fence's node ID changes when a rating is written into it,
	 * so `current` is looked up from this key on every model (see `targetNodeFor`).
	 */
	private currentKey: string | null = null;
	private path: StudyPath = "free";
	/** The due-driven route: its stops, the notes they were collected from, and the stops visited so far (card keys, plus the start note's node ID). */
	private stops: RouteStop[] = [];
	private routeNotes = new Set<string>();
	private visited: string[] = [];
	/** The trail path: its name, its steps in the author's order, and how far along them you are (-1 before the first). */
	private trailName = "";
	private trail: TrailStep[] = [];
	private trailAt = -1;
	/** The card keys the trail asks: only these are hidden, though other cards in its notes may be due. */
	private trailKeys = new Set<string>();
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
		this.current = this.currentKey = null;
		this.reviewed = 0;
		this.path = "free";
		this.stops = [];
		this.visited = [];
		this.clearTrail();
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
		this.current = this.currentKey = null;
		this.stops = [];
		this.visited = [];
		this.clearTrail();
		this.host.thread([]);
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
		// Due-driven hides only the route's cards, so a loaded note outside it is left showing.
		const paths = model.nodes
			.filter((node) => isNoteRoot(node) && node.path !== undefined && (this.path === "free" || this.routeNotes.has(node.path)))
			.map((node) => node.path!);
		this.allCards = paths.flatMap((path) => this.plugin.cardStore.getCardsByNote(path));
		this.cards = new Map(this.allCards.map((card) => [card.id, card]));
		this.targets = studyTargets(model.nodes, this.allCards, Date.now(), this.rated);
		// A trail hides only the cards it asks; others due in the same notes are left showing.
		if (this.path === "trail") {
			const byId = new Map(model.nodes.map((node) => [node.id, node]));
			for (const id of [...this.targets.keys()]) {
				const node = byId.get(id);
				if (node === undefined || !this.trailKeys.has(nodeCardKey(node) ?? "")) this.targets.delete(id);
			}
		}
		// A fence's node is re-created (new ID) when its schedule is written into it, and a node can be loaded after the session chose it, so the current card is found again by its key.
		this.current = this.currentKey === null ? null : targetNodeFor(model.nodes, this.targets, this.currentKey);
		if (this.current === null) {
			// Otherwise a revealed card awaiting its rating is current. The key is kept when nothing is: the card may yet load (due-driven flies to notes beyond the loaded area).
			this.current = [...this.targets].find(([, keys]) => nodeStep(keys, this.revealed)?.revealed === true)?.[0] ?? null;
			if (this.current !== null) this.currentKey = nodeCardKey(model.nodes.find((node) => node.id === this.current)!);
		}
		this.syncThread();
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
	 * flies to it as it would for any click.
	 */
	clicked(node: GraphNode): void {
		if (!this.active || !this.targets.has(node.id)) return;
		if (this.current === node.id) {
			this.reveal();
			return;
		}
		if (this.pendingKey() !== null) return; // One rating at a time: the revealed card must be rated first.
		this.arrive(node);
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
		// One card per key (`mindmapStudyKeys` splits a node into its due cards); looked up the way 2D study does.
		const ids = cardIdsForMindmapKey(this.allCards, key);
		this.session ??= this.plugin.createSessionManager("cosmos");
		for (const id of ids) await this.session.recordReview(id, rating, { elapsedMs });
		if (ids.length > 0) this.plugin.refreshDashboard();
		this.host.redraw();
		return true;
	}

	/** Fly to the next card: the nearest hidden one in free exploration, the next stop along the route in due-driven. */
	next(): void {
		if (!this.active || this.pendingKey() !== null) return;
		if (this.path === "due") {
			this.nextOnRoute();
			return;
		}
		if (this.path === "trail") {
			this.nextOnTrail();
			return;
		}
		const ids = [...this.targets.keys()].filter((id) => id !== this.current);
		const id = this.host.nearest(ids);
		const node = id === null ? undefined : this.model?.nodes.find((n) => n.id === id);
		if (node === undefined) {
			new Notice("No more due cards in the loaded area. Hop to another note to look further.");
			return;
		}
		this.arrive(node);
		this.host.visit(node);
	}

	/**
	 * Choose how "Next" picks its card. Choosing due-driven collects the cards due
	 * within reach of the note you stand on now; choosing trail asks which trail
	 * note to walk (and keeps the path you were on if you dismiss it).
	 */
	setPath(path: StudyPath): void {
		if (!this.active || this.pendingKey() !== null) return;
		if (path === "trail") {
			void this.chooseTrail();
			return;
		}
		if (path === this.path) return;
		this.path = path;
		this.current = this.currentKey = null;
		this.stops = [];
		this.visited = [];
		this.clearTrail();
		if (path === "due") this.collectRoute();
		this.host.redraw();
	}

	/** Pick a trail note, read its stops and start walking it from the top. */
	private async chooseTrail(): Promise<void> {
		const picked = await this.host.pickTrail();
		// The session may have ended, or a card been revealed, while the picker was up.
		if (picked === null || !this.active || this.pendingKey() !== null) return;
		const { steps, unresolved } = trailSteps(
			parseTrail(picked.text),
			picked.path,
			(target, from) => this.host.resolveLink(target, from),
			(path) => this.plugin.cardStore.getCardsByNote(path),
			Date.now(),
		);
		if (steps.length === 0) {
			new Notice(`${picked.path} lists no stops I can find. A trail is a list of links, one per item.`);
			return;
		}
		if (unresolved.length > 0) new Notice(`${String(unresolved.length)} stop${unresolved.length === 1 ? "" : "s"} in the trail did not match a note and will be skipped.`);
		this.path = "trail";
		this.current = this.currentKey = null;
		this.stops = [];
		this.visited = [];
		this.trailName = picked.path.slice(picked.path.lastIndexOf("/") + 1).replace(/\.md$/, "");
		this.trail = steps;
		this.trailAt = -1;
		this.routeNotes = new Set(steps.map((step) => step.path));
		this.trailKeys = new Set(steps.flatMap((step) => (step.stop === null ? [] : [step.stop.key])));
		this.host.redraw();
	}

	private clearTrail(): void {
		this.trailName = "";
		this.trail = [];
		this.trailAt = -1;
		this.trailKeys.clear();
	}

	/**
	 * Collect the route: every due card in the notes within the configured depth
	 * of the focus, read from the card store now, since the nodes for notes
	 * beyond the loaded area do not exist until a hop loads them.
	 */
	private collectRoute(): void {
		const focus = this.host.focusPath();
		this.routeNotes = new Set(this.host.loadedNotes());
		this.stops = routeStops([...this.routeNotes].flatMap((path) => this.plugin.cardStore.getCardsByNote(path)), Date.now());
		this.stops = this.stops.filter((stop) => !stopDone(stop, this.rated));
		if (focus !== null) this.visited.push(noteNodeId(focus));
		if (this.stops.length === 0) new Notice("No cards are due within reach of this note. Try a greater depth, or another note.");
	}

	/**
	 * Due-driven "Next": fly to the next stop on the route, and extend the thread to it.
	 * Distances count from the stop you are on (from the focus note at the start):
	 * flying to a loaded stop leaves the focus note behind.
	 */
	private nextOnRoute(): void {
		const from = this.stops.find((stop) => stop.key === this.currentKey)?.path ?? this.host.focusPath();
		const stop = nextStop(this.stops, this.rated, from === null ? new Map() : this.host.hopsFrom(from), this.currentKey);
		if (stop === null) {
			new Notice("The route is finished: nothing else is due within reach.");
			return;
		}
		this.currentKey = stop.key;
		this.current = null; // The node is looked up on the next model, which may be the one this hop loads.
		this.visit(stop.key);
		this.host.goTo(stop.path, (model) => model.nodes.find((node) => nodeCardKey(node) === stop.key)?.id ?? null);
		this.host.redraw();
	}

	/** Trail "Next": fly to the following stop, in the author's order. A stop holding a due card makes it the current card; any other is visited and shown. */
	private nextOnTrail(): void {
		const step = this.trail[this.trailAt + 1];
		if (step === undefined) {
			new Notice("The trail is finished.");
			return;
		}
		this.trailAt++;
		this.currentKey = step.stop?.key ?? null;
		this.current = null; // Looked up on the next model, which may be the one this hop loads.
		this.host.goTo(step.path, (model) => linkTargetNode(model, step.path, step.subpath));
		this.host.redraw();
	}

	/** Make a node the current card, as arriving at it does. */
	private arrive(node: GraphNode): void {
		this.current = node.id;
		this.currentKey = nodeCardKey(node);
		if (this.path === "due" && this.currentKey !== null) this.visit(this.currentKey);
		this.syncThread();
		this.renderPanel();
	}

	private visit(key: string): void {
		if (this.visited[this.visited.length - 1] !== key) this.visited.push(key);
	}

	/** Draw the thread through the stops visited, as the model now shows them; due-driven and trail only. */
	private syncThread(): void {
		const model = this.model;
		if (model === null) {
			this.host.thread([]);
		} else if (this.path === "due") {
			this.host.thread(threadNodeIds(model.nodes, this.visited));
		} else if (this.path === "trail") {
			// A stop whose note is not loaded has no node, so the thread breaks there instead of bridging.
			this.host.thread(this.trail.slice(0, this.trailAt + 1).map((step) => linkTargetNode(model, step.path, step.subpath)));
		} else {
			this.host.thread([]);
		}
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
		const due = this.path === "due";
		const trail = this.path === "trail";
		const hidden = [...this.targets.values()].reduce((sum, keys) => sum + keys.length, 0);
		// Due-driven counts the whole route, which reaches past what is loaded; free exploration only what is hidden here.
		const left = due ? cardsToGo(this.stops, this.rated) : hidden;
		panel.createDiv({
			cls: "osmosis-graph3d-study-progress",
			text: trail
				? `${String(this.reviewed)} reviewed · stop ${String(this.trailAt + 1)} of ${String(this.trail.length)}`
				: `${String(this.reviewed)} reviewed · ${String(left)} ${due ? "to go" : "hidden here"}`,
		});
		const step = this.currentStep();
		if (step?.revealed !== true) {
			const paths = panel.createDiv({ cls: "osmosis-graph3d-study-actions osmosis-graph3d-study-paths" });
			for (const { path, label } of PATHS) {
				const button = paths.createEl("button", { text: label });
				button.toggleClass("mod-cta", path === this.path);
				button.setAttribute("aria-pressed", String(path === this.path));
				button.addEventListener("click", () => this.setPath(path));
			}
		}
		const row = panel.createDiv({ cls: "osmosis-graph3d-study-actions" });
		if (step?.revealed === true) {
			const rating = row.createDiv({ cls: "osmosis-rating osmosis-graph3d-study-rating" });
			for (const { label, rating: value, cls } of RATINGS) {
				rating.createEl("button", { text: label, cls }).addEventListener("click", () => void this.rate(value));
			}
		} else {
			if (step !== null) row.createEl("button", { text: "Reveal", cls: "mod-cta" }).addEventListener("click", () => this.reveal());
			const next = row.createEl("button", { text: "Next" });
			next.disabled = trail
					? this.trailAt >= this.trail.length - 1
					: due
						? !this.stops.some((stop) => stop.key !== this.currentKey && !stopDone(stop, this.rated))
						: hidden === 0 || (hidden === 1 && step !== null);
			next.addEventListener("click", () => this.next());
		}
		panel.createDiv({
			cls: "osmosis-graph3d-study-hint",
			text: step === null ? this.idleHint(due, left, hidden) : step.revealed ? "Rate it: keys 1–4." : "Recall it, then reveal: space, or click it again.",
		});
	}

	/** What to say while no card is current. */
	private idleHint(due: boolean, left: number, hidden: number): string {
		if (this.path === "trail") {
			if (this.trailAt < 0) return `Press Next to fly to the first stop of "${this.trailName}".`;
			const rest = this.trailAt >= this.trail.length - 1 ? "The trail is finished." : "Press Next to go on along the trail.";
			return this.trail[this.trailAt]?.stop === null ? `No card is due at this stop: it is shown, not rated. ${rest}` : rest;
		}
		if (due) return left === 0 ? "The route is finished: nothing else is due within reach." : "Press Next to fly to the next card on the route.";
		return hidden === 0 ? "No due cards here: hop on to look further." : "Fly to a ? and click it, or press Next.";
	}
}
