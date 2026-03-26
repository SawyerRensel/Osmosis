import { Component, MarkdownRenderer, setIcon } from "obsidian";
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

	/** Track cards whose answers have been revealed this session to survive re-renders. */
	private readonly revealedCardIds = new Set<string>();
	/** Track cards that have been rated this session to hide rating buttons on re-render. */
	private readonly ratedCardIds = new Set<string>();

	constructor(private readonly plugin: OsmosisPlugin) {}

	/**
	 * Register the code block processor with the plugin.
	 */
	register(): void {
		this.renderComponent.load();

		this.plugin.registerMarkdownCodeBlockProcessor(
			"osmosis",
			(source: string, el: HTMLElement, ctx) => {
				// Defer so the element is attached to the DOM before we check context
				setTimeout(() => {
					const inReadingView = el.closest(".markdown-reading-view") !== null;
					const inLivePreview = el.closest(".is-live-preview") !== null;

					if (inReadingView) {
						// Reading view: interactive card with hidden answer
						this.renderCard(source, el, ctx.sourcePath);
					} else if (inLivePreview) {
						// Live preview: render both front and back (no hiding)
						this.renderPreviewCard(source, el, ctx.sourcePath);
					}
					// Source mode: Obsidian handles raw display, nothing to do
				}, 0);
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

		if (parsed.exclude) {
			container.addClass("osmosis-contextual-excluded");
		}

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

		// Bottom row: rating area (left) + exclude toggle (right)
		const bottomRow = container.createDiv({ cls: "osmosis-contextual-bottom" });
		const ratingSlot = bottomRow.createDiv({ cls: "osmosis-contextual-rating-slot" });
		const toggleIcon = bottomRow.createDiv({ cls: "osmosis-contextual-exclude-toggle" });
		setIcon(toggleIcon, parsed.exclude ? "circle-off" : "circle-check-big");
		toggleIcon.setAttribute("aria-label", parsed.exclude ? "Include this card" : "Exclude this card");
		toggleIcon.addEventListener("click", (e) => {
			e.stopPropagation();
			void this.toggleExclude(parsed.cardId, !parsed.exclude, sourcePath);
		});

		const alreadyRevealed = this.revealedCardIds.has(parsed.cardId);
		const alreadyRated = this.ratedCardIds.has(parsed.cardId);
		let revealed = alreadyRevealed;

		const reveal = (): void => {
			if (revealed) return;
			revealed = true;
			this.revealedCardIds.add(parsed.cardId);
			hiddenEl.addClass("osmosis-hidden");
			revealedEl.removeClass("osmosis-hidden");
			void MarkdownRenderer.render(
				this.plugin.app,
				parsed.back,
				revealedEl,
				sourcePath,
				this.renderComponent,
			);

			if (parsed.cardId && !alreadyRated) {
				this.showRating(ratingSlot, parsed.cardId);
			}
		};

		// Auto-reveal if this card was previously revealed this session
		if (alreadyRevealed) {
			hiddenEl.addClass("osmosis-hidden");
			revealedEl.removeClass("osmosis-hidden");
			void MarkdownRenderer.render(
				this.plugin.app,
				parsed.back,
				revealedEl,
				sourcePath,
				this.renderComponent,
			);
			if (alreadyRated) {
				ratingSlot.createSpan({ text: "Rated", cls: "osmosis-contextual-rated" });
			} else if (parsed.cardId) {
				this.showRating(ratingSlot, parsed.cardId);
			}
		}

		hiddenEl.addEventListener("click", reveal);
		container.addEventListener("click", (e) => {
			if (!revealed && e.target === container) {
				reveal();
			}
		});
	}

	/** Live preview: render front and back fully visible (no interactivity). */
	private renderPreviewCard(source: string, el: HTMLElement, sourcePath: string): void {
		const parsed = this.parseFenceContent(source);
		if (!parsed) {
			el.createEl("pre", { text: source });
			return;
		}

		const container = el.createDiv({ cls: "osmosis-contextual-card" });

		if (parsed.exclude) {
			container.addClass("osmosis-contextual-excluded");
		}

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

		// Render back (fully visible, no hiding)
		const backEl = container.createDiv({ cls: "osmosis-contextual-revealed" });
		void MarkdownRenderer.render(
			this.plugin.app,
			parsed.back,
			backEl,
			sourcePath,
			this.renderComponent,
		);

		// Bottom row with exclude toggle (bottom-right)
		const bottomRow = container.createDiv({ cls: "osmosis-contextual-bottom" });
		bottomRow.createDiv(); // spacer
		const toggleIcon = bottomRow.createDiv({ cls: "osmosis-contextual-exclude-toggle" });
		setIcon(toggleIcon, parsed.exclude ? "circle-off" : "circle-check-big");
		toggleIcon.setAttribute("aria-label", parsed.exclude ? "Include this card" : "Exclude this card");
		toggleIcon.addEventListener("click", (e) => {
			e.stopPropagation();
			void this.toggleExclude(parsed.cardId, !parsed.exclude, sourcePath);
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
				this.ratedCardIds.add(cardId);
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

	/** Toggle exclude flag on a fence. File modification triggers Obsidian re-render. */
	private async toggleExclude(cardId: string, exclude: boolean, sourcePath: string): Promise<void> {
		const file = this.plugin.app.vault.getFileByPath(sourcePath);
		if (!file) return;
		await this.plugin.fenceWriter.writeExclude(file, cardId, exclude);
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
	private parseFenceContent(source: string): { front: string; back: string; cardId: string; exclude: boolean } | null {
		const lines = source.split("\n");

		// Parse metadata lines (key: value before blank line)
		let contentStart = 0;
		let exclude = false;
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]!.trim();
			if (line === "") {
				contentStart = i + 1;
				break;
			}
			if (/^\w[\w-]*\s*:\s*.+$/.test(line)) {
				const excludeMatch = line.match(/^exclude\s*:\s*(.+)$/i);
				if (excludeMatch) exclude = excludeMatch[1]!.trim() === "true";
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
			return { front, back, cardId, exclude };
		}

		// No separator — check for code cloze markers first, then text cloze
		const content = contentLines.join("\n").trim();
		if (!content) return null;

		// Check for code cloze (osmosis-cloze inside inner code fences)
		if (content.includes("osmosis-cloze")) {
			const { front, back } = ContextualStudyProcessor.buildCodeClozeFrontBack(contentLines);
			const cardId = this.extractIdFromSource(source) ?? this.hashContent(`code-cloze|||${content}`);
			return { front, back, cardId, exclude };
		}

		const clozeMatches = [...content.matchAll(ContextualStudyProcessor.CLOZE_REGEX)];
		if (clozeMatches.length === 0) return null;

		// Front: all clozes replaced with ########; Back: full text with markers
		const front = content.replace(ContextualStudyProcessor.CLOZE_REGEX, "########");
		const cardId = this.extractIdFromSource(source) ?? this.hashContent(`cloze|||${content}`);
		return { front, back: content, cardId, exclude };
	}

	/**
	 * Build front/back for code cloze in contextual mode.
	 * Front: all cloze regions blanked. Back: all markers stripped.
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
					frontLines.push(`${indent}########`);
					multiFirstSeen = true;
				}
				backLines.push(line);
			} else if (line.includes("osmosis-cloze")) {
				// Single-line cloze
				const indent = line.match(/^(\s*)/)?.[1] ?? "";
				frontLines.push(`${indent}########`);
				backLines.push(line.replace(MARKER_COMMENT, ""));
			} else {
				frontLines.push(line);
				backLines.push(line);
			}
		}

		return { front: frontLines.join("\n"), back: backLines.join("\n") };
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
