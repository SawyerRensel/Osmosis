/**
 * Moving a note's Osmosis data between the note and its sidecar file — the
 * pure half of the "Move data …" commands. `DataMover` reads and
 * writes the files; everything that decides what the files say is here.
 *
 * **What moves.** `osmosis-schedule` and `osmosis-styles` frontmatter, and each
 * fence header's review state (schedules, buries, `exclude`, shape sets),
 * which in a sidecar lives under `osmosis-fences.<id>` (see `fence-sidecar.ts`).
 * `id`, `deck`, `bidi`, `type-in` and `hint` define a card and never move.
 *
 * **The merge rule** — for a note whose data is half in each place: the most
 * recent copy wins ({@link mergeMostRecent}). Each card keeps the copy with
 * the later review; `osmosis-styles` come whole from the file modified last.
 * Both plans check the result rather than trust it: each compares every fence
 * card (schedule, bury, suspension, masks, text) and the frontmatter data of
 * the merge with what the files it writes read back as — re-reading the text
 * it produced, so a lossy YAML round trip counts too — and throws
 * {@link MoveCheckError} instead of returning a plan that would differ.
 *
 * Pure: no Obsidian imports. The YAML codec is passed in.
 */
import { generateExplicitCards } from "../card-gen/explicit";
import type { GeneratedCard } from "../card-gen/types";
import {
	FENCES_FRONTMATTER_KEY,
	fenceEntryFromContent,
	fenceOcclusionOverrides,
	overlayFenceCards,
	parseFenceEntry,
	parseFencesFrontmatter,
} from "./fence-sidecar";
import { listFenceIds, stripFenceReviewState, writeFenceReviewState } from "./FenceWriter";
import { parseTimestamp } from "./ScheduleStore";
import { SIDECAR_KEYS, hasSidecarKeys, mergeNoteData } from "./sidecar";

const SCHEDULE_KEY = "osmosis-schedule";
const STYLES_KEY = "osmosis-styles";

type Frontmatter = Record<string, unknown>;

/** Obsidian's `parseYaml` / `stringifyYaml`, passed in so this module stays pure. */
export interface YamlCodec {
	parse(text: string): unknown;
	stringify(value: unknown): string;
}

/** A plan would have changed what Osmosis reads, so it was not made. Nothing was written. */
export class MoveCheckError extends Error {}

