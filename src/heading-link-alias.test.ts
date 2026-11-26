import { describe, it, expect } from "vitest";
/* eslint-disable-next-line import/no-extraneous-dependencies -- CodeMirror 6 is provided by Obsidian at runtime; the tests resolve the dev copy. */
import { EditorSelection, EditorState } from "@codemirror/state";
import { aliasHeadingLink, headingLinkAliasFilter } from "./heading-link-alias";

/** Headings of "Galley" (and of the note itself, linkpath ""), as Obsidian caches them. */
const galley = ["Prep", "`defer` ^os-8vmwam", "Step 1: sear ^os-ab12cd", "Notes os-zz9999", "Stock ^my-id"];
const headingsOf = (linkpath: string): readonly string[] | null => (linkpath === "" || linkpath === "Galley" ? galley : null);

describe("aliasHeadingLink", () => {
	it("aliases a same-note heading link with the heading text minus its id", () => {
		expect(aliasHeadingLink("[[#`defer` os-8vmwam]]", headingsOf)).toEqual({
			text: "[[#`defer` os-8vmwam|`defer`]]",
			aliasFrom: 21,
			aliasTo: 28,
		});
	});

	it("keeps the characters the subpath dropped, from the cached heading", () => {
		expect(aliasHeadingLink("[[Galley#Step 1 sear os-ab12cd]]", headingsOf)?.text).toBe("[[Galley#Step 1 sear os-ab12cd|Step 1: sear]]");
	});

	it("aliases only the last segment of a nested link", () => {
		expect(aliasHeadingLink("[[Galley#Prep#Step 1 sear os-ab12cd]]", headingsOf)?.text).toBe("[[Galley#Prep#Step 1 sear os-ab12cd|Step 1: sear]]");
	});

	it("falls back to the subpath minus its id when the heading is not found", () => {
		expect(aliasHeadingLink("[[Cabin#Bunks os-qq1234]]", headingsOf)?.text).toBe("[[Cabin#Bunks os-qq1234|Bunks]]");
	});

	it("leaves headings without an Osmosis id, block links, aliased links and file links alone", () => {
		for (const link of [
			"[[#Prep]]",
			"[[#Notes os-zz9999]]",
			"[[#Stock my-id]]",
			"[[#^os-8vmwam]]",
			"[[Galley#^os-8vmwam]]",
			"[[#`defer` os-8vmwam|later]]",
			"[[#`defer` os-8vmwam#]]",
			"[[Galley]]",
			"[[Galley os-8vmwam]]",
			"[`defer` ^os-8vmwam](#`defer`%20os-8vmwam)",
		]) {
			expect(aliasHeadingLink(link, headingsOf), link).toBeNull();
		}
	});

	it("gives no alias that would break the link", () => {
		expect(aliasHeadingLink("[[Cabin#see x os-qq1234]]", () => ["see [x] ^os-qq1234"])).toBeNull();
	});
});

describe("headingLinkAliasFilter", () => {
	const make = (doc: string, cursor: number): EditorState =>
		EditorState.create({ doc, selection: EditorSelection.cursor(cursor), extensions: headingLinkAliasFilter((_state, path) => headingsOf(path)) });

	/** What Obsidian's suggest dispatches: replace `[[query` (plus a closing `]]`) with the link, cursor at `cursorAt` within it. */
	const pick = (state: EditorState, from: number, to: number, link: string, cursorAt: number, userEvent = "input.autocomplete"): EditorState =>
		state.update({ changes: { from, to, insert: link }, selection: EditorSelection.cursor(from + cursorAt), userEvent }).state;

	it("aliases the picked link and leaves the cursor after ]]", () => {
		const link = "[[#`defer` os-8vmwam]]";
		const state = pick(make("Do it [[#def]] now", 12), 6, 14, link, link.length);
		expect(state.doc.toString()).toBe("Do it [[#`defer` os-8vmwam|`defer`]] now");
		expect(state.selection.main.head).toBe(6 + "[[#`defer` os-8vmwam|`defer`]]".length);
	});

	it("selects the alias when the pick (Tab) leaves the cursor before ]]", () => {
		const link = "[[#`defer` os-8vmwam]]";
		const state = pick(make("[[#def", 6), 0, 6, link, link.length - 2);
		expect(state.doc.toString()).toBe("[[#`defer` os-8vmwam|`defer`]]");
		expect(state.sliceDoc(state.selection.main.from, state.selection.main.to)).toBe("`defer`");
	});

	it("keeps the pick and its alias one undoable change", () => {
		const link = "[[#`defer` os-8vmwam]]";
		const tr = make("[[#def", 6).update({ changes: { from: 0, to: 6, insert: link }, userEvent: "input.autocomplete" });
		expect(tr.state.doc.toString()).toBe("[[#`defer` os-8vmwam|`defer`]]");
		expect(tr.isUserEvent("input.autocomplete")).toBe(true);
	});

	it("leaves typed text, embeds and other insertions alone", () => {
		const link = "[[#`defer` os-8vmwam]]";
		expect(pick(make("", 0), 0, 0, link, link.length, "input.type").doc.toString()).toBe(link);
		expect(pick(make("![[#def", 7), 1, 7, link, link.length).doc.toString()).toBe(`!${link}`);
		expect(pick(make("[[#Pr", 5), 0, 5, "[[#Prep]]", 9).doc.toString()).toBe("[[#Prep]]");
	});
});
