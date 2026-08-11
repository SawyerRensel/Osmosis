import type { TFile, Vault } from "obsidian";
import type { OcclusionSet } from "../database/types";
import { serializeOccludeBlock } from "../card-gen/occlusion";

/** Schedule fields to write into a fence. */
export interface ScheduleFields {
	stability: number;
	difficulty: number;
	due: number;        // epoch ms
	lastReview: number; // epoch ms
	reps: number;
	lapses: number;
	state: string;
	learningSteps: number;
}

/**
 * Writes FSRS schedule data back into osmosis code fences in markdown files.
 *
 * After each review, the updated schedule is persisted directly in the
 * source fence metadata so it syncs with any file sync service.
 */
export class FenceWriter {
	private writingPaths = new Set<string>();

	constructor(private readonly vault: Vault) {}

	/**
	 * Write updated schedule data into the fence for a card.
	 *
	 * The fence's own card keeps its fields flat at the top level, mirroring how
	 * a plain line card sits directly under its block ID in frontmatter. Derived
	 * cards (bidi reverse `-r`, cloze/occlusion group `-c1`) nest theirs under a
	 * `r:`/`c1:` block, as the frontmatter carrier does.
	 */
	async writeSchedule(
		file: TFile,
		cardId: string,
		schedule: ScheduleFields,
	): Promise<void> {
		if (this.writingPaths.has(file.path)) return;

		const content = await this.vault.cachedRead(file);
		const modified = updateFenceSchedule(content, cardId, schedule);
		if (modified === content) return;

		this.writingPaths.add(file.path);
		try {
			await this.vault.modify(file, modified);
		} finally {
			this.writingPaths.delete(file.path);
		}
	}

	/**
	 * Write or remove the `exclude` metadata flag on a fence.
	 * Setting exclude=true adds `exclude: true`; false removes the line.
	 */
	async writeExclude(
		file: TFile,
		cardId: string,
		exclude: boolean,
	): Promise<void> {
		if (this.writingPaths.has(file.path)) return;

		const content = await this.vault.cachedRead(file);
		const modified = updateFenceExclude(content, cardId, exclude);
		if (modified === content) return;

		this.writingPaths.add(file.path);
		try {
			await this.vault.modify(file, modified);
		} finally {
			this.writingPaths.delete(file.path);
		}
	}

	/**
	 * Remove all schedule metadata from a fence, returning the card to "new" state.
	 */
	async removeSchedule(
		file: TFile,
		cardId: string,
	): Promise<void> {
		if (this.writingPaths.has(file.path)) return;

		const content = await this.vault.cachedRead(file);
		const modified = removeFenceSchedule(content, cardId);
		if (modified === content) return;

		this.writingPaths.add(file.path);
		try {
			await this.vault.modify(file, modified);
		} finally {
			this.writingPaths.delete(file.path);
		}
	}

	/**
	 * Write a shape set into a fence's header, replacing whatever set that embed
	 * had before. An empty set removes the block — deleting every mask in the
	 * editor means the diagram is no longer an occlusion card.
	 */
	async writeOcclusion(
		file: TFile,
		fenceId: string,
		label: string,
		set: OcclusionSet,
	): Promise<void> {
		if (this.writingPaths.has(file.path)) return;

		const content = await this.vault.cachedRead(file);
		const modified = updateFenceOcclusion(content, fenceId, label, set);
		if (modified === content) return;

		this.writingPaths.add(file.path);
		try {
			await this.vault.modify(file, modified);
		} finally {
			this.writingPaths.delete(file.path);
		}
	}

	/** Check if a path is currently being written to. */
	isWriting(path: string): boolean {
		return this.writingPaths.has(path);
	}
}

/**
 * Pure function: write one embed's shape set into a fence header.
 *
 * The block replaces its predecessor *in place* rather than being appended, so
 * a fence carrying two diagrams keeps them in a stable order across edits and
 * the header does not reshuffle every time a mask moves. An empty set deletes
 * the block outright.
 *
 * `label` is the embed's `{a}` marker — `""` for the bare `occlude:` spelling a
 * single-embed fence may use.
 */
