import { Component, Modal, MarkdownRenderer, setIcon, type App } from "obsidian";
import type { StudySessionManager } from "../study/StudySessionManager";
import type { StudyCard, DeckScope } from "../study/types";
import type { FSRSRating } from "../database/FSRSScheduler";
import type { ScheduleData } from "../database/types";
import type { FenceWriter } from "../store/FenceWriter";
import { isCloseMatch } from "../study/match";

/** A card waiting for its learning timer to fire. */
interface DeferredCard {
	studyCard: StudyCard;
	dueAt: number; // epoch ms when the card should reappear
	timer: ReturnType<typeof setTimeout>;
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

/**
 * Anki-style sequential study modal.
 * Shows card front → flip to reveal back → rate (Again/Hard/Good/Easy).
 * Type-in cards show a text input instead of the flip button.
 *
 * Cards in learning/relearning steps reappear after timer-based delays,
 * matching Anki's intra-session behavior.
 */
export class SequentialStudyModal extends Modal {
	private queue: StudyCard[] = [];
	private currentIndex = 0;
	private reviewed = 0;
	private isFlipped = false;
	private readonly renderComponent = new Component();

	/** Cards waiting for their learning timer to fire. */
	private deferredCards: DeferredCard[] = [];
	/** True when the modal is showing the "waiting for next card" screen. */
	private isWaiting = false;

	/** Stack of undoable actions (ratings and excludes). */
	private undoStack: UndoEntry[] = [];

	// DOM elements
	private progressEl!: HTMLElement;
	private progressFill!: HTMLElement;
	private progressText!: HTMLElement;
	private cardEl!: HTMLElement;
	private frontEl!: HTMLElement;
	private backEl!: HTMLElement;
	private flipBtn!: HTMLButtonElement;
	private actionsLeft!: HTMLElement;
	private actionsRight!: HTMLElement;
	private undoBtn!: HTMLButtonElement;
	private ratingBar!: HTMLElement;
	private typeInEl!: HTMLElement;
	private typeInInput!: HTMLInputElement;

	constructor(
		app: App,
		private readonly sessionManager: StudySessionManager,
		private readonly deckScope: DeckScope,
		private readonly studyOptions?: { newLimit?: number; reviewLimit?: number },
		private readonly fenceWriter?: FenceWriter,
		private readonly resolveFile?: (notePath: string) => import("obsidian").TFile | null,
	) {
		super(app);
	}

	onOpen(): void {
		this.renderComponent.load();
		this.queue = this.sessionManager.buildQueue(this.deckScope, this.studyOptions);

		this.modalEl.addClass("osmosis-study-modal");
		this.contentEl.empty();

		if (this.queue.length === 0) {
			this.renderEmpty();
			return;
		}

		this.buildLayout();
		this.renderCard();
		this.registerKeyboard();
	}

	onClose(): void {
		// Clear all pending learning timers
		for (const deferred of this.deferredCards) {
			clearTimeout(deferred.timer);
		}
		this.deferredCards = [];

		this.renderComponent.unload();
		this.contentEl.empty();
	}

	private buildLayout(): void {
		const container = this.contentEl;

		// Progress bar
		this.progressEl = container.createDiv({ cls: "osmosis-study-progress" });
		const bar = this.progressEl.createDiv({ cls: "osmosis-study-progress-bar" });
		this.progressFill = bar.createDiv({ cls: "osmosis-study-progress-fill" });
		this.progressText = this.progressEl.createSpan({ cls: "osmosis-study-progress-text" });

		// Card area
		this.cardEl = container.createDiv({ cls: "osmosis-study-card" });
		this.frontEl = this.cardEl.createDiv({ cls: "osmosis-study-front" });
		this.cardEl.createDiv({ cls: "osmosis-study-divider" });
		this.backEl = this.cardEl.createDiv({ cls: "osmosis-study-back" });

		// Actions
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

		this.ratingBar = actions.createDiv({ cls: "osmosis-study-rating-bar osmosis-hidden" });

		const ratings: Array<{ label: string; rating: FSRSRating; cls: string }> = [
			{ label: "Again", rating: 1, cls: "osmosis-rate-again" },
			{ label: "Hard", rating: 2, cls: "osmosis-rate-hard" },
			{ label: "Good", rating: 3, cls: "osmosis-rate-good" },
			{ label: "Easy", rating: 4, cls: "osmosis-rate-easy" },
		];

		for (const { label, rating, cls } of ratings) {
			const btn = this.ratingBar.createEl("button", { text: label, cls });
			btn.addEventListener("click", () => void this.rate(rating));
		}

		// Bottom-left: undo button
		this.actionsLeft = actions.createDiv({ cls: "osmosis-study-actions-left" });
		this.undoBtn = this.actionsLeft.createEl("button", {
			cls: "osmosis-study-icon-btn osmosis-hidden",
			attr: { "aria-label": "Undo (Ctrl+Z)" },
		});
		setIcon(this.undoBtn, "undo-2");
		this.undoBtn.addEventListener("click", () => void this.undo());

		// Bottom-right icon group: go-to-card and exclude
		this.actionsRight = actions.createDiv({ cls: "osmosis-study-actions-right" });

		const gotoBtn = this.actionsRight.createEl("button", {
			cls: "osmosis-study-icon-btn",
			attr: { "aria-label": "Go to card" },
		});
		setIcon(gotoBtn, "file-text");
		gotoBtn.addEventListener("click", () => this.goToCard());

		const excludeBtn = this.actionsRight.createEl("button", {
			cls: "osmosis-study-icon-btn",
			attr: { "aria-label": "Exclude card (e)" },
		});
		setIcon(excludeBtn, "ban");
		excludeBtn.addEventListener("click", () => void this.excludeCard());
	}

