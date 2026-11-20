import { Component, ItemView, MarkdownRenderer, Platform, Scope, type Menu, type WorkspaceLeaf } from "obsidian";
import type OsmosisPlugin from "../main";
import type { StudySessionManager } from "../study/StudySessionManager";
import type { StudyCard, StudyScope } from "../study/types";
import type { FSRSRating } from "../database/FSRSScheduler";
import type { Card, ScheduleData } from "../database/types";
import { BREADCRUMB_SEPARATOR } from "../card-gen/line-cards";
import { splitAtEmbed, stripEmbeds } from "../card-gen/occlusion";
import { isCloseMatch } from "../study/match";
import { crumbsBelowTitle, formatInterval, isNavbarSwipe, STUDY_TAB_IDLE_TITLE, studyTabTitle } from "../study/study-view";
import { countSession } from "../study/session-counts";
import { stepBackQueue } from "../study/undo-queue";
import type { OcclusionSide } from "../study/occlusion-masks";
import { addCodeBlockLanguageLabels } from "./codeBlockLabels";
import { VIEW_TYPE_DECKS } from "./DecksView";
import { renderOcclusion } from "./OcclusionRenderer";
import { ImageZoom, setZoom, zoomOf } from "./ImageZoom";
import { StudyProgressStrip } from "./StudyProgressStrip";
import { syncNavbar, type NavbarHost } from "./ToolRibbon";

export const VIEW_TYPE_STUDY = "osmosis-study";

/** A card waiting for its learning timer to fire. */
interface DeferredCard {
	studyCard: StudyCard;
	dueAt: number; // epoch ms when the card should reappear
	timer: number;
}

/** An entry in the undo stack — can represent either a rating or an exclude. */
interface UndoEntry {
	type: "rate" | "exclude";
	studyCard: StudyCard;
	index: number;
	/** Previous schedule data before the rating (null = card was new). Only for "rate". */
	previousSchedule?: ScheduleData | null;
	/** If the rating created a deferred learning card, store it so we can cancel the timer. */
	deferredCard?: DeferredCard;
}

/** Where a touch on the study tab began, for the navigation-bar swipe. */
interface TouchOrigin {
	x: number;
	y: number;
	at: number;
	/** The scroll surface under the finger and its position, to tell a swipe from a scroll. */
	scrollEl: HTMLElement | null;
	scrollTop: number;
}

const RATINGS: Array<{ label: string; rating: FSRSRating; cls: string }> = [
	{ label: "Again", rating: 1, cls: "osmosis-rate-again" },
	{ label: "Hard", rating: 2, cls: "osmosis-rate-hard" },
	{ label: "Good", rating: 3, cls: "osmosis-rate-good" },
	{ label: "Easy", rating: 4, cls: "osmosis-rate-easy" },
];


/**
 * Anki-style sequential study, as a main-area tab (one per workspace).
 * Shows card front → flip to reveal back → rate (Again/Hard/Good/Easy).
 * Type-in cards show a text input instead of the flip button.
 *
 * Cards in learning/relearning steps reappear after timer-based delays,
 * matching Anki's intra-session behavior.
 *
 * The tab outlives a session: a finished session leaves a completion screen.
 * With no scope (opened bare, or restored after a restart) it turns into the
 * Decks page (`DecksView`), as does toggling its header cap off. Nothing about
 * a session is saved in the workspace — `getState` is the default empty one on
 * purpose. Schedules are written per rating already, and the undo stack is
 * only valid against schedules that have not moved since, so a restored tab
 * starts from the Decks page rather than a stale queue.
 *
 * On a phone the tab hides Obsidian's navigation bar while it is the active
 * view, so the bottom buttons are never under it; a swipe up or the ⋯ menu
 * brings it back (`navbarShown`). `syncNavbar` restores it whenever another
 * view becomes active, and `onClose` does the same.
 */
export class SequentialStudyView extends ItemView implements NavbarHost {
	/** The session's scope; null only before the first session, or on the way to the Decks page. */
	private studyScope: StudyScope | null = null;
	private sessionManager: StudySessionManager | null = null;
	/** True from a non-empty session's start until it is ended; gates the flush. */
	private sessionActive = false;

	private queue: StudyCard[] = [];
	private currentIndex = 0;
	private reviewed = 0;
	private isFlipped = false;
	/**
	 * Owns the markdown rendered for the card on screen. One per card rather
	 * than one per session, so a long session does not keep every card's
	 * rendered children alive until the tab closes.
	 */
	private cardComponent: Component | null = null;

	/** Cards waiting for their learning timer to fire. */
	private deferredCards: DeferredCard[] = [];
	/** True when the view is showing the "waiting for next card" screen. */
	private isWaiting = false;
	private countdownTimer: number | null = null;

	/** Stack of undoable actions (ratings and excludes). */
	private undoStack: UndoEntry[] = [];

	/**
	 * When the current card's question went on screen, for the review log's
	 * elapsed time. Anchored at the question rather than the flip, matching
	 * what Anki records as time taken.
	 */
	private cardShownAt = Date.now();

	/** Phone only: the user brought the navigation bar back (swipe up or ⋯ menu). */
	private navbarShown = false;
	private touchOrigin: TouchOrigin | null = null;
	/** Pinch and Ctrl+wheel zoom on the card's images (T104), rebuilt with the card area. */
	private imageZoom: ImageZoom | null = null;

