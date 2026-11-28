/**
 * The header both graph views share: the mind map (2D) and Cosmos show
 * the same buttons in the same order, so they are learnt once. The views build
 * the DOM (`views/ViewHeader.ts`); this module only says what is shown and in
 * what order, left to right, so the rule has one home and a test.
 */

export type HeaderView = "2d" | "3d";

/** A header button. `switch` is the 2D | 3D pill; the rest are icon buttons. */
export type HeaderItem = "style" | "note-view" | "switch" | "study" | "reading";

/** Both views show exactly these, in order, left to right; Obsidian's own ⋯ stands after them. */
export const SHARED_HEADER: readonly HeaderItem[] = ["style", "note-view", "switch", "study", "reading"];

/** The Style button, leftmost: it opens the style sidebar. The same icon and label in both views. */
export const STYLE_ACTION = { icon: "paintbrush", label: "Style" } as const;

/** A view's whole header, left to right. The same in both views: what only one view has lives in the ⋯ menu (`PANE_MENU`). */
export function headerItems(_view: HeaderView): HeaderItem[] {
	return [...SHARED_HEADER];
}

/** An entry of the ⋯ pane menu. A toggle shows its state as a check mark. */
export type PaneMenuId = "find" | "replace" | "pin" | "peek" | "follow" | "sticks" | "help";
export interface PaneMenuEntry {
	id: PaneMenuId;
	title: string;
	icon: string;
	toggle: boolean;
	/** Entries of one group sit together; a separator stands between groups. */
	group: number;
}

const FIND: PaneMenuEntry = { id: "find", title: "Find", icon: "search", toggle: false, group: 0 };
const REPLACE: PaneMenuEntry = { id: "replace", title: "Replace", icon: "replace", toggle: false, group: 0 };

/**
 * What each view adds to the ⋯ menu, in order, ahead of Obsidian's own entries:
 * Find and Replace (open the find bar), then the view's own. Both views list Find and Replace first.
 * A view leaves out an entry by giving it no handler: the 3D joysticks show only
 * on a touch screen, as the toolbar's 🎮 does. The joysticks and Controls help
 * are also on the toolbar; the menu is how a phone reaches them in reading mode,
 * where the toolbar is hidden.
 */
export const PANE_MENU: Record<HeaderView, readonly PaneMenuEntry[]> = {
	"2d": [
		FIND,
		REPLACE,
		{ id: "pin", title: "Pin this mind map", icon: "pin", toggle: true, group: 1 },
		{ id: "peek", title: "Peek mode", icon: "eye", toggle: true, group: 1 },
	],
	"3d": [
		FIND,
		REPLACE,
		{ id: "follow", title: "Follow active note", icon: "locate-fixed", toggle: true, group: 1 },
		{ id: "sticks", title: "Walk and fly joysticks", icon: "gamepad-2", toggle: true, group: 1 },
		{ id: "help", title: "Controls help", icon: "help", toggle: false, group: 1 },
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
