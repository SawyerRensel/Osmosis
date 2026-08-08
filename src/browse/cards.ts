import type { Card, CardState, CardType } from "../database/types";

/**
 * Pure logic behind the card browser: cards in, filtered/sorted/grouped rows
 * out. Nothing here touches Bases, the vault, the DOM, or the clock — `now` is
 * always a parameter — so the whole surface is testable as a function of a
 * synthetic `Card[]`.
 *
 * The division of labour this module sits inside is the feature's central
 * constraint: **Bases owns which notes appear, Osmosis owns the cards inside
 * them.** A Bases row is a file (`BasesEntry.file` is required and there is no
 * plugin row source), and a note routinely holds many cards, so every
 * per-card predicate has to live here rather than in a `.base` filter.
 *
 * The view therefore hands `buildGroups`/`buildFlat` the note order Bases
 * produced and a lookup into the card store, and gets back exactly what to
 * render.
 */

const MS_PER_DAY = 86_400_000;

// ── Options ───────────────────────────────────────────────────

/** How cards are laid out. `table` is flat; `list` and `cards` group by note. */
export type Layout = "table" | "list" | "cards";

export type CardStateFilter = "all" | CardState;

export type DueWindow = "any" | "overdue" | "today" | "7d" | "30d";

/**
 * `base` defers to the order Bases produced, which is the only way the toolbar's
 * Sort menu can reach a flat card table — our own sort would otherwise overwrite
 * it. Every other value sorts cards by a field Bases cannot see.
 */
export type SortBy =
	| "base"
	| "due"
	| "state"
	| "stability"
	| "difficulty"
	| "reps"
	| "lapses"
	| "note"
	| "deck";

/**
 * Every card type the browser can filter to.
 *
 * `occlusion` is deliberately absent: image occlusion is a later task and a
 * filter value that can never match anything reads as a broken control. It
 * arrives with the card type.
 */
export const FILTERABLE_CARD_TYPES: readonly CardType[] = [
	"explicit", "explicit_bidi", "explicit_cloze", "code_cloze", "line",
];

/** The options Bases persists into the `.base` file. */
export interface BrowseOptions {
	layout: Layout;
	cardState: CardStateFilter;
	dueWindow: DueWindow;
	/**
	 * The card types to show. Multi-select, because "Basic and code cloze" is a
	 * real question a dropdown cannot ask. Empty means no constraint rather than
	 * "show nothing", so unchecking every box degrades to showing everything
	 * instead of to a blank panel.
	 */
	cardTypes: ReadonlySet<CardType>;
	sortBy: SortBy;
	/**
	 * Include suspended cards. Note this means `disabled` (fully out of study,
	 * FSRS state preserved) and *not* `excludeFromDecks` — the line-card opt-out
	 * is still studied in place, so those cards are never hidden here.
	 */
	showDisabled: boolean;
	/** Free-text query over card content. Empty matches everything. */
	search: string;
	/** Tile height in pixels, for the cards layout only. */
	tileHeight: number;
}

/** Slider bounds for `tileHeight`. */
export const TILE_HEIGHT = { min: 120, max: 480, step: 20, default: 200 } as const;

export const DEFAULT_BROWSE_OPTIONS: BrowseOptions = {
	layout: "table",
	cardState: "all",
	dueWindow: "any",
	cardTypes: new Set(FILTERABLE_CARD_TYPES),
	sortBy: "due",
	showDisabled: false,
	search: "",
	tileHeight: TILE_HEIGHT.default,
};

/** The option key holding the toggle for one card type. */
export function cardTypeOptionKey(cardType: CardType): string {
	return `type_${cardType}`;
}

const LAYOUTS: readonly Layout[] = ["table", "list", "cards"];
const CARD_STATES: readonly CardStateFilter[] = ["all", "new", "learning", "review", "relearning"];
const DUE_WINDOWS: readonly DueWindow[] = ["any", "overdue", "today", "7d", "30d"];
const SORT_KEYS: readonly SortBy[] = [
	"base", "due", "state", "stability", "difficulty", "reps", "lapses", "note", "deck",
];

