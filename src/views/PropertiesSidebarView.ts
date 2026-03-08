import { ItemView, WorkspaceLeaf, Setting } from "obsidian";
import { MindMapView, VIEW_TYPE_MINDMAP } from "./MindMapView";
import type OsmosisPlugin from "../main";
import type { MapSettings, BranchLineStyle } from "../settings";
import { DEFAULT_MAP_SETTINGS } from "../settings";
import type { LayoutDirection } from "../layout";
import type { TopicShape } from "../styles";
import { getThemeNames } from "../themes";
import { SHAPE_LABELS } from "../shapes";

export const VIEW_TYPE_PROPERTIES = "osmosis-properties";

type TabId = "map" | "format";

/** Section header names for the Format tab skeleton. */
const FORMAT_SECTIONS = [
	"Style class",
	"Shape",
	"Fill",
	"Border",
	"Text",
	"Branch line",
] as const;

export class PropertiesSidebarView extends ItemView {
	plugin: OsmosisPlugin;
	private currentFilePath: string | null = null;
	private activeTab: TabId = "map";
	private tabButtons: Record<TabId, HTMLElement> | null = null;
	private tabContents: Record<TabId, HTMLElement> | null = null;
	private formatControlEls: HTMLElement[] = [];
	private selectionCleanup: (() => void) | null = null;

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
		this.cleanupSelectionListener();
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

