import { Component, MarkdownRenderer } from "obsidian";
import type OsmosisPlugin from "../main";
import { FSRSScheduler } from "../database/FSRSScheduler";
import { StudySessionManager } from "../study/StudySessionManager";
import type { FSRSRating } from "../database/FSRSScheduler";

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

	constructor(private readonly plugin: OsmosisPlugin) {}

	/**
	 * Register the code block processor with the plugin.
	 */
	register(): void {
		this.renderComponent.load();

		this.plugin.registerMarkdownCodeBlockProcessor(
			"osmosis",
			(source: string, el: HTMLElement, ctx) => {
				this.renderCard(source, el, ctx.sourcePath);
			},
		);
	}

	private renderCard(source: string, el: HTMLElement, sourcePath: string): void {
		const parsed = this.parseFenceContent(source);
		if (!parsed) {
			el.createEl("pre", { text: source });
			return;
		}

		this.totalCards++;
		const container = el.createDiv({ cls: "osmosis-contextual-card" });

		// Render front
		const frontEl = container.createDiv({ cls: "osmosis-contextual-front" });
		void MarkdownRenderer.render(
			this.plugin.app,
			parsed.front,
			frontEl,
			sourcePath,
			this.renderComponent,
		);

		// Separator
		container.createDiv({ cls: "osmosis-study-divider" });

		// Back: hidden placeholder + revealed content
		const backEl = container.createDiv();
		const hiddenEl = backEl.createDiv({
			cls: "osmosis-contextual-hidden",
			text: "░░░░░░",
		});
		const revealedEl = backEl.createDiv({ cls: "osmosis-contextual-revealed osmosis-hidden" });

		let revealed = false;
		const reveal = (): void => {
			if (revealed) return;
			revealed = true;
			hiddenEl.addClass("osmosis-hidden");
			revealedEl.removeClass("osmosis-hidden");
			void MarkdownRenderer.render(
				this.plugin.app,
				parsed.back,
				revealedEl,
				sourcePath,
				this.renderComponent,
			);

			if (this.studyActive && parsed.cardId) {
				this.showRating(container, parsed.cardId);
			}
		};

		hiddenEl.addEventListener("click", reveal);
		container.addEventListener("click", (e) => {
			if (!revealed && e.target === container) {
				reveal();
			}
		});
	}

	private showRating(container: HTMLElement, cardId: string): void {
		const ratingEl = container.createDiv({ cls: "osmosis-contextual-rating" });

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
				this.recordRating(cardId, rating);
				ratingEl.empty();
				ratingEl.createSpan({ text: `Rated: ${label}`, cls: "osmosis-contextual-rated" });
				this.reviewedCount++;
				this.updateProgress();
			});
		}
	}

	private recordRating(cardId: string, rating: FSRSRating): void {
		if (!this.sessionManager) {
			this.sessionManager = new StudySessionManager(
				this.plugin.cardDb,
				new FSRSScheduler(),
			);
		}
		this.sessionManager.recordReview(cardId, rating, "contextual");
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
	 * Parse fence content into front/back/metadata.
	 * Reuses the same format as explicit.ts card generators.
	 */
	private parseFenceContent(source: string): { front: string; back: string; cardId: string } | null {
		const lines = source.split("\n");

		// Skip metadata lines (key: value before blank line)
		let contentStart = 0;
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]!.trim();
			if (line === "") {
				contentStart = i + 1;
				break;
			}
			if (/^\w[\w-]*\s*:\s*.+$/.test(line)) {
				contentStart = i + 1;
				continue;
			}
			contentStart = i;
			break;
		}

		const contentLines = lines.slice(contentStart);
		const separatorIdx = contentLines.findIndex((l) => l.trim() === "***");
		if (separatorIdx === -1) return null;

		const front = contentLines.slice(0, separatorIdx).join("\n").trim();
		const back = contentLines.slice(separatorIdx + 1).join("\n").trim();

		if (!front && !back) return null;

		const cardId = this.hashContent(`${front}|||${back}`);
		return { front, back, cardId };
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
