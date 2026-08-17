import { MarkdownView, Notice, TFile, getIconIds, setIcon } from "obsidian";
import type { CachedMetadata } from "obsidian";
import type OsmosisPlugin from "../main";
import type { FSRSRating } from "../database/FSRSScheduler";
import type { StudySessionManager } from "../study/StudySessionManager";
import { lineCardId } from "../card-gen/line-cards";
import type { CardOcclusion } from "../database/types";
import {
	allFenceCardKeys,
	allLineCardBlockIds,
	cardIdsForLineKey,
	dueCardsForFenceKey,
	dueOrNewFenceCardKeys,
	dueOrNewLineCardBlockIds,
} from "../study/spatial-study";
import { occlusionSteps, type OcclusionStep } from "../study/occlusion-steps";
import type { OcclusionSide } from "../study/occlusion-masks";
import { overlayMasks, renderOcclusion } from "./OcclusionRenderer";
import {
	blocksInRange,
	computeRevealOrder,
	listItemIdsInRange,
	nextToReveal,
	type BlockRef,
	type ListItemRef,
} from "../study/line-reveal";

/** Placeholder shown in place of a hidden line (matches fence-card hiding). */
const PLACEHOLDER_TEXT = "░░░░░░";

/**
 * Contextual reveal mode for a note.
 * - "off": reading view is a normal reading surface, nothing hidden.
 * - "peek": every line-card line hidden; click reveals in any order, no ratings.
 * - "study": only due/new line-card lines hidden; top-down reveal + rating bubble.
 */
type RevealMode = "off" | "peek" | "study";

/** A line-card line currently rendered in reading view. */
interface TrackedLine {
	/** Element carrying the hidden/revealed state (li or section container). */
	container: HTMLElement;
	placeholder: HTMLElement;
	/**
	 * The masked diagram this line carries, when it has one.
	 *
	 * Held so the reveal can *repaint* it rather than swap it away — see
	 * `applyAll`. Null for an ordinary line card.
	 */
	occlusion: CardOcclusion | null;
}

/** Per-note reveal/study state. Survives re-renders (keyed by block ID). */
interface NoteRevealState {
	mode: RevealMode;
	revealed: Set<string>;
	rated: Set<string>;
	/** Block IDs being studied this session (due or new at session start). */
	studyTargets: Set<string> | null;
	/**
	 * Fence keys being studied this session (due or new at session start).
	 *
	 * Held beside `studyTargets` rather than merged into it because the two are
	 * different kinds of string — a bare block ID and a fence's own `id:` — and
	 * every line lookup here indexes by the former. `ContextualStudyProcessor`
	 * owns the fences themselves and asks this set whether the one it is about
	 * to draw is a target; the pill counts both.
	 */
	fenceTargets: Set<string> | null;
	/**
	 * How many questions each fence target asks this session, fixed when study
	 * starts — a cloze group or a direction of a bidirectional pair is its own
	 * card, so a fence is one target but often several questions.
	 */
	fenceSteps: Map<string, number>;
	/** How many of them have been answered. Fences rate in the other processor. */
	ratedFences: Map<string, number>;
	/** Revealed-but-unrated card whose rating bubble is showing. */
	pendingRating: string | null;
	/**
	 * When `pendingRating` was revealed, for the review log's elapsed time.
	 * A line card sits in the note among ordinary content, so there is no
	 * "question shown" moment to measure from — the reveal is the only
	 * defensible anchor.
	 */
	pendingRatingAt: number;
	/**
	 * The shape groups each occluded line asks this session, fixed when study
	 * starts so the sequence cannot change under the user as schedules move.
	 * A line with no masks has no entry — it is one question, as it always was.
	 */
	studySteps: Map<string, OcclusionStep[]>;
	/** How far through `studySteps` each occluded line has been answered. */
	stepAt: Map<string, number>;
	/** Rendered elements by block ID — refreshed on every (re-)render. */
	lines: Map<string, TrackedLine>;
}

/**
 * Contextual progressive-reveal study for line cards (plan §5, revised
 * 2026-07-14).
 *
 * Reading view stays a normal reading surface by default. Two header
 * actions appear on notes with line cards (reading mode only):
 * - Peek (`eye-dashed`): hides every tagged line; click any placeholder
 *   to reveal it — casual, nothing recorded.
 * - Study (`graduation-cap`, same convention as Mind Map View): hides
 *   only lines whose card is due or new, enforces top-down reveal, and
 *   shows a rating bubble after each reveal. A floating pill shows
 *   progress and Stop.
 *
 * Hiding is purely visual (post-processor DOM), never a content edit.
 */
export class LineRevealProcessor {
	private readonly states = new Map<string, NoteRevealState>();
	private sessionManager: StudySessionManager | null = null;

	constructor(private readonly plugin: OsmosisPlugin) {}

