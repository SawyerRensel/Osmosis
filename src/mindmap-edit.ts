/**
 * Pure tree→markdown transforms for mind map structural edits.
 *
 * These functions are the serialization/splice machinery behind every
 * structural edit in the mind map (rename, indent/outdent, reorder, drag,
 * copy/cut/paste, delete). They are extracted here — free of any Obsidian
 * dependency — so they can be unit-tested directly; `MindMapView` delegates
 * to them.
 *
 * Invariant they must uphold: a node's exact source bytes (block IDs,
 * checkboxes, inline markup, and the trailing `^id` line of a multiline
 * block) survive a move/copy/reindent. The parser stores block IDs *out* of
 * `content` and keeps a standalone `^id` line *out* of `range`, so naively
 * rebuilding a line from `content` alone silently drops identity — these
 * helpers re-attach it.
 */

import type { OsmosisNode, Range } from "./types";
import { extractTrailingBlockId, stripTrailingBlockId } from "./block-id";

/**
 * Serialize a node type/depth/content back to a single markdown line.
 *
 * `blockId` re-appends the trailing `^id` that the parser strips out of
 * `content`; without it, every re-serialize (rename, indent/outdent, drag)
 * silently drops the block ID that anchors a line card's schedule and its
 * style overrides. Only single-line node types take an inline suffix —
 * multiline types (code/table/blockquote) carry their ID on a separate
 * `^id` line handled by {@link subtreeEnd}, never inline.
 */
export function serializeLine(
	type: OsmosisNode["type"],
	depth: number,
	content: string,
	blockId?: string,
): string {
	const suffix = blockId ? ` ^${blockId}` : "";
	switch (type) {
		case "heading":
			return `${"#".repeat(depth)} ${content}${suffix}`;
		case "bullet":
			return `${"\t".repeat(depth)}- ${content}${suffix}`;
		case "ordered":
			return `${"\t".repeat(depth)}1. ${content}${suffix}`;
		case "paragraph":
			return `${content}${suffix}`;
		case "transclusion":
			return `![[${content}]]${suffix}`;
		case "table":
			return content;
		case "blockquote":
			// Content already carries its `>` markers verbatim.
			return content;
		default:
			return content;
	}
}

/**
 * The multiline block types: code fence, table, blockquote/callout. Their bytes
 * are atomic — never re-indented, and their block ID lives on a standalone
 * `^id` line (which the parser keeps *outside* `range`) rather than inline.
 * Every other type is one line that owns its indentation and its trailing ID.
 */
function isMultilineBlock(type: OsmosisNode["type"]): boolean {
	return type === "codeblock" || type === "table" || type === "blockquote";
}

/**
 * A single-line node's leading indentation — the one marker the mind map
 * already draws, and the one that must not reach the inline editor.
 *
 * Obsidian's editor reads a tab-indented line as an indented *code block*, so
 * showing the indentation renders the whole node in source style instead of the
 * formatted text the rest of the map is made of. Depth is visible in the map's
 * own structure anyway (and changed with indent/outdent, not by typing tabs),
 * so {@link nodeEditText} withholds it and {@link restoreEditedLine} puts it
 * back. Multiline blocks keep their bytes verbatim: a leading `>` or a fence's
 * alignment is content, not depth.
 */
export function nodeIndent(type: OsmosisNode["type"], raw: string): string {
	if (isMultilineBlock(type)) return "";
	return /^[\t ]*/.exec(raw)?.[0] ?? "";
}

/**
 * The text the mind map's inline editor opens on: the node's source line with
 * every structural marker intact (`- `, `## `, `[x] `, `![[…]]`) so any of them
 * can be edited from the map, minus the two things that aren't text — the
 * leading indentation (see {@link nodeIndent}) and the trailing block ID, which
 * is card identity. {@link restoreEditedLine} puts both back on save.
 *
 * Falls back to a re-serialized line for a node with no `raw` (nothing the
 * parser produces, but the field is optional).
 */
export function nodeEditText(
	node: Pick<OsmosisNode, "type" | "depth" | "content" | "raw">,
): string {
	const raw = node.raw ?? serializeLine(node.type, node.depth, node.content);
	return raw.slice(nodeIndent(node.type, raw).length);
}

