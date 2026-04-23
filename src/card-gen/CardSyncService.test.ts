import { describe, it, expect } from "vitest";
import { injectFenceIdsIntoContent } from "./CardSyncService";
import type { GeneratedCard } from "./types";

function card(partial: Partial<GeneratedCard> & Pick<GeneratedCard, "id" | "sourceLine">): GeneratedCard {
	return {
		card_type: "explicit",
		front: "",
		back: "",
		deck: "",
		typeIn: false,
		...partial,
	};
}

describe("injectFenceIdsIntoContent", () => {
	it("injects base id into a cloze-only fence whose cards are all derived", () => {
		const content = [
			"```osmosis",
			"==Mitochondria== are the ==powerhouse== of the ==cell==.",
			"```",
		].join("\n");

		const cards = [
			card({ id: "abc12345-c1", sourceLine: 0, card_type: "explicit_cloze" }),
			card({ id: "abc12345-c2", sourceLine: 0, card_type: "explicit_cloze" }),
			card({ id: "abc12345-c3", sourceLine: 0, card_type: "explicit_cloze" }),
		];

		const result = injectFenceIdsIntoContent(content, cards);

		expect(result).toContain("id: abc12345");
		expect(result).not.toContain("id: abc12345-c1");
		const idCount = (result.match(/^id:/gm) ?? []).length;
		expect(idCount).toBe(1);
	});

	it("injects base id for a bidi fence (only -r cards exist alongside base)", () => {
		const content = [
			"```osmosis",
			"Front",
			"***",
			"Back",
			"```",
		].join("\n");

		const cards = [
			card({ id: "def67890", sourceLine: 0, card_type: "explicit_bidi" }),
			card({ id: "def67890-r", sourceLine: 0, card_type: "explicit_bidi" }),
		];

		const result = injectFenceIdsIntoContent(content, cards);

		expect(result).toContain("id: def67890");
		const idCount = (result.match(/^id:/gm) ?? []).length;
		expect(idCount).toBe(1);
	});

	it("leaves content unchanged when fence already has an id", () => {
		const content = [
			"```osmosis",
			"id: existing",
			"",
			"==Paris== is the capital.",
			"```",
		].join("\n");

		const cards = [card({ id: "existing-c1", sourceLine: 0, card_type: "explicit_cloze" })];

		const result = injectFenceIdsIntoContent(content, cards);

		expect(result).toBe(content);
	});

	it("handles nested code fences (4+ backticks) without mistaking inner ``` for close", () => {
		// An osmosis fence that contains an inner python fence, like Test.md § 10.
		// The 4-backtick osmosis fence must survive scanning past the inner 3-backtick fence.
		const content = [
			"````osmosis",
			"```python",
			"def fibonacci(n):",
			"    return n  # osmosis-cloze",
			"```",
			"````",
		].join("\n");

		const cards = [card({ id: "ghi11111-c1", sourceLine: 0, card_type: "code_cloze" })];

		const result = injectFenceIdsIntoContent(content, cards);

		expect(result).toContain("id: ghi11111");
		// id line should be right after the opening fence, before the inner python fence
		const lines = result.split("\n");
		expect(lines[0]).toBe("````osmosis");
		expect(lines[1]).toBe("id: ghi11111");
	});

	it("inserts a blank line after the id when the next line is content", () => {
		// Regression: without a blank-line separator between injected id and
		// content, downstream metadata scanners (FenceWriter, re-parse) can't
		// tell where content begins, which previously caused schedule fields
		// to be written after the content line.
		const content = [
			"```osmosis",
			"The :::mito::: is a thing.",
			"```",
		].join("\n");

		const cards = [card({ id: "xyz-c1", sourceLine: 0, card_type: "explicit_cloze" })];

		const result = injectFenceIdsIntoContent(content, cards);
		const lines = result.split("\n");

		expect(lines[0]).toBe("```osmosis");
		expect(lines[1]).toBe("id: xyz");
		expect(lines[2]).toBe("");
		expect(lines[3]).toBe("The :::mito::: is a thing.");
	});

	it("does NOT insert an extra blank line if one is already present", () => {
		const content = [
			"```osmosis",
			"",
			"The :::mito::: is a thing.",
			"```",
		].join("\n");

		const cards = [card({ id: "xyz-c1", sourceLine: 0, card_type: "explicit_cloze" })];

		const result = injectFenceIdsIntoContent(content, cards);
		const lines = result.split("\n");

		expect(lines[0]).toBe("```osmosis");
		expect(lines[1]).toBe("id: xyz");
		expect(lines[2]).toBe("");
		expect(lines[3]).toBe("The :::mito::: is a thing.");
	});

	it("does NOT insert a blank line if the next line is another metadata key", () => {
		const content = [
			"```osmosis",
			"hint: a hint",
			"",
			"Front",
			"***",
			"Back",
			"```",
		].join("\n");

		const cards = [card({ id: "xyz", sourceLine: 0 })];

		const result = injectFenceIdsIntoContent(content, cards);
		const lines = result.split("\n");

		expect(lines[0]).toBe("```osmosis");
		expect(lines[1]).toBe("id: xyz");
		expect(lines[2]).toBe("hint: a hint");
	});

	it("injects correct ids for multiple fences in one file", () => {
		const content = [
			"```osmosis",
			"==First== cloze.",
			"```",
			"",
			"Some prose.",
			"",
			"```osmosis",
			"==Second== cloze.",
			"```",
		].join("\n");

		const cards = [
			card({ id: "aaa-c1", sourceLine: 0, card_type: "explicit_cloze" }),
			card({ id: "bbb-c1", sourceLine: 6, card_type: "explicit_cloze" }),
		];

		const result = injectFenceIdsIntoContent(content, cards);
		const lines = result.split("\n");

		// First fence gets id: aaa injected at line 1
		expect(lines[0]).toBe("```osmosis");
		expect(lines[1]).toBe("id: aaa");
		// Second fence gets id: bbb — its original sourceLine was 6, shifted by +1 for the first injection
		const secondFenceIdx = lines.findIndex((l, i) => l === "```osmosis" && i > 1);
		expect(lines[secondFenceIdx + 1]).toBe("id: bbb");
	});
});
