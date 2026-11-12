import { describe, it, expect } from "vitest";
import { groupDisplayMarkdown, isGroupableLine, isLineGroup, isMediaEmbed } from "./line-groups";
import { OsmosisParser } from "./parser";

const parser = new OsmosisParser();

describe("isGroupableLine", () => {
	it("accepts headings, prose, media embeds, rules, math and HTML", () => {
		for (const line of ["## Title", "plain text", "  indented text", "![[cover.png]]", "![alt](pic.jpg)", "---", "***", "$$", "<div>", "%% note %%", "text ^os-aaaaaa"]) {
			expect(isGroupableLine(line), line).toBe(true);
		}
	});

	it("rejects every breaker", () => {
		for (const line of ["", "   ", "- item", "\t* item", "1. step", "- [ ] task", "| a |", "> quote", "> [!note] Callout", "```js", "~~~", "![[Other note]]", "![](other.md)", "^os-aaaaaa", "<!-- osmosis-exclude -->"]) {
			expect(isGroupableLine(line), JSON.stringify(line)).toBe(false);
		}
	});
});

describe("isMediaEmbed", () => {
	it("recognises media, sized images and excalidraw, not notes", () => {
		expect(isMediaEmbed("a.PNG|300")).toBe(true);
		expect(isMediaEmbed("doc.pdf#page=2")).toBe(true);
		expect(isMediaEmbed("drawing.excalidraw.md")).toBe(true);
		expect(isMediaEmbed("Note")).toBe(false);
		expect(isMediaEmbed("Note.md")).toBe(false);
	});
});

describe("groupDisplayMarkdown", () => {
	it("draws a cover above the title and a caption below it", () => {
		const node = parser.parse("![[cover.png]]\n## Title ^os-aaaaaa\ncaption\n### Later heading ^os-bbbbbb", "N.md").root.children[0]!;
		expect(isLineGroup(node)).toBe(true);
		expect(groupDisplayMarkdown(node)).toBe("![[cover.png]]\n\nTitle\n\ncaption\n### Later heading");
	});

	it("is the content for a paragraph group and a single line", () => {
		const root = parser.parse("one\ntwo\n\n## Solo", "N.md").root;
		expect(groupDisplayMarkdown(root.children[0]!)).toBe("one\ntwo");
		expect(isLineGroup(root.children[1]!)).toBe(false);
		expect(groupDisplayMarkdown(root.children[1]!)).toBe("Solo");
	});
});
