import { describe, it, expect } from "vitest";
import { generateHeadingCards } from "./heading";

describe("generateHeadingCards", () => {
	it("generates a card from heading + paragraph", () => {
		const md = "## Capital\nParis is the capital of France.";
		const cards = generateHeadingCards(md);
		expect(cards).toHaveLength(1);
		expect(cards[0]!.card_type).toBe("heading");
		expect(cards[0]!.front).toBe("Capital");
		expect(cards[0]!.back).toBe("Paris is the capital of France.");
		expect(cards[0]!.sourceLine).toBe(0);
	});

	it("generates cards from multiple headings", () => {
		const md = [
			"## Topic A",
			"Body of topic A.",
			"## Topic B",
			"Body of topic B.",
		].join("\n");
		const cards = generateHeadingCards(md);
		expect(cards).toHaveLength(2);
		expect(cards[0]!.front).toBe("Topic A");
		expect(cards[0]!.back).toBe("Body of topic A.");
		expect(cards[1]!.front).toBe("Topic B");
		expect(cards[1]!.back).toBe("Body of topic B.");
	});

	it("skips headings without body text", () => {
		const md = "## Empty Heading\n## Next Heading\nSome body.";
		const cards = generateHeadingCards(md);
		expect(cards).toHaveLength(1);
		expect(cards[0]!.front).toBe("Next Heading");
	});

	it("collects multi-line body", () => {
		const md = [
			"## Topic",
			"Line one.",
			"Line two.",
			"Line three.",
		].join("\n");
		const cards = generateHeadingCards(md);
		expect(cards).toHaveLength(1);
		expect(cards[0]!.back).toBe("Line one.\nLine two.\nLine three.");
	});

	it("stops body at next heading of equal level", () => {
		const md = [
			"## Heading 1",
			"Body 1.",
			"## Heading 2",
			"Body 2.",
		].join("\n");
		const cards = generateHeadingCards(md);
		expect(cards).toHaveLength(2);
		expect(cards[0]!.back).toBe("Body 1.");
		expect(cards[1]!.back).toBe("Body 2.");
	});

	it("stops body at child heading (child gets its own card)", () => {
		const md = [
			"## Parent",
			"Parent body.",
			"### Child",
			"Child body.",
		].join("\n");
		const cards = generateHeadingCards(md);
		expect(cards).toHaveLength(2);
		expect(cards[0]!.front).toBe("Parent");
		expect(cards[0]!.back).toBe("Parent body.");
		expect(cards[1]!.front).toBe("Child");
		expect(cards[1]!.back).toBe("Child body.");
	});

	it("uses existing osmosis-id if present", () => {
		const md =
			"## Topic <!--osmosis-id:abc12345-->\nBody text.";
		const cards = generateHeadingCards(md);
		expect(cards).toHaveLength(1);
		expect(cards[0]!.id).toBe("abc12345");
		expect(cards[0]!.front).toBe("Topic");
	});

	it("strips osmosis-id from front and back content", () => {
		const md =
			"## Topic <!--osmosis-id:abc12345-->\nBody with <!--osmosis-id:def67890--> text.";
		const cards = generateHeadingCards(md);
		expect(cards[0]!.front).toBe("Topic");
		expect(cards[0]!.back).toBe("Body with text.");
	});

	it("generates new ID when none exists", () => {
		const md = "## Topic\nBody text.";
		const cards = generateHeadingCards(md);
		expect(cards[0]!.id).toMatch(/^[a-f0-9]{8}$/);
	});

	it("handles h1 through h6", () => {
		const md = [
			"# H1",
			"H1 body.",
			"## H2",
			"H2 body.",
			"### H3",
			"H3 body.",
		].join("\n");
		const cards = generateHeadingCards(md);
		expect(cards).toHaveLength(3);
	});

	it("skips blank-only body", () => {
		const md = "## Heading\n\n\n## Next\nBody.";
		const cards = generateHeadingCards(md);
		expect(cards).toHaveLength(1);
		expect(cards[0]!.front).toBe("Next");
	});

	it("returns empty array for markdown without headings", () => {
		const md = "Just a paragraph.\n- a list item\n- another";
		const cards = generateHeadingCards(md);
		expect(cards).toHaveLength(0);
	});

	it("trims leading/trailing blank lines from body", () => {
		const md = "## Topic\n\nBody text.\n\n";
		const cards = generateHeadingCards(md);
		expect(cards[0]!.back).toBe("Body text.");
	});
});