	register(): void {
		this.plugin.registerMarkdownPostProcessor((el, ctx) => {
			const cardIds = this.lineCardBlockIds(ctx.sourcePath);
			if (cardIds.size === 0) return;

			const info = ctx.getSectionInfo(el);
			if (!info) return;

			// Skip render surfaces that aren't the note's own reading view.
			// closest() sees ancestors inside detached subtrees, so embeds and
			// popovers are identifiable here even though reading-view sections
			// often attach to the document a frame later — which is why this
			// must not require attachment (a connectivity check would silently
			// drop every normal section).
			if (el.closest(".internal-embed, .hover-popover, .is-live-preview")) return;

			this.processSection(el, ctx.sourcePath, cardIds, info.lineStart, info.lineEnd);
			// Card sync may finish after the initial layout events fired
			this.updateHeaderActions();
		});

		// Header actions and the floating pill live on view chrome that
		// outlives the note they were created for — refresh on view changes
		this.plugin.registerEvent(
			this.plugin.app.workspace.on("file-open", () => {
				this.updateHeaderActions();
				this.syncBanners();
			}),
		);
		this.plugin.registerEvent(
			this.plugin.app.workspace.on("layout-change", () => {
				this.updateHeaderActions();
				this.syncBanners();
				this.flushClosedNotes();
			}),
		);
		// Tab/leaf activation fires neither of the above: switching between
		// a mind map and a markdown tab of the same file doesn't change the
		// active file, and a background tab deferred at startup only becomes
		// a real MarkdownView (visible to updateHeaderActions) once activated.
		this.plugin.registerEvent(
			this.plugin.app.workspace.on("active-leaf-change", () => {
				this.updateHeaderActions();
				this.syncBanners();
			}),
		);

		// Restore any open reading views if the plugin unloads mid-session
		this.plugin.register(() => {
			if (this.chromeRetryTimer !== null) {
				window.clearTimeout(this.chromeRetryTimer);
				this.chromeRetryTimer = null;
			}
			this.removeAllArtifacts();
		});
	}

