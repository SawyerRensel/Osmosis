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
		node.children = await this.expandChildren(
			node.children,
			sourceFilePath,
			visited,
			skipIds,
		);
	}

	/**
	 * Expand a sibling list: every transclusion in it is replaced in place by
	 * its content, everything else keeps its position and is descended into.
	 *
	 * This runs over an *array* rather than a node's children because that array
	 * is also what an expansion itself produces. Descending only into
	 * `node.children` meant a transclusion sitting at the top level of an
	 * embedded note — which is what `- ![[Note]]` becomes — was walked past
	 * rather than expanded, and the embed inside the embed stayed a single
	 * unexpanded node.
	 */
	private async expandChildren(
		children: OsmosisNode[],
		sourceFilePath: string,
		visited: Set<string>,
		skipIds?: Set<string>,
	): Promise<OsmosisNode[]> {
		const newChildren: OsmosisNode[] = [];
		for (const child of children) {
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
		return newChildren;
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

		// Clone before touching anything: the cache hands out shared node
		// objects, so splicing/marking them in place would corrupt the
		// cached tree — a second embed of the same file would inherit (and
		// re-mark) the first embed's already-expanded content, misattributing
		// nested transclusions' sourceFile. Suffixing ids with the embed
		// site's id keeps every instance unique: duplicate embeds (and
		// coincidental host/source content twins, which hash to the same
		// parser id) would otherwise collide in the layout node map and DOM.
		const children = childTree.root.children.map((child) =>
			cloneWithInstanceIds(child, node.id),
		);

		// Mark all children as transcluded from this source
		this.markChildrenTranscluded(children, resolvedFile.path);

		// Expand nested transclusions before stamping the host range, because
		// expansion changes *which* nodes end up at this level: an embed at the
		// top of the embedded note is replaced here by its own content, and
		// those nodes are the ones that come to sit under this embed's parent.
		const childVisited = new Set(visited);
		childVisited.add(resolvedFile.path);
		const expanded = await this.expandChildren(
			children,
			resolvedFile.path,
			childVisited,
		);

		// Record the host-file span of the `![[…]]` line on each top-level
		// child. In the containing file the embed is a single atomic unit
		// occupying just this line; edits *there* (move/copy/delete of a local
		// node that contains this embed) must carry the `![[…]]` bytes along
		// instead of mistaking the children's source-file offsets for host
		// offsets. `node.range` is the embed line; its trailing `^id` line, if
		// any, is covered by `blockIdLineEnd`.
		//
		// This overwrites any host range an inner expansion set: a node hoisted
		// up to this level by one is no longer bounded by the inner `![[…]]`
		// line in *its* file, but by this one — a node's `embedHostRange` always
		// indexes the file its tree parent lives in.
		const embedHostRange = {
			start: node.range.start,
			end: node.blockIdLineEnd ?? node.range.end,
		};
		for (const child of expanded) {
			child.embedHostRange = embedHostRange;
		}

		return expanded;
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

		const pathPart = embedTargetPath(linkTarget);
		if (!pathPart) {
			this.markUnresolved(node, "Link contains only a fragment");
			return null;
		}

		for (const candidate of linkCandidates(pathPart, sourceFilePath)) {
			const file = this.lookup(candidate, sourceFilePath);
			if (file) {
				this.markResolved(node, file.path);
				return file;
			}
		}

		this.markUnresolved(node, `File not found: ${linkTarget}`);
		return null;
	}

	/**
	 * Try one candidate path through every lookup Obsidian offers: wiki-link
	 * resolution first (it handles shortest-path matching), then the vault's own
	 * path index, then the same path with the extension a wiki link omits.
	 */
	private lookup(candidate: string, sourceFilePath: string): ResolvedFile | null {
		const resolved = this.app.metadataCache.getFirstLinkpathDest(
			candidate,
			sourceFilePath,
		);
		if (resolved) return resolved;

		const directFile = this.app.vault.getFileByPath(candidate);
		if (directFile) return directFile;

		if (!candidate.endsWith(".md")) {
			const withExt = this.app.vault.getFileByPath(`${candidate}.md`);
			if (withExt) return withExt;
		}

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

/**
 * The file path an embed's link target names, with everything that is not a
 * path removed: a `|alias` (or `|300` sizing) and a `#heading` / `#^block`
 * fragment. Neither is part of a filename, and passing them through was enough
 * to make `![[Note|alias]]` resolve to nothing and draw the dashed
 * "unresolved" node.
 *
 * A fragment-only link (`![[#Section]]`, a same-file embed) yields "" and is
 * reported as unresolved rather than silently embedding the wrong file. The
 * fragment itself is dropped, so `![[Note#Section]]` still embeds the whole of
 * Note — sectioning an embed is not implemented.
 */
export function embedTargetPath(target: string): string {
	return (target.split("|")[0] ?? "").split("#")[0]?.trim() ?? "";
}

/**
 * The paths to try for an embed target, in order of decreasing literalness.
 *
 * Markdown-style embeds are written by Obsidian the way a URL is — percent-
 * encoded and relative to the note (`![](../../Topics/World%20Wide%20Web.md)`)
 * — while the vault indexes plain paths from its root. So each candidate is
 * also tried decoded, and each of those resolved against the embedding note's
 * folder to consume any `./` and `../`.
 *
 * The literal path goes first so that a file genuinely named `Note%20Name.md`
 * still wins over its decoded spelling, and duplicates are dropped so an
 * ordinary wiki link costs exactly one lookup.
 */
export function linkCandidates(pathPart: string, sourceFilePath: string): string[] {
	const decoded = decodePercent(pathPart);
	const candidates = [pathPart, decoded];
	for (const candidate of [pathPart, decoded]) {
		candidates.push(resolveRelative(candidate, sourceFilePath));
	}
	return [...new Set(candidates)].filter((c) => c !== "");
}

/** Percent-decode a path, leaving a malformed escape sequence as it was. */
function decodePercent(path: string): string {
	if (!path.includes("%")) return path;
	try {
		return decodeURIComponent(path);
	} catch {
		return path;
	}
}

/**
 * Resolve a path against the folder of the note that embeds it, consuming `.`
 * and `..` segments. Vault paths are root-relative with `/` separators, so this
 * is plain segment arithmetic — no platform path module involved.
 */
function resolveRelative(path: string, sourceFilePath: string): string {
	const slash = sourceFilePath.lastIndexOf("/");
	const segments = slash === -1 ? [] : sourceFilePath.slice(0, slash).split("/");
	for (const segment of path.split("/")) {
		if (segment === "" || segment === ".") continue;
		if (segment === "..") segments.pop();
		else segments.push(segment);
	}
	return segments.join("/");
}

/**
 * Deep-clone a subtree for splicing into a host tree, giving every node an
 * instance-unique id: `<parser id>~<embed-site node id>`. The embed site's
 * id is a stable content-position hash of the `![[...]]` line itself (the
 * parser's occurrence counter keeps repeated identical embed lines
 * distinct), so instance ids are deterministic across re-parses. Nested
 * embeds compound naturally — their site node was itself suffixed by the
 * outer clone.
 */
function cloneWithInstanceIds(node: OsmosisNode, siteId: string): OsmosisNode {
	return {
		...node,
		id: `${node.id}~${siteId}`,
		range: { ...node.range },
		...(node.metadata !== undefined ? { metadata: { ...node.metadata } } : {}),
		children: node.children.map((child) => cloneWithInstanceIds(child, siteId)),
	};
}
