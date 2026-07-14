import { describe, it, expect } from "vitest";
import { processNote } from "./note-processor";
import type { CardGenerationOptions } from "./note-processor";

const defaultOptions: CardGenerationOptions = {};

describe("processNote", () => {
	describe("opt-in", () => {
		it("skips notes without osmosis-cards: true", () => {
			const md = "## Heading\nBody text.";
			const result = processNote(md, "note.md", defaultOptions);
			expect(result.enabled).toBe(false);
			expect(result.cards).toHaveLength(0);
		});

		it("processes notes with osmosis-cards: true", () => {
			const md = [
				"---",
				"osmosis-cards: true",
				"---",
				"```osmosis",
				"Front",
				"***",
				"Back",
				"```",
			].join("\n");
			const result = processNote(md, "note.md", defaultOptions);
			expect(result.enabled).toBe(true);
			expect(result.cards.length).toBeGreaterThan(0);
		});
	});

	describe("deck resolution", () => {
		it("uses frontmatter deck", () => {
			const md = [
				"---",
				"osmosis-cards: true",
				"osmosis-deck: vocab",
				"---",
				"```osmosis",
				"Front",
				"***",
				"Back",
				"```",
			].join("\n");
			const result = processNote(md, "folder/note.md", defaultOptions);
			expect(result.cards[0]!.deck).toBe("vocab");
		});

		it("falls back to folder name", () => {
			const md = [
				"---",
				"osmosis-cards: true",
				"---",
				"```osmosis",
				"Front",
				"***",
				"Back",
				"```",
			].join("\n");
			const result = processNote(
				md,
				"Learning/Python/note.md",
				defaultOptions,
			);
			expect(result.cards[0]!.deck).toBe("Learning/Python");
		});

		it("explicit fence deck overrides frontmatter", () => {
			const md = [
				"---",
				"osmosis-cards: true",
				"osmosis-deck: default-deck",
				"---",
				"```osmosis",
				"deck: special-deck",
				"",
				"Front",
				"***",
				"Back",
				"```",
			].join("\n");
			const result = processNote(md, "note.md", defaultOptions);
			const explicitCard = result.cards.find(
				(c) => c.card_type === "explicit",
			);
			expect(explicitCard!.deck).toBe("special-deck");
		});
	});

	describe("exclude: true metadata", () => {
		it("excludes fence with exclude: true", () => {
			const md = [
				"---",
				"osmosis-cards: true",
				"---",
				"```osmosis",
				"Keep this",
				"***",
				"Answer",
				"```",
				"```osmosis",
				"exclude: true",
				"",
				"Skip this",
				"***",
				"Answer",
				"```",
			].join("\n");
			const result = processNote(md, "note.md", defaultOptions);
			expect(result.cards).toHaveLength(1);
			expect(result.cards[0]!.front).toBe("Keep this");
		});

		it("only excludes the fence with exclude: true", () => {
			const md = [
				"---",
				"osmosis-cards: true",
				"---",
				"```osmosis",
				"exclude: true",
				"",
				"Excluded",
				"***",
				"Answer",
				"```",
			].join("\n");
			const result = processNote(md, "note.md", defaultOptions);
			expect(result.cards).toHaveLength(0);
		});
	});

	describe("folder-based inclusion", () => {
		it("enables note when path matches includeFolders", () => {
			const md = [
				"```osmosis",
				"Front",
				"***",
				"Back",
				"```",
			].join("\n");
			const result = processNote(md, "Study/note.md", {
				...defaultOptions,
				includeFolders: ["Study"],
			});
			expect(result.enabled).toBe(true);
			expect(result.cards.length).toBeGreaterThan(0);
		});

		it("enables note in nested folder", () => {
			const md = [
				"```osmosis",
				"Front",
				"***",
				"Back",
				"```",
			].join("\n");
			const result = processNote(md, "Study/Python/note.md", {
				...defaultOptions,
				includeFolders: ["Study"],
			});
			expect(result.enabled).toBe(true);
		});

		it("does not match partial folder name", () => {
			const md = [
				"```osmosis",
				"Front",
				"***",
				"Back",
				"```",
			].join("\n");
			const result = processNote(md, "StudyGuide/note.md", {
				...defaultOptions,
				includeFolders: ["Study"],
			});
			expect(result.enabled).toBe(false);
		});

		it("does not enable note outside includeFolders", () => {
			const md = [
				"```osmosis",
				"Front",
				"***",
				"Back",
				"```",
			].join("\n");
			const result = processNote(md, "Other/note.md", {
				...defaultOptions,
				includeFolders: ["Study"],
			});
			expect(result.enabled).toBe(false);
		});
	});

	describe("tag-based inclusion", () => {
		it("enables note when tag matches includeTags", () => {
			const md = [
				"```osmosis",
				"Front",
				"***",
				"Back",
				"```",
			].join("\n");
			const result = processNote(md, "note.md", {
				...defaultOptions,
				includeTags: ["study"],
			}, ["study"]);
			expect(result.enabled).toBe(true);
			expect(result.cards.length).toBeGreaterThan(0);
		});

		it("matches tag hierarchy (child matches parent)", () => {
			const md = [
				"```osmosis",
				"Front",
				"***",
				"Back",
				"```",
			].join("\n");
			const result = processNote(md, "note.md", {
				...defaultOptions,
				includeTags: ["study"],
			}, ["study/python"]);
			expect(result.enabled).toBe(true);
		});

		it("does not match parent when child tag is specified", () => {
			const md = [
				"```osmosis",
				"Front",
				"***",
				"Back",
				"```",
			].join("\n");
			const result = processNote(md, "note.md", {
				...defaultOptions,
				includeTags: ["study/python"],
			}, ["study"]);
			expect(result.enabled).toBe(false);
		});

		it("does not enable note without matching tags", () => {
			const md = [
				"```osmosis",
				"Front",
				"***",
				"Back",
				"```",
			].join("\n");
			const result = processNote(md, "note.md", {
				...defaultOptions,
				includeTags: ["study"],
			}, ["work"]);
			expect(result.enabled).toBe(false);
		});

		it("does not enable note when no tags provided", () => {
			const md = [
				"```osmosis",
				"Front",
				"***",
				"Back",
				"```",
			].join("\n");
			const result = processNote(md, "note.md", {
				...defaultOptions,
				includeTags: ["study"],
			});
			expect(result.enabled).toBe(false);
		});
	});

	describe("combined inclusion (frontmatter OR folder OR tag)", () => {
		it("frontmatter opt-in works without folder/tag settings", () => {
			const md = [
				"---",
				"osmosis-cards: true",
				"---",
				"```osmosis",
				"Front",
				"***",
				"Back",
				"```",
			].join("\n");
			const result = processNote(md, "Random/note.md", {
				...defaultOptions,
				includeFolders: [],
				includeTags: [],
			});
			expect(result.enabled).toBe(true);
		});

		it("folder match works without frontmatter", () => {
			const md = [
				"```osmosis",
				"Front",
				"***",
				"Back",
				"```",
			].join("\n");
			const result = processNote(md, "Study/note.md", {
				...defaultOptions,
				includeFolders: ["Study"],
			});
			expect(result.enabled).toBe(true);
		});

		it("tag match works without frontmatter", () => {
			const md = [
				"```osmosis",
				"Front",
				"***",
				"Back",
				"```",
			].join("\n");
			const result = processNote(md, "note.md", {
				...defaultOptions,
				includeTags: ["study"],
			}, ["study"]);
			expect(result.enabled).toBe(true);
		});
	});

	describe("combined generation", () => {
		it("generates all explicit card types from a complex note", () => {
			const md = [
				"---",
				"osmosis-cards: true",
				"---",
				"```osmosis",
				"Front",
				"***",
				"Back",
				"```",
				"",
				"```osmosis",
				"bidi: true",
				"",
				"Paris",
				"***",
				"Capital of France",
				"```",
				"",
				"```osmosis",
				"The ==mitochondria== is important.",
				"```",
			].join("\n");
			const result = processNote(md, "note.md", defaultOptions);
			expect(result.enabled).toBe(true);

			const types = result.cards.map((c) => c.card_type);
			expect(types.filter((t) => t === "explicit")).toHaveLength(1);
			expect(types.filter((t) => t === "explicit_bidi")).toHaveLength(2);
			expect(types.filter((t) => t === "explicit_cloze")).toHaveLength(1);
		});

		it("generates line cards alongside fence cards with deck resolution", () => {
			const md = [
				"---",
				"osmosis-cards: true",
				"osmosis-deck: biology/cells",
				"---",
				"# Heading ^os-head01",
				"",
				"- Tagged line ^os-a1b2c3",
				"- Untagged line",
				"",
				"```osmosis",
				"Front",
				"***",
				"Back",
				"```",
			].join("\n");
			const result = processNote(md, "folder/note.md", defaultOptions);

			const lineCards = result.cards.filter((c) => c.card_type === "line");
			expect(lineCards.map((c) => c.blockId)).toEqual(["os-head01", "os-a1b2c3"]);
			expect(lineCards.every((c) => c.deck === "biology/cells")).toBe(true);
			expect(result.cards.some((c) => c.card_type === "explicit")).toBe(true);
		});

		it("line cards inherit the folder-derived deck when no deck is set", () => {
			const md = [
				"---",
				"osmosis-cards: true",
				"---",
				"- Tagged line ^os-a1b2c3",
			].join("\n");
			const result = processNote(md, "Study/Math/note.md", defaultOptions);
			expect(result.cards[0]?.deck).toBe("Study/Math");
		});
	});
});