	/**
	 * Called after card sync. Refreshes header buttons and pills, and
	 * re-renders any open reading view whose sections rendered before its
	 * line cards existed in the store (startup race: the post-processor
	 * skips notes with no known line cards, and nothing re-runs it when
	 * sync finishes).
	 */
	refreshChrome(): void {
		const allReady = this.updateHeaderActions();
		this.syncBanners();

		for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView)) continue;
			const path = view.file?.path;
			if (path === undefined || view.getMode() !== "preview") continue;
			if (this.lineCardBlockIds(path).size === 0) continue;
			if (this.hasRenderedLines(path)) continue;
			view.previewMode.rerender(true);
		}

		// App-startup race, other direction: syncAll can finish while a
		// restored markdown view is still loading (leaf not yet a real
		// MarkdownView, file not yet assigned). No workspace event fires
		// when it becomes ready, so retry briefly until every leaf was
		// processable.
		if (allReady) {
			this.chromeRetryAttempts = 0;
		} else {
			this.scheduleChromeRetry();
		}
	}

	private chromeRetryTimer: number | null = null;
	private chromeRetryAttempts = 0;

	/** One pending retry at a time, capped so a file-less view can't loop forever. */
	private scheduleChromeRetry(): void {
		if (this.chromeRetryTimer !== null) return;
		if (this.chromeRetryAttempts >= 20) return;
		this.chromeRetryAttempts++;
		this.chromeRetryTimer = window.setTimeout(() => {
			this.chromeRetryTimer = null;
			this.refreshChrome();
		}, 300);
	}

	/** Whether any of the note's line-card lines are tracked in the live DOM. */
	private hasRenderedLines(notePath: string): boolean {
		const state = this.states.get(notePath);
		if (!state) return false;
		for (const line of state.lines.values()) {
			if (line.container.isConnected) return true;
		}
		return false;
	}

	// ── Section processing ────────────────────────────────────

	private processSection(
		el: HTMLElement,
		notePath: string,
		cardIds: ReadonlySet<string>,
		lineStart: number,
		lineEnd: number,
	): void {
		const cache = this.fileCache(notePath);
		const blocks = toBlockRefs(cache);
		const inSection = blocksInRange(blocks, cardIds, lineStart, lineEnd);
		if (inSection.length === 0) return;

		const state = this.stateFor(notePath);

		// A blockquote / callout is a single line card even when it contains a
		// bullet list — its `<li>`s belong to the one block, not to per-item
		// cards. Treat the whole section as one block so it hides like the
		// blockquote node it is (without this, the inner list hijacks the
		// list-item branch below and nothing gets tracked).
		const isQuoteSection =
			el.matches("blockquote, .callout") ||
			el.querySelector("blockquote, .callout") !== null;

		const listEls = isQuoteSection ? [] : Array.from(el.querySelectorAll("li"));
		if (listEls.length > 0) {
			// List section: align cache list items with <li> elements — both
			// are pre-order traversals of the same list.
			const ids = listItemIdsInRange(toListItemRefs(cache), lineStart, lineEnd);
			const n = Math.min(listEls.length, ids.length);
			for (let i = 0; i < n; i++) {
				const id = ids[i];
				if (id !== undefined && cardIds.has(id)) {
					this.trackLine(state, notePath, id, listEls[i] as HTMLElement);
				}
			}
		} else {
			// Paragraph/heading/table/code section: one block, hide the whole
			// section content.
			this.trackLine(state, notePath, inSection[0]!.id, el);
		}

		this.applyAll(notePath);
	}

	/**
	 * The occluded diagram sitting on a line, or null when the line has no masks.
	 *
	 * Every card the line fans out into carries the whole shape set, so the first
	 * one answers the question. **The block ID is the signal, never `cardType`** —
	 * an occluded line card is typed `"occlusion"` while still living on its line.
	 */
	private lineOcclusion(notePath: string, blockId: string): CardOcclusion | null {
		for (const card of this.plugin.cardStore.getCardsByNote(notePath)) {
			if (card.blockId === blockId && card.occlusion) return card.occlusion;
		}
		return null;
	}

	/** Wrap a line's content for hiding (idempotent) and register it. */
	private trackLine(state: NoteRevealState, notePath: string, blockId: string, container: HTMLElement): void {
		// Looked up on every render, not just the first: the placeholder survives
		// a re-render but the card store may only have caught up with the line's
		// shapes since.
		const occlusion = this.lineOcclusion(notePath, blockId);

		let placeholder = container.querySelector<HTMLElement>(":scope > .osmosis-line-placeholder");
		if (!placeholder) {
			// Move the line's own content into a hideable wrapper. Nested
			// lists stay outside it — child items are their own cards and
			// keep their own placeholders. The collapse indicator stays too.
			const back = createEl(container.instanceOf(HTMLLIElement) ? "span" : "div");
			back.className = "osmosis-line-back";
			for (const node of Array.from(container.childNodes)) {
				if (isPreservedNode(node)) continue;
				back.appendChild(node);
			}

			placeholder = createSpan();
			placeholder.className = "osmosis-line-placeholder osmosis-hidden";
			// An occluded line is hidden by masking the regions that carry its
			// cards, not by blanking the whole diagram: covering the picture
			// entirely asks the reader to recall the image rather than the labels
			// on it, which is the one thing occlusion exists not to do. Every group
			// is covered at once, since in the note no single card is being asked.
			if (occlusion) {
				renderOcclusion(this.plugin.app, placeholder, occlusion, "all-hidden", notePath);
			} else {
				placeholder.textContent = PLACEHOLDER_TEXT;
			}
			placeholder.addEventListener("click", () => {
				this.onPlaceholderClick(notePath, blockId);
			});

			const firstNestedList = container.querySelector(":scope > ul, :scope > ol");
			container.insertBefore(placeholder, firstNestedList);
			container.insertBefore(back, firstNestedList);
		}

		state.lines.set(blockId, { container, placeholder, occlusion });
	}

	/** Re-apply mode/reveal state to every tracked line of a note. */
	private applyAll(notePath: string): void {
		const state = this.stateFor(notePath);
		const targets = this.activeTargets(notePath, state);
		const next =
			state.mode === "study" && targets
				? nextToReveal(computeRevealOrder(toBlockRefs(this.fileCache(notePath)), targets), state.revealed)
				: null;

		for (const [blockId, line] of state.lines) {
			// Freshly rendered sections may not be attached yet — class
			// changes stick either way, and trackLine replaces stale entries
			// per block ID on the next render.
			const targeted = targets?.has(blockId) ?? false;
			const hidden = targeted && !state.revealed.has(blockId);

			// An occluded line is revealed by *repainting* its masks, never by
			// swapping the line's own content back in. Its content is the bare
			// diagram, so the swap threw away the masks and the annotations
			// together — the answer arrived as an unmarked picture with nothing
			// to say which regions had been the question. Ringing them instead
			// keeps the question visible beside its answer, and holds the line's
			// height steady, exactly as a fence card does in reading view.
			const painted = line.occlusion !== null && targeted;
			const showPlaceholder = painted || hidden;
			line.container.classList.toggle("osmosis-line-hidden", showPlaceholder);
			line.placeholder.classList.toggle("osmosis-hidden", !showPlaceholder);
			if (painted && line.occlusion) {
				const img = line.placeholder.querySelector("img");
				// Repaint in place: rebuilding the <img> would re-request the file
				// and flash the diagram away mid-answer.
				if (img) {
					const { occlusion, side } = this.maskingFor(state, blockId, line.occlusion, hidden);
					overlayMasks(img, occlusion, side);
				}
			}
			// During study, only the next line is clickable; later ones are locked
			const locked = state.mode === "study" && hidden && blockId !== next;
			line.placeholder.classList.toggle("osmosis-line-locked", locked);
			line.placeholder.classList.toggle("osmosis-line-next", state.mode === "study" && blockId === next);

			const bubble = line.container.querySelector(":scope > .osmosis-line-rating");
			if (state.pendingRating === blockId && state.revealed.has(blockId)) {
				// Re-create the bubble if a re-render (e.g. debounced
				// frontmatter flush) destroyed it mid-rating
				if (!bubble) this.showRatingBubble(notePath, blockId, line);
			} else if (bubble) {
				bubble.remove();
			}
		}
	}

	/**
	 * How an occluded line's diagram should be painted right now: which masks, and
	 * which side of the question.
	 *
	 * **Peek and study part company here.** Peek is a reader looking at a picture:
	 * every group is a blank at once and none is singled out, so it keeps the
	 * `all-hidden` / `all-revealed` pair. Study is a card player — a target, a
	 * rating, a completion count — so it asks the line's groups one at a time,
	 * exactly as sequential and spatial do, and the mode decides what happens to
	 * the group's siblings.
	 *
	 * A study session with no steps for this line (an ordinary occluded line whose
	 * groups all resolved to nothing, say) falls back to the peek pair rather than
	 * showing an unmasked diagram.
	 */
	private maskingFor(
		state: NoteRevealState,
		blockId: string,
		occlusion: CardOcclusion,
		hidden: boolean,
	): { occlusion: CardOcclusion; side: OcclusionSide } {
		const step = this.currentStep(state, blockId);
		if (step === null) {
			return { occlusion, side: hidden ? "all-hidden" : "all-revealed" };
		}
		return {
			occlusion: { ...occlusion, target: step.group },
			side: hidden ? "front" : "back",
		};
	}

	/** The shape group a studied line is currently being asked about, if any. */
	private currentStep(state: NoteRevealState, blockId: string): OcclusionStep | null {
		if (state.mode !== "study") return null;
		const steps = state.studySteps.get(blockId);
		if (steps === undefined) return null;
		return steps[state.stepAt.get(blockId) ?? 0] ?? null;
	}

	/** The block IDs currently subject to hiding, or null when mode is off. */
	private activeTargets(notePath: string, state: NoteRevealState): ReadonlySet<string> | null {
		switch (state.mode) {
			case "off":
				return null;
			case "peek":
				return this.lineCardBlockIds(notePath);
			case "study":
				return state.studyTargets;
		}
	}

	// ── Interaction ───────────────────────────────────────────

	private onPlaceholderClick(notePath: string, blockId: string): void {
		const state = this.stateFor(notePath);
		if (state.mode === "off" || state.revealed.has(blockId)) return;

		if (state.mode === "study") {
			// Top-down only: earlier lines must be revealed and rated first
			if (state.pendingRating !== null) return;
			const targets = state.studyTargets ?? new Set<string>();
			const order = computeRevealOrder(toBlockRefs(this.fileCache(notePath)), targets);
			if (blockId !== nextToReveal(order, state.revealed)) return;
			state.revealed.add(blockId);
			state.pendingRating = blockId;
			state.pendingRatingAt = Date.now();
		} else {
			// Peek — any order, nothing recorded
			state.revealed.add(blockId);
		}

		this.applyAll(notePath);
		this.syncBanners();
	}

	private showRatingBubble(notePath: string, blockId: string, line: TrackedLine): void {
		const bubble = createDiv();
		bubble.className = "osmosis-line-rating osmosis-contextual-rating";

		const ratings: Array<{ label: string; rating: FSRSRating; cls: string }> = [
			{ label: "Again", rating: 1, cls: "osmosis-rate-again" },
			{ label: "Hard", rating: 2, cls: "osmosis-rate-hard" },
			{ label: "Good", rating: 3, cls: "osmosis-rate-good" },
			{ label: "Easy", rating: 4, cls: "osmosis-rate-easy" },
		];
		for (const { label, rating, cls } of ratings) {
			const btn = createEl("button");
			btn.textContent = label;
			btn.className = cls;
			btn.addEventListener("click", (e) => {
				e.stopPropagation();
				void this.rate(notePath, blockId, rating);
			});
			bubble.appendChild(btn);
		}

		const back = line.container.querySelector(":scope > .osmosis-line-back");
		line.container.insertBefore(bubble, back?.nextSibling ?? null);
	}

	private async rate(notePath: string, blockId: string, rating: FSRSRating): Promise<void> {
		const state = this.stateFor(notePath);
		if (state.pendingRating !== blockId) return;

		// One reveal, one rating. For an ordinary line that reaches every card the
		// line carries — the line key is not any of their IDs, so rating it as a
		// single card recorded nothing. An **occluded** line in study is stepping
		// through its groups, and each group is its own card with its own
		// schedule, so the rating reaches only the one just answered.
		const step = this.currentStep(state, blockId);
		const cardIds = step === null
			? cardIdsForLineKey(
				this.plugin.cardStore.getCardsByNote(notePath),
				lineCardId(notePath, blockId),
			)
			: step.cardId === null ? [] : [step.cardId];
		if (cardIds.length > 0) {
			this.sessionManager ??= this.plugin.createSessionManager("contextual");
			const elapsedMs = Date.now() - state.pendingRatingAt;
			for (const cardId of cardIds) {
				await this.sessionManager.recordReview(cardId, rating, { elapsedMs });
			}
			this.plugin.refreshDashboard();
		}

		state.pendingRating = null;

		// More groups on this line means the line is not finished: it goes back to
		// hidden with the next group targeted, rather than being handed to the
		// reveal order's next line.
		const steps = state.studySteps.get(blockId);
		const next = (state.stepAt.get(blockId) ?? 0) + 1;
		if (steps !== undefined && next < steps.length) {
			state.stepAt.set(blockId, next);
			state.revealed.delete(blockId);
			this.applyAll(notePath);
			this.syncBanners();
			return;
		}
		if (steps !== undefined) state.stepAt.set(blockId, steps.length);

		state.rated.add(blockId);

		const targets = state.studyTargets;
		if (targets && targets.size > 0 && [...targets].every((id) => state.rated.has(id))) {
			this.endStudy(notePath, state);
			new Notice(`Contextual study complete — ${String(targets.size)} lines rated.`);
			this.updateHeaderActions();
			this.plugin.contextualStudy.refresh(notePath);
		}

		this.applyAll(notePath);
		this.syncBanners();
	}

	private togglePeek(notePath: string): void {
		const state = this.stateFor(notePath);
		if (state.mode === "study") this.endStudy(notePath, state);

		if (state.mode === "peek") {
			state.mode = "off";
		} else {
			state.mode = "peek";
		}
		state.revealed.clear();

		this.applyAll(notePath);
		this.syncBanners();
		this.updateHeaderActions();
		this.plugin.contextualStudy.refresh(notePath);
	}

	private toggleStudy(notePath: string): void {
		const state = this.stateFor(notePath);
		if (state.mode === "study") {
			this.endStudy(notePath, state);
		} else {
			// Only cards that are due (or never reviewed) get studied —
			// scheduling decides, same as spatial mode (plan §5). One timestamp
			// for both halves so a card on the boundary cannot land in one and
			// not the other.
			const now = Date.now();
			const targets = this.dueOrNewBlockIds(notePath, now);
			const fences = this.dueOrNewFenceKeys(notePath, now);
			if (targets.size === 0 && fences.size === 0) {
				new Notice("No cards are due in this note.");
				return;
			}
			state.mode = "study";
			state.studyTargets = targets;
			state.fenceTargets = fences;
			state.revealed.clear();
			state.rated.clear();
			state.ratedFences.clear();
			state.pendingRating = null;
			this.planOcclusionSteps(notePath, state, targets);
			this.planFenceSteps(notePath, state, fences);
		}

		this.applyAll(notePath);
		this.syncBanners();
		this.updateHeaderActions();
		this.plugin.contextualStudy.refresh(notePath);
	}

	/**
	 * Work out, once at session start, which shape groups each occluded target
	 * line will be asked about.
	 *
	 * Fixed up front rather than recomputed per reveal because rating the first
	 * group moves its due date — recomputing would drop it from the list mid-flight
	 * and renumber everything after it. Only the groups the scheduler would ask
	 * now are included, so a line with one due group out of three is one question.
	 */
	private planOcclusionSteps(
		notePath: string,
		state: NoteRevealState,
		targets: ReadonlySet<string>,
	): void {
		state.studySteps.clear();
		state.stepAt.clear();

		const cards = this.plugin.cardStore.getCardsByNote(notePath);
		const now = Date.now();
		for (const blockId of targets) {
			const occlusion = this.lineOcclusion(notePath, blockId);
			if (!occlusion) continue;
			const lineCards = cards.filter((card) => card.blockId === blockId);
			const steps = occlusionSteps([occlusion], lineCards, now);
			// No due groups leaves the line as the single question it has always
			// been, rather than a target that can never be answered.
			if (steps.length > 0) state.studySteps.set(blockId, steps);
		}
	}

	/**
	 * How many questions each fence target will ask this session.
	 *
	 * Counted from the store here rather than reported by each fence as it draws,
	 * because reading view builds its sections lazily: a fence below the fold has
	 * not been rendered yet, and the pill would understate the session until the
	 * reader happened to scroll past it.
	 *
	 * `ContextualStudyProcessor` derives the same sequence from the same store
	 * with the same filter, so the two agree — see `fenceStepPlan`. An occluded
	 * fence is counted the same way, one question per shape group, since the
	 * store holds a card per group exactly as it does per cloze group.
	 */
	private planFenceSteps(
		notePath: string,
		state: NoteRevealState,
		targets: ReadonlySet<string>,
	): void {
		state.fenceSteps.clear();

		const cards = this.plugin.cardStore.getCardsByNote(notePath);
		const now = Date.now();
		for (const key of targets) {
			// A target with nothing countable is still one question, for the reason
			// `planOcclusionSteps` gives: better one that cannot be answered than a
			// session whose total is short by a fence the reader can see.
			state.fenceSteps.set(key, Math.max(dueCardsForFenceKey(cards, key, now).length, 1));
		}
	}

	/** Leave study mode: drop session state and flush pending schedule writes. */
	private endStudy(notePath: string, state: NoteRevealState): void {
		state.mode = "off";
		state.studyTargets = null;
		state.fenceTargets = null;
		state.pendingRating = null;
		state.revealed.clear();
		state.ratedFences.clear();
		state.fenceSteps.clear();
		state.studySteps.clear();
		state.stepAt.clear();
		void this.plugin.scheduleStore.flush();
		// Fence cards keep their schedule inside the note's own text, so a
		// contextual session holds those writes back rather than rewriting the
		// block being read after every answer. This is where they land.
		void this.plugin.fenceWriter.flush();
		void this.plugin.reviewLog.flush();
	}

	/**
	 * Write out the staged fence schedules of any note that is no longer open.
	 *
	 * Holding a fence write back is only worth doing while the note is on screen
	 * — that is the whole reason for it (see `FenceWriter.stageSchedule`). Once
	 * the note is closed there is nothing left to disturb, and leaving reviews
	 * unwritten risks losing them to a crash if the reader never presses Stop.
	 */
	private flushClosedNotes(): void {
		const pending = this.plugin.fenceWriter.pendingPaths();
		if (pending.length === 0) return;

		const open = new Set<string>();
		for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.file) open.add(view.file.path);
		}
		for (const path of pending) {
			if (!open.has(path)) void this.plugin.fenceWriter.flushPath(path);
		}
	}

	// ── Header actions (peek + study) ─────────────────────────

	/**
	 * Keep the peek/study buttons on every markdown view header in sync:
	 * present on notes carrying **any** card in both reading and edit mode,
	 * between the mind map button and the reading/edit toggle, with
	 * `is-active` reflecting the note's current mode.
	 *
	 * The gate used to be line cards alone, which meant a note whose cards were
	 * all ```osmosis fences — a whole deck of basic question/answer cards, say —
	 * offered no way to study them in place at all.
	 *
	 * Returns false when a markdown leaf couldn't be processed because its
	 * view isn't ready yet (still deferred, header not built, no file) —
	 * refreshChrome uses this to retry after app startup.
	 */
	private updateHeaderActions(): boolean {
		let allReady = true;
		for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView)) {
				allReady = false;
				continue;
			}
			const actions = view.containerEl.querySelector(".view-actions");
			if (!actions) {
				allReady = false;
				continue;
			}

			const path = view.file?.path;
			if (path === undefined) allReady = false;
			const show = path !== undefined && this.hasAnyCard(path);

			let studyBtn = actions.querySelector(".osmosis-line-study-action");
			let peekBtn = actions.querySelector(".osmosis-line-peek-action");

			if (!show) {
				studyBtn?.remove();
				peekBtn?.remove();
				continue;
			}

			studyBtn ??= this.createHeaderAction("graduation-cap", "Study this note", "osmosis-line-study-action", view, (p) => {
				this.toggleStudy(p);
			});
			peekBtn ??= this.createHeaderAction(peekIcon(), "Peek mode", "osmosis-line-peek-action", view, (p) => {
				this.togglePeek(p);
			});

			// Re-anchor on every pass (the mind map button may appear after us):
			// right of the mind map button when present, else left of the
			// reading/edit toggle, else leftmost.
			const mindMapBtn = actions.querySelector(".osmosis-mindmap-action");
			const anchor: Node | null = mindMapBtn
				? mindMapBtn.nextSibling
				: (findModeToggle(actions) ?? actions.firstChild);
			actions.insertBefore(studyBtn, anchor);
			actions.insertBefore(peekBtn, studyBtn);

			const state = this.stateFor(path);
			studyBtn.classList.toggle("is-active", state.mode === "study");
			peekBtn.classList.toggle("is-active", state.mode === "peek");
		}
		return allReady;
	}

	private createHeaderAction(
		icon: string,
		label: string,
		cls: string,
		view: MarkdownView,
		onClick: (notePath: string) => void,
	): HTMLElement {
		const btn = createEl("a");
		btn.className = `clickable-icon view-action ${cls}`;
		btn.setAttribute("aria-label", label);
		setIcon(btn, icon);
		btn.addEventListener("click", () => {
			const path = view.file?.path;
			if (path === undefined) return;
			void (async () => {
				// Peek/study live in reading view — switch to it first if needed
				if (view.getMode() !== "preview") {
					await view.leaf.setViewState({
						type: "markdown",
						state: { ...view.getState(), mode: "preview" },
					});
				}
				onClick(path);
			})();
		});
		return btn;
	}

	// ── Floating pill (study progress + Stop) ─────────────────

	private ensureBanner(host: HTMLElement, notePath: string): void {
		let banner = host.querySelector<HTMLElement>(":scope > .osmosis-reveal-banner");
		if (!banner) {
			banner = createDiv();
			banner.className = "osmosis-reveal-banner";
			host.appendChild(banner);
		}
		banner.dataset["notePath"] = notePath;
		this.renderBanner(banner, notePath);
	}

	private renderBanner(banner: HTMLElement, notePath: string): void {
		banner.empty();
		const state = this.stateFor(notePath);
		const { done, total } = this.studyProgress(state);

		banner.createSpan({
			cls: "osmosis-reveal-progress",
			text: `${String(done)}/${String(total)} rated`,
		});
		const stopBtn = banner.createEl("button", { text: "Stop", cls: "osmosis-reveal-btn" });
		stopBtn.addEventListener("click", () => {
			this.toggleStudy(notePath);
		});
	}

	/**
	 * The pill's count, in **questions rather than lines**.
	 *
	 * An occluded line asks one question per shape group, so counting lines would
	 * report "0/1" through two of the three answers a three-group diagram takes.
	 * The mind map's banner counts cards for the same reason.
	 */
	private studyProgress(state: NoteRevealState): { done: number; total: number } {
		let done = 0;
		let total = 0;
		for (const blockId of state.studyTargets ?? []) {
			const steps = state.studySteps.get(blockId)?.length ?? 1;
			total += steps;
			done += state.rated.has(blockId) ? steps : (state.stepAt.get(blockId) ?? 0);
		}
		// A fence counts its questions the same way: a three-group cloze fence asks
		// three and a bidirectional pair asks two, each rated separately, so the
		// pill would sit still through most of a note of them if it counted fences.
		for (const key of state.fenceTargets ?? []) {
			const steps = state.fenceSteps.get(key) ?? 1;
			total += steps;
			// Clamped, because the count comes from another processor's ratings and a
			// total that ran ahead of itself would be worse than one that stalls.
			done += Math.min(state.ratedFences.get(key) ?? 0, steps);
		}
		return { done, total };
	}

	/**
	 * Show the pill on every reading view whose note is in study mode;
	 * remove it everywhere else (mode ended, leaf switched notes, edit mode).
	 */
	private syncBanners(): void {
		for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView)) continue;
			const host = view.containerEl.querySelector(".markdown-reading-view");
			if (!(host instanceof HTMLElement)) continue;

			const path = view.file?.path;
			const studying = path !== undefined && this.stateFor(path).mode === "study";
			if (studying && view.getMode() === "preview") {
				host.classList.add("osmosis-reveal-host");
				this.ensureBanner(host, path);
			} else {
				host.querySelector(":scope > .osmosis-reveal-banner")?.remove();
			}
		}
	}

	// ── Lookups ───────────────────────────────────────────────

	/** Block IDs of this note's line cards (deck-excluded ones included — in-place study). */
	private lineCardBlockIds(notePath: string): Set<string> {
		return allLineCardBlockIds(this.plugin.cardStore.getCardsByNote(notePath));
	}

	/** Line cards the scheduler would study now: due, or new (never reviewed). */
	private dueOrNewBlockIds(notePath: string, now: number): Set<string> {
		return dueOrNewLineCardBlockIds(this.plugin.cardStore.getCardsByNote(notePath), now);
	}

	/** Fence keys of this note's fence cards, whatever their schedule. */
	private fenceKeys(notePath: string): Set<string> {
		return allFenceCardKeys(this.plugin.cardStore.getCardsByNote(notePath));
	}

	/** Fence cards the scheduler would study now: due, or new (never reviewed). */
	private dueOrNewFenceKeys(notePath: string, now: number): Set<string> {
		return dueOrNewFenceCardKeys(this.plugin.cardStore.getCardsByNote(notePath), now);
	}

	/** Whether the note carries any card at all — line or fence. Gates the header buttons. */
	private hasAnyCard(notePath: string): boolean {
		const cards = this.plugin.cardStore.getCardsByNote(notePath);
		return allLineCardBlockIds(cards).size > 0 || allFenceCardKeys(cards).size > 0;
	}

	/**
	 * Whether this fence is one of the questions the running session is asking.
	 *
	 * Read by `ContextualStudyProcessor`, which owns fence rendering: a fence
	 * that is not a target renders revealed and inert during a session — it is
	 * context, not a question — and takes no rating.
	 */
	isFenceTarget(notePath: string, fenceKey: string): boolean {
		const state = this.states.get(notePath);
		if (!state || state.mode !== "study") return false;
		return state.fenceTargets?.has(fenceKey) ?? false;
	}

	/**
	 * Record that one of a fence's questions was answered, so the pill advances.
	 *
	 * The rating itself is written by `ContextualStudyProcessor` — this only
	 * tells the session's progress counter that one of its questions is done.
	 * Counted rather than flagged: a fence that fans out is answered a card at a
	 * time, and each of those is a question the reader has finished.
	 */
	markFenceRated(notePath: string, fenceKey: string): void {
		const state = this.states.get(notePath);
		if (!state || state.mode !== "study") return;
		if (!state.fenceTargets?.has(fenceKey)) return;
		state.ratedFences.set(fenceKey, (state.ratedFences.get(fenceKey) ?? 0) + 1);
		this.syncBanners();
	}

	private fileCache(notePath: string): CachedMetadata | null {
		const file = this.plugin.app.vault.getFileByPath(notePath);
		if (!(file instanceof TFile)) return null;
		return this.plugin.app.metadataCache.getFileCache(file);
	}

	/**
	 * The reveal mode a note is currently in, without creating state for a note
	 * that has none. Read by the fence processor, which shares the reading view
	 * with these lines and must only offer a rating while study is running.
	 */
	revealMode(notePath: string): RevealMode {
		return this.states.get(notePath)?.mode ?? "off";
	}

	private stateFor(notePath: string): NoteRevealState {
		let state = this.states.get(notePath);
		if (!state) {
			state = {
				mode: "off",
				revealed: new Set(),
				rated: new Set(),
				studyTargets: null,
				fenceTargets: null,
				ratedFences: new Map(),
				fenceSteps: new Map(),
				pendingRating: null,
				pendingRatingAt: 0,
				studySteps: new Map(),
				stepAt: new Map(),
				lines: new Map(),
			};
			this.states.set(notePath, state);
		}
		return state;
	}

	/** Undo all DOM changes (plugin unload): unhide lines, drop injected UI. */
	private removeAllArtifacts(): void {
		const injected = document.querySelectorAll(
			".osmosis-reveal-banner, .osmosis-line-placeholder, .osmosis-line-rating, .osmosis-line-peek-action, .osmosis-line-study-action",
		);
		for (const el of Array.from(injected)) {
			el.remove();
		}
		for (const el of Array.from(document.querySelectorAll(".osmosis-line-hidden"))) {
			el.classList.remove("osmosis-line-hidden");
		}
		for (const back of Array.from(document.querySelectorAll(".osmosis-line-back"))) {
			back.replaceWith(...Array.from(back.childNodes));
		}
		for (const host of Array.from(document.querySelectorAll(".osmosis-reveal-host"))) {
			host.classList.remove("osmosis-reveal-host");
		}
	}
}

