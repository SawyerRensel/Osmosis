import type { DataAdapter } from "obsidian";
import { CREATE_TABLES_SQL } from "./schema";
import { getEmbeddedWasmBinary } from "./embedded-wasm";
import type { CardRow, CardScheduleRow, ReviewLogRow } from "./types";

/**
 * Minimal sql.js types — sql.js doesn't ship .d.ts files.
 */
interface SqlJsDatabase {
	run(sql: string, params?: unknown[]): void;
	exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>;
	export(): Uint8Array;
	close(): void;
}

interface SqlJsModule {
	Database: new (data?: ArrayLike<number>) => SqlJsDatabase;
}

type InitSqlJs = (config?: {
	wasmBinary?: ArrayLike<number>;
	locateFile?: (file: string) => string;
}) => Promise<SqlJsModule>;

/**
 * CardDatabase wraps sql.js to provide lazy-initialized SQLite storage
 * for spaced repetition cards, schedules, and review logs.
 *
 * The database is NOT loaded at plugin startup. Call ensureInitialized()
 * before any operation — it's idempotent and fast after first init.
 */
export class CardDatabase {
	private db: SqlJsDatabase | null = null;
	private wasmBlobUrl: string | null = null;
	private initialized = false;

	constructor(
		private readonly dbPath: string,
		private readonly adapter: DataAdapter,
	) {}

	/**
	 * Lazy initialization — loads WASM, opens or creates the database.
	 * Idempotent: subsequent calls are no-ops.
	 */
	async ensureInitialized(): Promise<void> {
		if (this.initialized) return;

		const initSqlJs = await this.loadSqlJs();
		const config: { wasmBinary?: ArrayLike<number>; locateFile?: (file: string) => string } = {};

		const embeddedWasm = getEmbeddedWasmBinary();
		if (embeddedWasm) {
			config.wasmBinary = embeddedWasm;
		} else {
			// Fallback for dev/test: load from node_modules
			config.locateFile = (file: string) => `node_modules/sql.js/dist/${file}`;
		}

		const SQL = await initSqlJs(config);

		// Try to load existing DB from disk
		const existingData = await this.loadFromDisk();
		this.db = existingData
			? new SQL.Database(existingData)
			: new SQL.Database();

		// Ensure schema exists (CREATE IF NOT EXISTS is idempotent)
		this.db.run("PRAGMA foreign_keys = ON;");
		this.db.run(CREATE_TABLES_SQL);

		this.initialized = true;
	}

	/**
	 * Flush in-memory database to disk.
	 */
	async save(): Promise<void> {
		if (!this.db) return;

		const data = this.db.export();
		const dir = this.dbPath.substring(0, this.dbPath.lastIndexOf("/"));
		if (dir) {
			try {
				await this.adapter.mkdir(dir);
			} catch {
				// Directory may already exist
			}
		}
		await this.adapter.writeBinary(this.dbPath, data);
	}

	/**
	 * Close the database and release resources.
	 */
	async close(): Promise<void> {
		if (this.db) {
			await this.save();
			this.db.close();
			this.db = null;
		}
		if (this.wasmBlobUrl) {
			URL.revokeObjectURL(this.wasmBlobUrl);
			this.wasmBlobUrl = null;
		}
		this.initialized = false;
	}

	// ── Card CRUD ──────────────────────────────────────────────

	/**
	 * Insert or update a card. Uses INSERT OR REPLACE.
	 */
	upsertCard(card: CardRow): void {
		this.requireDb().run(
			`INSERT OR REPLACE INTO cards (id, note_path, deck, card_type, front, back, created_at, updated_at, deleted_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[card.id, card.note_path, card.deck, card.card_type, card.front, card.back, card.created_at, card.updated_at, card.deleted_at],
		);
	}

	/**
	 * Soft-delete a card by setting deleted_at timestamp.
	 */
	softDeleteCard(cardId: string): void {
		this.requireDb().run(
			`UPDATE cards SET deleted_at = ?, updated_at = ? WHERE id = ?`,
			[Date.now(), Date.now(), cardId],
		);
	}

	/**
	 * Restore a soft-deleted card.
	 */
	restoreCard(cardId: string): void {
		this.requireDb().run(
			`UPDATE cards SET deleted_at = NULL, updated_at = ? WHERE id = ?`,
			[Date.now(), cardId],
		);
	}

	/**
	 * Get all active (non-deleted) cards for a given note.
	 */
	getCardsByNote(notePath: string): CardRow[] {
		return this.queryCards(
			`SELECT * FROM cards WHERE note_path = ? AND deleted_at IS NULL`,
			[notePath],
		);
	}

	/**
	 * Get all active cards in a deck.
	 */
	getCardsByDeck(deck: string): CardRow[] {
		return this.queryCards(
			`SELECT * FROM cards WHERE deck = ? AND deleted_at IS NULL`,
			[deck],
		);
	}

	/**
	 * Get a single card by ID (including soft-deleted).
	 */
	getCard(cardId: string): CardRow | null {
		const rows = this.queryCards(
			`SELECT * FROM cards WHERE id = ?`,
			[cardId],
		);
		return rows[0] ?? null;
	}

	// ── Schedule CRUD ──────────────────────────────────────────

	/**
	 * Insert or update a card's schedule.
	 */
	upsertSchedule(schedule: CardScheduleRow): void {
		this.requireDb().run(
			`INSERT OR REPLACE INTO card_schedule (card_id, stability, difficulty, due, last_review, reps, lapses, state)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			[schedule.card_id, schedule.stability, schedule.difficulty, schedule.due, schedule.last_review, schedule.reps, schedule.lapses, schedule.state],
		);
	}

