/**
 * Pure parse and serialize for an authored trail: a vault note whose stops are
 * links, in order, one per list item. See `vault/Planner/3D Graph Phase 6 -
 * Relational study mode.md` (slice 3).
 *
 * ```markdown
 * ---
 * osmosis-trail: true
 * ---
 *
 * - [[Sailing Basics]]
 * - [[Rules of the Road#^os-rr1]]
 * - [[Rules of the Road#Lights and sounds]]
 * ```
 *
 * A stop is the first wikilink of a list item (bulleted or numbered), so a
 * trail can carry notes after the link: `- [[Knots#^bowline]] tie it blind`.
 * Everything that is not a list item is the author's own prose and is skipped,
 * as is anything inside a code fence. Resolving a stop's link to a vault path,
 * and finding the node it names, are the view's job (`linkTargetNode`).
 */

/** The frontmatter key that marks a note as a trail. */
export const TRAIL_MARKER = "osmosis-trail";

/** One stop: the link as written, split at its `#`. */
export interface TrailStop {
	/** The link path as written (`Rules of the Road`, `folder/Note`); empty for `[[#Heading]]`, a stop in the trail note itself. */
	target: string;
	/** Everything after the first `#`: `^os-rr1` for a block, `Lights and sounds` for a heading, `""` for a whole note. */
	subpath: string;
}

/** Whether a note's frontmatter marks it as a trail. */
export function isTrail(frontmatter: Record<string, unknown> | null | undefined): boolean {
	return frontmatter?.[TRAIL_MARKER] === true;
}

const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;
// An embed (`![[...]]`) is a picture, not a stop.
const WIKILINK = /(?<!!)\[\[([^\]]*)\]\]/;
const FENCE = /^\s*(```|~~~)/;

/** The stops of a trail note's text, in order. */
export function parseTrail(text: string): TrailStop[] {
	const stops: TrailStop[] = [];
	let fence: string | null = null;
	for (const line of body(text).split("\n")) {
		const mark = FENCE.exec(line)?.[1];
		if (mark !== undefined) {
			if (fence === null) fence = mark;
			else if (fence === mark) fence = null;
			continue;
		}
		if (fence !== null) continue;
		const item = LIST_ITEM.exec(line)?.[1];
		const inner = item === undefined ? undefined : WIKILINK.exec(item)?.[1];
		if (inner === undefined) continue;
		const stop = parseLink(inner);
		if (stop !== null) stops.push(stop);
	}
	return stops;
}

/** `target#subpath|alias` (the inside of a wikilink) as a stop; null when it names nothing. */
function parseLink(inner: string): TrailStop | null {
	const link = inner.split("|")[0]?.trim() ?? "";
	const hash = link.indexOf("#");
	const target = (hash < 0 ? link : link.slice(0, hash)).trim();
	const subpath = hash < 0 ? "" : link.slice(hash + 1).trim();
	return target === "" && subpath === "" ? null : { target, subpath };
}

/** The text below the frontmatter. */
function body(text: string): string {
	const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(text);
	return match === null ? text : text.slice(match[0].length);
}

/** A stop as the wikilink that names it. */
export function stopLink(stop: TrailStop): string {
	return `[[${stop.target}${stop.subpath === "" ? "" : `#${stop.subpath}`}]]`;
}

/** A trail note's text: the marker, an optional title, and one list item per stop. `parseTrail` reads it back. */
export function serializeTrail(stops: readonly TrailStop[], title?: string): string {
	const head = `---\n${TRAIL_MARKER}: true\n---\n`;
	const heading = title === undefined ? "" : `\n# ${title}\n`;
	return `${head}${heading}\n${stops.map((stop) => `- ${stopLink(stop)}`).join("\n")}\n`;
}
