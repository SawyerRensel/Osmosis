/**
 * The pure halves of the structural actions on a 3D multi-selection: move the
 * selected lines together (the drop menu's Move under / after / to end of
 * note), indent or outdent them together (Alt+→ / Alt+←), and link each of
 * them to one target ("Add link"). Each planner takes the notes' fresh text
 * and parse, and returns every changed note's new text (before
 * `normalizeWrite`), for the view to write as one edit group. See
 * `vault/Planner/3D Graph - Multi-select.md`, Part 2.
 */

import { dropContext, inferIndentDepth, inferIndentType, inferRootHeadingLevel, insertAt, outdentContext, reindentSubtree, removeSpan, resolveInsertSite, subtreeEnd, widenRemoval } from "../mindmap-edit";
import type { OsmosisNode } from "../types";
import { ancestorsOf, appendInsertion, insertAll, linkSubpath, moveGap, preorder, stampInsertion, type Insertion, type MovePlace } from "./edit";
import { topmostLines } from "./selection";
import { linkMarker, nextLinkMarker } from "./links";

/** A note as read fresh for the edit: its text and its parse. */
export interface PlanNote {
	content: string;
	root: OsmosisNode;
}

/** A selected line: its note and its node in that note's fresh parse. */
export interface PickedLine {
	path: string;
	line: OsmosisNode;
}

/** A line the edit wrote: `line` is the node it was in note `origin`, and it starts at `start` in note `path`'s new text. */
export interface PlannedLine {
	path: string;
	start: number;
	line: OsmosisNode;
	origin: string;
}

/** What an action on a selection does: the new text of each note it changes, and where the lines it acted on start now. */
export interface SelectionEdit {
	texts: Map<string, string>;
	lines: PlannedLine[];
}

/**
 * The lines an action takes, in the order it takes them: notes in the order
 * they first appear in `selected` (the primary's first), each note's lines in
 * document order. A line inside another selected line's subtree goes with that
 * line, so it is dropped (`topmostLines`).
 */
export function orderedLines(selected: readonly PickedLine[]): PickedLine[] {
	const byPath = new Map<string, OsmosisNode[]>();
	for (const { path, line } of selected) byPath.set(path, [...(byPath.get(path) ?? []), line]);
	return [...byPath].flatMap(([path, lines]) => topmostLines(lines).map((line) => ({ path, line })));
}

/** An insertion at `offset` of a note's original text, made after the cuts; `level` is how deep its new parent is (the root is 0). */
interface Placed {
	offset: number;
	text: string;
	level: number;
}

/**
 * Splice one note: cut `removed` (each line with its subtree; adjacent ones
 * merge, and each cut swallows the blank lines around it, as a move's does),
 * cut `replaced` spans exactly, then make `inserted` (offsets in the original
 * text; one inside a cut goes where the cut was), each on its own line. At one
 * offset, a deeper parent's lines come first (they close its subtree), then
 * the order given. Returns the text and where each insertion starts in it.
 */
