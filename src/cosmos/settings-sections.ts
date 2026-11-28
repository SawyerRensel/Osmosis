/**
 * Cosmos's Settings, as the style sidebar shows them: which sections,
 * in what order, which control sits in which, and which controls a layout
 * shows. The panel (`CosmosSettingsPanel`) renders exactly this tree, and the
 * test checks every `CosmosOverlays` setting has a place in it.
 *
 * Pure logic, no `obsidian` import, so it is unit-tested.
 */

import { OVERLAY_EDGE_KINDS, type CosmosOverlays, type OverlayEdgeKind } from "./overlays";

export type SettingsSectionId = "layout" | "show" | "edges" | "camera" | "look";

/**
 * One control: a `CosmosOverlays` key (an edge toggle as `edge:<kind>`), or a
 * setting kept elsewhere: the view's Depth and Backlinks, and the per-device
 * Click selects only, Panel detail and Live panels.
 */
export type SettingsControl =
	| Exclude<keyof CosmosOverlays, "edges">
	| `edge:${OverlayEdgeKind}`
	| "depth"
	| "backlinks"
	| "clickSelectsOnly"
	| "panelDetail"
	| "livePanels";

export interface SettingsSection {
	id: SettingsSectionId;
	name: string;
	controls: readonly SettingsControl[];
}

/** The sections, top to bottom. Layout comes first, with its own controls straight under it. */
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
	{
		id: "layout",
		name: "Layout & spacing",
		controls: ["layout", "continentSpacing", "continentDirection", "continentBalance", "coreLayers", "forceBalance", "noteSpacing", "nodeSpacing", "linksPull"],
	},
	{ id: "show", name: "Show", controls: ["depth", "backlinks", "colorBy"] },
	{ id: "edges", name: "Edges", controls: [...OVERLAY_EDGE_KINDS.map((kind): SettingsControl => `edge:${kind}`), "taper", "taperStrength"] },
	{ id: "camera", name: "Camera", controls: ["travelSpeed", "clickSelectsOnly"] },
	{ id: "look", name: "Look", controls: ["mist", "particles", "labels", "panelDetail", "livePanels"] },
];

const SECTION_IDS: ReadonlySet<string> = new Set(SETTINGS_SECTIONS.map((section) => section.id));

/**
 * Whether `control` shows with these settings: a layout's own controls show
 * only in that layout (the continent controls in Planets, Balance only when
 * the direction has sides). Hidden controls keep their values.
 */
export function controlShown(control: SettingsControl, overlays: Pick<CosmosOverlays, "layout" | "continentDirection">): boolean {
	switch (control) {
		case "continentSpacing":
		case "continentDirection":
		case "coreLayers":
			return overlays.layout === "planets";
		case "continentBalance":
			return overlays.layout === "planets" && overlays.continentDirection !== "radial";
		default:
			return true;
	}
}

/** The collapsed sections as stored: known section IDs only, each once (anything else in data.json is dropped). */
export function normalizeCollapsed(raw: unknown): SettingsSectionId[] {
	if (!Array.isArray(raw)) return [];
	const ids = raw.filter((id): id is SettingsSectionId => typeof id === "string" && SECTION_IDS.has(id));
	return [...new Set(ids)];
}

/** `collapsed` with section `id` collapsed or opened. */
export function toggleCollapsed(collapsed: readonly SettingsSectionId[], id: SettingsSectionId, collapse: boolean): SettingsSectionId[] {
	const rest = collapsed.filter((other) => other !== id);
	return collapse ? [...rest, id] : rest;
}
