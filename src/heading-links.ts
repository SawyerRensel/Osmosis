/**
 * Rewriting heading links after a heading is renamed in an Osmosis node
 * editor (2D or 3D). See
 * `vault/Planner/Graph - Node link aliases and heading-rename link updates.md`.
 *
 * Pure: the view-side glue (`heading-link-update.ts`) decides which notes to
 * visit and whether Obsidian's "Automatically update internal links" is on;
 * this module finds and rewrites the links in one note's text. Links inside
 * code (fenced blocks, inline code spans) and `%%` comments are left alone, as
 * Obsidian does not index them.
 */

/** Obsidian matches a link's heading against a heading ignoring case and these characters (they cannot appear in a link's subpath, or are dropped from it). */
const HEADING_PUNCTUATION = /[!"#$%&()*+,.:;<=>?@^`{|}~/[\]\\]/g;

/** Two heading texts that a heading link cannot tell apart. */
export function headingMatches(a: string, b: string): boolean {
	return normalize(a) === normalize(b);
}

function normalize(text: string): string {
	return text.replace(HEADING_PUNCTUATION, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * The heading text of a markdown line (`## Text`), or null when the line is not
 * an ATX heading. A trailing block ID (` ^id`) is not part of the text.
 */
export function headingOfLine(line: string): string | null {
	const match = /^ {0,3}#{1,6}[ \t]+(.*)$/.exec(line.replace(/\r$/, ""));
	if (match === null) return null;
	return match[1]!.replace(/\s+\^[A-Za-z0-9-]+\s*$/, "").trim();
}

/** The text of the line containing `offset`. */
export function lineAt(text: string, offset: number): string {
	const start = text.lastIndexOf("\n", offset - 1) + 1;
	const end = text.indexOf("\n", offset);
	return text.slice(start, end === -1 ? text.length : end);
}

/** Whether a heading outside code in `text` still matches `heading` (a rename that leaves a same-named heading behind must not retarget its links). */
export function hasHeading(text: string, heading: string): boolean {
	const skip = skippedRanges(text);
	let offset = 0;
	for (const line of text.split("\n")) {
		const found = headingOfLine(line);
		if (found !== null && !inRanges(skip, offset) && headingMatches(found, heading)) return true;
		offset += line.length + 1;
	}
	return false;
}

/** Characters a wikilink's subpath cannot hold; they become spaces when a new heading is written into a link. */
function linkSafe(heading: string): string {
	return heading.replace(/[#|^[\]]/g, " ").replace(/\s+/g, " ").trim();
}

/** A markdown link's URL encoding of a heading: `encodeURI`, plus the parentheses that would end the link. */
function urlSafe(heading: string): string {
	return encodeURI(linkSafe(heading)).replace(/\(/g, "%28").replace(/\)/g, "%29");
}

/**
 * Ranges of `text` whose links Obsidian ignores: fenced code blocks (``` or
 * ~~~, also indented or quoted), inline code spans and `%%` comments. An
 * unclosed fence or comment runs to the end of the text.
 */
export function skippedRanges(text: string): [number, number][] {
	const ranges: [number, number][] = [];
	const lines = text.split("\n");
	let offset = 0;
	let fence: { char: string; length: number; start: number } | null = null;
	let proseStart = 0;
	for (const line of lines) {
		const end = offset + line.length;
		if (fence === null) {
			const open = /^[ \t>]*(`{3,}|~{3,})/.exec(line);
			if (open !== null) {
				scanProse(text, proseStart, offset, ranges);
				fence = { char: open[1]![0]!, length: open[1]!.length, start: offset };
			}
		} else {
			const close = /^[ \t>]*(`{3,}|~{3,})[ \t]*$/.exec(line);
			if (close !== null && close[1]![0] === fence.char && close[1]!.length >= fence.length) {
				ranges.push([fence.start, end]);
				fence = null;
				proseStart = end;
			}
		}
		offset = end + 1;
	}
	if (fence !== null) ranges.push([fence.start, text.length]);
	else scanProse(text, proseStart, text.length, ranges);
	ranges.sort((a, b) => a[0] - b[0]);
	return ranges;
}

/** Inline code spans and `%%` comments in `text[from, to)`. */
function scanProse(text: string, from: number, to: number, ranges: [number, number][]): void {
	let i = from;
	while (i < to) {
		if (text.startsWith("%%", i)) {
			const close = text.indexOf("%%", i + 2);
			const end = close === -1 || close >= to ? to : close + 2;
			ranges.push([i, end]);
			i = end;
		} else if (text[i] === "`") {
			let n = 0;
			while (text[i + n] === "`") n++;
			const end = closingRun(text, i + n, to, n);
			if (end !== null) {
				ranges.push([i, end]);
				i = end;
			} else i += n;
		} else i++;
	}
}

/** The end of the next run of exactly `n` backticks in `text[from, to)`, or null. */
function closingRun(text: string, from: number, to: number, n: number): number | null {
	let i = from;
	while (i < to) {
		if (text[i] !== "`") {
			i++;
			continue;
		}
		let run = 0;
		while (text[i + run] === "`") run++;
		if (run === n) return i + run;
		i += run;
	}
	return null;
}

function inRanges(ranges: readonly [number, number][], offset: number): boolean {
	return ranges.some(([start, end]) => offset >= start && offset < end);
}

/** The subpath (`#A#B`, without the first `#`) with its last heading segment renamed, or null when it does not end at `from`. A block reference (`#^id`) never matches. */
function renamedSubpath(subpath: string, from: string, to: string): string | null {
	const segments = subpath.split("#");
	const last = segments[segments.length - 1]!;
	if (last.trim().startsWith("^") || !headingMatches(last, from)) return null;
	segments[segments.length - 1] = to;
	return segments.join("#");
}

export interface HeadingLinkRewrite {
	text: string;
	/** Links rewritten. */
	count: number;
}

/**
 * Rewrite every link in `text` that points at heading `from` of the target
 * note so it points at heading `to`. `isTarget(linkpath)` says whether a
 * link's path (the part before `#`; empty for a same-note link) resolves to
 * the note whose heading was renamed. Handles `[[Note#H]]`, `[[Note#H|alias]]`,
 * `[[#H]]`, `![[Note#H]]`, nested `[[Note#A#H]]`, and markdown links
 * `[text](Note.md#H%20x)` / `[text](<Note.md#H x>)`. The alias and display
 * text are kept; block references, other headings and links in code or
 * comments are untouched.
 */
export function rewriteHeadingLinks(text: string, from: string, to: string, isTarget: (linkpath: string) => boolean): HeadingLinkRewrite {
	const skip = skippedRanges(text);
	let count = 0;
	const wiki = /\[\[([^[\]\n|#]*)#([^[\]\n|]*)((?:\|(?:(?!\]\])[^\n])*)?)\]\]/g;
	let out = text.replace(wiki, (match: string, path: string, subpath: string, alias: string, offset: number) => {
		if (inRanges(skip, offset) || !isTarget(path.trim())) return match;
		const renamed = renamedSubpath(subpath, from, linkSafe(to));
		if (renamed === null) return match;
		count++;
		return `[[${path}#${renamed}${alias}]]`;
	});
	// Offsets moved with the wikilink rewrites, so skipped ranges are recomputed.
	const skipped = skippedRanges(out);
	const markdown = /\[([^\]\n]*)\]\((<[^>\n]*>|[^)\s]*)\)/g;
	out = out.replace(markdown, (match: string, label: string, url: string, offset: number) => {
		if (inRanges(skipped, offset)) return match;
		const angled = url.startsWith("<");
		const raw = angled ? url.slice(1, -1) : url;
		const hash = raw.indexOf("#");
		if (hash === -1 || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return match;
		const decode = (s: string): string | null => {
			if (angled) return s;
			try {
				return decodeURI(s);
			} catch {
				return null;
			}
		};
		const path = decode(raw.slice(0, hash));
		const segments = raw.slice(hash + 1).split("#");
		const last = decode(segments[segments.length - 1]!);
		if (path === null || last === null || !isTarget(path.trim()) || renamedSubpath(last, from, to) === null) return match;
		segments[segments.length - 1] = angled ? linkSafe(to) : urlSafe(to);
		count++;
		const target = `${raw.slice(0, hash)}#${segments.join("#")}`;
		return `[${label}](${angled ? `<${target}>` : target})`;
	});
	return { text: out, count };
}

/** "Updated 3 links in 2 notes", or null when nothing was updated. */
export function headingRenameNotice(links: number, notes: number): string | null {
	if (links === 0) return null;
	return `Updated ${links} link${links === 1 ? "" : "s"} in ${notes} note${notes === 1 ? "" : "s"}`;
}
