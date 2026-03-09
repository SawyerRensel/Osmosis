import { generateCardId, extractCardIds } from "../card-id";
import type { CardState } from "../database/types";
import type { GeneratedCard, FenceMetadata, DerivedSchedule } from "./types";

/** Match an osmosis code fence block (3+ backticks). */
const FENCE_REGEX = /^(`{3,})osmosis\s*$/;
const SEPARATOR = "***";
/** Match ==term== or **term** cloze deletions. */
const CLOZE_REGEX = /==([^=]+)==|\*\*([^*]+)\*\*/g;
/** Match inner code fence opening (```language). */
const INNER_FENCE_OPEN = /^```\w/;

/** Check if a line closes a fence opened with the given backtick count. */
function isClosingFence(line: string, backtickCount: number): boolean {
	const trimmed = line.trim();
	const match = trimmed.match(/^(`{3,})\s*$/);
	return match !== null && match[1]!.length >= backtickCount;
}

/** Schedule field names for derived card prefix matching. */
const SCHEDULE_FIELDS = new Set([
	"stability", "difficulty", "due", "last-review",
	"reps", "lapses", "state",
]);

/** Valid card states for validation. */
const VALID_STATES = new Set<string>(["new", "learning", "review", "relearning"]);

/**
 * Parse a schedule metadata value and apply it to a schedule object.
 */
function applyScheduleField(
	target: { stability?: number; difficulty?: number; due?: number; lastReview?: number; reps?: number; lapses?: number; state?: CardState },
	field: string,
	value: string,
): void {
	switch (field) {
		case "stability":
			target.stability = parseFloat(value);
			break;
		case "difficulty":
			target.difficulty = parseFloat(value);
			break;
		case "due":
			target.due = new Date(value).getTime();
			break;
		case "last-review":
			target.lastReview = new Date(value).getTime();
			break;
		case "reps":
			target.reps = parseInt(value, 10);
			break;
		case "lapses":
			target.lapses = parseInt(value, 10);
			break;
		case "state":
			if (VALID_STATES.has(value)) {
				target.state = value as CardState;
			}
			break;
	}
}

/** Detect osmosis-cloze marker type on a line. */
function detectCodeClozeMarker(line: string): "single" | "start" | "end" | null {
	if (line.includes("osmosis-cloze-start")) return "start";
	if (line.includes("osmosis-cloze-end")) return "end";
	if (line.includes("osmosis-cloze")) return "single";
	return null;
}