	/**
	 * The tab title, the session's only title (`studyTabTitle`): the deck or
	 * note while a session is on screen, "Study" otherwise.
	 */
	private tabTitle = STUDY_TAB_IDLE_TITLE;

	// Settings, read when a session starts
	/** Preceding sibling lines shown as context on line-card fronts. */
	private contextLines = 2;

	// Header actions, added in onOpen (a session can be started before it runs)
	private undoAction: HTMLElement | null = null;
	private gotoAction: HTMLElement | null = null;
	private excludeAction: HTMLElement | null = null;
	/** The study cap: lit while the tab holds a session; toggling it off shows the Decks page. */
	private capAction: HTMLElement | null = null;

	// DOM elements
	/**
	 * The slim strip pinned over the top of the card: the progress bar and the
	 * counts, refreshed from `updateProgress`. No title — that is the tab's.
	 */
	private statusEl!: HTMLElement;
	private progressStrip!: StudyProgressStrip;
	private cardEl!: HTMLElement;
	private frontEl!: HTMLElement;
	private dividerEl!: HTMLElement;
	private backEl!: HTMLElement;
	private flipBtn!: HTMLButtonElement;

	private ratingBar!: HTMLElement;
	/** The interval label above each rating button, in rating order. */
	private intervalEls: HTMLElement[] = [];
	private typeInEl!: HTMLElement;
	private typeInInput!: HTMLInputElement;

	constructor(leaf: WorkspaceLeaf, private readonly plugin: OsmosisPlugin) {
		super(leaf);
		// The keys live on the view's own Scope, so they fire only while this
		// leaf is the active one, and ahead of any global hotkey on the same key.
		this.scope = new Scope(this.app.scope);
		this.registerKeyboard(this.scope);
		this.contentEl.addClass("osmosis-study-view");
	}

	getViewType(): string {
		return VIEW_TYPE_STUDY;
	}

	getDisplayText(): string {
		return this.tabTitle;
	}

	getIcon(): string {
		return "graduation-cap";
	}

	async onOpen(): Promise<void> {
		this.capAction = this.addAction("graduation-cap", "Flashcard study", () => void this.showDecks());
		this.capAction.addClass("osmosis-study-cap");
		this.excludeAction = this.addAction("eye-off", "Exclude card (e)", () => void this.excludeCard());
		this.gotoAction = this.addAction("file-text", "Open note (g)", () => this.goToCard());
		this.undoAction = this.addAction("undo-2", "Undo (Ctrl+Z)", () => void this.undo());
		this.updateHeaderActions();

		if (Platform.isPhone) {
			this.registerDomEvent(this.contentEl, "touchstart", (e) => this.onTouchStart(e), { passive: true });
			this.registerDomEvent(this.contentEl, "touchend", (e) => this.onTouchEnd(e), { passive: true });
			this.registerDomEvent(this.contentEl, "touchcancel", () => { this.touchOrigin = null; }, { passive: true });
		}

		syncNavbar(this.app);

		const scope = this.plugin.takePendingStudyScope();
		if (scope) {
			this.startSession(scope);
		} else {
			// Opened bare (the open-study command, or restored after a restart):
			// nothing to study, so the tab becomes the Decks page. Deferred,
			// because this runs inside the setViewState that is opening the view.
			window.setTimeout(() => {
				if (this.studyScope === null && this.leaf.view === this) void this.showDecks();
			}, 0);
		}
	}

	async onClose(): Promise<void> {
		this.endSession();
		this.imageZoom?.destroy();
		this.imageZoom = null;
		// This view no longer counts, even while it is still the active one
		syncNavbar(this.app, this);
		this.contentEl.empty();
	}

	/** For `syncNavbar`: on a phone the tab hides the navigation bar unless the user brought it back. */
	navbarEditMode(): boolean {
		return !this.navbarShown;
	}

	onPaneMenu(menu: Menu, source: string): void {
		super.onPaneMenu(menu, source);
		if (!Platform.isPhone) return;
		menu.addItem((item) =>
			item
				.setTitle("Show navigation bar")
				.setIcon("panel-bottom")
				.setChecked(this.navbarShown)
				.onClick(() => this.toggleNavbar()),
		);
	}

	/**
	 * Start a session over `scope`, replacing whatever the tab was showing. A
	 * session already running is ended first, which flushes its writes.
	 */
	startSession(scope: StudyScope): void {
		this.endSession();
		this.studyScope = scope;

		const { settings } = this.plugin;
		this.contextLines = settings.flashcardContextLines;
		this.sessionManager = this.plugin.createSessionManager("flashcard");
		this.queue = this.sessionManager.buildQueue(scope, {
			newLimit: settings.dailyNewCardLimit,
			reviewLimit: settings.dailyReviewCardLimit,
		});
		this.currentIndex = 0;
		this.reviewed = 0;
		this.isFlipped = false;
		this.isWaiting = false;
		this.undoStack = [];

		this.contentEl.empty();

		if (this.queue.length === 0) {
			this.setTitleScope(null);
			this.renderEmpty();
			this.updateHeaderActions();
			return;
		}

		this.sessionActive = true;
		this.buildLayout();
		this.renderCard();
	}

