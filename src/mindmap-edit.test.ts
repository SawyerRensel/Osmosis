import { describe, it, expect } from "vitest";
import { OsmosisParser } from "./parser";
import { TransclusionResolver, TransclusionApp } from "./transclusion";
import { ParseCache } from "./cache";
import type { OsmosisNode, OsmosisTree } from "./types";
import {
	editOverlayGeometry,
	serializeLine,
	subtreeEnd,
	subtreeHostEnd,
	nodeHostStart,
	sameEditTarget,
	reindentSubtree,
	renumberOrderedLists,
	buildContainingFileMap,
	resolveInsertSite,
	inferSiblingContext,
	inferChildContext,
	childInsertOffset,
	subtreeSpan,
	selectedSiblings,
	widenRemoval,
	removeSpan,
	insertAt,
	mergeEdit,
	collapseEditGroup,
	editBytes,
	collectBlockIds,
	stripBlockIds,
	partitionScheduleEntries,
	nodeEditText,
	restoreEditedLine,
	nodeIndent,
	reattachBlockId,
	editSelectionStart,
	retypeSubtree,
	retypeInFile,
	toggleCheckboxLine,
	renameInFile,
	normalizeWrite,
	insertChild,
	insertSibling,
	insertSiblingBefore,
	deleteSubtree,
	moveSiblings,
	indentSiblings,
	outdentSiblings,
	insertParent,
	dropContext,
	moveWithinFile,
	inferChildType,
	inferChildDepth,
	inferIndentType,
	inferIndentDepth,
	outdentContext,
	inferRootHeadingLevel,
	indentSubtreeHeadings,
	insertBlock,
	cutBlock,
} from "./mindmap-edit";
import { normalizeBlockSpacing } from "./markdown-spacing";
import { separateRuns } from "./line-groups";
import type { FileEdit } from "./mindmap-edit";

const parser = new OsmosisParser();

/**
 * Minimal in-memory app for TransclusionResolver: resolves `linkpath` → file and
 * serves each file's markdown. Enough to exercise real expansion so the
 * embed-boundary span math runs against genuine source-vs-host coordinates.
 */
function mockApp(
	fileMap: Record<string, { path: string }>,
	contentMap: Record<string, string>,
): TransclusionApp {
	return {
		metadataCache: {
			getFirstLinkpathDest: (linkpath: string) => fileMap[linkpath] ?? null,
		},
		vault: {
			getFileByPath: (path: string) => fileMap[path] ?? null,
			read: async (file: { path: string }) => contentMap[file.path] ?? "",
		},
	};
}

/** Parse `host` and expand its embeds, resolving `link` → `sourceContent`. */
async function parseWithEmbed(
	host: string,
	link: string,
	sourcePath: string,
	sourceContent: string,
): Promise<OsmosisTree> {
	const cache = new ParseCache();
	const tree = parser.parse(host, "host.md");
	const app = mockApp(
		{ [link]: { path: sourcePath }, [sourcePath]: { path: sourcePath } },
		{ [sourcePath]: sourceContent },
	);
	await new TransclusionResolver(app, cache).expandTree(tree);
	return tree;
}

const HOST_PATH = "host.md";

/**
 * Build a host tree over an in-memory vault, deferring expansion so a test can
 * pass `skipIds` (the lazy-loading path). Every file is reachable both by path
 * and by its extension-less link name.
 */
function prepareVault(
	host: string,
	files: Record<string, string>,
): { tree: OsmosisTree; expand: (skipIds?: Set<string>) => Promise<void> } {
	const cache = new ParseCache();
	const tree = parser.parse(host, HOST_PATH);
	const contentMap = { ...files, [HOST_PATH]: host };
	const fileMap: Record<string, { path: string }> = {};
	for (const path of Object.keys(contentMap)) {
		fileMap[path] = { path };
		fileMap[path.replace(/\.md$/, "")] = { path };
	}
	const resolver = new TransclusionResolver(mockApp(fileMap, contentMap), cache);
	return { tree, expand: (skipIds) => resolver.expandTree(tree, skipIds) };
}

/** Parse `host.md` against an in-memory vault and expand every embed it reaches. */
async function parseVault(
	host: string,
	files: Record<string, string>,
): Promise<OsmosisTree> {
	const { tree, expand } = prepareVault(host, files);
	await expand();
	return tree;
}

/** Depth-first search for the first node whose content equals `content`. */
function findByContent(node: OsmosisNode, content: string): OsmosisNode {
	if (node.content === content) return node;
	for (const child of node.children) {
		const found = tryFindByContent(child, content);
		if (found) return found;
	}
	throw new Error(`node with content ${JSON.stringify(content)} not found`);
}
function tryFindByContent(node: OsmosisNode, content: string): OsmosisNode | null {
	if (node.content === content) return node;
	for (const child of node.children) {
		const found = tryFindByContent(child, content);
		if (found) return found;
	}
	return null;
}

/** Minimal node factory for the pure predicate tests. */
function node(overrides: Partial<OsmosisNode>): OsmosisNode {
	return {
		id: "x",
		type: "bullet",
		depth: 0,
		content: "",
		children: [],
		range: { start: 0, end: 0 },
		isTranscluded: false,
		...overrides,
	};
}

// ── serializeLine: block IDs survive re-serialization (root cause B) ──────────
describe("serializeLine preserves the trailing block ID", () => {
	it("appends the ID for single-line node types", () => {
		expect(serializeLine("bullet", 0, "Alpha", "os-abc")).toBe("- Alpha ^os-abc");
		expect(serializeLine("bullet", 2, "Alpha", "os-abc")).toBe("\t\t- Alpha ^os-abc");
		expect(serializeLine("heading", 2, "Alpha", "os-abc")).toBe("## Alpha ^os-abc");
		expect(serializeLine("ordered", 1, "Alpha", "os-abc")).toBe("\t1. Alpha ^os-abc");
		expect(serializeLine("paragraph", 0, "Alpha", "os-abc")).toBe("Alpha ^os-abc");
	});

	it("omits the suffix when there is no block ID (unchanged behavior)", () => {
		expect(serializeLine("bullet", 0, "Alpha")).toBe("- Alpha");
		expect(serializeLine("heading", 1, "Alpha")).toBe("# Alpha");
		expect(serializeLine("ordered", 0, "Alpha")).toBe("1. Alpha");
		expect(serializeLine("paragraph", 0, "Alpha")).toBe("Alpha");
	});

	it("indents a transclusion to its depth", () => {
		// Indentation is what nests an embed under the list item above it, so a
		// move that re-serializes one at depth 2 has to write the tabs back or
		// the embed pops out of the list it was in.
		expect(serializeLine("transclusion", 0, "Note")).toBe("![[Note]]");
		expect(serializeLine("transclusion", 2, "Note")).toBe("\t\t![[Note]]");
		expect(serializeLine("transclusion", 1, "Note", "os-abc")).toBe(
			"\t![[Note]] ^os-abc",
		);
	});

	it("never inlines an ID onto multiline block bodies", () => {
		// table/blockquote carry their ID on a separate `^id` line, not inline.
		expect(serializeLine("table", 0, "| a | b |", "os-x")).toBe("| a | b |");
		expect(serializeLine("blockquote", 0, "> quote", "os-x")).toBe("> quote");
	});

	it("round-trips a parsed bullet-with-ID through content+blockId", () => {
		const tree = parser.parse("- Alpha ^os-abc123", "f.md");
		const n = findByContent(tree.root, "Alpha");
		expect(n.blockId).toBe("os-abc123");
		expect(serializeLine(n.type, n.depth, n.content, n.blockId)).toBe(
			"- Alpha ^os-abc123",
		);
	});
});

// ── inline editing shows the whole source line, markers and all ──────────────
describe("nodeEditText exposes every markdown element", () => {
	/** The line the edit box opens on, for a node parsed out of `md`. */
	const editTextFor = (md: string, content: string): string =>
		nodeEditText(findByContent(parser.parse(md, "f.md").root, content));

	it("keeps the bullet marker but not the indentation the map already draws", () => {
		// A tab-indented line reads as an indented code block in the editor,
		// which is what dropped the whole node into source styling.
		expect(editTextFor("- Alpha\n\t- Beta", "Alpha")).toBe("- Alpha");
		expect(editTextFor("- Alpha\n\t- Beta", "Beta")).toBe("- Beta");
		expect(editTextFor("- Alpha\n  - Beta", "Beta")).toBe("- Beta");
	});

	it("keeps heading hashes, ordered numbers, and the embed wrapper", () => {
		expect(editTextFor("## Alpha", "Alpha")).toBe("## Alpha");
		expect(editTextFor("3. Alpha", "Alpha")).toBe("3. Alpha");
		expect(editTextFor("![[Other Note]]", "Other Note")).toBe("![[Other Note]]");
	});

	it("keeps the checkbox marker the old editor stripped", () => {
		expect(editTextFor("- [x] Alpha", "[x] Alpha")).toBe("- [x] Alpha");
		expect(editTextFor("- [ ] Alpha", "[ ] Alpha")).toBe("- [ ] Alpha");
	});

	it("hides the trailing block ID — identity, not text", () => {
		expect(editTextFor("- Alpha ^os-abc123", "Alpha")).toBe("- Alpha");
		expect(editTextFor("## Alpha ^os-abc123", "Alpha")).toBe("## Alpha");
	});

	it("shows a multiline block verbatim", () => {
		const md = "> [!note] Title\n> Body\n^os-q1";
		expect(editTextFor(md, "> [!note] Title\n> Body")).toBe(
			"> [!note] Title\n> Body",
		);
	});

	it("falls back to a re-serialized line when a node has no raw", () => {
		expect(nodeEditText(node({ type: "bullet", depth: 1, content: "Alpha" }))).toBe(
			"- Alpha",
		);
	});
});

describe("nodeIndent", () => {
	it("reports a single-line node's leading whitespace", () => {
		expect(nodeIndent("bullet", "\t\t- Alpha")).toBe("\t\t");
		expect(nodeIndent("bullet", "  - Alpha")).toBe("  ");
		expect(nodeIndent("heading", "## Alpha")).toBe("");
	});

	it("claims none of a multiline block's bytes", () => {
		// `>` and fence alignment are content, not depth.
		expect(nodeIndent("blockquote", "> quote")).toBe("");
		expect(nodeIndent("codeblock", "\t```\n\tx\n\t```")).toBe("");
		expect(nodeIndent("table", "  | a |")).toBe("");
	});
});

describe("restoreEditedLine inverts nodeEditText", () => {
	/** Every node in `md`, so a round-trip can be asserted over all of them. */
	const nodesOf = (md: string): OsmosisNode[] => {
		const out: OsmosisNode[] = [];
		const walk = (n: OsmosisNode): void => {
			out.push(n);
			n.children.forEach(walk);
		};
		parser.parse(md, "f.md").root.children.forEach(walk);
		return out;
	};

	it("round-trips an unchanged edit to the original bytes", () => {
		const md = [
			"## Title",
			"",
			"- Alpha ^os-a1",
			"\t- [x] Beta",
			"\t\t3. Gamma ^os-g1",
			"  * Space indented",
			"",
			"> [!note] Callout",
			"> Body",
			"",
			"| a | b |",
			"| - | - |",
		].join("\n");
		for (const n of nodesOf(md)) {
			const line = restoreEditedLine(n, nodeEditText(n));
			expect(line).toBe(md.slice(n.range.start, n.range.end));
		}
	});

	it("restores the node's own indentation, not the map's idea of depth", () => {
		const n = findByContent(parser.parse("- Alpha\n  - Beta", "f.md").root, "Beta");
		// Two spaces in, two spaces out — the file's convention survives.
		expect(restoreEditedLine(n, "- Renamed")).toBe("  - Renamed");
	});

	it("keeps indentation when the line changes kind", () => {
		const n = findByContent(parser.parse("- Alpha\n\t- Beta ^os-b1", "f.md").root, "Beta");
		expect(restoreEditedLine(n, "Beta")).toBe("\tBeta ^os-b1");
	});
});

describe("reattachBlockId", () => {
	it("re-appends the ID an inline edit never saw", () => {
		expect(reattachBlockId("bullet", "- Alpha", "os-abc")).toBe("- Alpha ^os-abc");
		expect(reattachBlockId("heading", "## Alpha", "os-abc")).toBe("## Alpha ^os-abc");
	});

	it("survives a line that changed kind during the edit", () => {
		// `- Alpha ^os-abc` retyped as a heading keeps its card identity.
		expect(reattachBlockId("bullet", "## Alpha", "os-abc")).toBe("## Alpha ^os-abc");
	});

	it("leaves multiline blocks alone — their ID is on its own line", () => {
		expect(reattachBlockId("blockquote", "> quote", "os-x")).toBe("> quote");
		expect(reattachBlockId("table", "| a |", "os-x")).toBe("| a |");
		expect(reattachBlockId("codeblock", "```\nx\n```", "os-x")).toBe("```\nx\n```");
	});

	it("does not double an ID the user typed themselves", () => {
		expect(reattachBlockId("bullet", "- Alpha ^os-typed", "os-abc")).toBe(
			"- Alpha ^os-typed",
		);
	});

	it("is a no-op when the node has no ID", () => {
		expect(reattachBlockId("bullet", "- Alpha")).toBe("- Alpha");
	});
});

