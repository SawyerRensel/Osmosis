import { Platform, setIcon, type Setting, type SliderComponent, type ToggleComponent } from "obsidian";
import {
	DETAIL_LIMIT,
	NEAR_BUDGET_RANGE,
	NEAR_ENTER_SCALE,
	detailFromSlider,
	enterScaleFromDetail,
	sliderFromDetail,
	type NearTierSettings,
} from "../cosmos/lod";
import {
	MIST_LIMIT,
	SPACING_MAX,
	SPACING_MIN,
	TRAVEL_LIMIT,
	mistFromSlider,
	sliderFromMist,
	sliderFromTravel,
	travelFromSlider,
	type ColorMode,
	type CosmosOverlays,
	type LabelMode,
	type LayoutMode,
	type OverlayEdgeKind,
} from "../cosmos/overlays";
import { flatDepth, flatWeight } from "../cosmos/flatten";
import { MAX_CORE_LAYERS, type ContinentBalance, type ContinentDirection } from "../cosmos/planets";
import { SETTINGS_SECTIONS, controlShown, toggleCollapsed, type SettingsControl, type SettingsSectionId } from "../cosmos/settings-sections";
import { TAPER_STRENGTH_MAX, TAPER_STRENGTH_MIN } from "../cosmos/taper";
import { sidebarSetting } from "./sidebar-setting";

const COLOR_MODES: Record<ColorMode, string> = {
	note: "Note",
	memory: "Memory strength",
	tag: "Tag",
	type: "Node type",
};

const EDGE_NAMES: Record<OverlayEdgeKind, string> = {
	hierarchy: "Hierarchy",
	link: "Links",
	embed: "Embeds",
	property: "Properties",
	tag: "Tags",
	attachment: "Attachments",
	unresolved: "Unresolved links",
};

const LAYOUT_MODES: Record<LayoutMode, string> = {
	organic: "Organic",
	flat: "Flat slices",
	planets: "Planets",
};

const CONTINENT_DIRECTION_NAMES: Record<ContinentDirection, string> = {
	"left-right": "Left to right",
	"top-down": "Top down",
	radial: "Radial",
};

const CONTINENT_BALANCE_NAMES: Record<ContinentBalance, string> = {
	"one-side": "One side",
	"both-sides": "Both sides",
	alternating: "Alternating",
};

const LABEL_MODES: Record<LabelMode, string> = {
	all: "Plates and panels",
	plates: "Plates only",
	none: "Hidden",
};

/** The loaded area's depth and backlinks: they live in the view's state, so the panel only shows and sends them. */
export interface GraphReach {
	depth: number;
	backlinks: boolean;
}

/** A per-device toggle the panel shows and sets but does not store (the view keeps it in local storage). */
export interface DeviceToggle {
	get: () => boolean;
	set: (on: boolean) => void;
}

/** The near tier's per-device settings the panel shows and sets but does not store (the view keeps them in local storage and applies them live). */
export interface NearTierControl {
	get: () => NearTierSettings;
	set: (patch: Partial<NearTierSettings>) => void;
}

/** What Cosmos hands the style sidebar's Settings panel: its settings, and where changes go. The panel never saves. */
export interface CosmosSettingsSource {
	overlays: () => CosmosOverlays;
	/** Every change goes out whole (the plugin saves it and every open Cosmos shows it). */
	setOverlays: (overlays: CosmosOverlays) => void;
	reach: () => GraphReach;
	setReach: (reach: GraphReach) => void;
	maxDepth: number;
	clickSelectsOnly: DeviceToggle;
	nearTier: NearTierControl;
}

/** Where the panel keeps its sections' open/closed state (per vault, in data.json). */
export interface CollapseStore {
	get: () => readonly SettingsSectionId[];
	set: (collapsed: SettingsSectionId[]) => void;
}

/**
 * Cosmos's Settings, in the style sidebar (it replaced the viewport's
 * Overlays popover): the sections of `SETTINGS_SECTIONS`, collapsible like the
 * Node tab's, their open/closed state remembered. A layout's own controls show
 * only in that layout (`controlShown`).
 */
export class CosmosSettingsPanel {
	/** The settings as this panel last showed or sent them. */
	private current: CosmosOverlays;
	private reach: GraphReach;
	private readonly rows = new Map<SettingsControl, Setting>();
	private depthSlider: SliderComponent | null = null;
	private backlinksToggle: ToggleComponent | null = null;

	constructor(
		private readonly el: HTMLElement,
		private readonly source: CosmosSettingsSource,
		private readonly collapse: CollapseStore,
	) {
		this.current = source.overlays();
		this.reach = source.reach();
		this.build();
	}

