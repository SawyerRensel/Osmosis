import { App, PluginSettingTab, Setting } from "obsidian";
import OsmosisPlugin from "./main";
import type { LayoutDirection } from "./layout";

export type BranchLineStyle = "curved" | "straight" | "angular" | "rounded-elbow";

/** Per-map settings that override global defaults. */
export interface MapSettings {
	direction: LayoutDirection;
	branchLineStyle: BranchLineStyle;
	collapseDepth: number;
	horizontalSpacing: number;
	verticalSpacing: number;
}

export const DEFAULT_MAP_SETTINGS: MapSettings = {
	direction: "left-right",
	branchLineStyle: "curved",
	collapseDepth: 0,
	horizontalSpacing: 80,
	verticalSpacing: 8,
};

export interface OsmosisSettings {
	branchLineStyle: BranchLineStyle;
	cursorSync: boolean;
	showTransclusionStyle: boolean;
	/** Per-note map settings keyed by file path. Only non-default values stored. */
	mapSettings: Record<string, Partial<MapSettings>>;
}

export const DEFAULT_SETTINGS: OsmosisSettings = {
	branchLineStyle: "curved",
	cursorSync: true,
	showTransclusionStyle: false,
	mapSettings: {},
};

export class OsmosisSettingTab extends PluginSettingTab {
	plugin: OsmosisPlugin;

	constructor(app: App, plugin: OsmosisPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Branch line style")
			.setDesc("Style of connecting lines between nodes.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("curved", "Curved")
					.addOption("straight", "Straight")
					.addOption("angular", "Angular")
					.addOption("rounded-elbow", "Rounded elbow")
					.setValue(this.plugin.settings.branchLineStyle)
					.onChange(async (value) => {
						this.plugin.settings.branchLineStyle = value as BranchLineStyle;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Highlight transcluded branches")
			.setDesc("Visually distinguish nodes embedded from other files.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showTransclusionStyle)
					.onChange(async (value) => {
						this.plugin.settings.showTransclusionStyle = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Cursor sync")
			.setDesc("Sync cursor position between the Markdown editor and mind map.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.cursorSync)
					.onChange(async (value) => {
						this.plugin.settings.cursorSync = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