	/**
	 * End the running session, if any: clear the learning timers and the
	 * countdown, release the card's render children, and flush the schedule
	 * and review-log writes. Safe to call twice; only an active session flushes.
	 */
	private endSession(): void {
		for (const deferred of this.deferredCards) {
			window.clearTimeout(deferred.timer);
		}
		this.deferredCards = [];
		this.stopCountdown();
		this.releaseCardComponent();
		this.touchOrigin = null;

		if (this.sessionActive) {
			this.sessionActive = false;
			this.plugin.flushStudySession();
		}
	}

	/** A fresh render owner for the card about to be drawn; the last card's is unloaded. */
	private newCardComponent(): Component {
		this.releaseCardComponent();
		this.cardComponent = this.addChild(new Component());
		return this.cardComponent;
	}

	private releaseCardComponent(): void {
		if (this.cardComponent) this.removeChild(this.cardComponent);
		this.cardComponent = null;
	}

	/** The card's render owner, created if a re-render (undo, flip) finds none. */
	private get renderComponent(): Component {
		return this.cardComponent ?? this.newCardComponent();
	}

	private stopCountdown(): void {
		if (this.countdownTimer !== null) window.clearInterval(this.countdownTimer);
		this.countdownTimer = null;
	}

	private toggleNavbar(): void {
		this.navbarShown = !this.navbarShown;
		syncNavbar(this.app);
	}

	private onTouchStart(e: TouchEvent): void {
		const touch = e.touches[0];
		if (e.touches.length !== 1 || !touch) {
			// A second finger makes it a pinch, not a swipe
			this.touchOrigin = null;
			return;
		}
		const target = e.target instanceof HTMLElement ? e.target : null;
		const scrollEl = target?.closest<HTMLElement>(".osmosis-study-scroll") ?? null;
		this.touchOrigin = {
			x: touch.clientX,
			y: touch.clientY,
			at: Date.now(),
			scrollEl,
			scrollTop: scrollEl?.scrollTop ?? 0,
		};
	}

	private onTouchEnd(e: TouchEvent): void {
		const origin = this.touchOrigin;
		this.touchOrigin = null;
		const touch = e.changedTouches[0];
		if (!origin || !touch) return;
		const swipe = isNavbarSwipe({
			dx: touch.clientX - origin.x,
			dy: touch.clientY - origin.y,
			ms: Date.now() - origin.at,
			scrolled: origin.scrollEl !== null && origin.scrollEl.scrollTop !== origin.scrollTop,
		});
		if (swipe) this.toggleNavbar();
	}

	/**
	 * Header actions follow what is on screen: Open note and Exclude need a
	 * card, Undo needs something on the stack.
	 */
	private updateHeaderActions(): void {
		this.gotoAction?.toggleClass("osmosis-hidden", !this.hasCard);
		this.excludeAction?.toggleClass("osmosis-hidden", !this.hasCard);
		this.undoAction?.toggleClass("osmosis-hidden", !this.sessionActive || this.undoStack.length === 0);
		this.capAction?.toggleClass("is-active", this.studyScope !== null);
	}

	/**
	 * Retitle the tab for `scope`, or for no session when null. A note's title
	 * comes from its H1s, read once here rather than on every header redraw.
	 */
	private setTitleScope(scope: StudyScope | null): void {
		let h1s: string[] = [];
		if (scope?.type === "note") {
			const file = this.app.vault.getFileByPath(scope.notePath);
			const headings = file ? this.app.metadataCache.getFileCache(file)?.headings : undefined;
			h1s = (headings ?? []).filter((h) => h.level === 1).map((h) => h.heading);
		}
		const title = studyTabTitle(scope, h1s);
		if (title === this.tabTitle) return;
		this.tabTitle = title;
		// updateHeader() refreshes the tab title; not in public typings
		(this.leaf as unknown as { updateHeader(): void }).updateHeader();
	}

	/**
	 * Toggle study off: end the session, which flushes its ratings, and turn
	 * this tab into the Decks page. Studying a deck there turns it back.
	 */
	private async showDecks(): Promise<void> {
		this.endSession();
		this.studyScope = null;
		await this.leaf.setViewState({ type: VIEW_TYPE_DECKS, active: true });
	}

	private buildLayout(): void {
		const container = this.contentEl;

		this.statusEl = container.createDiv({ cls: "osmosis-study-status" });

		// Progress bar and Anki-style new | learn | due counts, the session's only counter
		this.progressStrip = new StudyProgressStrip(this.statusEl);

		// Card area — the one scroll surface in the tab
		this.cardEl = container.createDiv({ cls: "osmosis-study-card osmosis-study-scroll" });
		this.imageZoom?.destroy();
		this.imageZoom = new ImageZoom(this.cardEl);
		this.frontEl = this.cardEl.createDiv({ cls: "osmosis-study-front" });
		this.dividerEl = this.cardEl.createDiv({ cls: "osmosis-study-divider" });
		this.backEl = this.cardEl.createDiv({ cls: "osmosis-study-back" });

		// Actions, floating over the bottom of the card
		const actions = container.createDiv({ cls: "osmosis-study-actions" });

		this.flipBtn = actions.createEl("button", {
			text: "Show answer",
			cls: "osmosis-study-flip",
		});
		this.flipBtn.addEventListener("click", () => this.flip());

		// Type-in area (hidden by default)
		this.typeInEl = actions.createDiv({ cls: "osmosis-study-typein osmosis-hidden" });
		this.typeInInput = this.typeInEl.createEl("input", {
			type: "text",
			placeholder: "Type your answer...",
			cls: "osmosis-study-typein-input",
		});
		const checkBtn = this.typeInEl.createEl("button", {
			text: "Check",
			cls: "osmosis-study-typein-submit",
		});
		checkBtn.addEventListener("click", () => this.checkTypeIn());

		// The rating row every other study surface uses, for the same buttons
		this.ratingBar = actions.createDiv({ cls: "osmosis-contextual-rating osmosis-study-rating-bar osmosis-hidden" });

		// Each button shows the interval it would schedule above its label
		this.intervalEls = [];
		for (const { label, rating, cls } of RATINGS) {
			const btn = this.ratingBar.createEl("button", { cls, attr: { "aria-label": `${label} (${rating})` } });
			this.intervalEls.push(btn.createSpan({ cls: "osmosis-rate-interval" }));
			btn.createSpan({ cls: "osmosis-rate-label", text: label });
			btn.addEventListener("click", () => void this.rate(rating));
		}
	}

