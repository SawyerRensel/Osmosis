/**
 * Multi-select in Cosmos: the box select's hit test, the selection set's
 * operations, and the pure halves of the actions on a selection (delete, copy
 * as Markdown). See `vault/Planner/3D Graph - Multi-select.md`.
 */

import { deleteSubtree, subtreeEnd } from "../mindmap-edit";
import type { OsmosisNode } from "../types";

/** A screen-space rectangle in client px. */
export interface ScreenRect {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/** The box a Shift+drag from (`ax`, `ay`) to (`bx`, `by`) draws, whichever way it went. */
export function boxRect(ax: number, ay: number, bx: number, by: number): ScreenRect {
	return { left: Math.min(ax, bx), top: Math.min(ay, by), right: Math.max(ax, bx), bottom: Math.max(ay, by) };
}

/** A plate's centre on screen. */
export interface ScreenPoint {
	id: string;
	x: number;
	y: number;
}

/**
 * The plates a box selects: those whose centre is inside it (edges included).
 * Centre, not any overlap: a large near plate that the box only grazes, or a
 * far plate behind the ones aimed at, would otherwise come along.
 */
export function boxHits(points: readonly ScreenPoint[], rect: ScreenRect): string[] {
	return points.filter((p) => p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom).map((p) => p.id);
}

/** `selection` with `id` added, or taken out if it was in. */
export function toggled(selection: ReadonlySet<string>, id: string): Set<string> {
	const next = new Set(selection);
	if (!next.delete(id)) next.add(id);
	return next;
}

/**
 * Touch tap-hold multi-select, as the mind map's touch selection mode: a
 * finger held still on a plate puts it in the selection and turns the mode
 * on. Held on a plate that is already selected, it stays in (the mind map
 * does the same, so a hold never drops what it lands on); a tap toggles.
 */
export function heldInto(selection: ReadonlySet<string>, id: string): Set<string> {
	return new Set(selection).add(id);
}

/**
 * Whether a tap toggles a plate in or out of the selection (like Shift+click)
 * instead of selecting it alone: only while the touch selection mode is on
 * and something is still selected, and only on a plate. A tap on empty space
 * ends the mode and does what it always does (clears the selection).
 */
export function tapToggles(selecting: boolean, selectionSize: number, onPlate: boolean): boolean {
	return selecting && selectionSize > 0 && onPlate;
}

/**
 * The selected lines of one note that an action takes, in document order: a
 * line inside another selected line's subtree goes with that line, so it is
 * dropped here (a delete or copy of both would act on it twice).
 */
export function topmostLines(lines: readonly OsmosisNode[]): OsmosisNode[] {
	const sorted = [...lines].sort((a, b) => a.range.start - b.range.start);
	const kept: OsmosisNode[] = [];
	let end = -1;
	for (const line of sorted) {
		if (line.range.start < end) continue;
		kept.push(line);
		end = subtreeEnd(line);
	}
	return kept;
}

/** Delete every selected line of one note with its subtree, as a single delete does: last first, so earlier offsets hold. */
export function deleteLines(content: string, lines: readonly OsmosisNode[]): string {
	return topmostLines(lines)
		.reverse()
		.reduce((text, line) => deleteSubtree(text, line), content);
}

const HEADING = /^(#{1,6})(\s)/;

/**
 * The selected lines of one note as Markdown: each line with its subtree, in
 * document order, re-levelled so the shallowest selected line is top level.
 * List lines lose the smallest indent the selected list lines start at;
 * headings shift so the shallowest selected heading is an H1.
 */
export function linesMarkdown(content: string, lines: readonly OsmosisNode[]): string {
	const blocks = topmostLines(lines).map((line) => content.slice(line.range.start, subtreeEnd(line)).replace(/\n+$/, ""));
	const firsts = blocks.map((block) => block.split("\n")[0] ?? "");
	const indents = firsts.filter((line) => !HEADING.test(line)).map((line) => /^[ \t]*/.exec(line)![0].length);
	const levels = firsts.map((line) => HEADING.exec(line)?.[1]?.length).filter((n): n is number => n !== undefined);
	const indent = indents.length === 0 ? 0 : Math.min(...indents);
	const shift = levels.length === 0 ? 0 : Math.min(...levels) - 1;
	const relevel = (line: string): string => {
		const heading = HEADING.exec(line);
		if (heading !== null) return "#".repeat(heading[1]!.length - shift) + line.slice(heading[1]!.length);
		const lead = /^[ \t]*/.exec(line)![0].length;
		return line.slice(Math.min(lead, indent));
	};
	return blocks.map((block) => block.split("\n").map(relevel).join("\n")).join("\n");
}

/** One note's (or one other plate's) part of a copied selection. */
export interface CopyGroup {
	/** The note's title, shown as a `[[link]]` above its lines when the copy spans more than one group. Null: no heading (a tag or a file). */
	title: string | null;
	markdown: string;
}

/** A copied selection: its groups (each note's lines, grouped by note in the order given), a blank line between them. */
export function selectionMarkdown(groups: readonly CopyGroup[]): string {
	const titled = groups.length > 1;
	return groups.map((group) => (titled && group.title !== null ? `[[${group.title}]]\n${group.markdown}` : group.markdown)).join("\n\n");
}
