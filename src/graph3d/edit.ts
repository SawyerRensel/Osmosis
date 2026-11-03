/**
 * Pure helpers for editing from the 3D graph (`Graph3DView`): no `obsidian`
 * import, so they are unit-tested. See `vault/Planner/3D Graph Phase 7 -
 * Editing.md` for the plan.
 */

import { extractTrailingBlockId, generateBlockId } from "../block-id";
import { OSMOSIS_FENCE_REGEX, STRUCTURAL_LINE_REGEX } from "../card-gen/generate-ids";
import { collectBlockIds, deleteSubtree, dropContext, indentSiblings, insertChild, insertParent, insertSibling, moveSiblings, moveWithinFile, outdentSiblings, resolveInsertSite, subtreeEnd, type Spliced } from "../mindmap-edit";
import type { OsmosisNode } from "../types";
import { panelScale } from "./lod";
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

/** Where the inline editor sits this frame, in the stage's px: centred on (`x`, `y`), scaled like a near-tier panel, and how much of it shows (0–1). */
export interface EditorPlace {
	x: number;
	y: number;
	scale: number;
	opacity: number;
}

/**
 * Where a panel-sized box sits over a node: `ndc` is the node's projected
 * position (−1 to 1, y up), `depth` its view depth, `size` the canvas in px.
 * The scale is the near tier's (`panelScale`), so text laid out at panel size
 * lands at the plate's text size. Null when the node is not in front of the
 * camera's near plane.
 */
export function editorAnchor(
	ndc: { x: number; y: number },
	depth: number,
	near: number,
	size: { width: number; height: number },
	pxPerUnitAt1: number,
	pxPerUnit: number,
): { x: number; y: number; scale: number } | null {
	if (depth <= near) return null;
	return { x: ((ndc.x + 1) / 2) * size.width, y: ((1 - ndc.y) / 2) * size.height, scale: panelScale(depth, pxPerUnitAt1, pxPerUnit) };
}

/** Px past the widest line the inline editor box keeps, for the caret and rounding, so a line that fits does not wrap. */
const EDIT_WIDTH_SLACK_PX = 4;

/**
 * The inline editor box's width in px, sized to its text as a plate is: its
 * widest line (`measure`, the text's laid-out width), plus `chrome` (everything
 * between the box's edge and its text: border, padding) and a little slack,
 * kept within `min` (the plate's width) and `max` (the panel's 20em), past
 * which the text wraps. `min` wins over `max`, as in CSS.
 */
export function fitEditWidth(lines: readonly string[], measure: (line: string) => number, chrome: number, min: number, max: number): number {
	const widest = lines.reduce((width, line) => Math.max(width, measure(line)), 0);
	return Math.max(min, Math.min(max, Math.ceil(widest + chrome + EDIT_WIDTH_SLACK_PX)));
}

/** A band of the window, top to bottom in client px: what the on-screen keyboard leaves visible. */
export interface VisibleBand {
	top: number;
	bottom: number;
}

/**
 * The visible band: the visual viewport (`visualViewport`, absent on old
 * WebViews), less the on-screen keyboard where the VirtualKeyboard API reports
 * one that overlays the page (`boundingRect`; zero height while it is down).
 */
export function visibleBand(viewport: { offsetTop: number; height: number } | null, windowHeight: number, keyboard: { top: number; height: number } | null): VisibleBand {
	const top = viewport?.offsetTop ?? 0;
	const bottom = top + (viewport?.height ?? windowHeight);
	return { top, bottom: keyboard !== null && keyboard.height > 0 ? Math.min(bottom, keyboard.top) : bottom };
}

/** Less of the stage than this showing is not worth centring on. */
const MIN_BAND_PX = 48;

/**
 * How far (px) to shift the camera's picture up so its centre, where the line
 * being edited is, lands mid-way down the part of the stage `band` leaves
 * visible. 0 when all of the stage shows, or too little of it does.
 */
