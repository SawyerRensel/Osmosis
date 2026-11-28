/**
 * What a near-tier panel shows: the Markdown a node is rendered from. See
 * `lod.ts` for which nodes get one.
 */

import { splitFenceHeader } from "../card-gen/explicit";
import { codeFitColumns, lineColumns } from "../code-fit";
import { isLineGroup } from "../line-groups";
import { stripTrailingBlockId } from "../block-id";
import type { GraphNode } from "./model";
import { PLATE_PAD_X_EM } from "./plates";
import { MAP_FONT_PX, nodeLook, textScale } from "./node-style";
import { shapeBox, shapeWrapEm } from "./plate-shapes";
import { DEFAULT_LAYOUT_CONFIG } from "../layout";

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

/** Whether a file is media a panel draws inline: an image, audio or video (not a PDF). */
export function isPanelMedia(path: string): boolean {
	return MEDIA_EXTENSIONS.has(extension(path));
}

/**
 * Note embeds become plain links; images, audio and video (`![[cover.png|300]]`)
 * stay embeds, drawn in the line's own panel at their `|size` (T112). An
 * embedded note already lives once in the graph, in its own cluster, so
 * rendering it inline too would show it twice; embedded media gets no
 * attachment node of its own (`buildGraph`), so the line is where it shows. A
 * PDF becomes a link, as everywhere in the panels.
 */
export function unembed(markdown: string): string {
	return markdown.replace(/!\[\[([^\]]*)\]\]/g, (embed, target: string) =>
		isPanelMedia(target.split("|")[0]!.split("#")[0]!) ? embed : `[[${target}]]`);
}

/**
 * A line group's Markdown (T75): its lines with every trailing `^id` dropped
 * (a multi-ID run keeps its earlier IDs inline). A heading group renders as in
 * the 2D map: the lines above its first heading, the heading line (markers
 * kept, as every panel keeps them), and the lines below it, as three blocks.
 */
function groupMarkdown(raw: string, heading: boolean): string {
	const lines = raw.split("\n").map(stripTrailingBlockId);
	const at = heading ? lines.findIndex((l) => /^#{1,6}\s/.test(l)) : -1;
	if (at === -1) return lines.join("\n");
	return [lines.slice(0, at).join("\n"), lines[at]!, lines.slice(at + 1).join("\n")].filter((block) => block.trim() !== "").join("\n\n");
}

/**
 * The Markdown a node's near panel renders, or `null` for a node that keeps
 * only its plate. Lines render their source with its markers (`- `, `## `,
 * `> [!note]`), so a heading reads as a heading and a callout as a callout,
 * with note embeds turned into links and media embeds kept (`unembed`), so
 * `Object ![[boat.png|314]]` draws the image 314 px wide up close (T112; the far
 * plate shows text only, Sawyer's call). A line group (T75) does the same, so a
 * cover image shows above its heading. Media attachments render as their
 * embed. Note cores, tags and ghosts are already fully said by their plate. A
 * line under occlusion study (`masks`) gets a stand-in for its diagram.
 */
export function nearMarkdown(node: GraphNode): string | null {
	if (node.kind === "attachment") {
		return node.path !== undefined && MEDIA_EXTENSIONS.has(extension(node.path)) ? `![[${node.path}]]` : null;
	}
	if (node.kind !== "line" || node.source === undefined) return null;
	// An occlusion card under study: the panel draws the diagram itself (`CosmosNear`),
	// and this stands in for it, so a different diagram refills the panel, the same one
	// with another side only repaints, and `panelBoxEm` sizes it as the image it is.
	if (node.masks !== undefined) return `![](${encodeURIComponent(node.masks.occlusion.image).replace(/[()]/g, "")})`;
	const source = node.source;
	const markdown = (
		isLineGroup(source)
			? unembed(groupMarkdown(dedent(source.raw ?? ""), source.type === "heading"))
			: unembed(dedent(source.raw ?? source.content))
	).trim();
	return markdown === "" ? null : markdown;
}

/**
 * Widest a panel is laid out, in ems of panel text: the widest line plate
 * (`LINE_PLATE_MAX_EM`). Mirrored by `.osmosis-cosmos-near-panel` in
 * `styles.css`. There is no tallest: a panel shows all of its content, as a
 * 2D map node does (T111; a 30em cap cut the last lines off a long code block).
 */
export const PANEL_MAX_EM = { width: 20 } as const;
/** Tallest an image or video is drawn in a panel, in ems. Mirrored in `styles.css`. */
export const PANEL_MEDIA_MAX_EM = 15;

const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "m4a", "ogg", "flac", "3gp"]);
/** Panel padding either side, in ems (`.osmosis-cosmos-near-panel`). */
export const PANEL_PAD_EM = { x: 0.4, y: 0.25 } as const;
const PAD_X = PANEL_PAD_EM.x;
const PAD_Y = PANEL_PAD_EM.y;
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
 * 16 px text (`.osmosis-note-card` and friends in `styles.css`). Across:
 * 1 px border and 12 px padding a side. Down: the same border and padding, the
 * divider (1 px with 8 px margins) and the bottom row with the eye (4 px margin,
 * an icon row budgeted at 24 px). Each paragraph or code block inside a side
 * keeps Obsidian's 1 em block margins, which the panel only trims at its own
 * edges, so a side also gets `CARD_BLOCK_GAP` per block plus one.
 */
