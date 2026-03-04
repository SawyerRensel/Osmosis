import { describe, it, expect, vi, beforeEach } from "vitest";
import { TransclusionResolver, TransclusionApp } from "./transclusion";
import type { OsmosisTree, OsmosisNode } from "./types";
import type { ParseCache } from "./cache";

/** Helper to create a minimal OsmosisNode */
function makeNode(
	overrides: Partial<OsmosisNode> & { type: OsmosisNode["type"]; content: string },
): OsmosisNode {
	return {
		id: `node-${overrides.content}`,
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

/** Create mock App with configurable file resolution */
function mockApp(fileMap: Record<string, { path: string }> = {}): TransclusionApp {
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
		},
	};
}

describe("TransclusionResolver", () => {
	let cache: ParseCache;

	beforeEach(() => {
		cache = {} as ParseCache;
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
			// metadataCache returns null, vault.getFileByPath("my-note") returns null,
			// but vault.getFileByPath("my-note.md") returns the file
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
});