	/** Fill the interval labels for the card on screen, once its answer shows. */
	private updateRatingIntervals(card: Card): void {
		if (!this.sessionManager) return;
		const preview = this.sessionManager.previewIntervals(card.id);
		RATINGS.forEach(({ rating }, i) => {
			const el = this.intervalEls[i];
			if (el) el.textContent = formatInterval(preview[rating]);
		});
	}

	private renderCard(): void {
		this.isWaiting = false;
		this.stopCountdown();

		const studyCard = this.queue[this.currentIndex];
		if (!studyCard) {
			// No more cards in the immediate queue — check for deferred learning cards
			if (this.deferredCards.length > 0) {
				this.renderWaiting();
				return;
			}
			this.renderComplete();
			return;
		}

		this.isFlipped = false;
		this.cardShownAt = Date.now();
		this.newCardComponent();
		// Also undo's way back from the complete screen, which retitled to "Study"
		this.setTitleScope(this.studyScope);

		// Rebuild card area if it was replaced by waiting/complete screen
		this.rebuildCardArea();

		// Update progress
		this.updateProgress();

		// Render front — line cards get a breadcrumb + preceding-line context
		// treatment instead of plain markdown
		this.frontEl.empty();
		this.frontEl.removeClass("osmosis-hidden");
		this.dividerEl.removeClass("osmosis-hidden");
		if (studyCard.card.cardType === "line") {
			this.renderLineCardFront(studyCard.card);
		} else if (studyCard.card.occlusion) {
			this.renderOcclusionSide(studyCard.card, "front");
		} else {
			void MarkdownRenderer.render(
				this.app,
				studyCard.card.front,
				this.frontEl,
				studyCard.card.notePath,
				this.renderComponent,
			).then(() => addCodeBlockLanguageLabels(this.frontEl));
		}

		// Hide back
		this.backEl.empty();
		this.backEl.removeClass("is-revealed");

		// Hide rating
		this.ratingBar.addClass("osmosis-hidden");
		this.highlightSuggestedRating(null);

		// Header actions: a card is on screen; undo if there's something to undo
		this.updateHeaderActions();

		// Show flip or type-in based on card type
		const isTypeIn = studyCard.card.typeIn;
		if (isTypeIn) {
			this.flipBtn.addClass("osmosis-hidden");
			this.typeInEl.removeClass("osmosis-hidden");
			this.typeInInput.value = "";
			// Focus input after a tick so the view is fully rendered
			window.setTimeout(() => this.typeInInput.focus(), 50);
		} else {
			this.flipBtn.removeClass("osmosis-hidden");
			this.typeInEl.addClass("osmosis-hidden");
		}
	}

	/**
	 * Line-card front: the ancestor breadcrumb ending in "?" for the hidden
	 * line ("Cells › Cellular Respiration › Krebs cycle › ?"), then up to
	 * `contextLines` immediately preceding sibling lines, dimmed. Flipping
	 * reveals the line itself as the back, as with any other card.
	 */
	private renderLineCardFront(card: Card): void {
		this.renderBreadcrumb(card.front, true);

		const context = this.contextLines > 0
			? (card.contextBefore ?? []).slice(-this.contextLines)
			: [];
		if (context.length === 0) return;

		const contextEl = this.frontEl.createDiv({ cls: "osmosis-line-context" });
		for (const line of context) {
			const lineEl = contextEl.createDiv({ cls: "osmosis-line-context-line" });
			void MarkdownRenderer.render(
				this.app,
				line,
				lineEl,
				card.notePath,
				this.renderComponent,
			).then(() => addCodeBlockLanguageLabels(lineEl));
		}
	}