	/**
	 * Show settings changed elsewhere (Cosmos, or a restored layout).
	 * Settings this panel sent itself are left alone: rebuilding would end a
	 * slider drag.
	 */
	refresh(): void {
		const overlays = this.source.overlays();
		const reach = this.source.reach();
		if (reach.depth !== this.reach.depth || reach.backlinks !== this.reach.backlinks) {
			this.reach = reach;
			this.depthSlider?.setValue(reach.depth);
			this.backlinksToggle?.setValue(reach.backlinks);
		}
		if (overlays === this.current) return;
		this.current = overlays;
		this.build();
	}

	private change(patch: Partial<CosmosOverlays>): void {
		this.current = { ...this.current, ...patch };
		this.source.setOverlays(this.current);
		this.showControls();
	}

	/** Show only the controls the current settings call for. */
	private showControls(): void {
		for (const [control, row] of this.rows) row.settingEl.toggle(controlShown(control, this.current));
	}

	private build(): void {
		this.el.empty();
		this.rows.clear();
		this.depthSlider = null;
		this.backlinksToggle = null;
		const collapsed = new Set(this.collapse.get());
		for (const section of SETTINGS_SECTIONS) {
			const sectionEl = this.el.createDiv({ cls: "osmosis-format-section osmosis-cosmos-settings-section" });
			sectionEl.toggleClass("is-collapsed", collapsed.has(section.id));
			const header = sectionEl.createDiv({ cls: "osmosis-format-section-header" });
			setIcon(header.createSpan({ cls: "osmosis-chevron-icon" }), "chevron-right");
			header.createSpan({ text: section.name });
			header.addEventListener("click", () => {
				const collapse = !sectionEl.hasClass("is-collapsed");
				sectionEl.toggleClass("is-collapsed", collapse);
				this.collapse.set(toggleCollapsed(this.collapse.get(), section.id, collapse));
			});
			const body = sectionEl.createDiv({ cls: "osmosis-format-section-body" });
			for (const control of section.controls) this.rows.set(control, this.control(control, body));
		}
		this.showControls();
	}

