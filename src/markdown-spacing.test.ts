import { describe, it, expect } from "vitest";
import { normalizeBlockSpacing } from "./markdown-spacing";

describe("normalizeBlockSpacing", () => {
	it("separates a soft-wrapped prose run into blank-separated blocks", () => {
		const { content } = normalizeBlockSpacing("one\ntwo\nthree");
		expect(content).toBe("one\n\ntwo\n\nthree");
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
		// "one","two","three" → each becomes its own block (blanks at 1,3)
		const { content, lineMap } = normalizeBlockSpacing("one\ntwo\nthree");
		const lines = content.split("\n");
		expect(lines[lineMap[0]!]).toBe("one");
		expect(lines[lineMap[1]!]).toBe("two");
		expect(lines[lineMap[2]!]).toBe("three");
		expect(lineMap).toEqual([0, 2, 4]);
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
