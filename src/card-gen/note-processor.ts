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
	/** Folders whose notes never generate cards, even with osmosis-cards: true. */
	excludeFolders?: string[];
	/** Tags whose notes never generate cards, even with osmosis-cards: true. */
	excludeTags?: string[];
	/** Global setting: line cards count in decks (default true). */
	includeLineCardsInDecks?: boolean;
}

/** Whether a note path sits in one of the listed folders (or is one of them). */
function matchesFolder(folders: string[], notePath: string): boolean {
	return folders.some((folder) => notePath.startsWith(folder + "/") || notePath === folder);
}

/** Whether any of a note's tags matches a listed tag, parent tags included. */
function matchesTag(tags: string[], noteTags: string[] | undefined): boolean {
	if (!noteTags) return false;
	return tags.some((tag) =>
		noteTags.some((noteTag) => noteTag === tag || noteTag.startsWith(tag + "/")),
	);
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
 * 1. Checks opt-out via excluded folder/tag, then opt-in via frontmatter, folder, or tag
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

	// Exclusion wins over every opt-in, frontmatter included
	const excluded =
		matchesFolder(options.excludeFolders ?? [], notePath) ||
		matchesTag(options.excludeTags ?? [], noteTags);

	// Otherwise the note is enabled by: frontmatter opt-in OR folder match OR tag match
	const enabled =
		!excluded &&
		(frontmatter.enabled ||
			matchesFolder(options.includeFolders ?? [], notePath) ||
			matchesTag(options.includeTags ?? [], noteTags));

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

	// Line-card deck opt-out: global setting or per-note osmosis-line-cards: false.
	// Excluded cards stay studiable in-place but leave deck totals/sequential.
	const excludeLineCards =
		options.includeLineCardsInDecks === false || !frontmatter.lineCardsInDecks;

	// Assign deck
	for (const card of cards) {
		card.deck = resolveDeck(frontmatter.deck, card.deck, notePath);
		if (excludeLineCards && card.card_type === "line") {
			card.excludeFromDecks = true;
		}
	}

	return { enabled: true, cards, deck };
}