export function updateFenceOcclusion(
	content: string,
	fenceId: string,
	label: string,
	set: OcclusionSet,
): string {
	const located = locateFence(content, fenceId);
	if (!located) return content;

	const { lines, backtickCount, metaStart, metaEnd } = located;
	const existingMeta = lines.slice(metaStart, metaEnd);
	const targetKey = label === "" ? "occlude" : `occlude-${label}`;
	const replacement = set.shapes.length === 0 ? [] : serializeOccludeBlock(label, set);

	const updatedMeta: string[] = [];
	let replaced = false;

	for (let i = 0; i < existingMeta.length; i++) {
		const line = existingMeta[i]!;
		const blockKey = indentedBlockKey(line.trim());

		// Every header block is taken whole. Walking into one line by line would
		// treat its indented `mode:`/`shapes:` body as top-level header keys.
		if (blockKey) {
			const end = blockEnd(existingMeta, i);
			if (blockKey === targetKey) {
				updatedMeta.push(...replacement);
				replaced = true;
			} else {
				updatedMeta.push(...existingMeta.slice(i, end + 1));
			}
			i = end;
			continue;
		}

		updatedMeta.push(line);
	}

	if (!replaced) updatedMeta.push(...replacement);

	// The blank line separating header from card content. Without it the content
	// reads as more header — and a shape block's indented body would be severed
	// from its key if the blank landed inside it, which is invisible in the text.
	const nextLine = lines[metaEnd]?.trim() ?? "";
	const nextCloseMatch = nextLine.match(/^(`{3,})\s*$/);
	const isClosingFence = nextCloseMatch && nextCloseMatch[1]!.length >= backtickCount;
	const needsBlank = nextLine !== "" && !isClosingFence;
	if (needsBlank && updatedMeta.length > 0 && updatedMeta[updatedMeta.length - 1]?.trim() !== "") {
		updatedMeta.push("");
	}

	return [
		...lines.slice(0, metaStart),
		...updatedMeta,
		...lines.slice(metaEnd),
	].join("\n");
}

/**
 * Pure function: update schedule metadata in fence content for a given card ID.
 * Returns the modified content string, or the original if no change.
 */
export function updateFenceSchedule(
	content: string,
	cardId: string,
	schedule: ScheduleFields,
): string {
	// Determine the base fence ID and key prefix for derived cards
	const { baseId, prefix } = parseCardIdParts(cardId);

	const lines = content.split("\n");
	const fenceStart = findFenceForId(lines, baseId);
	if (fenceStart === -1) return content;

	// Determine backtick count from the opening fence
	const openMatch = lines[fenceStart]!.replace(/\s*<!--.*?-->/g, "").trim().match(/^(`{3,})osmosis/);
	const backtickCount = openMatch ? openMatch[1]!.length : 3;

	// Find the metadata region (lines after fence opening, before blank line or content)
	const metaStart = fenceStart + 1;
	let metaEnd = metaStart; // exclusive — first non-metadata line

	for (let i = metaStart; i < lines.length; i++) {
		const line = lines[i]!.trim();
		const closeMatch = line.match(/^(`{3,})\s*$/);
		if (line === "" || (closeMatch && closeMatch[1]!.length >= backtickCount)) {
			metaEnd = i;
			break;
		}
		if (opensIndentedBlock(lines[i]!) || isRecognizedMetadataLine(line)) {
			metaEnd = i + 1;
			continue;
		}
		// Non-metadata line (content start)
		metaEnd = i;
		break;
	}

	// Extract existing metadata lines
	const existingMeta = lines.slice(metaStart, metaEnd);

	const updatedMeta = prefix === ""
		? writeFlatSchedule(existingMeta, schedule)
		: writeNestedSchedule(existingMeta, prefix.slice(0, -1), schedule);

	// Ensure a blank line separates metadata from card content
	const nextLine = lines[metaEnd]?.trim() ?? "";
	const nextCloseMatch = nextLine.match(/^(`{3,})\s*$/);
	const isClosingFence = nextCloseMatch && nextCloseMatch[1]!.length >= backtickCount;
	const needsBlank = nextLine !== "" && !isClosingFence;
	if (needsBlank) {
		updatedMeta.push("");
	}

	// Reconstruct the file content
	const result = [
		...lines.slice(0, metaStart),
		...updatedMeta,
		...lines.slice(metaEnd),
	];

	return result.join("\n");
}

/**
 * Parse a card ID into its base fence ID and prefix for derived schedule keys.
 *
 * Examples:
 *   "abc123"    → { baseId: "abc123", prefix: "" }
 *   "abc123-r"  → { baseId: "abc123", prefix: "r-" }
 *   "abc123-c1" → { baseId: "abc123", prefix: "c1-" }
 */
export function parseCardIdParts(cardId: string): { baseId: string; prefix: string } {
	// Match derived suffixes: -r (bidi reverse) or -cN (cloze group).
	const match = cardId.match(/^(.+)-(r|c\d+)$/);
	if (match) {
		return { baseId: match[1]!, prefix: `${match[2]!}-` };
	}
	return { baseId: cardId, prefix: "" };
}

/**
 * Schedule field names and values, in frontmatter's camelCase — the spelling
 * both carriers now write.
 */
function buildScheduleKVs(schedule: ScheduleFields): Map<string, string> {
	return new Map([
		["due", new Date(schedule.due).toISOString()],
		["stability", schedule.stability.toFixed(4)],
		["difficulty", schedule.difficulty.toFixed(4)],
		["reps", String(schedule.reps)],
		["lapses", String(schedule.lapses)],
		["state", schedule.state],
		["lastReview", new Date(schedule.lastReview).toISOString()],
		["learningSteps", String(schedule.learningSteps)],
	]);
}

/**
 * The canonical *written* key for a schedule field named in either spelling, or
 * null when the key is not a schedule field. Prefixed keys (`c1-due`) are not
 * this card's and return null.
 */
function canonicalScheduleField(key: string): string | null {
	const lower = key.toLowerCase();
	if (lower === "last-review" || lower === "lastreview") return "lastReview";
	if (lower === "learning-steps" || lower === "learningsteps") return "learningSteps";
	return SCHEDULE_KEYS.has(lower) ? lower : null;
}

/** A derived card's schedule as a nested block, matching the frontmatter shape. */
function serializeDerivedSchedule(suffix: string, schedule: ScheduleFields): string[] {
	return [
		`${suffix}:`,
		...[...buildScheduleKVs(schedule)].map(([key, value]) => `  ${key}: ${value}`),
	];
}

/**
 * Write the fence's own card's schedule, flat at the top level.
 *
 * A legacy `last-review:` line is *replaced* by its camelCase spelling rather
 * than left beside it — two keys naming one field would both read, and the
 * loser of that merge silently reverts the review that just happened.
 */
function writeFlatSchedule(
	existingMeta: readonly string[],
	schedule: ScheduleFields,
): string[] {
	const pending = buildScheduleKVs(schedule);
	const out: string[] = [];

	for (let i = 0; i < existingMeta.length; i++) {
		const line = existingMeta[i]!;

		// Other cards' nested blocks pass through whole. Their body lines spell
		// the same field names this card's flat keys do, so matching line by
		// line would rewrite `c1:`'s indented `due:` with this card's value.
		if (indentedBlockKey(line.trim())) {
			const end = blockEnd(existingMeta, i);
			out.push(...existingMeta.slice(i, end + 1));
			i = end;
			continue;
		}

		const match = line.trim().match(/^(\w[\w-]*)\s*:\s*.+$/);
		const field = match ? canonicalScheduleField(match[1]!) : null;
		if (field) {
			if (pending.has(field)) {
				out.push(`${field}: ${pending.get(field)!}`);
				pending.delete(field);
			}
			continue;
		}
		out.push(line);
	}

	for (const [key, value] of pending) out.push(`${key}: ${value}`);
	return out;
}

/**
 * Write one derived card's schedule as a nested `c1:`/`r:` block, replacing
 * whatever form that card's schedule was previously stored in.
 *
 * Dropping the pre-migration flat `c1-*` keys in this same edit is the whole
 * job: left behind, the reader sees the group described twice, and the half
 * that loses the merge reverts the review being written. The new block lands
 * where the old form sat, so an untouched sibling group keeps its position.
 */
function writeNestedSchedule(
	existingMeta: readonly string[],
	suffix: string,
	schedule: ScheduleFields,
): string[] {
	const out: string[] = [];
	let insertAt = -1;

	for (let i = 0; i < existingMeta.length; i++) {
		const line = existingMeta[i]!;
		const blockKey = indentedBlockKey(line.trim());

		if (blockKey) {
			const end = blockEnd(existingMeta, i);
			if (blockKey === suffix) {
				if (insertAt === -1) insertAt = out.length;
			} else {
				out.push(...existingMeta.slice(i, end + 1));
			}
			i = end;
			continue;
		}

		const match = line.trim().match(/^(\w[\w-]*)\s*:\s*.+$/);
		if (match && isScheduleKeyForPrefix(match[1]!, `${suffix}-`)) {
			if (insertAt === -1) insertAt = out.length;
			continue;
		}

		out.push(line);
	}

	out.splice(
		insertAt === -1 ? out.length : insertAt,
		0,
		...serializeDerivedSchedule(suffix, schedule),
	);
	return out;
}

/**
 * Find the line index of the fence opening that contains `id: {targetId}`.
 * Returns -1 if not found.
 */
function findFenceForId(lines: string[], targetId: string): number {
	const fenceRegex = /^(`{3,})osmosis\s*$/;

	for (let i = 0; i < lines.length; i++) {
		const stripped = lines[i]!.replace(/\s*<!--.*?-->/g, "").trim();
		const fenceMatch = stripped.match(fenceRegex);
		if (!fenceMatch) continue;

		const backtickCount = fenceMatch[1]!.length;

		// Scan metadata lines for id: match
		for (let j = i + 1; j < lines.length; j++) {
			const line = lines[j]!.trim();
			// Check for closing fence (same or more backticks)
			const closeMatch = line.match(/^(`{3,})\s*$/);
			if (line === "" || (closeMatch && closeMatch[1]!.length >= backtickCount)) break;

			const idMatch = line.match(/^id\s*:\s*(.+)$/i);
			if (idMatch && idMatch[1]!.trim() === targetId) {
				return i;
			}

			// Stop if we hit a non-metadata line
			if (!opensIndentedBlock(lines[j]!) && !isRecognizedMetadataLine(line)) break;
		}
	}

	return -1;
}

