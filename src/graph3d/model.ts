/**
 * Pure world model for the 3D graph view: the nodes and edges of the loaded
 * notes. See the `# Spec` section of `vault/Planner/Develop Mind-Map Graph
 * View.md` ("World model").
 *
 * Every parse-tree node is a line node, held to its note's root by hierarchy
 * edges, except a note embed (`![[Note]]`, a `transclusion` node): it would
 * only repeat the embedded note's title, so its embed edge leaves from the
 * line above it instead. A note's root is its core (the file-name plate), or, when the note is
 * one H1 and everything under it, that H1 (`soleH1`): the core is then not
 * built, and the H1 takes its ID, its frontmatter tags and properties, and the
 * links into the note. Links, embeds, frontmatter links and tags come from Obsidian's link
 * cache rather than a re-parse: each cached reference carries its source
 * offset, which places it on the line whose range contains it.
 *
 * Only the notes passed in are loaded. A link to a Markdown note outside that
 * set is dropped (the horizon decides what is loaded, see `horizon.ts`), while
 * tag hubs, attachments and ghosts appear whenever a loaded note reaches them.
 */

import type { CachedMetadata } from "obsidian";
import type { CardOcclusion } from "../database/types";
import type { OcclusionSide } from "../study/occlusion-masks";
import type { NodeStyle } from "../styles";
import type { OsmosisNode, OsmosisTree } from "../types";
import { noteStyleReader } from "./node-style";

export type GraphNodeKind = "note" | "line" | "tag" | "attachment" | "ghost";

export type GraphEdgeKind = "hierarchy" | "link" | "embed" | "property" | "tag" | "attachment";

export interface GraphNode {
	id: string;
	kind: GraphNodeKind;
	/** Display text: note title, line content, `#tag`, file name or link text. */
	label: string;
	/** Vault path of the note (note and line nodes) or of the file (attachments). */
	path?: string;
	/** The parse node: the tree's root for a note, the line itself for a line. */
	source?: OsmosisNode;
	/**
	 * Relational study only (`studyNode`): the occluded diagram this node is
	 * asking about, and which side of it to paint. The near-tier panel draws the
	 * image with its masks instead of the node's text.
	 */
	masks?: { occlusion: CardOcclusion; side: OcclusionSide };
	/**
	 * A line only: this line is its note's root, standing in for the core
	 * (`soleH1`). Its ID is the core's, `noteNodeId(path)`. See `isNoteRoot`.
	 */
	root?: boolean;
	/**
	 * Note and line nodes: the node's resolved `osmosis-styles` style, as the
	 * mind map resolves it (`noteStyleReader`). Absent for a node with none.
	 */
	style?: NodeStyle;
}

/**
 * `source` and `target` are node IDs. 3d-force-graph replaces them with node
 * objects in place, so the view hands the engine copies.
 */
export interface GraphEdge {
	kind: GraphEdgeKind;
	source: string;
	target: string;
}

export interface GraphModel {
	nodes: GraphNode[];
	edges: GraphEdge[];
}

/** The part of `metadataCache.getFileCache()` the model reads. */
export type LinkCacheLike = Pick<CachedMetadata, "links" | "embeds" | "tags" | "frontmatterLinks" | "frontmatter">;

export interface NoteInput {
	tree: OsmosisTree;
	cache: LinkCacheLike | null;
	/**
	 * Depth 0 only: the part of this note a transclusion renders, as the roots of
	 * the subtrees to show (a heading section, a block). Without it the whole note
	 * shows. A partial note gets no core: its roots hang from the `![[…]]` edge.
	 */
	only?: ReadonlySet<OsmosisNode>;
}

export interface BuildOptions {
	/**
	 * Depth 0: show only what the loaded notes contain. A plain link, or a
	 * property, to an attachment or an unresolved target adds no node (embeds
	 * and tags still do), as a link to a note outside the loaded set already
	 * adds none.
	 */
	contentOnly?: boolean;
	/** The plugin's global style classes, for nodes whose style names one (`noteStyleReader`). */
	globalClasses?: Record<string, NodeStyle>;
}

/**
 * Resolves a link path (no subpath) from a source note to a vault file path,
 * or `null` when unresolved: `metadataCache.getFirstLinkpathDest(...)?.path`.
 */
