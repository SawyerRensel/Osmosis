import { Component, MarkdownRenderer, Menu, setIcon, type MarkdownPostProcessorContext } from "obsidian";
import type OsmosisPlugin from "../main";
import { fenceDiagrams, fenceEmbedLine, stripEmbedLabels } from "../card-gen/occlusion";
import type { FSRSRating } from "../database/FSRSScheduler";
import type { Card, CardOcclusion, ScheduleData } from "../database/types";
import { renderOcclusion, repaintOcclusion } from "./OcclusionRenderer";
import type { StudySessionManager } from "../study/StudySessionManager";
import { CLOZE_BLANK, splitFenceHeader } from "../card-gen/explicit";
import { occlusionSteps, type OcclusionStep } from "../study/occlusion-steps";
import { dueCardsForFenceKey } from "../study/spatial-study";
import { addCodeBlockLanguageLabels } from "./codeBlockLabels";

/**
 * A fence resolved into what the two sides render.
 *
 * `front`/`back` are markdown, as every card type here has always produced.
 * Occlusion cannot be: masks are an SVG overlay pinned to an image, not
 * markdown, so an occluded fence carries its diagrams separately and its
 * markdown holds only the prose that surrounded them.
 */
interface ParsedFence {
	front: string;
	back: string;
	cardId: string;
	exclude: boolean;
	isCloze: boolean;
	/** Occluded diagrams, rendered after the prose on both sides. */
	occlusions?: CardOcclusion[];
}

/** An undo entry for contextual review. */
interface ContextualUndoEntry {
	type: "rate" | "exclude";
	cardId: string;
	sourcePath: string;
	/** Previous schedule data before the rating (null = card was new). Only for "rate". */
	previousSchedule?: ScheduleData | null;
	/** The rating label that was displayed. Only for "rate". */
	ratingLabel?: string;
	/** The previous exclude state. Only for "exclude". */
	previousExclude?: boolean;
}

/**
 * Contextual study mode: renders `osmosis` code blocks in reading view
 * with hidden answers that can be revealed on click. Optional FSRS rating
 * when "Start studying" is active.
 *
 * Registered via registerMarkdownCodeBlockProcessor in main.ts.
 */
export class ContextualStudyProcessor {
	private studyActive = false;
	private reviewedCount = 0;
	private totalCards = 0;
	private progressWidget: HTMLElement | null = null;
	private sessionManager: StudySessionManager | null = null;
	private readonly renderComponent = new Component();

	/** Track cards whose answers have been revealed this session to survive re-renders. */
	private readonly revealedCardIds = new Set<string>();
	/** Undo stack for contextual review actions. */
	private readonly undoStack: ContextualUndoEntry[] = [];
	/**
	 * How many of its questions each fence has been asked, by fence ID — shape
	 * groups for an occluded fence, derived cards for every other kind.
	 *
	 * Kept here rather than in the render, because Obsidian rebuilds a code
	 * block's DOM on every file change — a debounced schedule flush lands
	 * mid-session — and a step counter living in the element would restart the
	 * fence from its first question each time.
	 */
	private readonly stepAt = new Map<string, number>();
	/**
	 * The questions each occluded fence asks this session, by fence ID.
	 *
	 * Worked out once, when the fence is first drawn into a studied note, and
	 * kept for the rest of the session. Recomputing per render would renumber the
	 * sequence under the user: answering `c1` moves its due date, so the very next
	 * render would drop it, leaving a two-group diagram reporting itself finished
	 * on the answer to its first question. `LineRevealProcessor` fixes its own
	 * plan at session start for the same reason.
	 */
	private readonly occlusionPlan = new Map<string, OcclusionStep[]>();
	/**
	 * The cards each non-occluded fence is asking this session, by fence ID.
	 *
	 * The cloze and bidirectional counterpart of `occlusionPlan`, and pinned for
	 * the same reason: answering a card moves its due date, so re-resolving after
	 * the file changed would drop the card just answered and renumber everything
	 * after it — a three-group fence would report itself finished on its second
	 * answer.
	 */
	private readonly fencePlan = new Map<string, Card[]>();
	/**
	 * The fences on screen, so `refresh` can restart one when the note's reveal
	 * mode changes.
	 *
	 * A fence is a code block, and toggling peek or study does **not** re-run its
	 * processor — which is why the rating row is read late, at reveal time.
	 * Whether a fence is one of a *session's* questions cannot be read that late:
	 * a fence the session is not asking shows both its sides from the start, and
	 * that is decided when the front is drawn. So starting or stopping study has
	 * to reach fences that were already on screen.
	 *
	 * This used to track only occluded fences, on the reasoning that they were
	 * the only ones that render differently inside study than outside it. That
	 * stopped being true once a session began distinguishing its targets from the
	 * cards around them.
	 */
	private readonly trackedFences: {
		el: HTMLElement;
		sourcePath: string;
		restart: () => void;
	}[] = [];
	/**
	 * The height each reading-view fence last rendered to, by its source text.
	 * See `holdHeight` for what it is for.
	 */
	private readonly fenceHeights = new Map<string, number>();

	constructor(private readonly plugin: OsmosisPlugin) {}

	/**
	 * Register the code block processor with the plugin.
	 */
	register(): void {
		this.renderComponent.load();

		// Register Ctrl+Z for undo in contextual mode
		this.plugin.registerDomEvent(document, "keydown", (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key === "z" && this.undoStack.length > 0) {
				// Only handle if we're in reading view with osmosis cards
				const target = e.target as HTMLElement;
				if (target.closest(".osmosis-contextual-card") || target.closest(".markdown-reading-view")) {
					e.preventDefault();
					void this.undo();
				}
			}
		});

