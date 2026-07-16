import { describe, it, expect, vi, beforeEach } from "vitest";
import { TransclusionResolver, TransclusionApp } from "./transclusion";
import { ParseCache } from "./cache";
import type { OsmosisTree, OsmosisNode } from "./types";

/** Helper to create a minimal OsmosisNode */
function makeNode(
	overrides: Partial<OsmosisNode> & { type: OsmosisNode["type"]; content: string },
): OsmosisNode {
	return {
		id: overrides.id ?? `node-${overrides.content}`,
		type: overrides.type,
		depth: overrides.depth ?? 0,
		content: overrides.content,
		children: overrides.children ?? [],
		range: overrides.range ?? { start: 0, end: 0 },
		isTranscluded: overrides.isTranscluded ?? false,
		sourceFile: overrides.sourceFile,
		metadata: overrides.metadata,
	};
}

/** Helper to create an OsmosisTree */
function makeTree(children: OsmosisNode[], filePath = "source.md"): OsmosisTree {
	return {
		root: makeNode({ type: "root", content: "", children }),
		filePath,
		contentHash: "test-hash",
	};
}

/**
 * Create mock App with configurable file resolution and file contents.
 * fileMap keys are used for both metadataCache and vault lookups.
 * contentMap maps file paths to their markdown content (for vault.read).
 */
function mockApp(
	fileMap: Record<string, { path: string }> = {},
	contentMap: Record<string, string> = {},
): TransclusionApp {
	return {
		metadataCache: {
			getFirstLinkpathDest: vi.fn((linkpath: string, _sourcePath: string) => {
				return fileMap[linkpath] ?? null;
			}),
		},
		vault: {
			getFileByPath: vi.fn((path: string) => {
				return fileMap[path] ?? null;
			}),
			read: vi.fn(async (file: { path: string }) => {
				return contentMap[file.path] ?? "";
			}),
		},
	};
}