	/** One control's row, in `body`. */
	private control(control: SettingsControl, body: HTMLElement): Setting {
		const overlays = this.current;
		const row = sidebarSetting(body);
		if (control.startsWith("edge:")) {
			const kind = control.slice("edge:".length) as OverlayEdgeKind;
			return row.setName(EDGE_NAMES[kind]).addToggle((toggle) =>
				toggle.setValue(overlays.edges[kind]).onChange((value) => this.change({ edges: { ...this.current.edges, [kind]: value } })),
			);
		}
		switch (control as Exclude<SettingsControl, `edge:${string}`>) {
			case "depth":
				row.setName("Depth").setDesc(depthLabel(this.reach.depth));
				return row.addSlider((slider) => {
					this.depthSlider = slider;
					slider
						.setLimits(0, this.source.maxDepth, 1)
						.setValue(this.reach.depth)
						.onChange((value) => {
							row.setDesc(depthLabel(value));
							this.reach = { ...this.reach, depth: value };
							this.source.setReach(this.reach);
						});
				});
			case "backlinks":
				return row
					.setName("Backlinks")
					.setDesc("Count notes that link to a loaded note as hops, not only the notes it links to.")
					.addToggle((toggle) => {
						this.backlinksToggle = toggle;
						toggle.setValue(this.reach.backlinks).onChange((value) => {
							this.reach = { ...this.reach, backlinks: value };
							this.source.setReach(this.reach);
						});
					});
			case "colorBy":
				return row.setName("Color by").addDropdown((dropdown) =>
					dropdown
						.addOptions(COLOR_MODES)
						.setValue(overlays.colorBy)
						.onChange((value) => this.change({ colorBy: value as ColorMode })),
				);
			case "layout":
				return row
					.setName("Layout")
					.setDesc("Organic lets forces shape each note, flat slices lay branches out like the mind map, and planets put each note on a globe. Changing it lays everything out again.")
					.addDropdown((dropdown) =>
						dropdown
							.addOptions(LAYOUT_MODES)
							.setValue(overlays.layout)
							.onChange((value) => this.change({ layout: value as LayoutMode })),
					);
			case "flatten":
				row.setName("Flatten branches").setDesc(flattenLabel(overlays.flatten));
				return row.addSlider((slider) =>
					slider
						// Continuous: lines at the boundary depth are pulled part-way into their slice.
						.setLimits(0, 1, 0.01)
						.setValue(overlays.flatten)
						// Sent on every step of a drag, so the graph re-settles live (see CosmosScene.reshape).
						.setInstant(true)
						.onChange((value) => {
							row.setDesc(flattenLabel(value));
							this.change({ flatten: value });
						}),
				);
			case "continentSpacing":
				return this.spacing(row, "Continent spacing", "continents on a planet", "continentSpacing");
			case "continentDirection":
				return row
					.setName("Continent direction")
					.setDesc("How each continent is laid out on a planet.")
					.addDropdown((dropdown) =>
						dropdown
							.addOptions(CONTINENT_DIRECTION_NAMES)
							.setValue(overlays.continentDirection)
							.onChange((value) => this.change({ continentDirection: value as ContinentDirection })),
					);
			case "continentBalance":
				return row
					.setName("Continent balance")
					.setDesc("Which sides a continent's branches take. Radial fills the circle, so it has none.")
					.addDropdown((dropdown) =>
						dropdown
							.addOptions(CONTINENT_BALANCE_NAMES)
							.setValue(overlays.continentBalance)
							.onChange((value) => this.change({ continentBalance: value as ContinentBalance })),
					);
			case "coreLayers":
				row.setName("Core layers").setDesc(coreLayersLabel(overlays.coreLayers));
				return row.addSlider((slider) =>
					slider
						.setLimits(1, MAX_CORE_LAYERS, 1)
						.setValue(overlays.coreLayers)
						// Sent on every step of a drag, so plates glide to their new shells live.
						.setInstant(true)
						.onChange((value) => {
							row.setDesc(coreLayersLabel(value));
							this.change({ coreLayers: value });
						}),
				);
			case "forceBalance":
				return row
					.setName("Hierarchy ⟷ organic")
					.setDesc("Left keeps each note's mind-map shape; right lets links shape the web. Moving it re-settles the loaded notes as you drag.")
					.addSlider((slider) =>
						slider
							.setLimits(0, 1, 0.05)
							.setValue(overlays.forceBalance)
							// Sent on every step of a drag, so the graph re-settles live (see CosmosScene.reshape).
							.setInstant(true)
							.onChange((value) => this.change({ forceBalance: value })),
					);
			case "noteSpacing":
				return this.spacing(row, "Note spacing", "notes and tags", "noteSpacing");
			case "nodeSpacing":
				return this.spacing(row, "Node spacing", "nodes within a note", "nodeSpacing");
			case "linksPull":
				return row
					.setName("Links pull")
					.setDesc("Off, links between plates still draw but pull nothing, so notes settle by their own shape. Toggling it re-settles the loaded notes.")
					.addToggle((toggle) => toggle.setValue(overlays.linksPull).onChange((value) => this.change({ linksPull: value })));
			case "travelSpeed":
				row.setName("Travel speed").setDesc(travelLabel(overlays.travelSpeed));
				return row.addSlider((slider) => {
					const limit = Math.log2(TRAVEL_LIMIT);
					slider
						.setLimits(-limit, limit, 0.25)
						.setValue(sliderFromTravel(overlays.travelSpeed))
						.onChange((value) => {
							row.setDesc(travelLabel(travelFromSlider(value)));
							this.change({ travelSpeed: travelFromSlider(value) });
						});
				});
			case "clickSelectsOnly":
				return row
					.setName("Click selects only")
					.setDesc("A click on a plate selects it without flying there or adding a back step. Arrow keys, search and links still move the camera. Kept on this device.")
					.addToggle((toggle) => toggle.setValue(this.source.clickSelectsOnly.get()).onChange((value) => this.source.clickSelectsOnly.set(value)));
			case "mist":
				row.setName("Mist density").setDesc(mistLabel(overlays.mist));
				return row.addSlider((slider) => {
					const limit = Math.log2(MIST_LIMIT);
					slider
						.setLimits(-limit, limit, 0.25)
						.setValue(sliderFromMist(overlays.mist))
						.onChange((value) => {
							row.setDesc(mistLabel(mistFromSlider(value)));
							this.change({ mist: mistFromSlider(value) });
						});
				});
			case "particles":
				return row
					.setName("Link particles")
					.setDesc("A particle runs along each edge, from source to target.")
					.addToggle((toggle) => toggle.setValue(overlays.particles).onChange((value) => this.change({ particles: value })));
			case "taper":
				return row
					.setName("Tapered branches")
					.setDesc("Outline edges are thick at each note's root and thin toward its leaves. A node's branch line style overrides it. Off, every edge is a thin line.")
					.addToggle((toggle) => toggle.setValue(overlays.taper).onChange((value) => this.change({ taper: value })));
			case "taperStrength":
				row.setName("Taper strength").setDesc(taperLabel(overlays.taperStrength));
				return row.addSlider((slider) =>
					slider
						.setLimits(TAPER_STRENGTH_MIN, TAPER_STRENGTH_MAX, 0.05)
						.setValue(overlays.taperStrength)
						.onChange((value) => {
							row.setDesc(taperLabel(value));
							this.change({ taperStrength: value });
						}),
				);
			case "labels":
				return row.setName("Labels").addDropdown((dropdown) =>
					dropdown
						.addOptions(LABEL_MODES)
						.setValue(overlays.labels)
						.onChange((value) => this.change({ labels: value as LabelMode })),
				);
			case "panelDetail": {
				const near = this.source.nearTier.get();
				row.setName("Panel detail").setDesc(detailLabel(near.detail));
				return row.addSlider((slider) => {
					const limit = Math.log2(DETAIL_LIMIT);
					slider
						.setLimits(-limit, limit, 0.25)
						.setValue(sliderFromDetail(near.detail))
						.setInstant(true)
						.onChange((value) => {
							row.setDesc(detailLabel(detailFromSlider(value)));
							this.source.nearTier.set({ detail: detailFromSlider(value) });
						});
				});
			}
			case "livePanels": {
				const near = this.source.nearTier.get();
				const range = NEAR_BUDGET_RANGE[Platform.isMobile ? "mobile" : "desktop"];
				row.setName("Live panels").setDesc(budgetLabel(near.budget));
				return row.addSlider((slider) =>
					slider
						.setLimits(range.min, range.max, 1)
						.setValue(near.budget)
						.setInstant(true)
						.onChange((value) => {
							row.setDesc(budgetLabel(value));
							this.source.nearTier.set({ budget: value });
						}),
				);
			}
		}
	}