	/**
	 * Occlusion card: the card body with its own diagram replaced, in place, by
	 * the masked one `renderOcclusion` draws.
	 *
	 * Rendering the body in two halves around the picture is what keeps the
	 * fence's *other* diagrams where the author put them. They stay in the body
	 * as ordinary embeds and render unmasked — a fence carries several diagrams
	 * because they explain each other, so the elevation is context for the
	 * cross-section rather than a second question. Appending the masked image
	 * after all the prose would print those siblings above it, in the reverse of
	 * the order they were written.
	 *
	 * The card's own embed must come out of the markdown either way: leaving it
	 * in would render that diagram a second time, unmasked, beside the question.
	 *
	 * An occluded *line* (it has a block ID) keeps the line card's shape: the
	 * front is the ancestor breadcrumb and only the back holds the image. Both
	 * sides draw the same thing for it — the breadcrumb as a lead-in, then the
	 * line — so nothing moves when the answer shows (T109). Rendering `front`
	 * as prose instead printed the note name above the picture on the question
	 * only, and the picture jumped up on reveal.
	 */
	private renderOcclusionSide(card: Card, side: OcclusionSide): void {
		if (!card.occlusion) return;

		const isLine = card.blockId !== undefined;
		if (isLine) this.renderBreadcrumb(card.front, false);
		const body = isLine || side === "back" ? card.back : card.front;
		const split = splitAtEmbed(body, card.occlusion.image);
		// A body with no embed at all — the image was renamed out from under the
		// shape set, say. Still draw the masks; `renderOcclusion` shows its own
		// missing-file notice.
		const before = split ? split.before : stripEmbeds(body);
		const after = split ? split.after : "";

		// Both halves get their element up front, in order: `MarkdownRenderer`
		// resolves asynchronously, so anything appended after the await would
		// otherwise land above prose that started rendering first.
		const beforeEl = before.trim() !== ""
			? this.frontEl.createDiv({ cls: "osmosis-occlusion-prose" })
			: null;
		const imageEl = this.frontEl.createDiv({ cls: "osmosis-study-media" });
		const afterEl = after.trim() !== ""
			? this.frontEl.createDiv({ cls: "osmosis-occlusion-prose" })
			: null;

		const renderProse = (markdown: string, el: HTMLElement | null): void => {
			if (!el) return;
			void MarkdownRenderer.render(
				this.app,
				markdown.trim(),
				el,
				card.notePath,
				this.renderComponent,
			).then(() => addCodeBlockLanguageLabels(el));
		};

		renderProse(before, beforeEl);
		renderOcclusion(this.app, imageEl, card.occlusion, side, card.notePath);
		renderProse(after, afterEl);
	}

	/**
	 * A line card's ancestor breadcrumb, less the leading segments that only
	 * repeat the tab title (`crumbsBelowTitle`, T109): the note's name in a
	 * session over that note or its same-named deck. A line card's front ends
	 * it in "?" for the hidden line; an occluded line's lead-in has none, since
	 * the masks are the question.
	 */
	private renderBreadcrumb(front: string, endInQuestion: boolean): void {
		// With no H1s, `studyTabTitle` gives a note session its file name: the
		// breadcrumb's first segment even when the tab shows the note's H1
		const redundant = [this.tabTitle, studyTabTitle(this.studyScope)];
		const parts = crumbsBelowTitle(front.split(BREADCRUMB_SEPARATOR), redundant);
		if (parts.length === 0 && !endInQuestion) return;
		const crumbEl = this.frontEl.createDiv({ cls: "osmosis-line-breadcrumb" });
		parts.forEach((part, i) => {
			if (i > 0) crumbEl.createSpan({ cls: "osmosis-line-breadcrumb-sep", text: "›" });
			crumbEl.createSpan({ cls: "osmosis-line-breadcrumb-part", text: part });
		});
		if (!endInQuestion) return;
		if (parts.length > 0) crumbEl.createSpan({ cls: "osmosis-line-breadcrumb-sep", text: "›" });
		crumbEl.createSpan({
			cls: "osmosis-line-breadcrumb-part osmosis-line-breadcrumb-unknown",
			text: "?",
		});
	}

	/**
	 * Rebuild the card area DOM elements if they were destroyed
	 * (e.g., by renderWaiting or renderComplete calling cardEl.empty()).
	 */
	private rebuildCardArea(): void {
		if (this.frontEl.parentElement === this.cardEl) return; // still intact

		this.cardEl.empty();
		this.frontEl = this.cardEl.createDiv({ cls: "osmosis-study-front" });
		this.dividerEl = this.cardEl.createDiv({ cls: "osmosis-study-divider" });
		this.backEl = this.cardEl.createDiv({ cls: "osmosis-study-back" });
	}

	private updateProgress(): void {
		const remaining = (this.queue.length - this.currentIndex) + this.deferredCards.length;
		const total = this.reviewed + remaining;
		const pct = total > 0 ? ((this.reviewed + 1) / total) * 100 : 0;
		this.progressStrip.setProgress(pct);
		this.updateCounts();
	}

	/** Refresh the new | learn | due counts and underline the on-screen card's. */
	private updateCounts(): void {
		this.progressStrip.setCounts(countSession(
			this.queue,
			this.currentIndex,
			this.deferredCards.map((d) => d.studyCard),
		));
	}

