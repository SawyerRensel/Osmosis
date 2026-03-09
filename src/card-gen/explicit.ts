import { generateCardId, extractCardIds } from "../card-id";
import type { GeneratedCard, FenceMetadata } from "./types";

/** Match an osmosis code fence block. */
const FENCE_REGEX = /^```osmosis\s*$/;
const FENCE_END_REGEX = /^```\s*$/;
const SEPARATOR = "***";
/** Match ==term== or **term** cloze deletions. */
const CLOZE_REGEX = /==([^=]+)==|\*\*([^*]+)\*\*/g;

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

				cards.push({
					id: `${fenceId}-c${ci + 1}`,
					card_type: "explicit_cloze",
					front: metadata.hint
						? `${front}\n\n_Hint: ${metadata.hint}_`
						: front,
					back: content,
					deck: metadata.deck,
					sourceLine: fenceStartLine,
					typeIn: metadata.typeIn,
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
			});

			// Reverse card gets deterministic derived ID
			const reverseFront = metadata.hint
				? `${backContent}\n\n_Hint: ${metadata.hint}_`
				: backContent;
			cards.push({
				id: `${fenceId}-r`,
				card_type: "explicit_bidi",
				front: reverseFront,
				back: frontContent,
				deck: metadata.deck,
				sourceLine: fenceStartLine,
				typeIn: metadata.typeIn,
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
			});
		}
	}

	return cards;
}