function isPlainObject(value: unknown): value is Frontmatter {
	return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

// ── Frontmatter text ───────────────────────────────────

const FRONTMATTER = /^---\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

/** A note split into its frontmatter block (raw, `null` when it has none) and the rest. */
export function splitFrontmatter(content: string): { block: string | null; yaml: string; body: string } {
	const match = FRONTMATTER.exec(content);
	if (!match) return { block: null, yaml: "", body: content };
	return { block: match[0], yaml: match[1] ?? "", body: content.slice(match[0].length) };
}

/** A frontmatter block's mapping. Throws when it is not a mapping: a move never guesses. */
export function parseFrontmatter(yaml: string, codec: YamlCodec): Frontmatter {
	if (yaml.trim() === "") return {};
	const parsed = codec.parse(yaml);
	if (parsed === null || parsed === undefined) return {};
	if (!isPlainObject(parsed)) throw new MoveCheckError("The note's properties are not a YAML mapping.");
	return parsed;
}

/** The frontmatter mapping of a whole file's text (a sidecar's, say). */
export function frontmatterOfText(content: string, codec: YamlCodec): Frontmatter {
	return parseFrontmatter(splitFrontmatter(content).yaml, codec);
}

function joinFrontmatter(frontmatter: Frontmatter, body: string, codec: YamlCodec): string {
	if (Object.keys(frontmatter).length === 0) return body;
	const yaml = codec.stringify(frontmatter);
	return `---\n${yaml}${yaml.endsWith("\n") ? "" : "\n"}---\n${body}`;
}

// ── Fence headers ──────────────────────────────────────

/**
 * Every fence header's review state, as `osmosis-fences` entries, and the
 * content with it stripped. A fence with no review state gets no entry.
 */
export function extractFenceState(content: string): { content: string; fences: Frontmatter } {
	const cards = generateExplicitCards(content);
	const fences: Frontmatter = {};
	let next = content;
	for (const id of listFenceIds(content)) {
		const entry = fenceEntryFromContent(content, id, cards);
		if (Object.keys(entry).length > 0) fences[id] = entry;
		next = stripFenceReviewState(next, id);
	}
	return { content: next, fences };
}

/**
 * `content` with each fence in `fences` (an `osmosis-fences` value) holding
 * exactly its entry's review state, in the layout `FenceWriter` writes. An
 * entry for a fence not in `content`, or one that is not a mapping, is skipped.
 */
export function injectFenceState(content: string, fences: Frontmatter): string {
	let next = content;
	for (const [id, raw] of Object.entries(fences)) {
		const overlay = parseFenceEntry(raw);
		if (overlay) next = writeFenceReviewState(next, id, overlay);
	}
	return next;
}

// ── The check ──────────────────────────────────────────

const toSecond = (ms: number | undefined): number | null => (ms === undefined ? null : Math.floor(ms / 1000));
const round4 = (value: number | undefined): number | null => (value === undefined ? null : Math.round(value * 1e4) / 1e4);

/**
 * What a note's fence cards are, as Osmosis reads them from `content` plus the
 * merged frontmatter `data`. Timestamps compare to the second and numbers to
 * four places: the precision both carriers write.
 */
function fenceCardSnapshot(content: string, data: Frontmatter): string {
	const overlays = parseFencesFrontmatter(data[FENCES_FRONTMATTER_KEY]);
	const cards = overlayFenceCards(generateExplicitCards(content, fenceOcclusionOverrides(overlays)), overlays);
	const rows = cards.map((card: GeneratedCard) => JSON.stringify([
		card.id, card.card_type, card.front, card.back, card.deck, card.typeIn, card.disabled === true,
		card.occlusion ?? null, toSecond(card.due), round4(card.stability), round4(card.difficulty),
		toSecond(card.lastReview), card.reps ?? null, card.lapses ?? null, card.state ?? null,
		card.learningSteps ?? null, toSecond(card.buriedUntil),
	]));
	return rows.sort().join("\n");
}

/** A frontmatter value for comparison: an empty mapping reads the same as none. */
function comparable(value: unknown): string {
	return isPlainObject(value) && Object.keys(value).length === 0 ? "null" : JSON.stringify(value ?? null);
}

function check(beforeContent: string, before: Frontmatter, afterContent: string, after: Frontmatter): void {
	for (const key of [SCHEDULE_KEY, STYLES_KEY]) {
		if (comparable(before[key]) !== comparable(after[key])) {
			throw new MoveCheckError(`Moving would have changed ${key}.`);
		}
	}
	if (fenceCardSnapshot(beforeContent, before) !== fenceCardSnapshot(afterContent, after)) {
		throw new MoveCheckError("Moving would have changed a fence card's review state.");
	}
}

// ── The merge rule ─────────────────────────────────────

/** Each file's last modification (`TFile.stat.mtime`, ms): what decides `osmosis-styles`. */
export interface FileTimes {
	note: number;
	sidecar: number;
}

/** A fence entry's own-card fields, which sit flat in the entry. */
const OWN_CARD_FIELDS = new Set(["due", "stability", "difficulty", "lastReview", "reps", "lapses", "state", "learningSteps", "buriedUntil"]);
/** A fence entry's derived-card blocks: the header's `r:` / `c1:` grammar. */
const DERIVED_KEY = /^(r|c\d+)$/;

/** One entry cut into its cards (by suffix; `""` = the entry's own card) and the rest (flags, shapes). */
interface Cut {
	cards: Map<string, Frontmatter>;
	rest: Frontmatter;
}

/** A card copy's last review, to the second (the precision both carriers write). Never reviewed: -Infinity. */
function reviewedAt(card: Frontmatter): number {
	const time = parseTimestamp(card["lastReview"]);
	return time === null ? -Infinity : Math.floor(time / 1000);
}

function lastReviewIn(cut: Cut): number {
	let latest = -Infinity;
	for (const card of cut.cards.values()) latest = Math.max(latest, reviewedAt(card));
	return latest;
}

/** An `osmosis-fences` entry: own card flat, `r:` / `cN:` blocks; the rest is `exclude` and shape sets. */
function cutFence(entry: Frontmatter): Cut {
	const own: Frontmatter = {};
	const cards = new Map<string, Frontmatter>();
	const rest: Frontmatter = {};
	for (const [key, value] of Object.entries(entry)) {
		if (OWN_CARD_FIELDS.has(key)) own[key] = value;
		else if (DERIVED_KEY.test(key) && isPlainObject(value)) cards.set(key, value);
		else rest[key] = value;
	}
	if (Object.keys(own).length > 0) cards.set("", own);
	return { cards, rest };
}

/** An `osmosis-schedule` entry: plain, one card; occluded, a card per group block beside the shape set. */
function cutLine(entry: Frontmatter): Cut {
	if (!isPlainObject(entry["occlude"])) return { cards: new Map([["", entry]]), rest: {} };
	const cards = new Map<string, Frontmatter>();
	const rest: Frontmatter = {};
	for (const [key, value] of Object.entries(entry)) {
		if (key !== "occlude" && isPlainObject(value)) cards.set(key, value);
		else rest[key] = value;
	}
	return { cards, rest };
}

/**
 * Two copies of one entry, merged: each card from the copy with its later
 * review, the rest (`exclude`, shape sets) from the copy holding the entry's
 * latest review. A card only one copy has comes from that copy. Ties — no
 * review on either side included — go to the sidecar, which is what Osmosis
 * reads today.
 */
function mergeCuts(note: Cut, side: Cut): Frontmatter {
	const owner = lastReviewIn(note) > lastReviewIn(side) ? note : side;
	const own: Frontmatter = {};
	const derived: Frontmatter = {};
	for (const key of new Set([...side.cards.keys(), ...note.cards.keys()])) {
		const ours = note.cards.get(key);
		const theirs = side.cards.get(key);
		const card = theirs === undefined || (ours !== undefined && reviewedAt(ours) > reviewedAt(theirs)) ? ours! : theirs;
		if (key === "") Object.assign(own, card);
		else derived[key] = card;
	}
	return { ...own, ...owner.rest, ...derived };
}

/** Merge two entry maps key by key with `mergeEntry`; a key only one side has keeps that side's value. */
function mergeMaps(note: unknown, side: unknown, mergeEntry: (note: Frontmatter, side: Frontmatter) => Frontmatter): unknown {
	if (side === undefined) return note;
	if (note === undefined) return side;
	// Hand-edited YAML that is not a mapping: keep what Osmosis reads today.
	if (!isPlainObject(note) || !isPlainObject(side)) return side;
	const merged: Frontmatter = { ...note };
	for (const [key, theirs] of Object.entries(side)) {
		const ours = note[key];
		merged[key] = isPlainObject(ours) && isPlainObject(theirs) ? mergeEntry(ours, theirs) : theirs;
	}
	return merged;
}

function mergeLineEntry(note: Frontmatter, side: Frontmatter): Frontmatter {
	const ours = cutLine(note);
	const theirs = cutLine(side);
	// One copy occluded and the other not: they share no card layout, so the
	// copy with the later review is taken whole.
	if (isPlainObject(note["occlude"]) !== isPlainObject(side["occlude"])) {
		return lastReviewIn(ours) > lastReviewIn(theirs) ? note : side;
	}
	return mergeCuts(ours, theirs);
}

function mergeFenceEntry(note: Frontmatter, side: Frontmatter): Frontmatter {
	return mergeCuts(cutFence(note), cutFence(side));
}

/**
 * What a note half in each place should hold: its `SIDECAR_KEYS` data, the
 * most recent copy winning.
 *
 * - **Cards** (`osmosis-schedule` line cards, and every card of every fence —
 *   own card, `r:`, `cN:`): the copy whose `lastReview` is later, compared to
 *   the second. A reviewed copy beats one never reviewed; a tie, or neither
 *   reviewed, goes to the sidecar. A card's `disabled` and `buriedUntil` travel
 *   with its winning copy.
 * - **Fence-wide fields** (`exclude`, occlusion shape sets) and an occluded
 *   line card's shape set: from the copy holding the latest review of any card
 *   in the entry (ties to the sidecar), so masks stay with the schedules that
 *   were studied against them.
 * - **`osmosis-styles`**: whole, from the file with the later `mtime` (ties to
 *   the sidecar).
 *
 * The note's copy of a fence is its own `osmosis-fences` entry if it has one,
 * else its header's state (`headerFences`, from {@link extractFenceState}).
 * Keys neither side has are absent from the result.
 */
export function mergeMostRecent(
	note: Frontmatter,
	headerFences: Frontmatter,
	sidecar: Frontmatter | undefined,
	times: FileTimes,
): Frontmatter {
	const side = sidecar ?? {};
	const ownFences = note[FENCES_FRONTMATTER_KEY];
	// An `osmosis-fences` entry in the note owns its fence, as on read.
	const noteFences = Object.keys(headerFences).length === 0 ? ownFences : mergeMaps(headerFences, ownFences, (_header, own) => own);
	const values: Frontmatter = {
		[SCHEDULE_KEY]: mergeMaps(note[SCHEDULE_KEY], side[SCHEDULE_KEY], mergeLineEntry),
		[FENCES_FRONTMATTER_KEY]: mergeMaps(noteFences, side[FENCES_FRONTMATTER_KEY], mergeFenceEntry),
		[STYLES_KEY]: side[STYLES_KEY] === undefined || (note[STYLES_KEY] !== undefined && times.note > times.sidecar)
			? note[STYLES_KEY]
			: side[STYLES_KEY],
	};
	const result: Frontmatter = {};
	for (const key of SIDECAR_KEYS) if (values[key] !== undefined) result[key] = values[key];
	return result;
}

// ── Plans ──────────────────────────────────────────────

export interface ToSidecarPlan {
	/** The note's new text: no moved keys, lean fence headers. */
	note: string;
	/** The sidecar's `SIDECAR_KEYS` values after the move; a key absent here is absent there. */
	sidecar: Frontmatter;
	/** False when the note held nothing to move (the plan changes nothing). */
	moved: boolean;
}

/**
 * Move `note`'s data into its sidecar, whose current frontmatter is
 * `sidecarFrontmatter` (none yet: `undefined`). Where both hold a copy, the
 * most recent wins ({@link mergeMostRecent}); `times` are the two files' mtimes.
 */
export function planToSidecar(
	note: string,
	sidecarFrontmatter: Frontmatter | undefined,
	codec: YamlCodec,
	times: FileTimes,
): ToSidecarPlan {
	const { block, yaml, body } = splitFrontmatter(note);
	const extracted = extractFenceState(body);
	// A note with nothing to move is left alone before its properties are
	// parsed, so one Osmosis has no business with never fails on them.
	if (extracted.content === body && !SIDECAR_KEYS.some((key) => yaml.includes(key))) {
		return { note, sidecar: {}, moved: false };
	}
	const own = parseFrontmatter(yaml, codec);
	const side = sidecarFrontmatter ?? {};
	const won = mergeMostRecent(own, extracted.fences, side, times);

	const sidecar: Frontmatter = {};
	for (const key of SIDECAR_KEYS) {
		const value = won[key];
		// No empty mapping the sidecar did not already have (an emptied fence
		// entry inside one is kept: it still owns its fence).
		if (value === undefined || (comparable(value) === "null" && side[key] === undefined)) continue;
		sidecar[key] = value;
	}

	const moved = hasSidecarKeys(own) || extracted.content !== body;
	const lean: Frontmatter = { ...own };
	for (const key of SIDECAR_KEYS) delete lean[key];
	// Untouched properties keep their text; only a note that loses keys is re-serialized.
	const head = hasSidecarKeys(own) ? null : block;
	const next = head === null ? joinFrontmatter(lean, extracted.content, codec) : head + extracted.content;

	// Once moved, Osmosis reads the sidecar over the note: that must be the merge.
	check(note, won, next, mergeNoteData(frontmatterOfText(next, codec), { ...side, ...sidecar }));
	return { note: next, sidecar, moved };
}

export interface IntoNotePlan {
	/** The note's new text, holding all its data. */
	note: string;
	/** Fence entries dropped because no fence in the note carries their id. */
	dropped: number;
}

/**
 * Move a sidecar's data (`sidecarFrontmatter`) back into `note`, the most
 * recent copy winning where both hold one ({@link mergeMostRecent}; `times`
 * are the two files' mtimes). The note's frontmatter takes `osmosis-schedule`
 * / `osmosis-styles`, each fence header its entry, and the note's own
 * `osmosis-fences` goes (it is folded into the headers too). A fence only the
 * header holds state for keeps its header text. A note left with none of the
 * keys gets an empty `osmosis-schedule`, so it stays in note mode whatever the
 * data location setting says.
 */
export function planIntoNote(note: string, sidecarFrontmatter: Frontmatter, codec: YamlCodec, times: FileTimes): IntoNotePlan {
	const { yaml, body } = splitFrontmatter(note);
	const own = parseFrontmatter(yaml, codec);
	const won = mergeMostRecent(own, extractFenceState(body).fences, sidecarFrontmatter, times);

	const fences = isPlainObject(won[FENCES_FRONTMATTER_KEY]) ? won[FENCES_FRONTMATTER_KEY] : {};
	// Rewrite only the headers an entry outside them had a say in.
	const entries = new Set([
		...Object.keys(isPlainObject(own[FENCES_FRONTMATTER_KEY]) ? own[FENCES_FRONTMATTER_KEY] : {}),
		...Object.keys(isPlainObject(sidecarFrontmatter[FENCES_FRONTMATTER_KEY]) ? sidecarFrontmatter[FENCES_FRONTMATTER_KEY] : {}),
	]);
	const present = new Set(listFenceIds(body));
	const kept: Frontmatter = {};
	let dropped = 0;
	for (const [id, entry] of Object.entries(fences)) {
		if (!present.has(id)) dropped++;
		else if (entries.has(id)) kept[id] = entry;
	}

	const next: Frontmatter = { ...own };
	delete next[FENCES_FRONTMATTER_KEY];
	for (const key of [SCHEDULE_KEY, STYLES_KEY]) {
		if (won[key] === undefined) delete next[key];
		else next[key] = won[key];
	}
	if (!hasSidecarKeys(next)) next[SCHEDULE_KEY] = {};
	const content = joinFrontmatter(next, injectFenceState(body, kept), codec);

	check(note, won, content, frontmatterOfText(content, codec));
	return { note: content, dropped };
}
