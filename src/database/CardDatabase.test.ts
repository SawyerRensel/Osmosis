import { describe, it, expect, beforeEach } from "vitest";
import initSqlJs, { type SqlJsModule, type SqlJsDatabase } from "sql.js";
import { CREATE_TABLES_SQL } from "./schema";
import type { CardRow, CardScheduleRow } from "./types";

/**
 * Unit tests for the database schema and query patterns.
 * Uses sql.js directly in Node to validate schema correctness and query logic.
 */

let SQL: SqlJsModule;
let db: SqlJsDatabase;

beforeEach(async () => {
	if (!SQL) {
		SQL = await initSqlJs();
	}
	db = new SQL.Database();
	db.run("PRAGMA foreign_keys = ON;");
	db.run(CREATE_TABLES_SQL);
});

function makeCard(overrides: Partial<CardRow> = {}): CardRow {
	return {
		id: "test-card-1",
		note_path: "notes/test.md",
		deck: "default",
		card_type: "heading",
		front: "What is X?",
		back: "X is Y.",
		created_at: 1000,
		updated_at: 1000,
		deleted_at: null,
		...overrides,
	};
}

function insertCard(card: CardRow): void {
	db.run(
		`INSERT INTO cards (id, note_path, deck, card_type, front, back, created_at, updated_at, deleted_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[card.id, card.note_path, card.deck, card.card_type, card.front, card.back, card.created_at, card.updated_at, card.deleted_at],
	);
}

function makeSchedule(overrides: Partial<CardScheduleRow> = {}): CardScheduleRow {
	return {
		card_id: "test-card-1",
		stability: 1.0,
		difficulty: 5.0,
		due: 2000,
		last_review: 1000,
		reps: 1,
		lapses: 0,
		state: "new",
		...overrides,
	};
}

function insertSchedule(schedule: CardScheduleRow): void {
	db.run(
		`INSERT OR REPLACE INTO card_schedule (card_id, stability, difficulty, due, last_review, reps, lapses, state)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		[schedule.card_id, schedule.stability, schedule.difficulty, schedule.due, schedule.last_review, schedule.reps, schedule.lapses, schedule.state],
	);
}

describe("Schema", () => {
	it("creates all three tables", () => {
		const result = db.exec(
			"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
		);
		const tables = result[0]!.values.map((row) => row[0]);
		expect(tables).toContain("cards");
		expect(tables).toContain("card_schedule");
		expect(tables).toContain("review_log");
	});

	it("creates indexes", () => {
		const result = db.exec(
			"SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name",
		);
		const indexes = result[0]!.values.map((row) => row[0]);
		expect(indexes).toContain("idx_cards_note_path");
		expect(indexes).toContain("idx_cards_deck");
		expect(indexes).toContain("idx_schedule_due");
		expect(indexes).toContain("idx_review_log_card");
	});

	it("enforces card_type CHECK constraint", () => {
		expect(() => {
			db.run(
				`INSERT INTO cards (id, note_path, deck, card_type, front, back, created_at, updated_at)
				 VALUES ('x', 'path', 'deck', 'invalid_type', 'f', 'b', 1, 1)`,
			);
		}).toThrow();
	});

	it("enforces card_schedule state CHECK constraint", () => {
		insertCard(makeCard());
		expect(() => {
			db.run(
				`INSERT INTO card_schedule (card_id, due, state)
				 VALUES ('test-card-1', 1000, 'invalid')`,
			);
		}).toThrow();
	});

	it("enforces review_log rating CHECK constraint", () => {
		insertCard(makeCard());
		expect(() => {
			db.run(
				`INSERT INTO review_log (card_id, rating, study_mode, reviewed_at, elapsed_days, scheduled_days)
				 VALUES ('test-card-1', 5, 'sequential', 1000, 1.0, 1.0)`,
			);
		}).toThrow();
	});
});

