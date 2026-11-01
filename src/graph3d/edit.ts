/**
 * Pure helpers for editing from the 3D graph (`Graph3DView`): no `obsidian`
 * import, so they are unit-tested. See `vault/Planner/3D Graph Phase 7 -
 * Editing.md` for the plan.
 */

import { extractTrailingBlockId, generateBlockId } from "../block-id";
import { OSMOSIS_FENCE_REGEX, STRUCTURAL_LINE_REGEX } from "../card-gen/generate-ids";
import { collectBlockIds } from "../mindmap-edit";
import type { OsmosisNode } from "../types";
import { normalizeHeading, type GraphModel } from "./model";

/**
 * The node with parse ID `id` under `root`, depth first. The 3D model is built
 * from a cached read, so an edit re-parses fresh bytes and finds its node again
 * by ID (content-derived: it survives a change elsewhere in the file) before it
 * splices by offset. Null when the line has gone.
 */
export function findNodeById(root: OsmosisNode, id: string): OsmosisNode | null {
	const stack: OsmosisNode[] = [root];
	while (stack.length > 0) {
		const node = stack.pop()!;
		if (node.id === id) return node;
		for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]!);
	}
	return null;
}

/**
 * The graph node for the line of `path` that starts at `start`, or null. An
 * edit changes a line's ID, but not where it starts, so this re-selects it.
 */
export function lineNodeAt(model: GraphModel, path: string, start: number): string | null {
	for (const node of model.nodes) {
		if (node.kind === "line" && node.path === path && node.source?.range.start === start) return node.id;
	}
	return null;
}

/**
 * What changes when the notes a view shows go from `prev` to `next`: the ones
 * to start holding the history of, and the ones to let go. Both lists are in
 * the order the sets iterate.
 */
export function heldDiff(prev: ReadonlySet<string>, next: ReadonlySet<string>): { acquire: string[]; release: string[] } {
	return {
		acquire: [...next].filter((path) => !prev.has(path)),
		release: [...prev].filter((path) => !next.has(path)),
	};
}

/**
 * Whether keys pressed on `target` belong to the thing being typed into: a
 * text box, or an editor (CodeMirror is a `contenteditable`). The view's key
 * handlers (flight, study, undo) pass those on.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
	if (target === null) return false;
	const { tagName, isContentEditable } = target as { tagName?: unknown; isContentEditable?: unknown };
	return tagName === "INPUT" || tagName === "TEXTAREA" || isContentEditable === true;
}

/**
 * The nodes above `id` in a tree: its parent first, the root last. Empty when
 * `id` is the root or is not in the tree. What `renameInFile` needs to retype a
 * line, taken from a fresh parse because the 3D model keeps no parent links.
 */
export function ancestorsOf(root: OsmosisNode, id: string): OsmosisNode[] {
	const trail: OsmosisNode[] = [];
	const walk = (node: OsmosisNode): boolean => {
		if (node.id === id) return true;
		trail.push(node);
		for (const child of node.children) if (walk(child)) return true;
		trail.pop();
		return false;
	};
	if (!walk(root)) return [];
	return trail.reverse();
}

/**
 * Where `line` starts in `text` after an edit was written, so the edited line
 * can be selected again: normalising spacing can push it down, and retyping can
 * move it. The occurrence nearest `hint` (where it started before), or `hint`
 * when the line no longer appears verbatim (a renumbered list item).
 */
export function locateLine(text: string, line: string, hint: number): number {
	if (line === "") return hint;
	let best = -1;
	for (let at = text.indexOf(line); at !== -1; at = text.indexOf(line, at + 1)) {
		if (best === -1 || Math.abs(at - hint) < Math.abs(best - hint)) best = at;
	}
	return best === -1 ? hint : best;
}

/** A rectangle in client pixels. */
export interface Box {
	left: number;
	top: number;
	width: number;
	height: number;
}

