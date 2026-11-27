/**
 * Fence review data kept in a sidecar's `osmosis-fences` frontmatter rather
 * than in the fence header — the sidecar-mode carrier for fence cards.
 *
 * ```yaml
 * osmosis-fences:
 *   a3f7b2c1:            # the fence's base `id`
 *     due: 2026-11-20T09:00:00   # the fence's own card, flat
 *     stability: 3.2
 *     …
 *     buriedUntil: 2026-11-28T04:00:00
 *     exclude: true      # the whole fence is suspended
 *     r:                 # bidi reverse
 *       due: …
 *     c1:                # cloze / occlusion group
 *       due: …
 *     occlude:           # an occlusion shape set, keyed as in the header:
 *       mode: hide-all-guess-one   # `occlude` for an unlabelled embed,
 *       shapes:                    # `occlude-a` for the embed marked `{a}`
 *         - group: c1
 *           kind: rect
 *           x: 0.1
 *           …
 *       annotations: …   # optional, as in the header
 * ```
 *
 * The shape is the fence header's, in the field spelling `osmosis-schedule`
 * writes (`serializeScheduleEntry`), so a fence card and a line card read alike.
 * A shape set is the object an occluded line card keeps under its own `occlude:`
 * (`occlusionSetToYamlValue`), so the two carriers hold one structure.
 * `id`, `deck`, `bidi` and `type-in` define the card and stay in the fence.
 *
 * **An entry owns its fence.** Once a fence has an `osmosis-fences` entry, that
 * entry is the whole truth about the fence's schedules, buries, `exclude` and
 * shape sets, and the header's own copies of them are ignored — even an empty
 * entry. So the first sidecar write for a fence seeds its entry from the header
 * ({@link fenceEntryFromContent}, shapes included), and from then on a reset,
 * un-suspend or deleted mask can drop fields without a stale header value
 * showing back through.
 *
 * Pure: no Obsidian imports.
 */
import type { OcclusionSet, ScheduleData } from "../database/types";
import { generateExplicitCards, type FenceOcclusionOverrides } from "../card-gen/explicit";
import { occlusionSetToYamlValue, parseOcclusionSet } from "../card-gen/occlusion";
import type { GeneratedCard } from "../card-gen/types";
import type { ScheduleFields } from "./FenceWriter";
import { parseCardIdParts, readFenceOcclusions, updateFenceOcclusion } from "./FenceWriter";
import { formatLocalTimestamp, parseScheduleEntry, parseTimestamp, serializeScheduleEntry } from "./ScheduleStore";

/** Frontmatter key holding fence cards' review data, keyed by fence id. */
export const FENCES_FRONTMATTER_KEY = "osmosis-fences";

/** One card's review state, as an `osmosis-fences` entry describes it. */
export interface FenceCardState {
	schedule: ScheduleData | null;
	buriedUntil?: number;
}

/** A parsed `osmosis-fences` entry: the review state of every card in one fence. */
export interface FenceOverlay {
	/** By derived suffix — `""` is the fence's own card, `"r"` / `"c1"` its derived ones. */
	cards: Map<string, FenceCardState>;
	exclude: boolean;
	/** Shape sets by embed label (`""` = the bare `occlude`). Replace the header's entirely. */
	occlusions: Map<string, OcclusionSet>;
}

/** A write to one fence card's review state, by card id (`abc`, `abc-r`, `abc-c1`). */
export type FenceEdit =
	| { kind: "schedule"; cardId: string; schedule: ScheduleFields | null }
	| { kind: "buried"; cardId: string; until: number | null }
	| { kind: "exclude"; cardId: string; exclude: boolean }
	/** One embed's shape set; `cardId` is the fence id. No shapes deletes the set. */
	| { kind: "occlusion"; cardId: string; label: string; set: OcclusionSet };

/** A derived card's block key inside an entry. Same grammar as the header's `r:` / `c1:`. */
const DERIVED_KEY = /^(r|c\d+)$/;
const BURIED_KEY = "buriedUntil";
const EXCLUDE_KEY = "exclude";
/** A shape set's key inside an entry — the header's own spelling. */
const OCCLUDE_KEY = /^occlude(?:-([A-Za-z0-9_-]+))?$/;

/** The entry key holding the shape set of the embed labelled `label` (`""` = unlabelled). */
export function occlusionKey(label: string): string {
	return label === "" ? "occlude" : `occlude-${label}`;
}
/** The keys `serializeScheduleEntry` writes — what a schedule write replaces. */
const SCHEDULE_KEYS = ["due", "stability", "difficulty", "lastReview", "reps", "lapses", "state", "learningSteps"];

type Entry = Record<string, unknown>;

