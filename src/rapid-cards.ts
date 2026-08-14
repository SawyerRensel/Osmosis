/**
 * Rapid Flashcard Mode: turn plain typed lines into an `osmosis` fence card,
 * using blank lines as the only syntax.
 *
 * One blank line separates front from back; two blank lines commit the card.
 * So the only keystroke the mode intercepts is the Enter pressed while the
 * cursor sits on an empty line whose predecessor is also empty — the boundary
 * double-Enter needs no handling at all, since it is an ordinary blank line
 * that this module reads backwards as the `***` split:
 *
 *     HTTP 429                 ← front block
 *     What does the server want?
 *                              ← the boundary blank
 *     Too Many Requests        ← back block
 *     Back off and retry later
 *                              ← blank
 *     ▏                        ← Enter here commits
 *
 * Lines are captured literally, list markers and all: a front or back may
 * legitimately be a list, and stripping `- ` would corrupt it.
 *
 * A fenced code block can be either side of a card, so the block scan is
 * fence-aware in three ways: a blank line *inside* a fence is content rather
 * than a boundary, walking up over a fence's closing delimiter takes the whole
 * block with it, and the `osmosis` fence written out is always one backtick
 * longer than the longest run it has to contain.
 *
 * Kept free of `obsidian` and `@codemirror` imports so it stays unit-testable;
 * main.ts owns the keymap and the dispatch.
 */

/** A code fence delimiter line: ``` or ~~~, three or more, plus its info string. */
const FENCE_DELIMITER = /^(`{3,}|~{3,})(.*)$/;

/** Leading backtick run, which the written fence has to out-length. */
const LEADING_BACKTICKS = /^\s*(`+)/;

/** The fence a captured card is written into. */
const FENCE_LANGUAGE = "osmosis";

/** Separator between a card's front and back inside the fence. */
const SEPARATOR = "***";

/** The rewrite a commit performs, in document coordinates. */
export interface RapidCardEdit {
	/** First line replaced (0-based, inclusive). */
	fromLine: number;
	/** Last line replaced (0-based, inclusive) — the line Enter was pressed on. */
	toLine: number;
	/** Replacement text for those lines. */
	text: string;
	/** Line index *within `text`* the cursor ends on, empty and ready for the next front. */
	cursorLine: number;
}

/** A closed fenced code block, shared by every line it covers. */
interface FenceSpan {
	/** Index of the opening delimiter. */
	start: number;
	/** Whether this block is itself an Osmosis card. */
	osmosis: boolean;
}

/**
 * Plan the card a commit keystroke would write, or null when this Enter is an
 * ordinary one and should fall through to the editor.
 *
 * `cursorLine` is 0-based and describes the document *before* the Enter is
 * applied.
 */
export function planRapidCard(lines: string[], cursorLine: number): RapidCardEdit | null {
	const { spans, unclosedFrom } = scanFences(lines);
	const isBlank = (i: number): boolean => (lines[i] ?? "").trim() === "";
	// Only a blank line at the top level ends a block. Inside a fence it is
	// part of the code being captured.
	const isSeparator = (i: number): boolean => isBlank(i) && spans[i] === undefined;

	// The commit keystroke: on an empty line, with an empty line above it, both
	// outside any fence.
	if (cursorLine < 1 || !isSeparator(cursorLine) || !isSeparator(cursorLine - 1)) return null;
	// Inside an unclosed fence, blank lines are content, not syntax.
	if (unclosedFrom !== null && cursorLine > unclosedFrom) return null;

	const backEnd = cursorLine - 2;
	if (backEnd < 0 || isSeparator(backEnd)) return null;
	const backStart = blockStart(backEnd, spans, isSeparator);

	// Exactly one blank line separates the two sides. Anything else — an
	// osmosis fence, the start of the note, a second blank — means there is no
	// front, and a half card is worse than a plain newline.
	if (!isSeparator(backStart - 1)) return null;

	const frontEnd = backStart - 2;
	if (frontEnd < 0 || isSeparator(frontEnd)) return null;
	const frontStart = blockStart(frontEnd, spans, isSeparator);

	const front = lines.slice(frontStart, frontEnd + 1);
	const back = lines.slice(backStart, backEnd + 1);
	// Long enough to contain whatever fences the card holds — and long enough
	// again when one of those is itself holding a fence.
	const fence = "`".repeat(fenceLength([...front, ...back]));

	const out: string[] = [];
	// A fence needs a blank line above it unless it opens the note.
	if (frontStart > 0 && !isBlank(frontStart - 1)) out.push("");
	out.push(`${fence}${FENCE_LANGUAGE}`, ...front, SEPARATOR, ...back, fence, "");
	// The cursor lands past the fence's trailing blank, so the next card's
	// front already has its separating blank line and needs none added.
	const cursorIndex = out.length;
	out.push("");

	return { fromLine: frontStart, toLine: cursorLine, text: out.join("\n"), cursorLine: cursorIndex };
}

/**
 * Walk up from the last line of a block to its first, stepping over whole
 * fenced code blocks rather than into them.
 *
 * The walk stops at an `osmosis` fence, so a front typed directly beneath a
 * card written moments earlier can never swallow it.
 */
function blockStart(
	end: number,
	spans: (FenceSpan | undefined)[],
	isSeparator: (i: number) => boolean,
): number {
	let start = spans[end]?.start ?? end;
	while (start > 0) {
		const above = start - 1;
		if (isSeparator(above) || spans[above]?.osmosis) break;
		start = spans[above]?.start ?? above;
	}
	return start;
}

/**
 * Map every line covered by a *closed* fenced code block to that block.
 *
 * A delimiter only closes a block when it uses the same character, is at least
 * as long, and carries no info string — which is exactly what makes a ``` line
 * inside a ```` block content rather than a delimiter.
 */
function scanFences(lines: string[]): {
	spans: (FenceSpan | undefined)[];
	unclosedFrom: number | null;
} {
	const spans: (FenceSpan | undefined)[] = new Array<FenceSpan | undefined>(lines.length);
	let open: { start: number; marker: string; length: number; osmosis: boolean } | null = null;

	for (let i = 0; i < lines.length; i++) {
		const match = FENCE_DELIMITER.exec(lines[i] ?? "");
		if (!match) continue;
		const ticks = match[1]!;
		const info = match[2]!.trim();

		if (!open) {
			open = { start: i, marker: ticks[0]!, length: ticks.length, osmosis: info === FENCE_LANGUAGE };
			continue;
		}
		if (ticks[0] === open.marker && ticks.length >= open.length && info === "") {
			const span: FenceSpan = { start: open.start, osmosis: open.osmosis };
			for (let j = open.start; j <= i; j++) spans[j] = span;
			open = null;
		}
	}

	return { spans, unclosedFrom: open?.start ?? null };
}

/** Backtick count for a fence that must contain `content` — always at least 3. */
function fenceLength(content: string[]): number {
	let longest = 0;
	for (const line of content) {
		const match = LEADING_BACKTICKS.exec(line);
		if (match) longest = Math.max(longest, match[1]!.length);
	}
	return Math.max(3, longest + 1);
}