	private flip(): void {
		if (this.isFlipped) return;
		this.isFlipped = true;

		const studyCard = this.queue[this.currentIndex];
		if (!studyCard) return;

		const isCloze =
			studyCard.card.cardType === "explicit_cloze" ||
			studyCard.card.cardType === "code_cloze";

		if (studyCard.card.occlusion) {
			// Occlusion answers in place, as cloze does: the answer is the same
			// diagram with one mask lifted, and stacking a second copy of the
			// image under the first would only ask the user to compare them.
			// The answer is a fresh copy of the diagram, so it takes over the
			// question's zoom: revealing must not throw the reader back to fit.
			const zoom = zoomOf(this.frontEl.querySelector<HTMLElement>(".osmosis-occlusion"));
			this.frontEl.empty();
			this.renderOcclusionSide(studyCard.card, "back");
			const diagram = this.frontEl.querySelector<HTMLElement>(".osmosis-occlusion");
			if (diagram) setZoom(diagram, zoom);
			this.dividerEl.addClass("osmosis-hidden");
		} else if (isCloze) {
			// Cloze: replace the front in-place with the revealed text rather than
			// stacking front + back. Keeps the card body anchored where the user
			// was already reading.
			this.frontEl.empty();
			void MarkdownRenderer.render(
				this.app,
				studyCard.card.back,
				this.frontEl,
				studyCard.card.notePath,
				this.renderComponent,
			).then(() => addCodeBlockLanguageLabels(this.frontEl));
			this.dividerEl.addClass("osmosis-hidden");
		} else {
			// Render back content
			void MarkdownRenderer.render(
				this.app,
				studyCard.card.back,
				this.backEl,
				studyCard.card.notePath,
				this.renderComponent,
			).then(() => addCodeBlockLanguageLabels(this.backEl));
			this.backEl.addClass("is-revealed");
		}

		// Show rating buttons, hide flip
		this.updateRatingIntervals(studyCard.card);
		this.flipBtn.addClass("osmosis-hidden");
		this.ratingBar.removeClass("osmosis-hidden");
	}

	private checkTypeIn(): void {
		if (this.isFlipped) return;

		const studyCard = this.queue[this.currentIndex];
		if (!studyCard) return;

		this.isFlipped = true;

		const userAnswer = this.typeInInput.value.trim();
		const correctAnswer = studyCard.card.back.trim();

		// Render back content
		void MarkdownRenderer.render(
			this.app,
			studyCard.card.back,
			this.backEl,
			studyCard.card.notePath,
			this.renderComponent,
		).then(() => addCodeBlockLanguageLabels(this.backEl));

		// Show comparison result
		const resultEl = this.backEl.createDiv({ cls: "osmosis-typein-result" });
		resultEl.createSpan({ text: `Your answer: ${userAnswer}` });

		const exact = userAnswer.toLowerCase() === correctAnswer.toLowerCase();
		const close = !exact && isCloseMatch(userAnswer, correctAnswer);

		if (exact) {
			resultEl.addClass("osmosis-typein-correct");
		} else if (close) {
			resultEl.addClass("osmosis-typein-close");
		} else {
			resultEl.addClass("osmosis-typein-wrong");
		}

		this.backEl.addClass("is-revealed");

		// Hide type-in, show rating bar with suggested rating highlighted
		this.updateRatingIntervals(studyCard.card);
		this.typeInEl.addClass("osmosis-hidden");
		this.ratingBar.removeClass("osmosis-hidden");

		const suggested: FSRSRating = exact ? 3 : close ? 2 : 1;
		this.highlightSuggestedRating(suggested);
	}

	/** Outline the rating a type-in answer suggests; null clears it for the next card. */
	private highlightSuggestedRating(rating: FSRSRating | null): void {
		const buttons = this.ratingBar.querySelectorAll("button");
		buttons.forEach((btn, i) => {
			if (i + 1 === rating) {
				btn.classList.add("is-suggested");
			} else {
				btn.classList.remove("is-suggested");
			}
		});
	}

	private async rate(rating: FSRSRating): Promise<void> {
		const studyCard = this.queue[this.currentIndex];
		if (!studyCard || !this.sessionManager) return;

		// Snapshot previous schedule before rating (null = card was new)
		const card = studyCard.card;
		const previousSchedule: ScheduleData | null = card.due !== undefined
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

		const updatedSchedule = await this.sessionManager.recordReview(
			studyCard.card.id, rating,
			{ elapsedMs: Date.now() - this.cardShownAt },
		);

		const undoEntry: UndoEntry = {
			type: "rate",
			studyCard,
			index: this.currentIndex,
			previousSchedule,
		};

		this.reviewed++;
		this.currentIndex++;

		// If the card is still in learning/relearning, defer it with a timer
		if (isLearningState(updatedSchedule)) {
			const deferred = this.deferLearningCard(studyCard, updatedSchedule);
			undoEntry.deferredCard = deferred;
		}

		this.undoStack.push(undoEntry);
		this.renderCard();
	}

	/**
	 * Exclude the current card and advance without recording a review.
	 * Line cards get `disabled: true` in osmosis-schedule frontmatter (schedule
	 * preserved); fence cards get `exclude: true` in fence metadata.
	 */
	private async excludeCard(): Promise<void> {
		const studyCard = this.queue[this.currentIndex];
		if (!studyCard || this.isWaiting || !this.sessionManager) return;

		const isLineCard = studyCard.card.blockId !== undefined;
		if (isLineCard) {
			this.sessionManager.setLineCardDisabled(studyCard.card, true);
		} else {
			const file = this.app.vault.getFileByPath(studyCard.card.notePath);
			if (file) {
				await this.plugin.fenceWriter.writeExclude(file, studyCard.card.id, true);
			}
		}

		this.undoStack.push({
			type: "exclude",
			studyCard,
			index: this.currentIndex,
		});

		// Advance without recording a review
		this.currentIndex++;
		this.renderCard();
	}

