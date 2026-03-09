import { Component, MarkdownRenderer } from "obsidian";
import type OsmosisPlugin from "../main";
import type { FSRSRating } from "../database/FSRSScheduler";
import type { StudySessionManager } from "../study/StudySessionManager";

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

			if (parsed.cardId) {
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
				ratingEl.empty();
				ratingEl.createSpan({ text: `Rated: ${label}`, cls: "osmosis-contextual-rated" });
				this.reviewedCount++;
				this.updateProgress();
				void this.recordRating(cardId, rating);
			});
		}
	}

	private async recordRating(cardId: string, rating: FSRSRating): Promise<void> {
		// Ensure the card exists in the store (contextual cards use hash-based IDs)
		if (!this.plugin.cardStore.getCard(cardId)) {
			// Card not in store — skip rating (card was generated inline, not from sync)
			return;
		}

		if (!this.sessionManager) {
			this.sessionManager = this.plugin.createSessionManager();
		}
		await this.sessionManager.recordReview(cardId, rating);
		this.plugin.refreshDashboard();
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

	/** Match ==term== or **term** cloze deletions. */
	private static readonly CLOZE_REGEX = /==([^=]+)==|\*\*([^*]+)\*\*/g;

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

		if (separatorIdx >= 0) {
			const front = contentLines.slice(0, separatorIdx).join("\n").trim();
			const back = contentLines.slice(separatorIdx + 1).join("\n").trim();
			if (!front && !back) return null;
			const cardId = this.extractIdFromSource(source) ?? this.hashContent(`${front}|||${back}`);
			return { front, back, cardId };
		}

		// No separator — check for cloze deletions (==term== or **term**)
		const content = contentLines.join("\n").trim();
		if (!content) return null;

		const clozeMatches = [...content.matchAll(ContextualStudyProcessor.CLOZE_REGEX)];
		if (clozeMatches.length === 0) return null;

		// Front: all clozes replaced with [...]; Back: full text with markers
		const front = content.replace(ContextualStudyProcessor.CLOZE_REGEX, "[...]");
		const cardId = this.extractIdFromSource(source) ?? this.hashContent(`cloze|||${content}`);
		return { front, back: content, cardId };
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