		this.renderTabbedUI();
		this.setupSelectionListener(mindMap);
	}

	private renderPlaceholder(): void {
		this.cleanupSelectionListener();
		const placeholder = this.contentEl.createDiv({
			cls: "osmosis-properties-placeholder",
		});
		placeholder.createEl("p", {
			text: "Open a mind map to see its properties.",
		});
	}

	// ─── Tab UI ──────────────────────────────────────────────

	private renderTabbedUI(): void {
		const container = this.contentEl.createDiv({
			cls: "osmosis-properties-container",
		});

		// Header showing which file
		const fileName = this.currentFilePath?.split("/").pop() ?? "";
		container.createEl("h6", {
			text: fileName.replace(/\.md$/, ""),
			cls: "osmosis-properties-filename",
		});

		// Tab header bar
		const tabBar = container.createDiv({ cls: "osmosis-tab-bar" });

		const mapBtn = tabBar.createEl("button", {
			text: "Map",
			cls: "osmosis-tab-btn",
		});
		const formatBtn = tabBar.createEl("button", {
			text: "Format",
			cls: "osmosis-tab-btn",
		});

		this.tabButtons = { map: mapBtn, format: formatBtn };

		// Tab content containers
		const mapContent = container.createDiv({ cls: "osmosis-tab-content" });
		const formatContent = container.createDiv({ cls: "osmosis-tab-content" });

		this.tabContents = { map: mapContent, format: formatContent };

		// Render tab contents
		this.renderMapTab(mapContent);
		this.renderFormatTab(formatContent);

		// Wire up tab switching
		mapBtn.addEventListener("click", () => this.switchTab("map"));
		formatBtn.addEventListener("click", () => this.switchTab("format"));

		// Activate default tab
		this.switchTab(this.activeTab);
	}

	private switchTab(tabId: TabId): void {
		this.activeTab = tabId;

		if (!this.tabButtons || !this.tabContents) return;

		for (const id of ["map", "format"] as TabId[]) {
			const isActive = id === tabId;
			this.tabButtons[id].toggleClass("is-active", isActive);
			this.tabContents[id].toggleClass("is-hidden", !isActive);
		}

		// Refresh format tab state when switching to it
		if (tabId === "format") {
			this.updateFormatTabState();
		}
	}

	// ─── Map Tab ─────────────────────────────────────────────

	private renderMapTab(container: HTMLElement): void {
		const settings = this.getEffectiveSettings();

		// Theme
		new Setting(container)
			.setName("Theme")
			.addDropdown((dropdown) => {
				for (const name of getThemeNames()) {
					dropdown.addOption(name, name);
				}
				dropdown
					.setValue(settings.theme)
					.onChange(async (value) => {
						await this.saveSetting("theme", value);
					});
			});

		// Topic shape
		new Setting(container)
			.setName("Topic shape")
			.addDropdown((dropdown) => {
				for (const [value, label] of Object.entries(SHAPE_LABELS)) {
					dropdown.addOption(value, label);
				}
				dropdown
					.setValue(settings.topicShape)
					.onChange(async (value) => {
						await this.saveSetting(
							"topicShape",
							value as TopicShape,
						);
					});
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

	// ─── Format Tab ──────────────────────────────────────────

	private renderFormatTab(container: HTMLElement): void {
		this.formatControlEls = [];

		// "No node selected" banner — shown/hidden dynamically
		const noSelBanner = container.createDiv({
			cls: "osmosis-format-no-selection",
			text: "Select a node to edit its style.",
		});
		this.formatControlEls.push(noSelBanner);

		// Collapsible sections with placeholder controls
		for (const section of FORMAT_SECTIONS) {
			const sectionEl = container.createDiv({
				cls: "osmosis-format-section",
			});

			const header = sectionEl.createDiv({
				cls: "osmosis-format-section-header",
			});
			header.createSpan({ text: section });

			const body = sectionEl.createDiv({
				cls: "osmosis-format-section-body",
			});

			this.renderFormatSectionPlaceholder(section, body);

			// Toggle collapse
			header.addEventListener("click", () => {
				sectionEl.toggleClass(
					"is-collapsed",
					!sectionEl.hasClass("is-collapsed"),
				);
			});
		}

		this.updateFormatTabState();
	}

	/** Render placeholder controls for a Format section. */
	private renderFormatSectionPlaceholder(
		section: (typeof FORMAT_SECTIONS)[number],
		body: HTMLElement,
	): void {
		switch (section) {
			case "Style class":
				new Setting(body)
					.setName("Class")
					.setDesc("Coming soon")
					.addDropdown((d) =>
						d.addOption("none", "(none)").setDisabled(true),
					);
				break;
			case "Shape":
				new Setting(body)
					.setName("Shape")
					.addDropdown((dropdown) => {
						for (const [value, label] of Object.entries(
							SHAPE_LABELS,
						)) {
							dropdown.addOption(value, label);
						}
						dropdown.setDisabled(true);
					});
				break;
			case "Fill":
				new Setting(body)
					.setName("Color")
					.setDesc("Color picker coming soon")
					.addText((text) =>
						text
							.setPlaceholder("#ffffff")
							.setDisabled(true),
					);
				break;
			case "Border":
				new Setting(body)
					.setName("Color")
					.addText((text) =>
						text.setPlaceholder("#000000").setDisabled(true),
					);
				new Setting(body)
					.setName("Width")
					.addSlider((s) =>
						s.setLimits(0, 8, 1).setValue(1).setDisabled(true),
					);
				new Setting(body)
					.setName("Style")
					.addDropdown((d) =>
						d
							.addOption("solid", "Solid")
							.addOption("dashed", "Dashed")
							.addOption("dotted", "Dotted")
							.addOption("none", "None")
							.setDisabled(true),
					);
				break;
			case "Text":
				new Setting(body)
					.setName("Font family")
					.setDesc("Font picker coming soon")
					.addText((text) =>
						text.setPlaceholder("Inter").setDisabled(true),
					);
				new Setting(body)
					.setName("Size")
					.addSlider((s) =>
						s.setLimits(8, 48, 1).setValue(14).setDisabled(true),
					);
				new Setting(body)
					.setName("Color")
					.addText((text) =>
						text.setPlaceholder("#000000").setDisabled(true),
					);
				break;
			case "Branch line":
				new Setting(body)
					.setName("Color")
					.addText((text) =>
						text.setPlaceholder("#888888").setDisabled(true),
					);
				new Setting(body)
					.setName("Thickness")
					.addSlider((s) =>
						s.setLimits(1, 8, 1).setValue(2).setDisabled(true),
					);
				break;
		}
	}

	/** Update Format tab disabled/enabled state based on selection. */
	private updateFormatTabState(): void {
		const mindMap = this.getActiveMindMap();
		const selection = mindMap?.getSelectedNodeInfo() ?? null;
		const hasSelection = selection !== null && selection.nodeIds.length > 0;

		// Toggle the no-selection banner
		const container = this.tabContents?.format;
		if (!container) return;

		const banner = container.querySelector(
			".osmosis-format-no-selection",
		);
		if (banner instanceof HTMLElement) {
			banner.toggleClass("is-hidden", hasSelection);
		}

		// Toggle section visibility
		const sections = Array.from(
			container.querySelectorAll(".osmosis-format-section"),
		);
		for (const section of sections) {
			if (section instanceof HTMLElement) {
				section.toggleClass("is-disabled", !hasSelection);
			}
		}
	}

	// ─── Selection Listener ──────────────────────────────────

	private setupSelectionListener(mindMap: MindMapView): void {
		this.cleanupSelectionListener();

		const handler = () => {
			this.updateFormatTabState();
		};

		mindMap.onSelectionChange(handler);
		this.selectionCleanup = () => {
			mindMap.offSelectionChange(handler);
		};
	}

	private cleanupSelectionListener(): void {
		if (this.selectionCleanup) {
			this.selectionCleanup();
			this.selectionCleanup = null;
		}
	}
}
