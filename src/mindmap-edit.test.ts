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
	renumberOrderedLists,
	buildContainingFileMap,
	resolveInsertSite,
	inferSiblingContext,
	inferChildContext,
	childInsertOffset,
	subtreeSpan,
	widenRemoval,
	removeSpan,
	insertAt,
	mergeEdit,
	collapseEditGroup,
	editBytes,
	collectBlockIds,
	stripBlockIds,
	partitionScheduleEntries,
} from "./mindmap-edit";
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
