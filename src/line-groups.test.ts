import { describe, it, expect } from "vitest";
import { groupDisplayMarkdown, isGroupableLine, isLineGroup, isMediaEmbed, separateRuns } from "./line-groups";
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

describe("separateRuns", () => {
	it("puts a blank line at a seam between two groupable lines", () => {
		const text = "Intro.\n## Fuel\n- Diesel";
		const out = separateRuns(text, [7]);
		expect(out.text).toBe("Intro.\n\n## Fuel\n- Diesel");
		expect(out.at(7)).toBe(8);
		expect(out.at(3)).toBe(3);
	});

	it("leaves a seam next to a breaker, a blank line or mid-line alone", () => {
		const text = "- item\n## A\n\n## B\npara";
		expect(separateRuns(text, [7, 13, 3, 0, text.length]).text).toBe(text);
	});

	it("does not separate an indented line (a blank would end its list)", () => {
		const text = "- a\n\tp1\n\tp2";
		expect(separateRuns(text, [8]).text).toBe(text);
	});

	it("handles several seams, mapping offsets past each", () => {
		const text = "A\nB\nC";
		const out = separateRuns(text, [4, 2, 2]);
		expect(out.text).toBe("A\n\nB\n\nC");
		expect(out.at(4)).toBe(6);
	});
});