	/** A spacing slider for `key`, sent on every step of a drag so the graph re-settles live (see CosmosScene.reshape). */
	private spacing(row: Setting, name: string, what: string, key: "noteSpacing" | "nodeSpacing" | "continentSpacing"): Setting {
		row.setName(name).setDesc(spacingLabel(this.current[key], what));
		return row.addSlider((slider) =>
			slider
				.setLimits(SPACING_MIN, SPACING_MAX, 0.05)
				.setValue(this.current[key])
				.setInstant(true)
				.onChange((value) => {
					row.setDesc(spacingLabel(value, what));
					this.change({ [key]: value });
				}),
		);
	}
}

function depthLabel(depth: number): string {
	if (depth === 0) return "Only the focus note and the notes it embeds";
	return depth === 1 ? "1 hop from the focus note" : `${String(depth)} hops from the focus note`;
}

function travelLabel(speed: number): string {
	return `×${speed < 1 ? speed.toFixed(2) : speed.toFixed(1)}. How fast the camera flies when you follow a link, fly to a plate, or go to a search result.`;
}

function flattenLabel(flatten: number): string {
	const flat = flatDepth(flatten);
	const ramp = Math.floor(flat) + 1;
	const weight = flatWeight(ramp, flat);
	const lead = !Number.isFinite(flat)
		? "Off: every branch spreads in 3D."
		: flat <= 1
			? "Everything under each note's title lies flat."
			: weight >= 1
				? `Lines deeper than outline depth ${String(ramp - 1)} lie flat.`
				: `Lines deeper than outline depth ${String(ramp)} lie flat; lines at depth ${String(ramp)} are pulled ${String(Math.round(weight * 100))}% into their slice.`;
	return `${lead} A flat branch is drawn as the mind map draws it, in a slice through its note's core. Moving it re-settles the loaded notes as you drag.`;
}

function coreLayersLabel(layers: number): string {
	const lead = layers <= 1 ? "1: every line lies on the planet's surface." : `${String(layers)}: lines sit on ${String(layers)} shells by outline depth, the root's children innermost and depth ${String(layers)} and deeper on the surface.`;
	return `${lead} Moving it moves the plates as you drag.`;
}

function spacingLabel(spacing: number, what: string): string {
	return `×${spacing.toFixed(2)}. The distance between ${what}, as a multiple of the default. Moving it re-settles the loaded notes as you drag, and lays planets out afresh.`;
}

function taperLabel(strength: number): string {
	return `×${strength.toFixed(2)}. How much thicker than the thinnest stem the branches near each root are.`;
}

function mistLabel(mist: number): string {
	return `×${mist < 1 ? mist.toFixed(2) : mist.toFixed(1)}`;
}

function detailLabel(detail: number): string {
	const mark = `×${detail < 1 ? detail.toFixed(2) : detail.toFixed(1)}`;
	const at = enterScaleFromDetail(detail).toFixed(2);
	return `${mark}. How close a plate gets before it turns into a live panel: higher opens panels from farther away (at ${at}× its laid-out size; ×1 is ${NEAR_ENTER_SCALE.toFixed(2)}×). Kept on this device.`;
}

function budgetLabel(budget: number): string {
	return `${String(budget)}. The most live panels at once; the nearest win. Fewer is lighter on a big graph. Kept on this device.`;
}