/**
 * Turn the text an inline edit produced back into the file's line: restore the
 * indentation and the block ID {@link nodeEditText} withheld. The exact inverse,
 * so a saved-without-changes edit is byte-identical to what was there.
 *
 * Indentation is the node's own — typing spaces in the box adds to it rather
 * than replacing it, since depth belongs to the map's structure.
 */
export function restoreEditedLine(
	node: Pick<OsmosisNode, "type" | "depth" | "content" | "raw" | "blockId">,
	text: string,
): string {
	const raw = node.raw ?? serializeLine(node.type, node.depth, node.content);
	const indent = nodeIndent(node.type, raw);
	return reattachBlockId(node.type, indent + text, node.blockId);
}

/**
 * Re-attach a node's trailing block ID to edited line text — the reason a
 * rename doesn't silently drop the identity that anchors a line card's schedule
 * and its style overrides.
 *
 * A multiline block's ID is on its own line outside `range`, so its text is
 * returned untouched. An ID the user typed themselves is left alone rather than
 * doubled.
 */
export function reattachBlockId(
	type: OsmosisNode["type"],
	text: string,
	blockId?: string,
): string {
	if (!blockId || isMultilineBlock(type)) return text;
	if (extractTrailingBlockId(text)) return text;
	return `${text} ^${blockId}`;
}

/**
 * Where the editable *text* starts inside the line the editor opens on — the
 * offset it selects from, so "select all and type" replaces the label rather
 * than the markup that makes the node what it is.
 *
 * An empty content (a freshly added `- ` node) puts the caret at the end, past
 * the marker, which is what makes "add child, start typing" still produce a
 * bullet. Content sits at the end of the line for every list/heading form; the
 * `lastIndexOf` fallback covers the wrappers (`![[…]]`) where it does not.
 */
export function editSelectionStart(text: string, content: string): number {
	if (content === "") return text.length;
	if (text.endsWith(content)) return text.length - content.length;
	const idx = text.lastIndexOf(content);
	return idx >= 0 ? idx : 0;
}

/**
 * Find the end offset of a node's entire subtree, in the node's own file's
 * coordinates (the max span.end of all descendants that live in that file).
 *
 * A node's `blockIdLineEnd`, when present, extends its span past a standalone
 * `^id` line that the parser deliberately keeps out of `range` (so content
 * rewrites can't wipe the identity). Structural moves must carry that line
 * along, so the span — not the bare `range.end` — is what every extract /
 * remove / insert-after offset is computed from.
 *
 * A transcluded child (spliced in when an `![[embed]]` was expanded) carries
 * `embedHostRange`: the `![[…]]` line's span in *this* file. Its own `range`
 * indexes a *different* file (the source note), so descending into it and
 * taking a `Math.max` over both coordinate systems yields a meaningless offset
 * — and, being smaller, silently drops the embed line, orphaning it on a move.
 * At that boundary the whole embed is one atomic unit occupying its host line:
 * use `embedHostRange.end` and never recurse into source-coordinate children.
 */
export function subtreeEnd(node: OsmosisNode): number {
	let end = node.blockIdLineEnd ?? node.range.end;
	for (const child of node.children) {
		if (child.embedHostRange) {
			end = Math.max(end, child.embedHostRange.end);
		} else {
			end = Math.max(end, subtreeEnd(child));
		}
	}
	return end;
}

/**
 * Start offset of a node's line in the file that *contains* it. For a spliced-in
 * embed expansion (`embedHostRange` set) this is the `![[…]]` line's start in the
 * host file; for any other node it is the node's own `range.start`. Use this — not
 * `range.start` — anywhere a host-file insert/splice offset is derived from a node
 * that might be transcluded content, so a source-file offset is never applied to
 * the host file's bytes.
 */
export function nodeHostStart(node: OsmosisNode): number {
	return node.embedHostRange ? node.embedHostRange.start : node.range.start;
}

/**
 * End offset of a node's subtree in the file that *contains* it. The host-file
 * counterpart of {@link subtreeEnd}: an embed expansion collapses to its `![[…]]`
 * line's host span, otherwise the subtree's own span (which already folds embed
 * descendants to host coordinates via {@link subtreeEnd}).
 */