describe("TransclusionResolver", () => {
	let cache: ParseCache;

	beforeEach(() => {
		cache = new ParseCache();
	});

	describe("resolveTree", () => {
		it("resolves wiki-link ![[note]] via metadataCache", async () => {
			const app = mockApp({
				"my-note": { path: "my-note.md" },
			});
			const resolver = new TransclusionResolver(app, cache);

			const node = makeNode({ type: "transclusion", content: "my-note" });
			const tree = makeTree([node]);

			await resolver.resolveTree(tree);

			expect(node.sourceFile).toBe("my-note.md");
			expect(node.isTranscluded).toBe(true);
			expect(node.metadata?.resolved).toBe(true);
		});

		it("resolves markdown-style ![](path) via vault.getFileByPath", async () => {
			const app = mockApp({
				"folder/note.md": { path: "folder/note.md" },
			});
			const resolver = new TransclusionResolver(app, cache);

			const node = makeNode({ type: "transclusion", content: "folder/note.md" });
			const tree = makeTree([node]);

			await resolver.resolveTree(tree);

			expect(node.sourceFile).toBe("folder/note.md");
			expect(node.isTranscluded).toBe(true);
		});

		it("tries appending .md extension when direct path not found", async () => {
			const app = mockApp({
				"my-note.md": { path: "my-note.md" },
			});
			const resolver = new TransclusionResolver(app, cache);

			const node = makeNode({ type: "transclusion", content: "my-note" });
			const tree = makeTree([node]);

			await resolver.resolveTree(tree);

			expect(node.sourceFile).toBe("my-note.md");
			expect(node.isTranscluded).toBe(true);
		});

		it("marks node as unresolved when file not found", async () => {
			const app = mockApp({});
			const resolver = new TransclusionResolver(app, cache);

			const node = makeNode({ type: "transclusion", content: "nonexistent" });
			const tree = makeTree([node]);

			await resolver.resolveTree(tree);

			expect(node.sourceFile).toBeUndefined();
			expect(node.isTranscluded).toBe(false);
			expect(node.metadata?.resolved).toBe(false);
			expect(node.metadata?.unresolvedReason).toContain("nonexistent");
		});

		it("handles empty link target gracefully", async () => {
			const app = mockApp({});
			const resolver = new TransclusionResolver(app, cache);

			const node = makeNode({ type: "transclusion", content: "" });
			const tree = makeTree([node]);

			await resolver.resolveTree(tree);

			expect(node.sourceFile).toBeUndefined();
			expect(node.metadata?.resolved).toBe(false);
			expect(node.metadata?.unresolvedReason).toBe("Empty link target");
		});

		it("strips heading fragment from link target before resolving", async () => {
			const app = mockApp({
				"my-note": { path: "my-note.md" },
			});
			const resolver = new TransclusionResolver(app, cache);

			const node = makeNode({ type: "transclusion", content: "my-note#heading" });
			const tree = makeTree([node]);

			await resolver.resolveTree(tree);

			expect(node.sourceFile).toBe("my-note.md");
			// eslint-disable-next-line @typescript-eslint/unbound-method
			expect(app.metadataCache.getFirstLinkpathDest).toHaveBeenCalledWith(
				"my-note",
				"source.md",
			);
		});

		it("handles link with only fragment (e.g., '#heading')", async () => {
			const app = mockApp({});
			const resolver = new TransclusionResolver(app, cache);

			const node = makeNode({ type: "transclusion", content: "#heading" });
			const tree = makeTree([node]);

			await resolver.resolveTree(tree);

			expect(node.sourceFile).toBeUndefined();
			expect(node.metadata?.resolved).toBe(false);
			expect(node.metadata?.unresolvedReason).toBe("Link contains only a fragment");
		});

		it("resolves nested transclusion nodes within heading children", async () => {
			const app = mockApp({
				"child-note": { path: "child-note.md" },
			});
			const resolver = new TransclusionResolver(app, cache);

			const transclusionNode = makeNode({ type: "transclusion", content: "child-note" });
			const headingNode = makeNode({
				type: "heading",
				content: "Section",
				depth: 1,
				children: [transclusionNode],
			});
			const tree = makeTree([headingNode]);

			await resolver.resolveTree(tree);

			expect(transclusionNode.sourceFile).toBe("child-note.md");
			expect(transclusionNode.isTranscluded).toBe(true);
		});

		it("does not modify non-transclusion nodes", async () => {
			const app = mockApp({});
			const resolver = new TransclusionResolver(app, cache);

			const bulletNode = makeNode({ type: "bullet", content: "regular item" });
			const tree = makeTree([bulletNode]);

			await resolver.resolveTree(tree);

			expect(bulletNode.sourceFile).toBeUndefined();
			expect(bulletNode.isTranscluded).toBe(false);
		});

		it("resolves multiple transclusion nodes in the same tree", async () => {
			const app = mockApp({
				"note-a": { path: "note-a.md" },
				"note-b": { path: "folder/note-b.md" },
			});
			const resolver = new TransclusionResolver(app, cache);

			const nodeA = makeNode({ type: "transclusion", content: "note-a" });
			const nodeB = makeNode({ type: "transclusion", content: "note-b" });
			const tree = makeTree([nodeA, nodeB]);

			await resolver.resolveTree(tree);

			expect(nodeA.sourceFile).toBe("note-a.md");
			expect(nodeB.sourceFile).toBe("folder/note-b.md");
		});
	});

	describe("expandTree", () => {
		it("replaces transclusion node with parsed children in parent", async () => {
			const app = mockApp(
				{
					"child": { path: "child.md" },
					"child.md": { path: "child.md" },
				},
				{
					"child.md": "# Heading\n- Item 1\n- Item 2",
				},
			);
			const resolver = new TransclusionResolver(app, cache);

			const node = makeNode({ type: "transclusion", content: "child" });
			const tree = makeTree([node]);

			await resolver.expandTree(tree);

			// Transclusion node should be replaced by parsed content in root's children
			expect(tree.root.children.length).toBeGreaterThan(0);
			const heading = tree.root.children[0]!;
			expect(heading.type).toBe("heading");
			expect(heading.content).toBe("Heading");
			expect(heading.isTranscluded).toBe(true);
			expect(heading.sourceFile).toBe("child.md");
		});

		it("marks expanded children as transcluded", async () => {
			const app = mockApp(
				{
					"note": { path: "note.md" },
					"note.md": { path: "note.md" },
				},
				{
					"note.md": "- Bullet A\n- Bullet B",
				},
			);
			const resolver = new TransclusionResolver(app, cache);

			const node = makeNode({ type: "transclusion", content: "note" });
			const tree = makeTree([node]);

			await resolver.expandTree(tree);

			// Transcluded bullets should replace the transclusion node in root
			for (const child of tree.root.children) {
				expect(child.isTranscluded).toBe(true);
				expect(child.sourceFile).toBe("note.md");
			}
		});

		it("supports recursive embedding (A→B→C)", async () => {
			const app = mockApp(
				{
					"b": { path: "b.md" },
					"b.md": { path: "b.md" },
					"c": { path: "c.md" },
					"c.md": { path: "c.md" },
				},
				{
					"b.md": "# From B\n![[c]]",
					"c.md": "# From C\n- Deep item",
				},
			);
			const resolver = new TransclusionResolver(app, cache);

			const node = makeNode({ type: "transclusion", content: "b" });
			const tree = makeTree([node], "a.md");

			await resolver.expandTree(tree);

			// B's content should replace the transclusion node
			expect(tree.root.children.length).toBeGreaterThan(0);
			const headingB = tree.root.children[0]!;
			expect(headingB.content).toBe("From B");

			// C's transclusion within B should also be replaced by C's content
			const headingC = headingB.children.find(
				(c) => c.content === "From C",
			);
			expect(headingC).toBeDefined();
			expect(headingC!.type).toBe("heading");
			expect(headingC!.isTranscluded).toBe(true);

			// Each node is attributed to its immediate origin note — spatial
			// study derives card keys (and rating destinations) from sourceFile
			expect(headingB.sourceFile).toBe("b.md");
			expect(headingC!.sourceFile).toBe("c.md");
			for (const deep of headingC!.children) {
				expect(deep.sourceFile).toBe("c.md");
			}
		});

		it("gives duplicate embeds of the same note independent nodes and unique ids", async () => {
			const app = mockApp(
				{
					"note": { path: "note.md" },
					"note.md": { path: "note.md" },
				},
				{
					"note.md": "- Shared line",
				},
			);
			const resolver = new TransclusionResolver(app, cache);

			// Two embed sites — parser-realistic distinct ids per site
			const embedA = makeNode({ type: "transclusion", content: "note", id: "site-a" });
			const embedB = makeNode({ type: "transclusion", content: "note", id: "site-b" });
			const tree = makeTree([embedA, embedB]);

			await resolver.expandTree(tree);

			const [copyA, copyB] = tree.root.children;
			expect(copyA!.content).toBe("Shared line");
			expect(copyB!.content).toBe("Shared line");
			// Distinct objects: the cache must not hand both embeds the same node
			expect(copyA).not.toBe(copyB);
			// Instance-unique ids so layout node map and DOM lookups can't collide
			expect(copyA!.id).not.toBe(copyB!.id);
			expect(copyA!.id).toContain("~site-a");
			expect(copyB!.id).toContain("~site-b");
		});

		it("never mutates the cached source tree", async () => {
			const app = mockApp(
				{
					"outer": { path: "outer.md" },
					"outer.md": { path: "outer.md" },
					"inner": { path: "inner.md" },
					"inner.md": { path: "inner.md" },
				},
				{
					"outer.md": "# Outer\n![[inner]]",
					"inner.md": "- Inner line",
				},
			);
			const resolver = new TransclusionResolver(app, cache);

			const tree = makeTree([makeNode({ type: "transclusion", content: "outer" })]);
			await resolver.expandTree(tree);

			// Re-fetch outer's cached parse: it must be pristine — no
			// transcluded marks, no spliced-in inner content
			const cachedOuter = cache.get("outer.md", "# Outer\n![[inner]]");
			const heading = cachedOuter.root.children[0]!;
			expect(heading.isTranscluded).toBe(false);
			expect(heading.sourceFile).toBeUndefined();
			const innerEmbed = heading.children.find((c) => c.type === "transclusion");
			expect(innerEmbed).toBeDefined();
			expect(innerEmbed!.children).toEqual([]);
		});

		it("attributes nested embeds correctly in both copies of a duplicated note", async () => {
			// Host embeds source twice; source embeds deep. Both copies of
			// deep's content must carry sourceFile = deep.md — a shared cached
			// tree would leave the second copy's deep nodes marked source.md.
			const app = mockApp(
				{
					"source": { path: "source.md" },
					"source.md": { path: "source.md" },
					"deep": { path: "deep.md" },
					"deep.md": { path: "deep.md" },
				},
				{
					"source.md": "# Source\n![[deep]]",
					"deep.md": "- Deep line",
				},
			);
			const resolver = new TransclusionResolver(app, cache);

			const embedA = makeNode({ type: "transclusion", content: "source", id: "site-a" });
			const embedB = makeNode({ type: "transclusion", content: "source", id: "site-b" });
			const tree = makeTree([embedA, embedB], "host.md");

			await resolver.expandTree(tree);

			expect(tree.root.children).toHaveLength(2);
			for (const copy of tree.root.children) {
				expect(copy.content).toBe("Source");
				expect(copy.sourceFile).toBe("source.md");
				const deepLine = copy.children.find((c) => c.content === "Deep line");
				expect(deepLine).toBeDefined();
				expect(deepLine!.isTranscluded).toBe(true);
				expect(deepLine!.sourceFile).toBe("deep.md");
			}
			// The two copies of the deep line are independent nodes too
			const deepA = tree.root.children[0]!.children.find((c) => c.content === "Deep line")!;
			const deepB = tree.root.children[1]!.children.find((c) => c.content === "Deep line")!;
			expect(deepA).not.toBe(deepB);
			expect(deepA.id).not.toBe(deepB.id);
		});

		it("detects cycles and keeps cyclic transclusion node", async () => {
			// A embeds B, B embeds A → cycle
			const app = mockApp(
				{
					"b": { path: "b.md" },
					"b.md": { path: "b.md" },
					"a": { path: "a.md" },
					"a.md": { path: "a.md" },
				},
				{
					"b.md": "# From B\n![[a]]",
				},
			);
			const resolver = new TransclusionResolver(app, cache);

			const node = makeNode({ type: "transclusion", content: "b" });
			const tree = makeTree([node], "a.md");

			await resolver.expandTree(tree);

			// B's content should replace the transclusion node
			expect(tree.root.children.length).toBeGreaterThan(0);
			const headingB = tree.root.children[0]!;
			expect(headingB.content).toBe("From B");

			// The cyclic transclusion back to A should remain as a transclusion node
			const backToA = headingB.children.find(
				(c) => c.type === "transclusion",
			);
			expect(backToA).toBeDefined();
			expect(backToA!.metadata?.cyclic).toBe(true);
			expect(backToA!.children.length).toBe(0); // Not expanded
		});

		it("does not expand unresolved transclusions", async () => {
			const app = mockApp({}, {});
			const resolver = new TransclusionResolver(app, cache);

			const node = makeNode({ type: "transclusion", content: "missing" });
			const tree = makeTree([node]);

			await resolver.expandTree(tree);

			// Unresolved transclusion node should remain in root's children
			expect(tree.root.children.length).toBe(1);
			expect(tree.root.children[0]!.type).toBe("transclusion");
			expect(tree.root.children[0]!.metadata?.resolved).toBe(false);
		});

		it("skips expansion for nodes in skipIds (lazy loading)", async () => {
			const app = mockApp(
				{ "target": { path: "target.md" }, "target.md": { path: "target.md" } },
				{ "target.md": "# From Target\n- Item 1" },
			);
			const resolver = new TransclusionResolver(app, cache);

			const node = makeNode({ type: "transclusion", content: "target" });
			const tree = makeTree([node]);

			// Skip this node's ID
			await resolver.expandTree(tree, new Set([node.id]));

			// Node should remain as transclusion (not spliced)
			expect(tree.root.children.length).toBe(1);
			expect(tree.root.children[0]!.type).toBe("transclusion");
			// But it should be resolved (link checked)
			expect(tree.root.children[0]!.metadata?.resolved).toBe(true);
			expect(tree.root.children[0]!.sourceFile).toBe("target.md");
		});

		it("expandSingleNode expands a deferred transclusion in-place", async () => {
			const app = mockApp(
				{ "target": { path: "target.md" }, "target.md": { path: "target.md" } },
				{ "target.md": "# From Target\n- Item 1" },
			);
			const resolver = new TransclusionResolver(app, cache);

			const node = makeNode({ type: "transclusion", content: "target" });
			const tree = makeTree([node], "source.md");

			// First: skip expansion (lazy)
			await resolver.expandTree(tree, new Set([node.id]));
			expect(tree.root.children[0]!.type).toBe("transclusion");

			// Now expand it on demand
			const result = await resolver.expandSingleNode(
				tree.root,
				tree.root.children[0]!,
				"source.md",
			);
			expect(result).toBe(true);

			// Transclusion node should be replaced by target's content
			expect(tree.root.children[0]!.type).toBe("heading");
			expect(tree.root.children[0]!.content).toBe("From Target");
			expect(tree.root.children[0]!.isTranscluded).toBe(true);
		});
	});

	describe("performance benchmarks", () => {
		/**
		 * Generate N mock files and a tree with N transclusion nodes.
		 * Each file has a heading + 3 bullet items (~4 lines of markdown).
		 */
		function generateTransclusionFixture(count: number) {
			const fileMap: Record<string, { path: string }> = {};
			const contentMap: Record<string, string> = {};
			const nodes: OsmosisNode[] = [];

			for (let i = 0; i < count; i++) {
				const name = `note-${String(i)}`;
				const path = `${name}.md`;
				fileMap[name] = { path };
				fileMap[path] = { path };
				contentMap[path] = [
					`# Section ${String(i)}`,
					`- Item A from note ${String(i)}`,
					`- Item B from note ${String(i)}`,
					`- Item C from note ${String(i)}`,
				].join("\n");
				nodes.push(
					makeNode({ type: "transclusion", content: name }),
				);
			}

			return { fileMap, contentMap, nodes };
		}

		/** Create a fresh tree of transclusion nodes (expandTree mutates in place) */
		function freshTree(nodes: OsmosisNode[]): OsmosisTree {
			return makeTree(
				nodes.map((n) =>
					makeNode({ type: "transclusion", content: n.content }),
				),
			);
		}

		it("10 embedded notes resolve+expand in < 50ms", async () => {
			const { fileMap, contentMap, nodes } = generateTransclusionFixture(10);
			const app = mockApp(fileMap, contentMap);

			// Warmup: let JIT optimize
			for (let i = 0; i < 5; i++) {
				await new TransclusionResolver(app, new ParseCache()).expandTree(freshTree(nodes));
			}

			const resolver = new TransclusionResolver(app, new ParseCache());
			const tree = freshTree(nodes);

			const start = performance.now();
			await resolver.expandTree(tree);
			const elapsed = performance.now() - start;

			expect(elapsed).toBeLessThan(50);
		});

		it("50 embedded notes resolve+expand in < 200ms (with lazy loading)", async () => {
			const { fileMap, contentMap, nodes } = generateTransclusionFixture(50);
			const app = mockApp(fileMap, contentMap);

			const skipIds = new Set(nodes.map((n) => n.id));

			// Warmup
			for (let i = 0; i < 5; i++) {
				await new TransclusionResolver(app, new ParseCache()).expandTree(freshTree(nodes), skipIds);
			}

			const resolver = new TransclusionResolver(app, new ParseCache());
			const tree = freshTree(nodes);

			const start = performance.now();
			await resolver.expandTree(tree, skipIds);
			const elapsed = performance.now() - start;

			expect(elapsed).toBeLessThan(200);
		});

		it("100 embedded notes remain responsive (< 500ms)", async () => {
			const { fileMap, contentMap, nodes } = generateTransclusionFixture(100);
			const app = mockApp(fileMap, contentMap);

			// Warmup
			for (let i = 0; i < 5; i++) {
				await new TransclusionResolver(app, new ParseCache()).expandTree(freshTree(nodes));
			}

			const resolver = new TransclusionResolver(app, new ParseCache());
			const tree = freshTree(nodes);

			const start = performance.now();
			await resolver.expandTree(tree);
			const elapsed = performance.now() - start;

			expect(elapsed).toBeLessThan(500);
		});
	});
});