export function bandOffset(stageTop: number, stageHeight: number, band: VisibleBand): number {
	const top = Math.max(stageTop, band.top);
	const bottom = Math.min(stageTop + stageHeight, band.bottom);
	if (bottom - top < MIN_BAND_PX) return 0;
	return Math.round(stageTop + stageHeight / 2 - (top + bottom) / 2);
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

/** The structural edits the 3D graph offers on a line, the mind map's own. */
export type StructuralAction = "child" | "sibling" | "parent" | "delete" | "up" | "down" | "indent" | "outdent";

/** What a structural edit does to a note: its new text, and which lines to select, edit and keep in place after it. */
export interface StructuralPlan {
	/** The note's new text, before `normalizeWrite`. */
	text: string;
	/** Where the line to select starts in `text`; null: the note's core (a delete under the root has no line left to select). */
	select: number | null;
	/** The selected line is new and empty, so the editor opens on it at once. */
	fresh: boolean;
	/** An existing line whose subtree moved or was re-levelled (its IDs change with its depth), and where it starts in `text`. */
	moved: { node: OsmosisNode; start: number } | null;
}

/**
 * What `action` does to `line`, a node of `root`, in `content`, or null when
 * there is nothing to do (no sibling to move past, nothing to indent under, a
 * heading already at the root). The same computation the mind map makes, one
 * node at a time.
 */
export function planStructural(action: StructuralAction, content: string, root: OsmosisNode, line: OsmosisNode): StructuralPlan | null {
	const ancestors = ancestorsOf(root, line.id);
	const parent = ancestors[0];
	if (parent === undefined) return null;
	const siblings = parent.children;
	const index = siblings.indexOf(line);
	const moved = (edit: { text: string; start: number }): StructuralPlan => ({ text: edit.text, select: edit.start, fresh: false, moved: { node: line, start: edit.start } });
	switch (action) {
		case "child": {
			const edit = insertChild(content, line);
			return { text: edit.text, select: edit.start, fresh: true, moved: null };
		}
		case "sibling": {
			const edit = insertSibling(content, line);
			return { text: edit.text, select: edit.start, fresh: true, moved: null };
		}
		case "parent": {
			const edit = insertParent(content, line, { start: line.range.start, end: subtreeEnd(line) });
			return { text: edit.text, select: edit.start, fresh: true, moved: { node: line, start: edit.moved ?? edit.start } };
		}
		case "delete":
			// The parent stays where it was: everything removed is after its first line.
			return { text: deleteSubtree(content, line), select: parent.type === "root" ? null : parent.range.start, fresh: false, moved: null };
		case "up":
		case "down": {
			const neighbour = siblings[index + (action === "up" ? -1 : 1)];
			return index === -1 || neighbour === undefined ? null : moved(moveSiblings(content, [line], neighbour));
		}
		case "indent": {
			const previous = siblings[index - 1];
			return index < 1 || previous === undefined ? null : moved(indentSiblings(content, [line], previous));
		}
		case "outdent": {
			const out = outdentSiblings(content, parent, [line]);
			return out === null ? null : moved(out);
		}
	}
}

/**
 * Where the line that starts at `start` in `before` starts in `after`, the same
 * text once `normalizeWrite` has renumbered lists and added or dropped blank
 * lines: the same non-blank line, by count. Null when `start` is not on a
 * non-blank line, or `after` has fewer.
 */
export function mapStart(before: string, after: string, start: number): number | null {
	const lineStart = start === 0 ? 0 : before.lastIndexOf("\n", start - 1) + 1;
	const lineEnd = before.indexOf("\n", lineStart);
	if (before.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim() === "") return null;
	let nonBlank = 0;
	for (const line of before.slice(0, lineStart).split("\n")) if (line.trim() !== "") nonBlank++;
	let seen = 0;
	let at = 0;
	for (const line of after.split("\n")) {
		if (line.trim() !== "") {
			if (seen === nonBlank) return at + (start - lineStart);
			seen++;
		}
		at += line.length + 1;
	}
	return null;
}

/** The node under `root` whose line starts at `start`, or null. */
export function nodeAtStart(root: OsmosisNode, start: number): OsmosisNode | null {
	const stack: OsmosisNode[] = [root];
	while (stack.length > 0) {
		const node = stack.pop()!;
		if (node.type !== "root" && node.range.start === start) return node;
		for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]!);
	}
	return null;
}

