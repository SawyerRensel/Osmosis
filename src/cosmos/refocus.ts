/**
 * Whether going somewhere in Cosmos changes the focus note (see
 * `vault/Planner/3D Graph - Focus changes only on purpose.md`).
 *
 * Travel is camera only: a plate click, an edge ride's arrival, a panel link
 * or a study stop whose node is loaded flies there and leaves the focus note
 * (and so the loaded area) as it is. The focus note changes only on purpose:
 * the plate menu's "Focus this note", the F key, or a link to a note that is
 * not loaded, which has nowhere to fly until its note is the focus.
 */

import type { GraphNodeKind } from "./model";

/**
 * The note a deliberate refocus on a node makes the focus note: a line's or a
 * note core's own note. Null when there is nothing to do: the node is in the
 * focus note already, or it is a tag, attachment or unresolved link, which
 * belong to no note.
 */
export function refocusPath(node: { kind: GraphNodeKind; path?: string }, focusPath: string | null): string | null {
	if ((node.kind !== "note" && node.kind !== "line") || node.path === undefined || node.path === focusPath) return null;
	return node.path;
}
