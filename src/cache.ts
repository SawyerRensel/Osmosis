import { OsmosisTree } from "./types";
import { OsmosisParser } from "./parser";

/**
 * LRU cache for parse results.
 * Keyed by file path + content hash for instant view switching.
 */
export class ParseCache {
	private cache = new Map<string, OsmosisTree>();
	private parser = new OsmosisParser();
	private maxSize: number;

	constructor(maxSize = 50) {
		this.maxSize = maxSize;
	}

	/**
	 * Get a parsed tree for the given file, using cache if available.
	 * Returns cached result if content hash matches, otherwise parses fresh.
	 */
	get(filePath: string, markdown: string): OsmosisTree {
		const contentHash = this.parser.hash(markdown);
		const key = `${filePath}:${contentHash}`;

		const cached = this.cache.get(key);
		if (cached !== undefined) {
			// Move to end (most recently used) by deleting and re-inserting
			this.cache.delete(key);
			this.cache.set(key, cached);
			return cached;
		}

		// Parse and cache
		const tree = this.parser.parse(markdown, filePath);
		this.set(key, tree);
		return tree;
	}

	/**
	 * Store a tree in the cache, evicting LRU entries if needed.
	 */
	private set(key: string, tree: OsmosisTree): void {
		// Evict if at capacity
		if (this.cache.size >= this.maxSize) {
			// Map iteration order is insertion order; first key is LRU
			const lruKey = this.cache.keys().next().value;
			if (lruKey !== undefined) {
				this.cache.delete(lruKey);
			}
		}
		this.cache.set(key, tree);
	}

	/**
	 * Invalidate all cached entries for a file path.
	 */
	invalidate(filePath: string): void {
		for (const key of this.cache.keys()) {
			if (key.startsWith(`${filePath}:`)) {
				this.cache.delete(key);
			}
		}
	}

	/** Clear the entire cache. */
	clear(): void {
		this.cache.clear();
	}

	/** Current number of cached entries. */
	get size(): number {
		return this.cache.size;
	}
}
