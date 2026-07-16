import { OsmosisParser } from "../parser";
import type { NodeType, OsmosisNode } from "../types";
import { generateBlockId } from "../block-id";

/**
 * Planner for the "Generate flashcards from note" command.
 *
 * Scans a note and plans block-ID insertions so every eligible element
 * gains a stable line-card identity:
 * - headings, bullets, ordered items, paragraphs → trailing ` ^os-xxxxxx`
 * - generic code blocks and tables → standalone `^os-xxxxxx` line after
 *   the block (Obsidian's native multi-line block reference)
 * - osmosis fences → `id: os-xxxxxx` metadata line
 *
 * Pure logic — no vault access. Idempotent: elements that already carry
 * an ID are skipped, so re-running only tags new content.
 */

/** How an ID is written into the markdown. */
export type InsertionKind = "trailing" | "after-block" | "fence-id";

/** A single planned ID insertion, for preview and application. */
export interface PlannedInsertion {
	/** 0-based line number of the target element in the original markdown. */
	line: number;
	/** Node type receiving the ID. */
	nodeType: NodeType;
	/** Truncated text preview of the target element. */
	preview: string;
	/** The ID to insert (without caret). */
	id: string;
	/** How the ID is written. */
	kind: InsertionKind;
}

/** Result of planning ID generation for a note. */
export interface GenerateIdsPlan {
	/** Markdown with all planned IDs inserted. */
	content: string;
	/** Planned insertions in document order. */
	insertions: PlannedInsertion[];
}

