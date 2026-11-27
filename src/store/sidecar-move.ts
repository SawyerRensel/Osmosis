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
 * **The merge rule** — for a note whose data is half in each place. A move
 * keeps exactly what Osmosis reads today ({@link mergeNoteData}): the sidecar
 * wins per card in `osmosis-schedule` and per fence in `osmosis-fences`, its
 * `osmosis-styles` hides the note's whole, and a fence with an `osmosis-fences`
 * entry takes nothing from its header. Both plans check that rule rather than
 * trust it: each compares every fence card (schedule, bury, suspension, masks,
 * text) and the frontmatter data before and after — re-reading the text it
 * produced, so a lossy YAML round trip counts too — and throws
 * {@link MoveCheckError} instead of returning a plan that would change them.
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

// ── Plans ──────────────────────────────────────────────

/** Lay `over` on `under` entry by entry when both are mappings; otherwise `over` wins whole. */
function mergeEntries(under: unknown, over: unknown): unknown {
	if (over === undefined) return under;
	if (isPlainObject(under) && isPlainObject(over)) return { ...under, ...over };
	return over;
}

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
 * `sidecarFrontmatter` (none yet: `undefined`). Fence entries come from the
 * sidecar first, then the note's own `osmosis-fences`, then the header.
 */
export function planToSidecar(note: string, sidecarFrontmatter: Frontmatter | undefined, codec: YamlCodec): ToSidecarPlan {
	const { block, yaml, body } = splitFrontmatter(note);
	const extracted = extractFenceState(body);
	// A note with nothing to move is left alone before its properties are
	// parsed, so one Osmosis has no business with never fails on them.
	if (extracted.content === body && !SIDECAR_KEYS.some((key) => yaml.includes(key))) {
		return { note, sidecar: {}, moved: false };
	}
	const own = parseFrontmatter(yaml, codec);
	const side = sidecarFrontmatter ?? {};

	const sidecar: Frontmatter = {};
	const values: Record<string, unknown> = {
		[SCHEDULE_KEY]: mergeEntries(own[SCHEDULE_KEY], side[SCHEDULE_KEY]),
		[FENCES_FRONTMATTER_KEY]: mergeEntries(mergeEntries(extracted.fences, own[FENCES_FRONTMATTER_KEY]), side[FENCES_FRONTMATTER_KEY]),
		[STYLES_KEY]: side[STYLES_KEY] ?? own[STYLES_KEY],
	};
	for (const key of SIDECAR_KEYS) {
		const value = values[key];
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

	check(note, mergeNoteData(own, side), next, mergeNoteData(frontmatterOfText(next, codec), { ...side, ...sidecar }));
	return { note: next, sidecar, moved };
}

export interface IntoNotePlan {
	/** The note's new text, holding all its data. */
	note: string;
	/** Fence entries dropped because no fence in the note carries their id. */
	dropped: number;
}

/**
 * Move a sidecar's data (`sidecarFrontmatter`) back into `note`. The note's
 * frontmatter takes `osmosis-schedule` / `osmosis-styles`, each fence header
 * its entry, and the note's own `osmosis-fences` goes (it is folded into the
 * headers too). A note left with none of the keys gets an empty
 * `osmosis-schedule`, so it stays in note mode whatever the data location
 * setting says.
 */
export function planIntoNote(note: string, sidecarFrontmatter: Frontmatter, codec: YamlCodec): IntoNotePlan {
	const { yaml, body } = splitFrontmatter(note);
	const own = parseFrontmatter(yaml, codec);
	const merged = mergeNoteData(own, sidecarFrontmatter);

	const fences = isPlainObject(merged[FENCES_FRONTMATTER_KEY]) ? merged[FENCES_FRONTMATTER_KEY] : {};
	const present = new Set(listFenceIds(body));
	const kept: Frontmatter = {};
	let dropped = 0;
	for (const [id, entry] of Object.entries(fences)) {
		if (present.has(id)) kept[id] = entry;
		else dropped++;
	}

	const next: Frontmatter = { ...own };
	delete next[FENCES_FRONTMATTER_KEY];
	for (const key of [SCHEDULE_KEY, STYLES_KEY]) {
		if (merged[key] === undefined) delete next[key];
		else next[key] = merged[key];
	}
	if (!hasSidecarKeys(next)) next[SCHEDULE_KEY] = {};
	const content = joinFrontmatter(next, injectFenceState(body, kept), codec);

	check(note, merged, content, frontmatterOfText(content, codec));
	return { note: content, dropped };
}
