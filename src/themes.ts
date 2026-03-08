/**
 * Preset theme definitions for Osmosis mind maps.
 *
 * Each theme defines base node styles and per-depth-level overrides.
 * Themes use hex colors so they work independently of Obsidian CSS variables,
 * ensuring consistent appearance regardless of the user's Obsidian theme.
 *
 * Font sizes are NOT set by themes — heading-level typography is handled
 * by CSS (data-depth selectors in styles.css, from Task 4.0). Themes only
 * control colors, fills, borders, and font weights.
 *
 * Design principles for good themes:
 *  - Node fills must contrast clearly against the background (≥3:1 luminance diff)
 *  - Branch lines must be visible against the background (use accent or mid-tone colors)
 *  - Depth-level fills should be visually distinct from each other
 *  - Light themes must set light backgrounds AND light node fills
 *
 * The "Default" theme is special: it uses no inline styles, falling back
 * to CSS classes (which respect the user's Obsidian theme).
 */

import type { ThemeDefinition } from "./styles";

// ─── Preset Themes ──────────────────────────────────────────────────────────

/** Default theme — no inline styles, CSS classes handle everything. */
const defaultTheme: ThemeDefinition = {
	name: "Default",
	base: {},
	depths: {},
};

const ocean: ThemeDefinition = {
	name: "Ocean",
	base: {
		fill: "#1e3a5f",
		border: { color: "#3a6ea5", width: 1, style: "solid" },
		text: { color: "#d6e4f0", weight: 400 },
	},
	depths: {
		"1": { fill: "#1a4f8a", text: { weight: 700, color: "#ffffff" } },
		"2": { fill: "#1e5c99", text: { weight: 650, color: "#e8f0f8" } },
		"3": { fill: "#236aa8", text: { weight: 600, color: "#d6e4f0" } },
	},
	branchLine: { color: "#5a9fd4", thickness: 1.5 },
	background: "#0d1b2a",
	collapseToggle: { fill: "#1a4f8a", stroke: "#5a9fd4", icon: "#a8d0f0" },
};

const solarizedDark: ThemeDefinition = {
	name: "Solarized Dark",
	base: {
		fill: "#073642",
		border: { color: "#2aa198", width: 1, style: "solid" },
		text: { color: "#93a1a1", weight: 400 },
	},
	depths: {
		"1": { fill: "#0b4f5a", text: { weight: 700, color: "#fdf6e3" } },
		"2": { fill: "#094450", text: { weight: 650, color: "#eee8d5" } },
		"3": { fill: "#073d48", text: { weight: 600, color: "#b5c4c4" } },
	},
	branchLine: { color: "#2aa198", thickness: 1.5 },
	background: "#002b36",
	collapseToggle: { fill: "#073642", stroke: "#2aa198", icon: "#93a1a1" },
};

const solarizedLight: ThemeDefinition = {
	name: "Solarized Light",
	base: {
		fill: "#fdf6e3",
		border: { color: "#93a1a1", width: 1, style: "solid" },
		text: { color: "#586e75", weight: 400 },
	},
	depths: {
		"1": { fill: "#ffffff", text: { weight: 700, color: "#073642" } },
		"2": { fill: "#fdf6e3", text: { weight: 650, color: "#586e75" } },
		"3": { fill: "#eee8d5", text: { weight: 600, color: "#657b83" } },
	},
	branchLine: { color: "#268bd2", thickness: 1.5 },
	background: "#eee8d5",
	collapseToggle: { fill: "#fdf6e3", stroke: "#268bd2", icon: "#586e75" },
};

const nord: ThemeDefinition = {
	name: "Nord",
	base: {
		fill: "#3b4252",
		border: { color: "#81a1c1", width: 1, style: "solid" },
		text: { color: "#eceff4", weight: 400 },
	},
	depths: {
		"1": { fill: "#434c5e", text: { weight: 700, color: "#eceff4" } },
		"2": { fill: "#3b4252", text: { weight: 650, color: "#e5e9f0" } },
		"3": { fill: "#4c566a", text: { weight: 600, color: "#d8dee9" } },
	},
	branchLine: { color: "#88c0d0", thickness: 1.5 },
	background: "#2e3440",
	collapseToggle: { fill: "#3b4252", stroke: "#88c0d0", icon: "#d8dee9" },
};

const dracula: ThemeDefinition = {
	name: "Dracula",
	base: {
		fill: "#44475a",
		border: { color: "#bd93f9", width: 1, style: "solid" },
		text: { color: "#f8f8f2", weight: 400 },
	},
	depths: {
		"1": { fill: "#4d3d6e", text: { weight: 700, color: "#f8f8f2" } },
		"2": { fill: "#44475a", text: { weight: 650, color: "#f8f8f2" } },
		"3": { fill: "#515470", text: { weight: 600, color: "#e0dff0" } },
	},
	branchLine: { color: "#bd93f9", thickness: 1.5 },
	background: "#282a36",
	collapseToggle: { fill: "#44475a", stroke: "#ff79c6", icon: "#f8f8f2" },
};

const monokai: ThemeDefinition = {
	name: "Monokai",
	base: {
		fill: "#3e3d32",
		border: { color: "#a6e22e", width: 1, style: "solid" },
		text: { color: "#f8f8f2", weight: 400 },
	},
	depths: {
		"1": { fill: "#49483e", text: { weight: 700, color: "#f8f8f2" } },
		"2": { fill: "#3e3d32", text: { weight: 650, color: "#f8f8f2" } },
		"3": { fill: "#4a4940", text: { weight: 600, color: "#e6db74" } },
	},
	branchLine: { color: "#a6e22e", thickness: 1.5 },
	background: "#1e1f1c",
	collapseToggle: { fill: "#3e3d32", stroke: "#f92672", icon: "#f8f8f2" },
};

