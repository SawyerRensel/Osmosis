import { generateCardId, extractCardIds } from "../card-id";
import { OSMOSIS_ID_STRIP_REGEX } from "../card-id";
import type { GeneratedCard } from "./types";

/**
 * Generate heading-paragraph cards from markdown.
 *
 * A card is generated for each heading that has body text (paragraphs,
 * lists, etc.) underneath it before the next heading of equal or higher level.
 * Front = heading text, Back = body content.
 */
export function generateHeadingCards(markdown: string): GeneratedCard[] {
	const lines = markdown.split("\n");
	const cards: GeneratedCard[] = [];

	// Extract existing card IDs for stable identity
	const existingIds = extractCardIds(markdown);
	const idsByLine = new Map<number, string>();
	for (const ext of existingIds) {
		idsByLine.set(ext.line, ext.id);
	}

	let i = 0;
	while (i < lines.length) {
		const headingMatch = lines[i]!.match(/^(#{1,6})\s+(.+)$/);
		if (!headingMatch) {
			i++;
			continue;
		}

		const headingLevel = headingMatch[1]!.length;
		const headingLine = i;
		const headingText = headingMatch[2]!
			.replace(OSMOSIS_ID_STRIP_REGEX, "")
			.trim();

		// Collect body lines until next heading of equal or higher level
		const bodyLines: string[] = [];
		let j = i + 1;
		while (j < lines.length) {
			const nextHeading = lines[j]!.match(/^(#{1,6})\s/);
			if (nextHeading && nextHeading[1]!.length <= headingLevel) {
				break;
			}
			// Skip child headings' own content — they'll generate their own cards
			const childHeading = lines[j]!.match(/^(#{1,6})\s/);
			if (childHeading) {
				break;
			}
			bodyLines.push(lines[j]!);
			j++;
		}

		// Trim empty lines from start and end of body
		while (bodyLines.length > 0 && bodyLines[0]!.trim() === "") {
			bodyLines.shift();
		}
		while (
			bodyLines.length > 0 &&
			bodyLines[bodyLines.length - 1]!.trim() === ""
		) {
			bodyLines.pop();
		}

		if (bodyLines.length > 0) {
			const body = bodyLines
				.map((l) => l.replace(OSMOSIS_ID_STRIP_REGEX, ""))
				.join("\n")
				.trim();

			if (body.length > 0) {
				const id = idsByLine.get(headingLine) ?? generateCardId();
				cards.push({
					id,
					card_type: "heading",
					front: headingText,
					back: body,
					deck: "",
					sourceLine: headingLine,
					typeIn: false,
				});
			}
		}

		i = j;
	}

	return cards;
}