describe("line-card deck opt-out", () => {
	const md = [
		"---",
		"osmosis-cards: true",
		"---",
		"- Tagged line ^os-a1b2c3",
		"",
		"```osmosis",
		"id: fence001",
		"",
		"Front",
		"***",
		"Back",
		"```",
	].join("\n");

	it("marks line cards excluded when the global setting is off", () => {
		const result = processNote(md, "note.md", { includeLineCardsInDecks: false });
		const line = result.cards.find((c) => c.card_type === "line");
		const fence = result.cards.find((c) => c.card_type === "explicit");
		expect(line?.excludeFromDecks).toBe(true);
		expect(fence?.excludeFromDecks).toBeUndefined();
	});

	it("marks line cards excluded via osmosis-line-cards: false frontmatter", () => {
		const optedOut = md.replace(
			"osmosis-cards: true",
			"osmosis-cards: true\nosmosis-line-cards: false",
		);
		const result = processNote(optedOut, "note.md", {});
		const line = result.cards.find((c) => c.card_type === "line");
		expect(line?.excludeFromDecks).toBe(true);
	});

	it("leaves line cards included by default", () => {
		const result = processNote(md, "note.md", {});
		const line = result.cards.find((c) => c.card_type === "line");
		expect(line?.excludeFromDecks).toBeUndefined();
	});
});