describe("editSelectionStart", () => {
	it("selects the label, not the marker that makes the line what it is", () => {
		expect(editSelectionStart("- Alpha", "Alpha")).toBe(2);
		expect(editSelectionStart("## Alpha", "Alpha")).toBe(3);
		expect(editSelectionStart("1. Alpha", "Alpha")).toBe(3);
		expect(editSelectionStart("- [x] Alpha", "[x] Alpha")).toBe(2);
	});

	it("puts the caret past the marker of a freshly added empty node", () => {
		// Otherwise "add child, start typing" would overwrite the `- `.
		expect(editSelectionStart("- ", "")).toBe(2);
	});

	it("finds content inside a wrapper", () => {
		expect(editSelectionStart("![[Other Note]]", "Other Note")).toBe(3);
	});

	it("selects the whole line when content is not a substring of it", () => {
		expect(editSelectionStart("> quote", "unrelated")).toBe(0);
	});
});

// ── subtreeEnd: trailing `^id` line moves with its block (root cause C) ───────
describe("subtreeEnd includes a multiline node's standalone block-ID line", () => {
	const md = [
		"# Title",
		"",
		"```js",
		"const x = 1;",
		"```",
		"^os-code99",
		"",
		"- after",
	].join("\n");

	it("extends the span past the `^id` line the parser keeps out of range", () => {
		const tree = parser.parse(md, "f.md");
		const code = findByContent(tree.root, "```js\nconst x = 1;\n```");
		expect(code.blockId).toBe("os-code99");
		// range stops at the closing fence...
		expect(md.slice(code.range.start, code.range.end)).not.toContain("^os-code99");
		// ...but the subtree span carries the ID line along.
		const span = md.slice(code.range.start, subtreeEnd(code));
		expect(span).toContain("^os-code99");
	});

	it("a move/delete span leaves no orphaned `^id` line behind", () => {
		const tree = parser.parse(md, "f.md");
		const code = findByContent(tree.root, "```js\nconst x = 1;\n```");
		const remainder =
			md.slice(0, code.range.start) + md.slice(subtreeEnd(code));
		expect(remainder).not.toContain("^os-code99");
	});
});

// ── reindentSubtree: identity survives a structural move (root cause B) ───────
describe("reindentSubtree preserves block IDs while re-indenting", () => {
	it("keeps the first line's ID when indenting a bullet subtree", () => {
		const md = ["- Parent ^os-par", "\t- Child ^os-ch"].join("\n");
		const tree = parser.parse(md, "f.md");
		const parent = findByContent(tree.root, "Parent");
		const text = md.slice(parent.range.start, subtreeEnd(parent));
		// Indent one level deeper (bullet at depth 1).
		const out = reindentSubtree(text, parent, "bullet", 1);
		expect(out).toBe(["\t- Parent ^os-par", "\t\t- Child ^os-ch"].join("\n"));
	});

	it("keeps the ID when promoting a bullet to a heading", () => {
		const md = "- Topic ^os-t";
		const tree = parser.parse(md, "f.md");
		const n = findByContent(tree.root, "Topic");
		expect(reindentSubtree(md, n, "heading", 2)).toBe("## Topic ^os-t");
	});

	it("leaves atomic multiline blocks (with `>` markers) untouched", () => {
		const md = ["> a callout", "> body"].join("\n");
		const tree = parser.parse(md, "f.md");
		const bq = tree.root.children[0]!;
		expect(bq.type).toBe("blockquote");
		expect(reindentSubtree(md, bq, "blockquote", 0)).toBe(md);
	});
});

// ── sameEditTarget: cross-file drop guard decision (root cause A) ─────────────
describe("sameEditTarget guards cross-file edits", () => {
	it("two local nodes share a target", () => {
		expect(sameEditTarget(node({}), node({}))).toBe(true);
	});

	it("a local node and a transcluded node do not", () => {
		const local = node({});
		const embedded = node({ isTranscluded: true, sourceFile: "src.md" });
		expect(sameEditTarget(local, embedded)).toBe(false);
	});

	it("two nodes from the same source share a target", () => {
		const a = node({ isTranscluded: true, sourceFile: "src.md" });
		const b = node({ isTranscluded: true, sourceFile: "src.md" });
		expect(sameEditTarget(a, b)).toBe(true);
	});

	it("two nodes from different sources do not", () => {
		const a = node({ isTranscluded: true, sourceFile: "a.md" });
		const b = node({ isTranscluded: true, sourceFile: "b.md" });
		expect(sameEditTarget(a, b)).toBe(false);
	});
});

// ── reindentSubtree: the one converter both drag and paste re-level through ──
// These four cases were `adjustPasteDepth`'s; paste now shares drag's converter,
// so the behaviors move here rather than disappearing with the old function.
describe("reindentSubtree re-levels a pasted subtree", () => {
	it("shifts list and heading depth without touching content", () => {
		const text = ["- a", "\t- b"].join("\n");
		const bullet = node({ type: "bullet", depth: 0, content: "a" });
		expect(reindentSubtree(text, bullet, "bullet", 1)).toBe(
			["\t- a", "\t\t- b"].join("\n"),
		);
		const heading = node({ type: "heading", depth: 2, content: "Head" });
		expect(reindentSubtree("## Head", heading, "heading", 3)).toBe("### Head");
	});

	it("leaves code fence lines and their contents untouched", () => {
		// Only the surrounding list shifts; fence markers and body are verbatim.
		const text = ["- a", "\t```", "\tnot-a-list", "\t```"].join("\n");
		const bullet = node({ type: "bullet", depth: 0, content: "a" });
		expect(reindentSubtree(text, bullet, "bullet", 1)).toBe(
			["\t- a", "\t```", "\tnot-a-list", "\t```"].join("\n"),
		);
	});

	it("never indents a standalone block-ID line of an atomic block", () => {
		// Pasting a code block (with its trailing `^id`) under a deeper parent:
		// the atomic block AND its ID line must stay put — indenting the `^id`
		// line detaches the block ID (line-card identity / style anchor).
		const text = ["```", "code stuff", "```", "^os-codeblock"].join("\n");
		const code = node({ type: "codeblock", depth: 0, content: text });
		expect(reindentSubtree(text, code, "bullet", 2)).toBe(text);
	});

	it("keeps blank lines inside a fence when a heading becomes a list item", () => {
		// A heading→list conversion drops the blank lines that separate its
		// children, which would otherwise break list nesting — but a blank line
		// between two statements is part of the code, not list spacing.
		const text = [
			"## Route Metrics",
			"",
			"```js",
			"const headway = 8;",
			"",
			"const stops = 12;",
			"```",
			"",
			"- Peak service",
		].join("\n");
		const heading = node({ type: "heading", depth: 2, content: "Route Metrics" });
		expect(reindentSubtree(text, heading, "bullet", 1)).toBe(
			[
				"\t- Route Metrics",
				"```js",
				"const headway = 8;",
				"",
				"const stops = 12;",
				"```",
				"\t\t- Peak service",
			].join("\n"),
		);
	});

	it("leaves a descendant table's rows and `^id` line at column zero", () => {
		// The atomic-block invariant applies to descendants too, not just to a
		// subtree whose *root* is the table: indenting a row breaks the table,
		// and indenting the ID line detaches it from the block it names.
		const text = [
			"- Routes",
			"| Line | Stops |",
			"| --- | --- |",
			"| A | 12 |",
			"^os-routes",
			"\t- Frequency",
		].join("\n");
		const bullet = node({ type: "bullet", depth: 0, content: "Routes" });
		expect(reindentSubtree(text, bullet, "bullet", 1)).toBe(
			[
				"\t- Routes",
				"| Line | Stops |",
				"| --- | --- |",
				"| A | 12 |",
				"^os-routes",
				// ...while an ordinary list descendant still shifts.
				"\t\t- Frequency",
			].join("\n"),
		);
	});
});

// ── reindentSubtree: a heading's depth change carries its sub-headings ───────
describe("reindentSubtree re-levels descendant headings with a moved heading", () => {
	const text = ["## Route", "### Stop", "#### Platform", "- Note", "### Depot"].join("\n");
	const route = node({ type: "heading", depth: 2, content: "Route" });

	it("deepens every sub-heading by the same amount (H2 to H3)", () => {
		expect(reindentSubtree(text, route, "heading", 3)).toBe(
			["### Route", "#### Stop", "##### Platform", "- Note", "#### Depot"].join("\n"),
		);
	});

	it("caps at H6 while the shallower ones keep their relative depth", () => {
		expect(reindentSubtree(text, route, "heading", 5)).toBe(
			["##### Route", "###### Stop", "###### Platform", "- Note", "###### Depot"].join("\n"),
		);
	});

	it("shifts sub-headings up when the heading moves shallower (H3 to H2)", () => {
		const deep = ["### Route", "#### Stop", "##### Platform"].join("\n");
		const head = node({ type: "heading", depth: 3, content: "Route" });
		expect(reindentSubtree(deep, head, "heading", 2)).toBe(
			["## Route", "### Stop", "#### Platform"].join("\n"),
		);
	});

	it("never goes above H1", () => {
		const deep = ["### Route", "#### Stop", "###### Platform"].join("\n");
		const head = node({ type: "heading", depth: 3, content: "Route" });
		expect(reindentSubtree(deep, head, "heading", 1)).toBe(
			["# Route", "## Stop", "#### Platform"].join("\n"),
		);
	});

	it("leaves the text alone when the depth does not change", () => {
		expect(reindentSubtree(text, route, "heading", 2)).toBe(text);
	});

	it("does not touch a '#' line inside a code fence", () => {
		const fenced = ["## Route", "```sh", "### not a heading", "```", "### Stop"].join("\n");
		expect(reindentSubtree(fenced, route, "heading", 3)).toBe(
			["### Route", "```sh", "### not a heading", "```", "#### Stop"].join("\n"),
		);
	});

	// T75: the edit would leave two headings adjacent (one line group); the op
	// puts the blank line in itself rather than relying on the normalizer.
	it("re-levels through the real parser when a heading is indented (Alt+Right)", () => {
		const md = ["# Top", "", "## Alpha", "", "## Beta", "", "### Beta child"].join("\n");
		const tree = parser.parse(md, "f.md");
		const alpha = findByContent(tree.root, "Alpha");
		const beta = findByContent(tree.root, "Beta");
		const out = indentSiblings(md, [beta], alpha);
		expect(out.text).toBe(["# Top", "", "## Alpha", "", "### Beta", "", "#### Beta child", ""].join("\n"));
		const moved = findByContent(findByContent(parser.parse(out.text, "f.md").root, "Alpha"), "Beta");
		expect(moved.depth).toBe(3);
		expect(moved.children.map((c) => c.content)).toEqual(["Beta child"]);
	});
});

describe("selectedSiblings", () => {
	it("is the span from the first to the last selected sibling, in order", () => {
		const root = parser.parse("- A\n- B\n- C\n- D\n", "f.md").root;
		const [a, b, c] = root.children;
		expect(selectedSiblings(root.children, new Set([c!.id, a!.id]))).toEqual([a, b, c]);
	});

	it("is empty when nothing in the list is selected", () => {
		const root = parser.parse("- A\n- B\n", "f.md").root;
		expect(selectedSiblings(root.children, new Set(["nope"]))).toEqual([]);
	});
});

describe("renumberOrderedLists", () => {
	it("renumbers consecutive same-depth ordered items", () => {
		const text = ["1. a", "1. b", "1. c"].join("\n");
		expect(renumberOrderedLists(text)).toBe(["1. a", "2. b", "3. c"].join("\n"));
	});

	it("restarts numbering after a blank line", () => {
		const text = ["1. a", "5. b", "", "9. c"].join("\n");
		expect(renumberOrderedLists(text)).toBe(
			["1. a", "2. b", "", "1. c"].join("\n"),
		);
	});
});

// ── embed boundary: host-file span math stays in host coordinates (Part A) ────
describe("subtreeEnd folds a transcluded child to its host-file embed line", () => {
	// A hand-built boundary: the child's own `range` is a bogus source-file
	// offset; `embedHostRange` is the `![[…]]` line's true host span. subtreeEnd
	// must take the host span and never the source offset.
	it("uses embedHostRange.end, ignoring the child's source-coordinate range", () => {
		const parent = node({
			type: "heading",
			depth: 2,
			content: "Container",
			range: { start: 75, end: 94 },
			children: [
				node({
					// Source-file offsets (small) that must NOT leak into host math.
					range: { start: 18, end: 31 },
					isTranscluded: true,
					sourceFile: "target.md",
					embedHostRange: { start: 96, end: 116 },
				}),
			],
		});
		expect(subtreeEnd(parent)).toBe(116);
	});

	it("still spans local siblings that follow the embed", () => {
		const parent = node({
			type: "heading",
			content: "H",
			range: { start: 0, end: 3 },
			children: [
				node({
					range: { start: 100, end: 120 },
					isTranscluded: true,
					sourceFile: "e.md",
					embedHostRange: { start: 5, end: 20 },
				}),
				// A local bullet after the embed line, later in the host file.
				node({ range: { start: 21, end: 33 } }),
			],
		});
		expect(subtreeEnd(parent)).toBe(33);
	});
});

