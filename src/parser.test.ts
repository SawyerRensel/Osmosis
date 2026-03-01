import { describe, it, expect } from "vitest";
import { OsmosisParser } from "./parser";

const parser = new OsmosisParser();

describe("OsmosisParser", () => {
	describe("headings", () => {
		it("parses a single heading", () => {
			const tree = parser.parse("# Hello", "test.md");
			expect(tree.root.children).toHaveLength(1);
			expect(tree.root.children[0]?.type).toBe("heading");
			expect(tree.root.children[0]?.depth).toBe(1);
			expect(tree.root.children[0]?.content).toBe("Hello");
		});

		it("parses heading levels 1 through 6", () => {
			const md = "# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6";
			const tree = parser.parse(md, "test.md");
			// H1 > H2 > H3 > H4 > H5 > H6 (nested hierarchy)
			expect(tree.root.children).toHaveLength(1);
			const h1 = tree.root.children[0];
			expect(h1?.content).toBe("H1");
			expect(h1?.children[0]?.content).toBe("H2");
			expect(h1?.children[0]?.children[0]?.content).toBe("H3");
		});

		it("creates sibling headings at the same level", () => {
			const md = "## A\n## B\n## C";
			const tree = parser.parse(md, "test.md");
			expect(tree.root.children).toHaveLength(3);
			expect(tree.root.children[0]?.content).toBe("A");
			expect(tree.root.children[1]?.content).toBe("B");
			expect(tree.root.children[2]?.content).toBe("C");
		});

		it("handles heading hierarchy with back-tracking", () => {
			const md = "# H1\n## H2\n### H3\n## H2b\n# H1b";
			const tree = parser.parse(md, "test.md");
			expect(tree.root.children).toHaveLength(2); // H1, H1b
			const h1 = tree.root.children[0];
			expect(h1?.children).toHaveLength(2); // H2, H2b
			expect(h1?.children[0]?.children[0]?.content).toBe("H3");
			expect(tree.root.children[1]?.content).toBe("H1b");
		});
	});

	describe("bullet lists", () => {
		it("parses bullet items with dash", () => {
			const md = "- Item 1\n- Item 2";
			const tree = parser.parse(md, "test.md");
			expect(tree.root.children).toHaveLength(2);
			expect(tree.root.children[0]?.type).toBe("bullet");
			expect(tree.root.children[0]?.content).toBe("Item 1");
		});

		it("parses bullet items with asterisk", () => {
			const md = "* Item 1\n* Item 2";
			const tree = parser.parse(md, "test.md");
			expect(tree.root.children).toHaveLength(2);
			expect(tree.root.children[0]?.type).toBe("bullet");
		});

		it("handles nested bullet lists", () => {
			const md = "- Parent\n  - Child\n    - Grandchild";
			const tree = parser.parse(md, "test.md");
			expect(tree.root.children).toHaveLength(1);
			const parent = tree.root.children[0];
			expect(parent?.children).toHaveLength(1);
			expect(parent?.children[0]?.content).toBe("Child");
			expect(parent?.children[0]?.children[0]?.content).toBe("Grandchild");
		});
	});

	describe("ordered lists", () => {
		it("parses numbered list items", () => {
			const md = "1. First\n2. Second\n3. Third";
			const tree = parser.parse(md, "test.md");
			expect(tree.root.children).toHaveLength(3);
			expect(tree.root.children[0]?.type).toBe("ordered");
			expect(tree.root.children[0]?.content).toBe("First");
		});

		it("handles nested ordered lists", () => {
			const md = "1. Parent\n  1. Child";
			const tree = parser.parse(md, "test.md");
			expect(tree.root.children).toHaveLength(1);
			expect(tree.root.children[0]?.children[0]?.content).toBe("Child");
		});
	});

	describe("paragraphs", () => {
		it("parses plain text as paragraphs", () => {
			const md = "Hello world";
			const tree = parser.parse(md, "test.md");
			expect(tree.root.children).toHaveLength(1);
			expect(tree.root.children[0]?.type).toBe("paragraph");
			expect(tree.root.children[0]?.content).toBe("Hello world");
		});

		it("paragraphs under headings become children", () => {
			const md = "# Title\nSome text";
			const tree = parser.parse(md, "test.md");
			const h1 = tree.root.children[0];
			expect(h1?.children).toHaveLength(1);
			expect(h1?.children[0]?.type).toBe("paragraph");
			expect(h1?.children[0]?.content).toBe("Some text");
		});
	});

	describe("transclusion links", () => {
		it("detects wikilink transclusions ![[note]]", () => {
			const md = "![[my-note]]";
			const tree = parser.parse(md, "test.md");
			expect(tree.root.children).toHaveLength(1);
			expect(tree.root.children[0]?.type).toBe("transclusion");
			expect(tree.root.children[0]?.content).toBe("my-note");
		});

		it("detects markdown transclusions ![](path)", () => {
			const md = "![alt text](path/to/note.md)";
			const tree = parser.parse(md, "test.md");
			expect(tree.root.children).toHaveLength(1);
			expect(tree.root.children[0]?.type).toBe("transclusion");
			expect(tree.root.children[0]?.content).toBe("path/to/note.md");
		});

		it("handles transclusion under a heading", () => {
			const md = "# Section\n![[embedded]]";
			const tree = parser.parse(md, "test.md");
			const h1 = tree.root.children[0];
			expect(h1?.children).toHaveLength(1);
			expect(h1?.children[0]?.type).toBe("transclusion");
		});
	});

	describe("blank lines", () => {
		it("skips blank lines", () => {
			const md = "# Title\n\n- Item\n\nParagraph";
			const tree = parser.parse(md, "test.md");
			const h1 = tree.root.children[0];
			expect(h1?.children).toHaveLength(2); // Item + Paragraph
		});
	});

	describe("mixed content", () => {
		it("handles headings with lists and paragraphs", () => {
			const md = [
				"# Chapter 1",
				"Introduction text",
				"- Point A",
				"- Point B",
				"  - Sub-point",
				"## Section 1.1",
				"More text",
				"1. Step one",
				"2. Step two",
				"# Chapter 2",
				"![[reference]]",
			].join("\n");

			const tree = parser.parse(md, "test.md");
			expect(tree.root.children).toHaveLength(2); // Chapter 1, Chapter 2

			const ch1 = tree.root.children[0];
			expect(ch1?.content).toBe("Chapter 1");
			// Children: paragraph, bullet, bullet, section 1.1
			expect(ch1?.children).toHaveLength(4);
			expect(ch1?.children[0]?.type).toBe("paragraph");
			expect(ch1?.children[1]?.type).toBe("bullet");
			expect(ch1?.children[2]?.type).toBe("bullet");
			expect(ch1?.children[2]?.children[0]?.content).toBe("Sub-point");
			expect(ch1?.children[3]?.type).toBe("heading");
			expect(ch1?.children[3]?.content).toBe("Section 1.1");

			const ch2 = tree.root.children[1];
			expect(ch2?.content).toBe("Chapter 2");
			expect(ch2?.children[0]?.type).toBe("transclusion");
		});
	});

	describe("range tracking", () => {
		it("tracks character positions for each node", () => {
			const md = "# Title\nSome text";
			const tree = parser.parse(md, "test.md");
			const h1 = tree.root.children[0];
			expect(h1?.range).toEqual({ start: 0, end: 7 });
			expect(h1?.children[0]?.range).toEqual({ start: 8, end: 17 });
		});

		it("root node spans the entire document", () => {
			const md = "Hello\nWorld";
			const tree = parser.parse(md, "test.md");
			expect(tree.root.range).toEqual({ start: 0, end: md.length });
		});
	});

	describe("content hash", () => {
		it("produces consistent hashes for same content", () => {
			const t1 = parser.parse("# Test", "a.md");
			const t2 = parser.parse("# Test", "b.md");
			expect(t1.contentHash).toBe(t2.contentHash);
		});

		it("produces different hashes for different content", () => {
			const t1 = parser.parse("# Test", "test.md");
			const t2 = parser.parse("# Other", "test.md");
			expect(t1.contentHash).not.toBe(t2.contentHash);
		});
	});

	describe("edge cases", () => {
		it("handles empty string", () => {
			const tree = parser.parse("", "test.md");
			expect(tree.root.children).toHaveLength(0);
		});

		it("handles only blank lines", () => {
			const tree = parser.parse("\n\n\n", "test.md");
			expect(tree.root.children).toHaveLength(0);
		});

		it("handles heading without space after #", () => {
			// "#nospace" should be a paragraph, not a heading
			const tree = parser.parse("#nospace", "test.md");
			expect(tree.root.children[0]?.type).toBe("paragraph");
		});

		it("handles 7+ hashes as paragraph", () => {
			const tree = parser.parse("####### Not a heading", "test.md");
			expect(tree.root.children[0]?.type).toBe("paragraph");
		});
	});

	describe("incremental parse", () => {
		it("produces identical AST to full parse after single-line change", () => {
			const oldMd = "# Title\n- Item 1\n- Item 2";
			const newMd = "# Title\n- Item 1 modified\n- Item 2";

			const fullTree = parser.parse(newMd, "test.md");
			const incTree = parser.incrementalParse(oldMd, newMd, "test.md");

			expect(incTree.contentHash).toBe(fullTree.contentHash);
			expect(incTree.root.children).toHaveLength(fullTree.root.children.length);
		});

		it("produces identical AST after multi-line insert", () => {
			const oldMd = "# Title\n- Item 1";
			const newMd = "# Title\n- Item 1\n- Item 2\n- Item 3\n- Item 4";

			const fullTree = parser.parse(newMd, "test.md");
			const incTree = parser.incrementalParse(oldMd, newMd, "test.md");

			expect(incTree.contentHash).toBe(fullTree.contentHash);
		});
	});

	describe("findNodeAtPosition", () => {
		it("finds the correct node at a given position", () => {
			const md = "# Title\nSome text";
			const tree = parser.parse(md, "test.md");

			// Position 3 is within "# Title" (range 0-7)
			const node = parser.findNodeAtPosition(tree, 3);
			expect(node?.content).toBe("Title");

			// Position 10 is within "Some text" (range 8-17)
			const node2 = parser.findNodeAtPosition(tree, 10);
			expect(node2?.content).toBe("Some text");
		});

		it("returns null for position outside document", () => {
			const md = "# Title";
			const tree = parser.parse(md, "test.md");
			const node = parser.findNodeAtPosition(tree, 100);
			expect(node).toBeNull();
		});
	});

	describe("performance benchmarks", () => {
		function generateLargeMarkdown(lineCount: number): string {
			const lines: string[] = [];
			for (let i = 0; i < lineCount; i++) {
				const mod = i % 10;
				if (mod === 0) {
					lines.push(`# Section ${String(Math.floor(i / 10))}`);
				} else if (mod < 4) {
					lines.push(`- Bullet item ${String(i)} with some content here`);
				} else if (mod < 6) {
					lines.push(`  - Nested bullet ${String(i)}`);
				} else if (mod < 8) {
					lines.push(`${String(i)}. Ordered item with content`);
				} else {
					lines.push(`Paragraph text for line ${String(i)} with additional words`);
				}
			}
			return lines.join("\n");
		}

		it("parses 1,000 lines in < 20ms (after warmup)", () => {
			const md = generateLargeMarkdown(1000);

			// Warmup: let JIT optimize
			for (let i = 0; i < 5; i++) {
				parser.parse(md, "large.md");
			}

			const start = performance.now();
			parser.parse(md, "large.md");
			const elapsed = performance.now() - start;

			expect(elapsed).toBeLessThan(20);
		});

		it("incremental single-line parse in < 10ms (after warmup, PRD target: < 2ms in Obsidian)", () => {
			const md = generateLargeMarkdown(1000);
			const lines = md.split("\n");
			lines[500] = "- Modified line content here";
			const newMd = lines.join("\n");

			// Warmup
			for (let i = 0; i < 5; i++) {
				parser.incrementalParse(md, newMd, "large.md");
			}

			const start = performance.now();
			parser.incrementalParse(md, newMd, "large.md");
			const elapsed = performance.now() - start;

			expect(elapsed).toBeLessThan(10);
		});
	});
});
