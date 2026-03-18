/** Osmosis-related frontmatter fields parsed from a note. */
export interface OsmosisFrontmatter {
	/** Whether this note is opted-in for card generation. */
	enabled: boolean;
	/** Explicit deck override from frontmatter. */
	deck: string;
}

/**
 * Parse osmosis-related fields from a YAML frontmatter string.
 * This is a lightweight parser that extracts only the fields we need,
 * without depending on a full YAML library.
 *
 * Expected frontmatter format:
 * ```
 * ---
 * osmosis-cards: true
 * osmosis-deck: python/functions
 * osmosis-cloze-bold: false
 * ---
 * ```
 */
export function parseOsmosisFrontmatter(markdown: string): OsmosisFrontmatter {
	const result: OsmosisFrontmatter = {
		enabled: false,
		deck: "",
	};

	const lines = markdown.split("\n");
	if (lines.length === 0 || lines[0]!.trim() !== "---") {
		return result;
	}

	for (let i = 1; i < lines.length; i++) {
		const line = lines[i]!.trim();
		if (line === "---") break;

		const match = line.match(/^([\w-]+)\s*:\s*(.+)$/);
		if (!match) continue;

		const key = match[1]!.toLowerCase();
		const value = match[2]!.trim();

		switch (key) {
			case "osmosis-cards":
				result.enabled = value === "true";
				break;
			case "osmosis-deck":
				result.deck = value;
				break;
		}
	}

	return result;
}

/**
 * Resolve the deck name for a note, using the priority order:
 * 1. Explicit frontmatter (`osmosis-deck: ...`)
 * 2. Explicit card-level deck (from fence metadata)
 * 3. Full folder path (e.g., "Study/Math/Algebra/note.md" → "Study/Math/Algebra")
 * 4. Empty string (default deck)
 */
export function resolveDeck(
	frontmatterDeck: string,
	cardDeck: string,
	notePath: string,
): string {
	if (cardDeck) return cardDeck;
	if (frontmatterDeck) return frontmatterDeck;

	// Derive from folder path: use full folder hierarchy
	const parts = notePath.split("/");
	if (parts.length > 1) {
		return parts.slice(0, -1).join("/");
	}

	return "";
}
