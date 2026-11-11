/**
 * Find and replace over a view's loaded nodes (Ctrl+F in the mind map and the
 * 3D graph). Pure: the views hand in their nodes' text as `FindItem`s and act
 * on what comes back. Plain text only, case-insensitive unless asked; regex
 * characters in the query are literal. See `vault/Planner/Graph - Find and replace.md`.
 */
import { OSMOSIS_FENCE_REGEX } from "./card-gen/generate-ids";
import { nodeEditText, restoreEditedLine } from "./mindmap-edit";
import type { OsmosisNode } from "./types";

/** One searchable node: its ID in the view, the note its text lives in, and the text matched. */
export interface FindItem {
	id: string;
	note: string;
	text: string;
	/** Replace may edit this item's text (a line); a note title, tag or link target may only be found. */
	replaceable: boolean;
}

/** One occurrence of the query: in item `item` (an index into the items), at `start`–`end` of its text. */
export interface FindMatch {
	item: number;
	id: string;
	note: string;
	start: number;
	end: number;
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The query as a global pattern matching it literally, or null for an empty query (which matches nothing). */
function pattern(query: string, caseSensitive: boolean): RegExp | null {
	if (query === "") return null;
	return new RegExp(escapeRegExp(query), caseSensitive ? "g" : "gi");
}

/** Where `query` occurs in `text`, left to right, without overlaps. */
export function findInText(text: string, query: string, caseSensitive: boolean): { start: number; end: number }[] {
	const re = pattern(query, caseSensitive);
	if (re === null) return [];
	const out: { start: number; end: number }[] = [];
	for (let m = re.exec(text); m !== null; m = re.exec(text)) out.push({ start: m.index, end: m.index + m[0].length });
	return out;
}

/** Every match in `items`, in item order and then left to right within an item. */
export function findMatches(items: readonly FindItem[], query: string, caseSensitive: boolean): FindMatch[] {
	const out: FindMatch[] = [];
	items.forEach((item, index) => {
		for (const { start, end } of findInText(item.text, query, caseSensitive)) out.push({ item: index, id: item.id, note: item.note, start, end });
	});
	return out;
}

/**
 * The match Enter (or Shift+Enter, `backward`) goes to from `current`,
 * wrapping at either end. `current` is -1 before the first step: forward then
 * goes to the first match, backward to the last. -1 when there are none.
 */
export function stepMatch(current: number, count: number, backward: boolean): number {
	if (count <= 0) return -1;
	if (current < 0 || current >= count) return backward ? count - 1 : 0;
	return backward ? (current - 1 + count) % count : (current + 1) % count;
}

/** The counter: "" for no query, "No matches", "N matches" before the first step, else "i of N". */
export function findCounter(query: string, current: number, count: number): string {
	if (query === "") return "";
	if (count === 0) return "No matches";
	if (current < 0 || current >= count) return count === 1 ? "1 match" : `${count} matches`;
	return `${current + 1} of ${count}`;
}

/** `text` with each of `ranges` (sorted, not overlapping) replaced by `replacement`, taken literally. */
export function replaceRanges(text: string, ranges: readonly { start: number; end: number }[], replacement: string): string {
	let out = "";
	let at = 0;
	for (const { start, end } of ranges) {
		out += text.slice(at, start) + replacement;
		at = end;
	}
	return out + text.slice(at);
}

/** What a Replace or Replace all does: the new text of each item it edits, all in one note. */
export interface ReplacePlan {
	/** The focused note: the note the current match is in. Only its items are edited. */
	note: string;
	/** Item ID → its text after the replace, in item order. */
	texts: Map<string, string>;
	/** How many matches are replaced. */
	replaced: number;
	/** Matches in other notes, left alone. */
	elsewhere: number;
	/** Matches in this note that can't be replaced (a note title, a tag). */
	fixed: number;
}

/**
 * Plan a Replace (`all` false: the current match only) or a Replace all (every
 * replaceable match in the current match's note). Null without a current
 * match, or when nothing it covers can be replaced.
 */
export function planReplace(items: readonly FindItem[], matches: readonly FindMatch[], current: number, replacement: string, all: boolean): ReplacePlan | null {
	const focused = matches[current];
	if (focused === undefined) return null;
	const note = focused.note;
	const chosen = all ? matches.filter((m) => m.note === note) : [focused];
	const byItem = new Map<number, FindMatch[]>();
	let fixed = 0;
	for (const match of chosen) {
		if (items[match.item]?.replaceable !== true) {
			fixed++;
			continue;
		}
		const list = byItem.get(match.item) ?? [];
		list.push(match);
		byItem.set(match.item, list);
	}
	if (byItem.size === 0) return null;
	const texts = new Map<string, string>();
	let replaced = 0;
	for (const [index, list] of [...byItem].sort((a, b) => a[0] - b[0])) {
		const item = items[index]!;
		texts.set(item.id, replaceRanges(item.text, list, replacement));
		replaced += list.length;
	}
	return { note, texts, replaced, elsewhere: matches.filter((m) => m.note !== note).length, fixed };
}

/**
 * The match to go to after a single Replace at `current`, once the matches
 * are found again: the one after the replaced text. Where the replacement
 * itself contains the query (changing "sail" to "Sail" with case ignored),
 * those occurrences are stepped over, or Replace would keep hitting them.
 */
export function indexAfterReplace(current: number, query: string, replacement: string, caseSensitive: boolean, count: number): number {
	if (count <= 0) return -1;
	return (current + findInText(replacement, query, caseSensitive).length) % count;
}

/**
 * Splice an item's new text into the line an editor would show for it.
 * `editText` is the node's line minus indentation and block ID
 * (`nodeEditText`), `content` the text that was searched, which sits at its
 * end (or, inside a wrapper like `![[…]]`, last within it). Null when it
 * can't be found there, so the line is left alone rather than guessed at.
 */
export function spliceContent(editText: string, content: string, next: string): string | null {
	if (content === "") return null;
	const at = editText.endsWith(content) ? editText.length - content.length : editText.lastIndexOf(content);
	if (at < 0) return null;
	return editText.slice(0, at) + next + editText.slice(at + content.length);
}

/**
 * Whether Replace may rewrite a parsed line: not an `![[embed]]` (its text is
 * a link target) and not an ```osmosis fence (its text is card data).
 */
export function replaceableLine(line: Pick<OsmosisNode, "type" | "content">): boolean {
	if (line.type === "transclusion") return false;
	const first = line.content.split("\n", 1)[0]?.trim() ?? "";
	return !OSMOSIS_FENCE_REGEX.test(first);
}

/** A line a replace rewrites: the parsed line (from `content`'s own parse) and its text after the replace. */
export interface LineRewrite {
	line: OsmosisNode;
	text: string;
}

/** One rewritten line: its file text before and after, and where it starts now. */
export interface RewrittenLine {
	before: string;
	after: string;
	start: number;
}

/**
 * Rewrite several lines of one note in one string, each as a node edit would
 * (`spliceContent` into its edit text, then `restoreEditedLine` puts back its
 * indentation and block ID), so the whole replace is one write and one undo.
 * Null when a line's bytes in `content` are not what its parse says (the note
 * changed since), a line's text can't be placed, or two lines overlap: then
 * nothing is written. `lines` comes back in the order given.
 */
export function rewriteLines(content: string, rewrites: readonly LineRewrite[]): { text: string; lines: RewrittenLine[] } | null {
	const planned: (RewrittenLine & { end: number; order: number })[] = [];
	for (const [order, { line, text }] of rewrites.entries()) {
		const { start, end } = line.range;
		const before = content.slice(start, end);
		if (restoreEditedLine(line, nodeEditText(line)) !== before) return null;
		const edit = spliceContent(nodeEditText(line), line.content, text);
		if (edit === null) return null;
		planned.push({ before, after: restoreEditedLine(line, edit), start, end, order });
	}
	planned.sort((a, b) => a.start - b.start);
	for (let i = 1; i < planned.length; i++) if (planned[i]!.start < planned[i - 1]!.end) return null;
	let text = "";
	let at = 0;
	let shift = 0;
	for (const line of planned) {
		text += content.slice(at, line.start) + line.after;
		at = line.end;
		const start = line.start + shift;
		shift += line.after.length - line.before.length;
		line.start = start;
	}
	text += content.slice(at);
	return { text, lines: planned.sort((a, b) => a.order - b.order).map(({ before, after, start }) => ({ before, after, start })) };
}
