import { describe, it, expect } from "vitest";
import { hasHeading, headingMatches, headingOfLine, headingRenameNotice, lineAt, rewriteHeadingLinks } from "./heading-links";

/** Links to "Rigging" (by name or path) and same-note links resolve to the renamed note. */
const isRigging = (path: string): boolean => path === "" || path === "Rigging" || path === "Rigging.md" || path === "boats/Rigging.md";
const rename = (text: string, from = "Old Mast", to = "New Mast"): { text: string; count: number } => rewriteHeadingLinks(text, from, to, isRigging);

describe("rewriteHeadingLinks", () => {
	it("rewrites plain, aliased, same-note and embed links, keeping aliases", () => {
		const text = "See [[Rigging#Old Mast]], [[Rigging#Old Mast|the mast]], [[#Old Mast]] and\n![[Rigging#Old Mast]]\n";
		expect(rename(text)).toEqual({ text: "See [[Rigging#New Mast]], [[Rigging#New Mast|the mast]], [[#New Mast]] and\n![[Rigging#New Mast]]\n", count: 4 });
	});

	it("matches the heading ignoring case, spacing and punctuation, as Obsidian does", () => {
		expect(rename("[[Rigging#old  mast]] [[boats/Rigging.md#OLD MAST]]").text).toBe("[[Rigging#New Mast]] [[boats/Rigging.md#New Mast]]");
		expect(rename("[[Rigging#Mast  Step]]", "Mast: Step", "Step").text).toBe("[[Rigging#Step]]");
	});

	it("rewrites only the last segment of a nested heading link", () => {
		expect(rename("[[Rigging#Spars#Old Mast|m]]").text).toBe("[[Rigging#Spars#New Mast|m]]");
		expect(rename("[[Rigging#Old Mast#Boom]]").count).toBe(0);
	});

	it("leaves links to the same heading in another note, other headings and block references alone", () => {
		const text = "[[Galley#Old Mast]] [[Rigging#Old Boom]] [[Rigging#^oldmast]] [[Rigging]] [[Rigging|Old Mast]]";
		expect(rename(text)).toEqual({ text, count: 0 });
		expect(rewriteHeadingLinks("[[Rigging#^abc]]", "abc", "x", isRigging).count).toBe(0);
	});

	it("leaves links in code fences, inline code and comments alone", () => {
		const text = "```\n[[Rigging#Old Mast]]\n```\n\t~~~md\n\t[[#Old Mast]]\n\t~~~\n`[[#Old Mast]]` ``a ` [[#Old Mast]]`` %% [[#Old Mast]] %%\n[[#Old Mast]]\n";
		const out = rename(text);
		expect(out.count).toBe(1);
		expect(out.text).toBe(text.replace(/\[\[#Old Mast\]\]\n$/, "[[#New Mast]]\n"));
	});

	it("treats an unclosed fence or comment as running to the end", () => {
		expect(rename("[[#Old Mast]]\n```\n[[#Old Mast]]\n").text).toBe("[[#New Mast]]\n```\n[[#Old Mast]]\n");
		expect(rename("[[#Old Mast]] %% [[#Old Mast]]").count).toBe(1);
	});

	it("rewrites markdown links, encoding the new heading as the link was", () => {
		const text = "[a](Rigging.md#Old%20Mast) [b](<Rigging.md#Old Mast>) [c](#Old%20Mast) ![d](Rigging.md#old%20mast)";
		expect(rename(text, "Old Mast", "Mast (main)")).toEqual({
			text: "[a](Rigging.md#Mast%20%28main%29) [b](<Rigging.md#Mast (main)>) [c](#Mast%20%28main%29) ![d](Rigging.md#Mast%20%28main%29)",
			count: 4,
		});
	});

	it("leaves external URLs and markdown links to other notes alone", () => {
		const text = "[w](https://example.com/Rigging#Old%20Mast) [g](Galley.md#Old%20Mast) [bad](Rigging.md#Old%E0Mast)";
		expect(rename(text).count).toBe(0);
	});

	it("drops characters a wikilink cannot hold from the new heading", () => {
		expect(rename("[[Rigging#Old Mast]]", "Old Mast", "Mast #2 [spare] | ^x").text).toBe("[[Rigging#Mast 2 spare x]]");
	});

	it("rewrites links in frontmatter properties too", () => {
		expect(rename('---\nsee: "[[Rigging#Old Mast]]"\n---\nBody\n').text).toBe('---\nsee: "[[Rigging#New Mast]]"\n---\nBody\n');
	});
});

describe("headingOfLine", () => {
	it("reads an ATX heading's text without its block ID", () => {
		expect(headingOfLine("## Old Mast")).toBe("Old Mast");
		expect(headingOfLine("### Old Mast ^mast")).toBe("Old Mast");
		expect(headingOfLine("#Old")).toBeNull();
		expect(headingOfLine("- Old Mast")).toBeNull();
		expect(headingOfLine("    # indented code")).toBeNull();
	});
});

describe("hasHeading", () => {
	it("finds a matching heading outside code only", () => {
		expect(hasHeading("# Rigging\n\n## Old Mast\n", "old mast")).toBe(true);
		expect(hasHeading("# Rigging\n\n```\n## Old Mast\n```\n", "Old Mast")).toBe(false);
		expect(hasHeading("# Rigging\n- Old Mast\n", "Old Mast")).toBe(false);
	});
});

describe("headingMatches", () => {
	it("ignores case, spacing and link-illegal punctuation", () => {
		expect(headingMatches("Mast: Step", "mast step")).toBe(true);
		expect(headingMatches("Mast", "Masts")).toBe(false);
	});
});

describe("lineAt", () => {
	it("returns the whole line around an offset", () => {
		expect(lineAt("a\n## Two\nc", 2)).toBe("## Two");
		expect(lineAt("a\n## Two\nc", 9)).toBe("c");
	});
});

describe("headingRenameNotice", () => {
	it("counts links and notes, singular and plural, and is null for none", () => {
		expect(headingRenameNotice(0, 0)).toBeNull();
		expect(headingRenameNotice(1, 1)).toBe("Updated 1 link in 1 note");
		expect(headingRenameNotice(3, 2)).toBe("Updated 3 links in 2 notes");
	});
});
