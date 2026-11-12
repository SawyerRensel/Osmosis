/**
 * The toolbar's "Add link" mode, shared by the mind map and the 3D graph:
 * arm it on the selected nodes, then the next tap on a node is the link's
 * target. Only a tap counts. The views ask this only about releases that
 * already passed their own tap test (2D's `handleTouchTap`/`handleClick`, the
 * 3D scene's `releaseIsClick` and click slop), so a drag, hold or pinch made
 * to reach the target navigates as usual and leaves the mode armed.
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
