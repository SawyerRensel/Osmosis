import { describe, expect, it } from "vitest";
import { CODE_FIT_MAX_COLUMNS, codeFitColumns, codeFitLimitPx, lineColumns, longestCodeColumns } from "./code-fit";

const block = (...lines: string[]): string => ["```ts", ...lines, "```"].join("\n");

describe("longestCodeColumns", () => {
	it("measures the longest line, not the fences", () => {
		expect(longestCodeColumns(block("a".repeat(40), "b".repeat(80), "c"))).toBe(80);
	});
	it("handles an empty block and a one-line block", () => {
		expect(longestCodeColumns("```\n```")).toBe(0);
		expect(longestCodeColumns(block("x = 1"))).toBe(5);
	});
	it("accepts the inside of a block, and an unclosed one", () => {
		expect(longestCodeColumns("abc\nabcdef")).toBe(6);
		expect(longestCodeColumns("```ts\nabcd")).toBe(4);
	});
	it("counts wide characters as two columns", () => {
		expect(lineColumns("日本語")).toBe(6);
		expect(lineColumns("a😀")).toBe(3);
	});
});

describe("codeFitColumns", () => {
	it("caps at the named constant", () => {
		expect(CODE_FIT_MAX_COLUMNS).toBe(100);
		expect(codeFitColumns(block("a".repeat(140)))).toBe(100);
		expect(codeFitColumns(block("a".repeat(80)))).toBe(80);
	});
});

describe("codeFitLimitPx", () => {
	it("never limits a block within the cap", () => {
		expect(codeFitLimitPx(600, block("a".repeat(90)), 32)).toBe(Infinity);
	});
	it("scales a longer block down to the cap's columns", () => {
		// 140 columns at 5 px each, plus 32 px of padding.
		expect(codeFitLimitPx(140 * 5 + 32, block("a".repeat(140)), 32)).toBeCloseTo(100 * 5 + 32);
	});
});