	/**
	 * Get a card's schedule.
	 */
	getSchedule(cardId: string): CardScheduleRow | null {
		const results = this.requireDb().exec(
			`SELECT * FROM card_schedule WHERE card_id = '${this.escape(cardId)}'`,
		);
		const first = results[0];
		if (!first || first.values.length === 0) return null;
		const row = first.values[0];
		if (!row) return null;
		return this.rowToSchedule(first.columns, row);
	}

	/**
	 * Get all due cards (optionally filtered by deck).
	 * Returns cards joined with their schedule data.
	 */
	getDueCards(now: number, deck?: string): Array<CardRow & CardScheduleRow> {
		let sql = `
			SELECT c.*, s.stability, s.difficulty, s.due, s.last_review, s.reps, s.lapses, s.state
			FROM cards c
			JOIN card_schedule s ON c.id = s.card_id
			WHERE c.deleted_at IS NULL AND s.due <= ${now}`;
		if (deck !== undefined) {
			sql += ` AND c.deck = '${this.escape(deck)}'`;
		}
		sql += ` ORDER BY s.due ASC`;

		const results = this.requireDb().exec(sql);
		const first = results[0];
		if (!first) return [];
		return first.values.map((row) =>
			this.rowToCardWithSchedule(first.columns, row),
		);
	}

	/**
	 * Get new cards (cards without a schedule entry) for a deck.
	 */
	getNewCards(deck?: string): CardRow[] {
		let sql = `
			SELECT c.* FROM cards c
			LEFT JOIN card_schedule s ON c.id = s.card_id
			WHERE c.deleted_at IS NULL AND s.card_id IS NULL`;
		if (deck !== undefined) {
			sql += ` AND c.deck = '${this.escape(deck)}'`;
		}

		return this.queryCards(sql);
	}

	// ── Deck Queries ──────────────────────────────────────────

	/**
	 * Get all distinct deck names from active (non-deleted) cards.
	 */
	getAllDecks(): string[] {
		const results = this.requireDb().exec(
			`SELECT DISTINCT deck FROM cards WHERE deleted_at IS NULL ORDER BY deck`,
		);
		const first = results[0];
		if (!first) return [];
		return first.values.map((row) => row[0] as string);
	}

	/**
	 * Get New/Learn/Due counts grouped by deck. Single efficient query.
	 */
	getCardCountsByDeck(now: number): Map<string, { new: number; learn: number; due: number }> {
		const results = this.requireDb().exec(`
			SELECT c.deck,
				SUM(CASE WHEN s.card_id IS NULL OR s.state = 'new' THEN 1 ELSE 0 END) as new_count,
				SUM(CASE WHEN s.state IN ('learning', 'relearning') THEN 1 ELSE 0 END) as learn_count,
				SUM(CASE WHEN s.state = 'review' AND s.due <= ${now} THEN 1 ELSE 0 END) as due_count
			FROM cards c
			LEFT JOIN card_schedule s ON c.id = s.card_id
			WHERE c.deleted_at IS NULL
			GROUP BY c.deck
		`);
		const first = results[0];
		const map = new Map<string, { new: number; learn: number; due: number }>();
		if (!first) return map;
		for (const row of first.values) {
			map.set(row[0] as string, {
				new: row[1] as number,
				learn: row[2] as number,
				due: row[3] as number,
			});
		}
		return map;
	}

