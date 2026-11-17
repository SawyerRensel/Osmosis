/**
 * Whether an edit changed a note's outline: its shape, as opposed to its
 * words. A structural edit (a line added, deleted, moved or re-levelled)
 * re-settles the loaded graph, so the new shape gets room; a text edit leaves
 * every settled node where it is. See `vault/Planner/3D Graph - Re-settle
 * after structural edits.md`.
 *
 * The model is compared rather than the edit's kind, so an undo, a redo, or a
 * text edit that turns a list line into a heading (which moves its subtree)
 * is judged by what it did.
 */

import type { GraphModel } from "./model";

/** A note's lines in document order: each one's parent as an index into that order (-1 for none), and its text. */
interface Outline {
	parents: number[];
	labels: string[];
}

function outlines(model: GraphModel): Map<string, Outline> {
	const parentOf = new Map<string, string>();
	for (const edge of model.edges) if (edge.kind === "hierarchy") parentOf.set(edge.target, edge.source);
	const byPath = new Map<string, { id: string; start: number; label: string }[]>();
	for (const node of model.nodes) {
		if ((node.kind !== "line" && node.kind !== "note") || node.path === undefined) continue;
		// A note's core enters its note with no lines, so a note whose last line went still counts.
		let lines = byPath.get(node.path);
		if (lines === undefined) byPath.set(node.path, (lines = []));
		if (node.kind === "line") lines.push({ id: node.id, start: node.source?.range.start ?? 0, label: node.label });
	}
	const result = new Map<string, Outline>();
	for (const [path, lines] of byPath) {
		lines.sort((a, b) => a.start - b.start);
		const index = new Map(lines.map((line, i) => [line.id, i]));
		result.set(path, {
			parents: lines.map((line) => index.get(parentOf.get(line.id) ?? "") ?? -1),
			labels: lines.map((line) => line.label),
		});
	}
	return result;
}

const sameList = <T>(a: readonly T[], b: readonly T[]): boolean => a.length === b.length && a.every((value, i) => value === b[i]);

/**
 * True when a note loaded in both models has a different outline in `after`:
 * lines added or removed, a line under a different parent, or the same lines
 * in a different order (a move among siblings, which leaves the shape alone).
 * Rewording a line changes only its own text, so it is not structural. Notes
 * that loaded or unloaded don't count: a link typed into a line can bring a
 * note in, and that is not a change of shape.
 */
export function outlineChanged(before: GraphModel, after: GraphModel): boolean {
	const was = outlines(before);
	for (const [path, now] of outlines(after)) {
		const old = was.get(path);
		if (old === undefined) continue;
		if (!sameList(old.parents, now.parents)) return true;
		// Same shape: reordered when the same texts now come in another order.
		if (!sameList(old.labels, now.labels) && sameList([...old.labels].sort(), [...now.labels].sort())) return true;
	}
	return false;
}
