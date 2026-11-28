import { isNoteLayout, NOTE_LAYOUTS, noteTitle, type NoteLayout } from "../note-layout";
import { sidebarSetting } from "./sidebar-setting";

/** The note a Layout section shows and writes. */
export interface LayoutTarget {
	path: string;
	/** Its layout now: its own, or the Default layout (`plugin.noteLayoutOf`). */
	layout: NoteLayout;
	/** Save a new layout (`plugin.setNoteLayout`), which may swap the leaf to the other view. */
	setLayout: (layout: NoteLayout) => void;
}

/**
 * The style sidebar's shared Layout section, used by the mind map's Map tab
 * and Cosmos's Settings: the Layout dropdown (Mindmap / Organic / Planets),
 * described by the note it writes, and under it the chosen layout's own
 * controls. `renderControls` draws them into an emptied container, at once
 * and again on every pick (before the layout is saved, so the section never
 * waits on the write).
 *
 * Returns a function that shows a layout changed elsewhere: it sets the
 * dropdown and redraws the controls, unless the layout is the one shown.
 */
export function renderLayoutSection(body: HTMLElement, target: LayoutTarget, renderControls: (el: HTMLElement, layout: NoteLayout) => void): (layout: NoteLayout) => void {
	let shown = target.layout;
	let select: HTMLSelectElement | null = null;
	const desc = createFragment((frag) => {
		frag.appendText("Layout of ");
		frag.createEl("em", { text: noteTitle(target.path) });
	});
	sidebarSetting(body)
		.setName("Layout")
		.setDesc(desc)
		.addDropdown((dropdown) => {
			select = dropdown.selectEl;
			dropdown
				.addOptions(NOTE_LAYOUTS)
				.setValue(shown)
				.onChange((value) => {
					if (!isNoteLayout(value)) return;
					show(value);
					target.setLayout(value);
				});
		});
	const controlsEl = body.createDiv({ cls: "osmosis-layout-controls" });
	const show = (layout: NoteLayout) => {
		shown = layout;
		controlsEl.empty();
		renderControls(controlsEl, layout);
	};
	show(shown);
	return (layout) => {
		if (layout === shown) return;
		if (select) select.value = layout;
		show(layout);
	};
}