function splice(content: string, removed: readonly OsmosisNode[], replaced: readonly { start: number; end: number }[], inserted: readonly Placed[]): { text: string; starts: number[] } {
	const spans = removed.map((line) => ({ start: line.range.start, end: subtreeEnd(line) })).sort((a, b) => a.start - b.start);
	const merged: { start: number; end: number }[] = [];
	for (const span of spans) {
		const last = merged.at(-1);
		if (last !== undefined && /^\s*$/.test(content.slice(last.end, span.start))) last.end = Math.max(last.end, span.end);
		else merged.push({ ...span });
	}
	const cuts = [...merged.map((span) => widenRemoval(content, span)), ...replaced].sort((a, b) => a.start - b.start);
	// Where an original offset is once the cuts are made.
	const mapped = (offset: number): number => {
		let shift = 0;
		for (const cut of cuts) {
			if (cut.end <= offset) shift += cut.end - cut.start;
			else if (cut.start < offset) return cut.start - shift;
		}
		return offset - shift;
	};
	let text = [...cuts].reverse().reduce((out, cut) => removeSpan(out, cut), content);
	// Last first: each insertion lands before the ones already made at its offset, so at one offset they go in reverse.
	const order = inserted.map((edit, i) => ({ at: mapped(edit.offset), text: edit.text, level: edit.level, i })).sort((a, b) => b.at - a.at || a.level - b.level || b.i - a.i);
	const starts: number[] = inserted.map(() => 0);
	order.forEach((edit, k) => {
		const prefix = edit.at > 0 && text[edit.at - 1] !== "\n" ? 1 : 0;
		const result = insertAt(text, edit.at, edit.text);
		text = result.text;
		// Every insertion made so far is at or after this one.
		for (let j = 0; j < k; j++) starts[order[j]!.i] = starts[order[j]!.i]! + result.shift;
		starts[edit.i] = edit.at + prefix;
	});
	// A cut that reached the end of the note took its last newline.
	if (content.endsWith("\n") && !text.endsWith("\n")) text += "\n";
	return { text, starts };
}

/** A note's line text with its subtree, verbatim. */
const subtreeText = (content: string, line: OsmosisNode): string => content.slice(line.range.start, subtreeEnd(line));

/** Group `lines` by note, keeping their order. */
function byNote(lines: readonly PickedLine[]): Map<string, OsmosisNode[]> {
	const out = new Map<string, OsmosisNode[]>();
	for (const { path, line } of lines) out.set(path, [...(out.get(path) ?? []), line]);
	return out;
}

/** Each changed note's text after cutting its `removed` lines and making its insertions; the starts of the insertions tagged with a line, in the order given. */
function spliceNotes(
	notes: ReadonlyMap<string, PlanNote>,
	removed: ReadonlyMap<string, OsmosisNode[]>,
	replaced: ReadonlyMap<string, { start: number; end: number }[]>,
	inserted: readonly (Placed & { path: string; line: OsmosisNode; origin: string })[],
): SelectionEdit {
	const texts = new Map<string, string>();
	const lines: PlannedLine[] = new Array<PlannedLine>(inserted.length);
	for (const path of new Set([...removed.keys(), ...replaced.keys(), ...inserted.map((edit) => edit.path)])) {
		const note = notes.get(path);
		if (note === undefined) continue;
		const mine = inserted.flatMap((edit, i) => (edit.path === path ? [{ edit, i }] : []));
		const { text, starts } = splice(note.content, removed.get(path) ?? [], replaced.get(path) ?? [], mine.map(({ edit }) => edit));
		texts.set(path, text);
		mine.forEach(({ edit, i }, k) => (lines[i] = { path, start: starts[k]!, line: edit.line, origin: edit.origin }));
	}
	return { texts, lines: lines.filter((line) => line !== undefined) };
}

/** Where a move goes: a line of `path`, or its note (`node` null: the core, or a sole H1 root). */
export interface MoveTarget {
	path: string;
	node: OsmosisNode | null;
}

/**
 * Move every selected line, each with its subtree, to `place` relative to
 * `target`, as one line's move does (`moveGap`, re-levelled by the drop
 * rules): in `orderedLines` order, from any note into `target`'s. "inside"
 * when the target, or the gap, is inside a moving line (or is one); null when
 * there is nothing to move or "after" has nowhere to go. `lines` lists the
 * moved lines where they start in `target.path`'s new text.
 */
