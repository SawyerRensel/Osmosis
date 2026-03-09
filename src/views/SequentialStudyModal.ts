import { Component, Modal, MarkdownRenderer, type App } from "obsidian";
import type { StudySessionManager } from "../study/StudySessionManager";
import type { StudyCard, DeckScope } from "../study/types";
import type { FSRSRating } from "../database/FSRSScheduler";
import { isCloseMatch } from "../study/match";

/**
 * Anki-style sequential study modal.
 * Shows card front → flip to reveal back → rate (Again/Hard/Good/Easy).
 * Type-in cards show a text input instead of the flip button.
 */
export class SequentialStudyModal extends Modal {
	private queue: StudyCard[] = [];
	private currentIndex = 0;
	private reviewed = 0;
	private isFlipped = false;
	private readonly renderComponent = new Component();

	// DOM elements
	private progressEl!: HTMLElement;
	private progressFill!: HTMLElement;
	private progressText!: HTMLElement;
	private cardEl!: HTMLElement;
	private frontEl!: HTMLElement;
	private backEl!: HTMLElement;
	private flipBtn!: HTMLButtonElement;
	private ratingBar!: HTMLElement;
	private typeInEl!: HTMLElement;
	private typeInInput!: HTMLInputElement;

	constructor(
		app: App,
		private readonly sessionManager: StudySessionManager,
		private readonly deckScope: DeckScope,
		private readonly studyOptions?: { newLimit?: number; reviewLimit?: number },
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
			btn.addEventListener("click", () => this.rate(rating));
		}
	}

	private renderCard(): void {
		const studyCard = this.queue[this.currentIndex];
		if (!studyCard) {
			this.renderComplete();
			return;
		}

		this.isFlipped = false;

		// Update progress
		const total = this.queue.length;
		const pct = total > 0 ? ((this.currentIndex) / total) * 100 : 0;
		this.progressFill.setCssProps({ "--osmosis-progress-width": `${pct}%` });
		this.progressText.textContent = `${this.currentIndex + 1} / ${total}`;

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

	private rate(rating: FSRSRating): void {
		const studyCard = this.queue[this.currentIndex];
		if (!studyCard) return;

		void this.sessionManager.recordReview(studyCard.card.id, rating);
		this.reviewed++;
		this.currentIndex++;

		this.renderCard();
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

		// Update progress to 100%
		this.progressText.textContent = `${this.reviewed} / ${this.queue.length}`;

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
					this.rate(rating);
				}
			});
		}
	}
}