export type LinkResolver = (linkpath: string, sourcePath: string) => string | null;

export const noteNodeId = (path: string): string => `note:${path}`;

/**
 * Whether `node` is its note's root: the core (the file-name plate), or the
 * sole H1 that replaces it. Either way its ID is `noteNodeId(path)`, so hops,
 * links into the note and positions find it by path.
 */
export const isNoteRoot = (node: { kind: GraphNodeKind; root?: boolean }): boolean => node.kind === "note" || node.root === true;

/**
 * The H1 that is the note's root, when the note is exactly one H1 and
 * everything under it: the parse root's only child is a level-1 heading.
 * Frontmatter is not in the tree, so it doesn't count. A line before the H1,
 * or a second H1, is a second top-level node, and the core stays the root.
 */
export function soleH1(root: OsmosisNode): OsmosisNode | null {
	const only = root.children.length === 1 ? root.children[0] : undefined;
	return only !== undefined && only.type === "heading" && only.depth === 1 ? only : null;
}
export const tagNodeId = (tag: string): string => `tag:${normalizeTag(tag)}`;
export const attachmentNodeId = (path: string): string => `file:${path}`;
export const ghostNodeId = (linkpath: string): string => `ghost:${linkpath.toLowerCase()}`;

/**
 * A line's ID prefers its block ID, which survives edits, over the parser's
 * content hash, which does not. Parser IDs are unique only within one file, so
 * both forms carry the note path.
 */
function lineNodeId(path: string, node: OsmosisNode, useBlockId: boolean): string {
	return useBlockId && node.blockId !== undefined ? `line:${path}#^${node.blockId}` : `line:${path}#${node.id}`;
}

