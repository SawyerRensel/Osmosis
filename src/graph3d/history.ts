/**
 * Back and forward in the 3D graph (see `vault/Planner/3D Graph - Back and
 * forward.md`). The stack itself is the tab's own history (`leaf.history`):
 * the view records a step by calling `leaf.setViewState` with the place it is
 * going to, and core keeps the place it is leaving when `setState` reports
 * `result.history`. Back and forward hand an old place back to `setState`.
 * This module decides what arriving at a place means.
 *
 * A place is the focus note and the plate the camera stands at. Going to
 * another plate in the same focus note is a flight; going to another focus
 * note reloads the loaded area around it.
 */

import { noteNodeId } from "./model";

/** Where the 3D view stands: its focus note, and the plate the camera is at. */
export interface Place {
	focus: string | null;
	node: string | null;
}

/**
 * What arriving at a place takes from where the view stands now. A flight
 * `again` is to the plate already selected (the camera may have orbited off
 * it): it flies but is no step in the history.
 */
export type Step = { kind: "none" } | { kind: "fly"; node: string; again: boolean } | { kind: "refocus"; focus: string; node: string | null };

/** Whether a step goes somewhere new, and so is an entry in the tab's history. */
export const isEntry = (step: Step): boolean => step.kind === "refocus" || (step.kind === "fly" && !step.again);

/** The place a saved or handed-over view state names; anything malformed reads as null. */
export function readPlace(state: Record<string, unknown> | null | undefined): Place {
	return {
		focus: typeof state?.focus === "string" ? state.focus : null,
		node: typeof state?.node === "string" ? state.node : null,
	};
}

/**
 * The step from `here` to `there`. Another focus note is a refocus; a plate
 * in the same focus note is a flight. A flight to the plate selected already
 * is `again`, no entry: repeated visits to one plate collapse into one. A
 * place with no focus note, or no plate in the same focus note, is no step.
 */
export function stepTo(here: Place, there: Place): Step {
	if (there.focus === null) return { kind: "none" };
	if (there.focus !== here.focus) return { kind: "refocus", focus: there.focus, node: there.node };
	if (there.node === null) return { kind: "none" };
	return { kind: "fly", node: there.node, again: there.node === here.node };
}

/** The note a line or note-core node ID belongs to (`line:<path>#…`, `note:<path>`); null for tags, attachments and ghosts. Paths cannot hold `#`. */
export function nodeNotePath(id: string): string | null {
	if (id.startsWith("note:")) return id.slice("note:".length);
	if (!id.startsWith("line:")) return null;
	const hash = id.indexOf("#");
	return hash < 0 ? null : id.slice("line:".length, hash);
}

/**
 * The plate to land on for `node` with `focus` as the focus note, given what
 * is loaded (`has`). The node itself if it is still there; when an edit has
 * deleted it, its note's root; failing that, the focus note's root.
 */
export function landing(has: (id: string) => boolean, focus: string, node: string): string {
	if (has(node)) return node;
	const path = nodeNotePath(node);
	if (path !== null && has(noteNodeId(path))) return noteNodeId(path);
	return noteNodeId(focus);
}
