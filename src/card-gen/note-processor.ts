import type { GeneratedCard } from "./types";
import { generateExplicitCards } from "./explicit";
import { generateLineCards } from "./line-cards";
import { parseOsmosisFrontmatter, resolveDeck } from "./frontmatter";

/** Options controlling card generation behavior. */
export interface CardGenerationOptions {
	/** Folders that auto-enable card generation. */
	includeFolders?: string[];
	/** Tags that auto-enable card generation. */
	includeTags?: string[];
}

/** Result of processing a note for card generation. */
export interface NoteProcessingResult {
	/** Whether the note is opted-in for Osmosis. */
	enabled: boolean;
	/** All generated cards. */
	cards: GeneratedCard[];
	/** Deck resolved from frontmatter/folder. */
	deck: string;
}

/**
 * Process a note's markdown to generate cards.
 *
 * This is the main orchestrator that:
 * 1. Checks opt-in via frontmatter, folder, or tag
 * 2. Runs the explicit fence generator (handles exclude: true internally)
 * 3. Runs the line-card generator (block-ID-tagged elements)
 * 4. Resolves deck names
 */
export function processNote(
	markdown: string,
	notePath: string,
	options: CardGenerationOptions,
	noteTags?: string[],
): NoteProcessingResult {
	const frontmatter = parseOsmosisFrontmatter(markdown);

	// Check if note is enabled: frontmatter opt-in OR folder match OR tag match
	const folderMatch = (options.includeFolders ?? []).some(
		(folder) => notePath.startsWith(folder + "/") || notePath === folder,
	);
	const tagMatch = noteTags
		? (options.includeTags ?? []).some((tag) =>
			noteTags.some((noteTag) => noteTag === tag || noteTag.startsWith(tag + "/")),
		)
		: false;

	const enabled = frontmatter.enabled || folderMatch || tagMatch;

	if (!enabled) {
		return { enabled: false, cards: [], deck: "" };
	}

	const deck = resolveDeck(frontmatter.deck, "", notePath);

	// Generate explicit cards (exclude: true handled inside generator),
	// then line cards from block-ID-tagged elements
	const cards = [
		...generateExplicitCards(markdown),
		...generateLineCards(markdown, notePath),
	];

	// Assign deck
	for (const card of cards) {
		card.deck = resolveDeck(frontmatter.deck, card.deck, notePath);
	}

	return { enabled: true, cards, deck };
}
