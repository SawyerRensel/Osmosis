import { describe, it, expect } from "vitest";
import { generateClozeCards } from "./cloze";

describe("generateClozeCards", () => {
	describe("highlight cloze (==term==)", () => {
		it("generates a card from highlighted text", () => {
			const md = "Python uses ==duck typing== for flexibility.";
			const cards = generateClozeCards(md);
			expect(cards).toHaveLength(1);
			expect(cards[0]!.card_type).toBe("cloze_highlight");
			expect(cards[0]!.front).toBe(
				"Python uses [...] for flexibility.",
			);
			expect(cards[0]!.back).toBe(
				"Python uses ==duck typing== for flexibility.",
			);
		});

		it("generates multiple cards from multiple highlights", () => {
			const md =
				"==Paris== is the capital of ==France==.";
			const cards = generateClozeCards(md);
			expect(cards).toHaveLength(2);
			expect(cards[0]!.front).toBe(
				"[...] is the capital of ==France==.",
			);
			expect(cards[1]!.front).toBe(
				"==Paris== is the capital of [...].",
			);
		});
	});

	describe("bold cloze (**term**)", () => {
		it("generates a card from bold text", () => {
			const md = "The **mitochondria** is the powerhouse of the cell.";
			const cards = generateClozeCards(md);
			expect(cards).toHaveLength(1);
			expect(cards[0]!.card_type).toBe("cloze_bold");
			expect(cards[0]!.front).toBe(
				"The [...] is the powerhouse of the cell.",
			);
			expect(cards[0]!.back).toBe(
				"The **mitochondria** is the powerhouse of the cell.",
			);
		});

		it("generates multiple cards from multiple bold terms", () => {
			const md = "**Newton** discovered **gravity**.";
			const cards = generateClozeCards(md);
			expect(cards).toHaveLength(2);
			expect(cards[0]!.front).toBe("[...] discovered **gravity**.");
			expect(cards[1]!.front).toBe("**Newton** discovered [...].");
		});
	});

	describe("mixed highlight and bold", () => {
		it("generates cards for both types on the same line", () => {
			const md =
				"==Python== uses **duck typing** for flexibility.";
			const cards = generateClozeCards(md);
			expect(cards).toHaveLength(2);
			expect(cards[0]!.card_type).toBe("cloze_highlight");
			expect(cards[1]!.card_type).toBe("cloze_bold");
		});
	});

	describe("line filtering", () => {
		it("skips heading lines", () => {
			const md = "## **Bold Heading**\nSome ==term== here.";
			const cards = generateClozeCards(md);
			expect(cards).toHaveLength(1);
			expect(cards[0]!.card_type).toBe("cloze_highlight");
		});

		it("skips code fence lines", () => {
			const md = "```\n==not a cloze==\n```\n==real cloze== here.";
			const cards = generateClozeCards(md);
			expect(cards).toHaveLength(1);
			expect(cards[0]!.back).toContain("real cloze");
			// Content inside the fence should not generate cards
			expect(cards[0]!.back).not.toContain("not a cloze");
		});
	});

	describe("card identity", () => {
		it("uses existing osmosis-id", () => {
			const md =
				"Text with ==term== <!--osmosis-id:abc12345-->.";
			const cards = generateClozeCards(md);
			expect(cards).toHaveLength(1);
			expect(cards[0]!.id).toBe("abc12345");
		});

		it("assigns IDs in order for multiple clozes on one line", () => {
			const md =
				"==alpha== <!--osmosis-id:aaa11111--> and ==beta== <!--osmosis-id:bbb22222-->.";
			const cards = generateClozeCards(md);
			expect(cards).toHaveLength(2);
			expect(cards[0]!.id).toBe("aaa11111");
			expect(cards[1]!.id).toBe("bbb22222");
		});

		it("generates new ID when none exists", () => {
			const md = "Some ==highlighted== text.";
			const cards = generateClozeCards(md);
			expect(cards[0]!.id).toMatch(/^[a-f0-9]{8}$/);
		});
	});

	describe("edge cases", () => {
		it("returns empty array for plain text", () => {
			const md = "No cloze targets here.";
			const cards = generateClozeCards(md);
			expect(cards).toHaveLength(0);
		});

		it("handles multi-line markdown", () => {
			const md = [
				"First line with ==term1==.",
				"Second line with **term2**.",
				"Third line no cloze.",
			].join("\n");
			const cards = generateClozeCards(md);
			expect(cards).toHaveLength(2);
			expect(cards[0]!.sourceLine).toBe(0);
			expect(cards[1]!.sourceLine).toBe(1);
		});

		it("strips osmosis-id from front content", () => {
			const md =
				"Text ==term== <!--osmosis-id:abc12345--> more text.";
			const cards = generateClozeCards(md);
			expect(cards[0]!.front).not.toContain("osmosis-id");
		});
	});
});
