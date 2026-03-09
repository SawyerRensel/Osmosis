import type { TFile, Vault } from "obsidian";
import type { CardDatabase } from "../database/CardDatabase";
import type { CardRow } from "../database/types";
import type { CardGenerationOptions } from "./note-processor";
import type { GeneratedCard } from "./types";
import { processNote } from "./note-processor";
import { extractCardIds, formatCardIdComment } from "../card-id";

/**
 * Syncs generated cards from vault notes into the card database.
 *
 * Responsibilities:
 * - Full vault scan on startup
 * - Incremental sync on file change/rename/delete
 * - Orphan detection (soft-delete cards whose source was removed)
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
			// Write osmosis-id comments back into the source file
			await this.injectCardIds(file, content, result.cards);

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
	 * Inject <!--osmosis-id:xxx--> comments into the source file for any
	 * cards that don't already have one. This makes IDs stable across restarts
	 * so that schedule data (card_schedule rows) persists.
	 */
	private async injectCardIds(file: TFile, content: string, cards: GeneratedCard[]): Promise<void> {
		// Determine which IDs already exist in the file
		const existing = extractCardIds(content);
		const existingIdSet = new Set(existing.map((e) => e.id));

		// Filter to cards that need IDs injected
		const needsId = cards.filter((c) => !existingIdSet.has(c.id));
		if (needsId.length === 0) return;

		// Group by sourceLine, preserving card order within each line
		const byLine = new Map<number, GeneratedCard[]>();
		for (const card of needsId) {
			const line = card.sourceLine;
			const arr = byLine.get(line) ?? [];
			arr.push(card);
			byLine.set(line, arr);
		}

		// Build line-number → char-offset lookup
		const lines = content.split("\n");
		const lineOffsets: number[] = [];
		let offset = 0;
		for (let i = 0; i < lines.length; i++) {
			lineOffsets.push(offset);
			offset += lines[i]!.length + 1; // +1 for newline
		}

		// Process lines from bottom-up so earlier insertions don't shift offsets
		const sortedLines = [...byLine.keys()].sort((a, b) => b - a);

		let modified = content;
		for (const lineNum of sortedLines) {
			const cardsOnLine = byLine.get(lineNum)!;
			// Build the combined ID comment string for all cards on this line
			const idComments = cardsOnLine
				.map((c) => ` ${formatCardIdComment(c.id)}`)
				.join("");

			// Find the end of this line in the current (possibly already modified) content
			const lineEnd = findLineEnd(modified, lineNum);
			modified = modified.slice(0, lineEnd) + idComments + modified.slice(lineEnd);
		}

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

/** Find the character offset of the end of a given line (before its newline). */
function findLineEnd(content: string, lineNum: number): number {
	let line = 0;
	let i = 0;
	while (line < lineNum && i < content.length) {
		if (content[i] === "\n") line++;
		i++;
	}
	// Now at the start of the target line — find its end
	const newlinePos = content.indexOf("\n", i);
	return newlinePos === -1 ? content.length : newlinePos;
}
