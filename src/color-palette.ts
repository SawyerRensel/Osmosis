/**
 * Pure color helpers for the style sidebar's color picker: the theme palette
 * a map's active theme contributes, and the hex form every pick is written as.
 * Kept free of `obsidian` and Pickr so Vitest can import it.
 */

import type { ThemeDefinition, NodeStyle, BorderStyle, TextStyle, BranchStyle } from "./styles";

// ─── Theme Color Extraction ────────────────────────────────────────────────

/** Extract all unique colors from a ThemeDefinition for the theme palette. */
export function extractThemeColors(theme: ThemeDefinition | undefined): string[] {
	if (!theme) return [];

	const colors = new Set<string>();

	function addNodeColors(style: NodeStyle | undefined): void {
		if (!style) return;
		if (style.fill) colors.add(style.fill);
		if (style.background) colors.add(style.background);
		addBorderColors(style.border);
		addTextColors(style.text);
		addBranchColors(style.branchLine);
	}

	function addBorderColors(border: BorderStyle | undefined): void {
		if (border?.color) colors.add(border.color);
	}

	function addTextColors(text: TextStyle | undefined): void {
		if (text?.color) colors.add(text.color);
	}

	function addBranchColors(branch: BranchStyle | undefined): void {
		if (branch?.color) colors.add(branch.color);
	}

	// Base style
	addNodeColors(theme.base);

	// Depth styles
	for (const depth of Object.values(theme.depths)) {
		addNodeColors(depth);
	}

	// Branch line
	addBranchColors(theme.branchLine);

	// Background
	if (theme.background) colors.add(theme.background);

	// Branch colors palette
	if (theme.branchColors) {
		for (const c of theme.branchColors) {
			colors.add(c);
		}
	}

	return [...colors];
}

// ─── Hex Output ─────────────────────────────────────────────────────────────

/**
 * Format RGB channels (0–255, fractional allowed) as a lowercase `#rrggbb`
 * string — the form the map stores. Pickr reports channels as floats.
 */
export function rgbToHex(r: number, g: number, b: number): string {
	const channel = (c: number) =>
		Math.round(Math.min(255, Math.max(0, c)))
			.toString(16)
			.padStart(2, "0");
	return `#${channel(r)}${channel(g)}${channel(b)}`;
}
