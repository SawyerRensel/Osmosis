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

	// Find the metadata region (lines after fence opening, before blank line or content)
	const metaStart = fenceStart + 1;
	let metaEnd = metaStart; // exclusive — first non-metadata line

	for (let i = metaStart; i < lines.length; i++) {
		const line = lines[i]!.trim();
		if (line === "" || line === "```") {
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

	return kvs;
}

/**
 * Find the line index of the fence opening that contains `id: {targetId}`.
 * Returns -1 if not found.
 */
function findFenceForId(lines: string[], targetId: string): number {
	const fenceRegex = /^```osmosis\s*$/;
	const fenceEnd = /^```\s*$/;

	for (let i = 0; i < lines.length; i++) {
		const stripped = lines[i]!.replace(/\s*<!--.*?-->/g, "").trim();
		if (!fenceRegex.test(stripped)) continue;

		// Scan metadata lines for id: match
		for (let j = i + 1; j < lines.length; j++) {
			const line = lines[j]!.trim();
			if (line === "" || fenceEnd.test(line)) break;

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
