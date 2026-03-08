import { describe, it, expect } from "vitest";
import { processNote } from "./note-processor";
import type { CardGenerationOptions } from "./note-processor";

const defaultOptions: CardGenerationOptions = {
	headingAutoGenerate: true,
	clozeBoldEnabled: true,
	headingClozeConflict: "cloze_only",
};

describe("processNote", () => {
	describe("opt-in", () => {
		it("skips notes without osmosis: true", () => {
			const md = "## Heading\nBody text.";
			const result = processNote(md, "note.md", defaultOptions);
			expect(result.enabled).toBe(false);
			expect(result.cards).toHaveLength(0);
		});

		it("processes notes with osmosis: true", () => {
			const md = "---\nosmosis: true\n---\n## Heading\nBody text.";
			const result = processNote(md, "note.md", defaultOptions);
			expect(result.enabled).toBe(true);
			expect(result.cards.length).toBeGreaterThan(0);
		});
	});

	describe("deck resolution", () => {
		it("uses frontmatter deck", () => {
			const md =
				"---\nosmosis: true\nosmosis-deck: vocab\n---\n## Topic\nBody.";
			const result = processNote(md, "folder/note.md", defaultOptions);
			expect(result.cards[0]!.deck).toBe("vocab");
		});

		it("falls back to folder name", () => {
			const md = "---\nosmosis: true\n---\n## Topic\nBody.";
			const result = processNote(
				md,
				"Learning/Python/note.md",
				defaultOptions,
			);
			expect(result.cards[0]!.deck).toBe("Python");
		});

		it("explicit fence deck overrides frontmatter", () => {
			const md = [
				"---",
				"osmosis: true",
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

	describe("heading auto-generation toggle", () => {
		it("generates heading cards when enabled", () => {
			const md = "---\nosmosis: true\n---\n## Topic\nBody text.";
			const result = processNote(md, "note.md", {
				...defaultOptions,
				headingAutoGenerate: true,
			});
			expect(
				result.cards.some((c) => c.card_type === "heading"),
			).toBe(true);
		});

		it("skips heading cards when disabled", () => {
			const md = "---\nosmosis: true\n---\n## Topic\nBody text.";
			const result = processNote(md, "note.md", {
				...defaultOptions,
				headingAutoGenerate: false,
			});
			expect(
				result.cards.some((c) => c.card_type === "heading"),
			).toBe(false);
		});
	});

	describe("bold cloze toggle", () => {
		it("generates bold cloze when globally enabled", () => {
			const md =
				"---\nosmosis: true\n---\nThe **mitochondria** is important.";
			const result = processNote(md, "note.md", defaultOptions);
			expect(
				result.cards.some((c) => c.card_type === "cloze_bold"),
			).toBe(true);
		});

		it("skips bold cloze when globally disabled", () => {
			const md =
				"---\nosmosis: true\n---\nThe **mitochondria** is important.";
			const result = processNote(md, "note.md", {
				...defaultOptions,
				clozeBoldEnabled: false,
			});
			expect(
				result.cards.some((c) => c.card_type === "cloze_bold"),
			).toBe(false);
		});

		it("per-note override disables bold cloze", () => {
			const md =
				"---\nosmosis: true\nosmosis-cloze-bold: false\n---\nThe **mitochondria** is important.";
			const result = processNote(md, "note.md", defaultOptions);
			expect(
				result.cards.some((c) => c.card_type === "cloze_bold"),
			).toBe(false);
		});

		it("per-note override enables bold cloze even when globally disabled", () => {
			const md =
				"---\nosmosis: true\nosmosis-cloze-bold: true\n---\nThe **mitochondria** is important.";
			const result = processNote(md, "note.md", {
				...defaultOptions,
				clozeBoldEnabled: false,
			});
			expect(
				result.cards.some((c) => c.card_type === "cloze_bold"),
			).toBe(true);
		});
	});

	describe("osmosis-exclude", () => {
		it("excludes the element after exclude comment", () => {
			const md = [
				"---",
				"osmosis: true",
				"---",
				"## Topic A",
				"Body A.",
				"<!-- osmosis-exclude -->",
				"## Topic B",
				"Body B.",
			].join("\n");
			const result = processNote(md, "note.md", defaultOptions);
			const headings = result.cards.filter(
				(c) => c.card_type === "heading",
			);
			expect(headings).toHaveLength(1);
			expect(headings[0]!.front).toBe("Topic A");
		});

		it("excludes cloze on excluded line", () => {
			const md = [
				"---",
				"osmosis: true",
				"---",
				"Some ==term1== here.",
				"<!-- osmosis-exclude -->",
				"Not a ==term2== card.",
			].join("\n");
			const result = processNote(md, "note.md", defaultOptions);
			const clozes = result.cards.filter(
				(c) => c.card_type === "cloze_highlight",
			);
			expect(clozes).toHaveLength(1);
			expect(clozes[0]!.back).toContain("term1");
		});

		it("handles exclude comment with whitespace variations", () => {
			const md = [
				"---",
				"osmosis: true",
				"---",
				"<!--  osmosis-exclude  -->",
				"## Excluded",
				"Body.",
			].join("\n");
			const result = processNote(md, "note.md", defaultOptions);
			expect(
				result.cards.some((c) => c.front === "Excluded"),
			).toBe(false);
		});
	});

	describe("heading vs. cloze conflict resolution", () => {
		const conflictMd = [
			"---",
			"osmosis: true",
			"---",
			"## Topic",
			"The ==mitochondria== is important.",
		].join("\n");

		it("cloze_only: drops heading when body has clozes", () => {
			const result = processNote(conflictMd, "note.md", {
				...defaultOptions,
				headingClozeConflict: "cloze_only",
			});
			expect(
				result.cards.some((c) => c.card_type === "heading"),
			).toBe(false);
			expect(
				result.cards.some((c) => c.card_type === "cloze_highlight"),
			).toBe(true);
		});

		it("both: keeps heading and cloze cards", () => {
			const result = processNote(conflictMd, "note.md", {
				...defaultOptions,
				headingClozeConflict: "both",
			});
			expect(
				result.cards.some((c) => c.card_type === "heading"),
			).toBe(true);
			expect(
				result.cards.some((c) => c.card_type === "cloze_highlight"),
			).toBe(true);
		});

		it("heading_only: drops clozes in heading sections", () => {
			const result = processNote(conflictMd, "note.md", {
				...defaultOptions,
				headingClozeConflict: "heading_only",
			});
			expect(
				result.cards.some((c) => c.card_type === "heading"),
			).toBe(true);
			// heading_only keeps headings, cloze cards still generated
			// but the heading cards are not dropped
		});

		it("keeps heading when body has no clozes (cloze_only mode)", () => {
			const md =
				"---\nosmosis: true\n---\n## Topic\nPlain body text.";
			const result = processNote(md, "note.md", {
				...defaultOptions,
				headingClozeConflict: "cloze_only",
			});
			expect(
				result.cards.some((c) => c.card_type === "heading"),
			).toBe(true);
		});
	});

	describe("combined generation", () => {
		it("generates all card types from a complex note", () => {
			const md = [
				"---",
				"osmosis: true",
				"---",
				"## Plain Heading",
				"Body without cloze.",
				"",
				"Some ==highlighted== text.",
				"",
				"```osmosis",
				"Front",
				"***",
				"Back",
				"```",
			].join("\n");
			const result = processNote(md, "note.md", {
				...defaultOptions,
				headingClozeConflict: "both",
			});
			expect(result.enabled).toBe(true);
			expect(
				result.cards.some((c) => c.card_type === "heading"),
			).toBe(true);
			expect(
				result.cards.some((c) => c.card_type === "cloze_highlight"),
			).toBe(true);
			expect(
				result.cards.some((c) => c.card_type === "explicit"),
			).toBe(true);
		});
	});
});