/**
 * Pure function: add, update, or remove the `exclude` metadata in a fence.
 * When exclude is true, ensures `exclude: true` is present.
 * When exclude is false, removes any existing `exclude` line (absence = not excluded).
 */
export function updateFenceExclude(
	content: string,
	cardId: string,
	exclude: boolean,
): string {
	const { baseId } = parseCardIdParts(cardId);

	const lines = content.split("\n");
	const fenceStart = findFenceForId(lines, baseId);
	if (fenceStart === -1) return content;

	const openMatch = lines[fenceStart]!.replace(/\s*<!--.*?-->/g, "").trim().match(/^(`{3,})osmosis/);
	const backtickCount = openMatch ? openMatch[1]!.length : 3;

	// Find the metadata region
	const metaStart = fenceStart + 1;
	let metaEnd = metaStart;

	for (let i = metaStart; i < lines.length; i++) {
		const line = lines[i]!.trim();
		const closeMatch = line.match(/^(`{3,})\s*$/);
		if (line === "" || (closeMatch && closeMatch[1]!.length >= backtickCount)) {
			metaEnd = i;
			break;
		}
		if (opensIndentedBlock(lines[i]!) || isRecognizedMetadataLine(line)) {
			metaEnd = i + 1;
			continue;
		}
		metaEnd = i;
		break;
	}

	const existingMeta = lines.slice(metaStart, metaEnd);
	const updatedMeta: string[] = [];
	let found = false;

	for (const line of existingMeta) {
		const match = line.trim().match(/^exclude\s*:\s*.+$/i);
		if (match) {
			found = true;
			// If excluding, replace the line; if including, drop it entirely
			if (exclude) {
				updatedMeta.push("exclude: true");
			}
			continue;
		}
		updatedMeta.push(line);
	}

	// If not found and we want to exclude, insert after the id line
	if (!found && exclude) {
		const idIdx = updatedMeta.findIndex((l) => /^id\s*:/i.test(l.trim()));
		const insertAt = idIdx >= 0 ? idIdx + 1 : 0;
		updatedMeta.splice(insertAt, 0, "exclude: true");
	}

	// Ensure a blank line separates metadata from card content
	const nextLine = lines[metaEnd]?.trim() ?? "";
	const nextCloseMatch = nextLine.match(/^(`{3,})\s*$/);
	const isClosingFence = nextCloseMatch && nextCloseMatch[1]!.length >= backtickCount;
	const needsBlank = nextLine !== "" && !isClosingFence;
	if (needsBlank && updatedMeta[updatedMeta.length - 1]?.trim() !== "") {
		updatedMeta.push("");
	}

	return [
		...lines.slice(0, metaStart),
		...updatedMeta,
		...lines.slice(metaEnd),
	].join("\n");
}

/**
 * Schedule-related metadata keys (including prefixed variants for derived
 * cards), lowercased. Both spellings are listed: the fence wrote `last-review`
 * and `learning-steps` before it standardised on frontmatter's camelCase, and
 * those keys have to stay recognizable so migration can replace them.
 */
const SCHEDULE_KEYS = new Set([
	"due", "stability", "difficulty", "reps", "lapses", "state",
	"last-review", "learning-steps",
	"lastreview", "learningsteps",
]);

/** Non-schedule metadata keys recognized inside an osmosis fence. */
const METADATA_KEYS = new Set([
	"id", "exclude", "bidi", "type-in", "deck", "hint",
]);

function isScheduleKey(key: string): boolean {
	const lower = key.toLowerCase();
	if (SCHEDULE_KEYS.has(lower)) return true;
	// Check for prefixed keys like r-due, c1-stability
	const prefixed = lower.match(/^(?:r|c\d+)-(.+)$/);
	return prefixed !== null && SCHEDULE_KEYS.has(prefixed[1]!);
}

/**
 * True if the key holds schedule data belonging to *one specific* card — the one
 * whose derived-ID prefix is `prefix` (`""` for the fence's own card, `"r-"` for
 * a bidi reverse, `"c1-"` for a cloze group).
 *
 * A fence carries one metadata block for every card it generates, so
 * `c1-stability` and `stability` are different cards' data living side by side.
 * Anything that removes schedule keys has to discriminate between them or it
 * destroys a sibling's scheduling.
 */
function isScheduleKeyForPrefix(key: string, prefix: string): boolean {
	const lower = key.toLowerCase();
	if (prefix === "") return SCHEDULE_KEYS.has(lower);
	if (!lower.startsWith(prefix)) return false;
	return SCHEDULE_KEYS.has(lower.slice(prefix.length));
}

/**
 * True if the line looks like a recognized metadata key-value pair.
 * Arbitrary `word: value` lines (e.g., prose content like "The :::mito:::…")
 * are NOT treated as metadata — only keys the parser knows about.
 */
function isRecognizedMetadataLine(line: string): boolean {
	const match = line.trim().match(/^(\w[\w-]*)\s*:\s*.+$/);
	if (!match) return false;
	const key = match[1]!.toLowerCase();
	return METADATA_KEYS.has(key) || isScheduleKey(key);
}

/**
 * The key of a header block — `occlude[-label]:` for a shape set, `c1:`/`r:`
 * for a derived card's schedule — which opens an indented block instead of
 * carrying a value. Returns the key, or null when the line is not one.
 */
function indentedBlockKey(trimmedLine: string): string | null {
	const match = trimmedLine.match(/^(occlude(?:-[A-Za-z0-9_-]+)?|r|c\d+)\s*:\s*$/);
	return match ? match[1]! : null;
}

/**
 * A line belonging to an indented header block: either the key that opens one
 * or one of its body lines.
 *
 * Every metadata scan below walks until it meets a line it does not recognize.
 * Without this, a block ends the scan on its own first line, and the blank line
 * these functions then insert to separate metadata from content lands *inside*
 * the block — severing its body from its key. Nothing in the resulting file
 * looks wrong; the shapes, or a card's whole schedule, are simply gone at the
 * next read.
 */
function opensIndentedBlock(rawLine: string): boolean {
	if (/^\s+\S/.test(rawLine)) return true;
	return indentedBlockKey(rawLine.trim()) !== null;
}

/**
 * Index of the last line of the block opened at `idx` — its key line when the
 * block has no body.
 */
function blockEnd(meta: readonly string[], idx: number): number {
	let end = idx;
	while (end + 1 < meta.length && /^\s+\S/.test(meta[end + 1]!)) end++;
	return end;
}

/**
 * Pure function: remove **one card's** schedule metadata from a fence, returning
 * that card to "new" state. Preserves non-schedule metadata like id and exclude,
 * and preserves the schedule of every other card the fence generates.
 *
 * The scoping is the whole point. A bidi fence generates `id` and `id-r`, and a
 * cloze fence one card per group (`id-c1`, `id-c2`, …), but they share a single
 * metadata block — so `stability` and `c2-stability` are two different cards'
 * data on adjacent lines. Stripping every schedule key would silently reset the
 * siblings, which is irreversible and invisible until the next review.
 *
 * This mirrors `updateFenceSchedule`, which has always written through the same
 * prefix; removal was the half that did not.
 */
export function removeFenceSchedule(
	content: string,
	cardId: string,
): string {
	const { baseId, prefix } = parseCardIdParts(cardId);

	const lines = content.split("\n");
	const fenceStart = findFenceForId(lines, baseId);
	if (fenceStart === -1) return content;

	const openMatch = lines[fenceStart]!.replace(/\s*<!--.*?-->/g, "").trim().match(/^(`{3,})osmosis/);
	const backtickCount = openMatch ? openMatch[1]!.length : 3;

	const metaStart = fenceStart + 1;
	let metaEnd = metaStart;

	for (let i = metaStart; i < lines.length; i++) {
		const line = lines[i]!.trim();
		const closeMatch = line.match(/^(`{3,})\s*$/);
		if (line === "" || (closeMatch && closeMatch[1]!.length >= backtickCount)) {
			metaEnd = i;
			break;
		}
		if (opensIndentedBlock(lines[i]!) || isRecognizedMetadataLine(line)) {
			metaEnd = i + 1;
			continue;
		}
		metaEnd = i;
		break;
	}

	const existingMeta = lines.slice(metaStart, metaEnd);
	const updatedMeta: string[] = [];

	for (let i = 0; i < existingMeta.length; i++) {
		const line = existingMeta[i]!;
		const blockKey = indentedBlockKey(line.trim());

		// A nested block is dropped or kept *whole*. Its body lines spell the
		// bare field names (`due:`, `stability:`), so walking into one while
		// removing the fence's own card — whose prefix is "" and therefore
		// matches exactly those names — would strip a sibling group's schedule
		// out from under it.
		if (blockKey) {
			const end = blockEnd(existingMeta, i);
			if (`${blockKey}-` !== prefix) {
				updatedMeta.push(...existingMeta.slice(i, end + 1));
			}
			i = end;
			continue;
		}

		const match = line.trim().match(/^(\w[\w-]*)\s*:\s*.+$/);
		if (match && isScheduleKeyForPrefix(match[1]!, prefix)) {
			continue; // drop this card's schedule keys, leaving its siblings' alone
		}
		updatedMeta.push(line);
	}

	const nextLine = lines[metaEnd]?.trim() ?? "";
	const nextCloseMatch = nextLine.match(/^(`{3,})\s*$/);
	const isClosingFence = nextCloseMatch && nextCloseMatch[1]!.length >= backtickCount;
	const needsBlank = nextLine !== "" && !isClosingFence;
	if (needsBlank && updatedMeta.length > 0 && updatedMeta[updatedMeta.length - 1]?.trim() !== "") {
		updatedMeta.push("");
	}

	return [
		...lines.slice(0, metaStart),
		...updatedMeta,
		...lines.slice(metaEnd),
	].join("\n");
}

