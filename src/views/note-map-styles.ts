/**
 * The note whose map-level styles (Theme to Reset all) the style sidebar's
 * Map tab edits. A mind map is one (`MindMapView`, which keeps the note's
 * styles in memory and re-renders on a write). Cosmos edits a note no mind
 * map holds, through `NoteMapStyles`.
 *
 * No runtime `obsidian` import, so `NoteMapStyles` is unit-tested.
 */

import type { TFile } from "obsidian";
import type { LayoutNode } from "../layout";
import type { MapSettings } from "../settings";
import { DEFAULT_MAP_SETTINGS, parseOsmosisStyleFrontmatter, readStyleMapping, styleMappingFor, type NodeStyle, type OsmosisStyleFrontmatter, type ThemeDefinition } from "../styles";
import { isDefaultTheme } from "../themes";

/** What the Map tab reads from and writes through. */
export interface MapStyleTarget {
	/** Set before a write so a mind map skips the reload its own write causes. */
	suppressNextReload: boolean;
	getOsmosisStyleFrontmatter(): OsmosisStyleFrontmatter | undefined;
	setOsmosisStyleFrontmatter(fm: OsmosisStyleFrontmatter | undefined): void;
	/** Re-read the styles from the note. */
	loadOsmosisStyleFrontmatter(): void;
	/** Show these settings now (a mind map re-lays out; Cosmos redraws when the note changes). */
	applyMapSettings(settings: MapSettings): void;
	/** Write the note's frontmatter (or its sidecar's), undoably where the view can undo. */
	processStylesTracked(file: TFile, fn: (fm: Record<string, unknown>) => void): Promise<void>;
	getActiveTheme(): ThemeDefinition | undefined;
	getGlobalClasses(): Record<string, NodeStyle>;
	/** The laid-out nodes, when the view has them: extracting a theme folds their styles in. */
	getNodeMap?(): ReadonlyMap<string, LayoutNode>;
	setActiveVariant(name: string | undefined): Promise<void>;
	createVariant(name: string): Promise<void>;
	renameVariant(oldName: string, newName: string): Promise<void>;
	deleteVariant(name: string): Promise<void>;
}

/** How `NoteMapStyles` reaches the note. */
export interface NoteMapStylesIO {
	/** The note's frontmatter, its sidecar's merged in (`NoteData.frontmatter`). */
	read: (file: TFile) => Record<string, unknown> | undefined;
	/** Write the note's styles where it keeps them, undoably if the view can. */
	write: (file: TFile, fn: (fm: Record<string, unknown>) => void) => Promise<void>;
	theme: (name: string) => ThemeDefinition | undefined;
	globalClasses: () => Record<string, NodeStyle>;
}

/**
 * A note's map-level styles, for a view with no mind map of it (Cosmos).
 * The styles are held as last written, since the metadata cache catches up
 * with a write only later.
 */
export class NoteMapStyles implements MapStyleTarget {
	suppressNextReload = false;
	private fm: OsmosisStyleFrontmatter | undefined;

	constructor(
		readonly file: TFile,
		private readonly io: NoteMapStylesIO,
	) {
		this.loadOsmosisStyleFrontmatter();
	}

	getOsmosisStyleFrontmatter(): OsmosisStyleFrontmatter | undefined {
		return this.fm;
	}

	setOsmosisStyleFrontmatter(fm: OsmosisStyleFrontmatter | undefined): void {
		this.fm = fm;
	}

	loadOsmosisStyleFrontmatter(): void {
		this.fm = parseOsmosisStyleFrontmatter(this.io.read(this.file));
	}

	applyMapSettings(): void {
		// Cosmos redraws once the metadata cache has the write (its `resolve` listener).
	}

	async processStylesTracked(file: TFile, fn: (fm: Record<string, unknown>) => void): Promise<void> {
		await this.io.write(file, (fm) => {
			fn(fm);
			if (file === this.file) this.fm = parseOsmosisStyleFrontmatter(structuredClone(fm));
		});
	}

	getActiveTheme(): ThemeDefinition | undefined {
		const name = { ...DEFAULT_MAP_SETTINGS, ...this.fm }.theme;
		return isDefaultTheme(name) ? undefined : this.io.theme(name);
	}

	getGlobalClasses(): Record<string, NodeStyle> {
		return this.io.globalClasses();
	}

	setActiveVariant(name: string | undefined): Promise<void> {
		return this.processStylesTracked(this.file, (fm) => setActiveVariantIn(fm, name));
	}

	createVariant(name: string): Promise<void> {
		return this.processStylesTracked(this.file, (fm) => createVariantIn(fm, name));
	}

	renameVariant(oldName: string, newName: string): Promise<void> {
		if (oldName === newName) return Promise.resolve();
		return this.processStylesTracked(this.file, (fm) => renameVariantIn(fm, oldName, newName));
	}

	deleteVariant(name: string): Promise<void> {
		return this.processStylesTracked(this.file, (fm) => deleteVariantIn(fm, name));
	}
}

// The variant writes, as `MindMapView` makes them.

type Variants = Record<string, Record<string, NodeStyle>>;

/** Make `name` the active variant, or clear it. */
export function setActiveVariantIn(fm: Record<string, unknown>, name: string | undefined): void {
	const osmosis = styleMappingFor(fm);
	if (name) osmosis["activeVariant"] = name;
	else delete osmosis["activeVariant"];
	if (Object.keys(osmosis).length === 0) delete fm["osmosis-styles"];
}

/** Add an empty variant `name` and make it active. */
export function createVariantIn(fm: Record<string, unknown>, name: string): void {
	const osmosis = styleMappingFor(fm);
	const variants = (osmosis["variants"] as Variants | undefined) ?? {};
	osmosis["variants"] = variants;
	variants[name] = {};
	osmosis["activeVariant"] = name;
}

/** Rename a variant, keeping it active if it was. */
export function renameVariantIn(fm: Record<string, unknown>, oldName: string, newName: string): void {
	const osmosis = readStyleMapping(fm);
	const variants = osmosis?.["variants"] as Variants | undefined;
	if (osmosis === undefined || variants?.[oldName] === undefined) return;
	variants[newName] = variants[oldName];
	delete variants[oldName];
	if (osmosis["activeVariant"] === oldName) osmosis["activeVariant"] = newName;
}

/** Delete a variant, clearing it if it was active. */
export function deleteVariantIn(fm: Record<string, unknown>, name: string): void {
	const osmosis = readStyleMapping(fm);
	const variants = osmosis?.["variants"] as Variants | undefined;
	if (osmosis === undefined || variants === undefined) return;
	delete variants[name];
	if (Object.keys(variants).length === 0) delete osmosis["variants"];
	if (osmosis["activeVariant"] === name) delete osmosis["activeVariant"];
	if (Object.keys(osmosis).length === 0) delete fm["osmosis-styles"];
}
