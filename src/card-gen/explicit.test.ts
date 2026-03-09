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

		it("parses multiple metadata keys", () => {
			const md = [
				"```osmosis",
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
		it("uses existing osmosis-id on fence line", () => {
			const md = [
				"```osmosis <!--osmosis-id:abc12345-->",
				"Front",
				"***",
				"Back",
				"```",
			].join("\n");
			// The ID is on the fence start line
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(1);
			// Note: the regex on line 0 extracts the ID
			expect(cards[0]!.id).toBe("abc12345");
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
		it("skips fence without separator", () => {
			const md = [
				"```osmosis",
				"No separator here",
				"```",
			].join("\n");
			const cards = generateExplicitCards(md);
			expect(cards).toHaveLength(0);
		});

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
