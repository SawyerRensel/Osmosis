import { describe, it, expect, beforeEach } from "vitest";
import { CardDatabase } from "../database/CardDatabase";
import { FSRSScheduler } from "../database/FSRSScheduler";
import { processNote } from "./note-processor";
import { detectOrphanedCards, detectRestoredCards, applySessionQuotas } from "./orphans";
import type { CardGenerationOptions } from "./note-processor";
import type { CardRow } from "../database/types";

/**
 * Integration tests for the full SR pipeline:
 * markdown → card generation → database → FSRS scheduling → review
 */

const defaultOptions: CardGenerationOptions = {
	headingAutoGenerate: true,
	clozeBoldEnabled: true,
	headingClozeConflict: "cloze_only",
};

// Use in-memory DB with a mock adapter
const mockAdapter = {
	exists: async () => false,
	readBinary: async () => new ArrayBuffer(0),
	writeBinary: async () => {},
	mkdir: async () => {},
} as never;

describe("SR Integration", () => {
	let db: CardDatabase;
	let scheduler: FSRSScheduler;

	beforeEach(async () => {
		db = new CardDatabase("test.db", mockAdapter);
		await db.ensureInitialized();
		scheduler = new FSRSScheduler();
	});

	describe("end-to-end: generate → store → schedule → review", () => {
		it("processes a note, stores cards, schedules, and reviews", async () => {
			const md = [
				"---",
				"osmosis: true",
				"osmosis-deck: biology",
				"---",
				"## Cell Structure",
				"Cells are the basic unit of life.",
				"",
				"The ==mitochondria== is the powerhouse of the cell.",
			].join("\n");

			// 1. Generate cards
			const result = processNote(md, "biology/cells.md", defaultOptions);
			expect(result.enabled).toBe(true);
			// cloze_only default: heading dropped because body has cloze
			const clozeCards = result.cards.filter(
				(c) => c.card_type === "cloze_highlight",
			);
			expect(clozeCards.length).toBeGreaterThan(0);

			// 2. Store cards in DB
			const now = Date.now();
			for (const card of result.cards) {
				const cardRow: CardRow = {
					id: card.id,
					note_path: "biology/cells.md",
					deck: card.deck,
					card_type: card.card_type,
					front: card.front,
					back: card.back,
					created_at: now,
					updated_at: now,
					deleted_at: null,
					type_in: card.typeIn ? 1 : 0,
				};
				db.upsertCard(cardRow);
			}

			// Verify cards stored
			const stored = db.getCardsByNote("biology/cells.md");
			expect(stored).toHaveLength(result.cards.length);
			expect(stored[0]!.deck).toBe("biology");

			// 3. Create schedules for new cards
			for (const card of stored) {
				const schedule = scheduler.createNewSchedule(card.id);
				db.upsertSchedule(schedule);
			}

			// After scheduling, cards should be due immediately
			const dueCards = db.getDueCards(now + 1000, "biology");
			expect(dueCards.length).toBe(result.cards.length);

			// 4. Review first card
			const firstDue = dueCards[0]!;
			const schedule = db.getSchedule(firstDue.id)!;
			const reviewResult = scheduler.review(schedule, 3); // Good
			db.upsertSchedule(reviewResult.schedule);
			db.insertReviewLog({
				card_id: firstDue.id,
				rating: 3,
				study_mode: "sequential",
				reviewed_at: now,
				elapsed_days: reviewResult.reviewLog.elapsed_days,
				scheduled_days: reviewResult.reviewLog.scheduled_days,
			});

			// Verify review recorded
			const logs = db.getReviewLogs(firstDue.id);
			expect(logs).toHaveLength(1);
			expect(logs[0]!.rating).toBe(3);

			// Verify card is no longer immediately due
			const updatedSchedule = db.getSchedule(firstDue.id)!;
			expect(updatedSchedule.due).toBeGreaterThan(now);
		});
	});

	describe("end-to-end: explicit fence with bidi", () => {
		it("stores both directions and schedules independently", async () => {
			const md = [
				"---",
				"osmosis: true",
				"---",
				"```osmosis",
				"bidi: true",
				"deck: vocab/french",
				"",
				"Bonjour",
				"***",
				"Hello",
				"```",
			].join("\n");

			const result = processNote(md, "vocab/note.md", defaultOptions);
			const bidiCards = result.cards.filter(
				(c) => c.card_type === "explicit_bidi",
			);
			expect(bidiCards).toHaveLength(2);
			expect(bidiCards[0]!.front).toBe("Bonjour");
			expect(bidiCards[0]!.back).toBe("Hello");
			expect(bidiCards[1]!.front).toBe("Hello");
			expect(bidiCards[1]!.back).toBe("Bonjour");

			// Store both
			const now = Date.now();
			for (const card of bidiCards) {
				db.upsertCard({
					id: card.id,
					note_path: "vocab/note.md",
					deck: card.deck,
					card_type: card.card_type,
					front: card.front,
					back: card.back,
					created_at: now,
					updated_at: now,
					deleted_at: null,
					type_in: card.typeIn ? 1 : 0,
				});
				db.upsertSchedule(scheduler.createNewSchedule(card.id));
			}

			// Both should be independently schedulable
			const due = db.getDueCards(now + 1000, "vocab/french");
			expect(due).toHaveLength(2);

			// Review one, other remains due
			const schedule = db.getSchedule(due[0]!.id)!;
			const reviewResult = scheduler.review(schedule, 4); // Easy
			db.upsertSchedule(reviewResult.schedule);

			const stillDue = db.getDueCards(now + 1000, "vocab/french");
			expect(stillDue).toHaveLength(1);
			expect(stillDue[0]!.id).toBe(due[1]!.id);
		});
	});

	describe("orphan lifecycle", () => {
		it("detects orphans when content is removed, restores when re-added", async () => {
			const mdV1 = [
				"---",
				"osmosis: true",
				"---",
				"## Topic A <!--osmosis-id:aaaaaaaa-->",
				"Body A.",
				"## Topic B <!--osmosis-id:bbbbbbbb-->",
				"Body B.",
			].join("\n");

			// Initial generation
			const resultV1 = processNote(mdV1, "note.md", defaultOptions);
			expect(resultV1.cards).toHaveLength(2);

			const now = Date.now();
			for (const card of resultV1.cards) {
				db.upsertCard({
					id: card.id,
					note_path: "note.md",
					deck: card.deck,
					card_type: card.card_type,
					front: card.front,
					back: card.back,
					created_at: now,
					updated_at: now,
					deleted_at: null,
					type_in: card.typeIn ? 1 : 0,
				});
				db.upsertSchedule(scheduler.createNewSchedule(card.id));
			}

			// User removes Topic B
			const mdV2 = [
				"---",
				"osmosis: true",
				"---",
				"## Topic A <!--osmosis-id:aaaaaaaa-->",
				"Body A.",
			].join("\n");

			const resultV2 = processNote(mdV2, "note.md", defaultOptions);
			const existing = db.getCardsByNote("note.md");
			const orphans = detectOrphanedCards(existing, resultV2.cards);
			expect(orphans).toEqual(["bbbbbbbb"]);

			// Soft-delete orphan
			db.softDeleteCard("bbbbbbbb");

			// Verify soft-deleted
			const card = db.getCard("bbbbbbbb");
			expect(card!.deleted_at).not.toBeNull();

			// Review history preserved
			db.insertReviewLog({
				card_id: "bbbbbbbb",
				rating: 3,
				study_mode: "sequential",
				reviewed_at: now,
				elapsed_days: 0,
				scheduled_days: 1,
			});
			const logs = db.getReviewLogs("bbbbbbbb");
			expect(logs).toHaveLength(1);

			// User re-adds Topic B
			const mdV3 = mdV1;
			const resultV3 = processNote(mdV3, "note.md", defaultOptions);
			const allCards = [
				db.getCard("aaaaaaaa")!,
				db.getCard("bbbbbbbb")!,
			];
			const restored = detectRestoredCards(allCards, resultV3.cards);
			expect(restored).toEqual(["bbbbbbbb"]);

			// Restore
			db.restoreCard("bbbbbbbb");
			const restoredCard = db.getCard("bbbbbbbb");
			expect(restoredCard!.deleted_at).toBeNull();
		});
	});

	describe("session quotas with real cards", () => {
		it("enforces daily limits on study session", async () => {
			const md = [
				"---",
				"osmosis: true",
				"---",
				"## A\nBody A.",
				"## B\nBody B.",
				"## C\nBody C.",
				"## D\nBody D.",
				"## E\nBody E.",
			].join("\n");

			const result = processNote(md, "note.md", {
				...defaultOptions,
				headingClozeConflict: "both",
			});
			expect(result.cards.length).toBe(5);

			const now = Date.now();
			for (const card of result.cards) {
				db.upsertCard({
					id: card.id,
					note_path: "note.md",
					deck: card.deck,
					card_type: card.card_type,
					front: card.front,
					back: card.back,
					created_at: now,
					updated_at: now,
					deleted_at: null,
					type_in: card.typeIn ? 1 : 0,
				});
			}

			// All 5 are new cards (no schedule)
			const newCards = db.getNewCards();
			expect(newCards).toHaveLength(5);

			// Apply quota: only 3 new per day
			const limited = applySessionQuotas(newCards, [], {
				newCardsToday: 0,
				reviewsToday: 0,
				dailyNewLimit: 3,
				dailyReviewLimit: 100,
			});
			expect(limited.newCards).toHaveLength(3);

			// After studying 2 today, only 1 more allowed
			const limited2 = applySessionQuotas(newCards, [], {
				newCardsToday: 2,
				reviewsToday: 0,
				dailyNewLimit: 3,
				dailyReviewLimit: 100,
			});
			expect(limited2.newCards).toHaveLength(1);
		});
	});

	describe("determinism", () => {
		it("same note always produces same cards", () => {
			const md = [
				"---",
				"osmosis: true",
				"---",
				"## Topic <!--osmosis-id:aaaaaaaa-->",
				"Body with ==term== <!--osmosis-id:bbbbbbbb-->.",
			].join("\n");

			const r1 = processNote(md, "note.md", defaultOptions);
			const r2 = processNote(md, "note.md", defaultOptions);

			expect(r1.cards).toHaveLength(r2.cards.length);
			for (let i = 0; i < r1.cards.length; i++) {
				expect(r1.cards[i]!.id).toBe(r2.cards[i]!.id);
				expect(r1.cards[i]!.front).toBe(r2.cards[i]!.front);
				expect(r1.cards[i]!.back).toBe(r2.cards[i]!.back);
				expect(r1.cards[i]!.card_type).toBe(r2.cards[i]!.card_type);
			}
		});
	});

	describe("card update on content change", () => {
		it("updates card content when source text changes", async () => {
			const mdV1 = [
				"---",
				"osmosis: true",
				"---",
				"## Topic <!--osmosis-id:aaaaaaaa-->",
				"Original body text.",
			].join("\n");

			const now = Date.now();
			const r1 = processNote(mdV1, "note.md", defaultOptions);
			db.upsertCard({
				id: r1.cards[0]!.id,
				note_path: "note.md",
				deck: r1.cards[0]!.deck,
				card_type: r1.cards[0]!.card_type,
				front: r1.cards[0]!.front,
				back: r1.cards[0]!.back,
				created_at: now,
				updated_at: now,
				deleted_at: null,
				type_in: 0,
			});

			// User edits the body
			const mdV2 = [
				"---",
				"osmosis: true",
				"---",
				"## Topic <!--osmosis-id:aaaaaaaa-->",
				"Updated body text with new info.",
			].join("\n");

			const r2 = processNote(mdV2, "note.md", defaultOptions);
			expect(r2.cards[0]!.id).toBe("aaaaaaaa"); // Same ID
			expect(r2.cards[0]!.back).toBe("Updated body text with new info.");

			// Upsert updates the content
			db.upsertCard({
				id: r2.cards[0]!.id,
				note_path: "note.md",
				deck: r2.cards[0]!.deck,
				card_type: r2.cards[0]!.card_type,
				front: r2.cards[0]!.front,
				back: r2.cards[0]!.back,
				created_at: now,
				updated_at: Date.now(),
				deleted_at: null,
				type_in: 0,
			});

			const stored = db.getCard("aaaaaaaa")!;
			expect(stored.back).toBe("Updated body text with new info.");
		});
	});

	describe("multi-type note", () => {
		it("generates correct card mix from a realistic note", async () => {
			const md = [
				"---",
				"osmosis: true",
				"osmosis-deck: science",
				"---",
				"## Cell Biology",
				"Cells are the fundamental unit of life.",
				"",
				"The ==plasma membrane== controls what enters and exits.",
				"",
				"**Ribosomes** synthesize proteins.",
				"",
				"```osmosis",
				"What organelle produces ATP?",
				"***",
				"Mitochondria",
				"```",
				"",
				"```osmosis",
				"bidi: true",
				"",
				"Nucleus",
				"***",
				"Contains DNA",
				"```",
			].join("\n");

			const result = processNote(md, "science/bio.md", defaultOptions);
			expect(result.enabled).toBe(true);

			const types = result.cards.map((c) => c.card_type);

			// Heading should be dropped (cloze_only and body has clozes)
			expect(types).not.toContain("heading");

			// Clozes from the body
			expect(types.filter((t) => t === "cloze_highlight")).toHaveLength(1);
			expect(types.filter((t) => t === "cloze_bold")).toHaveLength(1);

			// Explicit cards
			expect(types.filter((t) => t === "explicit")).toHaveLength(1);
			expect(types.filter((t) => t === "explicit_bidi")).toHaveLength(2);

			// All cards have the correct deck
			for (const card of result.cards) {
				expect(card.deck).toBe("science");
			}
		});
	});

	describe("edge cases", () => {
		it("handles empty note with only frontmatter", () => {
			const md = "---\nosmosis: true\n---\n";
			const result = processNote(md, "note.md", defaultOptions);
			expect(result.enabled).toBe(true);
			expect(result.cards).toHaveLength(0);
		});

		it("handles note with only explicit fences (no headings or cloze)", () => {
			const md = [
				"---",
				"osmosis: true",
				"---",
				"```osmosis",
				"Q",
				"***",
				"A",
				"```",
			].join("\n");
			const result = processNote(md, "note.md", defaultOptions);
			expect(result.cards).toHaveLength(1);
			expect(result.cards[0]!.card_type).toBe("explicit");
		});

		it("handles multiple exclude comments", () => {
			const md = [
				"---",
				"osmosis: true",
				"---",
				"## Keep",
				"Keep body.",
				"<!-- osmosis-exclude -->",
				"## Skip 1",
				"Body 1.",
				"<!-- osmosis-exclude -->",
				"## Skip 2",
				"Body 2.",
				"## Also Keep",
				"Keep body 2.",
			].join("\n");
			const result = processNote(md, "note.md", {
				...defaultOptions,
				headingClozeConflict: "both",
			});
			const headings = result.cards
				.filter((c) => c.card_type === "heading")
				.map((c) => c.front);
			expect(headings).toContain("Keep");
			expect(headings).toContain("Also Keep");
			expect(headings).not.toContain("Skip 1");
			expect(headings).not.toContain("Skip 2");
		});

		it("FSRS rating progression: Again < Hard < Good < Easy intervals", () => {
			const initial = scheduler.createNewSchedule("test");

			const again = scheduler.review(initial, 1);
			const hard = scheduler.review(initial, 2);
			const good = scheduler.review(initial, 3);
			const easy = scheduler.review(initial, 4);

			expect(again.schedule.due).toBeLessThanOrEqual(hard.schedule.due);
			expect(hard.schedule.due).toBeLessThanOrEqual(good.schedule.due);
			expect(good.schedule.due).toBeLessThanOrEqual(easy.schedule.due);
		});
	});
});
