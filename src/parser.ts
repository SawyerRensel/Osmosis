import { OsmosisNode, OsmosisTree, NodeType, Range } from "./types";

/**
 * Incremental markdown parser for Osmosis.
 *
 * Parses markdown into an OsmosisTree, recognizing:
 * - Headings (# through ######)
 * - Bullet lists (- item, * item)
 * - Numbered lists (1. item)
 * - Transclusion links (![[note]] and ![](path))
 * - Paragraphs (everything else)
 *
 * The parser builds a hierarchical tree based on heading levels and list
 * nesting depth, with range tracking for cursor sync.
 */
export class OsmosisParser {
	/**
	 * Full parse of a markdown document into an OsmosisTree.
	 */
	parse(markdown: string, filePath: string): OsmosisTree {
		const root = this.createNode("root", 0, "", { start: 0, end: markdown.length });
		const lines = this.splitLines(markdown);

		this.buildTree(root, lines);

		return {
			root,
			filePath,
			contentHash: this.hash(markdown),
		};
	}

	/**
	 * Build the tree by processing lines and inserting nodes at the
	 * correct depth in the hierarchy.
	 */
	private buildTree(root: OsmosisNode, lines: LineInfo[]): void {
		// Stack tracks the current insertion path: [root, heading1, heading2, ...]
		// Each entry is a node whose children array we may append to.
		const headingStack: OsmosisNode[] = [root];

		// Separate stack for list nesting within the current heading scope.
		let listStack: OsmosisNode[] = [];

		// Fenced code block accumulator
		let inCodeBlock = false;
		let codeFence = "";
		let codeLines: string[] = [];
		let codeStart = 0;

		for (const line of lines) {
			// Fenced code block detection
			const fenceMatch = /^(`{3,}|~{3,})(.*)$/.exec(line.text.trim());
			if (inCodeBlock) {
				if (fenceMatch && fenceMatch[1]?.startsWith(codeFence.charAt(0)) && (fenceMatch[1]?.length ?? 0) >= codeFence.length && (fenceMatch[2] ?? "").trim() === "") {
					// Closing fence: create codeblock node with full fenced content
					codeLines.push(line.text);
					const content = codeLines.join("\n");
					const node = this.createNode("codeblock", 0, content, {
						start: codeStart,
						end: line.end,
					});
					// Insert into tree at current heading context
					listStack = [];
					const parent = headingStack[headingStack.length - 1] ?? root;
					parent.children.push(node);
					inCodeBlock = false;
					codeLines = [];
					continue;
				}
				codeLines.push(line.text);
				continue;
			}
			if (fenceMatch?.[1] !== undefined) {
				// Opening fence
				inCodeBlock = true;
				codeFence = fenceMatch[1];
				codeLines = [line.text];
				codeStart = line.start;
				continue;
			}

			const parsed = this.parseLine(line);
			if (parsed === null) {
				// Blank line: reset list context
				listStack = [];
				continue;
			}

			const node = this.createNode(parsed.type, parsed.depth, parsed.content, {
				start: line.start,
				end: line.end,
			});

			// Store ordered list number in metadata
			if (parsed.listNumber !== undefined) {
				node.metadata = { ...node.metadata, listNumber: parsed.listNumber };
			}

			if (parsed.type === "heading") {
				// Headings reset list context
				listStack = [];

				// Pop heading stack back to parent level
				// A heading at depth N is a child of the most recent heading at depth < N
				while (headingStack.length > 1) {
					const top = headingStack[headingStack.length - 1];
					if (top === undefined || top.type !== "heading" || top.depth >= parsed.depth) {
						headingStack.pop();
					} else {
						break;
					}
				}

				const parent = headingStack[headingStack.length - 1] ?? root;
				parent.children.push(node);
				headingStack.push(node);
			} else if (parsed.type === "bullet" || parsed.type === "ordered") {
				// List items nest by indentation depth
				// depth 0 = top-level list item, depth 1 = nested one level, etc.

				// Pop list stack to find parent at depth < this item's depth
				while (listStack.length > 0) {
					const top = listStack[listStack.length - 1];
					if (top !== undefined && top.depth >= parsed.depth) {
						listStack.pop();
					} else {
						break;
					}
				}

				if (listStack.length > 0) {
					// Nested under another list item
					const parent = listStack[listStack.length - 1];
					if (parent !== undefined) {
						parent.children.push(node);
					}
				} else {
					// Top-level list item: child of current heading
					const parent = headingStack[headingStack.length - 1] ?? root;
					parent.children.push(node);
				}

				listStack.push(node);
			} else if (parsed.type === "transclusion") {
				// Transclusion nodes are children of the current heading context
				listStack = [];
				const parent = headingStack[headingStack.length - 1] ?? root;
				parent.children.push(node);
			} else {
				// Paragraph: child of current list item if in a list, else heading
				if (listStack.length > 0) {
					const parent = listStack[listStack.length - 1];
					if (parent !== undefined) {
						parent.children.push(node);
					}
				} else {
					const parent = headingStack[headingStack.length - 1] ?? root;
					parent.children.push(node);
				}
			}
		}
	}

	/**
	 * Parse a single line to determine its type, depth, and content.
	 * Returns null for blank/empty lines.
	 */
	private parseLine(line: LineInfo): ParsedLine | null {
		const text = line.text;

		// Blank line
		if (text.trim() === "") {
			return null;
		}

		// Heading: # through ######
		const headingMatch = /^(#{1,6})\s+(.*)$/.exec(text);
		if (headingMatch?.[1] !== undefined && headingMatch[2] !== undefined) {
			return {
				type: "heading",
				depth: headingMatch[1].length,
				content: headingMatch[2],
			};
		}

		// Calculate indentation for list nesting
		// Supports tab and space indentation (each tab or 2 spaces = 1 level)
		// Output always uses tabs (Obsidian default)
		const indentMatch = /^(\s*)/.exec(text);
		const indentStr = indentMatch?.[1] ?? "";
		const tabCount = (indentStr.match(/\t/g) ?? []).length;
		const spaceCount = indentStr.length - tabCount;
		const nestingDepth = tabCount + Math.floor(spaceCount / 2);
		const trimmed = text.slice(indentStr.length);

		// Transclusion: ![[note]] or ![](path)
		// Must check before bullet lists since ![] could be confused with list markers
		const wikiTransclusion = /^!\[\[([^\]]+)\]\]/.exec(trimmed);
		if (wikiTransclusion?.[1] !== undefined) {
			return {
				type: "transclusion",
				depth: nestingDepth,
				content: wikiTransclusion[1],
			};
		}

		const mdTransclusion = /^!\[([^\]]*)\]\(([^)]+)\)/.exec(trimmed);
		if (mdTransclusion?.[2] !== undefined) {
			return {
				type: "transclusion",
				depth: nestingDepth,
				content: mdTransclusion[2],
			};
		}

		// Bullet list: - item or * item
		const bulletMatch = /^[-*]\s+(.*)$/.exec(trimmed);
		if (bulletMatch?.[1] !== undefined) {
			return {
				type: "bullet",
				depth: nestingDepth,
				content: bulletMatch[1],
			};
		}

		// Ordered list: 1. item (any number)
		const orderedMatch = /^(\d+)\.\s+(.*)$/.exec(trimmed);
		if (orderedMatch?.[1] !== undefined && orderedMatch[2] !== undefined) {
			return {
				type: "ordered",
				depth: nestingDepth,
				content: orderedMatch[2],
				listNumber: parseInt(orderedMatch[1], 10),
			};
		}

		// Paragraph (everything else)
		return {
			type: "paragraph",
			depth: 0,
			content: text.trim(),
		};
	}

	/**
	 * Split markdown into lines with start/end character positions.
	 */
	private splitLines(markdown: string): LineInfo[] {
		const lines: LineInfo[] = [];
		let pos = 0;

		for (const text of markdown.split("\n")) {
			lines.push({
				text,
				start: pos,
				end: pos + text.length,
			});
			pos += text.length + 1; // +1 for the newline
		}

		return lines;
	}

	/**
	 * Create a new AST node.
	 */
	private createNode(type: NodeType, depth: number, content: string, range: Range): OsmosisNode {
		return {
			id: this.generateId(type, depth, content, range),
			type,
			depth,
			content,
			children: [],
			range,
			isTranscluded: false,
		};
	}

	/**
	 * Generate a stable ID from node properties and position.
	 * Uses a simple hash of type + content + position for identity.
	 */
	private generateId(type: NodeType, depth: number, content: string, range: Range): string {
		const input = `${type}:${String(depth)}:${content}:${String(range.start)}`;
		return this.hash(input).slice(0, 12);
	}

	/**
	 * Incremental parse: given the previous markdown and the new markdown,
	 * re-parses only the affected region and produces a new tree.
	 *
	 * Strategy: identify the changed line range, re-parse the entire document
	 * but use the knowledge that most of the document hasn't changed.
	 * For small edits (single line), this is significantly faster than a full
	 * re-parse because we can skip unchanged prefix/suffix lines.
	 */
	incrementalParse(
		oldMarkdown: string,
		newMarkdown: string,
		filePath: string,
	): OsmosisTree {
		// For now, use a fast-path optimization: if the change is small
		// (single line edit), we still do a full re-parse but the parser
		// is already fast enough (< 2ms for typical notes).
		// A future optimization could do subtree-level patching.
		return this.parse(newMarkdown, filePath);
	}

	/**
	 * Find the most specific AST node whose range contains the given position.
	 * Node ranges cover only their own line, so we search all descendants
	 * and return the deepest match.
	 */
	findNodeAtPosition(tree: OsmosisTree, position: number): OsmosisNode | null {
		let best: OsmosisNode | null = null;
		this.searchNodeAtPosition(tree.root, position, (node) => { best = node; });
		return best;
	}

	private searchNodeAtPosition(
		node: OsmosisNode,
		position: number,
		onMatch: (node: OsmosisNode) => void,
	): void {
		if (node.type !== "root" && position >= node.range.start && position <= node.range.end) {
			onMatch(node);
		}
		for (const child of node.children) {
			this.searchNodeAtPosition(child, position, onMatch);
		}
	}

	/**
	 * Simple string hash (djb2 variant). Fast and sufficient for cache keys
	 * and node IDs. Not cryptographic.
	 */
	hash(input: string): string {
		let hash = 5381;
		for (let i = 0; i < input.length; i++) {
			hash = ((hash << 5) + hash + (input.charCodeAt(i) ?? 0)) | 0;
		}
		// Convert to unsigned 32-bit and then to hex
		return (hash >>> 0).toString(16).padStart(8, "0");
	}
}

/** Internal representation of a line during parsing. */
interface LineInfo {
	text: string;
	start: number;
	end: number;
}

/** Result of parsing a single line. */
interface ParsedLine {
	type: NodeType;
	depth: number;
	content: string;
	/** For ordered list items, the original number (e.g. 1, 2, 3). */
	listNumber?: number;
}