/**
 * The fence generating a card, located by the `id:` in its metadata, along with
 * the bounds of that metadata region. Returns null when no fence carries the ID.
 *
 * (The three functions above each open-code this same scan. They are left as
 * they are — they persist every review, and a shared helper is not worth
 * re-testing that path for.)
 */
function locateFence(content: string, cardId: string): {
	lines: string[];
	fenceStart: number;
	backtickCount: number;
	metaStart: number;
	metaEnd: number;
} | null {
	const { baseId } = parseCardIdParts(cardId);

	const lines = content.split("\n");
	const fenceStart = findFenceForId(lines, baseId);
	if (fenceStart === -1) return null;

	const openMatch = lines[fenceStart]!.replace(/\s*<!--.*?-->/g, "").trim().match(/^(`{3,})osmosis/);
	const backtickCount = openMatch ? openMatch[1]!.length : 3;

	const metaStart = fenceStart + 1;
	let metaEnd = metaStart;

	for (let i = metaStart; i < lines.length; i++) {
		const line = lines[i]!.trim();
		const closeMatch = line.match(/^(`{3,})\s*$/);
		if (line === "" || (closeMatch && closeMatch[1]!.length >= backtickCount)) {
			metaEnd = i;
			break;
		}
		if (opensIndentedBlock(lines[i]!) || isRecognizedMetadataLine(line)) {
			metaEnd = i + 1;
			continue;
		}
		metaEnd = i;
		break;
	}

	return { lines, fenceStart, backtickCount, metaStart, metaEnd };
}

