import { describe, it, expect } from "vitest";
import { generateLineCards, lineCardId, MAX_CONTEXT_LINES } from "./line-cards";

describe("lineCardId", () => {
	it("combines note path and block ID in Obsidian link shape", () => {
		expect(lineCardId("Biology/Cells.md", "os-a1b2c3")).toBe("Biology/Cells.md#^os-a1b2c3");
	});
});

describe("generateLineCards", () => {
	it("generates a card only for lines carrying a block ID", () => {
		const markdown = [
			"# Cellular Respiration ^os-head01",
			"",
			"- Mitochondria produce ATP ^os-a1b2c3",
			"- This line has no ID",
		].join("\n");

		const cards = generateLineCards(markdown, "Biology/Cells.md");

		expect(cards.map((c) => c.blockId)).toEqual(["os-head01", "os-a1b2c3"]);
		expect(cards.every((c) => c.card_type === "line")).toBe(true);
	});

	it("builds the front as note + ancestor breadcrumb and back as the line", () => {
		const markdown = [
			"# Cellular Respiration ^os-head01",
			"",
			"## Krebs cycle ^os-head02",
			"",
			"- Produces NADH and FADH2 ^os-a1b2c3",
			"\t- Occurs in the matrix ^os-d4e5f6",
		].join("\n");

		const cards = generateLineCards(markdown, "Biology/Cells.md");

		const byId = new Map(cards.map((c) => [c.blockId, c]));
		expect(byId.get("os-head01")?.front).toBe("Cells");
		expect(byId.get("os-head01")?.back).toBe("Cellular Respiration");
		expect(byId.get("os-head02")?.front).toBe("Cells › Cellular Respiration");
		expect(byId.get("os-a1b2c3")?.front).toBe(
			"Cells › Cellular Respiration › Krebs cycle",
		);
		expect(byId.get("os-a1b2c3")?.back).toBe("Produces NADH and FADH2");
		expect(byId.get("os-d4e5f6")?.front).toBe(
			"Cells › Cellular Respiration › Krebs cycle › Produces NADH and FADH2",
		);
	});

	it("strips block IDs from card text", () => {
		const markdown = "- Mitochondria produce ATP ^os-a1b2c3";
		const cards = generateLineCards(markdown, "note.md");
		expect(cards[0]?.back).toBe("Mitochondria produce ATP");
		expect(cards[0]?.back).not.toContain("^os-");
	});

	it("sets identity from notePath + blockId and records the source line", () => {
		const markdown = [
			"# Heading ^os-head01",
			"",
			"A paragraph line. ^os-para01",
		].join("\n");

		const cards = generateLineCards(markdown, "folder/note.md");

		const para = cards.find((c) => c.blockId === "os-para01");
		expect(para?.id).toBe("folder/note.md#^os-para01");
		expect(para?.sourceLine).toBe(2);
		expect(para?.deck).toBe("");
		expect(para?.typeIn).toBe(false);
	});

	it("covers code blocks and tables via standalone after-block IDs", () => {
		const markdown = [
			"# Section ^os-head01",
			"",
			"```python",
			"print('hi')",
			"```",
			"^os-code01",
			"",
			"| a | b |",
			"|---|---|",
			"| 1 | 2 |",
			"",
			"^os-tabl01",
		].join("\n");

		const cards = generateLineCards(markdown, "note.md");
		const byId = new Map(cards.map((c) => [c.blockId, c]));

		expect(byId.get("os-code01")?.back).toContain("print('hi')");
		expect(byId.get("os-code01")?.front).toBe("note › Section");
		expect(byId.get("os-tabl01")?.back).toContain("| a | b |");
	});

	it("skips osmosis fences — they are already fence cards", () => {
		const markdown = [
			"```osmosis",
			"id: abc12345",
			"",
			"Front",
			"***",
			"Back",
			"```",
			"^os-fence1",
		].join("\n");

		const cards = generateLineCards(markdown, "note.md");
		expect(cards).toHaveLength(0);
	});

	it("skips transclusion nodes", () => {
		const markdown = "![[Other Note]] ^os-trans1";
		const cards = generateLineCards(markdown, "note.md");
		expect(cards).toHaveLength(0);
	});

	it("reuses user-authored block IDs without the os- prefix", () => {
		const markdown = "- A user-tagged line ^my-anchor";
		const cards = generateLineCards(markdown, "note.md");
		expect(cards[0]?.blockId).toBe("my-anchor");
		expect(cards[0]?.id).toBe("note.md#^my-anchor");
	});

	it("returns no cards for an untagged note", () => {
		const markdown = [
			"# Plain Heading",
			"",
			"- Plain bullet",
			"Plain paragraph.",
		].join("\n");
		expect(generateLineCards(markdown, "note.md")).toHaveLength(0);
	});

	it("records preceding siblings as contextBefore in document order", () => {
		const markdown = [
			"# Section ^os-head01",
			"",
			"- First bullet ^os-bull01",
			"- Second bullet ^os-bull02",
			"- Third bullet ^os-bull03",
		].join("\n");

		const cards = generateLineCards(markdown, "note.md");
		const byId = new Map(cards.map((c) => [c.blockId, c]));

		expect(byId.get("os-bull01")?.contextBefore).toBeUndefined();
		expect(byId.get("os-bull02")?.contextBefore).toEqual(["First bullet"]);
		expect(byId.get("os-bull03")?.contextBefore).toEqual(["First bullet", "Second bullet"]);
	});

	it("includes untagged siblings as context", () => {
		const markdown = [
			"# Section ^os-head01",
			"",
			"- No ID here",
			"- Tagged line ^os-bull01",
		].join("\n");

		const cards = generateLineCards(markdown, "note.md");
		const tagged = cards.find((c) => c.blockId === "os-bull01");
		expect(tagged?.contextBefore).toEqual(["No ID here"]);
	});

	it("context is scoped to siblings — resets under a new parent", () => {
		const markdown = [
			"# First section ^os-head01",
			"",
			"- Bullet under first ^os-bull01",
			"",
			"# Second section ^os-head02",
			"",
			"- Bullet under second ^os-bull02",
		].join("\n");

		const cards = generateLineCards(markdown, "note.md");
		const byId = new Map(cards.map((c) => [c.blockId, c]));

		expect(byId.get("os-bull01")?.contextBefore).toBeUndefined();
		expect(byId.get("os-bull02")?.contextBefore).toBeUndefined();
		// Sibling headings do see each other
		expect(byId.get("os-head02")?.contextBefore).toEqual(["First section"]);
	});

	it("caps contextBefore at MAX_CONTEXT_LINES, keeping the nearest lines", () => {
		const bullets = Array.from({ length: 8 }, (_, i) => `- Bullet ${String(i + 1)}`);
		const markdown = ["# Section ^os-head01", "", ...bullets, "- Target ^os-last01"].join("\n");

		const cards = generateLineCards(markdown, "note.md");
		const target = cards.find((c) => c.blockId === "os-last01");

		expect(target?.contextBefore).toHaveLength(MAX_CONTEXT_LINES);
		expect(target?.contextBefore).toEqual(
			["Bullet 4", "Bullet 5", "Bullet 6", "Bullet 7", "Bullet 8"],
		);
	});

	it("skips osmosis fences and comment-only lines as context", () => {
		const markdown = [
			"# Section ^os-head01",
			"",
			"A real paragraph. ^os-para01",
			"",
			"```osmosis",
			"id: abc12345",
			"",
			"Front",
			"***",
			"Back",
			"```",
			"",
			"<!-- just a comment -->",
			"",
			"The target line. ^os-para02",
		].join("\n");

		const cards = generateLineCards(markdown, "note.md");
		const target = cards.find((c) => c.blockId === "os-para02");
		expect(target?.contextBefore).toEqual(["A real paragraph."]);
	});

	it("multi-line blocks do not contribute breadcrumb segments", () => {
		const markdown = [
			"# Section ^os-head01",
			"",
			"```python",
			"print('hi')",
			"```",
			"",
			"- A bullet after the code ^os-bull01",
		].join("\n");

		const cards = generateLineCards(markdown, "note.md");
		const bullet = cards.find((c) => c.blockId === "os-bull01");
		expect(bullet?.front).toBe("note › Section");
	});
});
