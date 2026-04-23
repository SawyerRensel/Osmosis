import { generateCardId, extractCardIds } from "../card-id";
import type { CardState } from "../database/types";
import type { GeneratedCard, FenceMetadata, DerivedSchedule } from "./types";

/** Match an osmosis code fence block (3+ backticks). */
const FENCE_REGEX = /^(`{3,})osmosis\s*$/;
const SEPARATOR = "***";
/** Obfuscator shown on card fronts in place of blanked content. */
export const CLOZE_BLANK = "░░░░░░░░";
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
	"reps", "lapses", "state", "learning-steps",
]);

/** Valid card states for validation. */
const VALID_STATES = new Set<string>(["new", "learning", "review", "relearning"]);

/**
 * Parse a schedule metadata value and apply it to a schedule object.
 */
function applyScheduleField(
	target: { stability?: number; difficulty?: number; due?: number; lastReview?: number; reps?: number; lapses?: number; state?: CardState; learningSteps?: number },
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
		case "learning-steps":
			target.learningSteps = parseInt(value, 10);
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

/** Strip :::...::: inline cloze markers from a line, leaving just the text content. */
function stripInlineClozeMarkers(line: string): string {
	return line.replace(/:::(?:\d+:)?(.+?):::/g, (_, text: string) => text);
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

interface InlineClozeOccurrence {
	lineIdx: number;
	fullMatch: string; // the full :::...::: token as written
	text: string;      // the content without delimiters/group prefix
}

interface InlineClozeGroup {
	cardSuffix: string; // e.g., "i1", "i2" — assigned by source order
	occurrences: InlineClozeOccurrence[];
}

/** Find the inner code fence (```language ... ```) within content lines. */
function findInnerCodeFence(contentLines: string[]): { start: number; end: number } | null {
	let start = -1;
	for (let i = 0; i < contentLines.length; i++) {
		const trimmed = contentLines[i]!.trim();
		if (start === -1) {
			if (INNER_FENCE_OPEN.test(trimmed)) {
				start = i;
			}
		} else if (isClosingFence(contentLines[i]!, 3)) {
			return { start, end: i };
		}
	}
	return null;
}

/** Parse line-level osmosis-cloze regions from within a code fence. */
function parseLineLevelCodeClozes(
	contentLines: string[],
	codeFenceStartIdx: number,
	codeFenceEndIdx: number,
): CodeClozeRegion[] {
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

	return regions;
}

/**
 * Parse :::...::: inline cloze groups from within a code fence.
 * Lines covered by line-level cloze markers are skipped (per precedence rules).
 * Groups are sorted by first occurrence and assigned card suffixes i1, i2, ...
 */
function parseInlineClozeGroups(
	contentLines: string[],
	codeFenceStartIdx: number,
	codeFenceEndIdx: number,
	lineLevelRegions: CodeClozeRegion[],
): InlineClozeGroup[] {
	// Lines owned by line-level markers (single marker lines + full multi regions)
	const lineLevelLines = new Set<number>();
	for (const region of lineLevelRegions) {
		for (let i = region.startIdx; i <= region.endIdx; i++) {
			lineLevelLines.add(i);
		}
	}

	// Map from user group number to occurrences; auto-numbered get unique keys >= 0x80000000
	const explicitGroups = new Map<number, InlineClozeOccurrence[]>();
	const autoGroups: InlineClozeOccurrence[][] = [];

	for (let i = codeFenceStartIdx + 1; i < codeFenceEndIdx; i++) {
		if (lineLevelLines.has(i)) continue;

		const line = contentLines[i]!;
		for (const match of line.matchAll(/:::(\d+:)?(.+?):::/g)) {
			const numStr = match[1]; // e.g., "1:" or undefined
			const text = match[2]!;
			const fullMatch = match[0];
			const occurrence: InlineClozeOccurrence = { lineIdx: i, fullMatch, text };

			if (numStr !== undefined) {
				const num = parseInt(numStr, 10);
				if (!explicitGroups.has(num)) explicitGroups.set(num, []);
				explicitGroups.get(num)!.push(occurrence);
			} else {
				autoGroups.push([occurrence]);
			}
		}
	}

	if (explicitGroups.size === 0 && autoGroups.length === 0) return [];

	// Collect all groups with their first source line for sorting
	const allGroups: Array<{ firstLineIdx: number; occurrences: InlineClozeOccurrence[] }> = [];
	for (const occurrences of explicitGroups.values()) {
		allGroups.push({ firstLineIdx: occurrences[0]!.lineIdx, occurrences });
	}
	for (const occurrences of autoGroups) {
		allGroups.push({ firstLineIdx: occurrences[0]!.lineIdx, occurrences });
	}

	// Sort by first occurrence in source order, assign card suffixes
	allGroups.sort((a, b) => a.firstLineIdx - b.firstLineIdx);
	return allGroups.map((g, idx) => ({
		cardSuffix: `i${idx + 1}`,
		occurrences: g.occurrences,
	}));
}

/**
 * Generate front/back for a line-level code cloze card, blanking one region.
 * Front: blanked region replaced with the CLOZE_BLANK obfuscator (preserving indent).
 * Back: full code with all markers stripped.
 * Inline cloze markers on non-blanked lines are stripped to plain text.
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
			// Regular line — strip any inline cloze markers
			const line = stripInlineClozeMarkers(contentLines[i]!);
			frontLines.push(line);
			backLines.push(line);
		} else if (inRegionIdx === blankedRegionIdx) {
			// Blanked region
			const region = regions[inRegionIdx]!;
			if (region.type === "single") {
				const indent = getIndent(contentLines[i]!);
				frontLines.push(`${indent}${CLOZE_BLANK}`);
				backLines.push(stripInlineClozeMarkers(stripClozeMarker(contentLines[i]!)));
			} else {
				// Multi-line: single CLOZE_BLANK on front, all lines on back
				if (!blankedMultiFirstSeen) {
					const indent = getIndent(contentLines[i]!);
					frontLines.push(`${indent}${CLOZE_BLANK}`);
					blankedMultiFirstSeen = true;
				}
				backLines.push(stripInlineClozeMarkers(contentLines[i]!));
			}
		} else {
			// Non-blanked cloze region — show content with markers stripped
			if (regions[inRegionIdx]!.type === "single") {
				const stripped = stripInlineClozeMarkers(stripClozeMarker(contentLines[i]!));
				frontLines.push(stripped);
				backLines.push(stripped);
			} else {
				const stripped = stripInlineClozeMarkers(contentLines[i]!);
				frontLines.push(stripped);
				backLines.push(stripped);
			}
		}
	}

	return { front: frontLines.join("\n"), back: backLines.join("\n") };
}

/**
 * Generate front/back for an inline cloze card, blanking one group.
 * Front: blanked group's markers replaced with CLOZE_BLANK, other markers stripped to text.
 * Back: all inline markers stripped to plain text.
 * Line-level cloze markers are stripped but those lines are not blanked.
 */
function generateInlineClozeFrontBack(
	contentLines: string[],
	lineLevelRegions: CodeClozeRegion[],
	inlineGroups: InlineClozeGroup[],
	blankedGroupIdx: number,
): { front: string; back: string } {
	const blankedGroup = inlineGroups[blankedGroupIdx]!;

	// Start/end marker lines are skipped in output (same as for line-level cards)
	const multiMarkerLines = new Set<number>();
	for (const region of lineLevelRegions) {
		if (region.type === "multi") {
			multiMarkerLines.add(region.startIdx);
			multiMarkerLines.add(region.endIdx);
		}
	}

	const frontLines: string[] = [];
	const backLines: string[] = [];

	for (let i = 0; i < contentLines.length; i++) {
		if (multiMarkerLines.has(i)) continue;

		let line = contentLines[i]!;

		// Strip line-level single markers — these lines are not blanked in inline cards
		if (detectCodeClozeMarker(line) === "single") {
			line = stripClozeMarker(line);
		}

		// Replace inline markers: blank the target group, strip all others
		const frontLine = line.replace(/:::(?:\d+:)?(.+?):::/g, (fullMatch, text: string) => {
			const isBlanked = blankedGroup.occurrences.some(
				(o) => o.lineIdx === i && o.fullMatch === fullMatch,
			);
			return isBlanked ? CLOZE_BLANK : text;
		});
		const backLine = line.replace(/:::(?:\d+:)?(.+?):::/g, (_, text: string) => text);

		frontLines.push(frontLine);
		backLines.push(backLine);
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

					// Check for derived schedule prefix (e.g., r-due, c1-stability, i1-due)
					const prefixMatch = key.match(/^(r|c\d+|i\d+)-(.+)$/);
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

			// Check for inner code fence (line-level or inline cloze)
			const innerFence = findInnerCodeFence(contentLines);
			if (innerFence) {
				const { start: codeFenceStartIdx, end: codeFenceEndIdx } = innerFence;
				const lineLevelRegions = parseLineLevelCodeClozes(contentLines, codeFenceStartIdx, codeFenceEndIdx);
				const inlineGroups = parseInlineClozeGroups(contentLines, codeFenceStartIdx, codeFenceEndIdx, lineLevelRegions);

				if (lineLevelRegions.length > 0 || inlineGroups.length > 0) {
					for (let ci = 0; ci < lineLevelRegions.length; ci++) {
						const { front, back } = generateCodeClozeFrontBack(contentLines, lineLevelRegions, ci);
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

					for (let gi = 0; gi < inlineGroups.length; gi++) {
						const { front, back } = generateInlineClozeFrontBack(contentLines, lineLevelRegions, inlineGroups, gi);
						const suffix = inlineGroups[gi]!.cardSuffix;
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
			}

			const clozeMatches = [...content.matchAll(CLOZE_REGEX)];
			if (clozeMatches.length === 0) continue; // No separator and no clozes — skip

			// Generate one card per cloze deletion
			for (let ci = 0; ci < clozeMatches.length; ci++) {
				// Replace only the ci-th occurrence with CLOZE_BLANK
				let occurrenceIdx = 0;
				const front = content.replace(CLOZE_REGEX, (match, _group) => {
					const result = occurrenceIdx === ci ? CLOZE_BLANK : match;
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
): Partial<Pick<GeneratedCard, "stability" | "difficulty" | "due" | "lastReview" | "reps" | "lapses" | "state" | "learningSteps">> {
	if (!source) return {};
	const result: Record<string, unknown> = {};
	if (source.stability !== undefined) result.stability = source.stability;
	if (source.difficulty !== undefined) result.difficulty = source.difficulty;
	if (source.due !== undefined) result.due = source.due;
	if (source.lastReview !== undefined) result.lastReview = source.lastReview;
	if (source.reps !== undefined) result.reps = source.reps;
	if (source.lapses !== undefined) result.lapses = source.lapses;
	if (source.state !== undefined) result.state = source.state;
	if (source.learningSteps !== undefined) result.learningSteps = source.learningSteps;
	return result;
}