/**
 * Narrow the options out of a Bases config.
 *
 * `BasesViewConfig.get()` returns `unknown` — the values come from a `.base`
 * file the user can hand-edit, so an unrecognised value is expected rather than
 * exceptional and falls back to the default instead of throwing.
 */
export function readBrowseOptions(get: (key: string) => unknown): BrowseOptions {
	const cardTypes = new Set<CardType>();
	for (const cardType of FILTERABLE_CARD_TYPES) {
		// Absent means on: a base file written before a card type existed should
		// show it, not hide it.
		if (get(cardTypeOptionKey(cardType)) !== false) cardTypes.add(cardType);
	}

	return {
		layout: oneOf(get("layout"), LAYOUTS, DEFAULT_BROWSE_OPTIONS.layout),
		cardState: oneOf(get("cardState"), CARD_STATES, DEFAULT_BROWSE_OPTIONS.cardState),
		dueWindow: oneOf(get("dueWindow"), DUE_WINDOWS, DEFAULT_BROWSE_OPTIONS.dueWindow),
		cardTypes,
		sortBy: oneOf(get("sortBy"), SORT_KEYS, DEFAULT_BROWSE_OPTIONS.sortBy),
		showDisabled: get("showDisabled") === true,
		search: typeof get("search") === "string" ? (get("search") as string).trim() : "",
		tileHeight: clampTileHeight(get("tileHeight")),
	};
}

