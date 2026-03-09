import { describe, it, expect } from "vitest";
import { generateExplicitCards } from "./explicit";

describe("generateExplicitCards", () => {
	describe("basic unidirectional card", () => {
		it("parses a simple card", () => {
			const md = [
				"```osmosis",
				"What is the capital of France?",
				"***",
				"Paris",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(1);
			expect(cards[0]!.card_type).toBe("explicit");
			expect(cards[0]!.front).toBe("What is the capital of France?");
			expect(cards[0]!.back).toBe("Paris");
		});

		it("handles multi-line front and back", () => {
			const md = [
				"```osmosis",
				"What are the primary colors?",
				"Name all three.",
				"***",
				"Red",
				"Blue",
				"Yellow",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(1);
			expect(cards[0]!.front).toBe(
				"What are the primary colors?\nName all three.",
			);
			expect(cards[0]!.back).toBe("Red\nBlue\nYellow");
		});
	});

	describe("metadata parsing", () => {
		it("parses id metadata", () => {
			const md = [
				"```osmosis",
				"id: a3f7b2c1",
				"",
				"Front",
				"***",
				"Back",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(1);
			expect(cards[0]!.id).toBe("a3f7b2c1");
		});

		it("parses bidi metadata", () => {
			const md = [
				"```osmosis",
				"bidi: true",
				"",
				"Paris",
				"***",
				"Capital of France",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(2);
			expect(cards[0]!.card_type).toBe("explicit_bidi");
			expect(cards[0]!.front).toBe("Paris");
			expect(cards[0]!.back).toBe("Capital of France");
			expect(cards[1]!.card_type).toBe("explicit_bidi");
			expect(cards[1]!.front).toBe("Capital of France");
			expect(cards[1]!.back).toBe("Paris");
		});

		it("parses deck metadata", () => {
			const md = [
				"```osmosis",
				"deck: vocabulary/french",
				"",
				"Bonjour",
				"***",
				"Hello",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(1);
			expect(cards[0]!.deck).toBe("vocabulary/french");
		});

		it("parses hint metadata", () => {
			const md = [
				"```osmosis",
				"hint: A greeting",
				"",
				"Bonjour",
				"***",
				"Hello",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(1);
			expect(cards[0]!.front).toBe("Bonjour\n\n_Hint: A greeting_");
		});

		it("parses multiple metadata keys including id", () => {
			const md = [
				"```osmosis",
				"id: abc12345",
				"bidi: true",
				"type-in: true",
				"deck: vocabulary/french",
				"hint: A greeting",
				"",
				"Bonjour",
				"***",
				"Hello",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(2);
			expect(cards[0]!.id).toBe("abc12345");
			expect(cards[0]!.deck).toBe("vocabulary/french");
			expect(cards[0]!.front).toContain("_Hint: A greeting_");
			// Reverse card also gets hint
			expect(cards[1]!.front).toContain("_Hint: A greeting_");
			// Both bidi cards get typeIn
			expect(cards[0]!.typeIn).toBe(true);
			expect(cards[1]!.typeIn).toBe(true);
		});

		it("sets typeIn false when not specified", () => {
			const md = [
				"```osmosis",
				"",
				"Q",
				"***",
				"A",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards[0]!.typeIn).toBe(false);
		});

		it("sets typeIn true from metadata", () => {
			const md = [
				"```osmosis",
				"type-in: true",
				"",
				"Spell the capital of France",
				"***",
				"Paris",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(1);
			expect(cards[0]!.typeIn).toBe(true);
			expect(cards[0]!.card_type).toBe("explicit");
		});

		it("works without metadata (no blank line needed)", () => {
			const md = [
				"```osmosis",
				"Front content",
				"***",
				"Back content",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(1);
			expect(cards[0]!.front).toBe("Front content");
		});
	});

	describe("card identity", () => {
		it("uses id: metadata as primary source", () => {
			const md = [
				"```osmosis",
				"id: meta1234",
				"",
				"Front",
				"***",
				"Back",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards[0]!.id).toBe("meta1234");
		});

		it("falls back to osmosis-id comment on fence line (backward compat)", () => {
			const md = [
				"```osmosis <!--osmosis-id:abc12345-->",
				"Front",
				"***",
				"Back",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards[0]!.id).toBe("abc12345");
		});

		it("id: metadata takes priority over osmosis-id comment", () => {
			const md = [
				"```osmosis <!--osmosis-id:old11111-->",
				"id: new22222",
				"",
				"Front",
				"***",
				"Back",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards[0]!.id).toBe("new22222");
		});

		it("generates new ID when none exists", () => {
			const md = [
				"```osmosis",
				"Front",
				"***",
				"Back",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards[0]!.id).toMatch(/^[a-f0-9]{8}$/);
		});
	});

	describe("bidi reverse ID", () => {
		it("derives reverse ID as {id}-r", () => {
			const md = [
				"```osmosis",
				"id: abc12345",
				"bidi: true",
				"",
				"Paris",
				"***",
				"Capital of France",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(2);
			expect(cards[0]!.id).toBe("abc12345");
			expect(cards[1]!.id).toBe("abc12345-r");
		});
	});

	describe("cloze cards", () => {
		it("generates cloze cards from ==term== without separator", () => {
			const md = [
				"```osmosis",
				"id: b8cb51f9",
				"",
				"==Bonjour== means ==hello== in ==French==",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(3);

			// All are explicit_cloze type
			for (const card of cards) {
				expect(card.card_type).toBe("explicit_cloze");
			}

			// Derived IDs
			expect(cards[0]!.id).toBe("b8cb51f9-c1");
			expect(cards[1]!.id).toBe("b8cb51f9-c2");
			expect(cards[2]!.id).toBe("b8cb51f9-c3");

			// Fronts have one term blanked each
			expect(cards[0]!.front).toBe("[...] means ==hello== in ==French==");
			expect(cards[1]!.front).toBe("==Bonjour== means [...] in ==French==");
			expect(cards[2]!.front).toBe("==Bonjour== means ==hello== in [...]");

			// All backs show full text
			for (const card of cards) {
				expect(card.back).toBe("==Bonjour== means ==hello== in ==French==");
			}
		});

		it("generates single cloze card for one ==term==", () => {
			const md = [
				"```osmosis",
				"The ==mitochondria== is the powerhouse of the cell.",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(1);
			expect(cards[0]!.card_type).toBe("explicit_cloze");
			expect(cards[0]!.front).toBe("The [...] is the powerhouse of the cell.");
			expect(cards[0]!.back).toBe("The ==mitochondria== is the powerhouse of the cell.");
		});

		it("applies hint to cloze cards", () => {
			const md = [
				"```osmosis",
				"hint: Biology term",
				"",
				"The ==mitochondria== is important.",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards[0]!.front).toContain("_Hint: Biology term_");
		});

		it("cloze cards inherit deck metadata", () => {
			const md = [
				"```osmosis",
				"deck: biology",
				"",
				"The ==mitochondria== is important.",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards[0]!.deck).toBe("biology");
		});

		it("generates cloze cards from **bold** without separator", () => {
			const md = [
				"```osmosis",
				"id: bold001",
				"",
				"**Bonjour** means **hello**",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(2);
			expect(cards[0]!.card_type).toBe("explicit_cloze");
			expect(cards[0]!.id).toBe("bold001-c1");
			expect(cards[1]!.id).toBe("bold001-c2");

			expect(cards[0]!.front).toBe("[...] means **hello**");
			expect(cards[1]!.front).toBe("**Bonjour** means [...]");

			for (const card of cards) {
				expect(card.back).toBe("**Bonjour** means **hello**");
			}
		});

		it("generates cloze cards from mixed ==highlight== and **bold**", () => {
			const md = [
				"```osmosis",
				"id: mixed01",
				"",
				"==Bonjour== means **hello** in ==French==",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(3);

			expect(cards[0]!.front).toBe("[...] means **hello** in ==French==");
			expect(cards[1]!.front).toBe("==Bonjour== means [...] in ==French==");
			expect(cards[2]!.front).toBe("==Bonjour== means **hello** in [...]");
		});

		it("skips fence without separator and without cloze", () => {
			const md = [
				"```osmosis",
				"No separator and no cloze here",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(0);
		});

		it("skips empty fence without separator", () => {
			const md = [
				"```osmosis",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(0);
		});
	});

	describe("code cloze cards", () => {
		it("generates a single-line code cloze card", () => {
			const md = [
				"````osmosis",
				"id: code001",
				"",
				"```python",
				"def fibonacci(n):",
				"    if n <= 1:",
				"        return n  # osmosis-cloze",
				"    return fibonacci(n-1) + fibonacci(n-2)",
				"```",
				"````",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(1);
			expect(cards[0]!.card_type).toBe("code_cloze");
			expect(cards[0]!.id).toBe("code001-c1");
			// Front: line replaced with [...], indentation preserved
			expect(cards[0]!.front).toContain("        [...]");
			expect(cards[0]!.front).not.toContain("return n");
			// Back: marker stripped, code visible
			expect(cards[0]!.back).toContain("        return n");
			expect(cards[0]!.back).not.toContain("osmosis-cloze");
		});

		it("generates multi-line code cloze card", () => {
			const md = [
				"````osmosis",
				"id: code002",
				"",
				"```python",
				"def fibonacci(n):",
				"    if n <= 1:",
				"        return n",
				"    # osmosis-cloze-start",
				"    a, b = 0, 1",
				"    for _ in range(2, n + 1):",
				"        a, b = b, a + b",
				"    return b",
				"    # osmosis-cloze-end",
				"```",
				"````",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(1);
			expect(cards[0]!.card_type).toBe("code_cloze");
			expect(cards[0]!.id).toBe("code002-c1");
			// Front: multi-line region replaced with single [...]
			expect(cards[0]!.front).toContain("    [...]");
			expect(cards[0]!.front).not.toContain("a, b = 0, 1");
			expect(cards[0]!.front).not.toContain("osmosis-cloze");
			// Back: content visible, marker lines stripped
			expect(cards[0]!.back).toContain("    a, b = 0, 1");
			expect(cards[0]!.back).toContain("    return b");
			expect(cards[0]!.back).not.toContain("osmosis-cloze");
		});

		it("generates mixed single and multi-line code cloze cards", () => {
			const md = [
				"````osmosis",
				"id: code003",
				"",
				"```python",
				"def fibonacci(n):",
				"    if n <= 1:",
				"        return n  # osmosis-cloze",
				"    # osmosis-cloze-start",
				"    a, b = 0, 1",
				"    for _ in range(2, n + 1):",
				"        a, b = b, a + b",
				"    return b",
				"    # osmosis-cloze-end",
				"```",
				"````",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(2);

			// Card 1: single-line blanked, multi-line visible
			expect(cards[0]!.id).toBe("code003-c1");
			expect(cards[0]!.front).toContain("        [...]");
			expect(cards[0]!.front).toContain("    a, b = 0, 1");

			// Card 2: single-line visible, multi-line blanked
			expect(cards[1]!.id).toBe("code003-c2");
			expect(cards[1]!.front).toContain("        return n");
			expect(cards[1]!.front).toContain("    [...]");
			expect(cards[1]!.front).not.toContain("a, b = 0, 1");
		});

		it("handles JavaScript comment syntax", () => {
			const md = [
				"````osmosis",
				"id: jscode",
				"",
				"```javascript",
				"function add(a, b) {",
				"    return a + b; // osmosis-cloze",
				"}",
				"```",
				"````",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(1);
			expect(cards[0]!.back).toContain("    return a + b;");
			expect(cards[0]!.back).not.toContain("osmosis-cloze");
		});

		it("code cloze cards inherit deck and hint metadata", () => {
			const md = [
				"````osmosis",
				"id: meta01",
				"deck: programming",
				"hint: Think about base case",
				"",
				"```python",
				"def fib(n):",
				"    if n <= 1:",
				"        return n  # osmosis-cloze",
				"    return fib(n-1) + fib(n-2)",
				"```",
				"````",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(1);
			expect(cards[0]!.deck).toBe("programming");
			expect(cards[0]!.front).toContain("_Hint: Think about base case_");
		});

		it("preserves surrounding code context in front", () => {
			const md = [
				"````osmosis",
				"id: ctx01",
				"",
				"```python",
				"x = 1",
				"y = 2  # osmosis-cloze",
				"z = 3",
				"```",
				"````",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(1);
			// Front shows context, just the cloze line blanked
			expect(cards[0]!.front).toContain("x = 1");
			expect(cards[0]!.front).toContain("[...]");
			expect(cards[0]!.front).toContain("z = 3");
			// Front still has code fence markers for rendering
			expect(cards[0]!.front).toContain("```python");
		});

		it("skips excluded code cloze fence", () => {
			const md = [
				"````osmosis",
				"exclude: true",
				"",
				"```python",
				"x = 1  # osmosis-cloze",
				"```",
				"````",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(0);
		});
	});

	describe("exclude metadata", () => {
		it("skips fence with exclude: true", () => {
			const md = [
				"```osmosis",
				"exclude: true",
				"",
				"This should NOT generate a card",
				"***",
				"Because it is excluded",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(0);
		});

		it("generates card when exclude is not set", () => {
			const md = [
				"```osmosis",
				"Front",
				"***",
				"Back",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(1);
		});

		it("excludes only the fence with exclude: true", () => {
			const md = [
				"```osmosis",
				"Keep this",
				"***",
				"Answer",
				"```",
				"",
				"```osmosis",
				"exclude: true",
				"",
				"Skip this",
				"***",
				"Answer",
				"```",
				"",
				"```osmosis",
				"Also keep",
				"***",
				"Answer",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(2);
			expect(cards[0]!.front).toBe("Keep this");
			expect(cards[1]!.front).toBe("Also keep");
		});

		it("excludes cloze fence with exclude: true", () => {
			const md = [
				"```osmosis",
				"exclude: true",
				"",
				"The ==mitochondria== is important.",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(0);
		});
	});

	describe("multiple fences", () => {
		it("parses multiple fences in one document", () => {
			const md = [
				"# Vocab",
				"",
				"```osmosis",
				"Hello",
				"***",
				"Bonjour",
				"```",
				"",
				"```osmosis",
				"Goodbye",
				"***",
				"Au revoir",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(2);
			expect(cards[0]!.front).toBe("Hello");
			expect(cards[1]!.front).toBe("Goodbye");
		});
	});

	describe("edge cases", () => {
		it("skips fence with empty front and back", () => {
			const md = ["```osmosis", "***", "```"].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(0);
		});

		it("returns empty array for markdown without fences", () => {
			const md = "## Heading\nJust normal text.";
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(0);
		});

		it("handles fence at end of file", () => {
			const md = ["```osmosis", "Front", "***", "Back", "```"].join(
				"\n",
			);
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(1);
		});

		it("preserves markdown formatting in content", () => {
			const md = [
				"```osmosis",
				"What is **bold** and _italic_?",
				"***",
				"It's `code` and [links](url).",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards[0]!.front).toBe("What is **bold** and _italic_?");
			expect(cards[0]!.back).toBe("It's `code` and [links](url).");
		});
	});
});
