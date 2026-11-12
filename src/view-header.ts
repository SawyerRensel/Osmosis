/**
 * The header both graph views share: the mind map (2D) and the 3D graph show
 * the same buttons in the same order, so they are learnt once. The views build
 * the DOM (`views/ViewHeader.ts`); this module only says what is shown and in
 * what order, left to right, so the rule has one home and a test.
 */

export type HeaderView = "2d" | "3d";

/** A header button. `switch` is the 2D | 3D pill; the rest are icon buttons. */
export type HeaderItem = "note-view" | "switch" | "study" | "reading";

/** Both views show exactly these, in order, left to right; Obsidian's own ⋯ stands after them. */
export const SHARED_HEADER: readonly HeaderItem[] = ["note-view", "switch", "study", "reading"];

/** A view's whole header, left to right. The same in both views: what only one view has lives in the ⋯ menu (`PANE_MENU`). */
export function headerItems(_view: HeaderView): HeaderItem[] {
	return [...SHARED_HEADER];
}

/** An entry of the ⋯ pane menu. A toggle shows its state as a check mark. */
export type PaneMenuId = "style" | "pin" | "peek" | "follow";
export interface PaneMenuEntry {
	id: PaneMenuId;
	title: string;
	icon: string;
	toggle: boolean;
}

/** What each view adds to the ⋯ menu, in order, ahead of Obsidian's own entries. */
export const PANE_MENU: Record<HeaderView, readonly PaneMenuEntry[]> = {
	"2d": [
		{ id: "style", title: "Style", icon: "paintbrush", toggle: false },
		{ id: "pin", title: "Pin this mind map", icon: "pin", toggle: true },
		{ id: "peek", title: "Peek mode", icon: "eye", toggle: true },
	],
	"3d": [
		{ id: "style", title: "Style", icon: "paintbrush", toggle: false },
		{ id: "follow", title: "Follow active note", icon: "locate-fixed", toggle: true },
	],
};

/**
 * The icon and tooltip of the Reading/Editing button. It shows the mode a
 * click switches to, as Obsidian's note view does: a pencil while reading, an
 * open book while editing.
 */
export function readingToggle(reading: boolean): { icon: string; label: string } {
	return reading
		? { icon: "pencil", label: "Current view: reading\nClick to edit" }
		: { icon: "book-open", label: "Current view: editing\nClick to read" };
}
