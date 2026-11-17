/**
 * Writing a node's `width` style from the 3D graph's width handle, into the
 * `osmosis-styles` frontmatter the mind map reads and writes: the same
 * `styles` entry, under the same selector (`planStyleKeys`), so the width shows
 * in both views.
 *
 * Pure logic, no `obsidian` import, so it is unit-tested.
 */

import { styleMappingFor, type NodeStyle } from "../styles";

/**
 * Set `width` on the style stored under `selector` (a block ID, `^os-…`, or the
 * `_n:` stable ID), keeping the rest of that style. A style left under the
 * node's `legacySelector` (its stable ID, from before it was stamped a block
 * ID) moves to `selector`, as the mind map's own write migrates it.
 */
export function writeWidthStyle(frontmatter: Record<string, unknown>, selector: string, legacySelector: string, width: number): void {
	const mapping = styleMappingFor(frontmatter);
	const styles = (mapping["styles"] as Record<string, NodeStyle> | undefined) ?? {};
	mapping["styles"] = styles;
	let existing = styles[selector] ?? {};
	if (selector !== legacySelector && styles[legacySelector] !== undefined) {
		existing = { ...styles[legacySelector], ...existing };
		delete styles[legacySelector];
	}
	styles[selector] = { ...existing, width };
}