	/** Undo the last action (rating or exclude). */
	private async undo(): Promise<void> {
		if (!this.sessionManager) return;
		const entry = this.undoStack.pop();
		if (!entry) return;

		if (entry.type === "exclude") {
			// Undo exclude: clear the flag (frontmatter or fence). The card is
			// still in the queue at currentIndex - 1; stepping back shows it.
			if (entry.studyCard.card.blockId !== undefined) {
				this.sessionManager.setLineCardDisabled(entry.studyCard.card, false);
			} else {
				const file = this.app.vault.getFileByPath(entry.studyCard.card.notePath);
				if (file) {
					await this.plugin.fenceWriter.writeExclude(file, entry.studyCard.card.id, false);
				}
			}
			this.stepBack();
		} else {
			// Undo rating: revert schedule and step back to the card
			await this.sessionManager.revertReview(
				entry.studyCard.card.id,
				entry.previousSchedule ?? null,
			);

			// Cancel deferred learning card timer if one was created
			if (entry.deferredCard) {
				window.clearTimeout(entry.deferredCard.timer);
				const idx = this.deferredCards.indexOf(entry.deferredCard);
				if (idx !== -1) this.deferredCards.splice(idx, 1);
			}

			this.reviewed--;
			// If the timer already fired, the deferred copy is in the queue: drop it.
			this.stepBack(entry.deferredCard?.studyCard);
		}

		this.renderCard();
	}

	/** Step the queue back over the last advance (see `stepBackQueue`). */
	private stepBack(firedDeferred?: StudyCard): void {
		const next = stepBackQueue(
			{ queue: this.queue, currentIndex: this.currentIndex },
			firedDeferred,
		);
		this.queue = next.queue;
		this.currentIndex = next.currentIndex;
	}

	/**
	 * Open the current card's source note at its line, in a new tab. The study
	 * tab stays where it is, session and all, so the user can come back to it —
	 * opening in this leaf would replace the view and end the session.
	 */
	private goToCard(): void {
		const studyCard = this.queue[this.currentIndex];
		if (!studyCard || this.isWaiting) return;

		const file = this.app.vault.getFileByPath(studyCard.card.notePath);
		if (file) {
			void this.app.workspace.getLeaf("tab").openFile(file, {
				eState: { line: studyCard.card.sourceLine },
			});
		}
	}

	/**
	 * Schedule a learning/relearning card to reappear after its due time.
	 * Sets a real timer based on the FSRS-computed due date.
	 */
	private deferLearningCard(studyCard: StudyCard, schedule: ScheduleData): DeferredCard {
		const dueAt = schedule.due;
		const delayMs = Math.max(0, dueAt - Date.now());

		const updatedStudyCard: StudyCard = {
			card: {
				...studyCard.card,
				stability: schedule.stability,
				difficulty: schedule.difficulty,
				due: schedule.due,
				lastReview: schedule.lastReview ?? undefined,
				reps: schedule.reps,
				lapses: schedule.lapses,
				state: schedule.state,
				learningSteps: schedule.learningSteps,
			},
			isNew: false,
		};

		const deferred: DeferredCard = {
			studyCard: updatedStudyCard,
			dueAt,
			timer: window.setTimeout(() => this.onLearningTimerFired(deferred), delayMs),
		};

		this.deferredCards.push(deferred);
		return deferred;
	}

	/**
	 * Called when a learning card's timer fires.
	 * Moves the card from deferred back into the active queue.
	 */
	private onLearningTimerFired(deferred: DeferredCard): void {
		// Remove from deferred list
		const idx = this.deferredCards.indexOf(deferred);
		if (idx !== -1) {
			this.deferredCards.splice(idx, 1);
		}

		// Insert so the card is next in line:
		// - If waiting (no card on screen), insert at currentIndex so renderCard() picks it up.
		// - Otherwise a card is being displayed at currentIndex — insert *after* it
		//   to avoid corrupting the card the user is currently viewing.
		const insertAt = this.isWaiting ? this.currentIndex : this.currentIndex + 1;
		this.queue.splice(insertAt, 0, deferred.studyCard);

		// If we were in the waiting state, show the card immediately
		if (this.isWaiting) {
			this.renderCard();
		}
	}

	/**
	 * Show a "waiting for next card" screen when all immediate cards are done
	 * but learning cards are still on timers.
	 */
	private renderWaiting(): void {
		this.isWaiting = true;

		this.releaseCardComponent();
		this.cardEl.empty();
		this.flipBtn.addClass("osmosis-hidden");
		this.ratingBar.addClass("osmosis-hidden");
		this.typeInEl.addClass("osmosis-hidden");
		this.updateHeaderActions();

		// Find the soonest deferred card
		const soonest = this.deferredCards.reduce((a, b) =>
			a.dueAt < b.dueAt ? a : b,
		);
		const waitSecs = Math.max(0, Math.ceil((soonest.dueAt - Date.now()) / 1000));

		this.updateProgress();

		this.cardEl.createDiv({ cls: "osmosis-study-waiting" }, (el) => {
			el.createEl("h2", { text: "Waiting for next card..." });
			const countdownEl = el.createEl("p", {
				text: `Next card in ${formatWaitTime(waitSecs)}`,
				cls: "osmosis-study-countdown",
			});
			el.createEl("p", {
				text: `${this.deferredCards.length} card${this.deferredCards.length !== 1 ? "s" : ""} still in learning`,
				cls: "osmosis-study-waiting-info",
			});

			// Update countdown every second; stopped when a card shows or the session ends
			this.stopCountdown();
			this.countdownTimer = window.setInterval(() => {
				const remaining = Math.max(0, Math.ceil((soonest.dueAt - Date.now()) / 1000));
				countdownEl.textContent = `Next card in ${formatWaitTime(remaining)}`;
				if (remaining <= 0) this.stopCountdown();
			}, 1000);
		});
	}

