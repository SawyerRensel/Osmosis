import type { TFile, Vault } from "obsidian";
import type { CardDatabase } from "../database/CardDatabase";
import type { CardRow } from "../database/types";
import type { CardGenerationOptions } from "./note-processor";
import { processNote } from "./note-processor";

/**
 * Syncs generated cards from vault notes into the card database.
 *
 * Responsibilities:
 * - Full vault scan on startup
 * - Incremental sync on file change/rename/delete
 * - Orphan detection (soft-delete cards whose source was removed)
 */
export class CardSyncService {
	constructor(
		private readonly vault: Vault,
		private readonly db: CardDatabase,
		private readonly getOptions: () => CardGenerationOptions,
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
	}

	/**
	 * Sync a single file's cards to the database.
	 */
	async syncFile(file: TFile): Promise<void> {
		await this.db.ensureInitialized();

		const content = await this.vault.cachedRead(file);
		const result = processNote(content, file.path, this.getOptions());

		const existingCards = this.db.getCardsByNote(file.path);
		const existingIds = new Set(existingCards.map((c) => c.id));
		const generatedIds = new Set<string>();

		if (result.enabled) {
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
		// Query all cards and check paths — simple approach for now
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
