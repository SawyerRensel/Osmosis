/**
 * "Convert branch to note": the pure half. Given a note's text and the span of
 * one branch (a line and its subtree), work out the new note's text, the
 * source's text with an `![[embed]]` in the branch's place, which link targets
 * moved with it, and how links into them are rewritten.
 *
 * No `obsidian` import, so it is unit-tested; `src/convert-branch.ts` does the
 * file I/O. See `vault/Planner/Mind Map - Convert branch to note.md`.
 */

import { extractTrailingBlockId, stripTrailingBlockId } from "./block-id";
import { collectBlockIds } from "./mindmap-edit";
import { buildStableIdSelector } from "./styles";
import type { OsmosisNode } from "./types";

const HEADING = /^(#{1,6})([ \t]+.*|)$/;
const LIST = /^([ \t]*)([-*+]|\d+[.)])[ \t]+(?:\[.\][ \t]+)?(.*)$/;
const FENCE_OPEN = /^[ \t]*(`{3,}|~{3,})/;
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;

/** What a branch's link targets are, for retargeting links into it. Heading keys are {@link linkKey}s. */
export interface MovedTargets {
	/** Headings now in the new note (only those whose first occurrence in the source was in the branch). */
	headings: Set<string>;
	/** The branch root's heading, when the root is a heading: a link to it becomes a link to the note itself. */
	rootHeading: string | null;
	/** Block IDs on lines in the branch. */
	blockIds: Set<string>;
}

/** The result of {@link convertBranch}. */
export interface BranchConversion {
	/** The root line's text, markers and block ID stripped: the new note's H1. */
	title: string;
	/** {@link title} made safe as a file name. */
	fileName: string;
	/** The new note's text: `# title`, then the children re-levelled under it. */
	body: string;
	/** Where the branch starts and ends in the source (trailing blank lines left out). */
	start: number;
	end: number;
	/** What goes before `![[…]]` on the embed line: the root's indent, and its list marker for a list item. */
	embedPrefix: string;
	moved: MovedTargets;
}

/**
 * Calls `fn` on each line not inside a fenced code block (nor the opening and
 * closing fence lines themselves); other lines pass through unchanged.
 */
function mapOutsideFences(lines: readonly string[], fn: (line: string, index: number) => string): string[] {
	let fence: string | null = null;
	return lines.map((line, index) => {
		const open = FENCE_OPEN.exec(line);
		if (fence !== null) {
			if (open !== null && open[1]![0] === fence[0] && open[1]!.length >= fence.length && line.trim() === open[1]) fence = null;
			return line;
		}
		if (open !== null) {
			fence = open[1]!;
			return line;
		}
		return fn(line, index);
	});
}

