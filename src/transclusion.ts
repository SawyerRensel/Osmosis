import { OsmosisNode, OsmosisTree } from "./types";
import type { ParseCache } from "./cache";

/** Minimal file interface matching Obsidian's TFile. */
export interface ResolvedFile {
	path: string;
}

/** Subset of Obsidian App APIs needed for transclusion resolution. */
export interface TransclusionApp {
	metadataCache: {
		getFirstLinkpathDest(linkpath: string, sourcePath: string): ResolvedFile | null;
	};
	vault: {
		getFileByPath(path: string): ResolvedFile | null;
	};
}

/**
 * Resolves transclusion links (![[note]] and ![](path)) in an OsmosisTree
 * to actual vault files. Populates transclusion nodes with resolved file
 * metadata without yet expanding their content (expansion is Task 3.2).
 */
export class TransclusionResolver {
	constructor(
		private app: TransclusionApp,
		private cache: ParseCache,
	) {}

	/**
	 * Resolve all transclusion nodes in a tree to vault files.
	 * Sets `sourceFile` on each transclusion node to the resolved path,
	 * or marks it with metadata indicating the file was not found.
	 */
	async resolveTree(tree: OsmosisTree): Promise<void> {
		await this.resolveNode(tree.root, tree.filePath);
	}

	/**
	 * Recursively walk the tree and resolve transclusion nodes.
	 */
	private async resolveNode(
		node: OsmosisNode,
		sourceFilePath: string,
	): Promise<void> {
		if (node.type === "transclusion") {
			this.resolveTransclusionLink(node, sourceFilePath);
		}

		for (const child of node.children) {
			await this.resolveNode(child, sourceFilePath);
		}
	}

	/**
	 * Resolve a single transclusion node's link target to a vault file.
	 *
	 * Handles both link formats:
	 * - Wiki-links: ![[note]] — resolved via metadataCache.getFirstLinkpathDest
	 * - Markdown links: ![](path) — resolved as vault-relative path
	 *
	 * On success: sets node.sourceFile to the resolved file path
	 * On failure: sets node.sourceFile to undefined and marks metadata.unresolved
	 */
	private resolveTransclusionLink(
		node: OsmosisNode,
		sourceFilePath: string,
	): void {
		const linkTarget = node.content;
		if (!linkTarget) {
			this.markUnresolved(node, "Empty link target");
			return;
		}

		// Strip any heading/block reference (e.g., "note#heading" → "note")
		const pathPart = linkTarget.split("#")[0];
		if (!pathPart) {
			this.markUnresolved(node, "Link contains only a fragment");
			return;
		}

		// Try wiki-link resolution first (handles shortest-path matching)
		const resolved = this.app.metadataCache.getFirstLinkpathDest(
			pathPart,
			sourceFilePath,
		);

		if (resolved) {
			this.markResolved(node, resolved.path);
			return;
		}

		// Fallback: try direct vault path lookup (for markdown-style ![](path))
		const directFile = this.app.vault.getFileByPath(pathPart);
		if (directFile) {
			this.markResolved(node, directFile.path);
			return;
		}

		// Try with .md extension appended
		if (!pathPart.endsWith(".md")) {
			const withExt = this.app.vault.getFileByPath(`${pathPart}.md`);
			if (withExt) {
				this.markResolved(node, withExt.path);
				return;
			}
		}

		// File not found
		this.markUnresolved(node, `File not found: ${linkTarget}`);
	}

	private markResolved(node: OsmosisNode, resolvedPath: string): void {
		node.sourceFile = resolvedPath;
		node.isTranscluded = true;
		node.metadata = {
			...node.metadata,
			resolved: true,
			resolvedPath,
		};
	}

	/**
	 * Mark a transclusion node as unresolved (file not found or invalid link).
	 */
	private markUnresolved(node: OsmosisNode, reason: string): void {
		node.sourceFile = undefined;
		node.isTranscluded = false;
		node.metadata = {
			...node.metadata,
			resolved: false,
			unresolvedReason: reason,
		};
	}
}