describe("nodeHostStart / subtreeHostEnd map an embed to its host line", () => {
	it("return the embed's host span for a transcluded expansion", () => {
		const embedded = node({
			range: { start: 18, end: 31 },
			isTranscluded: true,
			sourceFile: "target.md",
			embedHostRange: { start: 96, end: 116 },
		});
		expect(nodeHostStart(embedded)).toBe(96);
		expect(subtreeHostEnd(embedded)).toBe(116);
		// The plain span math still reports the (source-file) offsets.
		expect(embedded.range.start).toBe(18);
		expect(subtreeEnd(embedded)).toBe(31);
	});

	it("fall back to the node's own span for a local node", () => {
		const local = node({ range: { start: 40, end: 52 } });
		expect(nodeHostStart(local)).toBe(40);
		expect(subtreeHostEnd(local)).toBe(52);
	});
});

describe("real parser + resolver: a local node containing an embed", () => {
	const host = [
		"# Edit Propagation Test", // 0
		"", //
		"## Embedded Content", // heading (local)
		"", //
		"![[target]]", // transclusion line (host coords)
		"", //
	].join("\n");
	const source = ["# Target", "- Second item", "- Modified Item"].join("\n");

	it("spans exactly through the ![[…]] line, not the source offsets", async () => {
		const tree = await parseWithEmbed(host, "target", "target.md", source);
		const heading = findByContent(tree.root, "Embedded Content");

		const span = host.slice(heading.range.start, subtreeEnd(heading));
		expect(span).toContain("![[target]]");
		// The span ends right at the embed line — no trailing/leading source text.
		expect(span).toBe("## Embedded Content\n\n![[target]]");
	});

	it("a move carries the embed line and orphans nothing", async () => {
		const tree = await parseWithEmbed(host, "target", "target.md", source);
		const heading = findByContent(tree.root, "Embedded Content");

		const start = heading.range.start;
		const end = subtreeEnd(heading);
		const moved = host.slice(start, end);
		const remainder = host.slice(0, start) + host.slice(end);

		expect(moved).toContain("![[target]]");
		// The embed line does not stay behind to re-attach elsewhere.
		expect(remainder).not.toContain("![[target]]");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Part B: moving content *through* the transclusion seam.
//
// Neutral fixtures: a city-transit host map embedding a bicycle-infrastructure
// note (and, for the nested cases, a bike-parking note embedded inside that).
// ─────────────────────────────────────────────────────────────────────────────

const TRANSIT_HOST = [
	"# City Transit",
	"",
	"## Bike Network",
	"",
	"![[bike-lanes]]",
	"",
	"- Fare policy",
	"",
].join("\n");

const BIKE_LANES = [
	"- Protected lanes",
	"\t- Curb separated",
	"- Bike parking",
	"",
].join("\n");

const NESTED_HOST = ["# City Transit", "", "![[bike-lanes-nested]]", ""].join("\n");

/**
 * The nested embed sits *under a heading*, which is the only shape the resolver
 * actually expands: `expandTransclusion` recurses into each expanded child's
 * own children, so a `![[…]]` at the source note's top level stays an
 * unexpanded transclusion node. That matters for the offset math — a nested
 * expansion's `embedHostRange` therefore always indexes the same file as the
 * node it is spliced under.
 */
const BIKE_LANES_NESTED = [
	"# Bike Lanes",
	"",
	"- Protected lanes",
	"",
	"## Parking",
	"",
	"![[bike-parking]]",
	"",
	"- Signage",
	"",
].join("\n");

const BIKE_PARKING = ["- Rack standards", "- Covered shelters", ""].join("\n");

/** Two sibling embeds meeting directly under one host heading. */
const TWO_EMBEDS_HOST = [
	"# City Transit",
	"",
	"## Network",
	"",
	"![[bike-lanes]]",
	"![[bike-parking]]",
	"",
].join("\n");

const CYCLE_HOST = ["# City Transit", "", "![[loop-note]]", ""].join("\n");
const LOOP_NOTE = ["# Loop Note", "", "![[host]]", ""].join("\n");

/** A `FileOf` over a whole tree, defaulting to the host for unknown nodes. */
function fileOfTree(tree: OsmosisTree): (n: OsmosisNode) => string {
	const map = buildContainingFileMap(tree.root, HOST_PATH);
	return (n) => map.get(n.id) ?? HOST_PATH;
}

// ── buildContainingFileMap: whose coordinates is this range in? ───────────────
describe("buildContainingFileMap", () => {
	it("maps local nodes to the host and expanded content to its source", async () => {
		const tree = await parseVault(TRANSIT_HOST, { "bike-lanes.md": BIKE_LANES });
		const fileOf = fileOfTree(tree);
		const of = (content: string): string =>
			fileOf(findByContent(tree.root, content));

		expect(fileOf(tree.root)).toBe(HOST_PATH);
		expect(of("City Transit")).toBe(HOST_PATH);
		expect(of("Bike Network")).toBe(HOST_PATH);
		expect(of("Protected lanes")).toBe("bike-lanes.md");
		// A descendant of an expanded child stays in that child's source file.
		expect(of("Curb separated")).toBe("bike-lanes.md");
		// Host content after the embed line is host content again.
		expect(of("Fare policy")).toBe(HOST_PATH);
	});

	it("follows a nested embed down to the inner source file", async () => {
		const tree = await parseVault(NESTED_HOST, {
			"bike-lanes-nested.md": BIKE_LANES_NESTED,
			"bike-parking.md": BIKE_PARKING,
		});
		const fileOf = fileOfTree(tree);
		const of = (content: string): string =>
			fileOf(findByContent(tree.root, content));

		expect(of("Bike Lanes")).toBe("bike-lanes-nested.md");
		expect(of("Protected lanes")).toBe("bike-lanes-nested.md");
		expect(of("Parking")).toBe("bike-lanes-nested.md");
		// The inner embed's content belongs to the inner note, not the outer one.
		expect(of("Rack standards")).toBe("bike-parking.md");
		expect(of("Covered shelters")).toBe("bike-parking.md");
		// …and the outer note's content after it is the outer note's again.
		expect(of("Signage")).toBe("bike-lanes-nested.md");
	});

	it("keeps an unexpanded (lazy) embed in the file that holds its line", async () => {
		const { tree, expand } = prepareVault(TRANSIT_HOST, {
			"bike-lanes.md": BIKE_LANES,
		});
		const embedNode = findByContent(tree.root, "bike-lanes");
		await expand(new Set([embedNode.id]));

		// The trap: a deferred embed is marked transcluded and carries the
		// *target* as `sourceFile`, while its own range still indexes the host.
		expect(embedNode.type).toBe("transclusion");
		expect(embedNode.isTranscluded).toBe(true);
		expect(embedNode.sourceFile).toBe("bike-lanes.md");
		expect(fileOfTree(tree)(embedNode)).toBe(HOST_PATH);
		expect(TRANSIT_HOST.slice(embedNode.range.start, embedNode.range.end)).toBe(
			"![[bike-lanes]]",
		);
	});

	it("keeps a cyclic embed in the file that holds its line", async () => {
		const tree = await parseVault(CYCLE_HOST, { "loop-note.md": LOOP_NOTE });
		const cyclic = findByContent(tree.root, "host");

		// Same trap one level in: resolved (so `sourceFile` points back at the
		// host) but never expanded, so its range is in the *loop note*.
		expect(cyclic.type).toBe("transclusion");
		expect(cyclic.sourceFile).toBe(HOST_PATH);
		expect(fileOfTree(tree)(cyclic)).toBe("loop-note.md");
	});
});

// ── resolveInsertSite: which file an insert writes to, and where ──────────────
describe("resolveInsertSite", () => {
	it("routes an interior gap between two embedded siblings into the source", async () => {
		const tree = await parseVault(TRANSIT_HOST, { "bike-lanes.md": BIKE_LANES });
		const parent = findByContent(tree.root, "Bike Network");
		// [Protected lanes, Bike parking] come from the source; Fare policy is host.
		expect(parent.children.map((c) => c.content)).toEqual([
			"Protected lanes",
			"Bike parking",
			"Fare policy",
		]);

		const site = resolveInsertSite(parent, 1, fileOfTree(tree));
		expect(site.path).toBe("bike-lanes.md");
		expect(BIKE_LANES.slice(site.offset)).toBe("- Bike parking\n");
		// The destination-side neighbor drives type/depth for the reindent.
		expect(site.neighbor?.content).toBe("Bike parking");
	});

	it("gives the boundary gap above an embed to the host (decision O1)", async () => {
		const tree = await parseVault(TRANSIT_HOST, { "bike-lanes.md": BIKE_LANES });
		const parent = findByContent(tree.root, "Bike Network");

		const site = resolveInsertSite(parent, 0, fileOfTree(tree));
		expect(site.path).toBe(HOST_PATH);
		// nodeHostStart folds the expansion back to its `![[…]]` line.
		expect(TRANSIT_HOST.slice(site.offset)).toBe("![[bike-lanes]]\n\n- Fare policy\n");
		expect(site.neighbor).toBeUndefined();
	});

	it("gives the boundary gap below an embed to the host (decision O1)", async () => {
		const tree = await parseVault(TRANSIT_HOST, { "bike-lanes.md": BIKE_LANES });
		const parent = findByContent(tree.root, "Bike Network");

		const site = resolveInsertSite(parent, 2, fileOfTree(tree));
		expect(site.path).toBe(HOST_PATH);
		expect(TRANSIT_HOST.slice(site.offset)).toBe("- Fare policy\n");
	});

	it("appends past the last child at that child's host-file subtree end", async () => {
		const tree = await parseVault(TRANSIT_HOST, { "bike-lanes.md": BIKE_LANES });
		const parent = findByContent(tree.root, "Bike Network");

		const site = resolveInsertSite(parent, parent.children.length, fileOfTree(tree));
		expect(site.path).toBe(HOST_PATH);
		expect(TRANSIT_HOST.slice(0, site.offset).endsWith("- Fare policy")).toBe(true);
	});

	it("puts a childless embedded parent's insert just past its own line", async () => {
		const tree = await parseVault(TRANSIT_HOST, { "bike-lanes.md": BIKE_LANES });
		const leaf = findByContent(tree.root, "Curb separated");
		expect(leaf.children).toHaveLength(0);

		const site = resolveInsertSite(leaf, 0, fileOfTree(tree));
		expect(site.path).toBe("bike-lanes.md");
		expect(BIKE_LANES.slice(0, site.offset).endsWith("\t- Curb separated")).toBe(true);
	});

	it("reparents onto an embedded node inside that node's source file", async () => {
		const tree = await parseVault(TRANSIT_HOST, { "bike-lanes.md": BIKE_LANES });
		const target = findByContent(tree.root, "Protected lanes");

		// Dropping to the right of a node appends at children.length.
		const site = resolveInsertSite(target, target.children.length, fileOfTree(tree));
		expect(site.path).toBe("bike-lanes.md");
		expect(BIKE_LANES.slice(0, site.offset).endsWith("\t- Curb separated")).toBe(true);
	});

	it("routes a nested embed's interior gap into the inner note", async () => {
		const tree = await parseVault(NESTED_HOST, {
			"bike-lanes-nested.md": BIKE_LANES_NESTED,
			"bike-parking.md": BIKE_PARKING,
		});
		const parent = findByContent(tree.root, "Parking");
		expect(parent.children.map((c) => c.content)).toEqual([
			"Rack standards",
			"Covered shelters",
			"Signage",
		]);

		const site = resolveInsertSite(parent, 1, fileOfTree(tree));
		expect(site.path).toBe("bike-parking.md");
		expect(BIKE_PARKING.slice(site.offset)).toBe("- Covered shelters\n");

		// The gap above the inner embed belongs to the *outer* note, at the
		// `![[bike-parking]]` line — never to the host two levels up.
		const edge = resolveInsertSite(parent, 0, fileOfTree(tree));
		expect(edge.path).toBe("bike-lanes-nested.md");
		expect(BIKE_LANES_NESTED.slice(edge.offset)).toBe(
			"![[bike-parking]]\n\n- Signage\n",
		);
	});

	it("gives the seam between two different embeds to the host", async () => {
		const tree = await parseVault(TWO_EMBEDS_HOST, {
			"bike-lanes.md": BIKE_LANES,
			"bike-parking.md": BIKE_PARKING,
		});
		const parent = findByContent(tree.root, "Network");
		expect(parent.children.map((c) => c.content)).toEqual([
			"Protected lanes",
			"Bike parking",
			"Rack standards",
			"Covered shelters",
		]);

		// index 2: `before` is from bike-lanes, `after` from bike-parking —
		// neither side owns the gap, so it belongs to the file holding both
		// `![[…]]` lines.
		const site = resolveInsertSite(parent, 2, fileOfTree(tree));
		expect(site.path).toBe(HOST_PATH);
		expect(TWO_EMBEDS_HOST.slice(site.offset)).toBe("![[bike-parking]]\n");
		expect(site.neighbor).toBeUndefined();
	});
});

// ── inferSiblingContext: type/depth in the *destination's* terms ──────────────
describe("inferSiblingContext", () => {
	it("takes the neighbor's source depth, not the host parent's", async () => {
		const tree = await parseVault(TRANSIT_HOST, { "bike-lanes.md": BIKE_LANES });
		const parent = findByContent(tree.root, "Bike Network"); // host heading, depth 2
		const neighbor = findByContent(tree.root, "Bike parking"); // depth 0 in the source
		const moving = node({ type: "bullet", depth: 0, content: "Bike share docks" });

		expect(parent.depth).toBe(2);
		expect(inferSiblingContext(neighbor, moving)).toEqual({
			type: "bullet",
			depth: 0,
		});
	});

	it("matches a nested list neighbor's own depth", () => {
		// The general rule, isolated: whatever depth the neighbor sits at in its
		// own file is the depth the moved line has to land at.
		const neighbor = node({ type: "bullet", depth: 2, content: "Curb separated" });
		const moving = node({ type: "bullet", depth: 0, content: "Bollards" });
		expect(inferSiblingContext(neighbor, moving)).toEqual({
			type: "bullet",
			depth: 2,
		});
	});

	it("keeps a list item's own bullet/ordered flavor", () => {
		const neighbor = node({ type: "bullet", depth: 1, content: "Protected lanes" });
		const ordered = node({ type: "ordered", depth: 0, content: "Step one" });
		expect(inferSiblingContext(neighbor, ordered)).toEqual({
			type: "ordered",
			depth: 1,
		});
	});

	it("promotes to a heading beside a heading neighbor, at its level", () => {
		// Mirrors the same-file drop rule (inferDropType): a line dropped between
		// two headings has to *be* a heading, or it lands inside the one above
		// instead of between them.
		const neighbor = node({ type: "heading", depth: 3, content: "Parking" });
		expect(inferSiblingContext(neighbor, node({ type: "bullet" }))).toEqual({
			type: "heading",
			depth: 3,
		});
		expect(inferSiblingContext(neighbor, node({ type: "paragraph" }))).toEqual({
			type: "heading",
			depth: 3,
		});
	});

	it("falls back to depth 0 beside a non-list neighbor", () => {
		const neighbor = node({ type: "paragraph", depth: 0, content: "Intro" });
		expect(inferSiblingContext(neighbor, node({ type: "bullet", depth: 3 }))).toEqual({
			type: "bullet",
			depth: 0,
		});
	});
});

// ── subtreeSpan / widenRemoval / removeSpan / insertAt: splice hygiene ────────
describe("subtreeSpan", () => {
	it("spans a contiguous sibling run from the first start to the last subtree end", () => {
		const md = ["- a", "\t- a1", "- b", "- c"].join("\n");
		const tree = parser.parse(md, "f.md");
		const [a, b] = tree.root.children;
		const span = subtreeSpan([a!, b!]);
		expect(md.slice(span.start, span.end)).toBe("- a\n\t- a1\n- b");
	});

	it("carries a multiline block's standalone `^id` line", () => {
		const md = ["```js", "const x = 1;", "```", "^os-code99", "", "- after"].join("\n");
		const tree = parser.parse(md, "f.md");
		const code = findByContent(tree.root, "```js\nconst x = 1;\n```");
		const span = subtreeSpan([code]);
		expect(md.slice(span.start, span.end)).toContain("^os-code99");
	});

	it("is empty for an empty run", () => {
		expect(subtreeSpan([])).toEqual({ start: 0, end: 0 });
	});
});

describe("widenRemoval / removeSpan", () => {
	it("collapses the blank lines around a removal to a single separator", () => {
		const text = ["- a", "", "- b", "", "- c", ""].join("\n");
		const b = { start: text.indexOf("- b"), end: text.indexOf("- b") + 3 };
		expect(removeSpan(text, widenRemoval(text, b))).toBe("- a\n- c\n");
	});

	it("leaves nothing behind when removing at the start of a file", () => {
		const text = ["- b", "", "- c", ""].join("\n");
		expect(removeSpan(text, widenRemoval(text, { start: 0, end: 3 }))).toBe("- c\n");
	});

	it("leaves nothing behind when removing at the end of a file", () => {
		const text = ["- a", "", "- b"].join("\n");
		const b = { start: text.indexOf("- b"), end: text.length };
		expect(removeSpan(text, widenRemoval(text, b))).toBe("- a");
	});
});

describe("insertAt", () => {
	it("adds separators only where the surrounding bytes lack them", () => {
		expect(insertAt("- a\n- c\n", 4, "- b")).toEqual({
			text: "- a\n- b\n- c\n",
			shift: 4,
		});
		// At the very end: needs a leading newline, not a trailing one.
		expect(insertAt("- a", 3, "- b")).toEqual({ text: "- a\n- b", shift: 4 });
		// At the very start: needs a trailing newline, not a leading one.
		expect(insertAt("- a", 0, "- b")).toEqual({ text: "- b\n- a", shift: 4 });
	});

	it("reports the shift a later splice of the same file must apply", () => {
		const { text, shift } = insertAt("- a\n- c\n", 0, "- b");
		expect(text).toBe("- b\n- a\n- c\n");
		// "- c" moved right by exactly `shift`.
		expect(text.indexOf("- c")).toBe("- a\n- c\n".indexOf("- c") + shift);
	});
});

// ── the multi-file undo group ────────────────────────────────────────────────
describe("edit groups collapse one gesture into one undo step", () => {
	const group = (...edits: FileEdit[]): Map<string, FileEdit> => {
		const map = new Map<string, FileEdit>();
		for (const e of edits) mergeEdit(map, e);
		return map;
	};

	it("keeps one entry per file, in first-written order", () => {
		const g = group(
			{ path: "bike-lanes.md", before: "A", after: "B" },
			{ path: HOST_PATH, before: "C", after: "D" },
		);
		expect(collapseEditGroup(g)).toEqual([
			{ path: "bike-lanes.md", before: "A", after: "B" },
			{ path: HOST_PATH, before: "C", after: "D" },
		]);
	});

	it("keeps the first `before` and the last `after` when a file is written twice", () => {
		// The host gets its content spliced, then its frontmatter rewritten. Undo
		// has to restore what was there before the *gesture*, not before the
		// second write.
		const g = group(
			{ path: HOST_PATH, before: "original", after: "spliced" },
			{ path: HOST_PATH, before: "spliced", after: "spliced+frontmatter" },
		);
		expect(collapseEditGroup(g)).toEqual([
			{ path: HOST_PATH, before: "original", after: "spliced+frontmatter" },
		]);
	});

	it("drops a file whose net change is nil", () => {
		const g = group(
			{ path: HOST_PATH, before: "same", after: "changed" },
			{ path: HOST_PATH, before: "changed", after: "same" },
			{ path: "bike-lanes.md", before: "A", after: "B" },
		);
		expect(collapseEditGroup(g)).toEqual([
			{ path: "bike-lanes.md", before: "A", after: "B" },
		]);
	});

	it("does not mutate the caller's edit objects", () => {
		const first = { path: HOST_PATH, before: "A", after: "B" };
		const g = group(first, { path: HOST_PATH, before: "B", after: "C" });
		expect(first.after).toBe("B");
		expect(collapseEditGroup(g)[0]?.after).toBe("C");
	});

	it("sums bytes across every file in the group", () => {
		expect(
			editBytes([
				{ path: "a.md", before: "ab", after: "cde" },
				{ path: "b.md", before: "f", after: "" },
			]),
		).toBe((2 + 3) * 2 + (1 + 0) * 2);
		expect(editBytes([])).toBe(0);
	});
});

// ── the move primitive's transform, end to end over real trees ───────────────
describe("cross-boundary extraction + reindent", () => {
	/**
	 * The pure half of `moveAcrossFiles`: slice the origin verbatim, re-indent
	 * for the destination, insert, then remove. Mirrors the write order — the
	 * destination text is produced before the origin is cut.
	 */
	function applyMove(
		originText: string,
		destText: string,
		nodes: OsmosisNode[],
		site: { offset: number; neighbor?: OsmosisNode },
		fallback: { type: OsmosisNode["type"]; depth: number },
	): { origin: string; dest: string } {
		const parts = nodes.map((src) => {
			const text = originText.slice(src.range.start, subtreeEnd(src));
			const context = site.neighbor
				? inferSiblingContext(site.neighbor, src)
				: fallback;
			return reindentSubtree(text, src, context.type, context.depth);
		});
		return {
			dest: insertAt(destText, site.offset, parts.join("\n")).text,
			origin: removeSpan(
				originText,
				widenRemoval(originText, subtreeSpan(nodes)),
			),
		};
	}

	const HOST_WITH_IDS = [
		"# City Transit",
		"",
		"## Bike Network",
		"",
		"![[bike-lanes]]",
		"",
		"- Fare policy ^os-fare01",
		"",
	].join("\n");

	const LANES_WITH_IDS = [
		"- Protected lanes ^os-lane01",
		"\t- Curb separated",
		"- Bike parking ^os-park01",
		"",
	].join("\n");

	it("moves a host line into the middle of an embedded region", async () => {
		const tree = await parseVault(HOST_WITH_IDS, {
			"bike-lanes.md": LANES_WITH_IDS,
		});
		const fileOf = fileOfTree(tree);
		const parent = findByContent(tree.root, "Bike Network");
		const moving = findByContent(tree.root, "Fare policy");
		const site = resolveInsertSite(parent, 1, fileOf);

		expect(site.path).toBe("bike-lanes.md");
		const out = applyMove(HOST_WITH_IDS, LANES_WITH_IDS, [moving], site, {
			type: "bullet",
			depth: 0,
		});

		// Landed between the right two lines, at the neighbor's own depth…
		expect(out.dest).toBe(
			[
				"- Protected lanes ^os-lane01",
				"\t- Curb separated",
				"- Fare policy ^os-fare01",
				"- Bike parking ^os-park01",
				"",
			].join("\n"),
		);
		// …and left the host without it, and without a blank-line scar. (The
		// removal runs to end-of-file, so there is no separator to keep.)
		expect(out.origin).toBe(
			["# City Transit", "", "## Bike Network", "", "![[bike-lanes]]"].join("\n"),
		);
	});

	it("moves an embedded subtree out to the host, ID and children intact", async () => {
		const tree = await parseVault(HOST_WITH_IDS, {
			"bike-lanes.md": LANES_WITH_IDS,
		});
		const fileOf = fileOfTree(tree);
		const moving = findByContent(tree.root, "Protected lanes");
		const neighbor = findByContent(tree.root, "Fare policy");

		expect(fileOf(moving)).toBe("bike-lanes.md");
		const site = { offset: neighbor.range.start, neighbor };
		const out = applyMove(LANES_WITH_IDS, HOST_WITH_IDS, [moving], site, {
			type: "bullet",
			depth: 0,
		});

		// The whole subtree travels, block ID and nesting preserved…
		expect(out.dest).toBe(
			[
				"# City Transit",
				"",
				"## Bike Network",
				"",
				"![[bike-lanes]]",
				"",
				"- Protected lanes ^os-lane01",
				"\t- Curb separated",
				"- Fare policy ^os-fare01",
				"",
			].join("\n"),
		);
		// …and it is gone from the source note — so it is gone from every place
		// that note is embedded (decision #1: this is a true move).
		expect(out.origin).toBe(["- Bike parking ^os-park01", ""].join("\n"));
		expect(out.origin).not.toContain("os-lane01");
	});

	it("re-indents into a nested embed at the inner note's own depth", async () => {
		const tree = await parseVault(NESTED_HOST, {
			"bike-lanes-nested.md": BIKE_LANES_NESTED,
			"bike-parking.md": BIKE_PARKING,
		});
		const fileOf = fileOfTree(tree);
		const parent = findByContent(tree.root, "Parking");
		const moving = findByContent(tree.root, "Protected lanes");
		const site = resolveInsertSite(parent, 1, fileOf);

		// Two levels down: origin is the outer note, destination the inner one.
		expect(fileOf(moving)).toBe("bike-lanes-nested.md");
		expect(site.path).toBe("bike-parking.md");

		const out = applyMove(
			BIKE_LANES_NESTED,
			BIKE_PARKING,
			[moving],
			site,
			{ type: "bullet", depth: 0 },
		);
		expect(out.dest).toBe(
			["- Rack standards", "- Protected lanes", "- Covered shelters", ""].join(
				"\n",
			),
		);
		expect(out.origin).not.toContain("Protected lanes");
	});

	it("carries an `![[embed]]` line along when the moved subtree contains one", async () => {
		const tree = await parseVault(NESTED_HOST, {
			"bike-lanes-nested.md": BIKE_LANES_NESTED,
			"bike-parking.md": BIKE_PARKING,
		});
		// "## Parking" holds the `![[bike-parking]]` line; its expanded children
		// index another file, so the span must fold back to that line (Part A).
		const holder = findByContent(tree.root, "Parking");
		const span = subtreeSpan([holder]);
		const moved = BIKE_LANES_NESTED.slice(span.start, span.end);

		expect(moved).toContain("![[bike-parking]]");
		expect(moved).toContain("- Signage");
		// No source-note bytes leaked into the outer note's span.
		expect(moved).not.toContain("Rack standards");
		expect(
			removeSpan(BIKE_LANES_NESTED, widenRemoval(BIKE_LANES_NESTED, span)),
		).not.toContain("![[bike-parking]]");
	});
});

// ── Clipboard / schedule identity (Phase 6 + Phase 5) ────────────────────────
describe("collectBlockIds", () => {
	it("finds inline trailing IDs and standalone `^id` lines", () => {
		const text = [
			"- Network gaps ^os-seamgap1",
			"\t- Curb separation",
			"| Corridor | Status |",
			"| --- | --- |",
			"| 3rd Ave | Funded |",
			"^os-tab001",
		].join("\n");

		expect(collectBlockIds(text)).toEqual(
			new Set(["os-seamgap1", "os-tab001"]),
		);
	});

	it("ignores carets inside a fenced code block", () => {
		const text = [
			"- Signal timing ^os-sig001",
			"```",
			"const exp = base ^os-notanid;",
			"^os-alsonot",
			"```",
			"^os-code01",
		].join("\n");

		expect(collectBlockIds(text)).toEqual(new Set(["os-sig001", "os-code01"]));
	});

	it("returns an empty set when nothing carries an ID", () => {
		expect(collectBlockIds("- Rack placement\n- Signage")).toEqual(new Set());
	});

	it("reads the IDs a real subtree's bytes carry, not its transcluded ones", async () => {
		const lanes = [
			"# Bike Lanes",
			"",
			"## Parking ^os-park01",
			"",
			"![[bike-parking]]",
			"",
			"- Signage ^os-sign01",
			"",
		].join("\n");
		const parking = ["- Rack standards ^os-rack01", ""].join("\n");

		const tree = await parseVault(NESTED_HOST, {
			"bike-lanes-nested.md": lanes,
			"bike-parking.md": parking,
		});
		const holder = findByContent(tree.root, "Parking");
		const span = subtreeSpan([holder]);
		const moved = lanes.slice(span.start, span.end);

		// The embed folds to its `![[…]]` line, so bike-parking's own ID stays
		// behind with the file that still physically holds it.
		expect(moved).toContain("![[bike-parking]]");
		expect(collectBlockIds(moved)).toEqual(
			new Set(["os-park01", "os-sign01"]),
		);
	});
});

describe("stripBlockIds", () => {
	it("removes inline IDs and drops standalone `^id` lines", () => {
		const text = [
			"- Network gaps ^os-seamgap1",
			"\t- Curb separation ^os-curb01",
			"^os-tab001",
			"- Signage standards",
		].join("\n");

		expect(stripBlockIds(text)).toBe(
			["- Network gaps", "\t- Curb separation", "- Signage standards"].join(
				"\n",
			),
		);
	});

	it("preserves indentation, table pipes, and fenced code contents", () => {
		const text = [
			"\t\t- Covered shelter siting ^os-shel01",
			"| Corridor | Status |",
			"| 3rd Ave | Funded |",
			"```",
			"value ^os-notanid",
			"```",
			"^os-code01",
		].join("\n");

		expect(stripBlockIds(text)).toBe(
			[
				"\t\t- Covered shelter siting",
				"| Corridor | Status |",
				"| 3rd Ave | Funded |",
				"```",
				"value ^os-notanid",
				"```",
			].join("\n"),
		);
	});

	it("leaves text with no block IDs byte-for-byte alone", () => {
		const text = "## Parking\n\n- Rack placement rules\n\t- Bollard spacing\n";
		expect(stripBlockIds(text)).toBe(text);
	});
});

describe("partitionScheduleEntries", () => {
	const raw = {
		"os-seamgap1": { due: "2026-08-01T09:00:00", reps: 4, state: "review" },
		"os-stay001": { due: "2026-08-05T09:00:00", reps: 1, state: "review" },
	};

	it("splits entries by the moving block IDs", () => {
		const { moved, retained } = partitionScheduleEntries(
			raw,
			new Set(["os-seamgap1"]),
		);

		expect(Object.keys(moved)).toEqual(["os-seamgap1"]);
		expect(Object.keys(retained)).toEqual(["os-stay001"]);
	});

	it("carries entries verbatim, including `disabled` and hand-added keys", () => {
		const entry = {
			due: "2026-08-01T09:00:00",
			reps: 4,
			disabled: true,
			note: "hand-added",
		};
		const { moved } = partitionScheduleEntries(
			{ "os-seamgap1": entry },
			new Set(["os-seamgap1"]),
		);

		expect(moved["os-seamgap1"]).toBe(entry);
	});

	it("treats a block ID with no entry as a no-op", () => {
		const { moved, retained } = partitionScheduleEntries(
			raw,
			new Set(["os-absent"]),
		);

		expect(moved).toEqual({});
		expect(Object.keys(retained)).toEqual(["os-seamgap1", "os-stay001"]);
	});

	it("returns empty halves for a missing or malformed frontmatter value", () => {
		for (const value of [undefined, null, "not a map", ["os-x"]]) {
			expect(partitionScheduleEntries(value, new Set(["os-x"]))).toEqual({
				moved: {},
				retained: {},
			});
		}
	});
});

// ── inferChildContext: what "under this node" means ──────────────────────────
describe("inferChildContext", () => {
	it("starts a heading's children at the top of a fresh list", () => {
		// The reported bug: a heading's depth is a heading level, not a list
		// depth, so reusing it indents the child into the preceding list item.
		expect(inferChildContext(node({ type: "heading", depth: 2 }))).toEqual({
			type: "bullet",
			depth: 0,
		});
	});

	it("nests one level under a bullet or ordered item, keeping its type", () => {
		expect(inferChildContext(node({ type: "bullet", depth: 0 }))).toEqual({
			type: "bullet",
			depth: 1,
		});
		expect(inferChildContext(node({ type: "ordered", depth: 2 }))).toEqual({
			type: "ordered",
			depth: 3,
		});
	});

	it("falls back to a top-level bullet under types that cannot nest a list", () => {
		for (const type of ["codeblock", "table", "blockquote", "paragraph"] as const) {
			expect(inferChildContext(node({ type, depth: 0 }))).toEqual({
				type: "bullet",
				depth: 0,
			});
		}
	});

	it("keeps a list child's own bullet/ordered flavor", () => {
		expect(
			inferChildContext(node({ type: "bullet", depth: 1 }), node({ type: "ordered" })),
		).toEqual({ type: "ordered", depth: 2 });
		expect(
			inferChildContext(node({ type: "ordered", depth: 0 }), node({ type: "bullet" })),
		).toEqual({ type: "bullet", depth: 1 });
		expect(
			inferChildContext(node({ type: "heading", depth: 2 }), node({ type: "ordered" })),
		).toEqual({ type: "ordered", depth: 0 });
	});

	it("turns a heading dropped onto a list item into a list item", () => {
		// No heading can live inside a list — left as a heading it breaks out of
		// the list entirely instead of becoming the child the user asked for.
		expect(
			inferChildContext(node({ type: "bullet", depth: 1 }), node({ type: "heading" })),
		).toEqual({ type: "bullet", depth: 2 });
		expect(
			inferChildContext(node({ type: "ordered", depth: 0 }), node({ type: "heading" })),
		).toEqual({ type: "ordered", depth: 1 });
	});

	it("nests a heading under a heading by level, clamped at six", () => {
		expect(
			inferChildContext(node({ type: "heading", depth: 2 }), node({ type: "heading" })),
		).toEqual({ type: "heading", depth: 3 });
		// `#######` is not a heading in markdown — a child of `######` stays at 6.
		expect(
			inferChildContext(node({ type: "heading", depth: 6 }), node({ type: "heading" })),
		).toEqual({ type: "heading", depth: 6 });
	});

	it("starts a fresh top-level list under a type that nests nothing", () => {
		for (const type of ["codeblock", "table", "blockquote", "paragraph"] as const) {
			expect(
				inferChildContext(node({ type, depth: 0 }), node({ type: "heading" })),
			).toEqual({ type: "bullet", depth: 0 });
		}
	});
});

// ── childInsertOffset: where a *direct child* of a heading actually goes ──────
describe("childInsertOffset", () => {
	it("puts a heading's new child before its first sub-heading", () => {
		// The reported bug: appending at subtreeEnd writes past `## Edge Cases`,
		// and markdown then reads the line as that sub-heading's child — several
		// screens from the node the user selected.
		const md = [
			"# City Transit Plan",
			"- Frequency targets",
			"## Bike Network",
			"- Lane audit",
			"## Edge Cases",
		].join("\n");
		const tree = parser.parse(md, "f.md");
		const plan = findByContent(tree.root, "City Transit Plan");
		expect(childInsertOffset(plan)).toBe(md.indexOf("## Bike Network"));
		expect(childInsertOffset(plan)).not.toBe(subtreeEnd(plan));
	});

	it("falls back to subtreeEnd for a heading with only list children", () => {
		const md = ["## Bus Network", "- Route 12", "\t- Stop list"].join("\n");
		const tree = parser.parse(md, "f.md");
		const bus = findByContent(tree.root, "Bus Network");
		expect(childInsertOffset(bus)).toBe(subtreeEnd(bus));
	});

	it("is unchanged for a list parent, whose subtree end really is its last child", () => {
		const md = ["- Route 12", "\t- Stop list"].join("\n");
		const tree = parser.parse(md, "f.md");
		const route = findByContent(tree.root, "Route 12");
		expect(childInsertOffset(route)).toBe(subtreeEnd(route));
	});

	it("ignores a transcluded heading child, whose start indexes another file", async () => {
		// An embed is one `![[…]]` line *here*: a heading inside it splits the
		// source note's bytes, not the host's. Honoring it would splice the host
		// file at a source-file offset — near the top of the wrong file.
		const host = [
			"# City Transit Plan",
			"- Frequency targets",
			"![[bike-network]]",
		].join("\n");
		const tree = await parseVault(host, {
			"bike-network.md": ["# Bike Network", "- Lane audit"].join("\n"),
		});
		const plan = findByContent(tree.root, "City Transit Plan");
		const embedded = findByContent(tree.root, "Bike Network");
		expect(embedded.type).toBe("heading");
		expect(embedded.embedHostRange).toBeDefined();
		// Not `embedded.range.start` (0, in bike-network.md's coordinates).
		expect(childInsertOffset(plan)).toBe(subtreeEnd(plan));
		expect(childInsertOffset(plan)).toBe(host.length);
	});
});

// ── Paste composition: one target context and one re-level per clipboard item ─
describe("multi-item paste promotes each item on its own terms", () => {
	const md = ["- Lane audit", "## Bike Network"].join("\n");

	/** What `pasteNodes` does per clipboard record. */
	function promote(parent: OsmosisNode, items: readonly OsmosisNode[]): string[] {
		return items.map((item) => {
			const text = md.slice(item.range.start, subtreeEnd(item));
			const ctx = inferChildContext(parent, item);
			return reindentSubtree(text, item, ctx.type, ctx.depth);
		});
	}

	/** The two copied subtrees, as separate top-level clipboard items. */
	function copied(): OsmosisNode[] {
		const tree = parser.parse(md, "src.md");
		return [
			findByContent(tree.root, "Lane audit"),
			findByContent(tree.root, "Bike Network"),
		];
	}

	it("lands a heading and a bullet from one clipboard at their own levels", () => {
		const items = copied();
		// Onto `## Bus Network`: the bullet starts a fresh list, the heading nests
		// a level deeper. The old single delta came from the *first* item only —
		// zero, for the bullet — leaving `## Bike Network` a sibling of the
		// target rather than a child of it.
		const bus = node({ type: "heading", depth: 2, content: "Bus Network" });
		expect(promote(bus, items)).toEqual(["- Lane audit", "### Bike Network"]);
	});

	it("converts both to list items when the target is a list item", () => {
		const items = copied();
		const route = node({ type: "bullet", depth: 1, content: "Route 12" });
		expect(promote(route, items)).toEqual([
			"\t\t- Lane audit",
			"\t\t- Bike Network",
		]);
	});
});

describe("editOverlayGeometry", () => {
	// A 200×40 node sitting at map origin, drawn at half zoom, inside a
	// 1000×600 view. Its text is 13px/17px in map units.
	function geom(overrides: Partial<Parameters<typeof editOverlayGeometry>[0]> = {}) {
		return editOverlayGeometry({
			nodeRect: { left: 100, top: 50, width: 100, height: 20 },
			viewport: { left: 0, top: 0, right: 1000, bottom: 600 },
			zoom: 0.5,
			fontSize: 13,
			lineHeight: 17,
			paddingX: 8,
			paddingY: 4,
			maxNodeWidth: 230,
			...overrides,
		});
	}

	it("scales text and padding by the zoom so the overlay matches the map", () => {
		const g = geom();
		expect(g.fontSize).toBe(6.5);
		expect(g.lineHeight).toBe(8.5);
		expect(g.paddingX).toBe(4);
		expect(g.paddingY).toBe(2);
	});

	it("sits on the node and never shrinks below it", () => {
		const g = geom();
		expect([g.left, g.top]).toEqual([100, 50]);
		expect([g.minWidth, g.minHeight]).toEqual([100, 20]);
	});

	it("stops widening where the node itself would wrap", () => {
		// 230 map units at half zoom — not the 900px of room on screen.
		expect(geom().maxWidth).toBe(115);
	});

	it("keeps the wrap width in step with the zoom", () => {
		expect(geom({ zoom: 2, nodeRect: { left: 100, top: 50, width: 400, height: 80 } }).maxWidth).toBe(460);
	});

	it("gives up the node's wrap width rather than run off screen", () => {
		// Node near the right edge: only 60px of room, less than 230 × 0.5.
		const g = geom({ nodeRect: { left: 940, top: 50, width: 40, height: 20 } });
		expect(g.maxWidth).toBe(60);
	});

	it("never reports a max narrower than the node it covers", () => {
		// A node wider than the room left on screen (map panned past the edge).
		const g = geom({ nodeRect: { left: 960, top: 50, width: 200, height: 20 } });
		expect(g.maxWidth).toBe(200);
		expect(g.maxHeight).toBeGreaterThanOrEqual(g.minHeight);
	});
});

describe("retypeSubtree re-nests children when a rename crosses list/heading", () => {
	/** Replay `renameNode`: splice the edited line (or retyped subtree) in. */
	function rename(md: string, content: string, editedLine: string): string {
		const src = findByContent(parser.parse(md, "t.md").root, content);
		const line = restoreEditedLine(src, editedLine);
		const end = subtreeEnd(src);
		const retyped = retypeSubtree(md.slice(src.range.start, end), src.type, line);
		if (retyped === null) return md.slice(0, src.range.start) + line + md.slice(src.range.end);
		// The seams `retypeInFile` separates when it splices the block in place.
		const start = src.range.start;
		return separateRuns(md.slice(0, start) + retyped + md.slice(end), [start, start + retyped.length + 1]).text;
	}

	it("dedents a top-level item's children when it becomes a heading", () => {
		const md = "## Top\n\n- item\n\t- child\n\t\t- gc\n- other";
		const out = rename(md, "item", "### item");
		expect(out).toBe("## Top\n\n### item\n- child\n\t- gc\n- other");
		const item = findByContent(parser.parse(out, "t.md").root, "item");
		expect(item.type).toBe("heading");
		expect(findByContent(item, "child").depth).toBe(0);
	});

	// T75: the edit would leave two headings adjacent (one line group); the op
	// puts the blank line in itself rather than relying on the normalizer.
	it("parents grandchildren under a sub-heading made from a former child", () => {
		// The reported sequence: item → ###, then its former child → ####.
		let md = "## Top\n\n- item\n\t- child\n\t\t- gc";
		md = rename(md, "item", "### item");
		md = rename(md, "child", "#### child");
		const child = findByContent(parser.parse(md, "t.md").root, "child");
		expect(child.type).toBe("heading");
		expect(child.depth).toBe(4);
		expect(child.children.map((c) => c.content)).toEqual(["gc"]);
		expect(findByContent(child, "gc").depth).toBe(0);
	});

	it("moves a nested item's heading to column 0 and keeps its block ID", () => {
		const md = "- parent\n\t- item ^abc123\n\t\t- child";
		const out = rename(md, "item", "### item");
		expect(out).toBe("- parent\n### item ^abc123\n- child");
	});

	it("strips space indentation verbatim", () => {
		const md = "- item\n    - child\n        - gc";
		expect(rename(md, "item", "## item")).toBe("## item\n- child\n    - gc");
	});

	it("keeps fenced code's relative indentation when stripping the prefix", () => {
		const text = "- item\n\t```\n\tcode\n\t  more\n\t```";
		expect(retypeSubtree(text, "bullet", "## item")).toBe("## item\n```\ncode\n  more\n```");
	});

	it("indents a heading's content under the new list item, up to its first sub-heading", () => {
		const md = "## Top\n\n### item\n\n- child\n\t- gc\n\n#### sub\n\n- deep";
		const out = rename(md, "item", "- item");
		expect(out).toBe("## Top\n\n- item\n\t- child\n\t\t- gc\n\n#### sub\n\n- deep");
		const item = findByContent(parser.parse(out, "t.md").root, "item");
		expect(item.type).toBe("bullet");
		expect(item.children.map((c) => c.content)).toEqual(["child"]);
	});

	it("leaves a same-kind rename to the one-line splice", () => {
		expect(retypeSubtree("- a\n\t- b", "bullet", "- renamed")).toBeNull();
		expect(retypeSubtree("## a\n- b", "heading", "### a")).toBeNull();
	});
});

describe("retypeInFile moves a retyped node to where it keeps its parent", () => {
	/** Replay `renameNode` + `writeMarkdown`: retype, then normalize spacing. */
	function rename(md: string, content: string, editedLine: string): string {
		const root = parser.parse(md, "t.md").root;
		const src = findByContent(root, content);
		const ancestors: OsmosisNode[] = [];
		for (let p = findParent(root, src); p; p = findParent(root, p)) ancestors.push(p);
		const out = retypeInFile(md, src, ancestors, restoreEditedLine(src, editedLine));
		expect(out).not.toBeNull();
		return normalizeBlockSpacing(out!).content;
	}

	function findParent(node: OsmosisNode, target: OsmosisNode): OsmosisNode | null {
		for (const child of node.children) {
			if (child === target) return node;
			const found = findParent(child, target);
			if (found) return found;
		}
		return null;
	}

	/** Each node's children, as `content` lists, for asserting the tree shape. */
	function childrenOf(md: string, content: string): string[] {
		return findByContent(parser.parse(md, "t.md").root, content).children.map((c) => c.content);
	}

	const garden =
		"# Garden\n\n## Beds\n\n- Vegetables\n\t- Tomatoes\n\t- Peppers\n- Herbs\n\t- Basil\n\n### Flowers\n\n- Annuals\n\n#### Perennials\n\n- Lavender";

	it("moves a new heading below its remaining list siblings, so they keep their parent", () => {
		const out = rename(garden, "Vegetables", "### Vegetables");
		expect(childrenOf(out, "Beds")).toEqual(["Herbs", "Vegetables", "Flowers"]);
		expect(childrenOf(out, "Vegetables")).toEqual(["Tomatoes", "Peppers"]);
		expect(childrenOf(out, "Herbs")).toEqual(["Basil"]);
	});

	it("retypes in place when no list sibling follows", () => {
		const out = rename(garden, "Herbs", "### Herbs");
		expect(childrenOf(out, "Beds")).toEqual(["Vegetables", "Herbs", "Flowers"]);
		expect(childrenOf(out, "Herbs")).toEqual(["Basil"]);
	});

	it("moves a new list item above its heading siblings, so it doesn't land in their section", () => {
		const md = rename(garden, "Vegetables", "### Vegetables");
		const out = rename(md, "Flowers", "- Flowers");
		expect(childrenOf(out, "Beds")).toEqual(["Herbs", "Flowers", "Perennials", "Vegetables"]);
		expect(childrenOf(out, "Flowers")).toEqual(["Annuals"]);
		expect(childrenOf(out, "Vegetables")).toEqual(["Tomatoes", "Peppers"]);
	});

	it("round-trips: list → heading → list keeps the whole tree", () => {
		const there = rename(garden, "Vegetables", "### Vegetables");
		const back = rename(there, "Vegetables", "- Vegetables");
		expect(childrenOf(back, "Beds")).toEqual(["Herbs", "Vegetables", "Flowers"]);
		expect(childrenOf(back, "Vegetables")).toEqual(["Tomatoes", "Peppers"]);
	});

	it("lifts a nested item out of its list, leaving its list siblings where they were", () => {
		const md = "## Beds\n\n- Vegetables\n\t- Tomatoes\n\t\t- Cherry\n\t- Peppers\n- Herbs";
		const out = rename(md, "Tomatoes", "### Tomatoes");
		expect(childrenOf(out, "Beds")).toEqual(["Vegetables", "Herbs", "Tomatoes"]);
		expect(childrenOf(out, "Vegetables")).toEqual(["Peppers"]);
		expect(childrenOf(out, "Tomatoes")).toEqual(["Cherry"]);
	});

	it("returns null for a rename that doesn't cross list/heading", () => {
		const src = findByContent(parser.parse(garden, "t.md").root, "Herbs");
		expect(retypeInFile(garden, src, [], "- Herbal")).toBeNull();
	});
});

describe("toggleCheckboxLine", () => {
	it("ticks an unchecked box", () => {
		expect(toggleCheckboxLine("- [ ] Rig the mainsail", false)).toBe("- [x] Rig the mainsail");
	});

	it("unticks a checked box, either case", () => {
		expect(toggleCheckboxLine("- [x] Rig the mainsail", true)).toBe("- [ ] Rig the mainsail");
		expect(toggleCheckboxLine("- [X] Rig the mainsail", true)).toBe("- [ ] Rig the mainsail");
	});

	it("flips only the first box and keeps indentation and a block id", () => {
		expect(toggleCheckboxLine("\t- [ ] Coil [ ] the line ^coil", false)).toBe("\t- [x] Coil [ ] the line ^coil");
		expect(toggleCheckboxLine("- [x] See [x] below", true)).toBe("- [ ] See [x] below");
	});

	it("leaves a line with no matching box alone", () => {
		expect(toggleCheckboxLine("- plain", false)).toBe("- plain");
		expect(toggleCheckboxLine("- [ ] open", true)).toBe("- [ ] open");
	});
});

describe("renameInFile (what MindMapView.renameNode writes)", () => {
	const md = "## Rigging\n\n- Halyard ^rig-1\n\t- Shackle\n- Sheet\n\n## Mooring\n\n- Cleat\n";

	function rename(content: string, newLine: string) {
		const root = parser.parse(md, "t.md").root;
		const src = findByContent(root, content);
		const ancestors: OsmosisNode[] = [];
		const walk = (n: OsmosisNode, trail: OsmosisNode[]): boolean => {
			if (n === src) { ancestors.push(...trail.slice().reverse()); return true; }
			return n.children.some((c) => walk(c, [...trail, n]));
		};
		walk(root, []);
		return { src, ...renameInFile(md, src, ancestors, newLine) };
	}

	it("replaces just the one line, keeping the block id the box withheld", () => {
		const out = rename("Halyard", "- Main halyard");
		expect(out.retyped).toBe(false);
		expect(out.text).toBe(md.replace("- Halyard ^rig-1", "- Main halyard ^rig-1"));
	});

	it("keeps a nested item's indentation", () => {
		const out = rename("Shackle", "- Bow shackle");
		expect(out.text).toBe(md.replace("\t- Shackle", "\t- Bow shackle"));
	});

	it("is byte-identical when the text is unchanged", () => {
		const root = parser.parse(md, "t.md").root;
		const src = findByContent(root, "Halyard");
		expect(renameInFile(md, src, [], nodeEditText(src)).text).toBe(md);
	});

	it("reports a retype and moves the block, as retypeInFile does", () => {
		const out = rename("Halyard", "### Halyard");
		expect(out.retyped).toBe(true);
		const root = parser.parse(md, "t.md").root;
		const src = findByContent(root, "Halyard");
		const rigging = root.children[0]!;
		expect(out.text).toBe(retypeInFile(md, src, [rigging, root], restoreEditedLine(src, "### Halyard")));
	});
});

describe("normalizeWrite", () => {
	it("renumbers ordered lists, then normalises block spacing", () => {
		const md = "- one\n## Heading\n1. a\n1. b\n";
		expect(normalizeWrite(md)).toBe(normalizeBlockSpacing(renumberOrderedLists(md)).content);
		expect(normalizeWrite(md)).toBe("- one\n\n## Heading\n\n1. a\n2. b\n");
	});

	it("is idempotent", () => {
		const once = normalizeWrite("Text\n## H\n- a\n");
		expect(normalizeWrite(once)).toBe(once);
	});
});


// ─── Structural edits within one file ────────────────────
// The expected texts were captured from MindMapView's own code (the
// private methods that hold the logic before it moved here), run over this note.

describe("structural edits give the bytes the mind map wrote", () => {
	const harbour = "# Harbour\n\nIntro paragraph.\n\n## Moorings\n\n- Bow line\n- Stern line ^stern\n\t- Spring\n\t- Breast\n1. First\n2. Second\n- [ ] Check cleats\n\n## Fuel\n\n- Diesel\n\t- Red dye\n\n```js\nconst a = 1;\n```\n\n> Quote line\n\n| a | b |\n| - | - |\n| 1 | 2 |\n";
	const root = parser.parse(harbour, "Harbour.md").root;
	const find = (type: string, content: string): { node: OsmosisNode; parent: OsmosisNode; index: number } => {
		const walk = (parent: OsmosisNode): { node: OsmosisNode; parent: OsmosisNode; index: number } | null => {
			for (const [index, node] of parent.children.entries()) {
				if (node.type === type && node.content === content) return { node, parent, index };
				const found = walk(node);
				if (found) return found;
			}
			return null;
		};
		const found = walk(root);
		if (!found) throw new Error(`no ${type} ${content}`);
		return found;
	};
	const run = (kind: string, type: string, content: string): string | null => {
		const { node, parent, index } = find(type, content);
		switch (kind) {
			case "child": return insertChild(harbour, node).text;
			case "sibling": return insertSibling(harbour, node).text;
			case "delete": return deleteSubtree(harbour, node);
			case "up": return moveSiblings(harbour, [node], parent.children[index - 1]!).text;
			case "down": return moveSiblings(harbour, [node], parent.children[index + 1]!).text;
			case "indent": return indentSiblings(harbour, [node], parent.children[index - 1]!).text;
			case "outdent": return outdentSiblings(harbour, parent, [node])?.text ?? null;
			default: return insertParent(harbour, node, { start: node.range.start, end: subtreeEnd(node) }).text;
		}
	};

	it.each<[string, string, string, string]>([
		["child", "bullet", "Stern line", "# Harbour\n\nIntro paragraph.\n\n## Moorings\n\n- Bow line\n- Stern line ^stern\n\t- Spring\n\t- Breast\n\t- \n1. First\n2. Second\n- [ ] Check cleats\n\n## Fuel\n\n- Diesel\n\t- Red dye\n\n```js\nconst a = 1;\n```\n\n> Quote line\n\n| a | b |\n| - | - |\n| 1 | 2 |\n"],
		["child", "heading", "Moorings", "# Harbour\n\nIntro paragraph.\n\n## Moorings\n\n- Bow line\n- Stern line ^stern\n\t- Spring\n\t- Breast\n1. First\n2. Second\n- [ ] Check cleats\n- \n\n## Fuel\n\n- Diesel\n\t- Red dye\n\n```js\nconst a = 1;\n```\n\n> Quote line\n\n| a | b |\n| - | - |\n| 1 | 2 |\n"],
		["child", "bullet", "Diesel", "# Harbour\n\nIntro paragraph.\n\n## Moorings\n\n- Bow line\n- Stern line ^stern\n\t- Spring\n\t- Breast\n1. First\n2. Second\n- [ ] Check cleats\n\n## Fuel\n\n- Diesel\n\t- Red dye\n\t- \n\n```js\nconst a = 1;\n```\n\n> Quote line\n\n| a | b |\n| - | - |\n| 1 | 2 |\n"],
		["sibling", "bullet", "Stern line", "# Harbour\n\nIntro paragraph.\n\n## Moorings\n\n- Bow line\n- Stern line ^stern\n\t- Spring\n\t- Breast\n- \n1. First\n2. Second\n- [ ] Check cleats\n\n## Fuel\n\n- Diesel\n\t- Red dye\n\n```js\nconst a = 1;\n```\n\n> Quote line\n\n| a | b |\n| - | - |\n| 1 | 2 |\n"],
		["sibling", "paragraph", "Intro paragraph.", "# Harbour\n\nIntro paragraph.\n\n\u200b\n\n## Moorings\n\n- Bow line\n- Stern line ^stern\n\t- Spring\n\t- Breast\n1. First\n2. Second\n- [ ] Check cleats\n\n## Fuel\n\n- Diesel\n\t- Red dye\n\n```js\nconst a = 1;\n```\n\n> Quote line\n\n| a | b |\n| - | - |\n| 1 | 2 |\n"],
		["sibling", "bullet", "[ ] Check cleats", "# Harbour\n\nIntro paragraph.\n\n## Moorings\n\n- Bow line\n- Stern line ^stern\n\t- Spring\n\t- Breast\n1. First\n2. Second\n- [ ] Check cleats\n- [ ] \n\n## Fuel\n\n- Diesel\n\t- Red dye\n\n```js\nconst a = 1;\n```\n\n> Quote line\n\n| a | b |\n| - | - |\n| 1 | 2 |\n"],
		["sibling", "heading", "Fuel", "# Harbour\n\nIntro paragraph.\n\n## Moorings\n\n- Bow line\n- Stern line ^stern\n\t- Spring\n\t- Breast\n1. First\n2. Second\n- [ ] Check cleats\n\n## Fuel\n\n- Diesel\n\t- Red dye\n\n```js\nconst a = 1;\n```\n\n> Quote line\n\n| a | b |\n| - | - |\n| 1 | 2 |\n## \n"],
		["sibling", "ordered", "First", "# Harbour\n\nIntro paragraph.\n\n## Moorings\n\n- Bow line\n- Stern line ^stern\n\t- Spring\n\t- Breast\n1. First\n1. \n2. Second\n- [ ] Check cleats\n\n## Fuel\n\n- Diesel\n\t- Red dye\n\n```js\nconst a = 1;\n```\n\n> Quote line\n\n| a | b |\n| - | - |\n| 1 | 2 |\n"],
		["delete", "bullet", "Spring", "# Harbour\n\nIntro paragraph.\n\n## Moorings\n\n- Bow line\n- Stern line ^stern\n\t- Breast\n1. First\n2. Second\n- [ ] Check cleats\n\n## Fuel\n\n- Diesel\n\t- Red dye\n\n```js\nconst a = 1;\n```\n\n> Quote line\n\n| a | b |\n| - | - |\n| 1 | 2 |\n"],
		["delete", "bullet", "Stern line", "# Harbour\n\nIntro paragraph.\n\n## Moorings\n\n- Bow line\n1. First\n2. Second\n- [ ] Check cleats\n\n## Fuel\n\n- Diesel\n\t- Red dye\n\n```js\nconst a = 1;\n```\n\n> Quote line\n\n| a | b |\n| - | - |\n| 1 | 2 |\n"],
		["delete", "heading", "Fuel", "# Harbour\n\nIntro paragraph.\n\n## Moorings\n\n- Bow line\n- Stern line ^stern\n\t- Spring\n\t- Breast\n1. First\n2. Second\n- [ ] Check cleats\n\n"],
		["delete", "bullet", "Diesel", "# Harbour\n\nIntro paragraph.\n\n## Moorings\n\n- Bow line\n- Stern line ^stern\n\t- Spring\n\t- Breast\n1. First\n2. Second\n- [ ] Check cleats\n\n## Fuel\n\n\n```js\nconst a = 1;\n```\n\n> Quote line\n\n| a | b |\n| - | - |\n| 1 | 2 |\n"],
		["up", "bullet", "Stern line", "# Harbour\n\nIntro paragraph.\n\n## Moorings\n- Stern line ^stern\n\t- Spring\n\t- Breast\n- Bow line\n1. First\n2. Second\n- [ ] Check cleats\n\n## Fuel\n\n- Diesel\n\t- Red dye\n\n```js\nconst a = 1;\n```\n\n> Quote line\n\n| a | b |\n| - | - |\n| 1 | 2 |\n"],
		["down", "bullet", "Bow line", "# Harbour\n\nIntro paragraph.\n\n## Moorings\n- Stern line ^stern\n\t- Spring\n\t- Breast\n- Bow line\n1. First\n2. Second\n- [ ] Check cleats\n\n## Fuel\n\n- Diesel\n\t- Red dye\n\n```js\nconst a = 1;\n```\n\n> Quote line\n\n| a | b |\n| - | - |\n| 1 | 2 |\n"],
		["down", "heading", "Moorings", "# Harbour\n\nIntro paragraph.\n\n## Fuel\n\n- Diesel\n\t- Red dye\n\n```js\nconst a = 1;\n```\n\n> Quote line\n\n| a | b |\n| - | - |\n| 1 | 2 |\n## Moorings\n\n- Bow line\n- Stern line ^stern\n\t- Spring\n\t- Breast\n1. First\n2. Second\n- [ ] Check cleats\n"],
		["up", "heading", "Fuel", "# Harbour\n\nIntro paragraph.\n\n## Fuel\n\n- Diesel\n\t- Red dye\n\n```js\nconst a = 1;\n```\n\n> Quote line\n\n| a | b |\n| - | - |\n| 1 | 2 |\n## Moorings\n\n- Bow line\n- Stern line ^stern\n\t- Spring\n\t- Breast\n1. First\n2. Second\n- [ ] Check cleats\n"],
		["indent", "bullet", "Stern line", "# Harbour\n\nIntro paragraph.\n\n## Moorings\n\n- Bow line\n\t- Stern line ^stern\n\t\t- Spring\n\t\t- Breast\n1. First\n2. Second\n- [ ] Check cleats\n\n## Fuel\n\n- Diesel\n\t- Red dye\n\n```js\nconst a = 1;\n```\n\n> Quote line\n\n| a | b |\n| - | - |\n| 1 | 2 |\n"],
		["indent", "heading", "Fuel", "# Harbour\n\nIntro paragraph.\n\n## Moorings\n\n- Bow line\n- Stern line ^stern\n\t- Spring\n\t- Breast\n1. First\n2. Second\n- [ ] Check cleats\n### Fuel\n\n- Diesel\n\t- Red dye\n\n```js\nconst a = 1;\n```\n\n> Quote line\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n"],
		["indent", "bullet", "Breast", "# Harbour\n\nIntro paragraph.\n\n## Moorings\n\n- Bow line\n- Stern line ^stern\n\t- Spring\n\t\t- Breast\n1. First\n2. Second\n- [ ] Check cleats\n\n## Fuel\n\n- Diesel\n\t- Red dye\n\n```js\nconst a = 1;\n```\n\n> Quote line\n\n| a | b |\n| - | - |\n| 1 | 2 |\n"],
		["outdent", "bullet", "Spring", "# Harbour\n\nIntro paragraph.\n\n## Moorings\n\n- Bow line\n- Stern line ^stern\n\t- Breast\n- Spring\n1. First\n2. Second\n- [ ] Check cleats\n\n## Fuel\n\n- Diesel\n\t- Red dye\n\n```js\nconst a = 1;\n```\n\n> Quote line\n\n| a | b |\n| - | - |\n| 1 | 2 |\n"],
		["outdent", "bullet", "Bow line", "# Harbour\n\nIntro paragraph.\n\n## Moorings\n\n- Stern line ^stern\n\t- Spring\n\t- Breast\n1. First\n2. Second\n- [ ] Check cleats\nBow line\n\n## Fuel\n\n- Diesel\n\t- Red dye\n\n```js\nconst a = 1;\n```\n\n> Quote line\n\n| a | b |\n| - | - |\n| 1 | 2 |\n"],
		["outdent", "paragraph", "Intro paragraph.", "# Harbour\n\n\n## Moorings\n\n- Bow line\n- Stern line ^stern\n\t- Spring\n\t- Breast\n1. First\n2. Second\n- [ ] Check cleats\n\n## Fuel\n\n- Diesel\n\t- Red dye\n\n```js\nconst a = 1;\n```\n\n> Quote line\n\n| a | b |\n| - | - |\n| 1 | 2 |\n# Intro paragraph.\n"],
		["outdent", "heading", "Moorings", "# Harbour\n\nIntro paragraph.\n\n\n## Fuel\n\n- Diesel\n\t- Red dye\n\n```js\nconst a = 1;\n```\n\n> Quote line\n\n| a | b |\n| - | - |\n| 1 | 2 |\n# Moorings\n\n- Bow line\n- Stern line ^stern\n\t- Spring\n\t- Breast\n1. First\n2. Second\n- [ ] Check cleats\n"],
		["parent", "bullet", "Bow line", "# Harbour\n\nIntro paragraph.\n\n## Moorings\n\n- \n\t- Bow line\n- Stern line ^stern\n\t- Spring\n\t- Breast\n1. First\n2. Second\n- [ ] Check cleats\n\n## Fuel\n\n- Diesel\n\t- Red dye\n\n```js\nconst a = 1;\n```\n\n> Quote line\n\n| a | b |\n| - | - |\n| 1 | 2 |\n"],
		["parent", "heading", "Fuel", "# Harbour\n\nIntro paragraph.\n\n## Moorings\n\n- Bow line\n- Stern line ^stern\n\t- Spring\n\t- Breast\n1. First\n2. Second\n- [ ] Check cleats\n\n## \n\n### Fuel\n\n- Diesel\n\t- Red dye\n\n```js\nconst a = 1;\n```\n\n> Quote line\n\n| a | b |\n| - | - |\n| 1 | 2 |\n"],
	])("%s %s %s", (kind, type, content, expected) => {
		expect(run(kind, type, content)).toBe(expected);
	});

	it("refuses to promote a heading that is already at the root", () => {
		const flat = "# Top\n\n- Item\n";
		const tree = parser.parse(flat, "Flat.md").root;
		expect(outdentSiblings(flat, tree, [tree.children[0]!])).toBeNull();
	});
});

describe("structural edits report where their line starts", () => {
	const at = (text: string, start: number): string => text.slice(start).split("\n")[0]!;

	it("insertChild: the new empty bullet, under a bullet and before a heading's first sub-heading", () => {
		const text = "# Top\n\n- A\n\t- A1\n- B\n\n## Sub\n";
		const root = parser.parse(text, "T.md").root;
		const top = root.children[0]!;
		const a = top.children[0]!;
		const underA = insertChild(text, a);
		expect(at(underA.text, underA.start)).toBe("\t- ");
		expect(underA.text.slice(0, underA.start)).toBe("# Top\n\n- A\n\t- A1\n");
		const underTop = insertChild(text, top);
		expect(at(underTop.text, underTop.start)).toBe("- ");
		expect(underTop.text.slice(underTop.start + 2, underTop.start + 3)).not.toBe("B");
		expect(underTop.text.indexOf("## Sub")).toBeGreaterThan(underTop.start);
	});

	it("insertSibling: the new bullet, checkbox and paragraph placeholder", () => {
		const text = "- A\n\t- A1\n- [x] B\n\nPlain.\n";
		const root = parser.parse(text, "T.md").root;
		const [a, b, plain] = root.children as [OsmosisNode, OsmosisNode, OsmosisNode];
		const afterA = insertSibling(text, a);
		expect(at(afterA.text, afterA.start)).toBe("- ");
		expect(afterA.text.slice(0, afterA.start)).toBe("- A\n\t- A1\n");
		const afterB = insertSibling(text, b);
		expect(at(afterB.text, afterB.start)).toBe("- [ ] ");
		const afterPlain = insertSibling(text, plain);
		expect(at(afterPlain.text, afterPlain.start)).toBe("\u200B");
	});

	it("insertSiblingBefore: the new line goes above, with the same placeholders", () => {
		const text = "- A\n\t- A1\n- [x] B\n\nPlain.\nMore.\n";
		const root = parser.parse(text, "T.md").root;
		const [a, b, plain] = root.children as [OsmosisNode, OsmosisNode, OsmosisNode];
		const beforeA = insertSiblingBefore(text, a);
		expect(beforeA.text).toBe("- \n- A\n\t- A1\n- [x] B\n\nPlain.\nMore.\n");
		expect(beforeA.start).toBe(0);
		const beforeA1 = insertSiblingBefore(text, a.children[0]!);
		expect(beforeA1.text.startsWith("- A\n\t- \n\t- A1\n")).toBe(true);
		expect(at(beforeA1.text, beforeA1.start)).toBe("\t- ");
		const beforeB = insertSiblingBefore(text, b);
		expect(at(beforeB.text, beforeB.start)).toBe("- [ ] ");
		expect(beforeB.text.slice(0, beforeB.start)).toBe("- A\n\t- A1\n");
		const beforePlain = insertSiblingBefore(text, plain);
		expect(at(beforePlain.text, beforePlain.start)).toBe("\u200B");
		expect(beforePlain.text).toBe("- A\n\t- A1\n- [x] B\n\n\u200B\n\nPlain.\nMore.\n");
	});

	it("insertSiblingBefore: a paragraph straight under a heading gets a blank line above the placeholder", () => {
		// A blank line keeps "Plain." its own node (adjacent lines group, T75).
		const text = "# Head\n\nPlain.\n";
		const para = parser.parse(text, "T.md").root.children[0]!.children[0]!;
		expect(para.type).toBe("paragraph");
		const out = insertSiblingBefore(text, para);
		expect(out.text).toBe("# Head\n\n\u200B\n\nPlain.\n");
		expect(at(out.text, out.start)).toBe("\u200B");
	});

	it("insertSiblingBefore: the root has nothing above it, so it behaves as insertSibling", () => {
		const text = "- A\n";
		const root = parser.parse(text, "T.md").root;
		expect(insertSiblingBefore(text, root)).toEqual(insertSibling(text, root));
	});

	it("moveSiblings: the first line of the block that moved", () => {
		const text = "- A\n\t- A1\n- B\n- C\n";
		const root = parser.parse(text, "T.md").root;
		const [a, b, c] = root.children as [OsmosisNode, OsmosisNode, OsmosisNode];
		const down = moveSiblings(text, [a], b);
		expect(down.text).toBe("- B\n- A\n\t- A1\n- C\n");
		expect(at(down.text, down.start)).toBe("- A");
		const up = moveSiblings(text, [c], b);
		expect(up.text).toBe("- A\n\t- A1\n- C\n- B\n");
		expect(at(up.text, up.start)).toBe("- C");
	});

	it("indentSiblings and outdentSiblings: the first line of the block, re-levelled", () => {
		const text = "- A\n- B\n\t- B1\n- C\n";
		const root = parser.parse(text, "T.md").root;
		const [a, b] = root.children as [OsmosisNode, OsmosisNode];
		const indented = indentSiblings(text, [b], a);
		expect(indented.text).toBe("- A\n\t- B\n\t\t- B1\n- C\n");
		expect(at(indented.text, indented.start)).toBe("\t- B");
		const b1 = b.children[0]!;
		const outdented = outdentSiblings(text, b, [b1])!;
		expect(outdented.text).toBe("- A\n- B\n- B1\n- C\n");
		expect(at(outdented.text, outdented.start)).toBe("- B1");
	});

	it("insertParent: the new line, and where the block now starts", () => {
		const text = "- A\n\t- A1\n- B\n";
		const a = parser.parse(text, "T.md").root.children[0]!;
		const out = insertParent(text, a, { start: a.range.start, end: subtreeEnd(a) });
		expect(out.text).toBe("- \n\t- A\n\t\t- A1\n- B\n");
		expect(at(out.text, out.start)).toBe("- ");
		expect(at(out.text, out.moved!)).toBe("\t- A");
	});
});

describe("the structural type rules", () => {
	const flat = "# Top\n\n## Sub\n\n- Item\n";
	const top = parser.parse(flat, "F.md").root.children[0]!;
	const sub = top.children[0]!;
	const item = sub.children[0]!;

	it("inferChildType and inferChildDepth", () => {
		expect([inferChildType(top), inferChildDepth(top)]).toEqual(["bullet", 0]);
		expect([inferChildType(item), inferChildDepth(item)]).toEqual(["bullet", 1]);
	});

	it("indent under a heading keeps a heading a heading, one level deeper; a list item becomes a bullet", () => {
		expect([inferIndentType(top, sub), inferIndentDepth(top, sub)]).toEqual(["heading", 2]);
		expect([inferIndentType(top, item), inferIndentDepth(top, item)]).toEqual(["bullet", 0]);
	});

	it("outdent: heading under heading, depth-0 item under a heading becomes a paragraph, a nested item keeps its type", () => {
		expect(outdentContext(sub, top)).toEqual({ type: "heading", depth: 1 });
		expect(outdentContext(item, sub)).toEqual({ type: "paragraph", depth: 2 });
	});

	it("inferRootHeadingLevel: the nearest heading sibling's level, else 1", () => {
		const root = parser.parse("Para\n\n### H3\n\nOther\n", "R.md").root;
		expect(inferRootHeadingLevel(root, 0)).toBe(3);
		expect(inferRootHeadingLevel(parser.parse("Para\n", "R.md").root, 0)).toBe(1);
	});

	it("indentSubtreeHeadings raises h1-h5 and leaves h6 and other lines", () => {
		expect(indentSubtreeHeadings("## A\n- x\n###### Z")).toBe("### A\n- x\n###### Z");
	});
});

/**
 * The mind map's same-file drop (`executeDrop`), extracted for the 3D graph's
 * "Move under / Move after". Before the extraction, the new functions were run
 * against a verbatim copy of the old 2D code for every node and every gap of
 * every fixture with up to 120 nodes (145,714 drops): identical text. These
 * literals were captured from that code.
 */
describe("moveWithinFile and dropContext (2D drag-and-drop)", () => {
	const md = ["# Deck", "", "- Coil the lines", "\t- Bow line", "\t- Stern line", "- Rig the fenders ^os-fend01", "", "## Galley", "", "1. Light the stove", "2. Boil water", ""].join("\n");
	const drop = (moving: string, target: string, index: number): { text: string; start: number } => {
		const root = parser.parse(md, "f.md").root;
		const src = findByContent(root, moving);
		const parent = findByContent(root, target);
		const site = resolveInsertSite(parent, index, () => "f.md");
		return moveWithinFile(md, [src], site.offset, (n) => dropContext(parent, index, n));
	};

	it("moves forward under another line, keeping the block ID", () => {
		const out = drop("Rig the fenders", "Coil the lines", 2);
		expect(out.text).toBe("# Deck\n\n- Coil the lines\n\t- Bow line\n\t- Stern line\n\t- Rig the fenders ^os-fend01\n## Galley\n\n1. Light the stove\n2. Boil water\n");
		expect(out.text.startsWith("\t- Rig the fenders", out.start)).toBe(true);
	});

	it("moves backward, out from under its parent", () => {
		const out = drop("Stern line", "Deck", 0);
		expect(out.text).toBe("# Deck\n\n- Stern line\n- Coil the lines\n\t- Bow line\n- Rig the fenders ^os-fend01\n\n## Galley\n\n1. Light the stove\n2. Boil water\n");
		expect(out.start).toBe(8);
	});

	it("carries a subtree to the end of another section", () => {
		const out = drop("Coil the lines", "Galley", 2);
		expect(out.text).toBe("# Deck\n- Rig the fenders ^os-fend01\n\n## Galley\n\n1. Light the stove\n2. Boil water\n- Coil the lines\n\t- Bow line\n\t- Stern line\n");
		expect(out.text.startsWith("- Coil the lines\n\t- Bow line", out.start)).toBe(true);
	});

	it("nests a bullet under an ordered item as a bullet one deeper", () => {
		const out = drop("Bow line", "Light the stove", 0);
		expect(out.text).toBe("# Deck\n\n- Coil the lines\n\t- Stern line\n- Rig the fenders ^os-fend01\n\n## Galley\n\n1. Light the stove\n\t- Bow line\n2. Boil water\n");
		expect(out.start).toBe(99);
	});

	it("promotes a line dropped between headings to a heading at their level", () => {
		const root = parser.parse(md, "f.md").root;
		const deck = findByContent(root, "Deck");
		expect(dropContext(deck, 3, findByContent(root, "Coil the lines"))).toEqual({ type: "heading", depth: 2 });
		expect(dropContext(deck, 0, findByContent(root, "Coil the lines"))).toEqual({ type: "bullet", depth: 0 });
		expect(dropContext(findByContent(root, "Coil the lines"), 0, findByContent(root, "Galley"))).toEqual({ type: "bullet", depth: 1 });
	});
});

describe("line groups survive edits (T75)", () => {
	const groupMd = "# Top\n\n![[cover.png]]\n## Rigging ^os-aaaaaa\n\n- Halyard\n\n## Mooring\n\nBuoy";

	it("opens a line group's every line in the editor and saves its ID on the last line", () => {
		const group = findByContent(parser.parse(groupMd, "f.md").root, "Rigging");
		expect(nodeEditText(group)).toBe("![[cover.png]]\n## Rigging");
		expect(restoreEditedLine(group, "![[cover.png]]\n## Rigging\nCaption")).toBe("![[cover.png]]\n## Rigging\nCaption ^os-aaaaaa");
		// An ID typed on the last line is not doubled.
		expect(restoreEditedLine(group, "## Rigging\nCaption ^os-aaaaaa")).toBe("## Rigging\nCaption ^os-aaaaaa");
	});

	it("restores an indented group's indentation on every line", () => {
		const md = "- item\n\tfirst\n\tsecond";
		const group = findByContent(parser.parse(md, "f.md").root, "first\nsecond");
		expect(nodeEditText(group)).toBe("first\nsecond");
		expect(restoreEditedLine(group, "first\nsecond\nthird")).toBe("\tfirst\n\tsecond\n\tthird");
	});

	it("keeps an edit-free save of a group byte-identical", () => {
		const group = findByContent(parser.parse(groupMd, "f.md").root, "Rigging");
		const out = renameInFile(groupMd, group, [], nodeEditText(group));
		expect(out.text).toBe(groupMd);
	});

	it("moves a heading group as one block and keeps it apart from its new neighbours", () => {
		const root = parser.parse(groupMd, "f.md").root;
		const top = findByContent(root, "Top");
		const [rigging, mooring] = top.children;
		const out = moveSiblings(groupMd, [mooring!], rigging!);
		expect(out.text).toBe("# Top\n\n## Mooring\n\nBuoy\n\n![[cover.png]]\n## Rigging ^os-aaaaaa\n\n- Halyard");
		const moved = parser.parse(out.text, "f.md").root.children[0]!.children;
		expect(moved.map((n) => n.content)).toEqual(["Mooring", "Rigging"]);
		expect(out.text.slice(out.start)).toMatch(/^## Mooring/);
	});

	it("adds a heading sibling before a heading group without joining it", () => {
		const group = findByContent(parser.parse(groupMd, "f.md").root, "Rigging");
		const out = insertSiblingBefore(groupMd, group);
		expect(out.text).toBe("# Top\n\n## \n\n![[cover.png]]\n## Rigging ^os-aaaaaa\n\n- Halyard\n\n## Mooring\n\nBuoy");
		expect(out.text.slice(out.start)).toMatch(/^## \n/);
	});

	it("keeps paragraphs apart when one is moved next to another", () => {
		const md = "One\n\nTwo\n\nThree";
		const root = parser.parse(md, "f.md").root;
		const out = moveSiblings(md, [root.children[2]!], root.children[1]!);
		expect(parser.parse(out.text, "f.md").root.children.map((n) => n.content)).toEqual(["One", "Three", "Two"]);
	});

	it("separates the lines a cut leaves behind and a block inserted between prose", () => {
		expect(cutBlock("Above\n\n- gone\n\nBelow", { start: 7, end: 13 })).toBe("Above\n\nBelow");
		expect(insertBlock("Above\nBelow", 6, "## New")).toBe("Above\n\n## New\n\nBelow");
	});
});
