import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, OsmosisSettings, OsmosisSettingTab } from "./settings";

export default class OsmosisPlugin extends Plugin {
	settings!: OsmosisSettings;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new OsmosisSettingTab(this.app, this));
	}

	onunload() {
		// Cleanup handled automatically by this.register*() methods
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<OsmosisSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