/** The room the inline editor may use, in client pixels. */
export interface EditBounds {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

const EDIT_MIN_WIDTH = 240;
const EDIT_MAX_WIDTH = 560;
const EDIT_MARGIN = 8;
/** Above the box: the save and cancel buttons float 32 px over it. */
const EDIT_BUTTON_ROOM = 36;
const EDIT_MIN_HEIGHT = 48;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

/**
 * Where the inline editor sits over a node. It is not scaled with the camera:
 * the text has to be readable however far the node is, so it only takes the
 * node's on-screen left, top and width (within a readable range) and is kept
 * inside `bounds`, with room above for its buttons.
 */
export function editBoxGeometry(anchor: Box, bounds: EditBounds): { left: number; top: number; width: number; maxHeight: number } {
	const room = bounds.right - bounds.left - 2 * EDIT_MARGIN;
	const width = clamp(anchor.width, Math.min(EDIT_MIN_WIDTH, room), Math.min(EDIT_MAX_WIDTH, room));
	const left = clamp(anchor.left, bounds.left + EDIT_MARGIN, bounds.right - EDIT_MARGIN - width);
	const top = clamp(anchor.top, bounds.top + EDIT_MARGIN + EDIT_BUTTON_ROOM, bounds.bottom - EDIT_MARGIN - EDIT_MIN_HEIGHT);
	return { left, top, width, maxHeight: bounds.bottom - EDIT_MARGIN - top };
}

/**
 * The top of an editor `height` tall that was placed at `top`, moved up if it
 * now runs past `bounds` (it grew as text was typed, or the on-screen keyboard
 * shrank the visible area), but never above the room its buttons need.
 */
export function fitEditTop(top: number, height: number, bounds: EditBounds): number {
	return Math.max(bounds.top + EDIT_MARGIN + EDIT_BUTTON_ROOM, Math.min(top, bounds.bottom - EDIT_MARGIN - height));
}

/** A node type that is several lines, whose block ID goes on a line after it. */
const MULTILINE_TYPES: ReadonlySet<OsmosisNode["type"]> = new Set(["codeblock", "table", "blockquote"]);

/** One insertion into a note's text. */
interface Insertion {
	offset: number;
	text: string;
}

/** What a link to a line is written as: the part after the note name, and the block ID the target needs stamped (null when it has one, or links by heading). */
export interface LinkSubpath {
	subpath: string;
	stamp: string | null;
}

/** Characters that break a heading link (`#` `|` `^` `[` `]` are link syntax) or make the heading's plain text differ from its source. Such a heading is linked by block ID. */
const UNSAFE_HEADING = /[#|^[\]\\*_`~=$<>%:]/;

/** Whether a link to `node` can be anchored by a block ID: not a card fence, an embed, or a paragraph line that runs on into the next. */
function canStamp(content: string, node: OsmosisNode): boolean {
	if (node.type === "transclusion") return false;
	if (node.type === "codeblock") {
		const first = node.content.split("\n", 1)[0] ?? "";
		return !OSMOSIS_FENCE_REGEX.test(first.replace(/\s*<!--.*?-->/g, "").trim());
	}
	if (node.type === "paragraph") {
		// A block ID only counts at the end of the paragraph.
		const next = content.slice(node.range.end + 1).split("\n", 1)[0];
		return !(content[node.range.end] === "\n" && next !== undefined && next.trim() !== "" && !STRUCTURAL_LINE_REGEX.test(next));
	}
	return true;
}

/** Whether the first heading in `root` with `text`'s plain text is `node`: the one a `#Heading` link resolves to. */
function isFirstHeadingWith(root: OsmosisNode, text: string, node: OsmosisNode): boolean {
	const key = normalizeHeading(text);
	const stack: OsmosisNode[] = [root];
	while (stack.length > 0) {
		const next = stack.pop()!;
		if (next.type === "heading" && normalizeHeading(next.content) === key) return next === node;
		for (let i = next.children.length - 1; i >= 0; i--) stack.push(next.children[i]!);
	}
	return false;
}

/**
 * How to link to `target`, a line of the note whose text is `content` (parsed
 * to `root`), or to its note when `target` is null. A heading links by its
 * text (`#Heading`, the idiomatic link), unless that text is not plain or an
 * earlier heading shares it. Any other line links by block ID (`#^id`): the one
 * it has, else a new one to stamp (`stamp`, unique in `content`). Null when
 * the line cannot carry an ID (a card fence, an embed, a paragraph line with
 * more lines below it).
 */
export function linkSubpath(target: OsmosisNode | null, root: OsmosisNode, content: string): LinkSubpath | null {
	if (target === null) return { subpath: "", stamp: null };
	const text = target.content.trim();
	if (target.type === "heading" && text !== "" && !UNSAFE_HEADING.test(text) && isFirstHeadingWith(root, text, target)) {
		return { subpath: `#${text}`, stamp: null };
	}
	if (target.blockId !== undefined) return { subpath: `#^${target.blockId}`, stamp: null };
	if (!canStamp(content, target)) return null;
	const id = generateBlockId(collectBlockIds(content));
	return { subpath: `#^${id}`, stamp: id };
}

/** Where a block ID for `node` goes: on its own line after a multiline block, at the end of any other line. */
function stampInsertion(node: OsmosisNode, id: string): Insertion {
	return { offset: node.range.end, text: MULTILINE_TYPES.has(node.type) ? `\n^${id}` : ` ^${id}` };
}

/** Where link text goes on `node`'s line: at its end, before a trailing block ID. Null for a line that cannot take one (several lines, an embed). */
function appendInsertion(content: string, node: OsmosisNode, text: string): Insertion | null {
	if (MULTILINE_TYPES.has(node.type) || node.type === "transclusion" || node.type === "root") return null;
	const line = content.slice(node.range.start, node.range.end);
	const head = extractTrailingBlockId(line)?.stripped ?? line.trimEnd();
	return { offset: node.range.start + head.length, text: ` ${text}` };
}

const insertAll = (content: string, edits: readonly Insertion[]): string =>
	[...edits].sort((a, b) => b.offset - a.offset).reduce((out, edit) => out.slice(0, edit.offset) + edit.text + out.slice(edit.offset), content);

/** `content` with block ID `id` stamped on `node`: ` ^id` at the end of a one-line node, a `^id` line after a code block, table or quote. */
export function stampBlockId(content: string, node: OsmosisNode, id: string): string {
	return insertAll(content, [stampInsertion(node, id)]);
}

/** `content` with ` text` added at the end of `node`'s line, before a trailing ` ^id`. Null when the line cannot take it (code block, table, quote, embed). */
export function appendToLine(content: string, node: OsmosisNode, text: string): string | null {
	const edit = appendInsertion(content, node, text);
	return edit === null ? null : insertAll(content, [edit]);
}

/** A link written within one note: the new text, and where each end starts in it (both inserts can move the other line down). */
export interface LinkInNote {
	content: string;
	aStart: number;
	/** Null when the target is the note itself. */
	bStart: number | null;
}

/**
 * Add `linkText` to line `a` and stamp `stamp` on line `b` (null: none) in
 * one string, so one write does both. Both splices are taken against the same
 * bytes and applied later offset first. Null when `a` cannot take the text.
 */
export function linkInNote(content: string, a: OsmosisNode, b: OsmosisNode | null, linkText: string, stamp: string | null): LinkInNote | null {
	const append = appendInsertion(content, a, linkText);
	if (append === null) return null;
	const stampEdit = b !== null && stamp !== null ? stampInsertion(b, stamp) : null;
	const edits = stampEdit === null ? [append] : [append, stampEdit];
	const shift = (start: number): number => start + edits.reduce((sum, edit) => sum + (edit.offset <= start ? edit.text.length : 0), 0);
	return { content: insertAll(content, edits), aStart: shift(a.range.start), bStart: b === null ? null : shift(b.range.start) };
}
