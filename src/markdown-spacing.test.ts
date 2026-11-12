import { describe, it, expect } from "vitest";
import { normalizeBlockSpacing } from "./markdown-spacing";

describe("normalizeBlockSpacing", () => {
	// T75: a run of adjacent lines is one node, so the normalizer keeps it.
	it("keeps a soft-wrapped prose run together (one node)", () => {
		const { content } = normalizeBlockSpacing("one\ntwo\nthree");
		expect(content).toBe("one\ntwo\nthree");
	});

	it("keeps a cover image, headings and a caption together as one run", () => {
		const md = "![[cover.png]]\n## Title\ncaption\n### Second heading\n---\nmore";
		expect(normalizeBlockSpacing(md).content).toBe(md);
	});

	it("still separates a run from lists, tables, quotes, fences and note embeds", () => {
		const md = "text\n- item\n## H\n| a |\n|---|\nafter\n> quote\nprose\n```\ncode\n```\nline\n![[Other note]]\nend";
		expect(normalizeBlockSpacing(md).content).toBe(
			"text\n\n- item\n\n## H\n\n| a |\n|---|\n\nafter\n\n> quote\n\nprose\n\n```\ncode\n```\n\nline\n\n![[Other note]]\n\nend",
		);
	});

	it("keeps a comment-only line apart from the prose it guards", () => {
		const md = "<!-- osmosis-exclude -->\nsecret\nline";
		expect(normalizeBlockSpacing(md).content).toBe("<!-- osmosis-exclude -->\n\nsecret\nline");
	});

	it("is idempotent", () => {
		const once = normalizeBlockSpacing("one\ntwo\nthree").content;
		const twice = normalizeBlockSpacing(once).content;
		expect(twice).toBe(once);
	});

	it("leaves list items and their spacing alone", () => {
		const md = "- a\n- b\n- c";
		expect(normalizeBlockSpacing(md).content).toBe(md);
	});

	it("keeps blockquote/callout lines together as one block", () => {
		const md = "> [!note] Title\n> body line";
		expect(normalizeBlockSpacing(md).content).toBe(md);
	});

	it("does not split lines inside a code fence", () => {
		const md = "```\nline one\nline two\n```";
		expect(normalizeBlockSpacing(md).content).toBe(md);
	});

	it("collapses runs of blank lines to one", () => {
		expect(normalizeBlockSpacing("a\n\n\n\nb").content).toBe("a\n\nb");
	});

	it("maps original line indices onto the normalized text", () => {
		// "one" and "two" stay a run; the note embed is spaced off (blank at 2)
		const { content, lineMap } = normalizeBlockSpacing("one\ntwo\n![[three]]");
		const lines = content.split("\n");
		expect(lines[lineMap[0]!]).toBe("one");
		expect(lines[lineMap[1]!]).toBe("two");
		expect(lines[lineMap[2]!]).toBe("![[three]]");
		expect(lineMap).toEqual([0, 1, 3]);
	});

	it("maps indices correctly around a heading and a collapsed blank run", () => {
		const md = "# H\n\n\nbody one\nbody two";
		const { content, lineMap } = normalizeBlockSpacing(md);
		const lines = content.split("\n");
		// original: 0="# H", 1="", 2="", 3="body one", 4="body two"
		expect(lines[lineMap[0]!]).toBe("# H");
		expect(lines[lineMap[3]!]).toMatch(/body one/);
		expect(lines[lineMap[4]!]).toBe("body two");
	});
});
