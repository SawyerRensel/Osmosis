/**
 * A note's Layout: how its map is drawn. Mindmap is the 2D mind map
 * (`MindMapView`); Organic and Planets are Cosmos (`CosmosView`) in one of its
 * two layouts. The engine is an implementation detail: the note names a
 * layout, and the plugin opens whichever view draws it.
 *
 * Saved per note as `layout` in its `osmosis-styles` (so it follows the note's
 * styles to its sidecar). A note without one uses the vault-wide Default
 * layout setting, and that default is never written into a note: picking it
 * removes the key. See `docs/adr/0001-layout-replaces-2d-3d-toggle.md`.
 *
 * Pure: no `obsidian` import, so it is unit-tested directly.
 */

import type { LayoutMode } from "./cosmos/overlays";
import { readStyleMapping, styleMappingFor } from "./styles";

export type NoteLayout = "mindmap" | "organic" | "planets";

/** Every layout, in the order a picker lists them, with its name. */
export const NOTE_LAYOUTS: Record<NoteLayout, string> = {
	mindmap: "Mindmap",
	organic: "Organic",
	planets: "Planets",
};

/** The Default layout setting's own default. */
export const DEFAULT_NOTE_LAYOUT: NoteLayout = "mindmap";

/** The key in `osmosis-styles` that holds a note's layout. */
export const LAYOUT_KEY = "layout";

/** The view that draws a layout. */
export type MapEngine = "mindmap" | "cosmos";

export function isNoteLayout(value: unknown): value is NoteLayout {
	return value === "mindmap" || value === "organic" || value === "planets";
}

/**
 * The layout a note is drawn in: its own, from `styles` (the raw
 * `osmosis-styles` value), else `defaultLayout`. A missing, corrupt or unknown
 * value reads as the default.
 */
export function noteLayout(styles: unknown, defaultLayout: NoteLayout): NoteLayout {
	const own = typeof styles === "object" && styles !== null && !Array.isArray(styles) ? (styles as Record<string, unknown>)[LAYOUT_KEY] : undefined;
	return isNoteLayout(own) ? own : defaultLayout;
}

/** Which view draws `layout`. */
export function engineFor(layout: NoteLayout): MapEngine {
	return layout === "mindmap" ? "mindmap" : "cosmos";
}

/**
 * The layout Cosmos draws for a note in `layout`. A Mindmap note shown in
 * Cosmos anyway (its explicit Open Cosmos command) is drawn Organic.
 */
export function cosmosLayout(layout: NoteLayout): LayoutMode {
	return layout === "planets" ? "planets" : "organic";
}

/**
 * Write `layout` into a note's frontmatter (or sidecar data): the key is set,
 * or removed when `layout` is the default, and an `osmosis-styles` left empty
 * is removed too.
 */
export function writeNoteLayout(frontmatter: Record<string, unknown>, layout: NoteLayout, defaultLayout: NoteLayout): void {
	if (layout === defaultLayout) {
		const styles = readStyleMapping(frontmatter);
		if (styles === undefined) return;
		delete styles[LAYOUT_KEY];
		if (Object.keys(styles).length === 0) delete frontmatter["osmosis-styles"];
		return;
	}
	styleMappingFor(frontmatter)[LAYOUT_KEY] = layout;
}
