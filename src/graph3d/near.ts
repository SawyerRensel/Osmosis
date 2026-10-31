/**
 * What a near-tier panel shows: the Markdown a node is rendered from. See
 * `lod.ts` for which nodes get one.
 */

import type { GraphNode } from "./model";

/** Attachments shown live up close: images, audio and video. PDFs and the rest stay plates. */
const MEDIA_EXTENSIONS = new Set([
	"png", "jpg", "jpeg", "gif", "bmp", "svg", "webp", "avif",
	"mp3", "wav", "m4a", "ogg", "flac", "3gp",
	"mp4", "webm", "ogv", "mov", "mkv",
]);

function extension(path: string): string {
	const name = path.slice(path.lastIndexOf("/") + 1);
	const dot = name.lastIndexOf(".");
	return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
}

/** Strip the indentation every non-blank line shares, so a nested list item renders as a top-level one. */
function dedent(text: string): string {
	const lines = text.split("\n");
	let prefix: string | null = null;
	for (const line of lines) {
		if (line.trim() === "") continue;
		const indent = /^[ \t]*/.exec(line)?.[0] ?? "";
		if (prefix === null) {
			prefix = indent;
			continue;
		}
		let i = 0;
		while (i < prefix.length && i < indent.length && prefix[i] === indent[i]) i++;
		prefix = prefix.slice(0, i);
	}
	return prefix ? lines.map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : line.trimStart())).join("\n") : text;
}

/**
 * Embeds become plain links. Whatever a line embeds already lives once in the
 * graph, as its own node (a Decision in the spec): a note in its cluster, a
 * file as an attachment node whose panel plays it. Rendering it inline too
 * would show it twice.
 */
export function unembed(markdown: string): string {
	return markdown.replace(/!\[\[([^\]]*)\]\]/g, "[[$1]]");
}

/**
 * The Markdown a node's near panel renders, or `null` for a node that keeps
 * only its plate. Lines render their source with its markers (`- `, `## `,
 * `> [!note]`), so a heading reads as a heading and a callout as a callout,
 * with embeds turned into links (`unembed`). Media attachments render as their
 * embed. Note cores, tags and ghosts are already fully said by their plate.
 */
export function nearMarkdown(node: GraphNode): string | null {
	if (node.kind === "attachment") {
		return node.path !== undefined && MEDIA_EXTENSIONS.has(extension(node.path)) ? `![[${node.path}]]` : null;
	}
	if (node.kind !== "line" || node.source === undefined) return null;
	const markdown = unembed(dedent(node.source.raw ?? node.source.content)).trim();
	return markdown === "" ? null : markdown;
}
