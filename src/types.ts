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

	/** Child nodes in document order. */
	children: OsmosisNode[];

	/** Character positions in the source markdown. */
	range: Range;

	/** For transcluded nodes, the source file path. Undefined for local nodes. */
	sourceFile?: string;

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