export function subtreeHostEnd(node: OsmosisNode): number {
	return node.embedHostRange ? node.embedHostRange.end : subtreeEnd(node);
}

/**
 * Whether two nodes edit the same underlying file. Local nodes share one
 * (implicit) target; transcluded nodes belong to their source file. An edit
 * that would move content from one target to another (e.g. dragging an
 * embedded node onto a local parent) crosses a file boundary and must be
 * refused rather than splicing source-file offsets into the wrong file.
 */
export function sameEditTarget(a: OsmosisNode, b: OsmosisNode): boolean {
	const key = (n: OsmosisNode): string =>
		n.isTranscluded ? (n.sourceFile ?? " unresolved") : " local";
	return key(a) === key(b);
}

/** One file's content before and after a change. */
export interface FileEdit {
	path: string;
	before: string;
	after: string;
}

/**
 * Fold one write into an open edit group, keyed by path.
 *
 * A single gesture can write the same file more than once — a cross-boundary
 * move splices the host's content and then rewrites its frontmatter — and the
 * undo step has to restore the file as it was *before the gesture*, not before
 * the last of those writes. So the first `before` is kept and only `after`
 * advances; the entry always describes the net change.
 */
export function mergeEdit(group: Map<string, FileEdit>, next: FileEdit): void {
	const existing = group.get(next.path);
	if (existing) existing.after = next.after;
	else group.set(next.path, { ...next });
}

/**
 * Collapse an edit group into the edits worth undoing, in the order they were
 * first written. Files whose net change is nil are dropped — an identity
 * migration that found nothing to move leaves its note byte-identical, and a
 * no-op entry would otherwise make an undo step that appears to do nothing.
 */
export function collapseEditGroup(group: Map<string, FileEdit>): FileEdit[] {
	return [...group.values()].filter((e) => e.before !== e.after);
}

/** In-memory byte estimate for a group of edits (UTF-16; path length negligible). */
export function editBytes(edits: readonly FileEdit[]): number {
	let total = 0;
	for (const e of edits) total += (e.before.length + e.after.length) * 2;
	return total;
}

/**
 * Look up the file whose coordinates a node's `range` indexes.
 * Built by {@link buildContainingFileMap}; passed to the site/span helpers so
 * they stay free of any view or vault dependency.
 */
export type FileOf = (node: OsmosisNode) => string;

/**
 * Map every node in a tree to the file its `range` indexes.
 *
 * `sourceFile` alone cannot answer this. On an *expanded* child it names the
 * file the node lives in, but on a `transclusion` node it names the embed's
 * *target* while the node's own `range` still points at the `![[…]]` line in
 * the file that contains it — the case for a lazy-loaded or cyclic embed, which
 * stays unexpanded yet is marked `isTranscluded` with a `sourceFile`. Reading
 * `sourceFile` there would splice one file's offsets into another.
 *
 * The containing file changes at exactly one place: a node carrying
 * `embedHostRange`, i.e. the top-level child of an expansion. From there down,
 * everything lives in that child's `sourceFile` until a deeper expansion
 * switches again — which is what makes nested embeds fall out for free.
 */
export function buildContainingFileMap(
	root: OsmosisNode,
	hostPath: string,
): Map<string, string> {
	const map = new Map<string, string>();
	const walk = (node: OsmosisNode, path: string): void => {
		const own = node.embedHostRange ? (node.sourceFile ?? path) : path;
		map.set(node.id, own);
		for (const child of node.children) walk(child, own);
	};
	walk(root, hostPath);
	return map;
}

/** Where an insertion at a (parent, index) drop position actually lands. */
export interface InsertSite {
	/** The file that receives the insert. */
	path: string;
	/** Offset within `path`'s own coordinates. */
	offset: number;
	/**
	 * The destination-side sibling the inserted node comes to sit before, when
	 * the insert crosses into another file. Callers take the new node's type and
	 * depth from *this* node rather than from the drop's tree parent: the parent's
	 * depth is expressed in the containing file's terms, so an embed nested under
	 * a deep host bullet would otherwise indent the line to the host's depth
	 * inside a source note whose own content starts at depth 0.
	 */
	neighbor?: OsmosisNode;
}