	private renderCard(): void {
		this.isWaiting = false;

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

		// Rebuild card area if it was replaced by waiting/complete screen
		this.rebuildCardArea();

		// Update progress
		this.updateProgress();

		// Render front
		this.frontEl.empty();
		void MarkdownRenderer.render(
			this.app,
			studyCard.card.front,
			this.frontEl,
			studyCard.card.notePath,
			this.renderComponent,
		);

		// Hide back
		this.backEl.empty();
		this.backEl.removeClass("is-revealed");

		// Hide rating
		this.ratingBar.addClass("osmosis-hidden");

		// Show action icons (visible for all cards)
		this.actionsRight.removeClass("osmosis-hidden");

		// Show undo button if there's something to undo
		this.updateUndoButton();

		// Show flip or type-in based on card type
		const isTypeIn = studyCard.card.typeIn;
		if (isTypeIn) {
			this.flipBtn.addClass("osmosis-hidden");
			this.typeInEl.removeClass("osmosis-hidden");
			this.typeInInput.value = "";
			// Focus input after a tick so modal is fully rendered
			setTimeout(() => this.typeInInput.focus(), 50);
		} else {
			this.flipBtn.removeClass("osmosis-hidden");
			this.typeInEl.addClass("osmosis-hidden");
		}
	}

	/**
	 * Rebuild the card area DOM elements if they were destroyed
	 * (e.g., by renderWaiting or renderComplete calling cardEl.empty()).
	 */
	private rebuildCardArea(): void {
		if (this.frontEl.parentElement === this.cardEl) return; // still intact

		this.cardEl.empty();
		this.frontEl = this.cardEl.createDiv({ cls: "osmosis-study-front" });
		this.cardEl.createDiv({ cls: "osmosis-study-divider" });
		this.backEl = this.cardEl.createDiv({ cls: "osmosis-study-back" });
	}

	private updateProgress(): void {
		const remaining = (this.queue.length - this.currentIndex) + this.deferredCards.length;
		const total = this.reviewed + remaining;
		const pct = total > 0 ? ((this.reviewed + 1) / total) * 100 : 0;
		this.progressFill.setCssProps({ "--osmosis-progress-width": `${Math.min(pct, 100)}%` });
		this.progressText.textContent = `${this.reviewed + 1} / ${total}`;
	}

	private flip(): void {
		if (this.isFlipped) return;
		this.isFlipped = true;

		const studyCard = this.queue[this.currentIndex];
		if (!studyCard) return;

		// Render back content
		void MarkdownRenderer.render(
			this.app,
			studyCard.card.back,
			this.backEl,
			studyCard.card.notePath,
			this.renderComponent,
		);
		this.backEl.addClass("is-revealed");

		// Show rating buttons, hide flip
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
		);

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
		this.typeInEl.addClass("osmosis-hidden");
		this.ratingBar.removeClass("osmosis-hidden");

		const suggested: FSRSRating = exact ? 3 : close ? 2 : 1;
		this.highlightSuggestedRating(suggested);
	}

