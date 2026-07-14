import type { TFile, Vault } from "obsidian";
import type { Card, ScheduleData } from "../database/types";
import type { CardStore } from "../store/CardStore";
import type { FenceWriter } from "../store/FenceWriter";
import type { CardGenerationOptions } from "./note-processor";
import type { GeneratedCard } from "./types";
import { processNote } from "./note-processor";
import { lineCardId } from "./line-cards";

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
		/**
		 * Resolved line-card schedules for a note, keyed by block ID —
		 * osmosis-schedule frontmatter overlaid with pending unflushed ratings.
		 */
		private readonly getLineSchedules?: (file: TFile) => Map<string, ScheduleData>,
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

			// Line-card schedules from frontmatter (+ pending overlay), parsed once
			const lineSchedules = this.getLineSchedules?.(file);

			for (const genCard of result.cards) {
				generatedIds.add(genCard.id);

				// Preserve existing schedule data if the card already exists in the store
				const existing = this.store.getCard(genCard.id);

				// Line cards read their schedule from osmosis-schedule frontmatter;
				// fence cards carry it in fence metadata (genCard fields).
				const lineSchedule = genCard.blockId !== undefined
					? lineSchedules?.get(genCard.blockId)
					: undefined;

				const card: Card = {
					id: genCard.id,
					notePath: file.path,
					deck: genCard.deck,
					cardType: genCard.card_type,
					front: genCard.front,
					back: genCard.back,
					typeIn: genCard.typeIn,
					sourceLine: genCard.sourceLine,
					blockId: genCard.blockId,
					excludeFromDecks: genCard.excludeFromDecks,
					// Schedule: prefer source-of-truth metadata, fall back to existing store data
					stability: lineSchedule?.stability ?? genCard.stability ?? existing?.stability,
					difficulty: lineSchedule?.difficulty ?? genCard.difficulty ?? existing?.difficulty,
					due: lineSchedule?.due ?? genCard.due ?? existing?.due,
					lastReview: lineSchedule?.lastReview ?? genCard.lastReview ?? existing?.lastReview,
					reps: lineSchedule?.reps ?? genCard.reps ?? existing?.reps,
					lapses: lineSchedule?.lapses ?? genCard.lapses ?? existing?.lapses,
					state: lineSchedule?.state ?? genCard.state ?? existing?.state,
					learningSteps: lineSchedule?.learningSteps ?? genCard.learningSteps ?? existing?.learningSteps,
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
		const modified = injectFenceIdsIntoContent(content, cards);
		if (modified === content) return;

		this.writingPaths.add(file.path);
		try {
			await this.vault.modify(file, modified);
		} finally {
			this.writingPaths.delete(file.path);
		}
	}

	/**
	 * Handle file deletion — remove all cards from that note.
	 */
	handleDelete(path: string): void {
		this.store.removeCardsByNote(path);
	}

	/**
	 * Handle file rename — update notePath for all cards.
	 * Line-card IDs embed the note path, so they are recomputed.
	 */
	handleRename(oldPath: string, newPath: string): void {
		const cards = this.store.getCardsByNote(oldPath);
		for (const card of cards) {
			this.store.removeCard(card.id);
			const id = card.blockId !== undefined ? lineCardId(newPath, card.blockId) : card.id;
			this.store.addCard({ ...card, id, notePath: newPath });
		}
	}

	/**
	 * Remove cards whose notePath doesn't exist in activePaths.
	 */
	private cleanOrphans(activePaths: Set<string>): void {
		for (const card of this.store.getAllCards()) {
			if (!activePaths.has(card.notePath)) {
				this.store.removeCard(card.id);
			}
		}
	}
}

/**
 * Pure function: return the content with `id: xxx` lines inserted into any
 * osmosis fence that lacks one. Derived suffixes (`-r`, `-cN`) are stripped
 * so each fence gets its base id — cloze-only fences whose cards are all
 * derived still receive an id.
 */
export function injectFenceIdsIntoContent(content: string, cards: GeneratedCard[]): string {
	const lines = content.split("\n");
	const fencesNeedingId = new Map<number, string>();

	for (const card of cards) {
		// Line cards live on regular lines, not fences — never inject for them
		if (card.card_type === "line") continue;
		const baseId = card.id.replace(/-(?:r|c\d+)$/, "");
		const fenceLine = card.sourceLine;
		if (fencesNeedingId.has(fenceLine)) continue;
		if (!fenceHasIdMetadata(lines, fenceLine)) {
			fencesNeedingId.set(fenceLine, baseId);
		}
	}

	if (fencesNeedingId.size === 0) return content;

	const sortedLines = [...fencesNeedingId.keys()].sort((a, b) => b - a);
	const modifiedLines = [...lines];
	for (const fenceLine of sortedLines) {
		const id = fencesNeedingId.get(fenceLine)!;
		// If the fence has no blank-line separator between metadata and content,
		// inject one after the id line. Otherwise downstream metadata scanners
		// can't tell where the content begins.
		const nextLine = modifiedLines[fenceLine + 1]?.trim() ?? "";
		const needsBlank = nextLine !== "" && !isRecognizedMetadataLine(nextLine);
		const toInsert = needsBlank ? [`id: ${id}`, ""] : [`id: ${id}`];
		modifiedLines.splice(fenceLine + 1, 0, ...toInsert);
	}

	return modifiedLines.join("\n");
}

const META_KEYS = new Set([
	"id", "exclude", "bidi", "type-in", "deck", "hint",
	"due", "stability", "difficulty", "reps", "lapses",
	"state", "last-review", "learning-steps",
]);

function isRecognizedMetadataLine(line: string): boolean {
	const match = line.trim().match(/^(\w[\w-]*)\s*:\s*.+$/);
	if (!match) return false;
	const key = match[1]!.toLowerCase();
	if (META_KEYS.has(key)) return true;
	const prefixed = key.match(/^(?:r|c\d+)-(.+)$/);
	return prefixed !== null && META_KEYS.has(prefixed[1]!);
}

function fenceHasIdMetadata(lines: string[], fenceLine: number): boolean {
	const openMatch = lines[fenceLine]?.replace(/\s*<!--.*?-->/g, "").trim().match(/^(`{3,})osmosis/);
	const backtickCount = openMatch ? openMatch[1]!.length : 3;

	for (let i = fenceLine + 1; i < lines.length; i++) {
		const line = lines[i]!.trim();
		const closeMatch = line.match(/^(`{3,})\s*$/);
		if (line === "" || (closeMatch && closeMatch[1]!.length >= backtickCount)) break;
		if (/^id\s*:\s*.+$/i.test(line)) return true;
		if (!/^\w[\w-]*\s*:\s*.+$/.test(line)) break;
	}
	return false;
}