/** Strip osmosis-cloze inline marker (and its comment prefix) from a line. */
function stripClozeMarker(line: string): string {
	return line.replace(
		/\s*(?:#|\/\/|\/\*|<!--|--|%)\s*osmosis-cloze\s*(?:\*\/|-->)?\s*$/,
		"",
	);
}

/** Get the leading whitespace from a line. */
function getIndent(line: string): string {
	const match = line.match(/^(\s*)/);
	return match ? match[1]! : "";
}

interface CodeClozeRegion {
	type: "single" | "multi";
	startIdx: number;
	endIdx: number; // inclusive
}

/**
 * Try to parse code cloze regions from osmosis fence content.
 * Looks for inner code fences containing osmosis-cloze markers.
 * Returns null if no code clozes found.
 */
function tryParseCodeClozes(contentLines: string[]): {
	regions: CodeClozeRegion[];
	codeFenceStartIdx: number;
	codeFenceEndIdx: number;
} | null {
	let codeFenceStartIdx = -1;
	let codeFenceEndIdx = -1;

	for (let i = 0; i < contentLines.length; i++) {
		const trimmed = contentLines[i]!.trim();
		if (codeFenceStartIdx === -1) {
			if (INNER_FENCE_OPEN.test(trimmed)) {
				codeFenceStartIdx = i;
			}
		} else if (isClosingFence(contentLines[i]!, 3)) {
			codeFenceEndIdx = i;
			break;
		}
	}

	if (codeFenceStartIdx === -1 || codeFenceEndIdx === -1) return null;

	const regions: CodeClozeRegion[] = [];
	let multiStart = -1;

	for (let i = codeFenceStartIdx + 1; i < codeFenceEndIdx; i++) {
		const marker = detectCodeClozeMarker(contentLines[i]!);
		if (marker === "single") {
			regions.push({ type: "single", startIdx: i, endIdx: i });
		} else if (marker === "start") {
			multiStart = i;
		} else if (marker === "end" && multiStart !== -1) {
			regions.push({ type: "multi", startIdx: multiStart, endIdx: i });
			multiStart = -1;
		}
	}

	if (regions.length === 0) return null;
	return { regions, codeFenceStartIdx, codeFenceEndIdx };
}

/**
 * Generate front/back for a code cloze card, blanking one region.
 * Front: blanked region replaced with ######## (preserving indent).
 * Back: full code with all markers stripped.
 */
function generateCodeClozeFrontBack(
	contentLines: string[],
	regions: CodeClozeRegion[],
	blankedRegionIdx: number,
): { front: string; back: string } {
	const multiMarkerLines = new Set<number>();
	for (const region of regions) {
		if (region.type === "multi") {
			multiMarkerLines.add(region.startIdx);
			multiMarkerLines.add(region.endIdx);
		}
	}

	const frontLines: string[] = [];
	const backLines: string[] = [];
	let blankedMultiFirstSeen = false;

	for (let i = 0; i < contentLines.length; i++) {
		// Skip multi-line cloze marker lines from both front and back
		if (multiMarkerLines.has(i)) continue;

		// Check if this line is inside any cloze region
		let inRegionIdx = -1;
		for (let ri = 0; ri < regions.length; ri++) {
			const r = regions[ri]!;
			if (r.type === "single" && r.startIdx === i) {
				inRegionIdx = ri;
				break;
			}
			if (r.type === "multi" && i > r.startIdx && i < r.endIdx) {
				inRegionIdx = ri;
				break;
			}
		}

		if (inRegionIdx === -1) {
			// Regular line
			frontLines.push(contentLines[i]!);
			backLines.push(contentLines[i]!);
		} else if (inRegionIdx === blankedRegionIdx) {
			// Blanked region
			const region = regions[inRegionIdx]!;
			if (region.type === "single") {
				const indent = getIndent(contentLines[i]!);
				frontLines.push(`${indent}########`);
				backLines.push(stripClozeMarker(contentLines[i]!));
			} else {
				// Multi-line: single ######## on front, all lines on back
				if (!blankedMultiFirstSeen) {
					const indent = getIndent(contentLines[i]!);
					frontLines.push(`${indent}########`);
					blankedMultiFirstSeen = true;
				}
				backLines.push(contentLines[i]!);
			}
		} else {
			// Non-blanked cloze region — show content with markers stripped
			if (regions[inRegionIdx]!.type === "single") {
				const stripped = stripClozeMarker(contentLines[i]!);
				frontLines.push(stripped);
				backLines.push(stripped);
			} else {
				frontLines.push(contentLines[i]!);
				backLines.push(contentLines[i]!);
			}
		}
	}

	return { front: frontLines.join("\n"), back: backLines.join("\n") };
}

/**
 * Generate explicit cards from ```osmosis code fences.
 *
 * Fence format:
 * ```osmosis
 * id: a3f7b2c1
 * key: value     ← optional metadata lines (before first blank line)
 *
 * Front content
 * ***
 * Back content
 * ```
 *
 * Metadata keys: id, exclude, bidi, type-in, deck, hint
 * Schedule keys: stability, difficulty, due, last-review, reps, lapses, state
 * Derived schedule keys: r-due, c1-stability, etc.
 * bidi: true generates two cards (forward + reverse as explicit_bidi type).
 *
 * If no *** separator but content contains ==term== cloze deletions,
 * generates one explicit_cloze card per deletion.
 */
export function generateExplicitCards(markdown: string): GeneratedCard[] {
	const lines = markdown.split("\n");
	const cards: GeneratedCard[] = [];

	// Extract existing HTML comment IDs for backward compatibility
	const existingIds = extractCardIds(markdown);
	const idsByLine = new Map<number, string>();
	for (const ext of existingIds) {
		idsByLine.set(ext.line, ext.id);
	}

	let i = 0;
	while (i < lines.length) {
		const fenceMatch = lines[i]!.replace(/\s*<!--.*?-->/g, "").trim().match(FENCE_REGEX);
		if (!fenceMatch) {
			i++;
			continue;
		}

		const fenceStartLine = i;
		const backtickCount = fenceMatch[1]!.length;
		i++; // move past opening fence

		// Parse metadata lines (key: value before blank line)
		const metadata: FenceMetadata = {
			id: "",
			exclude: false,
			bidi: false,
			typeIn: false,
			deck: "",
			hint: "",
		};

		let metadataEnded = false;
		while (i < lines.length && !isClosingFence(lines[i]!, backtickCount)) {
			const line = lines[i]!.trim();

			if (!metadataEnded) {
				if (line === "") {
					metadataEnded = true;
					i++;
					continue;
				}

				const metaMatch = line.match(/^(\w[\w-]*)\s*:\s*(.+)$/);
				if (metaMatch) {
					const key = metaMatch[1]!.toLowerCase();
					const value = metaMatch[2]!.trim();

					// Check for derived schedule prefix (e.g., r-due, c1-stability)
					const prefixMatch = key.match(/^(r|c\d+)-(.+)$/);
					if (prefixMatch && SCHEDULE_FIELDS.has(prefixMatch[2]!)) {
						const suffix = prefixMatch[1]!;
						const field = prefixMatch[2]!;
						if (!metadata.derivedSchedules) {
							metadata.derivedSchedules = new Map();
						}
						let derived = metadata.derivedSchedules.get(suffix);
						if (!derived) {
							derived = {};
							metadata.derivedSchedules.set(suffix, derived);
						}
						applyScheduleField(derived, field, value);
						i++;
						continue;
					}

					// Check for base schedule fields
					if (SCHEDULE_FIELDS.has(key)) {
						applyScheduleField(metadata, key, value);
						i++;
						continue;
					}

					switch (key) {
						case "id":
							metadata.id = value;
							break;
						case "exclude":
							metadata.exclude = value === "true";
							break;
						case "bidi":
							metadata.bidi = value === "true";
							break;
						case "type-in":
							metadata.typeIn = value === "true";
							break;
						case "deck":
							metadata.deck = value;
							break;
						case "hint":
							metadata.hint = value;
							break;
					}
					i++;
					continue;
				}
				// Not a metadata line — treat as content start
				metadataEnded = true;
			}

			break;
		}

		// Collect content lines until closing fence
		const contentLines: string[] = [];
		while (i < lines.length && !isClosingFence(lines[i]!, backtickCount)) {
			contentLines.push(lines[i]!);
			i++;
		}

		// Skip closing fence
		if (i < lines.length) {
			i++;
		}

		// Skip excluded fences
		if (metadata.exclude) continue;

		// Resolve fence ID: metadata id > HTML comment on fence line > generate new
		const fenceId = metadata.id
			|| idsByLine.get(fenceStartLine)
			|| generateCardId();

		// Split on *** separator
		const separatorIdx = contentLines.findIndex(
			(l) => l.trim() === SEPARATOR,
		);

		if (separatorIdx === -1) {
			// No separator — check for code cloze or text cloze deletions
			const content = contentLines.join("\n").trim();
			if (content.length === 0) continue;

			// Check for code cloze markers (osmosis-cloze inside code fences)
			const codeCloze = tryParseCodeClozes(contentLines);
			if (codeCloze) {
				const { regions } = codeCloze;
				for (let ci = 0; ci < regions.length; ci++) {
					const { front, back } = generateCodeClozeFrontBack(
						contentLines, regions, ci,
					);
					const suffix = `c${ci + 1}`;
					const derivedSched = metadata.derivedSchedules?.get(suffix);
					cards.push({
						id: `${fenceId}-${suffix}`,
						card_type: "code_cloze",
						front: metadata.hint
							? `${front}\n\n_Hint: ${metadata.hint}_`
							: front,
						back,
						deck: metadata.deck,
						sourceLine: fenceStartLine,
						typeIn: metadata.typeIn,
						...spreadSchedule(derivedSched),
					});
				}
				continue;
			}

			const clozeMatches = [...content.matchAll(CLOZE_REGEX)];
			if (clozeMatches.length === 0) continue; // No separator and no clozes — skip

			// Generate one card per cloze deletion
			for (let ci = 0; ci < clozeMatches.length; ci++) {
				// Replace only the ci-th occurrence with ########
				let occurrenceIdx = 0;
				const front = content.replace(CLOZE_REGEX, (match, _group) => {
					const result = occurrenceIdx === ci ? "########" : match;
					occurrenceIdx++;
					return result;
				});

				const suffix = `c${ci + 1}`;
				const derivedSched = metadata.derivedSchedules?.get(suffix);

				cards.push({
					id: `${fenceId}-${suffix}`,
					card_type: "explicit_cloze",
					front: metadata.hint
						? `${front}\n\n_Hint: ${metadata.hint}_`
						: front,
					back: content,
					deck: metadata.deck,
					sourceLine: fenceStartLine,
					typeIn: metadata.typeIn,
					...spreadSchedule(derivedSched),
				});
			}
			continue;
		}

		const frontContent = contentLines.slice(0, separatorIdx).join("\n").trim();
		const backContent = contentLines
			.slice(separatorIdx + 1)
			.join("\n")
			.trim();

		if (frontContent.length === 0 && backContent.length === 0) {
			continue;
		}

		// Build front with hint if present
		const front = metadata.hint
			? `${frontContent}\n\n_Hint: ${metadata.hint}_`
			: frontContent;

		if (metadata.bidi) {
			// Generate two cards: forward and reverse
			cards.push({
				id: fenceId,
				card_type: "explicit_bidi",
				front,
				back: backContent,
				deck: metadata.deck,
				sourceLine: fenceStartLine,
				typeIn: metadata.typeIn,
				...spreadSchedule(metadata),
			});

			// Reverse card gets deterministic derived ID
			const reverseFront = metadata.hint
				? `${backContent}\n\n_Hint: ${metadata.hint}_`
				: backContent;
			const reverseSched = metadata.derivedSchedules?.get("r");
			cards.push({
				id: `${fenceId}-r`,
				card_type: "explicit_bidi",
				front: reverseFront,
				back: frontContent,
				deck: metadata.deck,
				sourceLine: fenceStartLine,
				typeIn: metadata.typeIn,
				...spreadSchedule(reverseSched),
			});
		} else {
			cards.push({
				id: fenceId,
				card_type: "explicit",
				front,
				back: backContent,
				deck: metadata.deck,
				sourceLine: fenceStartLine,
				typeIn: metadata.typeIn,
				...spreadSchedule(metadata),
			});
		}
	}

	return cards;
}

/**
 * Extract schedule fields from a metadata or derived schedule object,
 * returning only the fields that are defined.
 */
function spreadSchedule(
	source?: DerivedSchedule | FenceMetadata,
): Partial<Pick<GeneratedCard, "stability" | "difficulty" | "due" | "lastReview" | "reps" | "lapses" | "state">> {
	if (!source) return {};
	const result: Record<string, unknown> = {};
	if (source.stability !== undefined) result.stability = source.stability;
	if (source.difficulty !== undefined) result.difficulty = source.difficulty;
	if (source.due !== undefined) result.due = source.due;
	if (source.lastReview !== undefined) result.lastReview = source.lastReview;
	if (source.reps !== undefined) result.reps = source.reps;
	if (source.lapses !== undefined) result.lapses = source.lapses;
	if (source.state !== undefined) result.state = source.state;
	return result;
}