	/**
	 * Get due cards for a deck prefix (parent deck + all sub-decks).
	 */
	getDueCardsByDeckPrefix(now: number, deckPrefix: string): Array<CardRow & CardScheduleRow> {
		const escaped = this.escape(deckPrefix);
		const sql = `
			SELECT c.*, s.stability, s.difficulty, s.due, s.last_review, s.reps, s.lapses, s.state
			FROM cards c
			JOIN card_schedule s ON c.id = s.card_id
			WHERE c.deleted_at IS NULL AND s.due <= ${now}
			AND (c.deck = '${escaped}' OR c.deck LIKE '${escaped}/%')
			ORDER BY s.due ASC`;
		const results = this.requireDb().exec(sql);
		const first = results[0];
		if (!first) return [];
		return first.values.map((row) => this.rowToCardWithSchedule(first.columns, row));
	}

	/**
	 * Get new cards (no schedule) for a deck prefix (parent + sub-decks).
	 */
	getNewCardsByDeckPrefix(deckPrefix: string): CardRow[] {
		const escaped = this.escape(deckPrefix);
		return this.queryCards(`
			SELECT c.* FROM cards c
			LEFT JOIN card_schedule s ON c.id = s.card_id
			WHERE c.deleted_at IS NULL AND s.card_id IS NULL
			AND (c.deck = '${escaped}' OR c.deck LIKE '${escaped}/%')
		`);
	}

	// ── Review Log ─────────────────────────────────────────────

	/**
	 * Insert a review log entry.
	 */
	insertReviewLog(log: Omit<ReviewLogRow, "id">): void {
		this.requireDb().run(
			`INSERT INTO review_log (card_id, rating, study_mode, reviewed_at, elapsed_days, scheduled_days)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			[log.card_id, log.rating, log.study_mode, log.reviewed_at, log.elapsed_days, log.scheduled_days],
		);
	}

	/**
	 * Get review logs for a card.
	 */
	getReviewLogs(cardId: string): ReviewLogRow[] {
		const results = this.requireDb().exec(
			`SELECT * FROM review_log WHERE card_id = '${this.escape(cardId)}' ORDER BY reviewed_at ASC`,
		);
		const first = results[0];
		if (!first) return [];
		return first.values.map((row) =>
			this.rowToReviewLog(first.columns, row),
		);
	}

	// ── Internal Helpers ───────────────────────────────────────

	private requireDb(): SqlJsDatabase {
		if (!this.db) {
			throw new Error("CardDatabase not initialized. Call ensureInitialized() first.");
		}
		return this.db;
	}

	private async loadSqlJs(): Promise<InitSqlJs> {
		const sqlJsModule = await import("sql.js");
		return sqlJsModule.default as InitSqlJs;
	}

	private async loadFromDisk(): Promise<Uint8Array | null> {
		try {
			if (await this.adapter.exists(this.dbPath)) {
				const data = await this.adapter.readBinary(this.dbPath);
				return new Uint8Array(data);
			}
		} catch {
			// File doesn't exist or can't be read — start fresh
		}
		return null;
	}

	private queryCards(sql: string, params?: unknown[]): CardRow[] {
		const db = this.requireDb();
		if (params) {
			// For parameterized queries, build with escaped values
			let resolvedSql = sql;
			for (const param of params) {
				resolvedSql = resolvedSql.replace("?", typeof param === "string" ? `'${this.escape(param)}'` : String(param));
			}
			const results = db.exec(resolvedSql);
			const first = results[0];
			if (!first) return [];
			return first.values.map((row) => this.rowToCard(first.columns, row));
		}
		const results = db.exec(sql);
		const first = results[0];
		if (!first) return [];
		return first.values.map((row) => this.rowToCard(first.columns, row));
	}

	private rowToCard(columns: string[], values: unknown[]): CardRow {
		const obj: Record<string, unknown> = {};
		columns.forEach((col, i) => { obj[col] = values[i]; });
		return obj as unknown as CardRow;
	}

	private rowToSchedule(columns: string[], values: unknown[]): CardScheduleRow {
		const obj: Record<string, unknown> = {};
		columns.forEach((col, i) => { obj[col] = values[i]; });
		return obj as unknown as CardScheduleRow;
	}

	private rowToCardWithSchedule(columns: string[], values: unknown[]): CardRow & CardScheduleRow {
		const obj: Record<string, unknown> = {};
		columns.forEach((col, i) => { obj[col] = values[i]; });
		return obj as unknown as CardRow & CardScheduleRow;
	}

	private rowToReviewLog(columns: string[], values: unknown[]): ReviewLogRow {
		const obj: Record<string, unknown> = {};
		columns.forEach((col, i) => { obj[col] = values[i]; });
		return obj as unknown as ReviewLogRow;
	}

	private escape(str: string): string {
		return str.replace(/'/g, "''");
	}
}