const gruvboxDark: ThemeDefinition = {
	name: "Gruvbox Dark",
	base: {
		fill: "#3c3836",
		border: { color: "#d79921", width: 1, style: "solid" },
		text: { color: "#ebdbb2", weight: 400 },
	},
	depths: {
		"1": { fill: "#504945", text: { weight: 700, color: "#fbf1c7" } },
		"2": { fill: "#3c3836", text: { weight: 650, color: "#ebdbb2" } },
		"3": { fill: "#4a4540", text: { weight: 600, color: "#d5c4a1" } },
	},
	branchLine: { color: "#d79921", thickness: 1.5 },
	background: "#1d2021",
	collapseToggle: { fill: "#3c3836", stroke: "#fb4934", icon: "#ebdbb2" },
};

const catppuccinMocha: ThemeDefinition = {
	name: "Catppuccin Mocha",
	base: {
		fill: "#313244",
		border: { color: "#cba6f7", width: 1, style: "solid" },
		text: { color: "#cdd6f4", weight: 400 },
	},
	depths: {
		"1": { fill: "#3b3c52", text: { weight: 700, color: "#cdd6f4" } },
		"2": { fill: "#313244", text: { weight: 650, color: "#bac2de" } },
		"3": { fill: "#45475a", text: { weight: 600, color: "#a6adc8" } },
	},
	branchLine: { color: "#cba6f7", thickness: 1.5 },
	background: "#1e1e2e",
	collapseToggle: { fill: "#313244", stroke: "#f5c2e7", icon: "#cdd6f4" },
};

const tokyoNight: ThemeDefinition = {
	name: "Tokyo Night",
	base: {
		fill: "#24283b",
		border: { color: "#7aa2f7", width: 1, style: "solid" },
		text: { color: "#c0caf5", weight: 400 },
	},
	depths: {
		"1": { fill: "#2a2f4a", text: { weight: 700, color: "#c0caf5" } },
		"2": { fill: "#24283b", text: { weight: 650, color: "#a9b1d6" } },
		"3": { fill: "#343a55", text: { weight: 600, color: "#9aa5ce" } },
	},
	branchLine: { color: "#7aa2f7", thickness: 1.5 },
	background: "#1a1b26",
	collapseToggle: { fill: "#24283b", stroke: "#bb9af7", icon: "#c0caf5" },
};

const rosePine: ThemeDefinition = {
	name: "Rose Pine",
	base: {
		fill: "#26233a",
		border: { color: "#c4a7e7", width: 1, style: "solid" },
		text: { color: "#e0def4", weight: 400 },
	},
	depths: {
		"1": { fill: "#2e2b44", text: { weight: 700, color: "#e0def4" } },
		"2": { fill: "#26233a", text: { weight: 650, color: "#e0def4" } },
		"3": { fill: "#312e48", text: { weight: 600, color: "#908caa" } },
	},
	branchLine: { color: "#c4a7e7", thickness: 1.5 },
	background: "#191724",
	collapseToggle: { fill: "#26233a", stroke: "#ebbcba", icon: "#e0def4" },
};

const everforest: ThemeDefinition = {
	name: "Everforest",
	base: {
		fill: "#374145",
		border: { color: "#a7c080", width: 1, style: "solid" },
		text: { color: "#d3c6aa", weight: 400 },
	},
	depths: {
		"1": { fill: "#414b50", text: { weight: 700, color: "#d3c6aa" } },
		"2": { fill: "#374145", text: { weight: 650, color: "#d3c6aa" } },
		"3": { fill: "#4a555b", text: { weight: 600, color: "#a7c080" } },
	},
	branchLine: { color: "#a7c080", thickness: 1.5 },
	background: "#272e33",
	collapseToggle: { fill: "#374145", stroke: "#dbbc7f", icon: "#d3c6aa" },
};

const oneLight: ThemeDefinition = {
	name: "One Light",
	base: {
		fill: "#ffffff",
		border: { color: "#d0d0d0", width: 1, style: "solid" },
		text: { color: "#383a42", weight: 400 },
	},
	depths: {
		"1": { fill: "#ffffff", text: { weight: 700, color: "#383a42" } },
		"2": { fill: "#f5f5f6", text: { weight: 650, color: "#383a42" } },
		"3": { fill: "#eaeaeb", text: { weight: 600, color: "#4078f2" } },
	},
	branchLine: { color: "#4078f2", thickness: 1.5 },
	background: "#e8e8e8",
	collapseToggle: { fill: "#ffffff", stroke: "#a626a4", icon: "#383a42" },
};

// ─── Theme Registry ─────────────────────────────────────────────────────────

const PRESET_THEMES: ThemeDefinition[] = [
	defaultTheme,
	ocean,
	solarizedDark,
	solarizedLight,
	nord,
	dracula,
	monokai,
	gruvboxDark,
	catppuccinMocha,
	tokyoNight,
	rosePine,
	everforest,
	oneLight,
];

const themeMap = new Map<string, ThemeDefinition>();
for (const theme of PRESET_THEMES) {
	themeMap.set(theme.name, theme);
}

/** Get a theme by name. Returns undefined if not found. */
export function getTheme(name: string): ThemeDefinition | undefined {
	return themeMap.get(name);
}

/** Get the default theme. */
export function getDefaultTheme(): ThemeDefinition {
	return defaultTheme;
}

/** Get all available theme names, in display order. */
export function getThemeNames(): string[] {
	return PRESET_THEMES.map((t) => t.name);
}

/** Check if a theme name is the special "Default" (CSS-only) theme. */
export function isDefaultTheme(name: string): boolean {
	return name === "Default";
}
