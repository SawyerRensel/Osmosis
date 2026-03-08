import { ItemView, WorkspaceLeaf, Setting } from "obsidian";
import { MindMapView, VIEW_TYPE_MINDMAP } from "./MindMapView";
import type OsmosisPlugin from "../main";
import type { MapSettings, BranchLineStyle } from "../settings";
import { DEFAULT_MAP_SETTINGS } from "../settings";
import type { LayoutDirection } from "../layout";

export const VIEW_TYPE_PROPERTIES = "osmosis-properties";

export class PropertiesSidebarView extends ItemView {
	plugin: OsmosisPlugin;
	private currentFilePath: string | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
		this.plugin = (this.app as any).plugins.plugins["osmosis"] as OsmosisPlugin;
	}

	getViewType(): string {
		return VIEW_TYPE_PROPERTIES;
	}

	getDisplayText(): string {
		return "Mind map properties";
	}

	getIcon(): string {
		return "settings";
	}

	async onOpen(): Promise<void> {
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				this.updateContext();
			}),
		);
		this.updateContext();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	/** Find the active MindMapView, if any. */
	private getActiveMindMap(): MindMapView | null {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP);
		for (const leaf of leaves) {
			if (leaf.view instanceof MindMapView) {
				return leaf.view;
			}
		}
		return null;
	}

	/** Resolve the effective MapSettings for the current file. */
	private getEffectiveSettings(): MapSettings {
		if (!this.currentFilePath) return { ...DEFAULT_MAP_SETTINGS };
		const overrides =
			this.plugin.settings.mapSettings[this.currentFilePath] ?? {};
		return { ...DEFAULT_MAP_SETTINGS, ...overrides };
	}

	/** Save a per-map setting and notify the mind map view. */
	private async saveSetting<K extends keyof MapSettings>(
		key: K,
		value: MapSettings[K],
	): Promise<void> {
		if (!this.currentFilePath) return;

		const filePath = this.currentFilePath;
		const perNote = this.plugin.settings.mapSettings[filePath] ?? {};
		this.plugin.settings.mapSettings[filePath] = perNote;

		// Only store if different from default
		if (value === DEFAULT_MAP_SETTINGS[key]) {
			delete perNote[key];
			// Clean up empty objects
			if (Object.keys(perNote).length === 0) {
				delete this.plugin.settings.mapSettings[filePath];
			}
		} else {
			perNote[key] = value;
		}

		await this.plugin.saveSettings();

		// Notify the mind map to re-render with updated settings
		const mindMap = this.getActiveMindMap();
		if (mindMap) {
			mindMap.applyMapSettings(this.getEffectiveSettings());
		}
	}

	/** Update the sidebar to reflect the active mind map context. */
	private updateContext(): void {
		const mindMap = this.getActiveMindMap();
		const filePath = mindMap?.getCurrentFilePath() ?? null;

		// Avoid re-rendering if we're already showing this file's settings
		if (filePath === this.currentFilePath && this.contentEl.hasChildNodes()) {
			return;
		}

		this.currentFilePath = filePath;
		this.contentEl.empty();

		if (!mindMap || !filePath) {
			this.renderPlaceholder();
			return;
		}

		this.renderSettings();
	}

	private renderPlaceholder(): void {
		const placeholder = this.contentEl.createDiv({
			cls: "osmosis-properties-placeholder",
		});
		placeholder.createEl("p", {
			text: "Open a mind map to see its properties.",
		});
	}

	private renderSettings(): void {
		const container = this.contentEl.createDiv({
			cls: "osmosis-properties-container",
		});
		const settings = this.getEffectiveSettings();

		// Header showing which file
		const fileName = this.currentFilePath?.split("/").pop() ?? "";
		container.createEl("h6", {
			text: fileName.replace(/\.md$/, ""),
			cls: "osmosis-properties-filename",
		});

		// Layout direction
		new Setting(container)
			.setName("Layout direction")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("left-right", "Left to right")
					.addOption("top-down", "Top to bottom")
					.setValue(settings.direction)
					.onChange(async (value) => {
						await this.saveSetting(
							"direction",
							value as LayoutDirection,
						);
					}),
			);

		// Branch line style
		new Setting(container)
			.setName("Branch line style")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("curved", "Curved")
					.addOption("straight", "Straight")
					.addOption("angular", "Angular")
					.addOption("rounded-elbow", "Rounded elbow")
					.setValue(settings.branchLineStyle)
					.onChange(async (value) => {
						await this.saveSetting(
							"branchLineStyle",
							value as BranchLineStyle,
						);
					}),
			);

		// Collapse depth
		new Setting(container)
			.setName("Default collapse depth")
			.setDesc("0 = expand all")
			.addSlider((slider) =>
				slider
					.setLimits(0, 6, 1)
					.setValue(settings.collapseDepth)
					.setDynamicTooltip()
					.onChange(async (value) => {
						await this.saveSetting("collapseDepth", value);
					}),
			);

		// Horizontal spacing
		new Setting(container)
			.setName("Horizontal spacing")
			.setDesc("Space between parent and children")
			.addSlider((slider) =>
				slider
					.setLimits(20, 200, 5)
					.setValue(settings.horizontalSpacing)
					.setDynamicTooltip()
					.onChange(async (value) => {
						await this.saveSetting("horizontalSpacing", value);
					}),
			);

		// Vertical spacing
		new Setting(container)
			.setName("Vertical spacing")
			.setDesc("Space between sibling nodes")
			.addSlider((slider) =>
				slider
					.setLimits(2, 40, 1)
					.setValue(settings.verticalSpacing)
					.setDynamicTooltip()
					.onChange(async (value) => {
						await this.saveSetting("verticalSpacing", value);
					}),
			);
	}
}
