import { OsmosisParser } from "../parser";
import type { OsmosisNode } from "../types";
import type { GeneratedCard } from "./types";

/**
 * Line-card generation for "Notes as Flashcards".
 *
 * Every element carrying a block ID (`^os-xxxxxx` trailing a line,
 * standalone after a code block/table) becomes its own FSRS card:
 * front = ancestor breadcrumb path, back = the element itself.
 * Untagged lines never generate cards — the "Generate flashcards from
 * note" command is the opt-in trigger.
 *
 * Identity = notePath + blockId, stable across edits and reorders
 * because the block ID travels with the line.
 */

/** Separator between breadcrumb segments on a line card's front. */
export const BREADCRUMB_SEPARATOR = " › ";

/** Matches the opening line of an osmosis fence (already its own fence card). */
const OSMOSIS_FENCE_REGEX = /^(?:`{3,}|~{3,})osmosis$/;

/** Card ID for a line card: globally unique, readable, Obsidian-link-shaped. */
export function lineCardId(notePath: string, blockId: string): string {
	return `${notePath}#^${blockId}`;
}

/**
 * Generate line cards from a note's markdown.
 * Only nodes with a block ID become cards; osmosis fences and
 * transcluded content are skipped.
 */
export function generateLineCards(markdown: string, notePath: string): GeneratedCard[] {
	const parser = new OsmosisParser();
	const tree = parser.parse(markdown, notePath);

	// Line-number lookup for sourceLine (0-based)
	const lineStarts: number[] = [];
	let pos = 0;
	for (const line of markdown.split("\n")) {
		lineStarts.push(pos);
		pos += line.length + 1;
	}
	const lineAt = (offset: number): number => {
		let lo = 0;
		let hi = lineStarts.length - 1;
		while (lo < hi) {
			const mid = Math.ceil((lo + hi) / 2);
			if (lineStarts[mid]! <= offset) lo = mid;
			else hi = mid - 1;
		}
		return lo;
	};

	const noteName = noteBasename(notePath);
	const cards: GeneratedCard[] = [];

	const visit = (node: OsmosisNode, crumbs: string[]): void => {
		if (node.type !== "root" && !node.isTranscluded) {
			const card = makeLineCard(node, crumbs, notePath, noteName, lineAt);
			if (card) cards.push(card);
		}
		const childCrumbs =
			node.type === "root" || isMultiline(node)
				? crumbs
				: [...crumbs, node.content];
		for (const child of node.children) {
			visit(child, childCrumbs);
		}
	};

	visit(tree.root, []);
	return cards;
}

function makeLineCard(
	node: OsmosisNode,
	crumbs: string[],
	notePath: string,
	noteName: string,
	lineAt: (offset: number) => number,
): GeneratedCard | null {
	if (node.blockId === undefined) return null;
	if (node.type === "transclusion") return null;
	if (isOsmosisFence(node)) return null;

	return {
		id: lineCardId(notePath, node.blockId),
		card_type: "line",
		front: [noteName, ...crumbs].join(BREADCRUMB_SEPARATOR),
		back: node.content,
		deck: "",
		sourceLine: lineAt(node.range.start),
		typeIn: false,
		blockId: node.blockId,
	};
}

/** Osmosis fences are already cards via the explicit generator. */
function isOsmosisFence(node: OsmosisNode): boolean {
	if (node.type !== "codeblock") return false;
	const firstLine = node.content.split("\n")[0] ?? "";
	const cleaned = firstLine.replace(/\s*<!--.*?-->/g, "").trim();
	return OSMOSIS_FENCE_REGEX.test(cleaned);
}

/** Code blocks and tables never contribute breadcrumb segments. */
function isMultiline(node: OsmosisNode): boolean {
	return node.type === "codeblock" || node.type === "table";
}

/** Note basename without folders or the .md extension. */
function noteBasename(notePath: string): string {
	const name = notePath.split("/").pop() ?? notePath;
	return name.replace(/\.md$/, "");
}