function isPlainObject(value: unknown): value is Entry {
	return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

/** The derived suffix of a card id: `""` for the fence's own card. */
function suffixOf(cardId: string): { fenceId: string; suffix: string } {
	const { baseId, prefix } = parseCardIdParts(cardId);
	return { fenceId: baseId, suffix: prefix.slice(0, -1) };
}

// ── Reads ──────────────────────────────────────────────

function parseCardState(raw: Entry): FenceCardState | null {
	const schedule = parseScheduleEntry(raw);
	const buriedUntil = parseTimestamp(raw[BURIED_KEY]) ?? undefined;
	if (schedule === null && buriedUntil === undefined) return null;
	return { schedule, ...(buriedUntil !== undefined ? { buriedUntil } : {}) };
}

/** Parse one fence's entry. Null when the value is not an object (hand-edited YAML). */
export function parseFenceEntry(raw: unknown): FenceOverlay | null {
	if (!isPlainObject(raw)) return null;
	const cards = new Map<string, FenceCardState>();
	const own = parseCardState(raw);
	if (own) cards.set("", own);
	for (const [key, value] of Object.entries(raw)) {
		if (!DERIVED_KEY.test(key) || !isPlainObject(value)) continue;
		const state = parseCardState(value);
		if (state) cards.set(key, state);
	}
	const occlusions = new Map<string, OcclusionSet>();
	for (const [key, value] of Object.entries(raw)) {
		const match = key.match(OCCLUDE_KEY);
		const set = match ? parseOcclusionSet(value) : null;
		if (set) occlusions.set(match![1] ?? "", set);
	}
	return { cards, exclude: raw[EXCLUDE_KEY] === true, occlusions };
}

/**
 * The shape sets card generation should use in place of fence headers' — every
 * fence with an entry, since the entry owns it even when it holds no shapes.
 */
export function fenceOcclusionOverrides(overlays: ReadonlyMap<string, FenceOverlay>): FenceOcclusionOverrides {
	const result = new Map<string, ReadonlyMap<string, OcclusionSet>>();
	for (const [fenceId, overlay] of overlays) result.set(fenceId, overlay.occlusions);
	return result;
}

/** Parse the whole `osmosis-fences` value into fence id → overlay. */
export function parseFencesFrontmatter(raw: unknown): Map<string, FenceOverlay> {
	const result = new Map<string, FenceOverlay>();
	if (!isPlainObject(raw)) return result;
	for (const [fenceId, value] of Object.entries(raw)) {
		const overlay = parseFenceEntry(value);
		if (overlay) result.set(fenceId, overlay);
	}
	return result;
}

const CARD_SCHEDULE_FIELDS = [
	"stability", "difficulty", "due", "lastReview", "reps", "lapses", "state", "learningSteps", "buriedUntil",
] as const;

/**
 * Lay sidecar review data over freshly generated cards: the pure merge behind
 * `CardSyncService`. A fence card whose fence has an entry takes its schedule,
 * bury and suspension from that entry alone — header values are dropped, not
 * merged, because the entry owns the fence (see the module comment). Cards of
 * fences with no entry, and line cards, pass through untouched.
 */
export function overlayFenceCards(
	cards: readonly GeneratedCard[],
	overlays: ReadonlyMap<string, FenceOverlay>,
): GeneratedCard[] {
	if (overlays.size === 0) return [...cards];
	return cards.map((card) => {
		if (card.blockId !== undefined) return card;
		const { fenceId, suffix } = suffixOf(card.id);
		const overlay = overlays.get(fenceId);
		if (!overlay) return card;

		const next: GeneratedCard = { ...card };
		for (const field of CARD_SCHEDULE_FIELDS) delete next[field];
		delete next.disabled;
		const state = overlay.cards.get(suffix);
		const schedule = state?.schedule;
		if (schedule) {
			next.stability = schedule.stability;
			next.difficulty = schedule.difficulty;
			next.due = schedule.due;
			if (schedule.lastReview !== null) next.lastReview = schedule.lastReview;
			next.reps = schedule.reps;
			next.lapses = schedule.lapses;
			next.state = schedule.state;
			next.learningSteps = schedule.learningSteps;
		}
		if (state?.buriedUntil !== undefined) next.buriedUntil = state.buriedUntil;
		if (overlay.exclude) next.disabled = true;
		return next;
	});
}

// ── Extract (header → entry) ───────────────────────────

/** A generated card's schedule as a full `ScheduleData`, or null when it has none (no `due`). */
function generatedSchedule(card: GeneratedCard): ScheduleData | null {
	if (card.due === undefined) return null;
	return {
		stability: card.stability ?? 0,
		difficulty: card.difficulty ?? 0,
		due: card.due,
		lastReview: card.lastReview ?? null,
		reps: card.reps ?? 0,
		lapses: card.lapses ?? 0,
		state: card.state ?? "review",
		learningSteps: card.learningSteps ?? 0,
	};
}

/**
 * The review state a fence's header holds today — its schedules, buries,
 * `exclude` and shape sets — as an `osmosis-fences` entry. Read with the card
 * generator and the header's own shape parser, so the header has exactly one
 * parser of each. An empty object when the fence carries none (or is not in
 * `content`).
 *
 * Seeds a fence's first sidecar entry; also the note → sidecar half of a move,
 * which passes `cards` (`generateExplicitCards(content)`) so a note with many
 * fences is parsed once rather than once per fence.
 */
export function fenceEntryFromContent(
	content: string,
	fenceId: string,
	cards: readonly GeneratedCard[] = generateExplicitCards(content),
): Entry {
	const entry: Entry = {};
	for (const card of cards) {
		const { fenceId: base, suffix } = suffixOf(card.id);
		if (base !== fenceId || card.blockId !== undefined) continue;
		if (card.disabled === true) entry[EXCLUDE_KEY] = true;

		const target: Entry = {};
		const schedule = generatedSchedule(card);
		if (schedule) Object.assign(target, serializeScheduleEntry(schedule));
		if (card.buriedUntil !== undefined) target[BURIED_KEY] = formatLocalTimestamp(card.buriedUntil);
		if (Object.keys(target).length === 0) continue;
		if (suffix === "") Object.assign(entry, target);
		else entry[suffix] = target;
	}
	for (const [label, set] of readFenceOcclusions(content, fenceId)) {
		entry[occlusionKey(label)] = occlusionSetToYamlValue(set);
	}
	return entry;
}

/**
 * The sidecar → note half of a move for shapes: `content` with fence
 * `fenceId`'s header shape blocks replaced by exactly `sets` — a header set
 * not in `sets` is removed, so an empty map strips them all. Unchanged when no
 * fence carries the id.
 */
export function injectFenceOcclusions(
	content: string,
	fenceId: string,
	sets: ReadonlyMap<string, OcclusionSet>,
): string {
	let next = content;
	for (const [label, set] of readFenceOcclusions(content, fenceId)) {
		if (!sets.has(label)) next = updateFenceOcclusion(next, fenceId, label, { ...set, shapes: [] });
	}
	for (const [label, set] of sets) next = updateFenceOcclusion(next, fenceId, label, set);
	return next;
}

// ── Writes ─────────────────────────────────────────────

/** The object a card's fields live in: the entry itself, or its `r:` / `cN:` block. */
function cardBlock(entry: Entry, suffix: string): Entry {
	if (suffix === "") return entry;
	const existing = entry[suffix];
	if (isPlainObject(existing)) return existing;
	const block: Entry = {};
	entry[suffix] = block;
	return block;
}

function dropEmptyBlock(entry: Entry, suffix: string): void {
	if (suffix === "") return;
	const block = entry[suffix];
	if (isPlainObject(block) && Object.keys(block).length === 0) delete entry[suffix];
}

function applyEdit(entry: Entry, edit: FenceEdit): void {
	const { suffix } = suffixOf(edit.cardId);
	switch (edit.kind) {
		case "schedule": {
			// A review or reset replaces the card's schedule and clears its bury —
			// that is how an expired bury goes away, as in the fence header.
			const block = cardBlock(entry, suffix);
			for (const key of SCHEDULE_KEYS) delete block[key];
			delete block[BURIED_KEY];
			if (edit.schedule) Object.assign(block, serializeScheduleEntry(edit.schedule));
			dropEmptyBlock(entry, suffix);
			break;
		}
		case "buried": {
			const block = cardBlock(entry, suffix);
			if (edit.until === null) delete block[BURIED_KEY];
			else block[BURIED_KEY] = formatLocalTimestamp(edit.until);
			dropEmptyBlock(entry, suffix);
			break;
		}
		case "exclude":
			// `exclude` belongs to the fence, not to one of its cards.
			if (edit.exclude) entry[EXCLUDE_KEY] = true;
			else delete entry[EXCLUDE_KEY];
			break;
		case "occlusion": {
			// Like the header writer: deleting every mask means the diagram is
			// no longer an occlusion card, so the set goes rather than emptying.
			const key = occlusionKey(edit.label);
			if (edit.set.shapes.length === 0) delete entry[key];
			else entry[key] = occlusionSetToYamlValue(edit.set);
			break;
		}
	}
}

/**
 * Apply fence edits to a (sidecar) frontmatter object in place. A fence with no
 * entry yet is seeded from its header in `content` first, so the entry starts
 * as the whole truth about the fence. An entry left empty is kept: it still
 * shadows the header (see the module comment).
 */
export function applyFenceEdits(
	frontmatter: Record<string, unknown>,
	content: string,
	edits: readonly FenceEdit[],
): void {
	if (edits.length === 0) return;
	const existing = frontmatter[FENCES_FRONTMATTER_KEY];
	const fences: Entry = isPlainObject(existing) ? existing : {};
	for (const edit of edits) {
		const { fenceId } = suffixOf(edit.cardId);
		let entry = fences[fenceId];
		if (!isPlainObject(entry)) {
			entry = fenceEntryFromContent(content, fenceId);
			fences[fenceId] = entry;
		}
		applyEdit(entry as Entry, edit);
	}
	frontmatter[FENCES_FRONTMATTER_KEY] = fences;
}