	/** A scope with nothing waiting: offer another deck rather than an empty session. */
	private renderEmpty(): void {
		const container = this.contentEl;
		container.createDiv({ cls: "osmosis-study-complete" }, (el) => {
			el.createEl("h2", { text: "No cards due" });
			el.createEl("p", { text: "All caught up! Check back later." });
			const buttons = el.createDiv({ cls: "osmosis-study-complete-buttons" });
			this.completeButton(buttons, "Choose a deck", () => void this.showDecks());
			this.completeButton(buttons, "Close", () => this.leaf.detach());
		});
	}

	/**
	 * The tab stays open on a finished session. Its writes are flushed now (so
	 * the dashboard's counts move), but the session is not ended: undo can still
	 * step back onto the last card, and the next end flushes again.
	 */
	private renderComplete(): void {
		this.releaseCardComponent();
		this.cardEl.empty();
		this.flipBtn.addClass("osmosis-hidden");
		this.ratingBar.addClass("osmosis-hidden");
		this.typeInEl.addClass("osmosis-hidden");
		this.updateHeaderActions();
		this.setTitleScope(null);
		this.plugin.flushStudySession();

		// Update progress to 100%
		this.progressStrip.setProgress(100);
		this.updateCounts();

		this.cardEl.createDiv({ cls: "osmosis-study-complete" }, (el) => {
			el.createEl("h2", { text: "Session complete" });
			el.createEl("p", { text: `You reviewed ${this.reviewed} card${this.reviewed !== 1 ? "s" : ""}.` });
			const buttons = el.createDiv({ cls: "osmosis-study-complete-buttons" });
			const scope = this.studyScope;
			if (scope) this.completeButton(buttons, "Study again", () => this.startSession(scope));
			this.completeButton(buttons, "Close", () => this.leaf.detach());
		});
	}

	private completeButton(container: HTMLElement, text: string, onClick: () => void): void {
		const btn = container.createEl("button", { text, cls: "osmosis-study-close-btn" });
		btn.addEventListener("click", onClick);
	}

	/** True while a card is on screen — not a waiting, empty or complete screen. */
	private get hasCard(): boolean {
		return this.queue[this.currentIndex] !== undefined && !this.isWaiting;
	}

	/** True when the type-in input is focused and should receive keystrokes. */
	private get isTypeInFocused(): boolean {
		return document.activeElement === this.typeInInput;
	}

	/**
	 * A handler that returns without `preventDefault` lets the key through, so
	 * with no card on screen Space and Enter still press a focused button on
	 * an empty or completion screen.
	 */
	private registerKeyboard(scope: Scope): void {
		scope.register([], " ", (e: KeyboardEvent) => {
			if (this.isTypeInFocused || !this.hasCard) return;
			e.preventDefault();
			if (!this.isFlipped) {
				this.flip();
			}
		});

		scope.register([], "Enter", (e: KeyboardEvent) => {
			if (!this.hasCard) return;
			if (!this.isFlipped) {
				e.preventDefault();
				const studyCard = this.queue[this.currentIndex];
				if (studyCard?.card.typeIn) {
					this.checkTypeIn();
				} else {
					this.flip();
				}
			}
		});

		scope.register([], "e", (e: KeyboardEvent) => {
			if (this.isTypeInFocused || !this.hasCard) return;
			e.preventDefault();
			void this.excludeCard();
		});

		scope.register([], "g", (e: KeyboardEvent) => {
			if (this.isTypeInFocused || !this.hasCard) return;
			e.preventDefault();
			this.goToCard();
		});

		scope.register(["Ctrl"], "z", (e: KeyboardEvent) => {
			if (!this.sessionActive || this.undoStack.length === 0) return;
			e.preventDefault();
			void this.undo();
		});

		const ratingKeys: Array<{ key: string; rating: FSRSRating }> = [
			{ key: "1", rating: 1 },
			{ key: "2", rating: 2 },
			{ key: "3", rating: 3 },
			{ key: "4", rating: 4 },
		];

		for (const { key, rating } of ratingKeys) {
			scope.register([], key, (e: KeyboardEvent) => {
				if (this.isTypeInFocused || !this.hasCard) return;
				e.preventDefault();
				if (this.isFlipped) {
					void this.rate(rating);
				}
			});
		}
	}
}

/** Check if a schedule is in a learning/relearning state. */
function isLearningState(schedule: ScheduleData): boolean {
	return schedule.state === "learning" || schedule.state === "relearning";
}

/** Format seconds into a human-readable wait time. */
function formatWaitTime(seconds: number): string {
	if (seconds < 60) return `${seconds}s`;
	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}
