import type { NodeStyle } from "./styles";
import type { OsmosisNode } from "./types";
import { collectBlockIds, childInsertOffset, inferChildContext, insertBlock, reindentSubtree, stripBlockIds } from "./mindmap-edit";

/**
 * One copied subtree: its source text, plus enough of the original node for
 * `reindentSubtree` to re-serialize the first line at a new type/depth. The
 * node itself is not kept — after a *cut* it no longer exists by paste time.
 */
export interface ClipboardItem {
	type: OsmosisNode["type"];
	depth: number;
	content: string;
	blockId?: string;
	text: string;
}

/** The slice of a node `clipboardItem` needs, so the views can hand it a parsed line. */
export type CopiedLine = Pick<OsmosisNode, "type" | "depth" | "content" | "blockId">;

/**
 * The internal clipboard: one per plugin session, shared by the mind map and
 * Cosmos, so a subtree copied in one view pastes in the other (and in
 * another map of the same view). The system clipboard gets plain text too, for
 * external paste, but only this carries identity and per-item shape.
 */
export interface NodeClipboard {
	/** One record per copied subtree. Paste promotes each *top-level* item to a direct child of the target on its own terms. */
	items: ClipboardItem[];
	/** The items' text joined, null before anything was copied. */
	text: string | null;
	isCut: boolean;
	/** Containing file of the copied nodes: null when they spanned more than one, where there is no single origin for identity to move from. */
	sourcePath: string | null;
	/** Block IDs carried by {@link text}. */
	blockIds: Set<string>;
	/** The origin's `osmosis-schedule` entries for those block IDs, captured at cut time (a cut deletes at once, so by paste time the line is gone). */
	schedules: Record<string, unknown>;
	/** Copy-style clipboard: the source's local style (without its class), and its class name. */
	style: NodeStyle | null;
	styleClassName: string | null;
}

export const nodeClipboard: NodeClipboard = {
	items: [],
	text: null,
	isCut: false,
	sourcePath: null,
	blockIds: new Set(),
	schedules: {},
	style: null,
	styleClassName: null,
};

/** One clipboard record for a copied line, whose own text is `text` (its subtree's bytes). */
export function clipboardItem(line: CopiedLine, text: string): ClipboardItem {
	return { type: line.type, depth: line.depth, content: line.content, blockId: line.blockId, text };
}

/** Put `items` on the internal clipboard, replacing what it held (the style clipboard is separate and kept). */
export function fillClipboard(items: ClipboardItem[], isCut: boolean, sourcePath: string | null): void {
	nodeClipboard.items = items;
	nodeClipboard.text = items.map((item) => item.text).join("\n");
	nodeClipboard.isCut = isCut;
	nodeClipboard.sourcePath = sourcePath;
	nodeClipboard.blockIds = collectBlockIds(nodeClipboard.text);
	nodeClipboard.schedules = {};
}

/** A cut's identity lands exactly once: pasting the same clipboard again duplicates the line, so it takes the copy path and gets fresh IDs. */
export function spendCut(): void {
	nodeClipboard.isCut = false;
	nodeClipboard.schedules = {};
}

/**
 * Splice the clipboard into `content` as the last direct child of `target`.
 *
 * Each copied item is re-levelled *independently* against the target: taking
 * the delta from the target's own depth would indent a bullet pasted onto
 * `## Heading` into whatever list came before, and a single delta for a mixed
 * clipboard lands one of its items wrong. A copy (as opposed to a cut) is a
 * new line, so its block IDs are stripped and Osmosis mints fresh ones.
 */
export function pasteInto(content: string, target: OsmosisNode): string {
	// Not `subtreeEnd`: for a heading that is the end of its *last sub-heading's* content, which markdown reads as a child of that sub-heading.
	const at = childInsertOffset(target);
	let text = nodeClipboard.items
		.map((item) => {
			const context = inferChildContext(target, item);
			return reindentSubtree(item.text, item, context.type, context.depth);
		})
		.join("\n");
	// Text from outside Osmosis (no source path) pastes exactly as it came.
	if (nodeClipboard.sourcePath !== null && !nodeClipboard.isCut) text = stripBlockIds(text);
	return insertBlock(content, at, text);
}

/** A cut that lands in another note than it left carries its block IDs' review history with it. */
export function pasteMigrates(destPath: string): boolean {
	return nodeClipboard.sourcePath !== null && nodeClipboard.isCut && nodeClipboard.sourcePath !== destPath && nodeClipboard.blockIds.size > 0;
}

/** Remember `local` (a node's own style) for Paste style; its class travels by name, apart from the visual keys. */
export function copyStyleOf(local: NodeStyle): void {
	const cloned = structuredClone(local);
	nodeClipboard.styleClassName = cloned.class ?? null;
	delete cloned.class;
	nodeClipboard.style = cloned;
}

/** The visual keys a style paste replaces (a key the copied style lacks is cleared on the target). */
const PASTED_KEYS: (keyof NodeStyle)[] = ["shape", "fill", "border", "text", "branchLine", "background", "width"];

/**
 * The overrides that paste the copied style onto `ids`: the target's overrides
 * are replaced entirely, so a key absent from the clipboard is set to
 * `undefined` (which clears it). Null when no style was copied.
 */
export function stylePasteOverrides(ids: Iterable<string>): Map<string, NodeStyle> | null {
	const style = nodeClipboard.style;
	if (style === null) return null;
	const overrides = new Map<string, NodeStyle>();
	for (const id of ids) {
		const full: Record<string, unknown> = { class: nodeClipboard.styleClassName ?? undefined };
		for (const key of PASTED_KEYS) full[key] = key in style ? structuredClone(style[key]) : undefined;
		overrides.set(id, full as NodeStyle);
	}
	return overrides;
}
