import { describe, it, expect, beforeEach } from "vitest";
import initSqlJs, { type SqlJsModule, type SqlJsDatabase } from "sql.js";
import { CREATE_TABLES_SQL } from "../database/schema";
import { FSRSScheduler } from "../database/FSRSScheduler";
import type { CardRow, CardScheduleRow } from "../database/types";

/**
 * Tests for StudySessionManager query logic.
 * Uses raw sql.js to validate the query patterns that StudySessionManager
 * relies on via CardDatabase, since CardDatabase requires an Obsidian adapter.
 */

let SQL: SqlJsModule;
let db: SqlJsDatabase;
let scheduler: FSRSScheduler;

beforeEach(async () => {
	if (!SQL) {
		SQL = await initSqlJs();
	}
	db = new SQL.Database();
	db.run("PRAGMA foreign_keys = ON;");
	db.run(CREATE_TABLES_SQL);
	scheduler = new FSRSScheduler();
});

function makeCard(overrides: Partial<CardRow> = {}): CardRow {
	return {
		id: "card-1",
		note_path: "notes/test.md",
		deck: "default",
		card_type: "explicit",
		front: "Question?",
		back: "Answer.",
		created_at: 1000,
		updated_at: 1000,
		deleted_at: null,
		type_in: 0,
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

function insertSchedule(schedule: CardScheduleRow): void {
	db.run(
		`INSERT OR REPLACE INTO card_schedule (card_id, stability, difficulty, due, last_review, reps, lapses, state)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		[schedule.card_id, schedule.stability, schedule.difficulty, schedule.due, schedule.last_review, schedule.reps, schedule.lapses, schedule.state],
	);
}

function queryDueCards(now: number, deck?: string): unknown[][] {
	let sql = `
		SELECT c.*, s.stability, s.difficulty, s.due, s.last_review, s.reps, s.lapses, s.state
		FROM cards c
		JOIN card_schedule s ON c.id = s.card_id
		WHERE c.deleted_at IS NULL AND s.due <= ${now}`;
	if (deck !== undefined) {
		sql += ` AND c.deck = '${deck}'`;
	}
	sql += ` ORDER BY s.due ASC`;
	const result = db.exec(sql);
	return result[0]?.values ?? [];
}

function queryDueCardsByPrefix(now: number, prefix: string): unknown[][] {
	const sql = `
		SELECT c.*, s.stability, s.difficulty, s.due, s.last_review, s.reps, s.lapses, s.state
		FROM cards c
		JOIN card_schedule s ON c.id = s.card_id
		WHERE c.deleted_at IS NULL AND s.due <= ${now}
		AND (c.deck = '${prefix}' OR c.deck LIKE '${prefix}/%')
		ORDER BY s.due ASC`;
	const result = db.exec(sql);
	return result[0]?.values ?? [];
}

function queryNewCards(deck?: string): unknown[][] {
	let sql = `
		SELECT c.* FROM cards c
		LEFT JOIN card_schedule s ON c.id = s.card_id
		WHERE c.deleted_at IS NULL AND s.card_id IS NULL`;
	if (deck !== undefined) {
		sql += ` AND c.deck = '${deck}'`;
	}
	const result = db.exec(sql);
	return result[0]?.values ?? [];
}

function queryNewCardsByPrefix(prefix: string): unknown[][] {
	const sql = `
		SELECT c.* FROM cards c
		LEFT JOIN card_schedule s ON c.id = s.card_id
		WHERE c.deleted_at IS NULL AND s.card_id IS NULL
		AND (c.deck = '${prefix}' OR c.deck LIKE '${prefix}/%')`;
	const result = db.exec(sql);
	return result[0]?.values ?? [];
}

describe("StudySessionManager query patterns", () => {
	describe("Deck scoping — single", () => {
		it("returns only cards from exact deck match", () => {
			insertCard(makeCard({ id: "c1", deck: "math" }));
			insertCard(makeCard({ id: "c2", deck: "math/algebra" }));
			insertCard(makeCard({ id: "c3", deck: "science" }));
			insertSchedule({ card_id: "c1", stability: 1, difficulty: 5, due: 1000, last_review: 500, reps: 1, lapses: 0, state: "review" });
			insertSchedule({ card_id: "c2", stability: 1, difficulty: 5, due: 1000, last_review: 500, reps: 1, lapses: 0, state: "review" });
			insertSchedule({ card_id: "c3", stability: 1, difficulty: 5, due: 1000, last_review: 500, reps: 1, lapses: 0, state: "review" });

			const due = queryDueCards(2000, "math");
			expect(due).toHaveLength(1);
			expect(due[0]![0]).toBe("c1");
		});
	});

	describe("Deck scoping — parent (prefix)", () => {
		it("returns cards from parent deck and all sub-decks", () => {
			insertCard(makeCard({ id: "c1", deck: "math" }));
			insertCard(makeCard({ id: "c2", deck: "math/algebra" }));
			insertCard(makeCard({ id: "c3", deck: "math/calculus" }));
			insertCard(makeCard({ id: "c4", deck: "science" }));
			insertSchedule({ card_id: "c1", stability: 1, difficulty: 5, due: 1000, last_review: 500, reps: 1, lapses: 0, state: "review" });
			insertSchedule({ card_id: "c2", stability: 1, difficulty: 5, due: 1000, last_review: 500, reps: 1, lapses: 0, state: "review" });
			insertSchedule({ card_id: "c3", stability: 1, difficulty: 5, due: 1000, last_review: 500, reps: 1, lapses: 0, state: "review" });
			insertSchedule({ card_id: "c4", stability: 1, difficulty: 5, due: 1000, last_review: 500, reps: 1, lapses: 0, state: "review" });

			const due = queryDueCardsByPrefix(2000, "math");
			expect(due).toHaveLength(3);
		});

		it("does not match decks that start with prefix but aren't sub-decks", () => {
			insertCard(makeCard({ id: "c1", deck: "math" }));
			insertCard(makeCard({ id: "c2", deck: "mathematics" })); // NOT a sub-deck of "math"
			insertSchedule({ card_id: "c1", stability: 1, difficulty: 5, due: 1000, last_review: 500, reps: 1, lapses: 0, state: "review" });
			insertSchedule({ card_id: "c2", stability: 1, difficulty: 5, due: 1000, last_review: 500, reps: 1, lapses: 0, state: "review" });

			const due = queryDueCardsByPrefix(2000, "math");
			expect(due).toHaveLength(1);
			expect(due[0]![0]).toBe("c1");
		});
	});

	describe("Deck scoping — all", () => {
		it("returns all due cards regardless of deck", () => {
			insertCard(makeCard({ id: "c1", deck: "math" }));
			insertCard(makeCard({ id: "c2", deck: "science" }));
			insertCard(makeCard({ id: "c3", deck: "history" }));
			insertSchedule({ card_id: "c1", stability: 1, difficulty: 5, due: 1000, last_review: 500, reps: 1, lapses: 0, state: "review" });
			insertSchedule({ card_id: "c2", stability: 1, difficulty: 5, due: 1000, last_review: 500, reps: 1, lapses: 0, state: "review" });
			insertSchedule({ card_id: "c3", stability: 1, difficulty: 5, due: 5000, last_review: 500, reps: 1, lapses: 0, state: "review" });

			const due = queryDueCards(2000);
			expect(due).toHaveLength(2);
		});
	});

	describe("New card queries", () => {
		it("returns cards without a schedule entry", () => {
			insertCard(makeCard({ id: "c1", deck: "math" }));
			insertCard(makeCard({ id: "c2", deck: "math" }));
			insertSchedule({ card_id: "c1", stability: 1, difficulty: 5, due: 1000, last_review: 500, reps: 1, lapses: 0, state: "review" });

			const newCards = queryNewCards("math");
			expect(newCards).toHaveLength(1);
			expect(newCards[0]![0]).toBe("c2");
		});

		it("returns new cards by deck prefix", () => {
			insertCard(makeCard({ id: "c1", deck: "math" }));
			insertCard(makeCard({ id: "c2", deck: "math/algebra" }));
			insertCard(makeCard({ id: "c3", deck: "science" }));

			const newCards = queryNewCardsByPrefix("math");
			expect(newCards).toHaveLength(2);
		});

		it("excludes soft-deleted cards from new card query", () => {
			insertCard(makeCard({ id: "c1", deck: "math", deleted_at: 5000 }));
			insertCard(makeCard({ id: "c2", deck: "math" }));

			const newCards = queryNewCards("math");
			expect(newCards).toHaveLength(1);
			expect(newCards[0]![0]).toBe("c2");
		});
	});

	describe("Card count queries", () => {
		it("counts new/learn/due cards grouped by deck", () => {
			// New cards (no schedule)
			insertCard(makeCard({ id: "n1", deck: "math" }));
			insertCard(makeCard({ id: "n2", deck: "math" }));

			// Learning card
			insertCard(makeCard({ id: "l1", deck: "math" }));
			insertSchedule({ card_id: "l1", stability: 1, difficulty: 5, due: 1000, last_review: 500, reps: 1, lapses: 0, state: "learning" });

			// Due review card
			insertCard(makeCard({ id: "d1", deck: "math" }));
			insertSchedule({ card_id: "d1", stability: 1, difficulty: 5, due: 1000, last_review: 500, reps: 3, lapses: 0, state: "review" });

			// Not-yet-due review card
			insertCard(makeCard({ id: "nd1", deck: "math" }));
			insertSchedule({ card_id: "nd1", stability: 1, difficulty: 5, due: 9999, last_review: 500, reps: 3, lapses: 0, state: "review" });

			// Science card
			insertCard(makeCard({ id: "s1", deck: "science" }));

			const result = db.exec(`
				SELECT c.deck,
					SUM(CASE WHEN s.card_id IS NULL OR s.state = 'new' THEN 1 ELSE 0 END) as new_count,
					SUM(CASE WHEN s.state IN ('learning', 'relearning') THEN 1 ELSE 0 END) as learn_count,
					SUM(CASE WHEN s.state = 'review' AND s.due <= 2000 THEN 1 ELSE 0 END) as due_count
				FROM cards c
				LEFT JOIN card_schedule s ON c.id = s.card_id
				WHERE c.deleted_at IS NULL
				GROUP BY c.deck
			`);

			expect(result[0]!.values).toHaveLength(2);

			// math: 2 new, 1 learning, 1 due review
			const mathRow = result[0]!.values.find((r) => r[0] === "math");
			expect(mathRow![1]).toBe(2); // new
			expect(mathRow![2]).toBe(1); // learn
			expect(mathRow![3]).toBe(1); // due

			// science: 1 new, 0 learn, 0 due
			const scienceRow = result[0]!.values.find((r) => r[0] === "science");
			expect(scienceRow![1]).toBe(1);
			expect(scienceRow![2]).toBe(0);
			expect(scienceRow![3]).toBe(0);
		});
	});
});

describe("FSRSScheduler integration", () => {
	it("creates a new schedule and processes a review", () => {
		const newSchedule = scheduler.createNewSchedule("card-1", 1000);
		expect(newSchedule.state).toBe("new");
		expect(newSchedule.reps).toBe(0);

		const update = scheduler.review(newSchedule, 3, 1000);
		expect(update.schedule.reps).toBe(1);
		expect(update.schedule.state).not.toBe("new");
		expect(update.reviewLog.rating).toBe(3);
		expect(update.reviewLog.reviewed_at).toBe(1000);
	});

	it("review log contains correct study mode when stored", () => {
		insertCard(makeCard({ id: "card-1" }));

		const schedule = scheduler.createNewSchedule("card-1", 1000);
		insertSchedule(schedule);

		const update = scheduler.review(schedule, 3, 2000);
		insertSchedule(update.schedule);

		db.run(
			`INSERT INTO review_log (card_id, rating, study_mode, reviewed_at, elapsed_days, scheduled_days)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			["card-1", update.reviewLog.rating, "sequential", update.reviewLog.reviewed_at, update.reviewLog.elapsed_days, update.reviewLog.scheduled_days],
		);

		const logs = db.exec("SELECT study_mode FROM review_log WHERE card_id = 'card-1'");
		expect(logs[0]!.values[0]![0]).toBe("sequential");
	});

	it("records contextual study mode in review log", () => {
		insertCard(makeCard({ id: "card-1" }));

		db.run(
			`INSERT INTO review_log (card_id, rating, study_mode, reviewed_at, elapsed_days, scheduled_days)
			 VALUES ('card-1', 3, 'contextual', 1000, 0.0, 1.0)`,
		);

		const logs = db.exec("SELECT study_mode FROM review_log WHERE card_id = 'card-1'");
		expect(logs[0]!.values[0]![0]).toBe("contextual");
	});

	it("records spatial study mode in review log", () => {
		insertCard(makeCard({ id: "card-1" }));

		db.run(
			`INSERT INTO review_log (card_id, rating, study_mode, reviewed_at, elapsed_days, scheduled_days)
			 VALUES ('card-1', 4, 'spatial', 1000, 0.0, 1.0)`,
		);

		const logs = db.exec("SELECT study_mode FROM review_log WHERE card_id = 'card-1'");
		expect(logs[0]!.values[0]![0]).toBe("spatial");
	});
});
