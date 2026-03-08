import { generateCardId, extractCardIds } from "../card-id";
import type { GeneratedCard, FenceMetadata } from "./types";

/** Match an osmosis code fence block. */
const FENCE_REGEX = /^```osmosis\s*$/;
const FENCE_END_REGEX = /^```\s*$/;
const SEPARATOR = "***";

/**
 * Generate explicit cards from ```osmosis code fences.
 *
 * Fence format:
 * ```osmosis
 * key: value     ← optional metadata lines (before first blank line)
 *
 * Front content
 * ***
 * Back content
 * ```
 *
 * Metadata keys: bidi, type-in, deck, hint
 * bidi: true generates two cards (forward + reverse as explicit_bidi type).
 */
export function generateExplicitCards(markdown: string): GeneratedCard[] {
	const lines = markdown.split("\n");
	const cards: GeneratedCard[] = [];

	// Extract existing IDs
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

		// Split on *** separator
		const separatorIdx = contentLines.findIndex(
			(l) => l.trim() === SEPARATOR,
		);
		if (separatorIdx === -1) {
			// No separator — skip this fence (malformed)
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

		const id = idsByLine.get(fenceStartLine) ?? generateCardId();

		if (metadata.bidi) {
			// Generate two cards: forward and reverse
			cards.push({
				id,
				card_type: "explicit_bidi",
				front,
				back: backContent,
				deck: metadata.deck,
				sourceLine: fenceStartLine,
			});

			// Reverse card gets a derived ID
			const reverseId =
				idsByLine.get(fenceStartLine + 1) ?? generateCardId();
			const reverseFront = metadata.hint
				? `${backContent}\n\n_Hint: ${metadata.hint}_`
				: backContent;
			cards.push({
				id: reverseId,
				card_type: "explicit_bidi",
				front: reverseFront,
				back: frontContent,
				deck: metadata.deck,
				sourceLine: fenceStartLine,
			});
		} else {
			cards.push({
				id,
				card_type: "explicit",
				front,
				back: backContent,
				deck: metadata.deck,
				sourceLine: fenceStartLine,
			});
		}
	}

	return cards;
}