/**
 * Resolve which file an insert at `(targetParent, index)` writes to, and where.
 *
 * The rule: **the destination is the containing file of whatever the insert
 * attaches to.** A gap whose two sides both live in the same *other* file is
 * interior to an embed's expansion and routes into that source note. Every
 * other gap — both sides local, a boundary edge where one side is local and the
 * other embedded, or the seam where two different embeds meet — belongs to the
 * parent's own file, where Part A's `nodeHostStart` / `subtreeHostEnd` fold an
 * expansion back to its `![[…]]` line.
 *
 * Resolving the *edge* gaps to the parent is deliberate. The gap above an
 * embed's first line and the gap below the preceding local sibling are one and
 * the same visual gap, so something has to break the tie; giving it to the
 * parent keeps "put this node immediately before the embed" reachable, while
 * every interior gap still routes into the source.
 */
export function resolveInsertSite(
	targetParent: OsmosisNode,
	index: number,
	fileOf: FileOf,
): InsertSite {
	const parentPath = fileOf(targetParent);
	const children = targetParent.children;

	// Childless parent: the insert lands just past the parent's own line.
	if (children.length === 0) {
		return { path: parentPath, offset: targetParent.range.end };
	}

	const before = children[index - 1];
	const after = children[index];

	// Appending past the last child.
	if (!after) {
		return {
			path: parentPath,
			offset: subtreeHostEnd(children[children.length - 1]!),
		};
	}

	const afterPath = fileOf(after);

	// Interior gap within one embed's expansion → write into that source note,
	// at the following sibling's own (source-coordinate) start.
	if (before && afterPath !== parentPath && fileOf(before) === afterPath) {
		return { path: afterPath, offset: after.range.start, neighbor: after };
	}

	return { path: parentPath, offset: nodeHostStart(after) };
}

/**
 * The type and depth a node takes on as a **child** of `parent` — the shape
 * "add child" and "paste onto a node" both need.
 *
 * Heading depth and list depth are different scales, which is the trap: a
 * bullet added under `## Bus Network` is a *top-level* bullet (depth 0), not a
 * bullet indented to the heading's level. Getting that wrong buries the new
 * line inside the preceding list item.
 *
 * `child` is what is being placed there. "Add child" has no node yet and omits
 * it, taking the shape a fresh line would; paste passes the copied item, so the
 * result adapts to what is actually arriving: a heading dropped onto a list item
 * becomes a list item (no heading can live inside a list), and a heading dropped
 * onto a heading nests by *level* rather than by list depth.
 */
export function inferChildContext(
	parent: OsmosisNode,
	child?: Pick<OsmosisNode, "type">,
): { type: OsmosisNode["type"]; depth: number } {
	// A list child keeps its own bullet/ordered flavor wherever it lands;
	// anything else joining a list takes the surrounding list's flavor.
	const listFlavor: OsmosisNode["type"] =
		child?.type === "ordered" ? "ordered" : "bullet";

	if (parent.type === "bullet" || parent.type === "ordered") {
		const type =
			child?.type === "bullet" || child?.type === "ordered"
				? child.type
				: parent.type;
		return { type, depth: parent.depth + 1 };
	}
	if (parent.type === "heading" && child?.type === "heading") {
		// Heading nesting is by level, not depth — one `#` deeper, clamped to
		// the six levels markdown has.
		return { type: "heading", depth: Math.min(6, parent.depth + 1) };
	}
	// Headings — and every multiline type, which cannot nest a list inside
	// itself — start their non-heading children at the top of a fresh list.
	return { type: listFlavor, depth: 0 };
}

/**
 * The offset, in the containing file's coordinates, where a new **direct child**
 * of `parent` belongs.
 *
 * For a list item this is just the end of its subtree: its last descendant is
 * genuinely its last child. A heading is not — it owns only the bytes *before
 * its first sub-heading*, so a line appended at {@link subtreeEnd} lands past a
 * `##` and markdown re-parents it under that sub-heading, several screens from
 * the node the user selected. The boundary is the first heading child's own
 * start.
 *
 * Transcluded children are skipped deliberately: an embed occupies a single
 * `![[…]]` line in *this* file, so a heading inside it splits the source note's
 * bytes, not these.
 */
