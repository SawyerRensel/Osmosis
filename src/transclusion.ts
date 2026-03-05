import { OsmosisNode, OsmosisTree } from "./types";
import { ParseCache } from "./cache";

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
		read(file: ResolvedFile): Promise<string>;
	};
}

/**
 * Resolves transclusion links (![[note]] and ![](path)) in an OsmosisTree
 * to actual vault files, then optionally expands them by parsing the
 * resolved file and attaching its AST as children.
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
	 * Resolve and expand all transclusion nodes: resolve links, read files,
	 * parse content, and attach as children. Supports recursive embedding
	 * (A→B→C) with cycle detection via a visited set.
	 *
	 * @param skipIds - Transclusion node IDs to resolve but NOT expand (for lazy loading).
	 *                  These nodes keep their type "transclusion" and get metadata.resolved set.
	 */
	async expandTree(tree: OsmosisTree, skipIds?: Set<string>): Promise<void> {
		const visited = new Set<string>([tree.filePath]);
		await this.expandNode(tree.root, tree.filePath, visited, skipIds);
	}

	/**
	 * Expand a single transclusion node in-place within the tree.
	 * Used for lazy loading: when a collapsed transclusion is expanded by the user.
	 */
	async expandSingleNode(
		parent: OsmosisNode,
		node: OsmosisNode,
		sourceFilePath: string,
	): Promise<boolean> {
		if (node.type !== "transclusion") return false;
		const visited = new Set<string>([sourceFilePath]);
		const expanded = await this.expandTransclusion(node, sourceFilePath, visited);
		if (!expanded) return false;

		// Splice expanded content into parent's children, replacing the transclusion node
		const idx = parent.children.indexOf(node);
		if (idx !== -1) {
			parent.children.splice(idx, 1, ...expanded);
		}
		return true;
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
	 * Recursively resolve and expand transclusion nodes.
	 * Transclusion nodes are replaced in-place in their parent's children
	 * array with the parsed content, so the filename node is not shown.
	 */
	private async expandNode(
		node: OsmosisNode,
		sourceFilePath: string,
		visited: Set<string>,
		skipIds?: Set<string>,
	): Promise<void> {
		// Process children, replacing transclusion nodes with expanded content
		const newChildren: OsmosisNode[] = [];
		for (const child of node.children) {
			if (child.type === "transclusion") {
				// Lazy loading: skip expansion for nodes in skipIds (just resolve link)
				if (skipIds?.has(child.id)) {
					this.resolveToFile(child, sourceFilePath);
					newChildren.push(child);
					continue;
				}
				const expanded = await this.expandTransclusion(
					child,
					sourceFilePath,
					visited,
				);
				if (expanded) {
					newChildren.push(...expanded);
				} else {
					// Keep unresolved/cyclic transclusion nodes as-is
					newChildren.push(child);
				}
			} else {
				newChildren.push(child);
				await this.expandNode(child, sourceFilePath, visited, skipIds);
			}
		}
		node.children = newChildren;
	}

	/**
	 * Expand a single transclusion node: resolve link, read file, parse,
	 * and return the parsed children (or null to keep the node as-is).
	 */
	private async expandTransclusion(
		node: OsmosisNode,
		sourceFilePath: string,
		visited: Set<string>,
	): Promise<OsmosisNode[] | null> {
		const resolvedFile = this.resolveToFile(node, sourceFilePath);

		if (!resolvedFile) {
			return null;
		}

		// Cycle detection: skip if we've already visited this file
		if (visited.has(resolvedFile.path)) {
			node.metadata = {
				...node.metadata,
				cyclic: true,
				cyclicPath: resolvedFile.path,
			};
			return null;
		}

		// Read and parse the resolved file
		const content = await this.app.vault.read(resolvedFile);
		const childTree = this.cache.get(resolvedFile.path, content);

		// Mark all children as transcluded from this source
		const children = childTree.root.children;
		this.markChildrenTranscluded(children, resolvedFile.path);

		// Recurse into expanded content for nested transclusions
		const childVisited = new Set(visited);
		childVisited.add(resolvedFile.path);
		for (const child of children) {
			await this.expandNode(child, resolvedFile.path, childVisited);
		}

		return children;
	}

	/**
	 * Resolve a transclusion node's link target and return the file object.
	 * Also sets node metadata (sourceFile, isTranscluded, resolved status).
	 * Returns the resolved file or null if not found.
	 */
	private resolveToFile(
		node: OsmosisNode,
		sourceFilePath: string,
	): ResolvedFile | null {
		const linkTarget = node.content;
		if (!linkTarget) {
			this.markUnresolved(node, "Empty link target");
			return null;
		}

		const pathPart = linkTarget.split("#")[0];
		if (!pathPart) {
			this.markUnresolved(node, "Link contains only a fragment");
			return null;
		}

		// Try wiki-link resolution (handles shortest-path matching)
		const resolved = this.app.metadataCache.getFirstLinkpathDest(
			pathPart,
			sourceFilePath,
		);
		if (resolved) {
			this.markResolved(node, resolved.path);
			return resolved;
		}

		// Fallback: direct vault path lookup
		const directFile = this.app.vault.getFileByPath(pathPart);
		if (directFile) {
			this.markResolved(node, directFile.path);
			return directFile;
		}

		// Try with .md extension
		if (!pathPart.endsWith(".md")) {
			const withExt = this.app.vault.getFileByPath(`${pathPart}.md`);
			if (withExt) {
				this.markResolved(node, withExt.path);
				return withExt;
			}
		}

		this.markUnresolved(node, `File not found: ${linkTarget}`);
		return null;
	}

	/**
	 * Resolve a single transclusion node's link target to a vault file.
	 * Used by resolveTree (resolve-only, no expansion).
	 */
	private resolveTransclusionLink(
		node: OsmosisNode,
		sourceFilePath: string,
	): void {
		this.resolveToFile(node, sourceFilePath);
	}

	/**
	 * Mark all nodes in a subtree as transcluded from the given source file.
	 */
	private markChildrenTranscluded(nodes: OsmosisNode[], sourceFile: string): void {
		for (const node of nodes) {
			node.sourceFile = sourceFile;
			node.isTranscluded = true;
			this.markChildrenTranscluded(node.children, sourceFile);
		}
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