	private highlightSuggestedRating(rating: FSRSRating): void {
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
		if (!studyCard) return;

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

	/** Exclude the current card: write exclude: true to its fence and advance. */
	private async excludeCard(): Promise<void> {
		const studyCard = this.queue[this.currentIndex];
		if (!studyCard || !this.fenceWriter || !this.resolveFile) return;

		const file = this.resolveFile(studyCard.card.notePath);
		if (file) {
			await this.fenceWriter.writeExclude(file, studyCard.card.id, true);
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
		const entry = this.undoStack.pop();
		if (!entry) return;

		if (entry.type === "exclude") {
			// Undo exclude: remove exclude flag and re-insert card
			if (this.fenceWriter && this.resolveFile) {
				const file = this.resolveFile(entry.studyCard.card.notePath);
				if (file) {
					await this.fenceWriter.writeExclude(file, entry.studyCard.card.id, false);
				}
			}
			this.currentIndex--;
			this.queue.splice(this.currentIndex, 0, entry.studyCard);
		} else {
			// Undo rating: revert schedule and re-insert card
			await this.sessionManager.revertReview(
				entry.studyCard.card.id,
				entry.previousSchedule ?? null,
			);

			// Cancel deferred learning card timer if one was created
			if (entry.deferredCard) {
				clearTimeout(entry.deferredCard.timer);
				const idx = this.deferredCards.indexOf(entry.deferredCard);
				if (idx !== -1) this.deferredCards.splice(idx, 1);
			}

			this.reviewed--;
			this.currentIndex--;
			this.queue.splice(this.currentIndex, 0, entry.studyCard);
		}

		this.renderCard();
	}

	/** Show or hide the undo button based on stack state. */
	private updateUndoButton(): void {
		if (this.undoStack.length > 0) {
			this.undoBtn.removeClass("osmosis-hidden");
		} else {
			this.undoBtn.addClass("osmosis-hidden");
		}
	}

	/** Navigate to the current card's source note and close the modal. */
	private goToCard(): void {
		const studyCard = this.queue[this.currentIndex];
		if (!studyCard) return;

		const notePath = studyCard.card.notePath;
		this.close();

		// Open the note and scroll to the card's source line
		const file = this.app.vault.getFileByPath(notePath);
		if (file) {
			void this.app.workspace.getLeaf(false).openFile(file, {
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
			timer: setTimeout(() => this.onLearningTimerFired(deferred), delayMs),
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

		this.cardEl.empty();
		this.flipBtn.addClass("osmosis-hidden");
		this.ratingBar.addClass("osmosis-hidden");
		this.typeInEl.addClass("osmosis-hidden");
		this.actionsRight.addClass("osmosis-hidden");
		this.updateUndoButton();

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

			// Update countdown every second
			const countdownInterval = setInterval(() => {
				if (!this.isWaiting) {
					clearInterval(countdownInterval);
					return;
				}
				const remaining = Math.max(0, Math.ceil((soonest.dueAt - Date.now()) / 1000));
				countdownEl.textContent = `Next card in ${formatWaitTime(remaining)}`;
				if (remaining <= 0) {
					clearInterval(countdownInterval);
				}
			}, 1000);
		});
	}

	private renderEmpty(): void {
		const container = this.contentEl;
		container.createDiv({ cls: "osmosis-study-complete" }, (el) => {
			el.createEl("h2", { text: "No cards due" });
			el.createEl("p", { text: "All caught up! Check back later." });
			const btn = el.createEl("button", { text: "Close", cls: "osmosis-study-close-btn" });
			btn.addEventListener("click", () => this.close());
		});
	}

	private renderComplete(): void {
		this.cardEl.empty();
		this.flipBtn.addClass("osmosis-hidden");
		this.ratingBar.addClass("osmosis-hidden");
		this.typeInEl.addClass("osmosis-hidden");
		this.actionsRight.addClass("osmosis-hidden");
		this.updateUndoButton();

		// Update progress to 100%
		this.progressFill.setCssProps({ "--osmosis-progress-width": "100%" });
		this.progressText.textContent = `${this.reviewed} reviewed`;

		this.cardEl.createDiv({ cls: "osmosis-study-complete" }, (el) => {
			el.createEl("h2", { text: "Session complete" });
			el.createEl("p", { text: `You reviewed ${this.reviewed} card${this.reviewed !== 1 ? "s" : ""}.` });
			const btn = el.createEl("button", { text: "Close", cls: "osmosis-study-close-btn" });
			btn.addEventListener("click", () => this.close());
		});
	}

	/** True when the type-in input is focused and should receive keystrokes. */
	private get isTypeInFocused(): boolean {
		return document.activeElement === this.typeInInput;
	}

	private registerKeyboard(): void {
		this.scope.register([], " ", (e: KeyboardEvent) => {
			if (this.isTypeInFocused) return;
			e.preventDefault();
			if (!this.isFlipped) {
				this.flip();
			}
		});

		this.scope.register([], "Enter", (e: KeyboardEvent) => {
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

		this.scope.register([], "e", (e: KeyboardEvent) => {
			if (this.isTypeInFocused) return;
			e.preventDefault();
			void this.excludeCard();
		});

		this.scope.register([], "g", (e: KeyboardEvent) => {
			if (this.isTypeInFocused) return;
			e.preventDefault();
			this.goToCard();
		});

		this.scope.register(["Ctrl"], "z", (e: KeyboardEvent) => {
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
			this.scope.register([], key, (e: KeyboardEvent) => {
				if (this.isTypeInFocused) return;
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
