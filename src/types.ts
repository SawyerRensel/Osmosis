/**
 * Shared AST types for Osmosis.
 *
 * All features (mind map, spaced repetition, transclusion) consume these types.
 * Designed for extensibility — metadata slots allow attaching card data, style
 * overrides, and view state without modifying the core types.
 */

/** Node types recognized by the parser. */
export type NodeType =
	| "root"
	| "heading"
	| "bullet"
	| "ordered"
	| "paragraph"
	| "codeblock"
	| "table"
	| "blockquote"
	| "transclusion";

/** Character range in source markdown (0-based, end-exclusive). */
export interface Range {
	start: number;
	end: number;
}

/** A single node in the Osmosis AST. */
export interface OsmosisNode {
	/** Stable content-position hash for identity across parses. */
	id: string;

	/** What kind of markdown element this node represents. */
	type: NodeType;

	/**
	 * Heading level (1–6) or list nesting depth (0-based).
	 * For root nodes this is 0.
	 */
	depth: number;

	/** Raw markdown content of this node (without structural prefix like `- ` or `## `). */
	content: string;

	/**
	 * The node's source text exactly as it appears in the file, minus a trailing
	 * inline block ID — `range`'s bytes with only the card identity removed.
	 *
	 * Where `content` drops every structural marker, this keeps them:
	 * indentation, `- ` / `1. `, `#`s, `[x] `, the `![[…]]` wrapper. Mind-map
	 * inline editing works from *these* bytes (all but the indentation, which
	 * the map itself draws), so any markdown element can be changed from the map
	 * without switching to the note editor.
	 * Multiline nodes (code block / table / blockquote) carry their ID on a
	 * separate `^id` line outside `range`, so for them `raw === content`.
	 */
	raw?: string;

	/** Child nodes in document order. */
	children: OsmosisNode[];

	/** Character positions in the source markdown. */
	range: Range;

	/**
	 * Obsidian block ID found at the end of this node's line (without the
	 * leading caret, e.g. "os-a1b2c3"). Stripped from `content`. Used as the
	 * line-card identity and as a style selector anchor.
	 */
	blockId?: string;

	/**
	 * For multiline nodes (code block / table / blockquote) whose block ID
	 * lives on a *separate* trailing `^id` line, the end offset of that line.
	 * `range` deliberately excludes it — so a content rewrite through the mind
	 * map can't wipe the identity — but structural moves must carry the line
	 * along, so subtree-span math (see `subtreeEnd`) uses this when present.
	 */
	blockIdLineEnd?: number;

	/** For transcluded nodes, the source file path. Undefined for local nodes. */
	sourceFile?: string;

	/**
	 * For a node produced by expanding an `![[embed]]` (i.e. a direct
	 * replacement of a transclusion node), the range of that `![[…]]` line in
	 * the *containing* file — the file that embeds it, in that file's
	 * coordinates. `range`/`blockIdLineEnd` index the node's own source file;
	 * this indexes the host. Structural edits *in the containing file* treat the
	 * whole embed as one atomic unit occupying this span (see `subtreeEnd`),
	 * rather than descending into source-coordinate children. Only set on the
	 * top-level expanded children; deeper descendants share their source file.
	 */
	embedHostRange?: Range;

	/** Whether this node was pulled in via transclusion. */
	isTranscluded: boolean;

	/**
	 * Extensibility slot for feature-specific metadata.
	 * Card metadata, style overrides, view state, etc. can be attached here
	 * without modifying the core type.
	 */
	metadata?: Record<string, unknown>;
}

/** The complete parse result for a markdown document. */
export interface OsmosisTree {
	/** Virtual root node (type "root") containing all top-level nodes as children. */
	root: OsmosisNode;

	/** File path this tree was parsed from. */
	filePath: string;

	/** Content hash for cache invalidation. */
	contentHash: string;
}
