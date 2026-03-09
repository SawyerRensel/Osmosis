/** Regex to match <!--osmosis-id:XXXX--> inline comments. */
const OSMOSIS_ID_REGEX = /<!--osmosis-id:([a-zA-Z0-9]+)-->/g;

/** Result of extracting an ID from markdown text. */
export interface ExtractedCardId {
	/** The osmosis ID string (e.g., "a1b2c3d4"). */
	id: string;
	/** Character offset of the start of the comment in the source. */
	start: number;
	/** Character offset of the end of the comment in the source. */
	end: number;
	/** Line number (0-based) where the comment appears. */
	line: number;
}

/**
 * Extract all <!--osmosis-id:xxx--> comments from markdown text.
 * Returns them in document order.
 *
 * Used for backward compatibility with fences that still have
 * osmosis-id HTML comments on their opening line.
 */
export function extractCardIds(markdown: string): ExtractedCardId[] {
	const results: ExtractedCardId[] = [];
	const regex = new RegExp(OSMOSIS_ID_REGEX.source, "g");
	let match: RegExpExecArray | null;

	while ((match = regex.exec(markdown)) !== null) {
		const start = match.index;
		const end = start + match[0].length;
		const line = lineNumberAt(markdown, start);
		results.push({ id: match[1]!, start, end, line });
	}

	return results;
}

/**
 * Generate a new short random ID for a card.
 * Uses crypto.randomUUID() truncated to 8 hex chars.
 */
export function generateCardId(): string {
	return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

/** Count newlines before the given offset to determine line number. */
function lineNumberAt(text: string, offset: number): number {
	let line = 0;
	for (let i = 0; i < offset; i++) {
		if (text[i] === "\n") line++;
	}
	return line;
}
