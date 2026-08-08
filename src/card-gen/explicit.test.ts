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
			expect(cards[1]!.front).toContain("_Hint: A greeting_");
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

	describe("prose cloze cards", () => {
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

			for (const card of cards) {
				expect(card.card_type).toBe("explicit_cloze");
			}

			expect(cards[0]!.id).toBe("b8cb51f9-c1");
			expect(cards[1]!.id).toBe("b8cb51f9-c2");
			expect(cards[2]!.id).toBe("b8cb51f9-c3");

			expect(cards[0]!.front).toBe("░░░░░░░░ means ==hello== in ==French==");
			expect(cards[1]!.front).toBe("==Bonjour== means ░░░░░░░░ in ==French==");
			expect(cards[2]!.front).toBe("==Bonjour== means ==hello== in ░░░░░░░░");

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
			expect(cards[0]!.front).toBe("The ░░░░░░░░ is the powerhouse of the cell.");
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

			expect(cards[0]!.front).toBe("░░░░░░░░ means **hello**");
			expect(cards[1]!.front).toBe("**Bonjour** means ░░░░░░░░");

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

			expect(cards[0]!.front).toBe("░░░░░░░░ means **hello** in ==French==");
			expect(cards[1]!.front).toBe("==Bonjour== means ░░░░░░░░ in ==French==");
			expect(cards[2]!.front).toBe("==Bonjour== means **hello** in ░░░░░░░░");
		});

		it("generates cloze cards from :::text::: in prose", () => {
			const md = [
				"```osmosis",
				"id: prose01",
				"",
				"The :::mitochondria::: is the powerhouse of the :::cell:::.",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(2);
			expect(cards[0]!.card_type).toBe("explicit_cloze");
			expect(cards[0]!.id).toBe("prose01-c1");
			expect(cards[1]!.id).toBe("prose01-c2");

			// :::...::: markers are stripped (no wrapping on back either).
			expect(cards[0]!.front).toBe("The ░░░░░░░░ is the powerhouse of the cell.");
			expect(cards[1]!.front).toBe("The mitochondria is the powerhouse of the ░░░░░░░░.");
			expect(cards[0]!.back).toBe("The mitochondria is the powerhouse of the cell.");
			expect(cards[1]!.back).toBe("The mitochondria is the powerhouse of the cell.");
		});

		it("groups prose clozes sharing a cN label onto one card", () => {
			const md = [
				"```osmosis",
				"id: grp001",
				"",
				"==c1:Bonjour== and ==c1:Bonsoir== are greetings.",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(1);
			expect(cards[0]!.id).toBe("grp001-c1");
			expect(cards[0]!.front).toBe("░░░░░░░░ and ░░░░░░░░ are greetings.");
			// Back preserves delimiters but strips the cN: label.
			expect(cards[0]!.back).toBe("==Bonjour== and ==Bonsoir== are greetings.");
		});

		it("groups :::cN:text::: clozes in prose", () => {
			const md = [
				"```osmosis",
				"id: grp002",
				"",
				":::c1:Paris::: is the capital, and :::c1:Paris::: sits on the Seine.",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(1);
			expect(cards[0]!.id).toBe("grp002-c1");
			expect(cards[0]!.front).toBe(
				"░░░░░░░░ is the capital, and ░░░░░░░░ sits on the Seine.",
			);
			expect(cards[0]!.back).toBe(
				"Paris is the capital, and Paris sits on the Seine.",
			);
		});

		it("preserves user-chosen group numbers (sparse numbering)", () => {
			const md = [
				"```osmosis",
				"id: sparse1",
				"",
				"==c1:A== then ==c5:B==",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(2);
			expect(cards[0]!.id).toBe("sparse1-c1");
			expect(cards[1]!.id).toBe("sparse1-c5");
		});

		it("assigns anonymous groups numbers above the max labeled", () => {
			const md = [
				"```osmosis",
				"id: anon001",
				"",
				"==c2:labeled== and ==anon1== and ==anon2==",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(3);
			// Labeled c2 keeps its number; anon occurrences get c3, c4.
			expect(cards[0]!.id).toBe("anon001-c2");
			expect(cards[1]!.id).toBe("anon001-c3");
			expect(cards[2]!.id).toBe("anon001-c4");
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

		it("generates cloze cards when fence has no metadata and no leading blank line", () => {
			// Regression: `The :::mito::: and :::cell:::.` was being consumed as
			// metadata (key=`The`, value=`::mito:::…`) because any `word:` line
			// was accepted in the metadata region.
			const md = [
				"```osmosis",
				"The :::mitochondria::: is the powerhouse of the :::cell:::.",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(2);
			expect(cards[0]!.card_type).toBe("explicit_cloze");
			expect(cards[0]!.front).toContain("░░░░░░░░");
		});
	});

	describe("code cloze cards (line-level and region)", () => {
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
			expect(cards[0]!.front).toContain("        ░░░░░░░░");
			expect(cards[0]!.front).not.toContain("return n");
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
			expect(cards[0]!.front).toContain("    ░░░░░░░░");
			expect(cards[0]!.front).not.toContain("a, b = 0, 1");
			expect(cards[0]!.front).not.toContain("osmosis-cloze");
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

			expect(cards[0]!.id).toBe("code003-c1");
			expect(cards[0]!.front).toContain("        ░░░░░░░░");
			expect(cards[0]!.front).toContain("    a, b = 0, 1");

			expect(cards[1]!.id).toBe("code003-c2");
			expect(cards[1]!.front).toContain("        return n");
			expect(cards[1]!.front).toContain("    ░░░░░░░░");
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

		it("groups line-level code clozes sharing a -cN suffix", () => {
			const md = [
				"````osmosis",
				"id: codegrp",
				"",
				"```python",
				"x = 1  # osmosis-cloze-c1",
				"y = 2  # osmosis-cloze-c1",
				"z = 3",
				"```",
				"````",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(1);
			expect(cards[0]!.id).toBe("codegrp-c1");
			// Both x and y lines are blanked on one card; z shows normally.
			expect(cards[0]!.front).toContain("░░░░░░░░");
			expect(cards[0]!.front).not.toContain("x = 1");
			expect(cards[0]!.front).not.toContain("y = 2");
			expect(cards[0]!.front).toContain("z = 3");
		});

		it("groups a line-level and a multi-line region sharing a -cN suffix", () => {
			const md = [
				"````osmosis",
				"id: mixgrp",
				"",
				"```python",
				"x = 1  # osmosis-cloze-c1",
				"# osmosis-cloze-start-c1",
				"y = 2",
				"z = 3",
				"# osmosis-cloze-end-c1",
				"a = 4",
				"```",
				"````",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(1);
			expect(cards[0]!.id).toBe("mixgrp-c1");
			// Both the single line and the region collapse to blanks; a = 4 stays.
			expect(cards[0]!.front).not.toContain("x = 1");
			expect(cards[0]!.front).not.toContain("y = 2");
			expect(cards[0]!.front).not.toContain("z = 3");
			expect(cards[0]!.front).toContain("a = 4");
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
			expect(cards[0]!.front).toContain("x = 1");
			expect(cards[0]!.front).toContain("░░░░░░░░");
			expect(cards[0]!.front).toContain("z = 3");
			expect(cards[0]!.front).toContain("```python");
		});

		it("suspends an excluded code cloze fence rather than dropping it", () => {
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
			expect(cards).toHaveLength(1);
			expect(cards[0]!.disabled).toBe(true);
		});
	});

	describe("inline code cloze cards", () => {
		it("generates a single inline cloze card", () => {
			const md = [
				"````osmosis",
				"id: inl001",
				"",
				"```python",
				`print(:::"Hello, World":::)`,
				"```",
				"````",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(1);
			expect(cards[0]!.card_type).toBe("code_cloze");
			expect(cards[0]!.id).toBe("inl001-c1");
			expect(cards[0]!.front).toContain(`print(░░░░░░░░)`);
			expect(cards[0]!.back).toContain(`print("Hello, World")`);
			expect(cards[0]!.back).not.toContain(":::");
		});

		it("generates two cards for two auto-numbered blanks on separate lines", () => {
			const md = [
				"````osmosis",
				"id: inl002",
				"",
				"```python",
				`x = :::"hello":::`,
				`y = :::"world":::`,
				"```",
				"````",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(2);
			expect(cards[0]!.id).toBe("inl002-c1");
			expect(cards[1]!.id).toBe("inl002-c2");
			expect(cards[0]!.front).toContain("x = ░░░░░░░░");
			expect(cards[0]!.front).toContain(`y = "world"`);
			expect(cards[1]!.front).toContain(`x = "hello"`);
			expect(cards[1]!.front).toContain("y = ░░░░░░░░");
			expect(cards[0]!.back).toContain(`x = "hello"`);
			expect(cards[1]!.back).toContain(`y = "world"`);
		});

		it("groups inline clozes sharing a cN label", () => {
			const md = [
				"````osmosis",
				"id: inl003",
				"",
				"```python",
				`def :::c1:greet:::(:::c2:name:::):`,
				`    return f"Hello, :::c2:name:::"`,
				"```",
				"````",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(2);
			expect(cards[0]!.id).toBe("inl003-c1");
			expect(cards[0]!.front).toContain("def ░░░░░░░░(name):");
			expect(cards[0]!.front).toContain(`return f"Hello, name"`);
			expect(cards[1]!.id).toBe("inl003-c2");
			expect(cards[1]!.front).toContain("def greet(░░░░░░░░):");
			expect(cards[1]!.front).toContain(`return f"Hello, ░░░░░░░░"`);
			expect(cards[0]!.back).toContain("def greet(name):");
			expect(cards[1]!.back).toContain("def greet(name):");
		});

		it("strips the cN: group prefix from grouped inline cloze body even when body contains colons", () => {
			const md = [
				"````osmosis",
				"id: inl005",
				"",
				"```python",
				`students = :::c1:{key: value for key, value in zip(names, heights)}:::`,
				"```",
				"````",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(1);
			expect(cards[0]!.id).toBe("inl005-c1");
			expect(cards[0]!.front).toContain("students = ░░░░░░░░");
			expect(cards[0]!.back).toContain(
				"students = {key: value for key, value in zip(names, heights)}",
			);
			expect(cards[0]!.back).not.toContain("c1:");
		});

		it("preserves user-chosen inline group numbers", () => {
			const md = [
				"````osmosis",
				"id: inl004",
				"",
				"```python",
				`:::c2:first::: + :::c1:second:::`,
				"```",
				"````",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(2);
			// Cards are emitted sorted by suffix number, not source order.
			expect(cards[0]!.id).toBe("inl004-c1");
			expect(cards[0]!.front).toContain("first + ░░░░░░░░");
			expect(cards[1]!.id).toBe("inl004-c2");
			expect(cards[1]!.front).toContain("░░░░░░░░ + second");
		});

		it("generates both line-level and inline cloze cards from the same fence", () => {
			const md = [
				"````osmosis",
				"id: mix001",
				"",
				"```python",
				"x = 1  # osmosis-cloze",
				`y = :::"hello":::`,
				"```",
				"````",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(2);
			expect(cards[0]!.id).toBe("mix001-c1");
			expect(cards[0]!.front).toContain("░░░░░░░░");
			expect(cards[0]!.front).not.toContain("x = 1");
			expect(cards[0]!.front).toContain(`y = "hello"`);
			expect(cards[0]!.front).not.toContain(":::");
			expect(cards[1]!.id).toBe("mix001-c2");
			expect(cards[1]!.front).toContain("x = 1");
			expect(cards[1]!.front).toContain("y = ░░░░░░░░");
		});

		it("ignores inline markers on lines with # osmosis-cloze", () => {
			const md = [
				"````osmosis",
				"id: prec001",
				"",
				"```python",
				`x = :::"value":::  # osmosis-cloze`,
				"```",
				"````",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(1);
			expect(cards[0]!.id).toBe("prec001-c1");
			expect(cards[0]!.front).toContain("░░░░░░░░");
		});

		it("ignores inline markers inside osmosis-cloze-start/end region", () => {
			const md = [
				"````osmosis",
				"id: prec002",
				"",
				"```python",
				"# osmosis-cloze-start",
				`a = :::"inside":::`,
				"# osmosis-cloze-end",
				"```",
				"````",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(1);
			expect(cards[0]!.id).toBe("prec002-c1");
		});

		it("strips inline markers from line-level cloze card backs", () => {
			const md = [
				"````osmosis",
				"id: strip01",
				"",
				"```python",
				`x = :::"value":::`,
				"y = 2  # osmosis-cloze",
				"```",
				"````",
			].join("\n");
			const cards = generateExplicitCards(md);
			const lineLevelCard = cards.find(
				(c) => c.front.includes("x = \"value\"") && c.front.includes("░░░░░░░░"),
			)!;
			expect(lineLevelCard).toBeDefined();
			expect(lineLevelCard.back).not.toContain(":::");
			expect(lineLevelCard.back).toContain(`x = "value"`);
		});

		it("preserves surrounding code context in inline cloze front", () => {
			const md = [
				"````osmosis",
				"id: ctx02",
				"",
				"```python",
				"x = 1",
				`print(:::"Hello":::)`,
				"y = 2",
				"```",
				"````",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(1);
			expect(cards[0]!.front).toContain("x = 1");
			expect(cards[0]!.front).toContain("░░░░░░░░");
			expect(cards[0]!.front).toContain("y = 2");
			expect(cards[0]!.front).toContain("```python");
		});

		it("inline cloze cards inherit deck and hint metadata", () => {
			const md = [
				"````osmosis",
				"id: meta02",
				"deck: programming",
				"hint: A string argument",
				"",
				"```python",
				`print(:::"Hello":::)`,
				"```",
				"````",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(1);
			expect(cards[0]!.deck).toBe("programming");
			expect(cards[0]!.front).toContain("_Hint: A string argument_");
		});
	});

	describe("mixed prose + code clozes in one fence", () => {
		it("generates unified cards for prose and inline code clozes together", () => {
			const md = [
				"````osmosis",
				"id: uni001",
				"",
				"This is a regular :::c3:cloze:::.",
				"",
				"```python",
				"def :::c1:greet:::(:::c2:name:::):",
				`    return f"Hello, :::c2:name:::"`,
				"```",
				"````",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(3);

			// Sorted by suffix number.
			expect(cards[0]!.id).toBe("uni001-c1");
			expect(cards[0]!.front).toContain("This is a regular cloze.");
			expect(cards[0]!.front).toContain("def ░░░░░░░░(name):");
			expect(cards[0]!.front).toContain(`return f"Hello, name"`);

			expect(cards[1]!.id).toBe("uni001-c2");
			expect(cards[1]!.front).toContain("This is a regular cloze.");
			expect(cards[1]!.front).toContain("def greet(░░░░░░░░):");
			expect(cards[1]!.front).toContain(`return f"Hello, ░░░░░░░░"`);

			expect(cards[2]!.id).toBe("uni001-c3");
			expect(cards[2]!.front).toContain("This is a regular ░░░░░░░░.");
			expect(cards[2]!.front).toContain("def greet(name):");
			expect(cards[2]!.front).toContain(`return f"Hello, name"`);

			// All three produce code_cloze (because inline-code clozes are present).
			for (const card of cards) {
				expect(card.card_type).toBe("code_cloze");
			}
		});

		it("unifies prose ==cN== with inline code :::cN::: in the same group", () => {
			const md = [
				"````osmosis",
				"id: uni002",
				"",
				"The function ==c1:greet== is defined below:",
				"",
				"```python",
				"def :::c1:greet:::():",
				"    pass",
				"```",
				"````",
			].join("\n");
			const cards = generateExplicitCards(md);
			// Single group c1 → single card with both prose and code blanked.
			expect(cards).toHaveLength(1);
			expect(cards[0]!.id).toBe("uni002-c1");
			expect(cards[0]!.front).toContain("The function ░░░░░░░░ is defined below:");
			expect(cards[0]!.front).toContain("def ░░░░░░░░():");
		});
	});

	describe("exclude metadata", () => {
		// `exclude: true` suspends a card, it does not delete one. The card is
		// still generated, carrying `disabled` — that is what keeps it visible
		// and unsuspendable in the card browser. Every store query that decides
		// study and deck counts skips disabled cards, so it stays out of study.
		it("suspends a fence with exclude: true, preserving its schedule", () => {
			const md = [
				"```osmosis",
				"exclude: true",
				"due: 2026-08-12T10:00:00.000Z",
				"reps: 7",
				"",
				"This should generate a suspended card",
				"***",
				"Because exclude means suspended",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(1);
			expect(cards[0]!.disabled).toBe(true);
			expect(cards[0]!.reps).toBe(7);
			expect(cards[0]!.due).toBe(Date.parse("2026-08-12T10:00:00.000Z"));
		});

		it("leaves disabled unset when exclude is not set", () => {
			const md = [
				"```osmosis",
				"Front",
				"***",
				"Back",
				"```",
			].join("\n");
			expect(generateExplicitCards(md)[0]!.disabled).toBeUndefined();
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

		it("suspends only the fence with exclude: true, leaving its neighbours alone", () => {
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
			expect(cards).toHaveLength(3);
			expect(cards.map((c) => c.front)).toEqual(["Keep this", "Skip this", "Also keep"]);
			expect(cards.map((c) => c.disabled)).toEqual([undefined, true, undefined]);
		});

		it("suspends a cloze fence with exclude: true", () => {
			const md = [
				"```osmosis",
				"exclude: true",
				"",
				"The ==Danube== flows through ten countries.",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(1);
			expect(cards[0]!.disabled).toBe(true);
		});

		it("suspends both halves of an excluded bidirectional fence", () => {
			const md = [
				"```osmosis",
				"exclude: true",
				"bidi: true",
				"",
				"Front",
				"***",
				"Back",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(2);
			expect(cards.every((c) => c.disabled === true)).toBe(true);
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
