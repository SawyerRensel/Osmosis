import { generateCardId, extractCardIds } from "../card-id";
import type { CardState } from "../database/types";
import type { GeneratedCard, FenceMetadata, DerivedSchedule } from "./types";

/** Match an osmosis code fence block (3+ backticks). */
const FENCE_REGEX = /^(`{3,})osmosis\s*$/;
const SEPARATOR = "***";
/** Obfuscator shown on card fronts in place of blanked content. */
export const CLOZE_BLANK = "░░░░░░░░";
/** Match inner code fence opening (```language). */
const INNER_FENCE_OPEN = /^```\w/;

/**
 * Prose cloze token match. Captures the three forms:
 *   ==text==        (group 1 = optional "cN:", group 2 = text)
 *   **text**        (group 3 = optional "cN:", group 4 = text)
 *   :::text:::      (group 5 = optional "cN:", group 6 = text)
 * The "cN:" prefix is optional on all three. When present it signals grouping.
 */
const PROSE_CLOZE_REGEX =
	/==(c\d+:)?([^=]+)==|\*\*(c\d+:)?([^*]+)\*\*|:::(c\d+:)?(.+?):::/g;

/** Match an inline `:::...:::` token for stripping markers. */
const INLINE_MARKER_REGEX = /:::(?:c\d+:)?(.+?):::/g;

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

/**
 * Detect osmosis-cloze marker type on a line, and extract its optional group
 * number (-cN suffix). Returns null if the line has no marker.
 */
function detectCodeClozeMarker(
	line: string,
): { type: "single" | "start" | "end"; group: number | null } | null {
	// Match -start-cN, -end-cN, or -cN suffixes explicitly (longest first).
	const startMatch = line.match(/osmosis-cloze-start(?:-c(\d+))?\b/);
	if (startMatch) return { type: "start", group: startMatch[1] ? parseInt(startMatch[1], 10) : null };
	const endMatch = line.match(/osmosis-cloze-end(?:-c(\d+))?\b/);
	if (endMatch) return { type: "end", group: endMatch[1] ? parseInt(endMatch[1], 10) : null };
	const singleMatch = line.match(/osmosis-cloze(?:-c(\d+))?\b(?!-)/);
	if (singleMatch) return { type: "single", group: singleMatch[1] ? parseInt(singleMatch[1], 10) : null };
	return null;
}

/** Strip osmosis-cloze inline marker (and its comment prefix) from a line. */
function stripCodeClozeMarker(line: string): string {
	return line.replace(
		/\s*(?:#|\/\/|\/\*|<!--|--|%)\s*osmosis-cloze(?:-(?:start|end))?(?:-c\d+)?\s*(?:\*\/|-->)?\s*$/,
		"",
	);
}

/** Strip :::...::: inline cloze markers from a line, leaving just the text. */
function stripInlineClozeMarkers(line: string): string {
	return line.replace(INLINE_MARKER_REGEX, (_, text: string) => text);
}

/** Get the leading whitespace from a line. */
function getIndent(line: string): string {
	const match = line.match(/^(\s*)/);
	return match ? match[1]! : "";
}

/**
 * A single cloze occurrence. Describes one blanked span; multiple occurrences
 * that share a group number are blanked together on the same card.
 */
type ClozeOccurrence =
	| {
		kind: "prose";
		lineIdx: number;
		fullMatch: string; // the full ==..==, **..**, or :::..::: token
		text: string;      // the content without delimiters/group prefix
		delimiter: "==" | "**" | ":::";
	  }
	| {
		kind: "inline-code";
		lineIdx: number;
		fullMatch: string;
		text: string;
	  }
	| {
		kind: "code-single";
		lineIdx: number;
	  }
	| {
		kind: "code-multi";
		startIdx: number; // line index of the start marker (not blanked)
		endIdx: number;   // line index of the end marker (not blanked)
	  };

interface ClozeGroup {
	/** Card suffix number, e.g. 1 → "c1". */
	suffix: number;
	/** First source line the group appears on — used for source-order fallback. */
	firstLineIdx: number;
	occurrences: ClozeOccurrence[];
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

/**
 * Collect every cloze occurrence in the fence content, grouped by user-authored
 * cN label. Anonymous occurrences each become their own group, numbered strictly
 * above the largest labeled group.
 */
function collectClozeGroups(contentLines: string[]): ClozeGroup[] {
	const innerFence = findInnerCodeFence(contentLines);
	const inCodeFence = (i: number): boolean =>
		innerFence !== null && i > innerFence.start && i < innerFence.end;

	// Map of labeled group number → occurrences (in source order).
	const labeled = new Map<number, ClozeOccurrence[]>();
	const anonymous: ClozeOccurrence[] = [];

	// Track lines already owned by a line-level code marker so inline markers on
	// those lines are ignored (existing precedence).
	const codeLineLevelLines = new Set<number>();

	// --- Pass 1: line-level code clozes (inside inner fence). --------------
	if (innerFence) {
		let multiStart = -1;
		let multiStartGroup: number | null = null;
		for (let i = innerFence.start + 1; i < innerFence.end; i++) {
			const marker = detectCodeClozeMarker(contentLines[i]!);
			if (!marker) continue;
			if (marker.type === "single") {
				codeLineLevelLines.add(i);
				const occ: ClozeOccurrence = { kind: "code-single", lineIdx: i };
				if (marker.group !== null) {
					if (!labeled.has(marker.group)) labeled.set(marker.group, []);
					labeled.get(marker.group)!.push(occ);
				} else {
					anonymous.push(occ);
				}
			} else if (marker.type === "start") {
				multiStart = i;
				multiStartGroup = marker.group;
			} else if (marker.type === "end" && multiStart !== -1) {
				for (let j = multiStart; j <= i; j++) codeLineLevelLines.add(j);
				const occ: ClozeOccurrence = {
					kind: "code-multi",
					startIdx: multiStart,
					endIdx: i,
				};
				// Prefer the start marker's group; fall back to the end marker's.
				const group = multiStartGroup ?? marker.group;
				if (group !== null) {
					if (!labeled.has(group)) labeled.set(group, []);
					labeled.get(group)!.push(occ);
				} else {
					anonymous.push(occ);
				}
				multiStart = -1;
				multiStartGroup = null;
			}
		}
	}

	// --- Pass 2: inline :::...::: inside the inner code fence. -------------
	if (innerFence) {
		for (let i = innerFence.start + 1; i < innerFence.end; i++) {
			if (codeLineLevelLines.has(i)) continue;
			const line = contentLines[i]!;
			for (const match of line.matchAll(/:::(c\d+:)?(.+?):::/g)) {
				const numStr = match[1]; // e.g., "c1:" or undefined
				const text = match[2]!;
				const fullMatch = match[0];
				const occ: ClozeOccurrence = {
					kind: "inline-code",
					lineIdx: i,
					fullMatch,
					text,
				};
				if (numStr !== undefined) {
					const num = parseInt(numStr.slice(1, -1), 10); // strip "c" and ":"
					if (!labeled.has(num)) labeled.set(num, []);
					labeled.get(num)!.push(occ);
				} else {
					anonymous.push(occ);
				}
			}
		}
	}

	// --- Pass 3: prose clozes (==/**/:::) outside the inner code fence. ----
	for (let i = 0; i < contentLines.length; i++) {
		if (inCodeFence(i)) continue;
		// Skip the fence delimiter lines themselves.
		if (innerFence && (i === innerFence.start || i === innerFence.end)) continue;

		const line = contentLines[i]!;
		for (const match of line.matchAll(PROSE_CLOZE_REGEX)) {
			const fullMatch = match[0];
			let delimiter: "==" | "**" | ":::";
			let labelPrefix: string | undefined;
			let text: string;
			if (match[2] !== undefined) {
				delimiter = "==";
				labelPrefix = match[1];
				text = match[2]!;
			} else if (match[4] !== undefined) {
				delimiter = "**";
				labelPrefix = match[3];
				text = match[4]!;
			} else {
				delimiter = ":::";
				labelPrefix = match[5];
				text = match[6]!;
			}
			const occ: ClozeOccurrence = {
				kind: "prose",
				lineIdx: i,
				fullMatch,
				text,
				delimiter,
			};
			if (labelPrefix !== undefined) {
				const num = parseInt(labelPrefix.slice(1, -1), 10); // strip "c" and ":"
				if (!labeled.has(num)) labeled.set(num, []);
				labeled.get(num)!.push(occ);
			} else {
				anonymous.push(occ);
			}
		}
	}

	if (labeled.size === 0 && anonymous.length === 0) return [];

	// Compose final groups. Labeled groups keep their user-authored suffix
	// numbers verbatim. Anonymous groups are each their own group, numbered
	// strictly above the max labeled number, in source order.
	const firstLineOf = (occs: ClozeOccurrence[]): number => {
		let min = Number.POSITIVE_INFINITY;
		for (const o of occs) {
			const idx = o.kind === "code-multi" ? o.startIdx : o.lineIdx;
			if (idx < min) min = idx;
		}
		return min;
	};

	const groups: ClozeGroup[] = [];
	for (const [num, occs] of labeled) {
		groups.push({ suffix: num, firstLineIdx: firstLineOf(occs), occurrences: occs });
	}

	let nextAnon = 1;
	for (const num of labeled.keys()) {
		if (num >= nextAnon) nextAnon = num + 1;
	}
	// Anonymous groups are emitted in source order so the first anonymous
	// occurrence gets the lowest available number.
	const anonSorted = [...anonymous].sort((a, b) => {
		const ai = a.kind === "code-multi" ? a.startIdx : a.lineIdx;
		const bi = b.kind === "code-multi" ? b.startIdx : b.lineIdx;
		return ai - bi;
	});
	for (const occ of anonSorted) {
		const idx = occ.kind === "code-multi" ? occ.startIdx : occ.lineIdx;
		groups.push({ suffix: nextAnon++, firstLineIdx: idx, occurrences: [occ] });
	}

	groups.sort((a, b) => a.suffix - b.suffix);
	return groups;
}

/**
 * Render front/back for one cloze group. Every other group's markers are
 * stripped (prose: delimiters kept for `==` and `**`, removed for `:::`; code:
 * markers removed). Only the target group's occurrences are blanked.
 */
function renderClozeCard(
	contentLines: string[],
	groups: ClozeGroup[],
	targetIdx: number,
): { front: string; back: string } {
	const target = groups[targetIdx]!;

	// Lines fully owned by any code-multi region (marker + interior).
	// Marker lines never appear in output; interior lines are either blanked
	// (for the target region) or shown as-is (for other regions).
	const multiRegions: Array<{
		startIdx: number;
		endIdx: number;
		isTarget: boolean;
	}> = [];
	for (const group of groups) {
		for (const occ of group.occurrences) {
			if (occ.kind === "code-multi") {
				multiRegions.push({
					startIdx: occ.startIdx,
					endIdx: occ.endIdx,
					isTarget: group === target,
				});
			}
		}
	}

	// For code-single occurrences: map line index → (is target?).
	const codeSingleLines = new Map<number, boolean>();
	for (const group of groups) {
		for (const occ of group.occurrences) {
			if (occ.kind === "code-single") {
				codeSingleLines.set(occ.lineIdx, group === target);
			}
		}
	}

	// For inline-code + prose: collect targets vs. non-targets by line+fullMatch.
	// Non-targets always render their text (markers stripped); targets get the
	// blank obfuscator.
	const renderInlineLine = (i: number, raw: string): { front: string; back: string } => {
		const front = raw.replace(INLINE_MARKER_REGEX, (fullMatch, _text: string) => {
			const hit = target.occurrences.find(
				(o) => o.kind === "inline-code" && o.lineIdx === i && o.fullMatch === fullMatch,
			);
			return hit ? CLOZE_BLANK : fullMatch.replace(INLINE_MARKER_REGEX, (_, t: string) => t);
		});
		const back = raw.replace(INLINE_MARKER_REGEX, (_, text: string) => text);
		return { front, back };
	};

	const renderProseLine = (i: number, raw: string): { front: string; back: string } => {
		const replaceFront = (full: string): string => {
			const hit = target.occurrences.find(
				(o) => o.kind === "prose" && o.lineIdx === i && o.fullMatch === full,
			);
			if (hit) return CLOZE_BLANK;
			// Non-target prose cloze: `:::` gets stripped to its text; `==`/`**`
			// stay wrapped so highlight/bold rendering is preserved on both sides.
			if (full.startsWith(":::")) {
				const inner = full.slice(3, -3);
				return inner.replace(/^c\d+:/, "");
			}
			// `==cN:text==` or `**cN:text**` → strip the `cN:` label; keep delimiters.
			const delim = full.startsWith("==") ? "==" : "**";
			const body = full.slice(2, -2).replace(/^c\d+:/, "");
			return `${delim}${body}${delim}`;
		};
		const front = raw.replace(PROSE_CLOZE_REGEX, replaceFront);

		// Back: same as front but the target occurrence is NOT blanked — it's
		// shown like any other cloze would be on a non-target card.
		const replaceBack = (full: string): string => {
			if (full.startsWith(":::")) {
				const inner = full.slice(3, -3);
				return inner.replace(/^c\d+:/, "");
			}
			const delim = full.startsWith("==") ? "==" : "**";
			const body = full.slice(2, -2).replace(/^c\d+:/, "");
			return `${delim}${body}${delim}`;
		};
		const back = raw.replace(PROSE_CLOZE_REGEX, replaceBack);
		return { front, back };
	};

	const frontLines: string[] = [];
	const backLines: string[] = [];
	let targetMultiBlanked = false;
	const innerFence = findInnerCodeFence(contentLines);

	for (let i = 0; i < contentLines.length; i++) {
		// Skip code-multi marker lines outright (never shown).
		const asMarker = multiRegions.find((r) => r.startIdx === i || r.endIdx === i);
		if (asMarker) continue;

		// Interior of a code-multi region?
		const interior = multiRegions.find((r) => i > r.startIdx && i < r.endIdx);
		if (interior) {
			if (interior.isTarget) {
				if (!targetMultiBlanked) {
					const indent = getIndent(contentLines[i]!);
					frontLines.push(`${indent}${CLOZE_BLANK}`);
					targetMultiBlanked = true;
				}
				backLines.push(stripInlineClozeMarkers(contentLines[i]!));
			} else {
				const stripped = stripInlineClozeMarkers(contentLines[i]!);
				frontLines.push(stripped);
				backLines.push(stripped);
			}
			continue;
		}

		// Single-line code cloze?
		const singleIsTarget = codeSingleLines.get(i);
		if (singleIsTarget !== undefined) {
			const raw = contentLines[i]!;
			if (singleIsTarget) {
				const indent = getIndent(raw);
				frontLines.push(`${indent}${CLOZE_BLANK}`);
				backLines.push(stripInlineClozeMarkers(stripCodeClozeMarker(raw)));
			} else {
				const stripped = stripInlineClozeMarkers(stripCodeClozeMarker(raw));
				frontLines.push(stripped);
				backLines.push(stripped);
			}
			continue;
		}

		// Line may contain inline-code or prose clozes — route by location.
		const raw = contentLines[i]!;
		const inCode = innerFence !== null && i > innerFence.start && i < innerFence.end;
		if (inCode) {
			const { front, back } = renderInlineLine(i, raw);
			frontLines.push(front);
			backLines.push(back);
		} else {
			const { front, back } = renderProseLine(i, raw);
			frontLines.push(front);
			backLines.push(back);
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
 * If no *** separator, the fence is treated as a cloze card. Any of these
 * cloze forms are recognized, prose and code side-by-side in the same fence:
 *   - Prose:   ==text==, **text**, :::text::: (optional cN: prefix)
 *   - Inline code: :::text::: (optional cN: prefix) inside an inner ``` fence
 *   - Line code:   # osmosis-cloze (optional -cN suffix)
 *   - Region code: # osmosis-cloze-start / -end (optional -cN suffix)
 * Occurrences sharing a cN label are blanked together as one card.
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

		if (i < lines.length) i++; // skip closing fence

		if (metadata.exclude) continue;

		const fenceId = metadata.id
			|| idsByLine.get(fenceStartLine)
			|| generateCardId();

		const separatorIdx = contentLines.findIndex(
			(l) => l.trim() === SEPARATOR,
		);

		if (separatorIdx === -1) {
			// Cloze path — unified across prose and code.
			const content = contentLines.join("\n").trim();
			if (content.length === 0) continue;

			const groups = collectClozeGroups(contentLines);
			if (groups.length === 0) continue;

			const hasInlineCode = groups.some((g) =>
				g.occurrences.some((o) => o.kind === "inline-code"),
			);
			const hasCodeLevel = groups.some((g) =>
				g.occurrences.some((o) => o.kind === "code-single" || o.kind === "code-multi"),
			);
			const cardType = hasInlineCode || hasCodeLevel ? "code_cloze" : "explicit_cloze";

			for (let gi = 0; gi < groups.length; gi++) {
				const { front, back } = renderClozeCard(contentLines, groups, gi);
				const suffix = `c${groups[gi]!.suffix}`;
				const derivedSched = metadata.derivedSchedules?.get(suffix);
				cards.push({
					id: `${fenceId}-${suffix}`,
					card_type: cardType,
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

		const frontContent = contentLines.slice(0, separatorIdx).join("\n").trim();
		const backContent = contentLines
			.slice(separatorIdx + 1)
			.join("\n")
			.trim();

		if (frontContent.length === 0 && backContent.length === 0) continue;

		const front = metadata.hint
			? `${frontContent}\n\n_Hint: ${metadata.hint}_`
			: frontContent;

		if (metadata.bidi) {
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