/** Tags match case-insensitively, as in Obsidian's tag pane. */
function normalizeTag(tag: string): string {
	return tag.replace(/^#/, "").toLowerCase();
}

export function normalizeHeading(text: string): string {
	return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function noteTitle(path: string): string {
	const name = path.slice(path.lastIndexOf("/") + 1);
	return name.endsWith(".md") ? name.slice(0, -3) : name;
}

const isNotePath = (path: string): boolean => path.endsWith(".md");

/** Per-note lookups, built in the same walk that emits the note's lines. */
interface NoteIndex {
	path: string;
	/** The note's root (its core, or its sole H1). Null for a note shown in part (`NoteInput.only`): it has no root. */
	coreId: string | null;
	/** Line nodes in source order, for offset lookup. */
	lines: { node: OsmosisNode; id: string }[];
	byBlockId: Map<string, string>;
	byHeading: Map<string, string>;
}

/**
 * Build the graph of the given notes. `notes` is the loaded set; `resolve` maps
 * link paths to files.
 */
export function buildGraph(notes: readonly NoteInput[], resolve: LinkResolver, options: BuildOptions = {}): GraphModel {
	const nodes = new Map<string, GraphNode>();
	const edges = new Map<string, GraphEdge>();
	const indexes = new Map<string, NoteIndex>();

	const addEdge = (kind: GraphEdgeKind, source: string, target: string): void => {
		const key = `${kind}|${source}|${target}`;
		if (!edges.has(key)) edges.set(key, { kind, source, target });
	};

	// Pass 1: every note's root and lines, so pass 2 can target any loaded line.
	for (const { tree, cache, only } of notes) {
		const path = tree.filePath;
		const coreId = only === undefined ? noteNodeId(path) : null;
		// A sole H1 is the root under the core's ID, so it keeps its place across edits to its text.
		const h1 = coreId === null ? null : soleH1(tree.root);
		const styleOf = noteStyleReader(cache?.frontmatter, tree.root, options.globalClasses);
		const styled = (node: OsmosisNode): { style?: NodeStyle } => {
			const style = styleOf?.(node);
			return style === undefined ? {} : { style };
		};
		if (coreId !== null && h1 === null) nodes.set(coreId, { id: coreId, kind: "note", label: noteTitle(path), path, source: tree.root, ...styled(tree.root) });
		const index: NoteIndex = { path, coreId, lines: [], byBlockId: new Map(), byHeading: new Map() };
		indexes.set(path, index);

		// `parentId` is null while looking for a partial note's roots: lines above them are skipped.
		const walk = (parent: OsmosisNode, parentId: string | null): void => {
			for (const child of parent.children) {
				if (parentId === null && !only?.has(child)) {
					walk(child, null);
					continue;
				}
				// A note embed gets no plate: its embed edge leaves from the line above it, straight to the embedded note's plate (T95).
				// It stays in `lines` under that line's ID, so the link cache's embed lands there. Not when it is a partial note's root: nothing is above it.
				if (child.type === "transclusion" && parentId !== null) {
					index.lines.push({ node: child, id: parentId });
					if (child.blockId !== undefined && !index.byBlockId.has(child.blockId)) index.byBlockId.set(child.blockId, parentId);
					walk(child, parentId);
					continue;
				}
				let id = child === h1 && coreId !== null ? coreId : lineNodeId(path, child, true);
				// A duplicated block ID is a user error; keep both lines visible.
				if (child !== h1 && nodes.has(id)) id = lineNodeId(path, child, false);
				nodes.set(id, { id, kind: "line", label: child.content, path, source: child, ...(child === h1 ? { root: true } : {}), ...styled(child) });
				if (parentId !== null && child !== h1) addEdge("hierarchy", parentId, id);
				index.lines.push({ node: child, id });
				if (child.blockId !== undefined && !index.byBlockId.has(child.blockId)) {
					index.byBlockId.set(child.blockId, id);
				}
				if (child.type === "heading") {
					const key = normalizeHeading(child.content);
					if (!index.byHeading.has(key)) index.byHeading.set(key, id);
				}
				walk(child, id);
			}
		};
		walk(tree.root, coreId);
		// Pre-order is source order already; sorting guards the binary search.
		index.lines.sort((a, b) => a.node.range.start - b.node.range.start);
	}

	/** The node a link lands on, creating attachment and ghost nodes on demand. */
	const resolveTarget = (link: string, sourcePath: string, create = true): string | null => {
		const hash = link.indexOf("#");
		const linkpath = hash === -1 ? link : link.slice(0, hash);
		const subpath = hash === -1 ? "" : link.slice(hash + 1);

		// `[[#Heading]]` points into its own note.
		const targetPath = linkpath === "" ? sourcePath : resolve(linkpath, sourcePath);
		if (targetPath === null) {
			if (!create) return null;
			const id = ghostNodeId(linkpath);
			if (!nodes.has(id)) nodes.set(id, { id, kind: "ghost", label: linkpath });
			return id;
		}
		if (!isNotePath(targetPath)) {
			if (!create) return null;
			const id = attachmentNodeId(targetPath);
			if (!nodes.has(id)) nodes.set(id, { id, kind: "attachment", label: noteTitle(targetPath), path: targetPath });
			return id;
		}
		const target = indexes.get(targetPath);
		if (target === undefined) return null;
		const key = subpathKey(subpath);
		if (key === null) return target.coreId;
		// A heading or block that doesn't exist (yet) draws nothing: no fallback to the note, no ghost. The edge appears once it exists.
		return ("blockId" in key ? target.byBlockId.get(key.blockId) : target.byHeading.get(key.heading)) ?? null;
	};
	const contentOnly = options.contentOnly === true;

	// Pass 2: cross-note edges, from the link cache.
	for (const { tree, cache } of notes) {
		if (cache === null) continue;
		const index = indexes.get(tree.filePath);
		if (index === undefined) continue;
		/**
		 * The line a reference at `offset` sits on, or the root when it is on no
		 * line. Null for a reference outside the part of a partial note that is
		 * shown, or one whose line doesn't hold its `text`: the link cache lags an
		 * edit, so right after a write its offsets index the old bytes and can
		 * land on a line just inserted (a spawned plate) or on a shifted
		 * neighbour. Skipped until the cache catches up and the model rebuilds.
		 */
		const sourceAt = (offset: number, text: string): string | null => {
			const line = lineAt(index, offset);
			if (line === undefined) return index.coreId;
			return (line.node.raw ?? line.node.content).includes(text) ? line.id : null;
		};

		for (const ref of cache.links ?? []) {
			const source = sourceAt(ref.position.start.offset, ref.original);
			const target = source === null ? null : resolveTarget(ref.link, index.path, !contentOnly);
			if (source === null || target === null) continue;
			const kind = nodes.get(target)?.kind === "attachment" ? "attachment" : "link";
			addEdge(kind, source, target);
		}
		for (const ref of cache.embeds ?? []) {
			const source = sourceAt(ref.position.start.offset, ref.original);
			const target = source === null ? null : resolveTarget(ref.link, index.path);
			if (source === null || target === null) continue;
			const kind = nodes.get(target)?.kind === "attachment" ? "attachment" : "embed";
			addEdge(kind, source, target);
		}
		for (const ref of cache.frontmatterLinks ?? []) {
			const target = index.coreId === null ? null : resolveTarget(ref.link, index.path, !contentOnly);
			if (target !== null && index.coreId !== null) addEdge("property", index.coreId, target);
		}

		const tagTargets: [source: string, tag: string][] = [];
		for (const ref of cache.tags ?? []) {
			const source = sourceAt(ref.position.start.offset, ref.tag);
			if (source !== null) tagTargets.push([source, ref.tag]);
		}
		if (index.coreId !== null) for (const tag of frontmatterTags(cache.frontmatter)) tagTargets.push([index.coreId, tag]);
		for (const [source, tag] of tagTargets) {
			const id = tagNodeId(tag);
			if (!nodes.has(id)) nodes.set(id, { id, kind: "tag", label: `#${tag.replace(/^#/, "")}` });
			addEdge("tag", source, id);
		}
	}

	return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

/**
 * What a link's subpath (the part after `#`, without it) names: a block ID, or
 * a heading normalized for lookup. `#A#B` names heading B under A; the last
 * segment identifies it. `null` for no subpath.
 */
export function subpathKey(subpath: string): { blockId: string } | { heading: string } | null {
	if (subpath.startsWith("^")) return { blockId: subpath.slice(1) };
	const segments = subpath.split("#").filter((s) => s.trim() !== "");
	const last = segments[segments.length - 1];
	return last === undefined ? null : { heading: normalizeHeading(last) };
}

/**
 * Where following a link into the loaded note at `path` lands: the line with
 * the block ID or heading `subpath` names (without its `#`), else the note's
 * root (its core, or its sole H1), as following it in Obsidian does. Unlike
 * `buildGraph`, which draws no edge for a subpath that names nothing. `null`
 * when the note isn't loaded.
 */
export function linkTargetNode(model: GraphModel, path: string, subpath: string): string | null {
	const coreId = noteNodeId(path);
	if (!model.nodes.some((node) => node.id === coreId)) return null;
	const key = subpathKey(subpath);
	if (key === null) return coreId;
	// The first match in source order, as buildGraph's index keeps.
	const line = model.nodes.find((node) => {
		if (node.kind !== "line" || node.path !== path || node.source === undefined) return false;
		return "blockId" in key ? node.source.blockId === key.blockId : node.source.type === "heading" && normalizeHeading(node.source.content) === key.heading;
	});
	return line?.id ?? coreId;
}

/**
 * The deepest line whose range contains `offset`. Ranges are disjoint or
 * nested (an embed lifted out of a list item sits inside its line), and a
 * nested range starts later, so the nearest containing line at or before the
 * offset is the deepest one.
 */
function lineAt(index: NoteIndex, offset: number): { node: OsmosisNode; id: string } | undefined {
	const { lines } = index;
	let lo = 0;
	let hi = lines.length - 1;
	let last = -1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		const line = lines[mid];
		if (line !== undefined && line.node.range.start <= offset) {
			last = mid;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	for (let i = last; i >= 0; i--) {
		const line = lines[i];
		if (line !== undefined && offset < line.node.range.end) return line;
	}
	return undefined;
}

/**
 * Tags from the `tags` (or legacy `tag`) property, which YAML allows as a list
 * or as a comma- or space-separated string, each with or without a leading `#`.
 */
function frontmatterTags(frontmatter: LinkCacheLike["frontmatter"]): string[] {
	const raw: unknown = frontmatter?.tags ?? frontmatter?.tag;
	const values: unknown[] = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[,\s]+/) : [];
	const tags: string[] = [];
	for (const value of values) {
		if (typeof value !== "string" && typeof value !== "number") continue;
		const tag = String(value).trim().replace(/^#/, "");
		if (tag !== "") tags.push(tag);
	}
	return tags;
}
