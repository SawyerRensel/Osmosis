/** Regex to match <!--osmosis-id:XXXX--> inline comments. */
const OSMOSIS_ID_REGEX = /<!--osmosis-id:([a-zA-Z0-9]+)-->/g;

/** Regex to strip osmosis-id comments from content strings. */
export const OSMOSIS_ID_STRIP_REGEX = /\s*<!--osmosis-id:[a-zA-Z0-9]+-->/g;

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

/**
 * Build the osmosis-id comment string for a given ID.
 */
export function formatCardIdComment(id: string): string {
	return `<!--osmosis-id:${id}-->`;
}

/**
 * Insert an osmosis-id comment into markdown at the end of the line
 * containing the given character offset.
 * Returns the modified markdown string.
 */
export function insertCardIdAtLine(
	markdown: string,
	id: string,
	lineCharOffset: number,
): string {
	const lineEnd = markdown.indexOf("\n", lineCharOffset);
	const insertPos = lineEnd === -1 ? markdown.length : lineEnd;
	const comment = ` ${formatCardIdComment(id)}`;
	return markdown.slice(0, insertPos) + comment + markdown.slice(insertPos);
}

/**
 * Remove an osmosis-id comment from markdown.
 * Returns the modified markdown string.
 */
export function removeCardId(markdown: string, id: string): string {
	const pattern = new RegExp(
		`\\s*<!--osmosis-id:${escapeRegex(id)}-->`,
		"g",
	);
	return markdown.replace(pattern, "");
}

/**
 * Given a markdown document and its parsed AST nodes, associate each
 * relevant AST node with its osmosis-id (if one exists nearby).
 *
 * An ID is associated with a node if the ID comment appears on the
 * same line as the node's range start, or on the line immediately
 * following the node's range end.
 */
export function associateIdsWithNodes(
	extractedIds: ExtractedCardId[],
	nodeRanges: Array<{
		nodeId: string;
		startLine: number;
		endLine: number;
	}>,
): Map<string, string> {
	const nodeIdToCardId = new Map<string, string>();

	for (const extracted of extractedIds) {
		for (const node of nodeRanges) {
			if (
				extracted.line >= node.startLine &&
				extracted.line <= node.endLine + 1
			) {
				nodeIdToCardId.set(node.nodeId, extracted.id);
				break;
			}
		}
	}

	return nodeIdToCardId;
}

/** Count newlines before the given offset to determine line number. */
function lineNumberAt(text: string, offset: number): number {
	let line = 0;
	for (let i = 0; i < offset; i++) {
		if (text[i] === "\n") line++;
	}
	return line;
}

/** Escape special regex characters in a string. */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
