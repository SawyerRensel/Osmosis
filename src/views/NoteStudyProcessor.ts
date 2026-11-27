import { Component, MarkdownRenderer, Menu, setIcon, type MarkdownPostProcessorContext } from "obsidian";
import type OsmosisPlugin from "../main";
import { fenceDiagrams, fenceEmbedLine, stripEmbedLabels } from "../card-gen/occlusion";
import type { FSRSRating } from "../database/FSRSScheduler";
import type { Card, CardOcclusion, OcclusionSet, ScheduleData } from "../database/types";
import { mountRatingAnchor, removeRatingAnchors, renderOcclusion, repaintOcclusion } from "./OcclusionRenderer";
import type { StudySessionManager } from "../study/StudySessionManager";
import { CLOZE_BLANK, splitFenceHeader } from "../card-gen/explicit";
import { CLOZE_COLOUR_PATTERN, colourAnswer, colourBlank, parseHighlightToken } from "../card-gen/cloze-colour";
import { occlusionSteps, type OcclusionStep } from "../study/occlusion-steps";
import { dueCardsForFenceKey } from "../study/mindmap-study";
import { addCodeBlockLanguageLabels } from "./codeBlockLabels";
import { formatInterval } from "../study/study-view";

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

/** An undo entry for note review. */
interface NoteUndoEntry {
	type: "rate" | "exclude";
	cardId: string;
	sourcePath: string;
	/** The fence the rated card belongs to, so note study's strip can step back. Only for "rate". */
	fenceKey?: string;
	/** Previous schedule data before the rating (null = card was new). Only for "rate". */
	previousSchedule?: ScheduleData | null;
	/** The rating label that was displayed. Only for "rate". */
	ratingLabel?: string;
	/** The previous exclude state. Only for "exclude". */
	previousExclude?: boolean;
}

/**
 * Note study mode: renders `osmosis` code blocks in reading view
 * with hidden answers that can be revealed on click. Optional FSRS rating
 * when "Start studying" is active.
 *
 * Registered via registerMarkdownCodeBlockProcessor in main.ts.
 */
export class NoteStudyProcessor {
	private studyActive = false;
	private reviewedCount = 0;
	private totalCards = 0;
	private progressWidget: HTMLElement | null = null;
	private sessionManager: StudySessionManager | null = null;
	private readonly renderComponent = new Component();