/** `node` and its descendants, depth first, in document order. */
export function preorder(node: OsmosisNode): OsmosisNode[] {
	const out: OsmosisNode[] = [];
	const stack: OsmosisNode[] = [node];
	while (stack.length > 0) {
		const next = stack.pop()!;
		out.push(next);
		for (let i = next.children.length - 1; i >= 0; i--) stack.push(next.children[i]!);
	}
	return out;
}

/**
 * Each line of `old`'s subtree with the line it became, where the subtree now
 * starts at `start` in `root` (the note as written). A re-levelled subtree has
 * the same lines in the same order, so they pair off; if the shapes differ the
 * subtree's own line is all that is paired. Empty when nothing starts at `start`.
 */
export function carryPairs(old: OsmosisNode, root: OsmosisNode, start: number): { from: OsmosisNode; to: OsmosisNode }[] {
	const now = nodeAtStart(root, start);
	if (now === null) return [];
	const before = preorder(old);
	const after = preorder(now);
	if (before.length !== after.length) return [{ from: old, to: now }];
	return before.map((from, i) => ({ from, to: after[i]! }));
}

/**
 * Where a line dropped on a node goes when it is moved rather than linked:
 * under the node (its last child), after it (its next sibling), or, dropped
 * on a note's core, to the end of that note.
 */
export type MovePlace = "under" | "after" | "end";

/** A drop's destination as the mind map expresses it: the gap before child `index` of `parent`. */
export interface MoveGap {
	parent: OsmosisNode;
	index: number;
}

/**
 * The gap a move of `moving` to `place` relative to `target` fills, in
 * `target`'s note (`root`). `target` is null for "end" (a drop on the note's
 * core). Null when "after" has nowhere to go (`target` is not in `root`).
 *
 * "End" is the end of the file. A heading goes after the note's last top-level
 * section. Any other line goes after the last section's content, at its top
 * level, so it keeps its own type: at the root's end the drop rules would turn
 * it into a heading beside the note's last one.
 */
export function moveGap(root: OsmosisNode, target: OsmosisNode | null, place: MovePlace, moving: OsmosisNode): MoveGap | null {
	if (place === "end" || target === null) {
		let parent = root;
		if (moving.type !== "heading") {
			for (let last = parent.children.at(-1); last?.type === "heading"; last = parent.children.at(-1)) parent = last;
		}
		return { parent, index: parent.children.length };
	}
	if (place === "under") return { parent: target, index: target.children.length };
	const parent = ancestorsOf(root, target.id)[0];
	if (parent === undefined) return null;
	return { parent, index: parent.children.indexOf(target) + 1 };
}

/**
 * Why `line` (a node of `root`) cannot move to `gap` in its own note: the gap
 * is inside the line's own subtree, or the line already fills it (the mind
 * map's drop never offers either). Null when it can.
 */
export function moveRefusal(root: OsmosisNode, line: OsmosisNode, gap: MoveGap): "inside" | "unchanged" | null {
	if (preorder(line).includes(gap.parent)) return "inside";
	const parent = ancestorsOf(root, line.id)[0];
	if (parent !== gap.parent) return null;
	const index = parent.children.indexOf(line);
	return gap.index === index || gap.index === index + 1 ? "unchanged" : null;
}

/**
 * Move `line` (a node of `root`, parsed from `content`) and its subtree to
 * `gap` in the same note, as the mind map's drop does: re-levelled by the
 * drop rules, one splice. `start` is where the moved line starts in `text`
 * (before `normalizeWrite`). Null when `moveRefusal` refuses it.
 */
export function moveInNote(content: string, root: OsmosisNode, line: OsmosisNode, gap: MoveGap): Spliced | null {
	if (moveRefusal(root, line, gap) !== null) return null;
	const site = resolveInsertSite(gap.parent, gap.index, () => "");
	return moveWithinFile(content, [line], site.offset, (src) => dropContext(gap.parent, gap.index, src));
}
