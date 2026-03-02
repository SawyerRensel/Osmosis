import { App, PluginSettingTab, Setting } from "obsidian";
import OsmosisPlugin from "./main";

export type BranchLineStyle = "curved" | "straight" | "angular" | "rounded-elbow";

export interface OsmosisSettings {
	branchLineStyle: BranchLineStyle;
	cursorSync: boolean;
}

export const DEFAULT_SETTINGS: OsmosisSettings = {
	branchLineStyle: "curved",
	cursorSync: true,
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