export function childInsertOffset(parent: OsmosisNode): number {
	for (const child of parent.children) {
		if (child.embedHostRange) continue;
		if (child.type === "heading") return child.range.start;
	}
	return subtreeEnd(parent);
}

/**
 * The type and depth a node should take on when it is inserted as a sibling of
 * `neighbor` — the rule for a move that crosses into another file.
 *
 * The same-file drop rules infer from the drop's *tree parent*, whose depth is
 * expressed in the containing file's coordinates. That is wrong the moment the
 * destination is a different file: an embed sitting under a host bullet at
 * depth 2 renders its children at visual depth 3, but those lines are depth 0
 * in the source note. Inferring from the neighbor instead — the node the moved
 * subtree comes to sit beside, which by definition already lives in the
 * destination file — gets the destination's own coordinates for free.
 *
 * The precedence mirrors the same-file rule (`inferDropType`): a heading
 * neighbor wins over the moved node's own kind, because a non-heading line
 * inserted between two headings becomes a *child* of the one above it rather
 * than landing in the gap the user pointed at. Below that, list items keep
 * their own bullet/ordered flavor.
 */
export function inferSiblingContext(
	neighbor: OsmosisNode,
	moving: OsmosisNode,
): { type: OsmosisNode["type"]; depth: number } {
	if (neighbor.type === "heading") {
		return { type: "heading", depth: neighbor.depth };
	}
	const type: OsmosisNode["type"] =
		moving.type === "bullet" || moving.type === "ordered"
			? moving.type
			: neighbor.type;
	const depth =
		neighbor.type === "bullet" || neighbor.type === "ordered"
			? neighbor.depth
			: 0;
	return { type, depth };
}

/**
 * The span a contiguous run of siblings occupies, in their own containing
 * file's coordinates: the first node's start through the last node's subtree
 * end (which {@link subtreeEnd} already folds to host coordinates when the
 * subtree carries an embed).
 */
export function subtreeSpan(nodes: readonly OsmosisNode[]): Range {
	const first = nodes[0];
	const last = nodes[nodes.length - 1];
	if (!first || !last) return { start: 0, end: 0 };
	return { start: first.range.start, end: subtreeEnd(last) };
}

/**
 * Widen a removal span to swallow the blank lines around it, keeping a single
 * `\n` separator between what remains on either side. Without this, repeated
 * moves accumulate blank lines at every site a node has vacated.
 * `normalizeHeadingSpacing` re-adds the proper spacing around headings and
 * top-level code fences afterward.
 */
export function widenRemoval(text: string, span: Range): Range {
	let start = span.start;
	let end = span.end;
	while (start > 0 && text[start - 1] === "\n") start--;
	while (end < text.length && text[end] === "\n") end++;
	// Preserve one leading newline when there is content on both sides.
	if (start > 0 && end < text.length) start++;
	return { start, end };
}

/** Cut a span (already widened by {@link widenRemoval}) out of a file's text. */
export function removeSpan(text: string, span: Range): string {
	return text.slice(0, span.start) + text.slice(span.end);
}

/**
 * Splice a block into a file's text at `offset`, adding newline separators only
 * where the surrounding bytes don't already provide them. `shift` is how far
 * the insert moved every offset at or after `offset` — callers splicing the
 * *same* file afterward must add it to their remaining offsets.
 */
export function insertAt(
	text: string,
	offset: number,
	block: string,
): { text: string; shift: number } {
	const prefix = offset > 0 && text[offset - 1] !== "\n" ? "\n" : "";
	const suffix = offset < text.length && text[offset] !== "\n" ? "\n" : "";
	return {
		text: text.slice(0, offset) + prefix + block + suffix + text.slice(offset),
		shift: prefix.length + block.length + suffix.length,
	};
}

/**
 * Re-indent a subtree's text to match a new type/depth.
 * Adjusts the first line and all descendant lines proportionally.
 * Handles cross-type transitions (heading↔bullet) where depth semantics differ.
 */
