/**
 * How wide a code-block node fits its longest line, shared by the mind map
 * (px) and Cosmos (ems): a code block with no custom width is as wide as
 * its longest line, up to `CODE_FIT_MAX_COLUMNS` characters, then wraps. A
 * custom `width` style always wins. Only code blocks: every other node keeps
 * the map's max node width.
 *
 * Pure logic, no `obsidian` import, so it is unit-tested.
 */

/** The widest a code block grows to fit its longest line, in monospace columns. */
export const CODE_FIT_MAX_COLUMNS = 100;

/** Terminal columns a code point takes: 2 for East Asian wide characters and emoji, else 1. */
function columnsOf(codePoint: number): number {
	const wide =
		(codePoint >= 0x1100 && codePoint <= 0x115f) ||
		(codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
		(codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
		(codePoint >= 0xf900 && codePoint <= 0xfaff) ||
		(codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
		(codePoint >= 0xff00 && codePoint <= 0xff60) ||
		(codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
		(codePoint >= 0x1f300 && codePoint <= 0x1faff) ||
		(codePoint >= 0x20000 && codePoint <= 0x3fffd);
	return wide ? 2 : 1;
}

/** How many monospace columns `line` takes (tabs count as one: the wrap estimate leans on the real measure). */
export function lineColumns(line: string): number {
	let columns = 0;
	for (const char of line) columns += columnsOf(char.codePointAt(0)!);
	return columns;
}

const FENCE = /^\s*(`{3,}|~{3,})/;

/**
 * The columns of the longest line of a code block's text, the fence lines
 * (`` ```ts `` and the closing one) left out. `content` may be the whole fenced
 * block or only what is inside it.
 */
export function longestCodeColumns(content: string): number {
	const lines = content.split("\n");
	if (lines.length > 0 && FENCE.test(lines[0]!)) lines.shift();
	if (lines.length > 0 && FENCE.test(lines[lines.length - 1]!) && lines[lines.length - 1]!.trim().replace(/[`~]/g, "") === "") lines.pop();
	return lines.reduce((widest, line) => Math.max(widest, lineColumns(line)), 0);
}

/** The columns a code block fits to: its longest line, up to the cap. */
export const codeFitColumns = (content: string): number => Math.min(CODE_FIT_MAX_COLUMNS, longestCodeColumns(content));

/**
 * The width cap, in px, a code block wraps at in the mind map: the cap on its
 * columns, scaled from its measured natural width (`naturalPx`, the longest
 * line plus `chromePx` of block padding), so no font metrics are assumed.
 * `Infinity` when the longest line is within the cap (it never wraps).
 */
export function codeFitLimitPx(naturalPx: number, content: string, chromePx: number): number {
	const columns = longestCodeColumns(content);
	if (columns <= CODE_FIT_MAX_COLUMNS) return Infinity;
	return Math.max(0, naturalPx - chromePx) * (CODE_FIT_MAX_COLUMNS / columns) + chromePx;
}
