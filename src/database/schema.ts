export const SCHEMA_VERSION = 3;

/** Migrations keyed by target version. Applied in order for existing DBs. */
export const MIGRATIONS: Record<number, string> = {
	2: `ALTER TABLE cards ADD COLUMN type_in INTEGER NOT NULL DEFAULT 0;`,
	3: `
		CREATE TABLE cards_new (
			id TEXT PRIMARY KEY,
			note_path TEXT NOT NULL,
			deck TEXT NOT NULL DEFAULT '',
			card_type TEXT NOT NULL CHECK (card_type IN ('explicit', 'explicit_bidi', 'explicit_cloze')),
			front TEXT NOT NULL,
			back TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			deleted_at INTEGER,
			type_in INTEGER NOT NULL DEFAULT 0
		);
		INSERT INTO cards_new SELECT * FROM cards WHERE card_type IN ('explicit', 'explicit_bidi');
		DROP TABLE cards;
		ALTER TABLE cards_new RENAME TO cards;
		CREATE INDEX IF NOT EXISTS idx_cards_note_path ON cards(note_path);
		CREATE INDEX IF NOT EXISTS idx_cards_deck ON cards(deck);
		CREATE INDEX IF NOT EXISTS idx_cards_deleted ON cards(deleted_at);
	`,
};

export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS cards (
	id TEXT PRIMARY KEY,
	note_path TEXT NOT NULL,
	deck TEXT NOT NULL DEFAULT '',
	card_type TEXT NOT NULL CHECK (card_type IN ('explicit', 'explicit_bidi', 'explicit_cloze')),
	front TEXT NOT NULL,
	back TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	deleted_at INTEGER,
	type_in INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS card_schedule (
	card_id TEXT PRIMARY KEY,
	stability REAL NOT NULL DEFAULT 0,
	difficulty REAL NOT NULL DEFAULT 0,
	due INTEGER NOT NULL,
	last_review INTEGER,
	reps INTEGER NOT NULL DEFAULT 0,
	lapses INTEGER NOT NULL DEFAULT 0,
	state TEXT NOT NULL DEFAULT 'new' CHECK (state IN ('new', 'learning', 'review', 'relearning')),
	FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS review_log (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	card_id TEXT NOT NULL,
	rating INTEGER NOT NULL CHECK (rating IN (1, 2, 3, 4)),
	study_mode TEXT NOT NULL CHECK (study_mode IN ('sequential', 'contextual', 'spatial')),
	reviewed_at INTEGER NOT NULL,
	elapsed_days REAL NOT NULL,
	scheduled_days REAL NOT NULL,
	FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cards_note_path ON cards(note_path);
CREATE INDEX IF NOT EXISTS idx_cards_deck ON cards(deck);
CREATE INDEX IF NOT EXISTS idx_cards_deleted ON cards(deleted_at);
CREATE INDEX IF NOT EXISTS idx_schedule_due ON card_schedule(due);
CREATE INDEX IF NOT EXISTS idx_schedule_state ON card_schedule(state);
CREATE INDEX IF NOT EXISTS idx_review_log_card ON review_log(card_id);
CREATE INDEX IF NOT EXISTS idx_review_log_reviewed ON review_log(reviewed_at);
`;