export function reindentSubtree(
	text: string,
	originalNode: Pick<OsmosisNode, "type" | "depth" | "content" | "blockId">,
	newType: OsmosisNode["type"],
	newDepth: number,
): string {
	// Code blocks, tables, and blockquotes are atomic — never re-indent
	// their contents (blockquote `>` markers must stay intact).
	if (
		originalNode.type === "codeblock" ||
		originalNode.type === "table" ||
		originalNode.type === "blockquote"
	)
		return text;

	// When converting heading → list type, strip internal blank lines
	// that were added by normalizeHeadingSpacing — they break list nesting.
	// Not inside a fence, though: there a blank line is part of the code, and
	// dropping it rewrites the block's bytes.
	const crossingToList =
		originalNode.type === "heading" && newType !== "heading";
	const rawLines = text.split("\n");
	const fenced = crossingToList ? fencedLineMask(rawLines) : [];
	const lines = crossingToList
		? rawLines.filter((l, i) => l.trim() !== "" || fenced[i])
		: rawLines;
	const result: string[] = [];

	// Calculate child depth delta — depends on whether we're crossing type boundaries.
	// Heading children start at bullet depth 0; bullet children are at parent depth + 1.
	const oldChildBase =
		originalNode.type === "heading" || originalNode.type === "root" || originalNode.type === "paragraph"
			? 0
			: originalNode.depth + 1;
	const newChildBase =
		newType === "heading" || newType === "root" || newType === "paragraph" ? 0 : newDepth + 1;
	const childDepthDelta = newChildBase - oldChildBase;

	let inFence = false;
	let fenceChar = "";
	let fenceLen = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line === undefined) continue;
		if (line.trim() === "") {
			result.push(line);
			continue;
		}

		// Code block: leave all lines (fences + content) untouched
		const trimmed = line.trimStart();
		const fm = /^(`{3,}|~{3,})(.*)$/.exec(trimmed);
		if (inFence) {
			if (
				fm?.[1] &&
				fm[1].charAt(0) === fenceChar &&
				fm[1].length >= fenceLen &&
				(fm[2] ?? "").trim() === ""
			) {
				inFence = false;
			}
			result.push(line);
			continue;
		} else if (fm?.[1]) {
			inFence = true;
			fenceChar = fm[1].charAt(0);
			fenceLen = fm[1].length;
			result.push(line);
			continue;
		}

		if (i === 0) {
			// First line: serialize with new type and depth. Thread the block
			// ID through so it is preserved (content has it stripped).
			result.push(
				serializeLine(newType, newDepth, originalNode.content, originalNode.blockId),
			);
		} else {
			// Descendant lines: check if heading or list
			const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
			if (headingMatch?.[1]) {
				// Heading descendant: adjust heading level
				const oldLevel = headingMatch[1].length;
				const newLevel = Math.max(
					1,
					Math.min(6, oldLevel + childDepthDelta),
				);
				result.push(
					"#".repeat(newLevel) + " " + (headingMatch[2] ?? ""),
				);
			} else if (/^\s*\|/.test(line) || STANDALONE_BLOCK_ID_LINE.test(line)) {
				// A table row's pipes and a multiline block's standalone `^id`
				// line carry no depth: indenting a row breaks the table, and
				// indenting the ID line detaches it from the block it names.
				// (The invariant at the top of this file.)
				result.push(line);
			} else {
				// List/other descendant: adjust tab indentation
				const match = line.match(/^(\t*)([ ]*)/);
				const currentTabs = match?.[1]?.length ?? 0;
				const currentSpaces = match?.[2]?.length ?? 0;
				const currentDepth =
					currentTabs + Math.floor(currentSpaces / 2);
				const newTabDepth = Math.max(
					0,
					currentDepth + childDepthDelta,
				);
				result.push("\t".repeat(newTabDepth) + line.trimStart());
			}
		}
	}

	return result.join("\n");
}

/**
 * Renumber ordered list items so consecutive siblings at the same depth
 * are numbered sequentially (1, 2, 3, ...). Skips code fence contents.
 */
export function renumberOrderedLists(text: string): string {
	const lines = text.split("\n");
	let inCodeBlock = false;
	// Track the last ordered-list depth and per-depth counters.
	// A blank line or non-ordered-list line resets the counter for that depth.
	const counters = new Map<number, number>();
	let prevWasOrdered = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;

		// Track code fences
		const trimmed = line.trimStart();
		const fenceMatch = /^(`{3,}|~{3,})/.exec(trimmed);
		if (fenceMatch) {
			inCodeBlock = !inCodeBlock;
			continue;
		}
		if (inCodeBlock) continue;

		// Match ordered list lines: optional tabs/spaces, then digit(s), dot, space
		const match = /^(\t*)([ ]*)(\d+)\.\s+(.*)$/.exec(line);
		if (match?.[3] !== undefined && match[4] !== undefined) {
			const tabs = match[1]?.length ?? 0;
			const spaces = match[2]?.length ?? 0;
			const depth = tabs + Math.floor(spaces / 2);

			if (!prevWasOrdered) {
				// Start of a new ordered list group: reset all counters
				counters.clear();
			}

			const current = (counters.get(depth) ?? 0) + 1;
			counters.set(depth, current);
			// Clear counters for deeper levels (they restart if we come back)
			for (const [d] of counters) {
				if (d > depth) counters.delete(d);
			}
			prevWasOrdered = true;

			const indent = (match[1] ?? "") + (match[2] ?? "");
			lines[i] = `${indent}${String(current)}. ${match[4]}`;
		} else if (line.trim() === "") {
			// Blank line resets
			counters.clear();
			prevWasOrdered = false;
		} else {
			// Non-ordered content (bullet, heading, paragraph) — reset
			counters.clear();
			prevWasOrdered = false;
		}
	}

	return lines.join("\n");
}

