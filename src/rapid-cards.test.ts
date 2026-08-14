import { describe, it, expect } from "vitest";
import { planRapidCard } from "./rapid-cards";

/** Build the document a commit keystroke sees, and the cursor line it fires on. */
function atCommit(...lines: string[]): { lines: string[]; cursor: number } {
	return { lines, cursor: lines.length - 1 };
}

describe("planRapidCard", () => {
	it("commits a single-line front and back", () => {
		const { lines, cursor } = atCommit("Capital of Portugal", "", "Lisbon", "", "");
		const edit = planRapidCard(lines, cursor);

		expect(edit).not.toBeNull();
		expect(edit?.fromLine).toBe(0);
		expect(edit?.toLine).toBe(4);
		expect(edit?.text).toBe(
			["```osmosis", "Capital of Portugal", "***", "Lisbon", "```", "", ""].join("\n"),
		);
	});

	it("commits multi-line fronts and backs", () => {
		const { lines, cursor } = atCommit(
			"HTTP 429",
			"What does the server want?",
			"",
			"Too Many Requests",
			"Back off and retry later",
			"",
			"",
		);
		const edit = planRapidCard(lines, cursor);

		expect(edit?.text).toBe(
			[
				"```osmosis",
				"HTTP 429",
				"What does the server want?",
				"***",
				"Too Many Requests",
				"Back off and retry later",
				"```",
				"",
				"",
			].join("\n"),
		);
	});

	it("leaves the cursor on an empty line past the fence's trailing blank", () => {
		const { lines, cursor } = atCommit("Front", "", "Back", "", "");
		const edit = planRapidCard(lines, cursor);
		const textLines = edit?.text.split("\n") ?? [];

		expect(edit?.cursorLine).toBe(textLines.length - 1);
		expect(textLines[edit?.cursorLine ?? -1]).toBe("");
		// The blank before it is what separates this fence from the next card.
		expect(textLines[(edit?.cursorLine ?? 0) - 1]).toBe("");
	});

	it("captures list markers literally", () => {
		const { lines, cursor } = atCommit("- Ordered vs unordered", "", "- ol", "- ul", "", "");
		const edit = planRapidCard(lines, cursor);

		expect(edit?.text).toBe(
			["```osmosis", "- Ordered vs unordered", "***", "- ol", "- ul", "```", "", ""].join("\n"),
		);
	});

	it("absorbs prose typed directly above the front, having no blank to stop at", () => {
		const lines = ["Some earlier prose", "Front", "", "Back", "", ""];
		const edit = planRapidCard(lines, 5);

		expect(edit?.fromLine).toBe(0);
		expect(edit?.text).toBe(
			["```osmosis", "Some earlier prose", "Front", "***", "Back", "```", "", ""].join("\n"),
		);
	});

	it("adds no blank line when the front already follows one", () => {
		const lines = ["Some earlier prose", "", "Front", "", "Back", "", ""];
		const edit = planRapidCard(lines, 6);

		expect(edit?.fromLine).toBe(2);
		expect(edit?.text.split("\n")[0]).toBe("```osmosis");
	});

	it("replaces only the captured range, leaving earlier lines alone", () => {
		const lines = ["# Notes", "", "Front", "", "Back", "", ""];
		const edit = planRapidCard(lines, 6);

		expect(edit?.fromLine).toBe(2);
		expect(edit?.toLine).toBe(6);
	});

	describe("falls through to a plain Enter", () => {
		it("on the boundary double-Enter, with only one blank above", () => {
			const { lines, cursor } = atCommit("Front", "", "");
			expect(planRapidCard(lines, cursor)).toBeNull();
		});

		it("when the cursor line has text on it", () => {
			const lines = ["Front", "", "Back"];
			expect(planRapidCard(lines, 2)).toBeNull();
		});

		it("when the line above the cursor has text on it", () => {
			const { lines, cursor } = atCommit("Front", "", "Back", "");
			expect(planRapidCard(lines, cursor)).toBeNull();
		});

		it("when there is a back block but no front above it", () => {
			const { lines, cursor } = atCommit("Back only", "", "");
			expect(planRapidCard(lines, cursor)).toBeNull();
		});

		it("when two blank lines separate the two blocks", () => {
			const { lines, cursor } = atCommit("Front", "", "", "Back", "", "");
			expect(planRapidCard(lines, cursor)).toBeNull();
		});

		it("at the very top of an empty note", () => {
			expect(planRapidCard(["", ""], 1)).toBeNull();
			expect(planRapidCard([""], 0)).toBeNull();
		});

		it("inside an unclosed code fence", () => {
			const { lines, cursor } = atCommit("```js", "const a = 1;", "", "const b = 2;", "", "");
			expect(planRapidCard(lines, cursor)).toBeNull();
		});
	});

	describe("code blocks", () => {
		it("captures a fenced block as the back, widening the card fence", () => {
			const { lines, cursor } = atCommit(
				'How to print "meow" in Python?',
				"",
				"```python",
				'print("meow")',
				"```",
				"",
				"",
			);
			const edit = planRapidCard(lines, cursor);

			expect(edit?.text).toBe(
				[
					"````osmosis",
					'How to print "meow" in Python?',
					"***",
					"```python",
					'print("meow")',
					"```",
					"````",
					"",
					"",
				].join("\n"),
			);
		});

		it("captures a fenced block as the front", () => {
			const { lines, cursor } = atCommit("```python", 'print("meow")', "```", "", "meow", "", "");
			const edit = planRapidCard(lines, cursor);

			expect(edit?.fromLine).toBe(0);
			expect(edit?.text).toBe(
				[
					"````osmosis",
					"```python",
					'print("meow")',
					"```",
					"***",
					"meow",
					"````",
					"",
					"",
				].join("\n"),
			);
		});

		it("widens again for a code block nested inside a code block", () => {
			const { lines, cursor } = atCommit(
				"How do you show a fence in Markdown?",
				"",
				"````markdown",
				"```js",
				"const a = 1;",
				"```",
				"````",
				"",
				"",
			);
			const edit = planRapidCard(lines, cursor);

			expect(edit?.text.split("\n")[0]).toBe("`````osmosis");
			expect(edit?.text.split("\n").at(-3)).toBe("`````");
		});

		it("treats a blank line inside a fence as code, not a boundary", () => {
			const { lines, cursor } = atCommit(
				"Two statements",
				"",
				"```python",
				"a = 1",
				"",
				"b = 2",
				"```",
				"",
				"",
			);
			const edit = planRapidCard(lines, cursor);

			expect(edit?.fromLine).toBe(0);
			expect(edit?.text).toBe(
				[
					"````osmosis",
					"Two statements",
					"***",
					"```python",
					"a = 1",
					"",
					"b = 2",
					"```",
					"````",
					"",
					"",
				].join("\n"),
			);
		});

		it("does not widen for inline code at the start of a line", () => {
			const { lines, cursor } = atCommit("`useState` returns what?", "", "A pair", "", "");
			const edit = planRapidCard(lines, cursor);

			expect(edit?.text.split("\n")[0]).toBe("```osmosis");
		});
	});

	it("stops at the closing fence of a card written moments earlier", () => {
		const lines = ["```osmosis", "Old front", "***", "Old back", "```", "Front", "", "Back", "", ""];
		const edit = planRapidCard(lines, 9);

		// The front starts below the closing ``` — never swallowing it — and
		// gets the blank line the abutting fence denied it.
		expect(edit?.fromLine).toBe(5);
		expect(edit?.text).toBe(
			["", "```osmosis", "Front", "***", "Back", "```", "", ""].join("\n"),
		);
	});
});
