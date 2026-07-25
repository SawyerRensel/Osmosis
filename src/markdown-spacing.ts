/**
 * Block-spacing normalization shared by the mind-map write path and the
 * line-card generator.
 *
 * Osmosis is line-oriented — every non-blank line is its own node/card — but
 * Obsidian block IDs can only identify a whole block. Consecutive prose lines
 * with no blank line between them are ONE Obsidian block, so only the last
 * could carry a valid `^id`. Normalizing a prose run into blank-line-separated
 * blocks makes each line its own block, so each can be a card with its own
 * block ID. The mind map already applies this on every save; the generator
 * reuses it so both surfaces agree (see notes/02_planning/
 * notes_as_flashcards_plan.md §8, task-12 follow-up).
 */

/** Result of normalization: the rewritten content plus an original→new line map. */
export interface NormalizedSpacing {
	content: string;
	/**
	 * `lineMap[i]` is the index, in the normalized content, of original line
	 * `i`. Normalization only inserts blank lines (and collapses runs of them),
	 * so every original line still exists; this lets callers translate a line
	 * range selected on the original text onto the normalized text.
	 */
	lineMap: number[];
}

/**
 * Ensure exactly one blank line before and after headings, top-level code
 * fences, tables, blockquotes, and standalone paragraphs — collapsing runs of
 * 2+ blank lines to one. Idempotent. Returns the content and an original→new
 * line-index map.
 */
export function normalizeBlockSpacing(content: string): NormalizedSpacing {
	const allLines = content.split("\n");

	// Pass YAML frontmatter through verbatim — its `---` fences and `key: value`
	// lines must never be treated as prose/hr and spaced out. Normalize only
	// the body after it; frontmatter lines map to themselves.
	const fmEnd = frontmatterEndIndex(allLines);
	const headerLines = fmEnd >= 0 ? allLines.slice(0, fmEnd + 1) : [];
	const rawLines = fmEnd >= 0 ? allLines.slice(fmEnd + 1) : allLines;
	const bodyOffset = headerLines.length;

	// First: collapse runs of 2+ blank lines into exactly one blank line.
	// Track how collapsing shifts original line indices so the caller's map
	// stays anchored to original lines, not the post-collapse intermediate.
	const collapsedLines: string[] = [];
	const collapsedIndexOfRaw: number[] = [];
	for (let i = 0; i < rawLines.length; i++) {
		const line = rawLines[i] ?? "";
		const prev = collapsedLines[collapsedLines.length - 1];
		if (line.trim() === "" && prev !== undefined && prev.trim() === "") {
			// Dropped blank line — map it to the surviving blank's position.
			collapsedIndexOfRaw[i] = collapsedLines.length - 1;
			continue;
		}
		collapsedIndexOfRaw[i] = collapsedLines.length;
		collapsedLines.push(line);
	}

	const lines = collapsedLines;
	const result: string[] = [];
	// newIndexOfCollapsed[j] = index in `result` of collapsed line j.
	const newIndexOfCollapsed: number[] = [];
	let inCodeBlock = false;
	let inTable = false;
	let inBlockquote = false;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";
		const isHeading = /^#{1,6}\s/.test(line);
		// Only add spacing around top-level code fences (not indented ones inside lists)
		const isFence = /^(`{3,}|~{3,})/.test(line.trim());
		const isTopLevelFence = isFence && /^(`{3,}|~{3,})/.test(line);
		const isTableLine = /^\s*\|/.test(line);
		// Blockquote / callout lines (not code-fence contents). A run of
		// these is one block that needs a blank line before and after but
		// none inserted between its lines.
		const isQuoteLine = !inCodeBlock && /^\s*>/.test(line);
		const isBlockquoteStart = isQuoteLine && !inBlockquote;
		// Detect table start (first pipe line after non-pipe)
		const isTableStart = isTableLine && !inTable;
		// A standalone block-ID line (`^os-a1b2c3`) is Obsidian's after-block
		// reference — it must stay glued to the block above it, never spaced
		// off as its own paragraph.
		const isStandaloneId = /^\s*\^[a-zA-Z0-9-]+\s*$/.test(line);
		// Detect paragraph: non-blank, non-list, non-heading, non-fence, non-table,
		// non-quote, non-block-ID, not indented (top-level), not inside code block
		const isTopLevelParagraph = !isHeading && !isFence && !isTableLine && !isQuoteLine
			&& !isStandaloneId
			&& line.trim() !== "" && !/^(\t| {2,})/.test(line)
			&& !/^[-*]\s/.test(line) && !/^\d+\.\s/.test(line)
			&& !inCodeBlock;

		if (isFence) inCodeBlock = !inCodeBlock;
		if (isTableStart) inTable = true;
		if (inTable && !isTableLine) inTable = false;
		inBlockquote = isQuoteLine;

		const nextLine = lines[i + 1];
		const nextIsQuote = nextLine !== undefined && /^\s*>/.test(nextLine);
		const isBlockquoteEnd = isQuoteLine && !nextIsQuote;

		const prevLine = result[result.length - 1];
		const needsBlankBefore =
			isHeading
			|| (isTopLevelFence && inCodeBlock)
			|| isTableStart
			|| isBlockquoteStart
			|| (isTopLevelParagraph && prevLine !== undefined && prevLine.trim() !== ""
				&& !/^#{1,6}\s/.test(prevLine));

		if (
			needsBlankBefore &&
			result.length > 0 &&
			prevLine !== undefined &&
			prevLine.trim() !== ""
		) {
			result.push("");
		}
		newIndexOfCollapsed[i] = result.length;
		result.push(line);

		// Detect table end (current is table, next is not)
		const isTableEnd = isTableLine && (nextLine === undefined || !/^\s*\|/.test(nextLine));
		const needsBlankAfter =
			isHeading
			|| (isTopLevelFence && !inCodeBlock)
			|| isTableEnd
			|| isBlockquoteEnd
			|| (isTopLevelParagraph && nextLine !== undefined && nextLine.trim() !== ""
				&& !/^#{1,6}\s/.test(nextLine));

		// Never insert a blank before a standalone block-ID line — it must
		// hug the block it references.
		const nextIsStandaloneId = nextLine !== undefined && /^\s*\^[a-zA-Z0-9-]+\s*$/.test(nextLine);
		if (needsBlankAfter && !nextIsStandaloneId) {
			if (nextLine !== undefined && nextLine.trim() !== "") {
				result.push("");
			}
		}
	}

	// Compose index maps: original raw (body) line → collapsed → normalized,
	// then shift past the frontmatter that was passed through untouched.
	const bodyMap = collapsedIndexOfRaw.map(
		(collapsedIdx) => (newIndexOfCollapsed[collapsedIdx] ?? collapsedIdx) + bodyOffset,
	);
	const headerMap = headerLines.map((_, i) => i);
	const lineMap = [...headerMap, ...bodyMap];

	return { content: [...headerLines, ...result].join("\n"), lineMap };
}

/**
 * Index of the closing `---` of a leading YAML frontmatter block, or -1 when
 * the content has none. Frontmatter must start on the very first line.
 */
function frontmatterEndIndex(lines: string[]): number {
	if (lines[0] !== "---") return -1;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i] === "---") return i;
	}
	return -1;
}