function oneOf<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
	if (typeof raw !== "string") return fallback;
	return (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

function clampTileHeight(raw: unknown): number {
	const value = typeof raw === "number" ? raw : Number(raw);
	if (!Number.isFinite(value)) return TILE_HEIGHT.default;
	return Math.min(TILE_HEIGHT.max, Math.max(TILE_HEIGHT.min, Math.round(value)));
}

// ── Predicates ────────────────────────────────────────────────

/**
 * The state to treat a card as being in.
 *
 * Absence of `due` is what makes a card new everywhere else in the codebase
 * (`CardStore.getNewCards`), so it wins over a stale `state` field rather than
 * the other way round — a reset card has both cleared, but a half-written one
 * should still read as new.
 */
export function effectiveState(card: Card): CardState {
	if (card.due === undefined) return "new";
	return card.state ?? "new";
}

export function matchesState(card: Card, filter: CardStateFilter): boolean {
	return filter === "all" || effectiveState(card) === filter;
}

/** An empty selection means "no constraint" rather than "nothing". */
export function matchesTypes(card: Card, types: ReadonlySet<CardType>): boolean {
	return types.size === 0 || types.has(card.cardType);
}

/**
 * Free-text match over a card's own content.
 *
 * This is the search Bases cannot run: its search box matches note text, and a
 * note holding forty cards either matches for all of them or none. Deck and ID
 * are included because both are things you already have in hand when you go
 * looking for one specific card.
 */
export function matchesSearch(card: Card, query: string): boolean {
	if (query === "") return true;
	const needle = query.toLowerCase();
	return card.front.toLowerCase().includes(needle)
		|| card.back.toLowerCase().includes(needle)
		|| card.deck.toLowerCase().includes(needle)
		|| card.id.toLowerCase().includes(needle);
}

/**
 * Whether a card falls in a due window.
 *
 * Every window except `overdue` means "due on or before X", so a backlog card
 * is in "today", "7d" and "30d" alike — a user filtering to the next 7 days
 * wants their upcoming workload, and the backlog is part of it. `overdue` is
 * the one strictly-before window, for isolating that backlog.
 *
 * New cards have no due date and so match no window but `any`.
 */
export function matchesDueWindow(card: Card, window: DueWindow, now: number): boolean {
	if (window === "any") return true;
	if (card.due === undefined) return false;

	const offset = dayOffset(card.due, now);
	switch (window) {
		case "overdue": return offset < 0;
		case "today": return offset <= 0;
		case "7d": return offset <= 7;
		case "30d": return offset <= 30;
	}
}

/** Whole days from `now`'s local midnight to `due`'s. Negative = overdue. */
export function dayOffset(due: number, now: number): number {
	return Math.round((startOfDay(due) - startOfDay(now)) / MS_PER_DAY);
}

function startOfDay(ms: number): number {
	const d = new Date(ms);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

/** Apply every per-card filter. */
export function filterCards(
	cards: readonly Card[],
	options: BrowseOptions,
	now: number,
): Card[] {
	return cards.filter((card) => {
		if (card.disabled && !options.showDisabled) return false;
		return matchesState(card, options.cardState)
			&& matchesTypes(card, options.cardTypes)
			&& matchesDueWindow(card, options.dueWindow, now)
			&& matchesSearch(card, options.search);
	});
}

// ── Sorting ───────────────────────────────────────────────────

/** Order states run through, so "sort by state" advances through the lifecycle. */
const STATE_ORDER: Record<CardState, number> = {
	new: 0,
	learning: 1,
	relearning: 2,
	review: 3,
};

/**
 * Sort a card list, returning a new array.
 *
 * The numeric keys sort **most noteworthy first**, which is what you open a
 * browser to find: hardest, most-lapsed and most-reviewed at the top. Stability
 * is the one that inverts — low stability is the weak card worth looking at, so
 * it ascends while the others descend.
 *
 * Cards missing the key always sink to the bottom, whichever direction the key
 * runs, so a column of new cards never buries the reviewed ones it is sorted
 * against. Ties break on note path then source line then id, so the order is
 * total and stable across renders.
 */
export function sortCards(cards: readonly Card[], sortBy: SortBy): Card[] {
	// "Base order" means the caller's order is already the answer — Bases sorted
	// the notes, and within a note document order is the only meaningful
	// sequence. Sorting here would be exactly what destroys it.
	if (sortBy === "base") {
		return [...cards].sort((a, b) => a.sourceLine - b.sourceLine || a.id.localeCompare(b.id));
	}

	const sorted = [...cards];
	sorted.sort((a, b) => compare(a, b, sortBy) || tieBreak(a, b));
	return sorted;
}

function compare(a: Card, b: Card, sortBy: SortBy): number {
	switch (sortBy) {
		case "base": return 0;
		case "due": return numeric(a.due, b.due, "asc");
		case "state": return STATE_ORDER[effectiveState(a)] - STATE_ORDER[effectiveState(b)];
		case "stability": return numeric(a.stability, b.stability, "asc");
		case "difficulty": return numeric(a.difficulty, b.difficulty, "desc");
		case "reps": return numeric(a.reps, b.reps, "desc");
		case "lapses": return numeric(a.lapses, b.lapses, "desc");
		case "note": return a.notePath.localeCompare(b.notePath);
		case "deck": return a.deck.localeCompare(b.deck);
	}
}

function numeric(a: number | undefined, b: number | undefined, dir: "asc" | "desc"): number {
	// Missing values sink regardless of direction — see sortCards.
	if (a === undefined && b === undefined) return 0;
	if (a === undefined) return 1;
	if (b === undefined) return -1;
	return dir === "asc" ? a - b : b - a;
}

function tieBreak(a: Card, b: Card): number {
	return a.notePath.localeCompare(b.notePath)
		|| a.sourceLine - b.sourceLine
		|| a.id.localeCompare(b.id);
}

// ── Grouping ──────────────────────────────────────────────────

/** One note and the cards inside it, for the grouped layouts. */
export interface NoteGroup {
	notePath: string;
	/** Every distinct deck the note's surviving cards land in, sorted. */
	decks: string[];
	cards: Card[];
}

/**
 * Expand Bases' note order into per-note card groups.
 *
 * The note order is Bases' to decide — it is the user's `.base` sort — so it is
 * taken as given and only the cards *within* each note are sorted. Notes whose
 * cards are all filtered out drop entirely, so a state or due filter thins the
 * list of notes rather than leaving empty headings behind.
 */
export function buildGroups(
	notePaths: readonly string[],
	cardsByNote: (notePath: string) => readonly Card[],
	options: BrowseOptions,
	now: number,
): NoteGroup[] {
	const groups: NoteGroup[] = [];
	for (const notePath of notePaths) {
		const cards = sortCards(filterCards(cardsByNote(notePath), options, now), options.sortBy);
		if (cards.length === 0) continue;
		groups.push({
			notePath,
			decks: [...new Set(cards.map((card) => card.deck))].sort(),
			cards,
		});
	}
	return groups;
}

/**
 * Every surviving card across every note, as one globally sorted list.
 *
 * This is the table layout, where sort is genuinely global — grouping by note
 * there would defeat sorting by difficulty or lapses, which is most of the
 * reason to open a table.
 */
export function buildFlat(
	notePaths: readonly string[],
	cardsByNote: (notePath: string) => readonly Card[],
	options: BrowseOptions,
	now: number,
): Card[] {
	// Under "base order" the flat list is built note by note, so the sequence
	// Bases sorted survives. Sorting the merged list instead would interleave
	// notes and throw that order away — which is what made the toolbar's Sort
	// menu look broken in the table.
	if (options.sortBy === "base") {
		const ordered: Card[] = [];
		for (const notePath of notePaths) {
			ordered.push(...sortCards(filterCards(cardsByNote(notePath), options, now), "base"));
		}
		return ordered;
	}

	const all: Card[] = [];
	for (const notePath of notePaths) {
		all.push(...cardsByNote(notePath));
	}
	return sortCards(filterCards(all, options, now), options.sortBy);
}

// ── Row projection ────────────────────────────────────────────

/** A card flattened into display strings, one per browser column. */
export interface CardRow {
	card: Card;
	state: CardState;
	typeLabel: string;
	deck: string;
	due: string;
	stability: string;
	difficulty: string;
	reps: string;
	lapses: string;
	front: string;
	back: string;
	suspended: boolean;
}

const TYPE_LABELS: Record<CardType, string> = {
	explicit: "Basic",
	explicit_bidi: "Bidirectional",
	explicit_cloze: "Cloze",
	code_cloze: "Code cloze",
	line: "Line",
};

export function typeLabel(cardType: CardType): string {
	return TYPE_LABELS[cardType];
}

/** Placeholder for a field a new card has no value for. */
const EMPTY = "—";

export function toRow(card: Card, now: number): CardRow {
	return {
		card,
		state: effectiveState(card),
		typeLabel: typeLabel(card.cardType),
		deck: card.deck === "" ? EMPTY : card.deck,
		due: formatDue(card.due, now),
		stability: formatNumber(card.stability, 1),
		difficulty: formatNumber(card.difficulty, 1),
		reps: formatNumber(card.reps, 0),
		lapses: formatNumber(card.lapses, 0),
		front: previewText(card.front),
		back: previewText(card.back),
		suspended: card.disabled === true,
	};
}

/**
 * Due dates read as distance, not calendar, for the range where distance is
 * what you are actually judging — the far column of a browser is scanned for
 * "how late am I", and "6d overdue" answers that where "Aug 2" does not.
 */
export function formatDue(due: number | undefined, now: number): string {
	if (due === undefined) return EMPTY;

	const offset = dayOffset(due, now);
	if (offset < 0) return `${String(-offset)}d overdue`;
	if (offset === 0) return "today";
	if (offset === 1) return "tomorrow";

	const date = new Date(due);
	const sameYear = date.getFullYear() === new Date(now).getFullYear();
	return date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		...(sameYear ? {} : { year: "numeric" }),
	});
}

function formatNumber(value: number | undefined, decimals: number): string {
	if (value === undefined) return EMPTY;
	return value.toFixed(decimals);
}

/** Longest front preview a row shows before ellipsis. */
const PREVIEW_LIMIT = 80;

/**
 * A card's front collapsed to one scannable line. Cloze and code cards carry
 * newlines and runs of indentation that would otherwise stretch a table row to
 * the height of a code block.
 */
export function previewText(front: string): string {
	const flat = front.replace(/\s+/g, " ").trim();
	if (flat.length <= PREVIEW_LIMIT) return flat;
	return `${flat.slice(0, PREVIEW_LIMIT - 1).trimEnd()}…`;
}
