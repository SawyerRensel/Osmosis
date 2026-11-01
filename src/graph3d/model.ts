/**
 * Pure world model for the 3D graph view: the nodes and edges of the loaded
 * notes. See the `# Spec` section of `vault/Planner/Develop Mind-Map Graph
 * View.md` ("World model").
 *
 * Every parse-tree node is a line node, held to its note's core by hierarchy
 * edges. Links, embeds, frontmatter links and tags come from Obsidian's link
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
import type { OsmosisNode, OsmosisTree } from "../types";

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
}

/**
 * Resolves a link path (no subpath) from a source note to a vault file path,
 * or `null` when unresolved: `metadataCache.getFirstLinkpathDest(...)?.path`.
 */
export type LinkResolver = (linkpath: string, sourcePath: string) => string | null;

export const noteNodeId = (path: string): string => `note:${path}`;
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
	coreId: string;
	/** Line nodes in source order, for offset lookup. */
	lines: { node: OsmosisNode; id: string }[];
	byBlockId: Map<string, string>;
	byHeading: Map<string, string>;
}

/**
 * Build the graph of the given notes. `notes` is the loaded set; `resolve` maps
 * link paths to files.
 */
export function buildGraph(notes: readonly NoteInput[], resolve: LinkResolver): GraphModel {
	const nodes = new Map<string, GraphNode>();
	const edges = new Map<string, GraphEdge>();
	const indexes = new Map<string, NoteIndex>();

	const addEdge = (kind: GraphEdgeKind, source: string, target: string): void => {
		const key = `${kind}|${source}|${target}`;
		if (!edges.has(key)) edges.set(key, { kind, source, target });
	};

	// Pass 1: every note's core and lines, so pass 2 can target any loaded line.
	for (const { tree } of notes) {
		const path = tree.filePath;
		const coreId = noteNodeId(path);
		nodes.set(coreId, { id: coreId, kind: "note", label: noteTitle(path), path, source: tree.root });
		const index: NoteIndex = { path, coreId, lines: [], byBlockId: new Map(), byHeading: new Map() };
		indexes.set(path, index);

		const walk = (parent: OsmosisNode, parentId: string): void => {
			for (const child of parent.children) {
				let id = lineNodeId(path, child, true);
				// A duplicated block ID is a user error; keep both lines visible.
				if (nodes.has(id)) id = lineNodeId(path, child, false);
				nodes.set(id, { id, kind: "line", label: child.content, path, source: child });
				addEdge("hierarchy", parentId, id);
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
	const resolveTarget = (link: string, sourcePath: string): string | null => {
		const hash = link.indexOf("#");
		const linkpath = hash === -1 ? link : link.slice(0, hash);
		const subpath = hash === -1 ? "" : link.slice(hash + 1);

		// `[[#Heading]]` points into its own note.
		const targetPath = linkpath === "" ? sourcePath : resolve(linkpath, sourcePath);
		if (targetPath === null) {
			const id = ghostNodeId(linkpath);
			if (!nodes.has(id)) nodes.set(id, { id, kind: "ghost", label: linkpath });
			return id;
		}
		if (!isNotePath(targetPath)) {
			const id = attachmentNodeId(targetPath);
			if (!nodes.has(id)) nodes.set(id, { id, kind: "attachment", label: noteTitle(targetPath), path: targetPath });
			return id;
		}
		const target = indexes.get(targetPath);
		if (target === undefined) return null;
		// An unmatched subpath falls back to the note, as following it in Obsidian does.
		const key = subpathKey(subpath);
		if (key === null) return target.coreId;
		return ("blockId" in key ? target.byBlockId.get(key.blockId) : target.byHeading.get(key.heading)) ?? target.coreId;
	};

	// Pass 2: cross-note edges, from the link cache.
	for (const { tree, cache } of notes) {
		if (cache === null) continue;
		const index = indexes.get(tree.filePath);
		if (index === undefined) continue;
		const sourceAt = (offset: number): string => lineAt(index, offset) ?? index.coreId;

		for (const ref of cache.links ?? []) {
			const target = resolveTarget(ref.link, index.path);
			if (target === null) continue;
			const kind = nodes.get(target)?.kind === "attachment" ? "attachment" : "link";
			addEdge(kind, sourceAt(ref.position.start.offset), target);
		}
		for (const ref of cache.embeds ?? []) {
			const target = resolveTarget(ref.link, index.path);
			if (target === null) continue;
			const kind = nodes.get(target)?.kind === "attachment" ? "attachment" : "embed";
			addEdge(kind, sourceAt(ref.position.start.offset), target);
		}
		for (const ref of cache.frontmatterLinks ?? []) {
			const target = resolveTarget(ref.link, index.path);
			if (target !== null) addEdge("property", index.coreId, target);
		}

		const tagTargets: [source: string, tag: string][] = [];
		for (const ref of cache.tags ?? []) tagTargets.push([sourceAt(ref.position.start.offset), ref.tag]);
		for (const tag of frontmatterTags(cache.frontmatter)) tagTargets.push([index.coreId, tag]);
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
function subpathKey(subpath: string): { blockId: string } | { heading: string } | null {
	if (subpath.startsWith("^")) return { blockId: subpath.slice(1) };
	const segments = subpath.split("#").filter((s) => s.trim() !== "");
	const last = segments[segments.length - 1];
	return last === undefined ? null : { heading: normalizeHeading(last) };
}

/**
 * The node a link into the loaded note at `path` lands on, as `buildGraph`
 * resolves it: the line with the block ID or heading `subpath` names (without
 * its `#`), else the note's core. `null` when the note isn't loaded.
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
function lineAt(index: NoteIndex, offset: number): string | undefined {
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
		if (line !== undefined && offset < line.node.range.end) return line.id;
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
