/**
 * Writing node style overrides into `osmosis-styles` frontmatter: the one
 * merge the mind map and the 3D graph's style sidebar both use, so a style set
 * in either view is stored the same way.
 *
 * Pure logic, no `obsidian` import, so it is unit-tested.
 */

import { styleMappingFor, type NodeStyle } from "./styles";

/** Style keys whose value is replaced whole (or deleted when the update sets `undefined`). */
const SIMPLE_KEYS = ["shape", "fill", "background", "width", "class"] as const;
/** Style keys whose value is a mapping: an update merges into it sub-key by sub-key. */
const COMPOUND_KEYS = ["text", "border", "branchLine"] as const;

/**
 * `existing` with `update` merged in. A key present in `update` with the value
 * `undefined` deletes it (`"key" in update`), at the top level and inside the
 * compound keys; a compound key left empty is dropped. Keys `update` does not
 * mention are kept.
 */
export function mergeStyleOverride(existing: NodeStyle, update: NodeStyle): NodeStyle {
	const merged: Record<string, unknown> = { ...existing };
	for (const key of SIMPLE_KEYS) {
		if (!(key in update)) continue;
		if (update[key] === undefined) delete merged[key];
		else merged[key] = update[key];
	}
	for (const key of COMPOUND_KEYS) {
		if (!(key in update)) continue;
		const value = update[key];
		if (value === undefined) {
			delete merged[key];
			continue;
		}
		const m: Record<string, unknown> = { ...(existing[key] as Record<string, unknown> | undefined), ...value };
		for (const k of Object.keys(m)) if (m[k] === undefined) delete m[k];
		if (Object.keys(m).length === 0) delete merged[key];
		else merged[key] = m;
	}
	return merged as NodeStyle;
}

/**
 * Merge `update` into the style stored under `selector` in `frontmatter`'s
 * `osmosis-styles.styles`. A style left under the node's `legacySelector` (its
 * stable ID, from before it was stamped a block ID) moves to `selector`, as the
 * mind map's own write migrates it. Empty entries, an empty `styles` and an
 * empty `osmosis-styles` are removed.
 */
export function writeStyleOverride(frontmatter: Record<string, unknown>, selector: string, legacySelector: string, update: NodeStyle): void {
	const mapping = styleMappingFor(frontmatter);
	const styles = (mapping["styles"] as Record<string, NodeStyle> | undefined) ?? {};
	mapping["styles"] = styles;
	let existing = styles[selector] ?? {};
	if (selector !== legacySelector && styles[legacySelector] !== undefined) {
		existing = { ...styles[legacySelector], ...existing };
		delete styles[legacySelector];
	}
	const merged = mergeStyleOverride(existing, update);
	if (Object.keys(merged).length === 0) delete styles[selector];
	else styles[selector] = merged;
	dropEmpty(frontmatter, mapping, styles);
}

/**
 * Clear `keys` (all of them when omitted) from the styles stored under each of
 * `selectors` (a node's block-ID and stable-ID selectors: either may hold its
 * style), as the mind map's Reset does.
 */
export function clearStyleOverride(frontmatter: Record<string, unknown>, selectors: readonly string[], keys?: readonly (keyof NodeStyle)[]): void {
	const mapping = styleMappingFor(frontmatter);
	const styles = (mapping["styles"] as Record<string, NodeStyle> | undefined) ?? {};
	mapping["styles"] = styles;
	for (const selector of selectors) {
		const style = styles[selector];
		if (style === undefined) continue;
		if (keys === undefined) {
			delete styles[selector];
			continue;
		}
		for (const key of keys) delete style[key];
		if (Object.keys(style).length === 0) delete styles[selector];
	}
	dropEmpty(frontmatter, mapping, styles);
}

function dropEmpty(frontmatter: Record<string, unknown>, mapping: Record<string, unknown>, styles: Record<string, NodeStyle>): void {
	if (Object.keys(styles).length === 0) delete mapping["styles"];
	if (Object.keys(mapping).length === 0) delete frontmatter["osmosis-styles"];
}

/**
 * Two style updates as one, `later` winning: what a write still waiting to go
 * out becomes when another arrives (a colour drag sends one per step). Unlike
 * {@link mergeStyleOverride}, a key set to `undefined` is kept, so the combined
 * update still deletes it.
 */
export function combineStyleUpdates(earlier: NodeStyle, later: NodeStyle): NodeStyle {
	const combined: Record<string, unknown> = { ...earlier, ...later };
	for (const key of COMPOUND_KEYS) {
		const a = earlier[key];
		const b = later[key];
		if (key in later && a !== undefined && b !== undefined) combined[key] = { ...a, ...b };
	}
	return combined as NodeStyle;
}
