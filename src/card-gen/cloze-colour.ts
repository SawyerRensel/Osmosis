/**
 * Coloured highlight clozes.
 *
 * Obsidian spells a coloured highlight by putting one of six colour emoji
 * immediately after the opening `==` (https://obsidian.md/help/syntax#Highlight%20colors):
 * `==🔴text==`. A highlight cloze keeps working exactly as `==text==` does; the
 * emoji only chooses the colour the blank and the revealed answer are drawn in.
 * The emoji is not part of the answer.
 *
 * Only `==` clozes colour. `**` and `:::` clozes have no colour spelling.
 *
 * The colour travels inside the card's Markdown as a class on a `<span>` (the
 * blank) or `<mark>` (the answer), so every place that renders card Markdown
 * (reading view, the study modal, the mind map, 3D panels, the browser) draws it
 * without knowing about colours. `styles.css` maps each class to Obsidian's
 * `--color-*` variables. An uncoloured cloze produces exactly the text it always
 * has.
 */

export type ClozeColour = "red" | "orange" | "yellow" | "green" | "blue" | "purple";

/** The six colour emoji and the colour each names (Obsidian's highlight colours). */
export const CLOZE_COLOURS: ReadonlyArray<{ emoji: string; colour: ClozeColour }> = [
	{ emoji: "🔴", colour: "red" },
	{ emoji: "🟠", colour: "orange" },
	{ emoji: "🟡", colour: "yellow" },
	{ emoji: "🟢", colour: "green" },
	{ emoji: "🔵", colour: "blue" },
	{ emoji: "🟣", colour: "purple" },
];

/**
 * A regex alternation matching any colour emoji, for the cloze token patterns:
 * `==(?:EMOJI)?(c\d+:)?(text)==`. Non-capturing, so group numbers stay put.
 * Written as an alternation rather than a character class because the emoji
 * are surrogate pairs.
 */
export const CLOZE_COLOUR_PATTERN = `(?:${CLOZE_COLOURS.map((c) => c.emoji).join("|")})`;

/** What is inside a `==…==` token once its colour emoji and `cN:` label are taken off. */
export interface HighlightBody {
	colour: ClozeColour | null;
	text: string;
}

/** Take a leading colour emoji off `rest`, provided some text follows it. */
function takeColour(rest: string): { colour: ClozeColour; rest: string } | null {
	for (const { emoji, colour } of CLOZE_COLOURS) {
		if (rest.startsWith(emoji) && rest.length > emoji.length) {
			return { colour, rest: rest.slice(emoji.length) };
		}
	}
	return null;
}

/**
 * Split the inside of a `==…==` token (what is between the delimiters) into its
 * colour and its answer text.
 *
 * The emoji counts only at the very start, straight after `==` as Obsidian
 * spells it, or straight after a `cN:` group label (`==🔴c1:text==` and
 * `==c1:🔴text==` both colour). An emoji anywhere else is part of the text, and
 * so is one with nothing after it. The label is dropped; callers that need the
 * group read it from the token pattern.
 */
export function parseHighlightBody(body: string): HighlightBody {
	let rest = body;
	let colour: ClozeColour | null = null;

	const first = takeColour(rest);
	if (first) {
		colour = first.colour;
		rest = first.rest;
	}
	rest = rest.replace(/^c\d+:/, "");
	if (colour === null) {
		const second = takeColour(rest);
		if (second) {
			colour = second.colour;
			rest = second.rest;
		}
	}
	return { colour, text: rest };
}

/** The colour and answer of a whole `==…==` token. */
export function parseHighlightToken(token: string): HighlightBody {
	return parseHighlightBody(token.slice(2, -2));
}

/** The class a coloured blank or answer carries. */
export function clozeColourClass(colour: ClozeColour): string {
	return `osmosis-cloze-${colour}`;
}

/** An uncoloured blank is `blank` itself; a coloured one is wrapped so it can be drawn in its colour. */
export function colourBlank(blank: string, colour: ClozeColour | null): string {
	if (colour === null) return blank;
	return `<span class="osmosis-cloze-blank ${clozeColourClass(colour)}">${blank}</span>`;
}

/**
 * A `==…==` token as it reads once its answer is showing. Uncoloured it is
 * `==text==`, as ever; coloured it is a `<mark>` carrying the colour class (the
 * emoji gone, so the answer is `text`).
 */
export function colourAnswer(token: string): string {
	const { colour, text } = parseHighlightToken(token);
	if (colour === null) return `==${text}==`;
	return `<mark class="osmosis-cloze-mark ${clozeColourClass(colour)}">${text}</mark>`;
}
