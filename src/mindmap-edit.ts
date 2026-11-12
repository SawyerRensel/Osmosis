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
import { normalizeBlockSpacing } from "./markdown-spacing";

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
			// Indentation is what nests an embed under the list item above it
			// (the parser reads an indented `![[…]]` as that item's content), so
			// a re-serialized embed has to keep it or a move pops it out of the
			// list. A list item that was *only* an embed (`- ![[Note]]`) comes
			// back bare: the bullet carried nothing else, and at the same depth
			// the line re-parses to the same place in the tree.
			return `${"\t".repeat(depth)}![[${content}]]${suffix}`;
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
 * A checkbox line with its box flipped: `[ ]` becomes `[x]` and either case of
 * `[x]` becomes `[ ]`, the first box only. `checked` is the state the line has
 * now, as the parser read it.
 */
export function toggleCheckboxLine(lineText: string, checked: boolean): string {
	return checked ? lineText.replace(/\[x\]/i, "[ ]") : lineText.replace("[ ]", "[x]");
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
 * The run of siblings a multi-selection takes in: from the first selected
 * sibling to the last, in order, with any unselected siblings between them (a
 * contiguous span, as Ctrl+Enter wraps and the mind map has always done).
 * Empty when none of `siblings` is selected.
 */
export function selectedSiblings(siblings: readonly OsmosisNode[], selected: ReadonlySet<string>): OsmosisNode[] {
	const first = siblings.findIndex((sibling) => selected.has(sibling.id));
	if (first === -1) return [];
	let last = siblings.length - 1;
	while (!selected.has(siblings[last]!.id)) last--;
	return siblings.slice(first, last + 1);
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
	// A heading that stays a heading carries its sub-headings with it: they
	// shift by however many levels the heading itself moved, so the relative
	// depth survives. (Heading children start at base 0, so childDepthDelta
	// is 0 here and says nothing about it.) Every other conversion keeps the
	// existing child delta.
	const headingDelta =
		originalNode.type === "heading" && newType === "heading"
			? newDepth - originalNode.depth
			: childDepthDelta;

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
					Math.min(6, oldLevel + headingDelta),
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
 * Re-nest a subtree whose node was retyped by an inline edit — a list item
 * renamed to `### Heading`, or a heading renamed to `- item`. Splicing the
 * edited line alone leaves the children indented for the node's old kind, which
 * re-parses as the wrong tree: an indented `#### Sub` is not a heading at all.
 *
 * `text` is the node's whole subtree as it is in the file (its own line first);
 * `line` is the edited line, indentation and block ID already restored.
 * Returns the replacement subtree, or null when the edit doesn't cross between
 * list and heading and the line can simply be spliced in.
 *
 * - List → heading: the heading moves to column 0 and every descendant loses
 *   the item's child indentation, so its children become top-level items under
 *   the heading. The prefix is stripped verbatim (tabs or spaces, whatever the
 *   file uses), so code inside a fence keeps its relative indentation.
 * - Heading → list: the heading's own content — everything up to its first
 *   sub-heading — is indented one level under the new item. Blank lines in it
 *   go (fences excepted), since a blank line ends the nesting. Sub-headings are
 *   left alone: a list item cannot contain a heading.
 */
export function retypeSubtree(
	text: string,
	oldType: OsmosisNode["type"],
	line: string,
): string | null {
	const isHeadingLine = (l: string): boolean => /^#{1,6}(\s|$)/.test(l);
	const isListLine = (l: string): boolean => /^\s*(?:[-*+]|\d+[.)])(\s|$)/.test(l);
	const rest = text.split("\n").slice(1);

	if ((oldType === "bullet" || oldType === "ordered") && isHeadingLine(line.trimStart())) {
		const prefix = /^[\t ]*/.exec(rest.find((l) => l.trim() !== "") ?? "")?.[0] ?? "";
		const body = rest.map((l) => {
			if (l.trim() === "") return l;
			return l.startsWith(prefix) ? l.slice(prefix.length) : l.trimStart();
		});
		return [line.trimStart(), ...body].join("\n");
	}

	if (oldType === "heading" && isListLine(line)) {
		const fenced = fencedLineMask(rest);
		const body: string[] = [];
		let i = 0;
		for (; i < rest.length; i++) {
			const l = rest[i]!;
			if (!fenced[i] && isHeadingLine(l)) break;
			if (l.trim() === "" && !fenced[i]) continue;
			body.push(l.trim() === "" ? l : "\t" + l);
		}
		// Keep the blank line that separated the content from the next heading.
		const tail = rest.slice(i);
		return [line, ...body, ...(tail.length > 0 ? ["", ...tail] : [])].join("\n");
	}

	return null;
}

/**
 * Apply a list ↔ heading rename to the file, moving the node to where its new
 * kind keeps the rest of the tree intact. Returns the new file content, or null
 * when the edit is not a list/heading crossing (see {@link retypeSubtree}).
 *
 * Markdown fixes a section's order: a heading owns everything below it until a
 * heading of its level or higher, so a parent's list items must all come before
 * its first sub-heading. Retyping a node in place silently re-parents whatever
 * follows — `- Herbs` below a new `### Vegetables` becomes Vegetables' child,
 * and a new `- Flowers` below `### Vegetables` lands inside that section. So:
 *
 * - List → heading: the block moves after the last following non-heading
 *   sibling. A nested item first leaves its list — a heading cannot sit inside
 *   one — so it is placed as if it were the top-level item containing it, and
 *   becomes that item's sibling.
 * - Heading → list: the block (sub-headings included — a list item cannot own
 *   them, so they pass to the old parent) moves before the first preceding
 *   heading sibling.
 *
 * `ancestors` runs from the node's parent up to the root. Only nodes in the
 * node's own file are positioned against; another file's content has no byte
 * order relative to this one.
 */
export function retypeInFile(
	content: string,
	node: OsmosisNode,
	ancestors: readonly OsmosisNode[],
	line: string,
): string | null {
	const start = node.range.start;
	const end = subtreeEnd(node);
	const block = retypeSubtree(content.slice(start, end), node.type, line);
	if (block === null) return null;

	// The span of `other` in the node's file, or null when it lives elsewhere.
	const spanOf = (other: OsmosisNode): Range | null => {
		if (node.embedHostRange) {
			// Top level of an embed: only that embed's own nodes share a file.
			return other.embedHostRange === node.embedHostRange
				? { start: other.range.start, end: subtreeEnd(other) }
				: null;
		}
		if (!node.isTranscluded && other.embedHostRange) return other.embedHostRange;
		if (sameEditTarget(node, other) && !other.embedHostRange) {
			return { start: other.range.start, end: subtreeEnd(other) };
		}
		return null;
	};

	// The node itself, or for a nested item, the top-level list item holding it:
	// whichever sits directly under a heading or the root.
	let placed = node;
	let parent: OsmosisNode | null = ancestors[0] ?? null;
	for (let i = 0; parent && parent.type !== "heading" && parent.type !== "root"; i++) {
		placed = parent;
		parent = ancestors[i + 1] ?? null;
	}
	if (placed !== node && !spanOf(placed)) {
		return content.slice(0, start) + block + content.slice(end);
	}

	const siblings: Array<Range & { heading: boolean }> = [];
	for (const sib of parent?.children ?? []) {
		if (sib === placed) continue;
		const span = spanOf(sib);
		if (span) siblings.push({ ...span, heading: sib.type === "heading" });
	}

	// Cut the node's block along with one adjacent newline.
	let cutStart = start;
	let cutEnd = end;
	if (cutEnd < content.length && content[cutEnd] === "\n") cutEnd++;
	else if (cutStart > 0 && content[cutStart - 1] === "\n") cutStart--;
	const cut = content.slice(0, cutStart) + content.slice(cutEnd);
	// An offset in `content` mapped into `cut`.
	const inCut = (offset: number): number =>
		offset >= cutEnd ? offset - (cutEnd - cutStart) : Math.min(offset, cutStart);

	if (node.type !== "heading") {
		const placedStart = placed === node ? start : spanOf(placed)!.start;
		const ends = siblings.filter((s) => !s.heading && s.start > placedStart).map((s) => s.end);
		if (placed !== node) ends.push(subtreeEnd(placed));
		if (ends.length === 0) return content.slice(0, start) + block + content.slice(end);
		const target = inCut(Math.max(...ends));
		return cut.slice(0, target) + "\n" + block + cut.slice(target);
	}

	const before = siblings.filter((s) => s.heading && s.start < start);
	if (before.length === 0) return content.slice(0, start) + block + content.slice(end);
	// Land on the line after the previous content, ahead of the blank line(s)
	// that separate it from the heading.
	let target = inCut(Math.min(...before.map((s) => s.start)));
	while (target >= 2 && cut[target - 1] === "\n" && cut[target - 2] === "\n") target--;
	return cut.slice(0, target) + block + "\n" + cut.slice(target);
}

/**
 * Replace a node's line in `content` with the line the inline editor produced,
 * as the mind map's rename does. `newLine` is the editor's text (see
 * {@link nodeEditText}); the indentation and block ID it withheld are put back.
 *
 * A list item renamed to a heading (or back) takes its children with it and
 * moves to where its new kind keeps its parent ({@link retypeInFile}), and
 * `retyped` says so; any other rename is just the one line. `ancestors` runs
 * from the node's parent up to the root.
 */
export function renameInFile(
	content: string,
	src: OsmosisNode,
	ancestors: readonly OsmosisNode[],
	newLine: string,
): { text: string; retyped: boolean } {
	const line = restoreEditedLine(src, newLine);
	const retyped = retypeInFile(content, src, ancestors, line);
	if (retyped === null) {
		return { text: content.slice(0, src.range.start) + line + content.slice(src.range.end), retyped: false };
	}
	return { text: retyped, retyped: true };
}

/**
 * What a node edit writes for the text it produced: ordered lists renumbered,
 * then block spacing normalised. Both views' write paths apply these two in
 * this order (the mind map in `writeNodeFile` then `writeMarkdown`).
 */
export function normalizeWrite(content: string): string {
	return normalizeBlockSpacing(renumberOrderedLists(content)).content;
}

// ─── Structural edits within one file ────────────────────
//
// What the mind map does for Tab, Enter, Ctrl+Enter, Delete and the Alt-arrows,
// as pure text-in, text-out computations, so the 3D graph writes the same bytes.
// Each returns the file's text *before* `normalizeWrite`, with `start`: where
// the line the edit is about begins in that text (the new line, or the first
// line of the block that moved). The mind map's cross-file branches (a move
// across an embed seam) stay in the view.

/** A structural edit's result: the new text, and where the edit's line starts in it. */
export interface Spliced {
	text: string;
	start: number;
	/** Insert parent only: where the block that moved under the new line starts. */
	moved?: number;
}

/** The type a child takes on under `parent` when it is indented there or dropped there. */
export function inferChildType(parent: OsmosisNode): OsmosisNode["type"] {
	if (parent.type === "heading" || parent.type === "root") return "bullet";
	return parent.type;
}

/** The depth a child takes on under `parent`. */
export function inferChildDepth(parent: OsmosisNode): number {
	if (parent.type === "heading" || parent.type === "root") return 0;
	return parent.depth + 1;
}

/**
 * Heading level a root child takes when promoted to a heading: the nearest
 * heading sibling's, outward from `index`, else h1.
 */
export function inferRootHeadingLevel(root: OsmosisNode, index: number): number {
	const siblings = root.children;
	for (let dist = 1; dist < siblings.length; dist++) {
		for (const i of [index - dist, index + dist]) {
			const sib = siblings[i];
			if (sib?.type === "heading") return sib.depth;
		}
	}
	return 1;
}

/**
 * The type a node takes on when indented under a new parent. Headings under
 * headings stay headings (deeper); anything else becomes a child of the parent.
 */
export function inferIndentType(newParent: OsmosisNode, movingNode: OsmosisNode): OsmosisNode["type"] {
	if (movingNode.type === "heading" && (newParent.type === "heading" || newParent.type === "root")) {
		return "heading";
	}
	return inferChildType(newParent);
}

/** The depth a node takes on when indented under a new parent. Headings get parent depth + 1. */
export function inferIndentDepth(newParent: OsmosisNode, movingNode: OsmosisNode): number {
	if (movingNode.type === "heading" && (newParent.type === "heading" || newParent.type === "root")) {
		return Math.min(6, newParent.depth + 1);
	}
	return inferChildDepth(newParent);
}

/**
 * Type and depth a node takes on when outdented to become its parent's
 * sibling. Shared by the same-file splice and the cross-file move so a node
 * promoted *out* of an embed lands at the level it would have landed at had
 * both lines lived in one file.
 */
export function outdentContext(
	nodeSrc: OsmosisNode,
	parentSrc: OsmosisNode,
): { type: OsmosisNode["type"]; depth: number } {
	// Becoming a sibling of parent — preserve node's own list type.
	// Only switch type for heading transitions.
	let type: OsmosisNode["type"];
	if (nodeSrc.type === "heading" && parentSrc.type === "heading") {
		type = "heading";
	} else if (
		(nodeSrc.type === "bullet" || nodeSrc.type === "ordered") &&
		nodeSrc.depth === 0 &&
		parentSrc.type === "heading"
	) {
		// Depth-0 list item directly under a heading: promote to paragraph
		// (progressive: bullet → paragraph → heading on successive outdents)
		type = "paragraph";
	} else if (nodeSrc.type === "bullet" || nodeSrc.type === "ordered") {
		// Nested list items keep their own type when outdenting
		type = nodeSrc.type;
	} else {
		type = parentSrc.type;
	}
	return { type, depth: parentSrc.depth };
}

/** Increase every heading level in a subtree's text by 1 (## → ###); h6 stays. */
export function indentSubtreeHeadings(text: string): string {
	return text
		.split("\n")
		.map((line) => {
			const headingMatch = line.match(/^(#{1,5})\s/);
			if (headingMatch && headingMatch[1]) {
				return "#" + line;
			}
			return line;
		})
		.join("\n");
}

/**
 * Add an empty child under `parent`: a new line at the parent's child
 * boundary (for a heading, before its first sub-heading).
 */
export function insertChild(content: string, parent: OsmosisNode): Spliced {
	const { type, depth } = inferChildContext(parent);
	const newLine = serializeLine(type, depth, "");
	const insertPos = childInsertOffset(parent);
	const prefix = insertPos > 0 && content[insertPos - 1] !== "\n" ? 1 : 0;
	return { text: insertAt(content, insertPos, newLine).text, start: insertPos + prefix };
}

/**
 * Add an empty sibling after `src`'s subtree, at its level; a sibling of a
 * checkbox is an unchecked checkbox. Paragraphs and the multiline kinds need a
 * blank line between, and a zero-width space as the placeholder (`trim()` keeps it).
 */
export function insertSibling(content: string, src: OsmosisNode): Spliced {
	const newContent = src.metadata?.checkbox ? "[ ] " : "";
	const insertPos = subtreeEnd(src);
	let insertText: string;
	let lead: number;
	if (
		src.type === "paragraph" ||
		src.type === "codeblock" ||
		src.type === "table" ||
		src.type === "blockquote"
	) {
		insertText = "\n\n​";
		lead = 2;
	} else {
		insertText = "\n" + serializeLine(src.type, src.depth, newContent);
		lead = 1;
	}
	return {
		text: content.slice(0, insertPos) + insertText + content.slice(insertPos),
		start: insertPos + lead,
	};
}

/**
 * Add an empty sibling before `src`, at its level (Shift+Enter): the mirror of
 * {@link insertSibling}, with the same placeholder rules. `start` is where the
 * new line starts. The virtual root has nothing above it, so it gets what Enter
 * gives it, a sibling after.
 */
export function insertSiblingBefore(content: string, src: OsmosisNode): Spliced {
	if (src.type === "root") return insertSibling(content, src);
	const newContent = src.metadata?.checkbox ? "[ ] " : "";
	const insertPos = src.range.start;
	const blockLike =
		src.type === "paragraph" ||
		src.type === "codeblock" ||
		src.type === "table" ||
		src.type === "blockquote";
	if (!blockLike) {
		const line = serializeLine(src.type, src.depth, newContent);
		return { text: content.slice(0, insertPos) + line + "\n" + content.slice(insertPos), start: insertPos };
	}
	// A paragraph is only its own block with a blank line above it, or it would merge into the line before.
	const before = content.slice(0, insertPos);
	const lead = before === "" || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
	return {
		text: before + lead + "​\n\n" + content.slice(insertPos),
		start: insertPos + lead.length,
	};
}

/**
 * Delete `src` and its subtree, also consuming the newline before it (else the
 * one after) so no blank line is left behind.
 */
export function deleteSubtree(content: string, src: OsmosisNode): string {
	const start = src.range.start;
	const end = subtreeEnd(src);

	let deleteStart = start;
	let deleteEnd = end;

	if (deleteStart > 0 && content[deleteStart - 1] === "\n") {
		deleteStart--;
	} else if (deleteEnd < content.length && content[deleteEnd] === "\n") {
		deleteEnd++;
	}

	return content.slice(0, deleteStart) + content.slice(deleteEnd);
}

/**
 * Swap a run of adjacent siblings with the sibling beside it (Alt+Up/Down):
 * `selected` in document order, `swap` the neighbour. The whole range spanning
 * both, gaps and surrounding blank lines included, is rewritten with the two
 * texts joined by "\n"; `normalizeWrite` re-adds the blank lines around headings
 * and top-level code fences.
 */
export function moveSiblings(content: string, selected: readonly OsmosisNode[], swap: OsmosisNode): Spliced {
	const blockStart = selected[0]!.range.start;
	const blockEnd = subtreeEnd(selected[selected.length - 1]!);
	const blockText = content.slice(blockStart, blockEnd);

	const swapStart = swap.range.start;
	const swapEnd = subtreeEnd(swap);
	const swapText = content.slice(swapStart, swapEnd);

	const rangeStart = Math.min(blockStart, swapStart);
	const rangeEnd = Math.max(blockEnd, swapEnd);

	// Strip trailing blank lines before the swap range
	let headEnd = rangeStart;
	while (headEnd > 0 && content[headEnd - 1] === "\n") {
		headEnd--;
	}
	const head = headEnd > 0 ? content.slice(0, headEnd) + "\n" : "";

	// Strip leading blank lines after the swap range
	let tailPos = rangeEnd;
	while (tailPos < content.length && content[tailPos] === "\n") {
		tailPos++;
	}
	const tail =
		tailPos < content.length
			? "\n" + content.slice(tailPos)
			: content.slice(rangeEnd);

	if (blockStart < swapStart) {
		return { text: head + swapText + "\n" + blockText + tail, start: head.length + swapText.length + 1 };
	}
	return { text: head + blockText + "\n" + swapText + tail, start: head.length };
}

/**
 * Indent a run of adjacent siblings under the sibling before them (Alt+Right):
 * each subtree is re-levelled for its new parent and appended after
 * `prevSibling`'s subtree.
 */
export function indentSiblings(content: string, selected: readonly OsmosisNode[], prevSibling: OsmosisNode): Spliced {
	const blockStart = selected[0]!.range.start;
	const blockEnd = subtreeEnd(selected[selected.length - 1]!);

	// Re-indent each selected node's subtree individually
	const reindented = selected
		.map((nodeSrc) =>
			reindentSubtree(
				content.slice(nodeSrc.range.start, subtreeEnd(nodeSrc)),
				nodeSrc,
				inferIndentType(prevSibling, nodeSrc),
				inferIndentDepth(prevSibling, nodeSrc),
			),
		)
		.join("\n");

	// Remove block from current position
	let removeStart = blockStart;
	if (removeStart > 0 && content[removeStart - 1] === "\n") {
		removeStart--;
	}

	// Insert at end of previous sibling's subtree
	const insertPos = subtreeEnd(prevSibling);
	const prefix = insertPos > 0 && content[insertPos - 1] !== "\n" ? "\n" : "";

	const withoutBlock = content.slice(0, removeStart) + content.slice(blockEnd);
	return {
		text: withoutBlock.slice(0, insertPos) + prefix + reindented + withoutBlock.slice(insertPos),
		start: insertPos + prefix.length,
	};
}

/**
 * Outdent a run of adjacent siblings of `parent` (Alt+Left). A child of the
 * root promotes in place instead — list item to paragraph to heading — and null
 * says it can't (a heading or other type at the root). Otherwise the subtrees
 * are re-levelled and placed after the parent's subtree.
 */
export function outdentSiblings(content: string, parent: OsmosisNode, selected: readonly OsmosisNode[]): Spliced | null {
	const first = selected[0]!;
	const blockStart = first.range.start;
	const blockEnd = subtreeEnd(selected[selected.length - 1]!);
	const subtreeText = (nodeSrc: OsmosisNode): string => content.slice(nodeSrc.range.start, subtreeEnd(nodeSrc));

	if (parent.type === "root") {
		let newType: OsmosisNode["type"];
		let newDepth: number;
		if (first.type === "bullet" || first.type === "ordered") {
			newType = "paragraph";
			newDepth = 0;
		} else if (first.type === "paragraph") {
			newType = "heading";
			// Match neighboring heading siblings, default to h1
			newDepth = inferRootHeadingLevel(parent, parent.children.indexOf(first));
		} else {
			return null; // headings and other types can't promote further at root
		}
		const reindented = selected
			.map((nodeSrc) => reindentSubtree(subtreeText(nodeSrc), nodeSrc, newType, newDepth))
			.join("\n");
		return {
			text: content.slice(0, blockStart) + reindented + content.slice(blockEnd),
			start: blockStart,
		};
	}

	// Re-indent each selected node's subtree individually
	const reindented = selected
		.map((nodeSrc) => {
			const { type, depth } = outdentContext(nodeSrc, parent);
			return reindentSubtree(subtreeText(nodeSrc), nodeSrc, type, depth);
		})
		.join("\n");

	// Remove block from current position
	let removeStart = blockStart;
	if (removeStart > 0 && content[removeStart - 1] === "\n") {
		removeStart--;
	}

	// Insert after parent's subtree
	const parentEnd = subtreeEnd(parent);

	const withoutBlock = content.slice(0, removeStart) + content.slice(blockEnd);
	const removedLength = blockEnd - removeStart;
	const adjustedParentEnd = parentEnd - removedLength;

	const prefix =
		adjustedParentEnd > 0 && withoutBlock[adjustedParentEnd - 1] !== "\n" ? "\n" : "";
	return {
		text:
			withoutBlock.slice(0, adjustedParentEnd) +
			prefix +
			reindented +
			withoutBlock.slice(adjustedParentEnd),
		start: adjustedParentEnd + prefix.length,
	};
}

/**
 * Put an empty parent above `span` (Ctrl+Enter): a line of `src`'s type and
 * depth, with the block under it indented one level (headings go a level
 * deeper). `src` is the node the gesture is on; `span` the block it takes in,
 * which is more than `src`'s subtree for a multi-selection.
 */
export function insertParent(content: string, src: OsmosisNode, span: Range): Spliced {
	const blockText = content.slice(span.start, span.end);
	const newParentLine = serializeLine(src.type, src.depth, "");

	// Indent all selected subtrees by 1 level
	let indentedSubtree: string;
	if (src.type === "heading") {
		indentedSubtree = indentSubtreeHeadings(blockText);
	} else {
		indentedSubtree = blockText
			.split("\n")
			.map((line) => (line.trim() === "" ? line : "\t" + line))
			.join("\n");
	}

	return {
		text: content.slice(0, span.start) + newParentLine + "\n" + indentedSubtree + content.slice(span.end),
		start: span.start,
		moved: span.start + newParentLine.length + 1,
	};
}

// ─── Drag and drop ───────────────────────────────────────
//
// The mind map's drop rules and its same-file move, shared with the 3D graph's
// "Move under / Move after". A drop's destination is a (parent, index) gap;
// `resolveInsertSite` turns it into a file and an offset.

/**
 * The type a node takes on when dropped at `dropIndex` under `targetParent`.
 * Unlike indent (which makes children), a drop places the node as a sibling of
 * the children there: between heading siblings a non-heading is promoted to a
 * heading, and a list item keeps its own type.
 */
export function inferDropType(
	targetParent: OsmosisNode,
	dropIndex: number,
	movingNode: OsmosisNode,
): OsmosisNode["type"] {
	if (targetParent.type === "heading" || targetParent.type === "root") {
		// Check if neighboring siblings at the drop position are headings
		const neighbor =
			targetParent.children[dropIndex] ??
			targetParent.children[dropIndex - 1];
		if (neighbor?.type === "heading") return "heading";
	}
	// List items preserve their own type
	if (movingNode.type === "bullet" || movingNode.type === "ordered") {
		return movingNode.type;
	}
	return inferChildType(targetParent);
}

/** The depth a dropped node of type `dropType` takes: its heading neighbours' level, else a child's depth. */
export function inferDropDepth(
	targetParent: OsmosisNode,
	dropIndex: number,
	dropType: OsmosisNode["type"],
): number {
	if (dropType === "heading") {
		const neighbor =
			targetParent.children[dropIndex] ??
			targetParent.children[dropIndex - 1];
		if (neighbor?.type === "heading") return neighbor.depth;
		return Math.min(6, targetParent.depth + 1);
	}
	return inferChildDepth(targetParent);
}

/** The type and depth `movingNode` is re-levelled to when dropped at `dropIndex` under `targetParent`. */
export function dropContext(
	targetParent: OsmosisNode,
	dropIndex: number,
	movingNode: OsmosisNode,
): { type: OsmosisNode["type"]; depth: number } {
	const type = inferDropType(targetParent, dropIndex, movingNode);
	return { type, depth: inferDropDepth(targetParent, dropIndex, type) };
}

/**
 * Move a run of siblings (and their subtrees) to `offset` in their own file: a
 * drop that stays in one note. Each subtree is re-levelled by `context`. One
 * splice, so the removal shifts the insert offset; the two orders below keep
 * that arithmetic straight. `start` is where the moved block begins in `text`.
 */
export function moveWithinFile(
	content: string,
	selected: readonly OsmosisNode[],
	offset: number,
	context: (src: OsmosisNode) => { type: OsmosisNode["type"]; depth: number },
): Spliced {
	// Re-indent each selected node's subtree individually
	const reindentedParts: string[] = [];
	for (const nodeSrc of selected) {
		const nodeText = content.slice(nodeSrc.range.start, subtreeEnd(nodeSrc));
		const ctx = context(nodeSrc);
		reindentedParts.push(reindentSubtree(nodeText, nodeSrc, ctx.type, ctx.depth));
	}
	const dragText = reindentedParts.join("\n");

	const span = widenRemoval(content, subtreeSpan(selected));
	const prefixAt = (text: string, at: number): number => (at > 0 && text[at - 1] !== "\n" ? 1 : 0);

	if (span.start < offset) {
		// Dragging forward: remove first, then adjust the insert offset.
		const afterRemove = removeSpan(content, span);
		const adjusted = offset - (span.end - span.start);
		return {
			text: insertAt(afterRemove, adjusted, dragText).text,
			start: adjusted + prefixAt(afterRemove, adjusted),
		};
	}
	// Dragging backward: insert first, then remove at the shifted span.
	const inserted = insertAt(content, offset, dragText);
	return {
		text: removeSpan(inserted.text, {
			start: span.start + inserted.shift,
			end: span.end + inserted.shift,
		}),
		start: offset + prefixAt(content, offset),
	};
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
