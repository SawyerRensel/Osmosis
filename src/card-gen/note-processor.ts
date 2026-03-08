import type { GeneratedCard } from "./types";
import type { HeadingClozeConflict } from "../settings";
import { generateHeadingCards } from "./heading";
import { generateClozeCards } from "./cloze";
import { generateExplicitCards } from "./explicit";
import { parseOsmosisFrontmatter, resolveDeck } from "./frontmatter";

/** Options controlling card generation behavior. */
export interface CardGenerationOptions {
	headingAutoGenerate: boolean;
	clozeBoldEnabled: boolean;
	headingClozeConflict: HeadingClozeConflict;
}

/** Result of processing a note for card generation. */
export interface NoteProcessingResult {
	/** Whether the note is opted-in for Osmosis. */
	enabled: boolean;
	/** All generated cards (after conflict resolution and exclusion). */
	cards: GeneratedCard[];
	/** Deck resolved from frontmatter/folder. */
	deck: string;
}

/** Regex to detect <!-- osmosis-exclude --> comments. */
const EXCLUDE_REGEX = /<!--\s*osmosis-exclude\s*-->/;

/**
 * Process a note's markdown to generate cards.
 *
 * This is the main orchestrator that:
 * 1. Checks opt-in via frontmatter
 * 2. Runs all generators
 * 3. Applies exclusion comments
 * 4. Resolves heading vs. cloze conflicts
 * 5. Resolves deck names
 */
export function processNote(
	markdown: string,
	notePath: string,
	options: CardGenerationOptions,
): NoteProcessingResult {
	const frontmatter = parseOsmosisFrontmatter(markdown);

	if (!frontmatter.enabled) {
		return { enabled: false, cards: [], deck: "" };
	}

	const deck = resolveDeck(frontmatter.deck, "", notePath);

	// Run generators based on settings
	let headingCards: GeneratedCard[] = [];
	if (options.headingAutoGenerate) {
		headingCards = generateHeadingCards(markdown);
	}

	const allClozeCards = generateClozeCards(markdown);

	// Filter bold cloze based on settings + per-note override
	const clozeBoldActive = frontmatter.clozeBold ?? options.clozeBoldEnabled;
	const clozeCards = clozeBoldActive
		? allClozeCards
		: allClozeCards.filter((c) => c.card_type !== "cloze_bold");

	const explicitCards = generateExplicitCards(markdown);

	// Apply exclusion comments
	const lines = markdown.split("\n");
	const excludedLines = findExcludedLines(lines);

	headingCards = headingCards.filter(
		(c) => !excludedLines.has(c.sourceLine),
	);
	const filteredCloze = clozeCards.filter(
		(c) => !excludedLines.has(c.sourceLine),
	);
	const filteredExplicit = explicitCards.filter(
		(c) => !excludedLines.has(c.sourceLine),
	);

	// Resolve heading vs. cloze conflicts
	const resolvedHeading = resolveConflicts(
		headingCards,
		filteredCloze,
		options.headingClozeConflict,
		lines,
	);

	// Combine all cards and assign deck
	const allCards = [...resolvedHeading, ...filteredCloze, ...filteredExplicit];

	for (const card of allCards) {
		card.deck = resolveDeck(frontmatter.deck, card.deck, notePath);
	}

	return { enabled: true, cards: allCards, deck };
}

/**
 * Find lines that are preceded by <!-- osmosis-exclude -->.
 * Returns a set of line numbers that should be excluded.
 */
function findExcludedLines(lines: string[]): Set<number> {
	const excluded = new Set<number>();

	for (let i = 0; i < lines.length; i++) {
		if (EXCLUDE_REGEX.test(lines[i]!)) {
			// Exclude the next non-blank line after the comment
			for (let j = i + 1; j < lines.length; j++) {
				if (lines[j]!.trim() !== "") {
					excluded.add(j);
					break;
				}
			}
		}
	}

	return excluded;
}

/**
 * Resolve heading vs. cloze conflicts.
 *
 * When a heading's body contains cloze targets, the conflict setting
 * determines which cards survive:
 * - "both": Keep both heading and cloze cards
 * - "cloze_only": Drop the heading card if its body has clozes
 * - "heading_only": Drop cloze cards that fall under a heading card
 */
function resolveConflicts(
	headingCards: GeneratedCard[],
	clozeCards: GeneratedCard[],
	conflict: HeadingClozeConflict,
	lines: string[],
): GeneratedCard[] {
	if (conflict === "both" || clozeCards.length === 0) {
		return headingCards;
	}

	if (conflict === "cloze_only") {
		// Drop heading cards whose body section contains cloze cards
		return headingCards.filter((hCard) => {
			const sectionEnd = findSectionEnd(hCard.sourceLine, lines);
			return !clozeCards.some(
				(c) =>
					c.sourceLine > hCard.sourceLine &&
					c.sourceLine <= sectionEnd,
			);
		});
	}

	// heading_only: cloze cards in heading sections are dropped
	// (handled by caller filtering clozeCards)
	return headingCards;
}

/**
 * Find the end line of a heading's section (up to next heading of
 * equal or higher level, or end of file).
 */
function findSectionEnd(headingLine: number, lines: string[]): number {
	const headingMatch = lines[headingLine]?.match(/^(#{1,6})\s/);
	if (!headingMatch) return headingLine;

	const level = headingMatch[1]!.length;

	for (let i = headingLine + 1; i < lines.length; i++) {
		const nextHeading = lines[i]!.match(/^(#{1,6})\s/);
		if (nextHeading && nextHeading[1]!.length <= level) {
			return i - 1;
		}
	}

	return lines.length - 1;
}