const CARD_PAD_X = 2 * (1 + 12) / 16;
const CARD_CHROME_Y = (2 * (1 + 12) + (1 + 2 * 8) + (4 + 24)) / 16;
const CARD_BLOCK_GAP = 1;

/** An image a panel draws: a Markdown image, an HTML `<img>`, or a media embed (note embeds became links in `nearMarkdown`). */
const IMAGE = /!\[[^\]]*\]\([^)]*\)|!\[\[[^\]]*\]\]|<img\b[^>]*>/gi;
const imageCount = (text: string): number => text.match(IMAGE)?.length ?? 0;
/** Panel px per em: the panel's text is 16 px (`NEAR_FONT_PX`), and an embed's `|size` is in px. */
const PX_PER_EM = 16;

/**
 * The box one image on a line is budgeted, in ems (T112). A `|W` or `|WxH`
 * size (`![[boat.png|314]]`, `![deck|200x100](deck.png)`) sets its width and,
 * with `xH`, its height; the panel's caps still apply (`max-width: 100%`,
 * `PANEL_MEDIA_MAX_EM`). Unsized, it may fill the panel and take the media
 * height. Audio is its player. An HTML `<img>` is budgeted as unsized.
 */
function mediaBoxEm(image: string): { width: number; height: number } {
	const wiki = /^!\[\[([^\]]*)\]\]$/.exec(image);
	const path = wiki === null ? (/\(([^)]*)\)$/.exec(image)?.[1] ?? "") : wiki[1]!.split("|")[0]!.split("#")[0]!;
	if (AUDIO_EXTENSIONS.has(extension(path))) return { ...AUDIO_EM };
	const label = wiki === null ? /^!\[([^\]]*)\]/.exec(image)?.[1] : wiki[1];
	const size = /\|\s*(\d+)\s*(?:x\s*(\d+))?\s*$/.exec(label ?? "");
	if (size === null) return { width: PANEL_MAX_EM.width, height: PANEL_MEDIA_MAX_EM };
	return {
		width: Math.min(PANEL_MAX_EM.width, Number(size[1]) / PX_PER_EM),
		height: size[2] === undefined ? PANEL_MEDIA_MAX_EM : Math.min(PANEL_MEDIA_MAX_EM, Number(size[2]) / PX_PER_EM),
	};
}

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
			w = lineColumns(raw) * CODE_EM_PER_CHAR;
			row = CODE_ROW;
			rows = Math.max(1, Math.ceil(w / (wrap - PRE_PAD.x)));
			w += PRE_PAD.x;
		} else {
			if (line.trim() === "") blank = true;
			else if (blank) {
				blank = false;
				blocks++;
			}
			if (/^\|/.test(line)) {
				if (/^\|[\s:|-]*$/.test(line)) continue;
				w = line.length * PROSE_EM_PER_CHAR;
				// Images in one cell stack; cells sit side by side, so the fullest cell sets the row.
				row = TABLE_ROW + Math.max(...line.split("|").map(imageCount)) * PANEL_MEDIA_MAX_EM;
			} else if (imageCount(line) > 0) {
				// Each image may take a row of its own (an image can be the panel's full width), under any
				// text on the line: `` - `flex-grow` ![](a.png) ![](b.png) `` is one text row and two images.
				// As wide as the text and the widest image side by side, which the panel's cap then trims.
				const text = line.replace(IMAGE, "").replace(/^([-*+]|\d+[.)])\s+/, "").trim();
				const media = (line.match(IMAGE) ?? []).map(mediaBoxEm);
				const textEm = text.length * PROSE_EM_PER_CHAR;
				w = textEm + Math.max(...media.map((m) => m.width));
				row = media.reduce((sum, m) => sum + m.height, 0) + (text === "" ? 0 : Math.ceil(textEm / wrap) * PROSE_ROW);
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
 * (`NoteStudyProcessor.parseFenceContent`). A fence without a separator
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
 * Mind-map px a panel em stands for in a node's `width` style: the map draws
 * node text at 13 px, so a width of 130 is ten ems of panel text. A `width` is
 * the content width, before the node's padding, as the mind map stores it.
 * A node whose text is `scale` times that size (`textScale`) has ems that
 * many times wider, so the same px are fewer of its ems.
 */
export const STYLE_PX_PER_EM = MAP_FONT_PX;
/** The narrowest a dragged width goes, in mind-map px: the map's 60 px node less its padding. */
export const MIN_STYLE_WIDTH_PX = 44;

/** A panel's total width, in ems of its text (`scale` × panel text), for a node `width` style of `px`: the content plus the panel's padding. */
export const styleWidthEm = (px: number, scale = 1): number => px / (STYLE_PX_PER_EM * scale) + 2 * PAD_X;

/** The `width` style for a panel (or plate) `em` ems of its text (`scale` × panel text) wide in all, as the drag handle writes it. */
export const styleWidthFromEm = (em: number, scale = 1): number => Math.max(MIN_STYLE_WIDTH_PX, Math.round((em - 2 * PAD_X) * STYLE_PX_PER_EM * scale));

/**
 * The widest a panel with the map's `maxNodeWidth` (`px`, the node's outer
 * width in the mind map) is laid out, in ems of its text: its text wraps at
 * the mind map's content width, the node's px padding taken off.
 */
export const maxWidthEm = (px: number, scale = 1): number => styleWidthEm(Math.max(MIN_STYLE_WIDTH_PX, px - 2 * DEFAULT_LAYOUT_CONFIG.nodePaddingX), scale);

/**
 * How wide a line node's panel (and plate) is laid out:
 * - `custom`: the node's `width` style, exactly that wide, wrapping at it;
 * - `code`: a code block with no custom width, as wide as its longest line up to
 *   `CODE_FIT_MAX_COLUMNS`, then wrapping (the mind map does the same in px);
 * - `default`: up to `PANEL_MAX_EM.width`, or the map's `maxNodeWidth`
 *   (`maxWidthEm`), as wide as its content.
 * `em` is the width for `custom` and `code`, the cap for `default`. Every em
 * is one of the node's own text (`textScale`).
 */
export interface PanelWidthRule {
	kind: "custom" | "code" | "default";
	em: number;
}

const DEFAULT_WIDTH: PanelWidthRule = { kind: "default", em: PANEL_MAX_EM.width };

/** The width rule for `node` (the default for any node without a line panel). Cheap for the common node: the Markdown is only read for a code block. */
export function panelWidthRule(node: GraphNode, markdown?: string | null): PanelWidthRule {
	if (node.kind !== "line" || node.source === undefined) return DEFAULT_WIDTH;
	const width = node.style?.width;
	if (typeof width === "number" && Number.isFinite(width) && width > 0) return { kind: "custom", em: styleWidthEm(width, textScale(node.style)) };
	const fallback = node.maxWidth === undefined ? DEFAULT_WIDTH : { kind: "default" as const, em: maxWidthEm(node.maxWidth, textScale(node.style)) };
	if (node.source.type !== "codeblock") return fallback;
	const text = markdown === undefined ? nearMarkdown(node) : markdown;
	if (text === null || cardSides(text) !== null) return fallback;
	return { kind: "code", em: codeFitColumns(text) * CODE_EM_PER_CHAR + PRE_PAD.x + 2 * PAD_X };
}

/**
 * How wide `node`'s plate is laid out when its width is set (a custom `width`
 * or a code block's fit), as `CosmosPlates.shape` takes it: the plate `minEm`
 * wide, its text cut at `textMaxEm`. Null for a plate sized by its label.
 */
export function plateWidthEm(node: GraphNode): { textMaxEm: number; minEm: number } | null {
	const rule = panelWidthRule(node);
	return rule.kind === "default" ? null : { textMaxEm: Math.max(0, rule.em - 2 * PLATE_PAD_X_EM), minEm: rule.em };
}

/**
 * Where a line plate sized by its label has its text cut, in ems of its text,
 * when the map sets `maxNodeWidth`: where its panel wraps (`maxWidthEm`).
 * Null for the scene's own cap, and for a plate whose width is set (`plateWidthEm`).
 */
export function plateCapEm(node: GraphNode): number | null {
	if (node.maxWidth === undefined) return null;
	const rule = panelWidthRule(node);
	return rule.kind === "default" ? Math.max(0, rule.em - 2 * PLATE_PAD_X_EM) : null;
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
 * height (`3D Graph - Planets mode.md`, feedback fix 2). Every image on a
 * line counts a full media row, below the line's text (feedback fix 3).
 *
 * It is never capped (T111): the panel is drawn as tall as its content, so a
 * cap here would space a long code block tighter than it is drawn.
 *
 * `null` for a node that never gets a panel (`nearMarkdown`).
 */
export function panelBoxEm(node: GraphNode): { width: number; height: number } | null {
	const markdown = nearMarkdown(node);
	if (markdown === null) return null;
	if (node.kind === "attachment") {
		return AUDIO_EXTENSIONS.has(extension(node.path ?? "")) ? { ...AUDIO_EM } : { width: PANEL_MAX_EM.width, height: PANEL_MEDIA_MAX_EM + 2 * PAD_Y };
	}
	const rule = panelWidthRule(node, markdown);
	const shape = nodeLook(node.style).shape;
	// A shape's text wraps narrower, as the panel's does (`shapeWrapEm`), unless its width is set.
	const wrap = rule.kind === "custom" ? rule.em - 2 * PAD_X : shapeWrapEm(shape, rule.em, PAD_X);
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
	// A shaped node's panel is its content inflated to hold it in the shape's inner box, as its plate is (`shapeBox`).
	const box = shapeBox(shape, rule.kind === "custom" ? rule.em : Math.min(wrap, width) + 2 * PAD_X, height + 2 * PAD_Y);
	return { width: box.width, height: box.height };
}