const EXCLUDE_COMMENT_REGEX = /<!--\s*osmosis-exclude\s*-->/;
const OSMOSIS_FENCE_REGEX = /^(`{3,})osmosis$/;
const FENCE_METADATA_REGEX = /^\w[\w-]*\s*:\s*.+$/;
const PREVIEW_MAX_LENGTH = 60;

/** Line prefixes that start a new markdown block (not a paragraph continuation). */
const STRUCTURAL_LINE_REGEX = /^(#{1,6}\s|\s*[-*]\s|\s*\d+\.\s|`{3,}|~{3,}|\s*\||\s*!\[|\s*>)/;

/**
 * Plan block-ID insertions for a note. Returns the transformed content and
 * the list of planned insertions (empty when everything is already tagged).
 */
export function planIdGeneration(markdown: string): GenerateIdsPlan {
	const parser = new OsmosisParser();
	const tree = parser.parse(markdown, "");

	const lines = markdown.split("\n");
	const lineStarts: number[] = [];
	let pos = 0;
	for (const line of lines) {
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

	// Collect every ID-like token already in the note to avoid collisions.
	// Over-collection (footnotes, carets in prose) is harmless here.
	const existingIds = new Set<string>();
	for (const match of markdown.matchAll(/\^([a-zA-Z0-9-]+)/g)) {
		existingIds.add(match[1]!);
	}
	for (const match of markdown.matchAll(/^id\s*:\s*(\S+)\s*$/gm)) {
		existingIds.add(match[1]!);
	}

	const edits: { offset: number; text: string }[] = [];
	const insertions: PlannedInsertion[] = [];

	const visit = (node: OsmosisNode): void => {
		if (node.type !== "root" && !node.isTranscluded) {
			planNode(node);
		}
		for (const child of node.children) {
			visit(child);
		}
	};

	const planNode = (node: OsmosisNode): void => {
		if (node.blockId !== undefined) return;
		if (node.type === "transclusion") return;

		const nodeLine = lineAt(node.range.start);

		// <!-- osmosis-exclude --> on the line above suppresses tagging
		const prevLine = lines[nodeLine - 1];
		if (prevLine !== undefined && EXCLUDE_COMMENT_REGEX.test(prevLine)) return;

		if (node.type === "heading" || node.type === "bullet" || node.type === "ordered") {
			addInsertion(node, nodeLine, "trailing", node.range.end, ` ^`);
			return;
		}

		if (node.type === "paragraph") {
			// HTML-comment-only lines (e.g. <!-- osmosis-exclude -->) are
			// markup, not content — never tag them.
			if (/^<!--[\s\S]*-->$/.test(node.content.trim())) return;
			// Obsidian blocks span consecutive plain lines — a block ID is
			// only valid at the end of the block. Tag a paragraph line only
			// when the next line does not continue the same block.
			const nextLine = lines[nodeLine + 1];
			const continues =
				nextLine !== undefined &&
				nextLine.trim() !== "" &&
				!STRUCTURAL_LINE_REGEX.test(nextLine);
			if (continues) return;
			addInsertion(node, nodeLine, "trailing", node.range.end, ` ^`);
			return;
		}

		if (node.type === "codeblock") {
			const newlineIdx = node.content.indexOf("\n");
			const rawFirst = newlineIdx === -1 ? node.content : node.content.slice(0, newlineIdx);
			const cleanedFirst = rawFirst.replace(/\s*<!--.*?-->/g, "").trim();

			if (OSMOSIS_FENCE_REGEX.test(cleanedFirst)) {
				// Legacy HTML-comment ID on the opening line counts as identity
				if (rawFirst.includes("<!--osmosis-id:")) return;
				if (fenceHasIdMetadata(node.content)) return;
				// Insert `id: ...` directly after the opening fence line —
				// explicit.ts reads consecutive key:value lines from the top,
				// so this composes with existing metadata and bare content.
				addInsertion(node, nodeLine, "fence-id", node.range.start + rawFirst.length, `\nid: `);
			} else {
				addInsertion(node, nodeLine, "after-block", node.range.end, `\n^`);
			}
			return;
		}

		if (node.type === "table" || node.type === "blockquote") {
			addInsertion(node, nodeLine, "after-block", node.range.end, `\n^`);
		}
	};

	const addInsertion = (
		node: OsmosisNode,
		line: number,
		kind: InsertionKind,
		offset: number,
		prefix: string,
	): void => {
		const id = generateBlockId(existingIds);
		existingIds.add(id);
		edits.push({ offset, text: prefix + id });
		insertions.push({
			line,
			nodeType: node.type,
			preview: makePreview(node),
			id,
			kind,
		});
	};

	visit(tree.root);

	// Apply edits back-to-front so earlier offsets stay valid
	let content = markdown;
	for (const edit of [...edits].sort((a, b) => b.offset - a.offset)) {
		content = content.slice(0, edit.offset) + edit.text + content.slice(edit.offset);
	}

	insertions.sort((a, b) => a.line - b.line);
	return { content, insertions };
}

/** Whether an osmosis fence already declares an `id:` metadata key. */
function fenceHasIdMetadata(fenceContent: string): boolean {
	const contentLines = fenceContent.split("\n");
	// Skip opening fence; metadata is consecutive key:value lines from the top
	for (let i = 1; i < contentLines.length; i++) {
		const line = contentLines[i]!.trim();
		if (!FENCE_METADATA_REGEX.test(line)) break;
		if (/^id\s*:/i.test(line)) return true;
	}
	return false;
}

/** Short single-line preview of a node for the confirmation modal. */
function makePreview(node: OsmosisNode): string {
	let text: string;
	if (node.type === "codeblock") {
		const firstLine = node.content.split("\n")[0] ?? "";
		const lang = /^(?:`{3,}|~{3,})\s*(\S*)/.exec(firstLine.trim())?.[1] ?? "";
		text = lang === "osmosis" ? "osmosis card fence" : `code block${lang ? ` (${lang})` : ""}`;
	} else if (node.type === "table") {
		text = `table: ${node.content.split("\n")[0] ?? ""}`;
	} else if (node.type === "blockquote") {
		// Strip the leading `>` markers so the preview reads as prose.
		text = node.content
			.split("\n")
			.map((l) => l.replace(/^\s*>\s?/, ""))
			.join(" ")
			.replace(/\s+/g, " ")
			.trim();
	} else {
		text = node.content.replace(/\s+/g, " ").trim();
	}
	return text.length > PREVIEW_MAX_LENGTH
		? `${text.slice(0, PREVIEW_MAX_LENGTH - 1)}…`
		: text;
}
