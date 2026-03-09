import { generateCardId, extractCardIds } from "../card-id";
import { OSMOSIS_ID_STRIP_REGEX } from "../card-id";
import type { GeneratedCard } from "./types";

/** Match ==highlighted== text. */
const HIGHLIGHT_REGEX = /==([^=]+)==/g;

/** Match **bold** text (but not ***). */
const BOLD_REGEX = /\*\*([^*]+)\*\*(?!\*)/g;

/**
 * Generate cloze cards from ==highlighted== and **bold** text in markdown.
 *
 * Each highlighted or bold term produces one card:
 * - Front: the full sentence/paragraph with the term replaced by [...]
 * - Back: the full sentence/paragraph with the term intact
 */
export function generateClozeCards(markdown: string): GeneratedCard[] {
	const lines = markdown.split("\n");
	const cards: GeneratedCard[] = [];

	// Build a map of existing IDs by their position in the source
	const existingIds = extractCardIds(markdown);

	// Track which existing IDs we've consumed (in order per line)
	const idsByLine = new Map<number, string[]>();
	for (const ext of existingIds) {
		const arr = idsByLine.get(ext.line) ?? [];
		arr.push(ext.id);
		idsByLine.set(ext.line, arr);
	}
	const idConsumptionIndex = new Map<number, number>();

	let inCodeFence = false;
	for (let lineNum = 0; lineNum < lines.length; lineNum++) {
		const rawLine = lines[lineNum]!;
		// Strip osmosis IDs for content processing
		const line = rawLine.replace(OSMOSIS_ID_STRIP_REGEX, "");

		// Track code fence state
		if (line.match(/^```/)) {
			inCodeFence = !inCodeFence;
			continue;
		}

		// Skip content inside code fences, headings, and frontmatter
		if (inCodeFence || line.match(/^#{1,6}\s/) || line === "---") {
			continue;
		}

		// Find all cloze targets in this line
		const targets: Array<{
			term: string;
			type: "cloze_highlight" | "cloze_bold";
			index: number;
		}> = [];

		let match: RegExpExecArray | null;

		const hlRegex = new RegExp(HIGHLIGHT_REGEX.source, "g");
		while ((match = hlRegex.exec(line)) !== null) {
			targets.push({
				term: match[1]!,
				type: "cloze_highlight",
				index: match.index,
			});
		}

		const boldRegex = new RegExp(BOLD_REGEX.source, "g");
		while ((match = boldRegex.exec(line)) !== null) {
			targets.push({
				term: match[1]!,
				type: "cloze_bold",
				index: match.index,
			});
		}

		// Sort by position in line
		targets.sort((a, b) => a.index - b.index);

		const lineIds = idsByLine.get(lineNum) ?? [];
		let consumedIdx = idConsumptionIndex.get(lineNum) ?? 0;

		for (const target of targets) {
			// Create the cloze front by replacing the specific target with [...]
			const front = createClozeFront(line, target.term, target.type);

			const id = lineIds[consumedIdx] ?? generateCardId();
			consumedIdx++;

			cards.push({
				id,
				card_type: target.type,
				front,
				back: line,
				deck: "",
				sourceLine: lineNum,
				typeIn: false,
			});
		}

		idConsumptionIndex.set(lineNum, consumedIdx);
	}

	return cards;
}

/**
 * Replace the matched cloze term with [...] in the line.
 * Preserves the surrounding markdown syntax markers.
 */
function createClozeFront(
	line: string,
	term: string,
	type: "cloze_highlight" | "cloze_bold",
): string {
	const marker = type === "cloze_highlight" ? "==" : "\\*\\*";
	const pattern = `${marker}${escapeRegex(term)}${marker}`;
	return line.replace(new RegExp(pattern), "[...]");
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
