import { App, PluginSettingTab, Setting } from "obsidian";
import OsmosisPlugin from "./main";

export interface OsmosisSettings {
	placeholder: string;
}

export const DEFAULT_SETTINGS: OsmosisSettings = {
	placeholder: "default",
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
			.setName("Osmosis settings")
			.setDesc("Settings will be added as features are implemented.");
	}
}
