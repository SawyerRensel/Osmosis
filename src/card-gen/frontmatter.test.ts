import { describe, it, expect } from "vitest";
import { parseOsmosisFrontmatter, resolveDeck } from "./frontmatter";

describe("parseOsmosisFrontmatter", () => {
	it("detects osmosis-cards: true", () => {
		const md = "---\nosmosis-cards: true\n---\n## Heading";
		const fm = parseOsmosisFrontmatter(md);
		expect(fm.enabled).toBe(true);
	});

	it("detects osmosis-cards: false", () => {
		const md = "---\nosmosis-cards: false\n---\n## Heading";
		const fm = parseOsmosisFrontmatter(md);
		expect(fm.enabled).toBe(false);
	});

	it("defaults to disabled when no frontmatter", () => {
		const md = "## Heading\nBody text.";
		const fm = parseOsmosisFrontmatter(md);
		expect(fm.enabled).toBe(false);
	});

	it("defaults to disabled when osmosis-cards key absent", () => {
		const md = "---\ntitle: My Note\n---\n## Heading";
		const fm = parseOsmosisFrontmatter(md);
		expect(fm.enabled).toBe(false);
	});

	it("parses osmosis-deck", () => {
		const md = "---\nosmosis-cards: true\nosmosis-deck: python/functions\n---";
		const fm = parseOsmosisFrontmatter(md);
		expect(fm.deck).toBe("python/functions");
	});

	it("handles multiple frontmatter fields", () => {
		const md = [
			"---",
			"osmosis-cards: true",
			"osmosis-deck: vocab/french",
			"title: French Vocab",
			"---",
		].join("\n");
		const fm = parseOsmosisFrontmatter(md);
		expect(fm.enabled).toBe(true);
		expect(fm.deck).toBe("vocab/french");
	});
});

describe("resolveDeck", () => {
	it("uses card-level deck first", () => {
		expect(resolveDeck("fm-deck", "card-deck", "folder/note.md")).toBe(
			"card-deck",
		);
	});

	it("falls back to frontmatter deck", () => {
		expect(resolveDeck("fm-deck", "", "folder/note.md")).toBe("fm-deck");
	});

	it("falls back to folder name", () => {
		expect(resolveDeck("", "", "Learning/Python/note.md")).toBe("Python");
	});

	it("returns empty string for root-level notes", () => {
		expect(resolveDeck("", "", "note.md")).toBe("");
	});
});
