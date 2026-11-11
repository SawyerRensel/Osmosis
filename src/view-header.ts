/**
 * The header both graph views share: the mind map (2D) and the 3D graph show
 * the same buttons in the same order, so they are learnt once. The views build
 * the DOM (`views/ViewHeader.ts`); this module only says what is shown and in
 * what order, left to right, so the rule has one home and a test.
 */

export type HeaderView = "2d" | "3d";

/** A header button. `switch` is the 2D | 3D pill; the rest are icon buttons. */
export type HeaderItem = "switch" | "note-view" | "reading" | "style" | "study" | "pin" | "peek" | "follow";

/** What both views show, in order. */
export const SHARED_HEADER: readonly HeaderItem[] = ["switch", "note-view", "reading", "style", "study"];

/** What only one view shows, after the shared set. */
export const HEADER_EXTRAS: Record<HeaderView, readonly HeaderItem[]> = {
	"2d": ["pin", "peek"],
	"3d": ["follow"],
};

/** A view's whole header, left to right. */
export function headerItems(view: HeaderView): HeaderItem[] {
	return [...SHARED_HEADER, ...HEADER_EXTRAS[view]];
}

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