/** A heading's text: the `#`s, a closing `#` run and a trailing block ID removed. */
function headingText(rest: string): string {
	return stripTrailingBlockId(rest.trim())
		.replace(/(^|[ \t]+)#+[ \t]*$/, "")
		.trim();
}

/**
 * The key a heading is matched by in a link subpath: the characters Obsidian
 * won't keep in a link (`# ^ | [ ] :` and `\`, `%`) as spaces, whitespace
 * collapsed, case folded.
 */
export function linkKey(heading: string): string {
	return heading
		.replace(/[#^|[\]:\\%]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
}

/** A title as a file name: characters illegal in file names or links dropped, never empty. */
export function sanitizeFileName(title: string): string {
	const name = title
		.replace(/[\\/:*?"<>|#^[\]]/g, " ")
		// eslint-disable-next-line no-control-regex -- control characters are exactly what is being stripped
		.replace(/[\u0000-\u001f\u007f]/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/^\.+|\.+$/g, "")
		.trim()
		.slice(0, 120)
		.trim();
	return name === "" ? "Untitled" : name;
}

/** Child heading lines shifted so the shallowest is an H2; everything else unchanged. */
function relevelHeadings(lines: readonly string[]): string[] {
	let min = 7;
	mapOutsideFences(lines, (line) => {
		const h = HEADING.exec(line);
		if (h !== null) min = Math.min(min, h[1]!.length);
		return line;
	});
	if (min === 7) return [...lines];
	const shift = min - 2;
	return mapOutsideFences(lines, (line) => {
		const h = HEADING.exec(line);
		if (h === null) return line;
		return "#".repeat(Math.min(6, h[1]!.length - shift)) + line.slice(h[1]!.length);
	});
}

/** Child lines of a list item lose the indent they share, so its children become top-level items. */
function dedent(lines: readonly string[]): string[] {
	const leads = lines.filter((l) => l.trim() !== "").map((l) => /^[ \t]*/.exec(l)![0].length);
	const base = leads.length === 0 ? 0 : Math.min(...leads);
	return lines.map((l) => l.slice(Math.min(base, /^[ \t]*/.exec(l)![0].length)));
}

/** Every heading in `content` outside frontmatter and code fences, with its line's start offset. */
function headingsOf(content: string): { key: string; start: number }[] {
	const fm = FRONTMATTER.exec(content);
	const from = fm === null ? 0 : fm[0].length;
	const lines = content.slice(from).split("\n");
	const starts: number[] = [];
	let at = from;
	for (const line of lines) {
		starts.push(at);
		at += line.length + 1;
	}
	const found: { key: string; start: number }[] = [];
	mapOutsideFences(lines, (line, i) => {
		const h = HEADING.exec(line);
		if (h !== null) found.push({ key: linkKey(headingText(h[2]!)), start: starts[i]! });
		return line;
	});
	return found;
}

/**
 * Convert the branch spanning `start`–`end` of `content` (a line's
 * `range.start` and its `subtreeEnd`).
 *
 * The root line's text becomes the title. Its children are re-levelled under
 * the new note's H1: for a heading root, child headings shift so the
 * shallowest is an H2; for a list item, the children lose their shared indent
 * and keep their relative nesting; anything else is left as it is. Lines in
 * code fences are never re-levelled, so a card fence is byte-identical apart
 * from the indent a list nesting gave it. The root's block ID, if any, stays
 * on the H1 (its line card and style follow it).
 */
export function convertBranch(content: string, start: number, end: number): BranchConversion {
	let stop = end;
	while (stop > start && (content[stop - 1] === "\n" || content[stop - 1] === "\r")) stop--;
	const lines = content.slice(start, stop).split("\n");
	const first = lines[0] ?? "";
	const rest = lines.slice(1);
	const blockId = extractTrailingBlockId(first)?.id ?? null;

	let title: string;
	let embedPrefix: string;
	let children: string[];
	let rootIsHeading = false;
	const heading = HEADING.exec(first);
	const list = LIST.exec(first);
	if (heading !== null) {
		title = headingText(heading[2]!);
		embedPrefix = "";
		children = relevelHeadings(rest);
		rootIsHeading = true;
	} else if (list !== null) {
		title = stripTrailingBlockId(list[3]!).trim();
		embedPrefix = `${list[1]!}${list[2]!} `;
		children = dedent(rest);
	} else {
		title = stripTrailingBlockId(first).trim();
		embedPrefix = /^[ \t]*/.exec(first)![0];
		children = rest;
	}

	const h1 = `# ${title}${blockId === null ? "" : ` ^${blockId}`}`;
	const childText = children.join("\n").replace(/^(?:[ \t]*\n)+/, "").trimEnd();
	const body = childText === "" ? `${h1}\n` : `${h1}\n\n${childText}\n`;

	// A heading link resolves to the first heading of that text, so only those
	// whose first occurrence is in the branch moved.
	const firstAt = new Map<string, number>();
	for (const h of headingsOf(content)) if (!firstAt.has(h.key)) firstAt.set(h.key, h.start);
	const headings = new Set<string>();
	for (const [key, at] of firstAt) if (at >= start && at < stop) headings.add(key);
	const rootKey = rootIsHeading ? linkKey(title) : null;

	return {
		title,
		fileName: sanitizeFileName(title),
		body,
		start,
		end: stop,
		embedPrefix,
		moved: {
			headings,
			rootHeading: rootKey !== null && firstAt.get(rootKey) === start ? rootKey : null,
			blockIds: collectBlockIds(content.slice(start, stop)),
		},
	};
}

/** The source with the branch replaced by an embed of `linktext`, at the root's position and indent. */
export function replaceBranch(content: string, conversion: BranchConversion, linktext: string): string {
	return `${content.slice(0, conversion.start)}${conversion.embedPrefix}![[${linktext}]]${content.slice(conversion.end)}`;
}

/** A wikilink or embed, taken apart. `subpath` has no leading `#` and is "" when absent. */
export interface Wikilink {
	embed: boolean;
	path: string;
	subpath: string;
	/** The text after `|`, or null when there is no alias. */
	alias: string | null;
}

const WIKILINK = /(!?)\[\[([^[\]|#\n]*)(?:#([^[\]|\n]*))?(?:\|([^[\]\n]*))?\]\]/g;

function formatWikilink(link: Wikilink): string {
	return `${link.embed ? "!" : ""}[[${link.path}${link.subpath === "" ? "" : `#${link.subpath}`}${link.alias === null ? "" : `|${link.alias}`}]]`;
}

/** `text` with every wikilink outside code fences passed through `fn`; null leaves a link as it was. */
export function mapWikilinks(text: string, fn: (link: Wikilink) => Wikilink | null): string {
	return mapOutsideFences(text.split("\n"), (line) =>
		line.replace(WIKILINK, (whole, bang: string, path: string, subpath: string | undefined, alias: string | undefined) => {
			const next = fn({ embed: bang === "!", path, subpath: subpath ?? "", alias: alias ?? null });
			return next === null ? whole : formatWikilink(next);
		}),
	).join("\n");
}

/** Whether a link subpath targets the branch: "root" for its root heading, "moved" for anything else in it, null if not. */
export function movedTarget(subpath: string, moved: MovedTargets): "root" | "moved" | null {
	if (subpath === "") return null;
	if (subpath.startsWith("^")) return moved.blockIds.has(subpath.slice(1)) ? "moved" : null;
	const segments = subpath.split("#").filter((s) => s.trim() !== "");
	const last = linkKey(segments[segments.length - 1] ?? "");
	if (moved.rootHeading !== null && last === moved.rootHeading) return "root";
	return moved.headings.has(last) ? "moved" : null;
}

/**
 * Point links into the moved branch at the new note: `[[Src#Heading]]` →
 * `[[New#Heading]]`, `[[Src#^id]]` → `[[New#^id]]`, and a link to the root
 * heading → `[[New]]`. Aliases and the embed `!` are kept. `pointsAtSource`
 * says whether a link path resolves to the source note from the file being
 * rewritten ("" is a link within that file).
 */
export function retargetLinks(text: string, pointsAtSource: (path: string) => boolean, moved: MovedTargets, newLinktext: string): string {
	return mapWikilinks(text, (link) => {
		const target = movedTarget(link.subpath, moved);
		if (target === null || !pointsAtSource(link.path)) return null;
		return { ...link, path: newLinktext, subpath: target === "root" ? "" : link.subpath };
	});
}

/**
 * In the moved branch's text, a link within the source (`[[#Heading]]`) to a
 * heading or block that stayed behind now has to name the source.
 */
export function anchorToSource(text: string, moved: MovedTargets, sourceLinktext: string): string {
	return mapWikilinks(text, (link) => {
		if (link.path !== "" || link.subpath === "" || movedTarget(link.subpath, moved) !== null) return null;
		return { ...link, path: sourceLinktext };
	});
}

/** The vault path for a new note called `name` in `folder` ("" is the vault root), with a " 1", " 2", … suffix on a clash. */
export function uniqueNotePath(folder: string, name: string, exists: (path: string) => boolean): string {
	const dir = folder.replace(/^\/+|\/+$/g, "");
	const at = (n: string): string => `${dir === "" ? "" : `${dir}/`}${n}.md`;
	if (!exists(at(name))) return at(name);
	for (let i = 1; ; i++) {
		const candidate = at(`${name} ${i}`);
		if (!exists(candidate)) return candidate;
	}
}

/**
 * The new note's text with a template merged in: the template's frontmatter
 * block first, verbatim, then the converted body, then the template's own
 * body (if any) after a blank line.
 */
export function applyTemplate(body: string, template: string | null): string {
	if (template === null) return body;
	const fm = FRONTMATTER.exec(template);
	const head = fm === null ? "" : fm[0].endsWith("\n") ? fm[0] : `${fm[0]}\n`;
	const tail = template.slice(fm?.[0].length ?? 0).trim();
	return `${head}${body}${tail === "" ? "" : `\n${tail}\n`}`;
}

/** Every node of `root`'s tree except the root, in document order. */
function linesInOrder(root: OsmosisNode, includeSelf: boolean): OsmosisNode[] {
	const out: OsmosisNode[] = [];
	const walk = (node: OsmosisNode, self: boolean): void => {
		if (self) out.push(node);
		for (const child of node.children) walk(child, true);
	};
	walk(root, includeSelf);
	return out.sort((a, b) => a.range.start - b.range.start);
}

/**
 * How the `_n:` style selectors of the branch's lines read in the new note.
 * A `_n:` key hashes a line's type, depth and text, and re-levelling changes
 * the depth, so the old key would orphan the style. The branch (`branch`,
 * parsed from the source) and the new note (`converted`, the parse of its
 * body) hold the same lines in the same order, so they pair up by position.
 * When the counts differ (a line the parse splits differently once moved),
 * no pairs are returned rather than guessed.
 */
export function stableSelectorPairs(branch: OsmosisNode, converted: OsmosisNode): Map<string, string> {
	const from = linesInOrder(branch, true);
	const to = linesInOrder(converted, false);
	const pairs = new Map<string, string>();
	if (from.length !== to.length) return pairs;
	from.forEach((node, i) => pairs.set(buildStableIdSelector(node), buildStableIdSelector(to[i]!)));
	return pairs;
}

/**
 * Split a note's `osmosis-styles.styles` into the entries that move with the
 * branch (re-keyed for the new note) and those that stay: `^id` keys of block
 * IDs in the branch keep their key; `_n:` keys in `renamed` take the new one.
 */
export function splitStyles(
	styles: Record<string, unknown>,
	blockIds: ReadonlySet<string>,
	renamed: ReadonlyMap<string, string>,
): { moved: Record<string, unknown>; retained: Record<string, unknown> } {
	const moved: Record<string, unknown> = {};
	const retained: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(styles)) {
		const next = key.startsWith("^") && blockIds.has(key.slice(1)) ? key : renamed.get(key);
		if (next === undefined) retained[key] = value;
		else moved[next] = value;
	}
	return { moved, retained };
}
