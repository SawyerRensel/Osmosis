import type { TFile, Vault } from "obsidian";
import type { Card } from "../database/types";
import type { CardStore } from "../store/CardStore";
import type { FenceWriter } from "../store/FenceWriter";
import type { CardGenerationOptions } from "./note-processor";
import type { GeneratedCard } from "./types";
import { processNote } from "./note-processor";

/**
 * Syncs generated cards from vault notes into the in-memory CardStore.
 *
 * Responsibilities:
 * - Full vault scan on startup
 * - Incremental sync on file change/rename/delete
 * - Write id: metadata back into fences that lack one
 */
export class CardSyncService {
	/** Paths currently being written to — skip re-sync for these. */
	private writingPaths = new Set<string>();

	constructor(
		private readonly vault: Vault,
		private readonly store: CardStore,
		private readonly fenceWriter: FenceWriter,
		private readonly getOptions: () => CardGenerationOptions,
		private readonly getFileTags?: (file: TFile) => string[],
	) {}

	/**
	 * Scan all markdown files and sync cards to the store.
	 */
	async syncAll(): Promise<void> {
		const files = this.vault.getMarkdownFiles();
		const activePaths = new Set<string>();

		for (const file of files) {
			activePaths.add(file.path);
			await this.syncFile(file);
		}

		// Remove cards from notes that no longer exist
		this.cleanOrphans(activePaths);
	}

	/**
	 * Sync a single file's cards to the store.
	 */
	async syncFile(file: TFile): Promise<void> {
		// Skip re-sync if we're currently writing IDs or schedule data
		if (this.writingPaths.has(file.path)) return;
		if (this.fenceWriter.isWriting(file.path)) return;

		const content = await this.vault.cachedRead(file);
		const tags = this.getFileTags?.(file);
		const result = processNote(content, file.path, this.getOptions(), tags);

		const existingCards = this.store.getCardsByNote(file.path);
		const generatedIds = new Set<string>();

		if (result.enabled) {
			// Write id: metadata back into fences that lack one
			await this.injectFenceIds(file, content, result.cards);

			for (const genCard of result.cards) {
				generatedIds.add(genCard.id);

				// Preserve existing schedule data if the card already exists in the store
				const existing = this.store.getCard(genCard.id);

				const card: Card = {
					id: genCard.id,
					notePath: file.path,
					deck: genCard.deck,
					cardType: genCard.card_type,
					front: genCard.front,
					back: genCard.back,
					typeIn: genCard.typeIn,
					sourceLine: genCard.sourceLine,
					// Schedule: prefer fence metadata, fall back to existing store data
					stability: genCard.stability ?? existing?.stability,
					difficulty: genCard.difficulty ?? existing?.difficulty,
					due: genCard.due ?? existing?.due,
					lastReview: genCard.lastReview ?? existing?.lastReview,
					reps: genCard.reps ?? existing?.reps,
					lapses: genCard.lapses ?? existing?.lapses,
					state: genCard.state ?? existing?.state,
				};

				this.store.addCard(card);
			}
		}

		// Remove cards that no longer exist in the note
		for (const existing of existingCards) {
			if (!generatedIds.has(existing.id)) {
				this.store.removeCard(existing.id);
			}
		}
	}

	/**
	 * Write `id: xxx` metadata into osmosis fences that don't already have one.
	 */
	private async injectFenceIds(file: TFile, content: string, cards: GeneratedCard[]): Promise<void> {
		const lines = content.split("\n");

		const fencesNeedingId = new Map<number, string>();

		for (const card of cards) {
			// Skip derived IDs (cloze -c1, bidi -r) — only inject the base fence ID
			if (card.id.includes("-")) continue;

			const fenceLine = card.sourceLine;
			if (fencesNeedingId.has(fenceLine)) continue;

			if (!this.fenceHasIdMetadata(lines, fenceLine)) {
				fencesNeedingId.set(fenceLine, card.id);
			}
		}

		if (fencesNeedingId.size === 0) return;

		// Process from bottom-up to avoid offset shifts
		const sortedLines = [...fencesNeedingId.keys()].sort((a, b) => b - a);

		const modifiedLines = [...lines];
		for (const fenceLine of sortedLines) {
			const id = fencesNeedingId.get(fenceLine)!;
			modifiedLines.splice(fenceLine + 1, 0, `id: ${id}`);
		}

		const modified = modifiedLines.join("\n");
		if (modified !== content) {
			this.writingPaths.add(file.path);
			try {
				await this.vault.modify(file, modified);
			} finally {
				this.writingPaths.delete(file.path);
			}
		}
	}

	/**
	 * Check if a fence starting at the given line already has an `id:` metadata line.
	 */
	private fenceHasIdMetadata(lines: string[], fenceLine: number): boolean {
		for (let i = fenceLine + 1; i < lines.length; i++) {
			const line = lines[i]!.trim();
			if (line === "" || line === "```") break;
			if (/^id\s*:\s*.+$/i.test(line)) return true;
			if (!/^\w[\w-]*\s*:\s*.+$/.test(line)) break;
		}
		return false;
	}

	/**
	 * Handle file deletion — remove all cards from that note.
	 */
	handleDelete(path: string): void {
		this.store.removeCardsByNote(path);
	}

	/**
	 * Handle file rename — update notePath for all cards.
	 */
	handleRename(oldPath: string, newPath: string): void {
		const cards = this.store.getCardsByNote(oldPath);
		for (const card of cards) {
			this.store.removeCard(card.id);
			this.store.addCard({ ...card, notePath: newPath });
		}
	}

	/**
	 * Remove cards whose notePath doesn't exist in activePaths.
	 */
	private cleanOrphans(activePaths: Set<string>): void {
		const allDecks = this.store.getAllDecks();
		for (const deck of allDecks) {
			const cards = this.store.getDueCards(Infinity, deck);
			const newCards = this.store.getNewCards(deck);
			for (const card of [...cards, ...newCards]) {
				if (!activePaths.has(card.notePath)) {
					this.store.removeCard(card.id);
				}
			}
		}
	}
}
