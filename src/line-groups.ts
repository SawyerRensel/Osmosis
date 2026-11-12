import type { OsmosisNode } from "./types";
import { stripTrailingBlockId } from "./block-id";

/**
 * Line groups: a run of directly adjacent lines is ONE mind-map node and one
 * line card (T75, "Mind Map - Adjacent lines form one node").
 *
 * A run is a maximal sequence of *groupable* lines — headings and prose,
 * including media embeds, horizontal rules, math and HTML. Everything else
 * breaks a run and keeps today's behaviour: blank lines, list items, table
 * rows, `>` quote/callout lines, code fences, note embeds (they must stay
 * transclusion nodes so the permeable-embed expansion works), a standalone
 * `^id` line (the after-block reference of a code block/table/callout) and a
 * comment-only line (`<!-- osmosis-exclude -->` guards the element below it).
 *
 * The parser and `normalizeBlockSpacing` share {@link isGroupableLine}, so the
 * normalizer never splits apart a run the parser groups.
 */

/** File extensions for media embeds that should NOT be expanded as note transclusions. */
const MEDIA_EXTENSIONS = new Set([
	// Images
	"png", "jpg", "jpeg", "gif", "bmp", "svg", "webp", "avif",
	// Audio
	"mp3", "webm", "wav", "m4a", "ogg", "3gp", "flac",
	// Video
	"mp4", "ogv", "mov", "mkv",
	// PDF
	"pdf",
]);

/** Compound extensions that are visual embeds despite ending in .md */
const MEDIA_COMPOUND_EXTENSIONS = [".excalidraw.md"];

/**
 * Whether an embed target refers to a media file (image, audio, video, PDF)
 * or a visual embed like Excalidraw.
 * Handles wiki-link pipes (e.g. "image.png|300") and fragments (e.g. "file.pdf#page=2").
 */
export function isMediaEmbed(target: string): boolean {
	// Strip wiki-link pipe sizing (e.g. "image.png|300" → "image.png")
	const pathPart = target.split("|")[0]?.split("#")[0] ?? "";

	const lower = pathPart.toLowerCase();
	for (const compound of MEDIA_COMPOUND_EXTENSIONS) {
		if (lower.endsWith(compound)) return true;
	}

	const dotIndex = pathPart.lastIndexOf(".");
	if (dotIndex === -1) return false;
	return MEDIA_EXTENSIONS.has(pathPart.slice(dotIndex + 1).toLowerCase());
}

const LIST_ITEM = /^\s*(?:[-*]\s|\d+\.\s)/;
const FENCE = /^\s*(?:`{3,}|~{3,})/;
const WIKI_EMBED = /^\s*!\[\[([^\]]+)\]\]/;
const MD_EMBED = /^\s*!\[[^\]]*\]\(([^)]+)\)/;
const STANDALONE_ID = /^\s*\^[a-zA-Z0-9-]+\s*$/;
const COMMENT_ONLY = /^\s*<!--[\s\S]*-->\s*$/;
const HEADING = /^#{1,6}\s/;

/**
 * Whether a line (outside any code fence) is one that joins a run. The caller
 * is responsible for fence state: lines inside a fence are never groupable.
 */
export function isGroupableLine(line: string): boolean {
	if (line.trim() === "") return false;
	if (LIST_ITEM.test(line)) return false;
	if (FENCE.test(line)) return false;
	if (/^\s*[|>]/.test(line)) return false;
	if (STANDALONE_ID.test(line)) return false;
	if (COMMENT_ONLY.test(line)) return false;
	const embed = WIKI_EMBED.exec(line)?.[1] ?? MD_EMBED.exec(line)?.[1];
	if (embed !== undefined && !isMediaEmbed(embed)) return false;
	return true;
}

/**
 * Whether a node is a line group — a heading or paragraph built from two or
 * more adjacent lines. A single-line run is exactly the node it always was.
 */
export function isLineGroup(node: OsmosisNode): boolean {
	return (
		(node.type === "heading" || node.type === "paragraph")
		&& node.raw !== undefined
		&& node.raw.includes("\n")
	);
}

/**
 * Markdown a node shows in the map and on the back of its line card.
 *
 * A heading group renders as: the lines above its first heading (a cover
 * image, say), that heading's text without `#` — the node is already styled
 * at its level — and the lines below it, as three blocks separated by blank
 * lines so the title never merges into a neighbouring paragraph. Trailing
 * `^id`s are stripped from every line. Any other node shows its `content`.
 */
export function groupDisplayMarkdown(node: OsmosisNode): string {
	if (node.type !== "heading" || !isLineGroup(node)) return node.content;
	const lines = (node.raw ?? "").split("\n").map(stripTrailingBlockId);
	const at = lines.findIndex((line) => HEADING.test(line));
	if (at === -1) return node.content;
	const blocks = [lines.slice(0, at).join("\n"), node.content, lines.slice(at + 1).join("\n")];
	return blocks.filter((block) => block.trim() !== "").join("\n\n");
}