describe("Card CRUD", () => {
	it("inserts and retrieves a card", () => {
		insertCard(makeCard());

		const result = db.exec("SELECT * FROM cards WHERE id = 'test-card-1'");
		expect(result[0]!.values).toHaveLength(1);
		expect(result[0]!.values[0]![0]).toBe("test-card-1");
		expect(result[0]!.values[0]![4]).toBe("What is X?");
	});

	it("supports INSERT OR REPLACE for upsert", () => {
		const card = makeCard();
		insertCard(card);

		db.run(
			`INSERT OR REPLACE INTO cards (id, note_path, deck, card_type, front, back, created_at, updated_at, deleted_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[card.id, card.note_path, card.deck, card.card_type, "Updated front", card.back, card.created_at, 2000, null],
		);

		const result = db.exec("SELECT front, updated_at FROM cards WHERE id = 'test-card-1'");
		expect(result[0]!.values[0]![0]).toBe("Updated front");
		expect(result[0]!.values[0]![1]).toBe(2000);
	});

	it("soft-deletes by setting deleted_at", () => {
		insertCard(makeCard());
		db.run("UPDATE cards SET deleted_at = 9999 WHERE id = 'test-card-1'");

		const active = db.exec("SELECT * FROM cards WHERE id = 'test-card-1' AND deleted_at IS NULL");
		expect(active).toHaveLength(0);

		const all = db.exec("SELECT * FROM cards WHERE id = 'test-card-1'");
		expect(all[0]!.values).toHaveLength(1);
	});

	it("filters by note_path", () => {
		insertCard(makeCard({ id: "c1", note_path: "a.md" }));
		insertCard(makeCard({ id: "c2", note_path: "b.md" }));
		insertCard(makeCard({ id: "c3", note_path: "a.md" }));

		const result = db.exec("SELECT id FROM cards WHERE note_path = 'a.md' AND deleted_at IS NULL");
		expect(result[0]!.values).toHaveLength(2);
	});
});

describe("Schedule", () => {
	it("inserts and retrieves a schedule", () => {
		insertCard(makeCard());
		insertSchedule(makeSchedule());

		const result = db.exec("SELECT * FROM card_schedule WHERE card_id = 'test-card-1'");
		expect(result[0]!.values).toHaveLength(1);
		expect(result[0]!.values[0]![1]).toBe(1.0); // stability
	});

	it("supports INSERT OR REPLACE for upsert", () => {
		insertCard(makeCard());
		insertSchedule(makeSchedule());
		insertSchedule(makeSchedule({ stability: 5.0, reps: 3 }));

		const result = db.exec("SELECT stability, reps FROM card_schedule WHERE card_id = 'test-card-1'");
		expect(result[0]!.values[0]![0]).toBe(5.0);
		expect(result[0]!.values[0]![1]).toBe(3);
	});
});

describe("Due card queries", () => {
	it("returns cards due before a given timestamp", () => {
		insertCard(makeCard({ id: "c1" }));
		insertCard(makeCard({ id: "c2" }));
		insertSchedule(makeSchedule({ card_id: "c1", due: 1000 }));
		insertSchedule(makeSchedule({ card_id: "c2", due: 3000 }));

		const result = db.exec(`
			SELECT c.id FROM cards c
			JOIN card_schedule s ON c.id = s.card_id
			WHERE c.deleted_at IS NULL AND s.due <= 2000
			ORDER BY s.due ASC
		`);
		expect(result[0]!.values).toHaveLength(1);
		expect(result[0]!.values[0]![0]).toBe("c1");
	});

	it("excludes soft-deleted cards from due query", () => {
		insertCard(makeCard({ id: "c1", deleted_at: 500 }));
		insertSchedule(makeSchedule({ card_id: "c1", due: 1000 }));

		const result = db.exec(`
			SELECT c.id FROM cards c
			JOIN card_schedule s ON c.id = s.card_id
			WHERE c.deleted_at IS NULL AND s.due <= 2000
		`);
		expect(result).toHaveLength(0);
	});

	it("filters due cards by deck", () => {
		insertCard(makeCard({ id: "c1", deck: "python" }));
		insertCard(makeCard({ id: "c2", deck: "math" }));
		insertSchedule(makeSchedule({ card_id: "c1", due: 1000 }));
		insertSchedule(makeSchedule({ card_id: "c2", due: 1000 }));

		const result = db.exec(`
			SELECT c.id FROM cards c
			JOIN card_schedule s ON c.id = s.card_id
			WHERE c.deleted_at IS NULL AND s.due <= 2000 AND c.deck = 'python'
		`);
		expect(result[0]!.values).toHaveLength(1);
		expect(result[0]!.values[0]![0]).toBe("c1");
	});
});

describe("Review log", () => {
	it("inserts review entries with autoincrement", () => {
		insertCard(makeCard());
		db.run(
			`INSERT INTO review_log (card_id, rating, study_mode, reviewed_at, elapsed_days, scheduled_days)
			 VALUES ('test-card-1', 3, 'sequential', 1000, 0.0, 1.0)`,
		);
		db.run(
			`INSERT INTO review_log (card_id, rating, study_mode, reviewed_at, elapsed_days, scheduled_days)
			 VALUES ('test-card-1', 4, 'sequential', 2000, 1.0, 3.0)`,
		);

		const result = db.exec("SELECT id, rating FROM review_log WHERE card_id = 'test-card-1' ORDER BY id");
		expect(result[0]!.values).toHaveLength(2);
		expect(result[0]!.values[0]![0]).toBe(1);
		expect(result[0]!.values[1]![0]).toBe(2);
	});
});

describe("Foreign key cascades", () => {
	it("cascades delete from cards to card_schedule", () => {
		insertCard(makeCard());
		insertSchedule(makeSchedule());

		db.run("DELETE FROM cards WHERE id = 'test-card-1'");

		const result = db.exec("SELECT * FROM card_schedule WHERE card_id = 'test-card-1'");
		expect(result).toHaveLength(0);
	});

	it("cascades delete from cards to review_log", () => {
		insertCard(makeCard());
		db.run(
			`INSERT INTO review_log (card_id, rating, study_mode, reviewed_at, elapsed_days, scheduled_days)
			 VALUES ('test-card-1', 3, 'sequential', 1000, 0.0, 1.0)`,
		);

		db.run("DELETE FROM cards WHERE id = 'test-card-1'");

		const result = db.exec("SELECT * FROM review_log WHERE card_id = 'test-card-1'");
		expect(result).toHaveLength(0);
	});
});

describe("Database export/import round-trip", () => {
	it("preserves data across export and re-import", () => {
		insertCard(makeCard());
		insertSchedule(makeSchedule());

		const exported = db.export();
		db.close();

		const db2 = new SQL.Database(exported);
		db2.run("PRAGMA foreign_keys = ON;");

		const result = db2.exec("SELECT id FROM cards");
		expect(result[0]!.values).toHaveLength(1);
		expect(result[0]!.values[0]![0]).toBe("test-card-1");

		const schedResult = db2.exec("SELECT card_id FROM card_schedule");
		expect(schedResult[0]!.values).toHaveLength(1);

		db2.close();
	});
});

describe("Soft-delete preserves history", () => {
	it("soft-deleted card retains review logs", () => {
		insertCard(makeCard());
		insertSchedule(makeSchedule());
		db.run(
			`INSERT INTO review_log (card_id, rating, study_mode, reviewed_at, elapsed_days, scheduled_days)
			 VALUES ('test-card-1', 3, 'sequential', 1000, 0.0, 1.0)`,
		);
		db.run(
			`INSERT INTO review_log (card_id, rating, study_mode, reviewed_at, elapsed_days, scheduled_days)
			 VALUES ('test-card-1', 4, 'sequential', 2000, 1.0, 3.0)`,
		);

		// Soft-delete the card
		db.run("UPDATE cards SET deleted_at = 9999 WHERE id = 'test-card-1'");

		// Card no longer appears in active queries
		const active = db.exec("SELECT * FROM cards WHERE id = 'test-card-1' AND deleted_at IS NULL");
		expect(active).toHaveLength(0);

		// But schedule and review logs are preserved
		const schedule = db.exec("SELECT * FROM card_schedule WHERE card_id = 'test-card-1'");
		expect(schedule[0]!.values).toHaveLength(1);

		const logs = db.exec("SELECT * FROM review_log WHERE card_id = 'test-card-1'");
		expect(logs[0]!.values).toHaveLength(2);
	});

	it("hard-delete cascades to schedule and logs, soft-delete does not", () => {
		insertCard(makeCard({ id: "keep" }));
		insertCard(makeCard({ id: "remove" }));
		insertSchedule(makeSchedule({ card_id: "keep" }));
		insertSchedule(makeSchedule({ card_id: "remove" }));
		db.run(
			`INSERT INTO review_log (card_id, rating, study_mode, reviewed_at, elapsed_days, scheduled_days)
			 VALUES ('keep', 3, 'sequential', 1000, 0.0, 1.0)`,
		);
		db.run(
			`INSERT INTO review_log (card_id, rating, study_mode, reviewed_at, elapsed_days, scheduled_days)
			 VALUES ('remove', 3, 'sequential', 1000, 0.0, 1.0)`,
		);

		// Soft-delete keeps everything
		db.run("UPDATE cards SET deleted_at = 5000 WHERE id = 'keep'");
		expect(db.exec("SELECT * FROM card_schedule WHERE card_id = 'keep'")[0]!.values).toHaveLength(1);
		expect(db.exec("SELECT * FROM review_log WHERE card_id = 'keep'")[0]!.values).toHaveLength(1);

		// Hard-delete cascades
		db.run("DELETE FROM cards WHERE id = 'remove'");
		expect(db.exec("SELECT * FROM card_schedule WHERE card_id = 'remove'")).toHaveLength(0);
		expect(db.exec("SELECT * FROM review_log WHERE card_id = 'remove'")).toHaveLength(0);
	});
});

describe("Performance", () => {
	it("creates schema in under 100ms", () => {
		const start = performance.now();
		const freshDb = new SQL.Database();
		freshDb.run("PRAGMA foreign_keys = ON;");
		freshDb.run(CREATE_TABLES_SQL);
		const elapsed = performance.now() - start;
		freshDb.close();

		expect(elapsed).toBeLessThan(100);
	});

	it("queries due cards for a single deck in under 20ms with 1000 cards", () => {
		// Insert 1000 cards across 5 decks (200 per deck)
		const decks = ["math", "science", "history", "english", "art"];
		for (let i = 0; i < 1000; i++) {
			const deck = decks[i % decks.length]!;
			const card = makeCard({
				id: `perf-${i}`,
				deck,
				note_path: `notes/note-${i % 50}.md`,
			});
			insertCard(card);
			insertSchedule(makeSchedule({
				card_id: `perf-${i}`,
				due: i < 500 ? 1000 : 5000, // half are due
				state: "review",
			}));
		}

		// Warm up
		db.exec(`
			SELECT c.id FROM cards c
			JOIN card_schedule s ON c.id = s.card_id
			WHERE c.deleted_at IS NULL AND s.due <= 2000 AND c.deck = 'math'
		`);

		const start = performance.now();
		const result = db.exec(`
			SELECT c.*, s.stability, s.difficulty, s.due, s.last_review, s.reps, s.lapses, s.state
			FROM cards c
			JOIN card_schedule s ON c.id = s.card_id
			WHERE c.deleted_at IS NULL AND s.due <= 2000 AND c.deck = 'math'
			ORDER BY s.due ASC
		`);
		const elapsed = performance.now() - start;

		expect(result[0]!.values.length).toBe(100); // 500 due / 5 decks = 100
		expect(elapsed).toBeLessThan(20); // AC: <20ms single deck
	});

	it("queries due cards across all decks in under 50ms with 1000 cards", () => {
		// Insert 1000 cards
		for (let i = 0; i < 1000; i++) {
			const card = makeCard({
				id: `all-${i}`,
				deck: `deck-${i % 10}`,
				note_path: `notes/note-${i % 50}.md`,
			});
			insertCard(card);
			insertSchedule(makeSchedule({
				card_id: `all-${i}`,
				due: i < 600 ? 1000 : 5000,
				state: "review",
			}));
		}

		// Warm up
		db.exec(`
			SELECT c.id FROM cards c
			JOIN card_schedule s ON c.id = s.card_id
			WHERE c.deleted_at IS NULL AND s.due <= 2000
		`);

		const start = performance.now();
		const result = db.exec(`
			SELECT c.*, s.stability, s.difficulty, s.due, s.last_review, s.reps, s.lapses, s.state
			FROM cards c
			JOIN card_schedule s ON c.id = s.card_id
			WHERE c.deleted_at IS NULL AND s.due <= 2000
			ORDER BY s.due ASC
		`);
		const elapsed = performance.now() - start;

		expect(result[0]!.values.length).toBe(600);
		expect(elapsed).toBeLessThan(50); // AC: <50ms all decks
	});
});
