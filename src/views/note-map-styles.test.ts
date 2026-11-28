import { describe, expect, it } from "vitest";
import type { TFile } from "obsidian";
import { NoteMapStyles, createVariantIn, deleteVariantIn, renameVariantIn, setActiveVariantIn } from "./note-map-styles";
import type { ThemeDefinition } from "../styles";

const file: TFile = { path: "Sailing.md" } as never;
const harbour: ThemeDefinition = { name: "Harbour", base: { fill: "#123456" } } as ThemeDefinition;

/** A note held in memory: `read` sees what `write` last wrote, as the metadata cache does once it catches up. */
function note(initial: Record<string, unknown> = {}) {
	const state = { fm: structuredClone(initial), writes: 0, stale: false };
	const styles = new NoteMapStyles(file, {
		read: () => (state.stale ? initial : state.fm),
		write: async (_file, fn) => {
			fn(state.fm);
			state.writes++;
		},
		theme: (name) => (name === "Harbour" ? harbour : undefined),
		globalClasses: () => ({}),
	});
	return { styles, state };
}

describe("NoteMapStyles", () => {
	it("reads the note's styles when made", () => {
		const { styles } = note({ "osmosis-styles": { theme: "Harbour", background: "#000" } });
		expect(styles.getOsmosisStyleFrontmatter()).toMatchObject({ theme: "Harbour", background: "#000" });
		expect(styles.getActiveTheme()).toBe(harbour);
	});

	it("holds what it wrote, before the metadata cache catches up", async () => {
		const { styles, state } = note();
		state.stale = true;
		await styles.processStylesTracked(file, (fm) => {
			fm["osmosis-styles"] = { background: "#fff" };
		});
		expect(styles.getOsmosisStyleFrontmatter()).toMatchObject({ background: "#fff" });
		styles.loadOsmosisStyleFrontmatter();
		expect(styles.getOsmosisStyleFrontmatter()).toBeUndefined();
	});

	it("has no theme for Default or none", () => {
		expect(note().styles.getActiveTheme()).toBeUndefined();
		expect(note({ "osmosis-styles": { theme: "Default" } }).styles.getActiveTheme()).toBeUndefined();
	});

	it("writes variants to the note", async () => {
		const { styles, state } = note();
		await styles.createVariant("Regatta");
		expect(styles.getOsmosisStyleFrontmatter()).toMatchObject({ activeVariant: "Regatta", variants: { Regatta: {} } });
		await styles.renameVariant("Regatta", "Race");
		await styles.setActiveVariant(undefined);
		expect(state.fm).toEqual({ "osmosis-styles": { variants: { Race: {} } } });
		await styles.deleteVariant("Race");
		expect(state.fm).toEqual({});
		expect(styles.getOsmosisStyleFrontmatter()).toBeUndefined();
	});
});

describe("variant writes", () => {
	it("set and clear the active variant", () => {
		const fm: Record<string, unknown> = {};
		setActiveVariantIn(fm, "Galley");
		expect(fm).toEqual({ "osmosis-styles": { activeVariant: "Galley" } });
		setActiveVariantIn(fm, undefined);
		expect(fm).toEqual({});
	});

	it("rename keeps the variant's styles and its active mark", () => {
		const fm: Record<string, unknown> = { "osmosis-styles": { activeVariant: "a", variants: { a: { "^x": { fill: "red" } } } } };
		renameVariantIn(fm, "a", "b");
		expect(fm).toEqual({ "osmosis-styles": { activeVariant: "b", variants: { b: { "^x": { fill: "red" } } } } });
		renameVariantIn(fm, "missing", "c");
		expect(fm).toEqual({ "osmosis-styles": { activeVariant: "b", variants: { b: { "^x": { fill: "red" } } } } });
	});

	it("delete leaves other variants and styles alone", () => {
		const fm: Record<string, unknown> = { "osmosis-styles": { background: "#fff", activeVariant: "a", variants: { a: {}, b: {} } } };
		deleteVariantIn(fm, "a");
		expect(fm).toEqual({ "osmosis-styles": { background: "#fff", variants: { b: {} } } });
		createVariantIn(fm, "c");
		expect(fm).toEqual({ "osmosis-styles": { background: "#fff", activeVariant: "c", variants: { b: {}, c: {} } } });
	});
});
