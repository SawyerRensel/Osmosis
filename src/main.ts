import { Plugin, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, OsmosisSettings, OsmosisSettingTab } from "./settings";
import { MindMapView, VIEW_TYPE_MINDMAP } from "./views/MindMapView";

export default class OsmosisPlugin extends Plugin {
	settings!: OsmosisSettings;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new OsmosisSettingTab(this.app, this));

		this.registerView(VIEW_TYPE_MINDMAP, (leaf: WorkspaceLeaf) => new MindMapView(leaf));

		this.addRibbonIcon("git-fork", "Open mind map", () => {
			void this.activateMindMapView();
		});

		this.addCommand({
			id: "open-mind-map",
			name: "Open mind map view",
			callback: () => {
				void this.activateMindMapView();
			},
		});
	}

	onunload() {
		// Cleanup handled automatically by this.register*() methods
	}

	private async activateMindMapView(): Promise<void> {
		const { workspace } = this.app;

		const existing = workspace.getLeavesOfType(VIEW_TYPE_MINDMAP);
		if (existing.length > 0 && existing[0]) {
			void workspace.revealLeaf(existing[0]);
			return;
		}

		const leaf = workspace.getLeaf("split", "vertical");
		await leaf.setViewState({
			type: VIEW_TYPE_MINDMAP,
			active: true,
		});
		void workspace.revealLeaf(leaf);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<OsmosisSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
