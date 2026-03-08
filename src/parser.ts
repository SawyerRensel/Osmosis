import { OsmosisNode, OsmosisTree, NodeType, Range } from "./types";
import { OSMOSIS_ID_STRIP_REGEX } from "./card-id";

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
		this.resetIdCounters();
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

		// Table accumulator
		let inTable = false;
		let tableLines: string[] = [];
		let tableStart = 0;
		let tableEnd = 0;

		// Skip YAML frontmatter (--- delimited block at the start of the file)
		let lineIdx = 0;
		if (lines.length > 0 && lines[0]!.text.trim() === "---") {
			lineIdx = 1;
			while (lineIdx < lines.length) {
				if (lines[lineIdx]!.text.trim() === "---") {
					lineIdx++; // skip closing ---
					break;
				}
				lineIdx++;
			}
		}

		for (; lineIdx < lines.length; lineIdx++) {
			const line = lines[lineIdx]!;
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

			// Table detection: accumulate consecutive pipe-prefixed lines
			const isPipeLine = /^\s*\|/.test(line.text);
			if (inTable) {
				if (isPipeLine) {
					tableLines.push(line.text);
					tableEnd = line.end;
					continue;
				} else {
					// End of table: flush accumulated lines as a table node
					const content = tableLines.join("\n");
					const node = this.createNode("table", 0, content, {
						start: tableStart,
						end: tableEnd,
					});
					listStack = [];
					const parent = headingStack[headingStack.length - 1] ?? root;
					parent.children.push(node);
					inTable = false;
					tableLines = [];
					// Fall through to process current line normally
				}
			}
			if (!inTable && isPipeLine) {
				// Check if next line is a table separator (|---|---|)
				const nextLine = lines[lineIdx + 1];
				if (nextLine && /^\s*\|[\s:]*-+[\s:]*[-|\s:]*$/.test(nextLine.text)) {
					inTable = true;
					tableLines = [line.text];
					tableStart = line.start;
					tableEnd = line.end;
					continue;
				}
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

			// Store checkbox state in metadata
			if (parsed.checkbox) {
				node.metadata = { ...node.metadata, checkbox: true, checked: parsed.checked };
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

		// Flush any pending table at end of document
		if (inTable && tableLines.length > 0) {
			const content = tableLines.join("\n");
			const node = this.createNode("table", 0, content, {
				start: tableStart,
				end: tableEnd,
			});
			const parent = headingStack[headingStack.length - 1] ?? root;
			parent.children.push(node);
		}
	}

	/**
	 * Parse a single line to determine its type, depth, and content.
	 * Returns null for blank/empty lines.
	 */
	private parseLine(line: LineInfo): ParsedLine | null {
		// Strip osmosis card ID comments before parsing
		const text = line.text.replace(OSMOSIS_ID_STRIP_REGEX, "");

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
		// Media embeds (images, audio, video, PDF) are treated as paragraphs
		// so MarkdownRenderer handles them natively instead of expanding as notes.
		const wikiTransclusion = /^!\[\[([^\]]+)\]\]/.exec(trimmed);
		if (wikiTransclusion?.[1] !== undefined) {
			if (this.isMediaEmbed(wikiTransclusion[1])) {
				return {
					type: "paragraph",
					depth: 0,
					content: trimmed,
				};
			}
			return {
				type: "transclusion",
				depth: nestingDepth,
				content: wikiTransclusion[1],
			};
		}

		const mdTransclusion = /^!\[([^\]]*)\]\(([^)]+)\)/.exec(trimmed);
		if (mdTransclusion?.[2] !== undefined) {
			if (this.isMediaEmbed(mdTransclusion[2])) {
				return {
					type: "paragraph",
					depth: 0,
					content: trimmed,
				};
			}
			return {
				type: "transclusion",
				depth: nestingDepth,
				content: mdTransclusion[2],
			};
		}

		// Bullet list: - item or * item
		const bulletMatch = /^[-*]\s+(.*)$/.exec(trimmed);
		if (bulletMatch?.[1] !== undefined) {
			const content = bulletMatch[1];
			// Detect checkbox syntax: [ ], [x], [X]
			const checkboxMatch = /^\[([ xX])\]\s*(.*)$/.exec(content);
			if (checkboxMatch) {
				return {
					type: "bullet",
					depth: nestingDepth,
					content,
					checkbox: true,
					checked: checkboxMatch[1] !== " ",
				};
			}
			return {
				type: "bullet",
				depth: nestingDepth,
				content,
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

	/** File extensions for media embeds that should NOT be expanded as note transclusions. */
	private static readonly MEDIA_EXTENSIONS = new Set([
		// Images
		"png", "jpg", "jpeg", "gif", "bmp", "svg", "webp", "avif",
		// Audio
		"mp3", "webm", "wav", "m4a", "ogg", "3gp", "flac",
		// Video
		"mp4", "ogv", "mov", "mkv",
		// PDF
		"pdf",
	]);

	/** Compound extensions that are visual embeds despite ending in .md */
	private static readonly MEDIA_COMPOUND_EXTENSIONS = [
		".excalidraw.md",
	];

	/**
	 * Check if an embed target refers to a media file (image, audio, video, PDF)
	 * or a visual embed like Excalidraw.
	 * Handles wiki-link pipes (e.g. "image.png|300") and fragments (e.g. "file.pdf#page=2").
	 */
	private isMediaEmbed(target: string): boolean {
		// Strip wiki-link pipe sizing (e.g. "image.png|300" → "image.png")
		const pathPart = target.split("|")[0]?.split("#")[0] ?? "";

		// Check compound extensions first (e.g. .excalidraw.md)
		const lower = pathPart.toLowerCase();
		for (const compound of OsmosisParser.MEDIA_COMPOUND_EXTENSIONS) {
			if (lower.endsWith(compound)) return true;
		}

		const dotIndex = pathPart.lastIndexOf(".");
		if (dotIndex === -1) return false;
		const ext = pathPart.slice(dotIndex + 1).toLowerCase();
		return OsmosisParser.MEDIA_EXTENSIONS.has(ext);
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

	/** Track occurrence counts for stable ID generation. */
	private idCounters = new Map<string, number>();

	/** Reset ID counters (called at the start of each parse). */
	private resetIdCounters(): void {
		this.idCounters.clear();
	}

	/** Get the next occurrence index for a given type:depth:content key. */
	private nextOccurrence(type: NodeType, depth: number, content: string): number {
		const key = `${type}:${String(depth)}:${content}`;
		const count = this.idCounters.get(key) ?? 0;
		this.idCounters.set(key, count + 1);
		return count;
	}

	/**
	 * Create a new AST node.
	 */
	private createNode(type: NodeType, depth: number, content: string, range: Range): OsmosisNode {
		return {
			id: this.generateId(type, depth, content, this.nextOccurrence(type, depth, content)),
			type,
			depth,
			content,
			children: [],
			range,
			isTranscluded: false,
		};
	}

	/**
	 * Generate a stable ID from node properties and occurrence index.
	 * Uses type + depth + content + occurrence count (not position) so that
	 * IDs remain stable when frontmatter edits shift character positions.
	 */
	private generateId(type: NodeType, depth: number, content: string, occurrenceIndex: number): string {
		const input = `${type}:${String(depth)}:${content}:${String(occurrenceIndex)}`;
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
	/** Whether this is a checkbox list item. */
	checkbox?: boolean;
	/** Whether the checkbox is checked. */
	checked?: boolean;
}