export function planSelectionMove(notes: ReadonlyMap<string, PlanNote>, selected: readonly PickedLine[], target: MoveTarget, place: MovePlace): SelectionEdit | "inside" | null {
	const dest = notes.get(target.path);
	const lines = orderedLines(selected);
	if (dest === undefined || lines.length === 0) return null;
	const moving = new Set(lines.filter((picked) => picked.path === target.path).flatMap((picked) => preorder(picked.line)));
	if (target.node !== null && moving.has(target.node)) return "inside";
	const inserted: (Placed & { path: string; line: OsmosisNode; origin: string })[] = [];
	for (const { path, line } of lines) {
		const note = notes.get(path);
		const gap = moveGap(dest.root, target.node, place, line);
		if (note === undefined || gap === null) return null;
		if (moving.has(gap.parent)) return "inside";
		const context = dropContext(gap.parent, gap.index, line);
		const { offset } = resolveInsertSite(gap.parent, gap.index, () => target.path);
		const text = reindentSubtree(subtreeText(note.content, line), line, context.type, context.depth);
		inserted.push({ path: target.path, offset, text, level: ancestorsOf(dest.root, gap.parent.id).length, line, origin: path });
	}
	return spliceNotes(notes, byNote(lines), new Map(), inserted);
}

/** The text each origin note gives up to a cross-note move: its moved lines with their subtrees, for the block IDs whose review history follows them. */
export function movedOut(notes: ReadonlyMap<string, PlanNote>, selected: readonly PickedLine[], destPath: string): Map<string, string> {
	const out = new Map<string, string>();
	for (const [path, lines] of byNote(orderedLines(selected))) {
		const note = notes.get(path);
		if (path !== destPath && note !== undefined) out.set(path, lines.map((line) => subtreeText(note.content, line)).join("\n"));
	}
	return out;
}

/**
 * Indent or outdent every selected line together (Alt+→ / Alt+←), each as the
 * single-line key does, against the notes as they are now:
 *
 * - **Indent:** a run of adjacent selected siblings goes under the sibling
 *   before it. A run with none (a first child) stays where it is.
 * - **Outdent:** the selected children of one parent go after the parent's
 *   subtree, in document order. Under the note's root, a list line becomes a
 *   paragraph and a paragraph a heading, in place; a heading stays.
 *
 * `lines` lists the lines that moved, in `orderedLines` order; a skipped line
 * is not in it. Null when nothing moved.
 */
export function planSelectionRelevel(action: "indent" | "outdent", notes: ReadonlyMap<string, PlanNote>, selected: readonly PickedLine[]): SelectionEdit | null {
	const removed = new Map<string, OsmosisNode[]>();
	const replaced = new Map<string, { start: number; end: number }[]>();
	const inserted: (Placed & { path: string; line: OsmosisNode; origin: string })[] = [];
	const cut = (path: string, line: OsmosisNode): void => void removed.set(path, [...(removed.get(path) ?? []), line]);
	for (const [path, lines] of byNote(orderedLines(selected))) {
		const note = notes.get(path);
		if (note === undefined) continue;
		// The selected children of each parent, in document order.
		const groups = new Map<OsmosisNode, OsmosisNode[]>();
		for (const line of lines) {
			const parent = ancestorsOf(note.root, line.id)[0];
			if (parent !== undefined) groups.set(parent, [...(groups.get(parent) ?? []), line]);
		}
		for (const [parent, children] of groups) {
			const relevel = (line: OsmosisNode, offset: number, under: OsmosisNode, context: { type: OsmosisNode["type"]; depth: number }): void => {
				const text = reindentSubtree(subtreeText(note.content, line), line, context.type, context.depth);
				inserted.push({ path, offset, text, level: ancestorsOf(note.root, under.id).length, line, origin: path });
			};
			if (action === "indent") {
				// A run of adjacent selected siblings goes under the sibling before the run, as in 2D; a run with none stays.
				let previous: OsmosisNode | undefined;
				let last = -2;
				for (const line of children) {
					const index = parent.children.indexOf(line);
					if (index !== last + 1) previous = parent.children[index - 1];
					last = index;
					if (previous === undefined) continue;
					cut(path, line);
					relevel(line, subtreeEnd(previous), previous, { type: inferIndentType(previous, line), depth: inferIndentDepth(previous, line) });
				}
			} else if (parent.type === "root") {
				for (const line of children) {
					const context =
						line.type === "bullet" || line.type === "ordered"
							? { type: "paragraph" as const, depth: 0 }
							: line.type === "paragraph"
								? { type: "heading" as const, depth: inferRootHeadingLevel(parent, parent.children.indexOf(line)) }
								: null;
					if (context === null) continue;
					const span = { start: line.range.start, end: subtreeEnd(line) };
					replaced.set(path, [...(replaced.get(path) ?? []), span]);
					relevel(line, span.start, parent, context);
				}
			} else {
				for (const line of children) {
					cut(path, line);
					relevel(line, subtreeEnd(parent), ancestorsOf(note.root, parent.id)[0] ?? parent, outdentContext(line, parent));
				}
			}
		}
	}
	if (inserted.length === 0) return null;
	// In `orderedLines` order, whatever order the parents were visited in.
	const order = orderedLines(selected);
	const rank = (edit: { path: string; line: OsmosisNode }): number => order.findIndex((picked) => picked.path === edit.path && picked.line === edit.line);
	inserted.sort((a, b) => rank(a) - rank(b));
	return spliceNotes(notes, removed, replaced, inserted);
}

