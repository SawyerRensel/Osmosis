import type { TFile, Vault } from "obsidian";

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
	 * For derived cards (bidi reverse `-r`, cloze `-c1`), the schedule
	 * is stored with prefixed keys (e.g., `r-due`, `c1-stability`).
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

	/** Check if a path is currently being written to. */
	isWriting(path: string): boolean {
		return this.writingPaths.has(path);
	}
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
		if (/^\w[\w-]*\s*:\s*.+$/.test(line)) {
			metaEnd = i + 1;
			continue;
		}
		// Non-metadata line (content start)
		metaEnd = i;
		break;
	}

	// Build the schedule key-value pairs to write
	const scheduleKVs = buildScheduleKVs(schedule, prefix);

	// Extract existing metadata lines
	const existingMeta = lines.slice(metaStart, metaEnd);

	// Track which schedule keys we've already updated
	const scheduleKeysToWrite = new Map(scheduleKVs);
	const updatedMeta: string[] = [];

	for (const line of existingMeta) {
		const match = line.trim().match(/^(\w[\w-]*)\s*:\s*.+$/);
		if (match) {
			const key = match[1]!.toLowerCase();
			if (scheduleKeysToWrite.has(key)) {
				// Replace with new value
				updatedMeta.push(`${key}: ${scheduleKeysToWrite.get(key)!}`);
				scheduleKeysToWrite.delete(key);
				continue;
			}
		}
		updatedMeta.push(line);
	}

	// Append any schedule keys that weren't already in the metadata
	for (const [key, value] of scheduleKeysToWrite) {
		updatedMeta.push(`${key}: ${value}`);
	}

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
function parseCardIdParts(cardId: string): { baseId: string; prefix: string } {
	// Match derived suffixes: -r (bidi reverse) or -cN (cloze)
	const match = cardId.match(/^(.+)-(r|c\d+)$/);
	if (match) {
		return { baseId: match[1]!, prefix: `${match[2]!}-` };
	}
	return { baseId: cardId, prefix: "" };
}

/**
 * Build key-value pairs for schedule metadata.
 * Applies prefix for derived cards (e.g., "r-due", "c1-stability").
 */
function buildScheduleKVs(
	schedule: ScheduleFields,
	prefix: string,
): Map<string, string> {
	const kvs = new Map<string, string>();

	kvs.set(`${prefix}due`, new Date(schedule.due).toISOString());
	kvs.set(`${prefix}stability`, schedule.stability.toFixed(4));
	kvs.set(`${prefix}difficulty`, schedule.difficulty.toFixed(4));
	kvs.set(`${prefix}reps`, String(schedule.reps));
	kvs.set(`${prefix}lapses`, String(schedule.lapses));
	kvs.set(`${prefix}state`, schedule.state);
	kvs.set(`${prefix}last-review`, new Date(schedule.lastReview).toISOString());
	kvs.set(`${prefix}learning-steps`, String(schedule.learningSteps));

	return kvs;
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
			if (!/^\w[\w-]*\s*:\s*.+$/.test(line)) break;
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
		if (/^\w[\w-]*\s*:\s*.+$/.test(line)) {
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

/** Schedule-related metadata keys (including prefixed variants for derived cards). */
const SCHEDULE_KEYS = new Set([
	"due", "stability", "difficulty", "reps", "lapses",
	"state", "last-review", "learning-steps",
]);

function isScheduleKey(key: string): boolean {
	const lower = key.toLowerCase();
	if (SCHEDULE_KEYS.has(lower)) return true;
	// Check for prefixed keys like r-due, c1-stability
	const prefixed = lower.match(/^(?:r|c\d+)-(.+)$/);
	return prefixed !== null && SCHEDULE_KEYS.has(prefixed[1]!);
}

/**
 * Pure function: remove all schedule metadata from a fence, returning the card
 * to "new" state. Preserves non-schedule metadata like id and exclude.
 */
export function removeFenceSchedule(
	content: string,
	cardId: string,
): string {
	const { baseId } = parseCardIdParts(cardId);

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
		if (/^\w[\w-]*\s*:\s*.+$/.test(line)) {
			metaEnd = i + 1;
			continue;
		}
		metaEnd = i;
		break;
	}

	const existingMeta = lines.slice(metaStart, metaEnd);
	const updatedMeta: string[] = [];

	for (const line of existingMeta) {
		const match = line.trim().match(/^(\w[\w-]*)\s*:\s*.+$/);
		if (match && isScheduleKey(match[1]!)) {
			continue; // drop schedule keys
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
