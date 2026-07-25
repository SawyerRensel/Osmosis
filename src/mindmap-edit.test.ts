import { describe, it, expect } from "vitest";
import { OsmosisParser } from "./parser";
import { TransclusionResolver, TransclusionApp } from "./transclusion";
import { ParseCache } from "./cache";
import type { OsmosisNode, OsmosisTree } from "./types";
import {
	serializeLine,
	subtreeEnd,
	subtreeHostEnd,
	nodeHostStart,
	sameEditTarget,
	reindentSubtree,
	adjustPasteDepth,
	renumberOrderedLists,
} from "./mindmap-edit";

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

// ── adjustPasteDepth / renumberOrderedLists: behavior lock-in ─────────────────
describe("adjustPasteDepth", () => {
	it("shifts list and heading depth without touching content", () => {
		const text = ["- a", "\t- b"].join("\n");
		expect(adjustPasteDepth(text, "bullet", 1)).toBe(
			["\t- a", "\t\t- b"].join("\n"),
		);
		expect(adjustPasteDepth("## Head", "heading", 1)).toBe("### Head");
	});

	it("leaves code fence lines and their contents untouched", () => {
		// Only the surrounding list shifts; fence markers and body are verbatim.
		const text = ["- a", "\t```", "\tnot-a-list", "\t```"].join("\n");
		expect(adjustPasteDepth(text, "bullet", 1)).toBe(
			["\t- a", "\t```", "\tnot-a-list", "\t```"].join("\n"),
		);
	});

	it("never indents a standalone block-ID line of an atomic block", () => {
		// Pasting a code block (with its trailing `^id`) under a deeper parent:
		// the atomic block AND its ID line must stay put — indenting the `^id`
		// line detaches the block ID (line-card identity / style anchor).
		const text = ["```", "code stuff", "```", "^os-codeblock"].join("\n");
		expect(adjustPasteDepth(text, "codeblock", 2)).toBe(text);
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