/** Nodes that stay outside the hideable wrapper. */
function isPreservedNode(node: Node): boolean {
	if (!(node.instanceOf(HTMLElement))) return false;
	return (
		node.tagName === "UL" ||
		node.tagName === "OL" ||
		node.classList.contains("list-collapse-indicator") ||
		node.classList.contains("osmosis-line-placeholder") ||
		node.classList.contains("osmosis-line-back") ||
		node.classList.contains("osmosis-line-rating")
	);
}

/**
 * Peek-mode icon: `eye-dashed` when this Obsidian's lucide set has it,
 * otherwise the closest available fallback. Checked at button-creation
 * time via getIconIds() — an unknown ID would render an empty button.
 * Shared with the mind map's peek action.
 */
export function peekIcon(): string {
	const available = new Set<string>(getIconIds());
	for (const candidate of ["eye-dashed", "scan-eye", "eye"]) {
		if (available.has(candidate) || available.has(`lucide-${candidate}`)) {
			return candidate;
		}
	}
	return "eye";
}

/** The reading/edit mode toggle in a view-actions row, if identifiable. */
function findModeToggle(actions: Element): Element | null {
	return actions.querySelector(
		'a.clickable-icon[aria-label^="Current view"], a.clickable-icon[aria-label="Edit this note"], a.clickable-icon[aria-label="Reading view"]',
	);
}

function toBlockRefs(cache: CachedMetadata | null): BlockRef[] {
	if (!cache?.blocks) return [];
	return Object.entries(cache.blocks).map(([id, block]) => ({
		id,
		startLine: block.position.start.line,
		endLine: block.position.end.line,
	}));
}

function toListItemRefs(cache: CachedMetadata | null): ListItemRef[] {
	if (!cache?.listItems) return [];
	return cache.listItems.map((item) => ({
		startLine: item.position.start.line,
		...(item.id !== undefined ? { id: item.id } : {}),
	}));
}
