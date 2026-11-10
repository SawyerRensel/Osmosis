/**
 * What a near-tier panel shows: the Markdown a node is rendered from. See
 * `lod.ts` for which nodes get one.
 */

import { splitFenceHeader } from "../card-gen/explicit";
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
 * embed. Note cores, tags and ghosts are already fully said by their plate. A
 * line under occlusion study (`masks`) gets a stand-in for its diagram.
 */
export function nearMarkdown(node: GraphNode): string | null {
	if (node.kind === "attachment") {
		return node.path !== undefined && MEDIA_EXTENSIONS.has(extension(node.path)) ? `![[${node.path}]]` : null;
	}
	if (node.kind !== "line" || node.source === undefined) return null;
	// An occlusion card under study: the panel draws the diagram itself (`Graph3DNear`),
	// and this stands in for it, so a different diagram refills the panel, the same one
	// with another side only repaints, and `panelBoxEm` sizes it as the image it is.
	if (node.masks !== undefined) return `![](${encodeURIComponent(node.masks.occlusion.image).replace(/[()]/g, "")})`;
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
 * A rendered code block's padding, both sides together, in ems of the panel's
 * 16 px text: Obsidian's `.markdown-rendered pre` is padded 12 px top and
 * bottom, 16 px left and right. Its code wraps (`--code-white-space: pre-wrap`).
 */
const PRE_PAD = { x: 32 / 16, y: 24 / 16 } as const;
/**
 * What an `osmosis` card fence adds around its two sides, in ems of the panel's
 * 16 px text (`.osmosis-contextual-card` and friends in `styles.css`). Across:
 * 1 px border and 12 px padding a side. Down: the same border and padding, the
 * divider (1 px with 8 px margins) and the bottom row with the eye (4 px margin,
 * an icon row budgeted at 24 px). Each paragraph or code block inside a side
 * keeps Obsidian's 1 em block margins, which the panel only trims at its own
 * edges, so a side also gets `CARD_BLOCK_GAP` per block plus one.
 */
const CARD_PAD_X = 2 * (1 + 12) / 16;
const CARD_CHROME_Y = (2 * (1 + 12) + (1 + 2 * 8) + (4 + 24)) / 16;
const CARD_BLOCK_GAP = 1;

/** How big some Markdown lays out at `wrap` ems wide, before any panel padding, and how many blocks it holds. */
function contentBoxEm(lines: readonly string[], wrap: number): { width: number; height: number; blocks: number } {
	let width = 0;
	let height = 0;
	let blocks = 0;
	/** The open code fence's marker, or "" outside code. */
	let fence = "";
	let blank = true;
	for (const raw of lines) {
		const line = raw.replace(/^\s*(>\s?)*/, "");
		const marker = /^(`{3,}|~{3,})(.*)$/.exec(line);
		let w: number;
		let rows = 1;
		let row = PROSE_ROW;
		if (fence === "" && marker !== null) {
			fence = marker[1]!;
			blocks++;
			w = 0;
			row = CODE_ROW;
			height += PRE_PAD.y;
		} else if (fence !== "" && marker !== null && marker[1]!.startsWith(fence) && marker[2]!.trim() === "") {
			fence = "";
			blank = true;
			w = 0;
			row = CODE_ROW;
		} else if (fence !== "") {
			w = raw.length * CODE_EM_PER_CHAR;
			row = CODE_ROW;
			rows = Math.max(1, Math.ceil(w / (wrap - PRE_PAD.x)));
			w += PRE_PAD.x;
		} else {
			if (line.trim() === "") blank = true;
			else if (blank) {
				blank = false;
				blocks++;
			}
			if (/!\[[^\]]*\]\([^)]*\)/.test(line)) {
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
				rows = Math.max(1, Math.ceil(w / wrap));
			}
		}
		width = Math.max(width, w);
		height += rows * row;
	}
	return { width, height, blocks };
}

/**
 * The fence lines of an `osmosis` card, or `null` for anything else: the
 * content below its header, split at `***` into the sides reading view draws
 * (`ContextualStudyProcessor.parseFenceContent`). A fence without a separator
 * (cloze) draws its content as both front and back, so both sides are it.
 */
function cardSides(markdown: string): { front: string[]; back: string[] } | null {
	const lines = markdown.split("\n");
	const open = /^(`{3,}|~{3,})\s*osmosis\s*$/.exec(lines[0] ?? "");
	if (open === null) return null;
	const last = lines.length - 1;
	const closed = last > 0 && lines[last]!.trim().startsWith(open[1]!) && /^(`{3,}|~{3,})$/.test(lines[last]!.trim());
	const body = lines.slice(1, closed ? last : undefined);
	const content = body.slice(splitFenceHeader(body).contentStart);
	const separator = content.findIndex((l) => l.trim() === "***");
	return separator < 0 ? { front: content, back: content } : { front: content.slice(0, separator), back: content.slice(separator + 1) };
}

/**
 * How big a node's near panel can get, in ems of panel text, estimated from
 * its Markdown before anything renders. The scene spaces nodes by this as
 * well as by their plate (`3D Graph - Near-tier panels overlap and hide their
 * edges.md`), because positions settle long before a panel first renders, and
 * settled nodes never move. It leans large: a gap too wide costs a little
 * room, a gap too narrow puts one panel over its neighbour's edges.
 *
 * An `osmosis` card fence is measured as the card it renders (both sides, the
 * card's border, padding, divider and eye row), not as its fence source: the
 * header lines never show, and the chrome and code blocks are most of its
 * height (`3D Graph - Planets mode.md`, feedback fix 2).
 *
 * `null` for a node that never gets a panel (`nearMarkdown`).
 */
export function panelBoxEm(node: GraphNode): { width: number; height: number } | null {
	const markdown = nearMarkdown(node);
	if (markdown === null) return null;
	if (node.kind === "attachment") {
		return AUDIO_EXTENSIONS.has(extension(node.path ?? "")) ? { ...AUDIO_EM } : { width: PANEL_MAX_EM.width, height: PANEL_MEDIA_MAX_EM + 2 * PAD_Y };
	}
	const wrap = PANEL_MAX_EM.width - 2 * PAD_X;
	let width: number;
	let height: number;
	const card = cardSides(markdown);
	if (card === null) {
		({ width, height } = contentBoxEm(markdown.split("\n"), wrap));
	} else {
		const sides = [card.front, card.back].map((side) => contentBoxEm(side, wrap - CARD_PAD_X));
		width = Math.max(...sides.map((side) => side.width)) + CARD_PAD_X;
		// An unasked back still shows its placeholder row.
		height = CARD_CHROME_Y + sides.reduce((sum, side) => sum + Math.max(PROSE_ROW, side.height) + (side.blocks + 1) * CARD_BLOCK_GAP, 0);
	}
	return {
		width: Math.min(PANEL_MAX_EM.width, width + 2 * PAD_X),
		height: Math.min(PANEL_MAX_EM.height, height + 2 * PAD_Y),
	};
}
