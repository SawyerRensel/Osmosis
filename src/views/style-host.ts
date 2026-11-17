import type { NodeStyle, OsmosisStyleFrontmatter, ThemeDefinition } from "../styles";

/** A node's style inputs, as the style sidebar's Node tab reads them. */
export interface NodeStyleContext {
	/** The `osmosis-styles` of the node's note (classes, variants and the per-node styles). */
	fm: OsmosisStyleFrontmatter | undefined;
	/** The node's own (Local) style override. */
	local: NodeStyle | undefined;
	/** A heading's level, for the theme's depth styles; undefined for any other line. */
	depth: number | undefined;
}

/**
 * A view whose selected nodes the style sidebar's Node tab styles: the mind
 * map, or the 3D graph. Both write the same `osmosis-styles` entries, so a
 * style set in one shows in the other (one styling system for 2D and 3D).
 */
export interface NodeStyleHost {
	getSelectedNodeInfo(): { nodeIds: string[]; primaryId: string | null };
	getNodeStyleContext(id: string): NodeStyleContext | null;
	getActiveTheme(): ThemeDefinition | undefined;
	getGlobalClasses(): Record<string, NodeStyle>;
	applyNodeStyleOverrides(overrides: Map<string, NodeStyle>): Promise<void>;
	resetNodeStyles(nodeIds: string[], keys?: (keyof NodeStyle)[]): Promise<void>;
	/** Bracket a colour drag: its writes are one undo step. */
	beginLiveEdit(): void;
	endLiveEdit(): void;
	onSelectionChange(fn: () => void): void;
	offSelectionChange(fn: () => void): void;
	undo(): void;
	redo(): void;
}