		this.plugin.registerMarkdownCodeBlockProcessor(
			"osmosis",
			(source: string, el: HTMLElement, ctx) => {
				this.holdHeight(source, el);
				// Defer so the element is attached to the DOM before we check context
				window.requestAnimationFrame(() => {
					const inLivePreview = el.closest(".is-live-preview") !== null;

					if (inLivePreview) {
						// Live preview: render both front and back (no hiding)
						this.renderPreviewCard(source, el, ctx.sourcePath);
					} else {
						// Reading view (default): interactive card with hidden answer.
						// Code block processors are not called in source mode, so if
						// we're not in live preview we must be in reading view.
						this.renderCard(source, el, ctx.sourcePath);
						this.rememberHeight(source, el);
					}

					el.removeClass("osmosis-fence-held");
					this.registerOcclusionMenu(source, el, ctx);
				});
			},
		);
	}

	/**
	 * Give a fence being (re-)rendered the height it had last time, until the
	 * deferred render fills it.
	 *
	 * Rating a card rewrites the note — schedules live in its frontmatter — and
	 * Obsidian answers a file change by re-running a code block's processor. The
	 * rebuilt block is inserted **empty** and only filled on the next frame, so
	 * the note briefly loses the whole card's height and the reader ends up
	 * further down it than they were: the same scroll bug as the rebuilt `<img>`,
	 * one level up. Holding the height keeps the document the same length across
	 * that frame.
	 *
	 * Keyed on the fence's source text, which is stable across re-renders and
	 * changes exactly when the card's height might have — an edited fence simply
	 * has no remembered height and reserves nothing.
	 */
	private holdHeight(source: string, el: HTMLElement): void {
		const held = this.fenceHeights.get(source);
		if (held === undefined) return;

		el.setCssProps({ "--osmosis-fence-height": `${String(held)}px` });
		el.addClass("osmosis-fence-held");
	}

	/**
	 * Record what the fence just rendered to, for the next rebuild to hold.
	 *
	 * Read a frame later, once the card has been laid out — and after the hold
	 * has been released, so a stale reservation cannot be measured back in.
	 */
	private rememberHeight(source: string, el: HTMLElement): void {
		window.requestAnimationFrame(() => {
			if (el.isConnected && el.offsetHeight > 0) this.fenceHeights.set(source, el.offsetHeight);
		});
	}

	/**
	 * Remember a fence so `refresh` can restart it, dropping any entry whose
	 * element has since left the document.
	 *
	 * Pruning on every render rather than on a schedule is enough: a note that is
	 * re-rendered replaces its own entries, and one that is closed stops producing
	 * them — so the list is bounded by what is actually on screen.
	 */
	private trackFence(el: HTMLElement, sourcePath: string, restart: () => void): void {
		for (let i = this.trackedFences.length - 1; i >= 0; i--) {
			if (!this.trackedFences[i]!.el.isConnected) this.trackedFences.splice(i, 1);
		}
		this.trackedFences.push({ el, sourcePath, restart });
	}

	/**
	 * Start a note's fences over, for when its reveal mode changes.
	 *
	 * Called by `LineRevealProcessor` on entering and leaving peek or study, which
	 * are the two things that change what a fence should be drawing and do not
	 * themselves re-run the code block processor.
	 *
	 * Each card *restarts* rather than being re-rendered: the card is repainted in
	 * place, so pressing the peek eye does not rebuild the picture and scroll the
	 * reader away from it — the very jump peek used to cause on a fence and never
	 * on a line.
	 */
	refresh(notePath: string): void {
		for (const entry of [...this.trackedFences]) {
			if (entry.sourcePath !== notePath || !entry.el.isConnected) continue;
			entry.restart();
		}
	}

	/**
	 * Forget where a fence had got to, because the note's mode changed and a mode
	 * change starts a fresh pass: study restarts at the fence's first question
	 * rather than resuming a sequence that has since ended, and a card revealed
	 * while reading does not open already answered.
	 */
	private resetFenceState(cardId: string): void {
		this.stepAt.delete(cardId);
		this.occlusionPlan.delete(cardId);
		this.fencePlan.delete(cardId);
		// The unstepped render keys on the fence, a stepped one on `<fence>#<step>`.
		for (const key of [...this.revealedCardIds]) {
			if (key === cardId || key.startsWith(`${cardId}#`)) this.revealedCardIds.delete(key);
		}
	}

	/**
	 * A fence in reading view: the questions it is being asked, or the document
	 * it is part of.
	 *
	 * **Stepping happens inside a session and nowhere else.** A fence the running
	 * session picked out asks its cards one at a time — a cloze group, then the
	 * next; a bidirectional pair forwards, then backwards — each with its own
	 * reveal and its own rating, exactly as sequential and spatial ask them.
	 * Every other fence renders as what its source says: both sides, in order,
	 * exactly as live preview draws it. That covers ordinary reading, peek, a
	 * fence nothing is due on, an excluded one, and one the store has never seen.
	 *
	 * The alternative — showing the *current card's* blanking while reading, which
	 * is what phase 2 left behind — meant a three-group cloze fence silently hid
	 * two of its groups from a reader who had started nothing.
	 *
	 * Built once and redrawn in place, like `renderOcclusionCard`: the step moves
	 * under handlers that are bound only here.
	 */
	private renderCard(source: string, el: HTMLElement, sourcePath: string): void {
		const parsed = this.parseFenceContent(source);
		if (!parsed) {
			this.renderDraft(source, el, sourcePath);
			return;
		}

		// An occluded fence is drawn once and repainted, never rebuilt — see
		// `renderOcclusionCard`. Both what it shows and how it flips differ from
		// every other card type here.
		if (parsed.occlusions !== undefined && parsed.occlusions.length > 0) {
			this.renderOcclusionCard(parsed, el, sourcePath);
			return;
		}

		this.totalCards += Math.max(this.fenceStepPlan(parsed, sourcePath).length, 1);

		const container = el.createDiv({ cls: "osmosis-contextual-card" });
		if (parsed.exclude) {
			container.addClass("osmosis-contextual-excluded");
		}

		const frontEl = container.createDiv({ cls: "osmosis-contextual-front" });
		const dividerEl = container.createDiv({ cls: "osmosis-study-divider" });

		// Back: hidden placeholder + revealed content
		const backEl = container.createDiv();
		const hiddenEl = backEl.createDiv({
			cls: "osmosis-contextual-hidden",
			text: "░░░░░░",
		});
		const revealedEl = backEl.createDiv({ cls: "osmosis-contextual-revealed" });

		// Bottom row: undo (far left) + step counter + rating area + exclude toggle.
		// Rebuilt on every draw, because which of them belong there changes with the
		// step; it holds no picture, so its height cannot move what is being read.
		const bottomRow = container.createDiv({ cls: "osmosis-contextual-bottom" });

		// Which question is showing, kept where the click handlers can read it:
		// they are bound once and the step moves under them.
		let revealKey = parsed.cardId;
		let index = 0;

		const draw = (): void => {
			const hiding = this.shouldHideBack(sourcePath, parsed.cardId);
			const steps = this.fenceStepPlan(parsed, sourcePath);
			index = this.stepAt.get(parsed.cardId) ?? 0;
			const step = steps[index] ?? null;
			// A missing step means two different things, so the count decides which:
			// a fence the session is not asking has no steps at all, one it is asking
			// has run out.
			const finished = steps.length > 0 && step === null;
			// Keyed per step, so a re-render mid-session (a debounced schedule flush
			// rewrites the file) brings back the side that was showing.
			revealKey = step === null ? parsed.cardId : `${parsed.cardId}#${step.id}`;
			const revealed = finished || this.revealedCardIds.has(revealKey);

			// A finished fence shows what its source says, which is the whole passage
			// filled in — not the last group it happened to be asked about.
			this.updateProse(frontEl, step?.front ?? parsed.front, sourcePath);
			// An answer that has not been asked for stays out of the document
			// entirely, as it always has: hidden text is still text to a reader
			// searching the note.
			if (!hiding || revealed) {
				this.updateProse(revealedEl, step?.back ?? parsed.back, sourcePath);
			}

			/**
			 * Being *asked* is what finishes a question, and only then does a cloze
			 * card collapse onto its filled-in text — so the reader's eye stays on one
			 * body of text mid-session. A reader who was never asked is simply reading
			 * the note, and gets both sides, in order, as live preview draws them.
			 */
			const collapse = parsed.isCloze && hiding && revealed;
			frontEl.toggleClass("osmosis-hidden", collapse);
			dividerEl.toggleClass("osmosis-hidden", collapse);
			hiddenEl.toggleClass("osmosis-hidden", !hiding || revealed);
			revealedEl.toggleClass("osmosis-hidden", hiding && !revealed);

			bottomRow.empty();
			this.addUndoButton(bottomRow);
			if (finished) {
				bottomRow.createSpan({ text: "Rated", cls: "osmosis-contextual-rated" });
			} else if (steps.length > 1) {
				// Only when there is a sequence to be somewhere in. "1/1" on a basic
				// fence would say nothing the card does not already show.
				bottomRow.createSpan({
					cls: "osmosis-contextual-step",
					text: `${String(index + 1)}/${String(steps.length)}`,
				});
			}
			const ratingSlot = bottomRow.createDiv({ cls: "osmosis-contextual-rating-slot" });
			if (revealed && step !== null) {
				this.showRating(ratingSlot, step.id, parsed.cardId, sourcePath, advance);
			}
			this.addExcludeToggle(bottomRow, parsed, sourcePath);
		};

		// Defined after `draw` because the two call each other; both are only ever
		// invoked below, once each is in scope.
		const advance = (): void => {
			this.revealedCardIds.delete(revealKey);
			this.stepAt.set(parsed.cardId, index + 1);
			draw();
		};

		const reveal = (): void => {
			// Reading mode has nothing to uncover — the answer is already below the
			// rule — and there is no question here to be finished with.
			if (!this.shouldHideBack(sourcePath, parsed.cardId)) return;
			if (this.revealedCardIds.has(revealKey)) return;
			this.revealedCardIds.add(revealKey);
			draw();
		};

		draw();

		hiddenEl.addEventListener("click", reveal);
		container.addEventListener("click", (e) => {
			if (e.target === container) reveal();
		});

		// Entering or leaving peek or study changes what this card should be
		// showing, and does not re-run this processor. Redraw in place rather than
		// rebuilding, so the note does not jump under the reader.
		this.trackFence(container, sourcePath, () => {
			this.resetFenceState(parsed.cardId);
			draw();
		});
	}

	/**
	 * Put `markdown` on screen in `el`, skipping the work when it is already what
	 * `el` shows.
	 *
	 * A stepping fence redraws on every reveal and every rating, and most of those
	 * draws change one half of the card at most — re-rendering the other half
	 * would blank unchanged text and paint it again a frame later, under a reader
	 * who is looking straight at it.
	 */
	private updateProse(el: HTMLElement, markdown: string, sourcePath: string): void {
		if (el.dataset["osmosisProse"] === markdown) return;
		el.dataset["osmosisProse"] = markdown;
		el.empty();
		this.renderProse(markdown, el, sourcePath);
	}

	/** The undo affordance, present but invisible until there is something to undo. */
	private addUndoButton(row: HTMLElement): void {
		const undoBtn = row.createDiv({
			cls: `osmosis-contextual-undo${this.undoStack.length === 0 ? " osmosis-hidden" : ""}`,
		});
		setIcon(undoBtn, "undo-2");
		undoBtn.setAttribute("aria-label", "Undo (Ctrl+Z)");
		undoBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			void this.undo();
		});
	}

	/**
	 * The cards this fence asks this session — **the store's, not a pair derived
	 * here** — or none at all when the session is not asking it.
	 *
	 * The generator has already turned the fence into cards and put fully rendered
	 * fronts and backs in the store, one per cloze group and one per direction of
	 * a bidirectional pair. Reading view used to derive its own pair from the same
	 * source and rate the *fence's* ID, which for anything that fans out is not a
	 * card at all — so `recordRating` dropped the review on its "card not in
	 * store" guard and cloze reviews taken in a note went nowhere.
	 *
	 * Gated on being one of the session's targets rather than on study being on,
	 * because those are not the same question: a fence with nothing due sits in a
	 * studied note as context, and context is read, not asked.
	 *
	 * `dueCardsForFenceKey` skips disabled cards, so an excluded fence — whose
	 * cards all carry `disabled` — has nothing to ask and falls through to its own
	 * text, which is what it has always rendered.
	 */
	private fenceStepPlan(parsed: ParsedFence, sourcePath: string): readonly Card[] {
		if (!this.isFenceTarget(sourcePath, parsed.cardId)) return [];

		const planned = this.fencePlan.get(parsed.cardId);
		if (planned !== undefined) return planned;

		const steps = dueCardsForFenceKey(
			this.plugin.cardStore.getCardsByNote(sourcePath),
			parsed.cardId,
			Date.now(),
		);
		// An empty plan is not kept, for the reason `stepPlan` gives: it is what a
		// fence drawn before the card store has caught up produces.
		if (steps.length > 0) this.fencePlan.set(parsed.cardId, steps);
		return steps;
	}

	/**
	 * The questions this fence asks this session — none when the note is not
	 * being studied, which is when it is a diagram to look at rather than a card
	 * to answer.
	 *
	 * Filtered by time, so a diagram with one due group out of three is one
	 * question rather than three — the same rule spatial study applies to a node.
	 * Worked out once and kept, for the reason `occlusionPlan` explains.
	 */
	private stepPlan(parsed: ParsedFence, sourcePath: string): readonly OcclusionStep[] {
		if (!this.isStudying(sourcePath)) return [];

		const planned = this.occlusionPlan.get(parsed.cardId);
		if (planned !== undefined) return planned;

		const steps = occlusionSteps(
			parsed.occlusions ?? [],
			this.plugin.cardStore.getCardsByNote(sourcePath),
			Date.now(),
		);
		// An empty plan is not kept: it is what a fence rendered before the card
		// store has caught up produces, and holding on to it would leave the
		// diagram unstepped for the rest of the session. A fence with genuinely
		// nothing due simply blanks every group at once, as peek does.
		if (steps.length > 0) this.occlusionPlan.set(parsed.cardId, steps);
		return steps;
	}

	/**
	 * An occluded fence in reading view: its prose, its diagrams, and one hidden
	 * answer — **built once and then repainted**, never rebuilt.
	 *
	 * Every other card type here redraws by emptying its container and rendering
	 * again. An occluded one must not. Rebuilding the `<img>` leaves the card with
	 * no intrinsic height until the picture decodes, so the document shortens
	 * under the reader and reading view scrolls them away from the very diagram
	 * they were answering — on reveal, on rating, and on the peek toggle. So the
	 * prose and the pictures are drawn once, the diagrams are painted in place by
	 * `repaintOcclusion`, and only the bottom row is ever rebuilt. That is what
	 * the line surface has always done, and why it never had the jump.
	 *
	 * In study the fence steps through its shape groups one at a time, each with
	 * its own reveal and its own rating, exactly as sequential and spatial do.
	 * Outside study — peek, or ordinary reading — every group is blanked at once,
	 * none is singled out, and there is no rating: the reader is looking at a
	 * picture, not answering one of the questions it carries.
	 *
	 * Ratings go to the group's own card (`<fenceId>-cN`), which is what the store
	 * actually holds. The unstepped path rated the *fence* ID, and no such card
	 * exists for an occluded fence — so every rating was silently dropped by
	 * `recordRating`'s "card not in store" guard.
	 */
	private renderOcclusionCard(parsed: ParsedFence, el: HTMLElement, sourcePath: string): void {
		const occlusions = parsed.occlusions ?? [];
		this.totalCards += Math.max(this.stepPlan(parsed, sourcePath).length, 1);

		const container = el.createDiv({ cls: "osmosis-contextual-card" });
		if (parsed.exclude) container.addClass("osmosis-contextual-excluded");

		// Drawn once and never swapped. An occluded fence's two sides are the *same*
		// markdown — `parseFenceContent` hands the prose to both — because the
		// question is put by the masks, not by withholding text. Rendering a side
		// each would embed any unoccluded diagram in the fence twice over.
		const proseEl = container.createDiv({ cls: "osmosis-occlusion-prose" });
		this.renderProse(parsed.front, proseEl, sourcePath);

		// One set of diagrams for the whole card, since both sides show the same
		// pictures with different masks on them. Each gets its own slot so that a
		// repaint reaches exactly one diagram's image.
		const slots = occlusions.map((occlusion) => {
			const slot = container.createDiv({ cls: "osmosis-occlusion-slot" });
			renderOcclusion(this.plugin.app, slot, occlusion, "all-hidden", sourcePath);
			return slot;
		});

		const dividerEl = container.createDiv({ cls: "osmosis-study-divider" });

		// The answer, drawn once and left alone: plain reading mode shows the
		// unmasked diagram beneath the masked one, exactly as live preview does.
		// Peek and study hide these and put their questions on the slots above.
		//
		// A second set of pictures rather than a repaint of the first, because the
		// two have to be on screen *together* while reading. The prose is not
		// repeated with them — live preview does repeat it, and that is a wart of
		// rendering an occluded fence as two independent sides, not something to
		// carry over.
		const answerSlots = occlusions.map((occlusion) => {
			const slot = container.createDiv({ cls: "osmosis-occlusion-slot" });
			renderOcclusion(this.plugin.app, slot, occlusion, "all-revealed", sourcePath);
			return slot;
		});

		const hiddenEl = container.createDiv({ cls: "osmosis-contextual-hidden", text: "░░░░░░" });
		const bottomRow = container.createDiv({ cls: "osmosis-contextual-bottom" });

		// Which question is showing, kept where the click handlers can read it:
		// they are bound once and the step moves under them.
		let revealKey = parsed.cardId;
		let index = 0;

		const draw = (): void => {
			// Reading mode asks nothing, so the card shows both its sides at once and
			// takes no clicks. Peek and study are the surfaces that pose a question.
			const hiding = this.shouldHideBack(sourcePath, parsed.cardId);
			const steps = this.stepPlan(parsed, sourcePath);
			index = this.stepAt.get(parsed.cardId) ?? 0;
			const step = steps[index] ?? null;
			// A missing step means two different things, so the count decides which:
			// a fence outside study has no steps at all, one inside it has run out.
			const finished = steps.length > 0 && step === null;
			// Keyed per group, so a re-render mid-session (a debounced schedule
			// flush rewrites the file) brings back the side that was showing.
			revealKey = step === null ? parsed.cardId : `${parsed.cardId}#${step.group}`;
			const revealed = finished || this.revealedCardIds.has(revealKey);

			slots.forEach((slot, slotIndex) => {
				const occlusion = occlusions[slotIndex]!;
				if (step === null) {
					// Revealing rings the regions that were covered rather than simply
					// clearing them, so the answer still says where the questions were.
					repaintOcclusion(slot, occlusion, revealed ? "all-revealed" : "all-hidden");
				} else if (slotIndex === step.diagram) {
					repaintOcclusion(
						slot,
						{ ...occlusion, target: step.group },
						revealed ? "back" : "front",
					);
				} else {
					// Another diagram's groups belong to other cards. Covering them
					// would pose a question this card never answers, so it stays
					// unmasked — sequential draws a card's siblings the same way.
					repaintOcclusion(slot, occlusion, "none");
				}
			});

			// Nothing but the placeholder and its rule goes away on reveal: the
			// answer to an occluded card is the masks, which have just been
			// repainted. While reading, the rule stays as the seam between the
			// question and the answer beneath it.
			answerSlots.forEach((slot) => { slot.toggleClass("osmosis-hidden", hiding); });
			dividerEl.toggleClass("osmosis-hidden", hiding && revealed);
			hiddenEl.toggleClass("osmosis-hidden", !hiding || revealed);

			// Rebuilt rather than repainted: it holds no picture, and it sits below
			// the diagram, so its height changes cannot move what is being read.
			bottomRow.empty();
			if (finished) {
				bottomRow.createSpan({ text: "Rated", cls: "osmosis-contextual-rated" });
			} else if (steps.length > 0) {
				bottomRow.createSpan({
					cls: "osmosis-contextual-step",
					text: `${String(index + 1)}/${String(steps.length)}`,
				});
			}
			const ratingSlot = bottomRow.createDiv({ cls: "osmosis-contextual-rating-slot" });
			if (revealed && step?.cardId != null) {
				this.showRating(ratingSlot, step.cardId, parsed.cardId, sourcePath, advance);
			}
			this.addExcludeToggle(bottomRow, parsed, sourcePath);
		};

		// Defined after `draw` because the two call each other; both are only ever
		// invoked below, once each is in scope.
		const advance = (): void => {
			this.revealedCardIds.delete(revealKey);
			this.stepAt.set(parsed.cardId, index + 1);
			draw();
		};

		const reveal = (): void => {
			// Reading mode has nothing to uncover — the answer is already below the
			// rule — and revealing the masks here would put the same picture on
			// screen twice.
			if (!this.shouldHideBack(sourcePath, parsed.cardId)) return;
			if (this.revealedCardIds.has(revealKey)) return;
			this.revealedCardIds.add(revealKey);
			draw();
		};

		draw();

		hiddenEl.addEventListener("click", reveal);
		container.addEventListener("click", (e) => {
			if (e.target === container) reveal();
		});

		this.trackFence(container, sourcePath, () => {
			this.resetFenceState(parsed.cardId);
			draw();
		});
	}

	/** The eye toggle that takes a fence in or out of the deck. */
	private addExcludeToggle(row: HTMLElement, parsed: ParsedFence, sourcePath: string): void {
		const toggleIcon = row.createDiv({ cls: "osmosis-contextual-exclude-toggle" });
		setIcon(toggleIcon, parsed.exclude ? "eye-off" : "eye");
		toggleIcon.setAttribute(
			"aria-label",
			parsed.exclude ? "Include this card" : "Exclude this card",
		);
		toggleIcon.addEventListener("click", (e) => {
			e.stopPropagation();
			void this.toggleExclude(parsed.cardId, !parsed.exclude, sourcePath);
		});
	}

	/**
	 * Whether a rating belongs on a card revealed in this note right now.
	 *
	 * Reading view has always shown the rating row on every fence card, whatever
	 * the note was doing — so peeking, which records nothing by definition,
	 * still offered four buttons that wrote a schedule. A rating is the act of
	 * answering, and only study asks.
	 *
	 * Read at reveal time rather than at render time: a fence is a code block,
	 * and toggling the mode does not re-run its processor, so a card rendered
	 * before study started would otherwise never offer a rating.
	 */
	private isStudying(sourcePath: string): boolean {
		return this.plugin.lineReveal?.revealMode(sourcePath) === "study";
	}

	/**
	 * Whether this fence is one of the questions the running session is asking.
	 *
	 * Only a target takes a rating. Outside a session nothing is a target, which
	 * is what keeps peek — and ordinary reading — from writing a schedule.
	 */
	private isFenceTarget(sourcePath: string, fenceId: string): boolean {
		return this.plugin.lineReveal?.isFenceTarget(sourcePath, fenceId) ?? false;
	}

	/**
	 * Whether this fence's back should start hidden.
	 *
	 * **Hiding belongs to peek and study alone.** Plain reading mode shows both
	 * sides, exactly as live preview does — a note is a document first, and a
	 * reader scrolling through it is not being asked anything. Reading view used
	 * to hide every back and make the reader click each one, which turned an
	 * ordinary read of a card-bearing note into a quiz nobody started.
	 *
	 * In a session only the cards the scheduler picked out are hidden; the rest
	 * read as what they are — context, already answered.
	 */
	private shouldHideBack(sourcePath: string, fenceId: string): boolean {
		const mode = this.plugin.lineReveal?.revealMode(sourcePath) ?? "off";
		if (mode === "off") return false;
		if (mode === "peek") return true;
		return this.isFenceTarget(sourcePath, fenceId);
	}

	/**
	 * Render one side of a fence into `el`: its markdown, then its occluded
	 * diagrams beneath.
	 *
	 * Both sides of an occluded fence paint every mask rather than singling one
	 * group out, because there is no current card on this path — it draws live
	 * preview, where nothing is being answered at all. The reading-view card that
	 * *does* step through its groups is `renderOcclusionCard`, which paints its
	 * diagrams itself so that it can repaint them rather than rebuild them.
	 */
	private renderSide(
		parsed: ParsedFence,
		side: "front" | "back",
		el: HTMLElement,
		sourcePath: string,
	): void {
		const occlusions = parsed.occlusions ?? [];
		// Its own child when diagrams follow, so the two are not interleaved by
		// the renderer resolving after the images were already appended.
		const proseEl = occlusions.length > 0
			? el.createDiv({ cls: "osmosis-occlusion-prose" })
			: el;
		this.renderProse(side === "front" ? parsed.front : parsed.back, proseEl, sourcePath);

		for (const occlusion of occlusions) {
			renderOcclusion(
				this.plugin.app,
				el,
				occlusion,
				side === "front" ? "all-hidden" : "all-revealed",
				sourcePath,
			);
		}
	}

	/** Render a card side's markdown into `el`, or nothing when it has none. */
	private renderProse(markdown: string, el: HTMLElement, sourcePath: string): void {
		if (markdown === "") return;

		void MarkdownRenderer.render(
			this.plugin.app,
			markdown,
			el,
			sourcePath,
			this.renderComponent,
		).then(() => addCodeBlockLanguageLabels(el));
	}

	/**
	 * Offer "Create image occlusion" when a diagram *inside* a rendered fence is
	 * right-clicked.
	 *
	 * Obsidian's own image menu reaches native embeds in Live Preview, but an
	 * image drawn by this processor is our DOM, not the editor's — so no menu
	 * event fires for it and the only way in was to switch to source mode and
	 * right-click the raw `![[…]]` text. That is a poor path to the one card
	 * type Obsidian cannot author.
	 *
	 * The clicked image is mapped back to its line through the embed's `src`
	 * (the link exactly as authored) plus the fence's own position from
	 * `getSectionInfo`, rather than by counting rendered `<img>` elements —
	 * front and back render into separate containers, and an unresolved embed
	 * produces no `<img>` at all, so ordinal matching would drift.
	 *
	 * A diagram that already has masks is not an Obsidian embed any more — this
	 * processor draws it — so its link comes from the `alt` the renderer sets to
	 * the embed target as authored. Without that, occluding an image made it
	 * impossible to right-click back into the editor.
	 */
	private registerOcclusionMenu(
		source: string,
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext,
	): void {
		el.addEventListener("contextmenu", (event: MouseEvent) => {
			const target = event.target;
			if (!(target instanceof HTMLImageElement)) return;

			const link = target.hasClass("osmosis-occlusion-image")
				? target.getAttribute("alt")
				: target.closest(".internal-embed")?.getAttribute("src");
			if (link === null || link === undefined) return;

			const offset = fenceEmbedLine(source, link);
			if (offset === null) return;

			const section = ctx.getSectionInfo(el);
			const file = this.plugin.app.vault.getFileByPath(ctx.sourcePath);
			if (!section || !file) return;

			// `source` starts *after* the opening ```osmosis line.
			const line = section.lineStart + 1 + offset;

			event.preventDefault();
			const menu = new Menu();
			menu.addItem((item) => {
				item.setTitle("Create image occlusion")
					.setIcon("square-dashed-mouse-pointer")
					.onClick(() => { void this.plugin.openOcclusionEditor(file, line); });
			});
			menu.showAtMouseEvent(event);
		});
	}

	/**
	 * A fence that is not a card yet: no `***`, no cloze markers, no occlusion.
	 * `generateExplicitCards` skips exactly this shape, so it is deliberately
	 * *not* rendered as one — no divider, no hidden back, no rating row, and
	 * nothing joins a deck.
	 *
	 * It does render its markdown rather than dumping raw source, because a
	 * fence holding only a diagram is precisely the state you are in *before*
	 * occluding that diagram, and you cannot right-click an image that is being
	 * shown to you as text.
	 */
	private renderDraft(source: string, el: HTMLElement, sourcePath: string): void {
		const lines = source.split("\n");
		const { contentStart } = splitFenceHeader(lines);
		const body = lines.slice(contentStart).map(stripEmbedLabels).join("\n").trim();
		if (body.length === 0) {
			// Nothing but a header — the raw source is the only useful thing to
			// show, and it is what the user has to edit to fix it.
			el.createEl("pre", { text: source });
			return;
		}

		const container = el.createDiv({ cls: "osmosis-contextual-card osmosis-contextual-draft" });
		void MarkdownRenderer.render(
			this.plugin.app,
			body,
			container,
			sourcePath,
			this.renderComponent,
		).then(() => addCodeBlockLanguageLabels(container));
	}

	/** Live preview: render front and back fully visible (no interactivity). */
	private renderPreviewCard(source: string, el: HTMLElement, sourcePath: string): void {
		const parsed = this.parseFenceContent(source);
		if (!parsed) {
			this.renderDraft(source, el, sourcePath);
			return;
		}

		const container = el.createDiv({ cls: "osmosis-contextual-card" });

		if (parsed.exclude) {
			container.addClass("osmosis-contextual-excluded");
		}

		// Render front
		const frontEl = container.createDiv({ cls: "osmosis-contextual-front" });
		this.renderSide(parsed, "front", frontEl, sourcePath);

		// Separator
		container.createDiv({ cls: "osmosis-study-divider" });

		// Render back (fully visible, no hiding)
		const backEl = container.createDiv({ cls: "osmosis-contextual-revealed" });
		this.renderSide(parsed, "back", backEl, sourcePath);

		// Bottom row with exclude toggle (bottom-right)
		const bottomRow = container.createDiv({ cls: "osmosis-contextual-bottom" });
		bottomRow.createDiv(); // spacer
		const toggleIcon = bottomRow.createDiv({ cls: "osmosis-contextual-exclude-toggle" });
		setIcon(toggleIcon, parsed.exclude ? "eye-off" : "eye");
		toggleIcon.setAttribute("aria-label", parsed.exclude ? "Include this card" : "Exclude this card");
		toggleIcon.addEventListener("click", (e) => {
			e.stopPropagation();
			void this.toggleExclude(parsed.cardId, !parsed.exclude, sourcePath);
		});
	}

	/**
	 * The four rating buttons. `onRated` lets a stepped occlusion card move on to
	 * its next shape group once this one has been answered; without it the row
	 * simply reports what was chosen and stays put.
	 *
	 * `cardId` and `fenceKey` are **not** interchangeable, and conflating them is
	 * how the pill came to sit still through a whole occluded diagram. A review
	 * moves the schedule of one derived card (`<fence>-c1`); the session counts
	 * its questions in fences, and its targets are fence keys.
	 */
	private showRating(
		container: HTMLElement,
		cardId: string,
		fenceKey: string,
		sourcePath: string,
		onRated?: () => void,
	): void {
		const ratingEl = container.createDiv({ cls: "osmosis-contextual-rating" });
		// The answer just went on screen. A contextual card has no separate
		// "question shown" moment — it lives inline in the note — so the reveal
		// is the anchor for the review log's elapsed time.
		const revealedAt = Date.now();

		const ratings: Array<{ label: string; rating: FSRSRating; cls: string }> = [
			{ label: "Again", rating: 1, cls: "osmosis-rate-again" },
			{ label: "Hard", rating: 2, cls: "osmosis-rate-hard" },
			{ label: "Good", rating: 3, cls: "osmosis-rate-good" },
			{ label: "Easy", rating: 4, cls: "osmosis-rate-easy" },
		];

		for (const { label, rating, cls } of ratings) {
			const btn = ratingEl.createEl("button", { text: label, cls });
			btn.addEventListener("click", (e) => {
				e.stopPropagation();

				// Snapshot previous schedule before rating
				const card = this.plugin.cardStore.getCard(cardId);
				const previousSchedule: ScheduleData | null = card && card.due !== undefined
					? {
						stability: card.stability ?? 0,
						difficulty: card.difficulty ?? 0,
						due: card.due,
						lastReview: card.lastReview ?? null,
						reps: card.reps ?? 0,
						lapses: card.lapses ?? 0,
						state: card.state ?? "new",
						learningSteps: card.learningSteps ?? 0,
					}
					: null;

				ratingEl.empty();
				ratingEl.createSpan({ text: `Rated: ${label}`, cls: "osmosis-contextual-rated" });
				this.reviewedCount++;
				this.updateProgress();
				// The session's progress pill lives in LineRevealProcessor, which
				// owns the mode; tell it one of its questions is answered.
				this.plugin.lineReveal?.markFenceRated(sourcePath, fenceKey);
				void this.recordRating(cardId, rating, Date.now() - revealedAt);

				this.undoStack.push({
					type: "rate",
					cardId,
					sourcePath,
					previousSchedule,
					ratingLabel: label,
				});

				onRated?.();
			});
		}
	}

	private async recordRating(cardId: string, rating: FSRSRating, elapsedMs: number): Promise<void> {
		// Ensure the card exists in the store (contextual cards use hash-based IDs)
		if (!this.plugin.cardStore.getCard(cardId)) {
			// Card not in store — skip rating (card was generated inline, not from sync)
			return;
		}

		if (!this.sessionManager) {
			this.sessionManager = this.plugin.createSessionManager("contextual");
		}
		await this.sessionManager.recordReview(cardId, rating, { elapsedMs });
		this.plugin.refreshDashboard();
	}

	/** Toggle exclude flag on a fence. File modification triggers Obsidian re-render. */
	private async toggleExclude(cardId: string, exclude: boolean, sourcePath: string): Promise<void> {
		this.undoStack.push({
			type: "exclude",
			cardId,
			sourcePath,
			previousExclude: !exclude,
		});

		const file = this.plugin.app.vault.getFileByPath(sourcePath);
		if (!file) return;
		await this.plugin.fenceWriter.writeExclude(file, cardId, exclude);
	}

	/** Undo the last action (rating or exclude). Triggers a file re-render for contextual cards. */
	private async undo(): Promise<void> {
		const entry = this.undoStack.pop();
		if (!entry) return;

		if (entry.type === "exclude") {
			// Undo exclude toggle: restore previous state
			const file = this.plugin.app.vault.getFileByPath(entry.sourcePath);
			if (file) {
				await this.plugin.fenceWriter.writeExclude(file, entry.cardId, entry.previousExclude ?? false);
			}
		} else {
			// Undo rating: revert schedule
			if (!this.sessionManager) {
				this.sessionManager = this.plugin.createSessionManager("contextual");
			}

			const card = this.plugin.cardStore.getCard(entry.cardId);
			if (card) {
				await this.sessionManager.revertReview(entry.cardId, entry.previousSchedule ?? null);
			}

			this.reviewedCount = Math.max(0, this.reviewedCount - 1);
			this.updateProgress();
			this.plugin.refreshDashboard();

			// Trigger re-render by modifying the file (touch the file to force Obsidian to re-process code blocks)
			const file = this.plugin.app.vault.getFileByPath(entry.sourcePath);
			if (file) {
				const content = await this.plugin.app.vault.cachedRead(file);
				await this.plugin.app.vault.modify(file, content);
			}
		}
	}

	/**
	 * Toggle study mode on/off.
	 */
	toggleStudyMode(active: boolean): void {
		this.studyActive = active;
		if (active) {
			this.reviewedCount = 0;
		}
	}

	private updateProgress(): void {
		if (this.progressWidget) {
			this.progressWidget.textContent = `${this.reviewedCount}/${this.totalCards} reviewed`;
		}
	}

	/** Match ==term==, **term**, or :::term::: cloze deletions (with optional cN: group prefix). */
	private static readonly CLOZE_REGEX =
		/==(?:c\d+:)?([^=]+)==|\*\*(?:c\d+:)?([^*]+)\*\*|:::(?:c\d+:)?(.+?):::/g;

	/**
	 * Parse fence content into front/back/metadata.
	 * Reuses the same format as explicit.ts card generators.
	 */
	private parseFenceContent(source: string): ParsedFence | null {
		const lines = source.split("\n");
		const { contentStart, exclude, hasOcclusion } = splitFenceHeader(lines);
		// Stripped once, here, rather than per branch: an embed's `{a}` binds it
		// to a shape set and is never meant to be seen. Doing it inside the
		// occlusion branch alone let the label through on any fence that also had
		// a `***` separator, since that branch returns first.
		const contentLines = lines.slice(contentStart).map(stripEmbedLabels);
		const separatorIdx = contentLines.findIndex((l) => l.trim() === "***");

		if (separatorIdx >= 0) {
			const front = contentLines.slice(0, separatorIdx).join("\n").trim();
			const back = contentLines.slice(separatorIdx + 1).join("\n").trim();
			if (!front && !back) return null;
			const cardId = this.extractIdFromSource(source) ?? this.hashContent(`${front}|||${back}`);
			return { front, back, cardId, exclude, isCloze: false };
		}

		// No separator — check for code cloze markers first, then text cloze
		const content = contentLines.join("\n").trim();
		if (!content) return null;

		// Occlusion: the content is a diagram and the blanks live in the header
		// as geometry rather than inline as markers, so neither the separator
		// nor the cloze scans can see a card here. Without this the fence falls
		// through to the raw-source fallback and reading view shows the shape
		// block as literal text.
		if (hasOcclusion) {
			const { diagrams, prose } = fenceDiagrams(lines, contentStart);
			if (diagrams.length > 0) {
				const cardId = this.extractIdFromSource(source) ?? this.hashContent(`occlusion|||${content}`);
				return { front: prose, back: prose, cardId, exclude, isCloze: true, occlusions: diagrams };
			}
			// Shape sets that bind to no embed in this fence — a stale label, or an
			// embed the user deleted. The diagram is gone, so there is nothing to
			// mask; render what is left rather than dropping the fence.
			const cardId = this.extractIdFromSource(source) ?? this.hashContent(`occlusion|||${content}`);
			return { front: content, back: content, cardId, exclude, isCloze: true };
		}

		// Check for code cloze (osmosis-cloze inside inner code fences)
		if (content.includes("osmosis-cloze")) {
			const { front, back } = ContextualStudyProcessor.buildCodeClozeFrontBack(contentLines);
			const cardId = this.extractIdFromSource(source) ?? this.hashContent(`code-cloze|||${content}`);
			return { front, back, cardId, exclude, isCloze: true };
		}

		// Check for inline code cloze (:::...::: markers inside inner code fences)
		const hasInlineCloze = contentLines.some((l) => /:::(?:c\d+:)?(.+?):::/.test(l));
		const hasInnerFence = contentLines.some((l) => /^```\w/.test(l.trim()));
		if (hasInlineCloze && hasInnerFence) {
			const { front, back } = ContextualStudyProcessor.buildInlineClozeFrontBack(contentLines);
			const cardId = this.extractIdFromSource(source) ?? this.hashContent(`inline-cloze|||${content}`);
			return { front, back, cardId, exclude, isCloze: true };
		}

		const clozeMatches = [...content.matchAll(ContextualStudyProcessor.CLOZE_REGEX)];
		if (clozeMatches.length === 0) return null;

		// Front: all clozes replaced with CLOZE_BLANK.
		// Back: `==`/`**` delimiters are kept (they're valid Markdown for highlight/bold),
		// `:::` delimiters are removed entirely (not Markdown — would leave visual residue),
		// and any `cN:` group prefix is stripped from all three forms.
		const front = content.replace(ContextualStudyProcessor.CLOZE_REGEX, CLOZE_BLANK);
		const back = content.replace(
			/==(?:c\d+:)?([^=]+)==|\*\*(?:c\d+:)?([^*]+)\*\*|:::(?:c\d+:)?(.+?):::/g,
			(_m, eq?: string, bold?: string, plain?: string) => {
				if (eq !== undefined) return `==${eq}==`;
				if (bold !== undefined) return `**${bold}**`;
				return plain!;
			},
		);
		const cardId = this.extractIdFromSource(source) ?? this.hashContent(`cloze|||${content}`);
		return { front, back, cardId, exclude, isCloze: true };
	}

	/**
	 * Build front/back for code cloze in contextual mode.
	 * Front: all cloze regions blanked. Back: all markers stripped.
	 * Inline cloze markers on non-blanked lines are stripped to plain text.
	 */
	private static buildCodeClozeFrontBack(contentLines: string[]): { front: string; back: string } {
		const MARKER_COMMENT = /\s*(?:#|\/\/|\/\*|<!--|--|%)\s*osmosis-cloze\s*(?:\*\/|-->)?\s*$/;

		const frontLines: string[] = [];
		const backLines: string[] = [];
		let inMultiCloze = false;
		let multiFirstSeen = false;

		for (const line of contentLines) {
			if (line.includes("osmosis-cloze-start")) {
				inMultiCloze = true;
				multiFirstSeen = false;
				continue; // skip marker line
			}
			if (line.includes("osmosis-cloze-end")) {
				inMultiCloze = false;
				continue; // skip marker line
			}

			if (inMultiCloze) {
				if (!multiFirstSeen) {
					const indent = line.match(/^(\s*)/)?.[1] ?? "";
					frontLines.push(`${indent}${CLOZE_BLANK}`);
					multiFirstSeen = true;
				}
				backLines.push(ContextualStudyProcessor.stripInline(line));
			} else if (line.includes("osmosis-cloze")) {
				// Single-line cloze
				const indent = line.match(/^(\s*)/)?.[1] ?? "";
				frontLines.push(`${indent}${CLOZE_BLANK}`);
				backLines.push(ContextualStudyProcessor.stripInline(line.replace(MARKER_COMMENT, "")));
			} else {
				const stripped = ContextualStudyProcessor.stripInline(line);
				frontLines.push(stripped);
				backLines.push(stripped);
			}
		}

		return { front: frontLines.join("\n"), back: backLines.join("\n") };
	}

	/**
	 * Build front/back for inline code cloze in contextual mode.
	 * Front: all :::...::: markers replaced with CLOZE_BLANK.
	 * Back: all markers stripped to plain text.
	 */
	private static buildInlineClozeFrontBack(contentLines: string[]): { front: string; back: string } {
		const front = contentLines
			.map((l) => l.replace(/:::(?:c\d+:)?(.+?):::/g, CLOZE_BLANK))
			.join("\n");
		const back = contentLines
			.map((l) => l.replace(/:::(?:c\d+:)?(.+?):::/g, (_, text: string) => text))
			.join("\n");
		return { front, back };
	}

	/** Strip :::...::: inline cloze markers, leaving just the text content. */
	private static stripInline(line: string): string {
		return line.replace(/:::(?:c\d+:)?(.+?):::/g, (_, text: string) => text);
	}

	/** Extract id: metadata from fence source if present. */
	private extractIdFromSource(source: string): string | null {
		const lines = source.split("\n");
		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed === "") break;
			const match = trimmed.match(/^id\s*:\s*(.+)$/i);
			if (match) return match[1]!.trim();
			if (!/^\w[\w-]*\s*:\s*.+$/.test(trimmed)) break;
		}
		return null;
	}

	private hashContent(content: string): string {
		let hash = 0;
		for (let i = 0; i < content.length; i++) {
			const char = content.charCodeAt(i);
			hash = ((hash << 5) - hash + char) | 0;
		}
		return `ctx-${Math.abs(hash).toString(36)}`;
	}
}
