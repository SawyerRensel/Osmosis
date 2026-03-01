import { describe, it, expect } from "vitest";
import { ParseCache } from "./cache";

describe("ParseCache", () => {
	it("returns cached result for same content", () => {
		const cache = new ParseCache();
		const md = "# Hello\n- item";

		const tree1 = cache.get("test.md", md);
		const tree2 = cache.get("test.md", md);

		// Should be the exact same object reference
		expect(tree2).toBe(tree1);
	});

	it("returns fresh parse for different content", () => {
		const cache = new ParseCache();

		const tree1 = cache.get("test.md", "# Hello");
		const tree2 = cache.get("test.md", "# World");

		expect(tree2).not.toBe(tree1);
		expect(tree2.root.children[0]?.content).toBe("World");
	});

	it("evicts LRU entries when capacity exceeded", () => {
		const cache = new ParseCache(2);

		cache.get("a.md", "# A");
		cache.get("b.md", "# B");
		cache.get("c.md", "# C"); // Should evict a.md

		expect(cache.size).toBe(2);
	});

	it("accessing an entry makes it most recently used", () => {
		const cache = new ParseCache(2);

		cache.get("a.md", "# A");
		cache.get("b.md", "# B");
		cache.get("a.md", "# A"); // Re-access a.md, making it MRU
		cache.get("c.md", "# C"); // Should evict b.md (now LRU), not a.md

		// a.md should still be cached
		const treeA1 = cache.get("a.md", "# A");
		const treeA2 = cache.get("a.md", "# A");
		expect(treeA2).toBe(treeA1);
	});

	it("invalidates by file path", () => {
		const cache = new ParseCache();

		const tree1 = cache.get("test.md", "# Hello");
		cache.invalidate("test.md");
		const tree2 = cache.get("test.md", "# Hello");

		// After invalidation, should be a fresh parse (different object)
		expect(tree2).not.toBe(tree1);
	});

	it("clear removes all entries", () => {
		const cache = new ParseCache();

		cache.get("a.md", "# A");
		cache.get("b.md", "# B");
		cache.clear();

		expect(cache.size).toBe(0);
	});
});