/** What linking a selection to one target writes; `skipped` counts the selected lines that could not take a link. */
export interface SelectionLink extends SelectionEdit {
	skipped: number;
}

/**
 * Add a link to `target` (a line, or its note when `node` is null) at the end
 * of every selected line, as one line's "Add link" does. Every selected line
 * is linked, a line under another selected line too: a link is the line's own,
 * not its subtree's. The target needs a block ID at most once (`linkSubpath`:
 * an ID it has is reused). `linkText` writes the link from a note, given the
 * subpath and the link's display text (`^N`, the next marker in that note,
 * counted on per link: `nextLinkMarker`). Skipped: the target line itself, a line in the target's own note
 * when the target is that note, and a line that cannot take a link (a code
 * block, table, quote or embed). `lines` lists the linked lines, then the
 * target if it was stamped. Null when the target cannot take a block ID.
 */
export function planSelectionLink(notes: ReadonlyMap<string, PlanNote>, selected: readonly PickedLine[], target: MoveTarget, linkText: (fromPath: string, subpath: string, alias: string) => string): SelectionLink | null {
	// A note (or file) target needs no text of its own: it is linked by name.
	const dest = notes.get(target.path);
	const sub = target.node === null ? { subpath: "", stamp: null } : dest === undefined ? null : linkSubpath(target.node, dest.root, dest.content);
	if (sub === null) return null;
	const edits = new Map<string, (Insertion & { line: OsmosisNode })[]>();
	const add = (path: string, edit: Insertion, line: OsmosisNode): void => void edits.set(path, [...(edits.get(path) ?? []), { ...edit, line }]);
	let skipped = 0;
	const markers = new Map<string, number>();
	for (const { path, line } of selected) {
		const note = notes.get(path);
		const own = path === target.path && (target.node === null || line === target.node);
		const marker = note === undefined ? 0 : (markers.get(path) ?? nextLinkMarker(note.content));
		const edit = note === undefined || own ? null : appendInsertion(note.content, line, linkText(path, sub.subpath, linkMarker(marker)));
		if (edit === null) skipped++;
		else {
			add(path, edit, line);
			markers.set(path, marker + 1);
		}
	}
	if (edits.size > 0 && target.node !== null && sub.stamp !== null) add(target.path, stampInsertion(target.node, sub.stamp), target.node);
	const texts = new Map<string, string>();
	const lines: PlannedLine[] = [];
	for (const [path, mine] of edits) {
		const content = notes.get(path)!.content;
		texts.set(path, insertAll(content, mine));
		const shift = (start: number): number => start + mine.reduce((sum, edit) => sum + (edit.offset <= start ? edit.text.length : 0), 0);
		for (const edit of mine) lines.push({ path, start: shift(edit.line.range.start), line: edit.line, origin: path });
	}
	// The target last, so the first entry is a linked line.
	lines.sort((a, b) => Number(a.line === target.node) - Number(b.line === target.node));
	return { texts, lines, skipped };
}
