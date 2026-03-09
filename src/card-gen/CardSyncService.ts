import type { TFile, Vault } from "obsidian";
import type { CardDatabase } from "../database/CardDatabase";
import type { CardRow } from "../database/types";
import type { CardGenerationOptions } from "./note-processor";
import type { GeneratedCard } from "./types";
import { processNote } from "./note-processor";

/**
 * Syncs generated cards from vault notes into the card database.
 *
 * Responsibilities:
 * - Full vault scan on startup
 * - Incremental sync on file change/rename/delete
 * - Orphan detection (soft-delete cards whose source was removed)
 * - Write id: metadata back into fences that lack one
 */
export class CardSyncService {
	/** Paths currently being written to — skip re-sync for these. */
	private writingPaths = new Set<string>();

	constructor(
		private readonly vault: Vault,
		private readonly db: CardDatabase,
		private readonly getOptions: () => CardGenerationOptions,
		private readonly getFileTags?: (file: TFile) => string[],
	) {}

	/**
	 * Scan all markdown files and sync cards to the database.
	 */
	async syncAll(): Promise<void> {
		await this.db.ensureInitialized();

		const files = this.vault.getMarkdownFiles();
		const activePaths = new Set<string>();

		for (const file of files) {
			activePaths.add(file.path);
			await this.syncFile(file);
		}

		// Soft-delete cards from notes that no longer exist
		this.cleanOrphans(activePaths);

		// Persist DB so card data matches the now-stable IDs on disk
		await this.db.save();
	}

	/**
	 * Sync a single file's cards to the database.
	 */
	async syncFile(file: TFile): Promise<void> {
		// Skip re-sync if we're currently writing IDs back to this file
		if (this.writingPaths.has(file.path)) return;

		await this.db.ensureInitialized();

		const content = await this.vault.cachedRead(file);
		const tags = this.getFileTags?.(file);
		const result = processNote(content, file.path, this.getOptions(), tags);

		const existingCards = this.db.getCardsByNote(file.path);
		const existingIds = new Set(existingCards.map((c) => c.id));
		const generatedIds = new Set<string>();

		if (result.enabled) {
			// Write id: metadata back into fences that lack one
			await this.injectFenceIds(file, content, result.cards);

			const now = Date.now();

			for (const card of result.cards) {
				generatedIds.add(card.id);

				const row: CardRow = {
					id: card.id,
					note_path: file.path,
					deck: card.deck,
					card_type: card.card_type,
					front: card.front,
					back: card.back,
					created_at: existingIds.has(card.id) ? (existingCards.find((c) => c.id === card.id)?.created_at ?? now) : now,
					updated_at: now,
					deleted_at: null,
					type_in: card.typeIn ? 1 : 0,
				};

				this.db.upsertCard(row);
			}
		}

		// Soft-delete cards that no longer exist in the note
		for (const existing of existingCards) {
			if (!generatedIds.has(existing.id)) {
				this.db.softDeleteCard(existing.id);
			}
		}
	}

	/**
	 * Write `id: xxx` metadata into osmosis fences that don't already have one.
	 *
	 * For each card whose fence lacks an `id:` line, inserts `id: {cardId}`
	 * as the first metadata line after the fence opening.
	 */
	private async injectFenceIds(file: TFile, content: string, cards: GeneratedCard[]): Promise<void> {
		const lines = content.split("\n");

		// Find fences that need id: injection
		// A card needs injection if its sourceLine points to a fence that has no id: metadata
		const fencesNeedingId = new Map<number, string>(); // sourceLine → id

		for (const card of cards) {
			// Skip derived IDs (cloze -c1, bidi -r) — only inject the base fence ID
			if (card.id.includes("-")) continue;

			const fenceLine = card.sourceLine;
			if (fencesNeedingId.has(fenceLine)) continue;

			// Check if this fence already has an id: metadata line
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
			// Insert id: line right after the fence opening line
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
		// Scan lines after the fence opening for metadata
		for (let i = fenceLine + 1; i < lines.length; i++) {
			const line = lines[i]!.trim();
			if (line === "" || line === "```") break;
			if (/^id\s*:\s*.+$/i.test(line)) return true;
			// If line doesn't match metadata pattern, it's content — stop
			if (!/^\w[\w-]*\s*:\s*.+$/.test(line)) break;
		}
		return false;
	}

	/**
	 * Handle file deletion — soft-delete all cards from that note.
	 */
	handleDelete(path: string): void {
		const cards = this.db.getCardsByNote(path);
		for (const card of cards) {
			this.db.softDeleteCard(card.id);
		}
	}

	/**
	 * Handle file rename — update note_path for all cards.
	 */
	handleRename(oldPath: string, newPath: string): void {
		const cards = this.db.getCardsByNote(oldPath);
		const now = Date.now();
		for (const card of cards) {
			this.db.upsertCard({ ...card, note_path: newPath, updated_at: now });
		}
	}

	/**
	 * Soft-delete cards whose note_path doesn't exist in activePaths.
	 */
	private cleanOrphans(activePaths: Set<string>): void {
		const allDecks = this.db.getAllDecks();
		for (const deck of allDecks) {
			const cards = this.db.getCardsByDeck(deck);
			for (const card of cards) {
				if (!activePaths.has(card.note_path)) {
					this.db.softDeleteCard(card.id);
				}
			}
		}
	}
}
