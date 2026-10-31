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

/** Widest and tallest a panel is laid out, in ems of panel text: the widest line plate (`LINE_PLATE_MAX_EM`), and 30 lines. Mirrored by `.osmosis-graph3d-near-panel` in `styles.css`. */
export const PANEL_MAX_EM = { width: 20, height: 30 } as const;
/** Tallest an image or video is drawn in a panel, in ems. Mirrored in `styles.css`. */
export const PANEL_MEDIA_MAX_EM = 15;

const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "m4a", "ogg", "flac", "3gp"]);
/** Panel padding either side, in ems (`.osmosis-graph3d-near-panel`). */
const PAD_X = 0.4;
const PAD_Y = 0.25;
/** A rough average advance per character, in ems: prose, and monospace code at Obsidian's smaller code size. */
const PROSE_EM_PER_CHAR = 0.5;
const CODE_EM_PER_CHAR = 0.55;
/** Line heights, in ems: prose, a heading, a code line, a table row. */
const PROSE_ROW = 1.5;
const HEADING_ROW = 2.2;
const CODE_ROW = 1.4;
const TABLE_ROW = 2;
/** Obsidian's audio player, in ems. */
const AUDIO_EM = { width: 20, height: 3.5 } as const;

/**
 * How big a node's near panel can get, in ems of panel text, estimated from
 * its Markdown before anything renders. The scene spaces nodes by this as
 * well as by their plate (`3D Graph - Near-tier panels overlap and hide their
 * edges.md`), because positions settle long before a panel first renders, and
 * settled nodes never move. It leans large: a gap too wide costs a little
 * room, a gap too narrow puts one panel over its neighbour's edges.
 *
 * `null` for a node that never gets a panel (`nearMarkdown`).
 */
export function panelBoxEm(node: GraphNode): { width: number; height: number } | null {
	const markdown = nearMarkdown(node);
	if (markdown === null) return null;
	if (node.kind === "attachment") {
		return AUDIO_EXTENSIONS.has(extension(node.path ?? "")) ? { ...AUDIO_EM } : { width: PANEL_MAX_EM.width, height: PANEL_MEDIA_MAX_EM + 2 * PAD_Y };
	}
	let width = 0;
	let height = 0;
	let code = false;
	for (const raw of markdown.split("\n")) {
		const line = raw.replace(/^\s*(>\s?)*/, "");
		let w: number;
		let rows = 1;
		let row = PROSE_ROW;
		if (/^(```|~~~)/.test(line)) {
			code = !code;
			w = 0;
			row = CODE_ROW;
		} else if (code) {
			w = raw.length * CODE_EM_PER_CHAR;
			row = CODE_ROW;
		} else if (/!\[[^\]]*\]\([^)]*\)/.test(line)) {
			// A Markdown image (embeds became links in `nearMarkdown`).
			w = PANEL_MAX_EM.width;
			row = PANEL_MEDIA_MAX_EM;
		} else if (/^\|/.test(line)) {
			if (/^\|[\s:|-]*$/.test(line)) continue;
			w = line.length * PROSE_EM_PER_CHAR;
			row = TABLE_ROW;
		} else {
			w = line.length * PROSE_EM_PER_CHAR;
			if (/^#{1,6}\s|^\[!/.test(line)) row = HEADING_ROW;
			rows = Math.max(1, Math.ceil(w / (PANEL_MAX_EM.width - 2 * PAD_X)));
		}
		width = Math.max(width, w);
		height += rows * row;
	}
	return {
		width: Math.min(PANEL_MAX_EM.width, width + 2 * PAD_X),
		height: Math.min(PANEL_MAX_EM.height, height + 2 * PAD_Y),
	};
}
