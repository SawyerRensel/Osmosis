import { generateCardId, extractCardIds } from "../card-id";
import type { CardState } from "../database/types";
import type { GeneratedCard, FenceMetadata, DerivedSchedule } from "./types";

/** Match an osmosis code fence block. */
const FENCE_REGEX = /^```osmosis\s*$/;
const FENCE_END_REGEX = /^```\s*$/;
const SEPARATOR = "***";
/** Match ==term== or **term** cloze deletions. */
const CLOZE_REGEX = /==([^=]+)==|\*\*([^*]+)\*\*/g;

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
		if (!FENCE_REGEX.test(lines[i]!.replace(/\s*<!--.*?-->/g, "").trim())) {
			i++;
			continue;
		}

		const fenceStartLine = i;
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
		while (i < lines.length && !FENCE_END_REGEX.test(lines[i]!.trim())) {
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
		while (i < lines.length && !FENCE_END_REGEX.test(lines[i]!.trim())) {
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
			// No separator — check for cloze deletions
			const content = contentLines.join("\n").trim();
			if (content.length === 0) continue;

			const clozeMatches = [...content.matchAll(CLOZE_REGEX)];
			if (clozeMatches.length === 0) continue; // No separator and no clozes — skip

			// Generate one card per cloze deletion
			for (let ci = 0; ci < clozeMatches.length; ci++) {
				// Replace only the ci-th occurrence with [...]
				let occurrenceIdx = 0;
				const front = content.replace(CLOZE_REGEX, (match, _group) => {
					const result = occurrenceIdx === ci ? "[...]" : match;
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