	/** Track cards whose answers have been revealed this session to survive re-renders. */
	private readonly revealedCardIds = new Set<string>();
	/** Undo stack for note review actions. */
	private readonly undoStack: NoteUndoEntry[] = [];
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
		fenceId: string;
		restart: () => void;
		/** Draw the fence again from the state held here, keeping its place — for undo. */
		redraw: () => void;
		/** What the fence was parsed into; `exclude` is updated in place by {@link showExclude}. */
		parsed: ParsedFence;
	}[] = [];
	/**
	 * Fences of sidecar-mode notes as rendered, with the shape sets they were
	 * drawn from. Their shapes live in the sidecar, so saving them leaves the
	 * note's text alone and Obsidian never re-runs the processor: these are
	 * drawn again by {@link redrawChangedShapes} instead. Pruned like
	 * `trackedFences` — only once superseded.
	 */
	private readonly sidecarFences: {
		el: HTMLElement;
		source: string;
		sourcePath: string;
		fenceId: string;
		live: boolean;
		/** The fence's sidecar shape sets when drawn, serialized; `""` when the header's were used. */
		shapes: string;
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

		// Register Ctrl+Z for undo in note study
		this.plugin.registerDomEvent(document, "keydown", (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key === "z" && this.undoStack.length > 0) {
				// Only handle if we're in reading view with osmosis cards
				const target = e.target as HTMLElement;
				if (target.closest(".osmosis-note-card") || target.closest(".markdown-reading-view")) {
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
					this.trackSidecarFence(el, source, ctx.sourcePath, inLivePreview);
				});
			},
		);

		this.plugin.register(this.plugin.noteData.onChange((notePath) => this.redrawChangedShapes(notePath)));
	}

	/** The shape sets a fence's sidecar entry gives it, serialized for comparison. */
	private static sidecarShapesKey(sets: ReadonlyMap<string, OcclusionSet> | undefined): string {
		return sets ? JSON.stringify([...sets]) : "";
	}

	/** Remember a sidecar-mode note's fence so a later shape write can redraw it. */
	private trackSidecarFence(el: HTMLElement, source: string, sourcePath: string, live: boolean): void {
		const fenceId = this.extractIdFromSource(source);
		if (fenceId === null || !this.inSidecar(sourcePath)) return;
		for (let i = this.sidecarFences.length - 1; i >= 0; i--) {
			const entry = this.sidecarFences[i]!;
			if (entry.el === el || (entry.sourcePath === sourcePath && entry.fenceId === fenceId && !entry.el.isConnected)) {
				this.sidecarFences.splice(i, 1);
			}
		}
		const shapes = NoteStudyProcessor.sidecarShapesKey(this.sidecarOcclusions(source, sourcePath));
		this.sidecarFences.push({ el, source, sourcePath, fenceId, live, shapes });
	}

	/**
	 * A note's sidecar changed: draw again each of its fences whose shape sets
	 * differ from what it shows. Reviews change the sidecar too, and redraw
	 * nothing — a fence is rebuilt only when its masks actually moved.
	 */
	private redrawChangedShapes(notePath: string): void {
		const file = this.plugin.app.vault.getFileByPath(notePath);
		if (!file) return;
		const overlays = this.plugin.fenceOverlays(file);
		for (const entry of [...this.sidecarFences]) {
			if (entry.sourcePath !== notePath) continue;
			const shapes = NoteStudyProcessor.sidecarShapesKey(overlays.get(entry.fenceId)?.occlusions);
			if (shapes === entry.shapes) continue;
			entry.shapes = shapes;
			entry.el.empty();
			if (entry.live) {
				this.renderPreviewCard(entry.source, entry.el, notePath);
			} else {
				this.renderCard(entry.source, entry.el, notePath);
				this.rememberHeight(entry.source, entry.el);
			}
		}
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
	 * Remember a fence so `refresh` can restart it, dropping any earlier entry
	 * for the same fence that this render has replaced.
	 *
	 * **Out of the document is not gone.** Reading view keeps only the sections
	 * near the viewport attached; one scrolled far enough away is detached and
	 * later put back as-is, without re-running this processor. Pruning every
	 * detached entry — as this once did — dropped exactly those fences, so
	 * starting study never reached them and they came back drawn for reading,
	 * both sides showing. A phone's narrow screen detaches most of a long note,
	 * which is why it showed there first.
	 *
	 * So an entry is dropped only once superseded: the same fence of the same
	 * note rendered again while the old element is out of the document. An
	 * attached one is left alone, since that is the same note open in a second
	 * pane. `LineRevealProcessor.trackLine` keeps its lines by the same rule.
	 */
	private trackFence(
		el: HTMLElement,
		sourcePath: string,
		fenceId: string,
		restart: () => void,
		redraw: () => void,
		parsed: ParsedFence,
	): void {
		for (let i = this.trackedFences.length - 1; i >= 0; i--) {
			const entry = this.trackedFences[i]!;
			if (entry.sourcePath === sourcePath && entry.fenceId === fenceId && !entry.el.isConnected) {
				this.trackedFences.splice(i, 1);
			}
		}
		this.trackedFences.push({ el, sourcePath, fenceId, restart, redraw, parsed });
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
	 *
	 * Detached fences are restarted too: they are the ones scrolled out of view,
	 * and they will be put back exactly as drawn — see `trackFence`.
	 */
	refresh(notePath: string): void {
		for (const entry of [...this.trackedFences]) {
			if (entry.sourcePath !== notePath) continue;
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
	 * reveal and its own rating, exactly as flashcard and mind map ask them.
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
		const parsed = this.parseFenceContent(source, this.sidecarOcclusions(source, sourcePath));
		if (!parsed) {
			this.renderDraft(source, el, sourcePath);
			return;
		}
		this.applySidecarExclude(parsed, sourcePath);

		// An occluded fence is drawn once and repainted, never rebuilt — see
		// `renderOcclusionCard`. Both what it shows and how it flips differ from
		// every other card type here.
		if (parsed.occlusions !== undefined && parsed.occlusions.length > 0) {
			this.renderOcclusionCard(parsed, el, sourcePath);
			return;
		}

		this.totalCards += Math.max(this.fenceStepPlan(parsed, sourcePath).length, 1);

		const container = el.createDiv({ cls: "osmosis-note-card" });
		if (parsed.exclude) {
			container.addClass("osmosis-note-excluded");
		}

		// Top row: step counter or "Rated", undo and the exclude toggle, at the
		// top right (left of live preview's `</>`), so the rows below can span the
		// card. Rebuilt on every draw, because which of them belong there changes
		// with the step.
		const topRow = container.createDiv({ cls: "osmosis-note-top" });
		const frontEl = container.createDiv({ cls: "osmosis-note-front" });
		const dividerEl = container.createDiv({ cls: "osmosis-study-divider" });
		const revealedEl = container.createDiv({ cls: "osmosis-note-revealed" });

		// Full-width action row: Show answer while the back is hidden, then the
		// rating bar. Rebuilt on every draw; it sits below everything being read,
		// so its height cannot move it.
		const actionsEl = container.createDiv({ cls: "osmosis-note-actions" });

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
			revealedEl.toggleClass("osmosis-hidden", hiding && !revealed);

			topRow.empty();
			if (finished) {
				topRow.createSpan({ text: "Rated", cls: "osmosis-note-rated" });
			} else if (steps.length > 1) {
				// Only when there is a sequence to be somewhere in. "1/1" on a basic
				// fence would say nothing the card does not already show.
				topRow.createSpan({
					cls: "osmosis-note-step",
					text: `${String(index + 1)}/${String(steps.length)}`,
				});
			}
			this.addUndoButton(topRow, parsed.cardId, sourcePath);
			this.addExcludeToggle(topRow, parsed, sourcePath);

			actionsEl.empty();
			if (hiding && !revealed) {
				this.addShowAnswerButton(actionsEl, reveal);
			} else if (revealed && step !== null) {
				this.showRating(actionsEl, step.id, parsed.cardId, sourcePath, advance);
			}
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

		container.addEventListener("click", (e) => {
			if (e.target === container) reveal();
		});

		// Entering or leaving peek or study changes what this card should be
		// showing, and does not re-run this processor. Redraw in place rather than
		// rebuilding, so the note does not jump under the reader.
		this.trackFence(container, sourcePath, parsed.cardId, () => {
			this.resetFenceState(parsed.cardId);
			draw();
		}, draw, parsed);
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

	/**
	 * The undo affordance, present but invisible until this fence has something
	 * to undo. It takes back **this fence's** latest action, not the note's: the
	 * button sits on the card, so pressing it on one card must not rewind
	 * another. Ctrl+Z is the one that undoes whatever came last.
	 */
	private addUndoButton(row: HTMLElement, fenceKey: string, sourcePath: string): void {
		const undoBtn = row.createDiv({
			cls: `osmosis-note-undo${this.lastUndoFor(fenceKey, sourcePath) < 0 ? " osmosis-hidden" : ""}`,
		});
		setIcon(undoBtn, "undo-2");
		undoBtn.setAttribute("aria-label", "Undo (Ctrl+Z)");
		undoBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			void this.undo(this.lastUndoFor(fenceKey, sourcePath));
		});
	}

	/** Where in the undo stack this fence's latest action is, or -1 when it has none. */
	private lastUndoFor(fenceKey: string, sourcePath: string): number {
		for (let i = this.undoStack.length - 1; i >= 0; i--) {
			const entry = this.undoStack[i]!;
			if (entry.sourcePath === sourcePath && (entry.fenceKey ?? entry.cardId) === fenceKey) return i;
		}
		return -1;
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
	 * question rather than three — the same rule mind map study applies to a node.
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
	 * its own reveal and its own rating, exactly as flashcard and mind map do.
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

		const container = el.createDiv({ cls: "osmosis-note-card" });
		if (parsed.exclude) container.addClass("osmosis-note-excluded");
		const topRow = container.createDiv({ cls: "osmosis-note-top" });

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

		const actionsEl = container.createDiv({ cls: "osmosis-note-actions" });

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

			removeRatingAnchors(container);
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
					// unmasked — flashcard study draws a card's siblings the same way.
					repaintOcclusion(slot, occlusion, "none");
				}
			});

			// Nothing but Show answer and the rule goes away on reveal: the answer
			// to an occluded card is the masks, which have just been repainted.
			// While reading, the rule stays as the seam between the question and
			// the answer beneath it.
			answerSlots.forEach((slot) => { slot.toggleClass("osmosis-hidden", hiding); });
			dividerEl.toggleClass("osmosis-hidden", hiding && revealed);

			// Rebuilt rather than repainted: neither row holds a picture, and the
			// top one is too short to move the diagram noticeably.
			topRow.empty();
			if (finished) {
				topRow.createSpan({ text: "Rated", cls: "osmosis-note-rated" });
			} else if (steps.length > 0) {
				topRow.createSpan({
					cls: "osmosis-note-step",
					text: `${String(index + 1)}/${String(steps.length)}`,
				});
			}
			this.addUndoButton(topRow, parsed.cardId, sourcePath);
			this.addExcludeToggle(topRow, parsed, sourcePath);

			actionsEl.empty();
			if (hiding && !revealed) {
				this.addShowAnswerButton(actionsEl, reveal);
			} else if (revealed && step?.cardId != null) {
				// Floated under the group just revealed, so a tall diagram does
				// not put its answer and its rating a scroll apart; a scattered
				// group keeps the full-width row. Note view only: flashcard study
				// keeps its fixed bar by choice.
				const slot = slots[step.diagram];
				const occlusion = occlusions[step.diagram];
				const anchored = slot && occlusion
					? mountRatingAnchor(slot, { ...occlusion, target: step.group })
					: null;
				this.showRating(anchored ?? actionsEl, step.cardId, parsed.cardId, sourcePath, advance);
			}
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

		container.addEventListener("click", (e) => {
			if (e.target === container) reveal();
		});

		this.trackFence(container, sourcePath, parsed.cardId, () => {
			this.resetFenceState(parsed.cardId);
			draw();
		}, draw, parsed);
	}

	/**
	 * The full-width "Show answer" button, in the flashcard study tab's look
	 * (`.osmosis-study-flip`). It reveals this card only.
	 */
	private addShowAnswerButton(row: HTMLElement, reveal: () => void): void {
		const btn = row.createEl("button", {
			text: "Show answer",
			cls: "osmosis-study-flip osmosis-note-show-answer",
		});
		btn.addEventListener("click", (e) => {
			e.stopPropagation();
			reveal();
		});
	}

	/** The eye toggle that takes a fence in or out of the deck. */
	private addExcludeToggle(row: HTMLElement, parsed: ParsedFence, sourcePath: string): void {
		const toggleIcon = row.createDiv({ cls: "osmosis-note-exclude-toggle" });
		setIcon(toggleIcon, parsed.exclude ? "eye-off" : "eye");
		toggleIcon.setAttribute(
			"aria-label",
			parsed.exclude ? "Include this card" : "Exclude this card",
		);
		toggleIcon.addEventListener("click", (e) => {
			e.stopPropagation();
			const exclude = !parsed.exclude;
			void this.toggleExclude(parsed.cardId, exclude, sourcePath).then(() => {
				// A sidecar write leaves the note alone, so nothing re-renders this
				// card (the live preview's included): show the new state here.
				if (!this.inSidecar(sourcePath)) return;
				parsed.exclude = exclude;
				toggleIcon.closest(".osmosis-note-card")?.toggleClass("osmosis-note-excluded", exclude);
				setIcon(toggleIcon, exclude ? "eye-off" : "eye");
				toggleIcon.setAttribute("aria-label", exclude ? "Include this card" : "Exclude this card");
			});
		});
	}

	private inSidecar(sourcePath: string): boolean {
		const file = this.plugin.app.vault.getFileByPath(sourcePath);
		return file !== null && this.plugin.noteData.modeOf(file) === "sidecar";
	}

	/**
	 * A sidecar-mode fence keeps `exclude` in its sidecar's `osmosis-fences`
	 * entry, which owns the fence once it exists — the header's `exclude:` is
	 * stale then, so the entry decides.
	 */
	private applySidecarExclude(parsed: ParsedFence, sourcePath: string): void {
		const file = this.plugin.app.vault.getFileByPath(sourcePath);
		const overlay = file ? this.plugin.fenceOverlays(file).get(parsed.cardId) : undefined;
		if (overlay) parsed.exclude = overlay.exclude;
	}

	/**
	 * Show a fence's new `exclude` on every tracked card of it, after a sidecar
	 * write the note will not re-render for. Note mode needs none of this: the
	 * fence's own text changed, so Obsidian draws it again.
	 */
	private showExclude(sourcePath: string, fenceId: string, exclude: boolean): void {
		if (!this.inSidecar(sourcePath)) return;
		for (const entry of this.trackedFences) {
			if (entry.sourcePath !== sourcePath || entry.fenceId !== fenceId) continue;
			entry.parsed.exclude = exclude;
			entry.el.toggleClass("osmosis-note-excluded", exclude);
			entry.redraw();
		}
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

		const container = el.createDiv({ cls: "osmosis-note-card osmosis-note-draft" });
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
		const parsed = this.parseFenceContent(source, this.sidecarOcclusions(source, sourcePath));
		if (!parsed) {
			this.renderDraft(source, el, sourcePath);
			return;
		}
		this.applySidecarExclude(parsed, sourcePath);

		const container = el.createDiv({ cls: "osmosis-note-card" });

		if (parsed.exclude) {
			container.addClass("osmosis-note-excluded");
		}

		// Exclude toggle at the top right, left of the editor's `</>` button
		const topRow = container.createDiv({ cls: "osmosis-note-top" });
		this.addExcludeToggle(topRow, parsed, sourcePath);

		// Render front
		const frontEl = container.createDiv({ cls: "osmosis-note-front" });
		this.renderSide(parsed, "front", frontEl, sourcePath);

		// Separator
		container.createDiv({ cls: "osmosis-study-divider" });

		// Render back (fully visible, no hiding)
		const backEl = container.createDiv({ cls: "osmosis-note-revealed" });
		this.renderSide(parsed, "back", backEl, sourcePath);
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
		// The flashcard study tab's bar: four equal buttons, each with the interval
		// it would schedule above its label.
		const ratingEl = container.createDiv({ cls: "osmosis-rating osmosis-study-rating-bar" });
		// The answer just went on screen. A note card has no "question shown"
		// moment — it lives inline in the note — and timing from the reveal logged
		// only the second it took to press a button. The note's study clock times
		// from the previous rating (or the session start) instead; the reveal is
		// only the fallback for a rating outside a session.
		const revealedAt = Date.now();
		const preview = this.session().previewIntervals(cardId, revealedAt);

		const ratings: Array<{ label: string; rating: FSRSRating; cls: string }> = [
			{ label: "Again", rating: 1, cls: "osmosis-rate-again" },
			{ label: "Hard", rating: 2, cls: "osmosis-rate-hard" },
			{ label: "Good", rating: 3, cls: "osmosis-rate-good" },
			{ label: "Easy", rating: 4, cls: "osmosis-rate-easy" },
		];

		for (const { label, rating, cls } of ratings) {
			const btn = ratingEl.createEl("button", { cls, attr: { "aria-label": label } });
			btn.createSpan({ cls: "osmosis-rate-interval", text: formatInterval(preview[rating]) });
			btn.createSpan({ cls: "osmosis-rate-label", text: label });
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
				ratingEl.createSpan({ text: `Rated: ${label}`, cls: "osmosis-note-rated" });
				this.reviewedCount++;
				this.updateProgress();
				// The session's progress strip lives in LineRevealProcessor, which
				// owns the mode; tell it one of its questions is answered, and how.
				this.plugin.lineReveal?.markFenceRated(sourcePath, fenceKey, cardId, rating);
				void this.recordRating(
					cardId,
					rating,
					this.plugin.lineReveal?.lapStudyClock(sourcePath) ?? Date.now() - revealedAt,
				);

				this.undoStack.push({
					type: "rate",
					cardId,
					sourcePath,
					fenceKey,
					previousSchedule,
					ratingLabel: label,
				});

				onRated?.();
			});
		}
	}

	/** The note surface's session manager, built on first use. */
	private session(): StudySessionManager {
		this.sessionManager ??= this.plugin.createSessionManager("note");
		return this.sessionManager;
	}

	private async recordRating(cardId: string, rating: FSRSRating, elapsedMs: number): Promise<void> {
		// Ensure the card exists in the store (note cards use hash-based IDs)
		if (!this.plugin.cardStore.getCard(cardId)) {
			// Card not in store — skip rating (card was generated inline, not from sync)
			return;
		}

		await this.session().recordReview(cardId, rating, { elapsedMs });
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
		this.showExclude(sourcePath, cardId, exclude);
	}

	/**
	 * Undo an action (rating or exclude) — the one at `at` in the stack, the
	 * latest by default. A rating puts its fence back on the question it answered.
	 *
	 * Taking one out of the middle is safe because each entry restores one card's
	 * own schedule, and `revertReview` discards that card's buffered log entry by
	 * ID rather than the newest one.
	 */
	private async undo(at = this.undoStack.length - 1): Promise<void> {
		if (at < 0) return;
		const [entry] = this.undoStack.splice(at, 1);
		if (!entry) return;

		if (entry.type === "exclude") {
			// Undo exclude toggle: restore previous state
			const file = this.plugin.app.vault.getFileByPath(entry.sourcePath);
			if (file) {
				await this.plugin.fenceWriter.writeExclude(file, entry.cardId, entry.previousExclude ?? false);
				this.showExclude(entry.sourcePath, entry.cardId, entry.previousExclude ?? false);
			}
		} else {
			// Undo rating: revert schedule
			const card = this.plugin.cardStore.getCard(entry.cardId);
			if (card) {
				await this.session().revertReview(entry.cardId, entry.previousSchedule ?? null);
			}

			this.reviewedCount = Math.max(0, this.reviewedCount - 1);
			this.updateProgress();
			if (entry.fenceKey !== undefined) {
				this.plugin.lineReveal?.unmarkFenceRated(entry.sourcePath, entry.fenceKey, entry.cardId);
			}
			this.plugin.refreshDashboard();
			if (entry.fenceKey !== undefined) this.rewindFence(entry.sourcePath, entry.fenceKey, entry.cardId);
		}
	}

	/**
	 * Put a fence back on the question whose rating was just undone, hidden
	 * again behind its Show answer button.
	 *
	 * Rating moves the fence's step on (`advance`), and the step lives in
	 * `stepAt`, not in the DOM — so redrawing alone would land on the next
	 * question, or on "Rated". Undo used to rewrite the file with its own content
	 * hoping for a re-render, which an unchanged file does not trigger, and which
	 * would have redrawn the advanced step anyway.
	 *
	 * The step is found from the session's pinned plan rather than recorded with
	 * the rating, and only rewound when the fence is still exactly one past it: an
	 * undo stack outlives a session, and a fence restarted since then has a
	 * sequence of its own that this rating is no part of.
	 */
	private rewindFence(sourcePath: string, fenceKey: string, cardId: string): void {
		const planned = this.fencePlan.get(fenceKey)?.findIndex((card) => card.id === cardId)
			?? this.occlusionPlan.get(fenceKey)?.findIndex((step) => step.cardId === cardId)
			?? -1;
		if (planned < 0 || this.stepAt.get(fenceKey) !== planned + 1) return;

		this.stepAt.set(fenceKey, planned);
		// The question is asked afresh, and so is any later one revealed in the
		// meantime: nothing after it has been answered.
		for (const key of [...this.revealedCardIds]) {
			if (key.startsWith(`${fenceKey}#`)) this.revealedCardIds.delete(key);
		}
		for (const fence of this.trackedFences) {
			if (fence.sourcePath === sourcePath && fence.fenceId === fenceKey) fence.redraw();
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

	/**
	 * Match ==term==, **term**, or :::term::: cloze deletions (with optional cN:
	 * group prefix). A `==` cloze may open with a colour emoji (`cloze-colour.ts`).
	 */
	private static readonly CLOZE_REGEX = new RegExp(
		`==${CLOZE_COLOUR_PATTERN}?(?:c\\d+:)?([^=]+)==|\\*\\*(?:c\\d+:)?([^*]+)\\*\\*|:::(?:c\\d+:)?(.+?):::`,
		"g",
	);

	/**
	 * A sidecar-mode fence's shape sets, by embed label — undefined when the
	 * header's own are the truth. The fence's sidecar entry owns it once it
	 * exists, so an entry with no shapes means none, whatever the header says.
	 */
	private sidecarOcclusions(source: string, sourcePath: string): Map<string, OcclusionSet> | undefined {
		const fenceId = this.extractIdFromSource(source);
		if (fenceId === null) return undefined;
		const file = this.plugin.app.vault.getFileByPath(sourcePath);
		return file ? this.plugin.fenceOverlays(file).get(fenceId)?.occlusions : undefined;
	}

	/**
	 * Parse fence content into front/back/metadata.
	 * Reuses the same format as explicit.ts card generators.
	 *
	 * `sidecarSets` replaces the header's shape sets (see {@link sidecarOcclusions}).
	 */
	private parseFenceContent(source: string, sidecarSets?: Map<string, OcclusionSet>): ParsedFence | null {
		const lines = source.split("\n");
		const { contentStart, exclude, hasOcclusion: headerOcclusion } = splitFenceHeader(lines);
		const hasOcclusion = sidecarSets ? sidecarSets.size > 0 : headerOcclusion;
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
			const { diagrams, prose } = fenceDiagrams(lines, contentStart, sidecarSets);
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
			const { front, back } = NoteStudyProcessor.buildCodeClozeFrontBack(contentLines);
			const cardId = this.extractIdFromSource(source) ?? this.hashContent(`code-cloze|||${content}`);
			return { front, back, cardId, exclude, isCloze: true };
		}

		// Check for inline code cloze (:::...::: markers inside inner code fences)
		const hasInlineCloze = contentLines.some((l) => /:::(?:c\d+:)?(.+?):::/.test(l));
		const hasInnerFence = contentLines.some((l) => /^```\w/.test(l.trim()));
		if (hasInlineCloze && hasInnerFence) {
			const { front, back } = NoteStudyProcessor.buildInlineClozeFrontBack(contentLines);
			const cardId = this.extractIdFromSource(source) ?? this.hashContent(`inline-cloze|||${content}`);
			return { front, back, cardId, exclude, isCloze: true };
		}

		const clozeMatches = [...content.matchAll(NoteStudyProcessor.CLOZE_REGEX)];
		if (clozeMatches.length === 0) return null;

		// Front: all clozes replaced with CLOZE_BLANK.
		// Back: `==`/`**` delimiters are kept (they're valid Markdown for highlight/bold),
		// `:::` delimiters are removed entirely (not Markdown — would leave visual residue),
		// and any `cN:` group prefix is stripped from all three forms.
		// A coloured `==` cloze blanks, and reads back, in its colour; its emoji is
		// not part of the answer.
		const front = content.replace(NoteStudyProcessor.CLOZE_REGEX, (full: string) =>
			colourBlank(CLOZE_BLANK, full.startsWith("==") ? parseHighlightToken(full).colour : null));
		const back = content.replace(
			NoteStudyProcessor.CLOZE_REGEX,
			(full: string, eq?: string, bold?: string, plain?: string) => {
				if (eq !== undefined) return colourAnswer(full);
				if (bold !== undefined) return `**${bold}**`;
				return plain!;
			},
		);
		const cardId = this.extractIdFromSource(source) ?? this.hashContent(`cloze|||${content}`);
		return { front, back, cardId, exclude, isCloze: true };
	}

	/**
	 * Build front/back for code cloze in note study.
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
				backLines.push(NoteStudyProcessor.stripInline(line));
			} else if (line.includes("osmosis-cloze")) {
				// Single-line cloze
				const indent = line.match(/^(\s*)/)?.[1] ?? "";
				frontLines.push(`${indent}${CLOZE_BLANK}`);
				backLines.push(NoteStudyProcessor.stripInline(line.replace(MARKER_COMMENT, "")));
			} else {
				const stripped = NoteStudyProcessor.stripInline(line);
				frontLines.push(stripped);
				backLines.push(stripped);
			}
		}

		return { front: frontLines.join("\n"), back: backLines.join("\n") };
	}

	/**
	 * Build front/back for inline code cloze in note study.
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