/** Result of removing a whole fence from a note. */
export interface RemoveFenceResult {
	/** Markdown with the fence gone, or unchanged when the ID was not found. */
	content: string;
	removed: boolean;
}

/**
 * Pure function: delete the entire fence that generates a card.
 *
 * Deleting a fence card means deleting the fence, because the fence *is* the
 * card — unlike a line card, where the text is the user's prose and only the
 * block ID comes out. The consequence callers must surface first: a fence that
 * generates several cards loses all of them, since there is no way to remove
 * one cloze group's card without editing the cloze markers in the user's content.
 */
export function removeFence(content: string, cardId: string): RemoveFenceResult {
	const located = locateFence(content, cardId);
	if (!located) return { content, removed: false };

	const { lines, fenceStart, backtickCount } = located;

	// The closing fence is the first line of *at least* as many backticks. A code
	// cloze opens with ````osmosis and holds a ```python block inside it, whose
	// closing ``` must not be mistaken for the end of the outer fence.
	let fenceEnd = lines.length - 1; // an unterminated fence runs to EOF
	for (let i = fenceStart + 1; i < lines.length; i++) {
		const closeMatch = lines[i]!.trim().match(/^(`{3,})\s*$/);
		if (closeMatch && closeMatch[1]!.length >= backtickCount) {
			fenceEnd = i;
			break;
		}
	}

	const kept = [...lines.slice(0, fenceStart), ...lines.slice(fenceEnd + 1)];

	// A fence sits in its own paragraph, so lifting it out stacks the blank line
	// above it against the blank line below into a two-line gap. Close it up.
	if (fenceStart > 0 && kept[fenceStart - 1]?.trim() === "" && kept[fenceStart]?.trim() === "") {
		kept.splice(fenceStart, 1);
	} else if (fenceStart === 0 && kept[0]?.trim() === "") {
		kept.splice(0, 1);
	}

	return { content: kept.join("\n"), removed: true };
}

/**
 * Whether the fence generating a card declares its own `deck:`.
 *
 * Read out of the markdown rather than inferred from the card's resolved deck,
 * because a fence deck that happens to match what the note would have resolved
 * to anyway is indistinguishable once resolved — yet it still overrides. A
 * note-level deck change has to report those cards rather than appear to have
 * moved them.
 */
export function fenceHasOwnDeck(content: string, cardId: string): boolean {
	const located = locateFence(content, cardId);
	if (!located) return false;

	const { lines, metaStart, metaEnd } = located;
	return lines
		.slice(metaStart, metaEnd)
		.some((line) => /^deck\s*:\s*\S/i.test(line.trim()));
}
