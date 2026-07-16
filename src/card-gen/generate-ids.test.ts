import { describe, it, expect } from "vitest";
import { planIdGeneration } from "./generate-ids";

describe("planIdGeneration", () => {
	it("tags headings, bullets, ordered items, and paragraphs with trailing IDs", () => {
		const md = "## Topic\n\n- first point\n1. step one\n\nA closing paragraph";
		const plan = planIdGeneration(md);

		expect(plan.insertions).toHaveLength(4);
		expect(plan.insertions.map((i) => i.kind)).toEqual([
			"trailing", "trailing", "trailing", "trailing",
		]);
		const contentLines = plan.content.split("\n");
		expect(contentLines[0]).toMatch(/^## Topic \^os-[0-9a-z]{6}$/);
		expect(contentLines[2]).toMatch(/^- first point \^os-[0-9a-z]{6}$/);
		expect(contentLines[3]).toMatch(/^1\. step one \^os-[0-9a-z]{6}$/);
		expect(contentLines[5]).toMatch(/^A closing paragraph \^os-[0-9a-z]{6}$/);
	});

	it("skips elements that already have block IDs", () => {
		const md = "## Topic ^os-aaaaaa\n\n- tagged ^custom-id\n- untagged";
		const plan = planIdGeneration(md);

		expect(plan.insertions).toHaveLength(1);
		expect(plan.insertions[0]?.preview).toBe("untagged");
	});

	it("is idempotent — re-running on its own output plans nothing", () => {
		const md = "# A\n- b\n\nParagraph\n\n```js\ncode\n```\n\n| x |\n|---|\n| 1 |";
		const first = planIdGeneration(md);
		expect(first.insertions.length).toBeGreaterThan(0);

		const second = planIdGeneration(first.content);
		expect(second.insertions).toHaveLength(0);
		expect(second.content).toBe(first.content);
	});

	it("only tags the last line of a multi-line paragraph block", () => {
		const md = "First line of prose\ncontinues on second line\n\nSeparate block";
		const plan = planIdGeneration(md);

		expect(plan.insertions).toHaveLength(2);
		const contentLines = plan.content.split("\n");
		expect(contentLines[0]).toBe("First line of prose");
		expect(contentLines[1]).toMatch(/continues on second line \^os-/);
		expect(contentLines[3]).toMatch(/Separate block \^os-/);
	});

	it("adds a standalone after-block ID for generic code blocks", () => {
		const md = "```python\nprint('hi')\n```\n\nAfter";
		const plan = planIdGeneration(md);

		const codeInsertion = plan.insertions.find((i) => i.nodeType === "codeblock");
		expect(codeInsertion?.kind).toBe("after-block");
		expect(plan.content).toMatch(/```\n\^os-[0-9a-z]{6}\n\nAfter/);
		// Code content itself untouched
		expect(plan.content).toContain("print('hi')\n```");
	});

	it("adds a standalone after-block ID for tables", () => {
		const md = "| a | b |\n|---|---|\n| 1 | 2 |";
		const plan = planIdGeneration(md);

		expect(plan.insertions).toHaveLength(1);
		expect(plan.insertions[0]?.kind).toBe("after-block");
		expect(plan.content).toMatch(/\| 1 \| 2 \|\n\^os-[0-9a-z]{6}/);
	});

	it("adds a standalone after-block ID for blockquotes / callouts", () => {
		const md = "> [!quote] Yali's Question\n> Why did some peoples end up ahead?";
		const plan = planIdGeneration(md);

		expect(plan.insertions).toHaveLength(1);
		expect(plan.insertions[0]?.kind).toBe("after-block");
		expect(plan.insertions[0]?.nodeType).toBe("blockquote");
		// Preview strips the `>` markers and reads as prose.
		expect(plan.insertions[0]?.preview).toBe(
			"[!quote] Yali's Question Why did some peoples end up ahead?",
		);
		expect(plan.content).toMatch(/end up ahead\?\n\^os-[0-9a-z]{6}/);
	});

	it("skips a blockquote that already has an after-block ID", () => {
		const md = "> a quote\n> more\n^os-quo001";
		expect(planIdGeneration(md).insertions).toHaveLength(0);
	});

	it("skips code blocks and tables that already have an after-block ID", () => {
		const md = "```python\ncode\n```\n^os-code01\n\n| a |\n|---|\n| 1 |\n\n^os-tab001";
		const plan = planIdGeneration(md);
		expect(plan.insertions).toHaveLength(0);
	});

	it("inserts id: metadata into osmosis fences lacking one", () => {
		const md = "```osmosis\nWhat is the capital of France?\n***\nParis\n```";
		const plan = planIdGeneration(md);

		expect(plan.insertions).toHaveLength(1);
		expect(plan.insertions[0]?.kind).toBe("fence-id");
		expect(plan.content).toMatch(/^```osmosis\nid: os-[0-9a-z]{6}\nWhat is the capital/);
	});

	it("inserts id: above existing fence metadata", () => {
		const md = "```osmosis\nbidi: true\ndeck: geo\n\nParis\n***\nCapital of France\n```";
		const plan = planIdGeneration(md);

		expect(plan.insertions).toHaveLength(1);
		expect(plan.content).toMatch(/^```osmosis\nid: os-[0-9a-z]{6}\nbidi: true\ndeck: geo/);
	});

	it("skips osmosis fences that already have identity", () => {
		const withMeta = "```osmosis\nid: abc12345\nFront\n***\nBack\n```";
		expect(planIdGeneration(withMeta).insertions).toHaveLength(0);

		const withComment = "```osmosis <!--osmosis-id:abc12345-->\nFront\n***\nBack\n```";
		expect(planIdGeneration(withComment).insertions).toHaveLength(0);
	});

	it("honors osmosis-exclude comments", () => {
		const md = "<!-- osmosis-exclude -->\n## Skipped\n\n## Tagged";
		const plan = planIdGeneration(md);

		expect(plan.insertions).toHaveLength(1);
		expect(plan.insertions[0]?.preview).toBe("Tagged");
	});

	it("skips transclusion lines", () => {
		const md = "![[Other Note]]\n\n- real content";
		const plan = planIdGeneration(md);

		expect(plan.insertions).toHaveLength(1);
		expect(plan.insertions[0]?.preview).toBe("real content");
	});

	it("does not touch frontmatter", () => {
		const md = "---\nosmosis-cards: true\n---\n\n# Title";
		const plan = planIdGeneration(md);

		expect(plan.insertions).toHaveLength(1);
		expect(plan.content).toMatch(/^---\nosmosis-cards: true\n---\n\n# Title \^os-/);
	});

	it("generates unique IDs that avoid existing ones", () => {
		const md = "- a\n- b\n- c\n- d ^os-aaaaaa";
		const plan = planIdGeneration(md);

		const ids = plan.insertions.map((i) => i.id);
		expect(new Set(ids).size).toBe(3);
		expect(ids).not.toContain("os-aaaaaa");
	});

	it("reports insertions in document order with line numbers and previews", () => {
		const md = "# First\n\n- second";
		const plan = planIdGeneration(md);

		expect(plan.insertions[0]).toMatchObject({ line: 0, nodeType: "heading", preview: "First" });
		expect(plan.insertions[1]).toMatchObject({ line: 2, nodeType: "bullet", preview: "second" });
	});
});