/**
 * A line consisting only of a block ID — the form Obsidian uses for a
 * multiline block (code fence, table, blockquote), which cannot carry an
 * inline trailing ID. `extractTrailingBlockId` deliberately does not match
 * this shape, so it needs handling of its own.
 */
const STANDALONE_BLOCK_ID_LINE = /^\s*\^([a-zA-Z0-9-]+)\s*$/;

/**
 * Which lines are a code fence delimiter or fenced content — bytes where a
 * caret is just a caret, never a block ID. Mirrors the fence tracking in
 * {@link reindentSubtree}.
 */
function fencedLineMask(lines: readonly string[]): boolean[] {
	const mask: boolean[] = [];
	let inCodeBlock = false;
	let fenceChar = "";
	let fenceLen = 0;

	for (const line of lines) {
		const fence = /^(`{3,}|~{3,})(.*)$/.exec(line.trimStart());
		if (inCodeBlock) {
			mask.push(true);
			if (
				fence?.[1] &&
				fence[1].charAt(0) === fenceChar &&
				fence[1].length >= fenceLen &&
				(fence[2] ?? "").trim() === ""
			) {
				inCodeBlock = false;
			}
		} else if (fence?.[1]) {
			inCodeBlock = true;
			fenceChar = fence[1].charAt(0);
			fenceLen = fence[1].length;
			mask.push(true);
		} else {
			mask.push(false);
		}
	}
	return mask;
}

/**
 * Every block ID carried by a block of markdown, in both forms: the inline
 * trailing `^id` of a single-line node and the standalone `^id` line of a
 * multiline block. This is the set of card identities the bytes carry, so it
 * is read from the text that actually moves rather than from the tree — a
 * subtree containing an embed folds to its `![[…]]` line, whose transcluded
 * contents (and their IDs) stay behind in the source note.
 */
export function collectBlockIds(text: string): Set<string> {
	const lines = text.split("\n");
	const fenced = fencedLineMask(lines);
	const ids = new Set<string>();

	lines.forEach((line, i) => {
		if (fenced[i]) return;
		const standalone = STANDALONE_BLOCK_ID_LINE.exec(line);
		if (standalone?.[1]) {
			ids.add(standalone[1]);
			return;
		}
		const inline = extractTrailingBlockId(line);
		if (inline) ids.add(inline.id);
	});
	return ids;
}

/**
 * Strip every block ID out of a block of markdown: an inline trailing ID is
 * cut from its line, a standalone `^id` line is dropped whole. Indentation,
 * table pipes, and fenced code contents are left byte-for-byte alone.
 *
 * Used when pasting a *copy*: a duplicated line is a new line, so it must not
 * inherit the original's card identity (Osmosis mints a fresh ID on demand).
 */
export function stripBlockIds(text: string): string {
	const lines = text.split("\n");
	const fenced = fencedLineMask(lines);
	const result: string[] = [];

	lines.forEach((line, i) => {
		if (fenced[i]) {
			result.push(line);
			return;
		}
		if (STANDALONE_BLOCK_ID_LINE.test(line)) return;
		result.push(stripTrailingBlockId(line));
	});
	return result.join("\n");
}

/**
 * Split a note's `osmosis-schedule` frontmatter value into the entries whose
 * block IDs are leaving for another note and those staying behind.
 *
 * Entries are carried **verbatim** — whole objects, never re-serialized — so
 * `disabled: true` and any hand-added keys survive the move and an excluded
 * card stays excluded. A block ID with no entry is simply absent from `moved`.
 */
export function partitionScheduleEntries(
	raw: unknown,
	blockIds: ReadonlySet<string>,
): { moved: Record<string, unknown>; retained: Record<string, unknown> } {
	const moved: Record<string, unknown> = {};
	const retained: Record<string, unknown> = {};
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		return { moved, retained };
	}

	for (const [blockId, entry] of Object.entries(raw as Record<string, unknown>)) {
		if (blockIds.has(blockId)) moved[blockId] = entry;
		else retained[blockId] = entry;
	}
	return { moved, retained };
}

/**
 * Where the inline edit overlay goes and how big its text is, in viewport
 * pixels, for the current zoom.
 *
 * The overlay is a plain DOM box laid over an SVG node, so none of it scales
 * with the map's viewBox the way the node's own content does — every
 * dimension has to be multiplied by the zoom by hand. Keeping that arithmetic
 * here makes the two rules it encodes testable: the overlay's text is sized
 * exactly like the node's rendered text, and the overlay stops widening where
 * the node itself would stop, so typing wraps instead of running the box off
 * toward the viewport edge.
 */
export interface EditOverlayInput {
	/** The node's current on-screen rect (already zoomed), viewport coords. */
	nodeRect: { left: number; top: number; width: number; height: number };
	/** Bounds the overlay must stay inside, viewport coords, margins applied. */
	viewport: { left: number; top: number; right: number; bottom: number };
	/** Current map zoom factor. */
	zoom: number;
	/** The node's text metrics as rendered in the map, at zoom 1. */
	fontSize: number;
	lineHeight: number;
	/** Node content padding, at zoom 1. */
	paddingX: number;
	paddingY: number;
	/** The widest this node may grow before it wraps, at zoom 1. */
	maxNodeWidth: number;
}

export interface EditOverlayGeometry {
	left: number;
	top: number;
	minWidth: number;
	minHeight: number;
	maxWidth: number;
	maxHeight: number;
	fontSize: number;
	lineHeight: number;
	paddingX: number;
	paddingY: number;
}

export function editOverlayGeometry(input: EditOverlayInput): EditOverlayGeometry {
	const { nodeRect, viewport, zoom } = input;

	// The box may never be narrower than the node it covers, and never wider
	// than either the node's own wrap width or the room left on screen.
	const room = Math.max(viewport.right - nodeRect.left, 0);
	const maxWidth = Math.max(
		nodeRect.width,
		Math.min(input.maxNodeWidth * zoom, room),
	);
	const maxHeight = Math.max(nodeRect.height, viewport.bottom - nodeRect.top);

	return {
		left: nodeRect.left,
		top: nodeRect.top,
		minWidth: nodeRect.width,
		minHeight: nodeRect.height,
		maxWidth,
		maxHeight,
		fontSize: input.fontSize * zoom,
		lineHeight: input.lineHeight * zoom,
		paddingX: input.paddingX * zoom,
		paddingY: input.paddingY * zoom,
	};
}
