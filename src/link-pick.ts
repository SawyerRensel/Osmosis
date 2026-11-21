/**
 * The toolbar's "Add link" mode, shared by the mind map and Cosmos:
 * arm it on the selected nodes, then the next tap on a node is the link's
 * target. Only a tap counts. The views ask this only about releases that
 * already passed their own tap test (2D's `handleTouchTap`/`handleClick`, the
 * 3D scene's `releaseIsClick` and click slop), so a drag, hold or pinch made
 * to reach the target navigates as usual and leaves the mode armed. A pick
 * shows `linkMenuItems` at the target: link to it, or move the sources there.
 */

/** What a tap does while the mode is armed. */
export type LinkPick =
	/** Not armed: the tap does what it always does. */
	| { kind: "pass" }
	/** Link every source to `target`; the mode ends. */
	| { kind: "link"; sources: readonly string[]; target: string }
	/** Empty space or a source node: the mode ends, nothing is written. */
	| { kind: "cancel" }
	/** A node that cannot take a link (a tag, say): nothing happens, the mode stays armed. */
	| { kind: "ignore" };

/** A tap while armed: the node under it (null: empty space), and whether that node can be linked to. */
export interface PickTap {
	target: string | null;
	linkable: boolean;
}

export class LinkPicker {
	private sources: string[] | null = null;

	get armed(): boolean {
		return this.sources !== null;
	}

	/** The nodes the link is made from, as they were selected when the mode was armed. */
	get from(): readonly string[] {
		return this.sources ?? [];
	}

	/** The button: arm on `selection`, or disarm when armed. With nothing selected it stays off. Returns whether it is armed now. */
	toggle(selection: readonly string[]): boolean {
		this.sources = this.sources === null && selection.length > 0 ? [...selection] : null;
		return this.armed;
	}

	/** Escape, leaving edit mode, another file: end the mode. True when it was armed. */
	cancel(): boolean {
		const was = this.armed;
		this.sources = null;
		return was;
	}

	/** A tap (never a drag, hold or pinch) while the views may be armed: what it does. */
	tap({ target, linkable }: PickTap): LinkPick {
		const sources = this.sources;
		if (sources === null) return { kind: "pass" };
		if (target !== null && !sources.includes(target) && !linkable) return { kind: "ignore" };
		this.sources = null;
		if (target === null || sources.includes(target)) return { kind: "cancel" };
		return { kind: "link", sources, target };
	}
}

/** A choice in the menu shown at a link's target (3D's Alt-drag drop, and Add link's pick in both views). */
export type LinkChoice = "link" | "under" | "after" | "end";

export interface LinkMenuItem {
	choice: LinkChoice;
	title: string;
	icon: string;
}

/** What the target and the sources allow, as each view judges it. */
export interface LinkMenuTarget {
	/** "Add link" applies: some source can take a link to the target. */
	canLink: boolean;
	/** The sources may be moved beside or under the target (not into their own subtree). */
	canMove: boolean;
	/** The target is a line, so it can take children. */
	line: boolean;
	/** The target is its note's root (a note plate, a sole H1, the mind map's root). */
	root: boolean;
}

/**
 * The menu's items, in order. "Move after" is never offered for a root: a
 * line after a sole H1 sits outside it and gives the note back its core. A
 * root offers "Move to end of note" instead.
 */
export function linkMenuItems({ canLink, canMove, line, root }: LinkMenuTarget): LinkMenuItem[] {
	const items: LinkMenuItem[] = [];
	if (canLink) items.push({ choice: "link", title: "Add link", icon: "link" });
	if (!canMove) return items;
	if (line) items.push({ choice: "under", title: "Move under", icon: "corner-down-right" });
	if (line && !root) items.push({ choice: "after", title: "Move after", icon: "arrow-down" });
	if (root) items.push({ choice: "end", title: "Move to end of note", icon: "arrow-down-to-line" });
	return items;
}
