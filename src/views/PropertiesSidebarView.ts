import { ItemView, WorkspaceLeaf, Setting, setIcon, Modal, Notice } from "obsidian";
import { MindMapView, VIEW_TYPE_MINDMAP } from "./MindMapView";
import type OsmosisPlugin from "../main";
import type { MapSettings, BranchLineStyle } from "../settings";
import { DEFAULT_MAP_SETTINGS } from "../settings";
import type { LayoutDirection } from "../layout";
import type { TopicShape, NodeStyle, OsmosisStyleFrontmatter, ThemeDefinition } from "../styles";
import { lookupNodeStyle, lookupClassStyle, resolveNodeStyle, getClassScope, mergeNodeStyle } from "../styles";
import { getTheme, getThemeNames, isPresetTheme } from "../themes";
import { SHAPE_LABELS } from "../shapes";
import { ColorPicker, extractThemeColors } from "./ColorPicker";
import { FontPicker } from "./FontPicker";

export const VIEW_TYPE_PROPERTIES = "osmosis-properties";

type TabId = "map" | "format";

/** Section header names for the Format tab. */
const FORMAT_SECTIONS = [
	"Style class",
	"Shape",
	"Fill",
	"Border",
	"Text",
	"Branch line",
] as const;

/** Maps each format section to the NodeStyle keys it controls, for reset. */
const SECTION_STYLE_KEYS: Record<string, (keyof NodeStyle)[]> = {
	"Shape": ["shape", "width"],
	"Fill": ["fill", "background"],
	"Border": ["border"],
	"Text": ["text"],
	"Branch line": ["branchLine"],
};

/** References to live Format tab controls for value updates. */
interface FormatControls {
	classDropdown: HTMLSelectElement | null;
	classMgmtBtns: HTMLElement | null;
	saveToClassBtn: HTMLElement | null;
	shapeDropdown: HTMLSelectElement | null;
	nodeWidthInput: HTMLInputElement | null;
	fillSwatch: HTMLElement | null;
	borderColorSwatch: HTMLElement | null;
	borderWidthSlider: HTMLInputElement | null;
	borderStyleDropdown: HTMLSelectElement | null;
	fontPicker: FontPicker | null;
	textSizeSlider: HTMLInputElement | null;
	textWeightDropdown: HTMLSelectElement | null;
	textColorSwatch: HTMLElement | null;
	textAlignBtns: HTMLElement | null;
	branchColorSwatch: HTMLElement | null;
	branchThicknessSlider: HTMLInputElement | null;
	branchStyleDropdown: HTMLSelectElement | null;
}

function emptyFormatControls(): FormatControls {
	return {
		classDropdown: null,
		classMgmtBtns: null,
		saveToClassBtn: null,
		shapeDropdown: null,
		nodeWidthInput: null,
		fillSwatch: null,
		borderColorSwatch: null,
		borderWidthSlider: null,
		borderStyleDropdown: null,
		fontPicker: null,
		textSizeSlider: null,
		textWeightDropdown: null,
		textColorSwatch: null,
		textAlignBtns: null,
		branchColorSwatch: null,
		branchThicknessSlider: null,
		branchStyleDropdown: null,
	};
}

export class PropertiesSidebarView extends ItemView {
	plugin: OsmosisPlugin;
	private currentFilePath: string | null = null;
	private activeTab: TabId = "map";
	private tabButtons: Record<TabId, HTMLElement> | null = null;
	private tabContents: Record<TabId, HTMLElement> | null = null;
	private formatControlEls: HTMLElement[] = [];
	private selectionCleanup: (() => void) | null = null;
	private controls: FormatControls = emptyFormatControls();
	private variantSetting: HTMLElement | null = null;
	private variantDropdown: HTMLSelectElement | null = null;
	private saveToVariantBtn: HTMLElement | null = null;
	private themeDropdown: HTMLSelectElement | null = null;
	private renameThemeBtn: HTMLElement | null = null;
	private deleteThemeBtn: HTMLElement | null = null;
	private activePickers: ColorPicker[] = [];
	// Map tab style section controls
	private mapBackgroundSwatch: HTMLElement | null = null;
	private mapFillSwatch: HTMLElement | null = null;
	private mapBorderColorSwatch: HTMLElement | null = null;
	private mapBorderWidthSlider: HTMLInputElement | null = null;
	private mapBorderStyleDropdown: HTMLSelectElement | null = null;
	private mapTextFontPicker: FontPicker | null = null;
	private mapTextSizeSlider: HTMLInputElement | null = null;
	private mapTextWeightDropdown: HTMLSelectElement | null = null;
	private mapTextColorSwatch: HTMLElement | null = null;
	private mapTextAlignBtns: HTMLElement | null = null;
	private mapBranchColorSwatch: HTMLElement | null = null;
	private mapBranchThicknessSlider: HTMLInputElement | null = null;
	// Map tab layout controls (for refreshing on theme switch)
	private mapDirectionDropdown: HTMLSelectElement | null = null;
	private mapCollapseSlider: HTMLInputElement | null = null;
	private mapHSpacingSlider: HTMLInputElement | null = null;
	private mapVSpacingSlider: HTMLInputElement | null = null;
	private mapBranchStyleDropdown: HTMLSelectElement | null = null;
	private mapTopicShapeDropdown: HTMLSelectElement | null = null;
	private saveThemeBtn: HTMLElement | null = null;

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
		this.closeAllPickers();
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
		this.closeAllPickers();
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

		// Theme — header row with label + icon buttons, dropdown below
		const themeSection = container.createDiv({ cls: "osmosis-variant-section" });

		const themeHeader = themeSection.createDiv({ cls: "osmosis-variant-header" });
		themeHeader.createSpan({ text: "Theme", cls: "osmosis-variant-label" });

		const themeBtnGroup = themeHeader.createDiv({ cls: "osmosis-class-header-btns" });

		const extractThemeBtn = themeBtnGroup.createEl("button", {
			cls: "osmosis-class-icon-btn",
			attr: { "aria-label": "Save current map as theme", title: "Extract theme from map" },
		});
		setIcon(extractThemeBtn, "palette");
		extractThemeBtn.addEventListener("click", () => this.promptExtractTheme());

		const saveThemeBtn = themeBtnGroup.createEl("button", {
			cls: "osmosis-class-icon-btn is-hidden",
			attr: { "aria-label": "Save changes to theme", title: "Save to theme" },
		});
		setIcon(saveThemeBtn, "save");
		saveThemeBtn.addEventListener("click", () => {
			void this.saveToCurrentTheme();
		});
		this.saveThemeBtn = saveThemeBtn;

		const renameThemeBtn = themeBtnGroup.createEl("button", {
			cls: "osmosis-class-icon-btn",
			attr: { "aria-label": "Rename theme", title: "Rename theme" },
		});
		setIcon(renameThemeBtn, "pencil");
		renameThemeBtn.addEventListener("click", () => this.promptRenameTheme());
		this.renameThemeBtn = renameThemeBtn;

		const deleteThemeBtn = themeBtnGroup.createEl("button", {
			cls: "osmosis-class-icon-btn",
			attr: { "aria-label": "Delete theme", title: "Delete theme" },
		});
		setIcon(deleteThemeBtn, "trash-2");
		deleteThemeBtn.addEventListener("click", () => this.confirmDeleteTheme());
		this.deleteThemeBtn = deleteThemeBtn;

		new Setting(themeSection)
			.setName("Active")
			.addDropdown((dropdown) => {
				this.themeDropdown = dropdown.selectEl;
				for (const name of getThemeNames(this.plugin.settings.customThemes)) {
					dropdown.addOption(name, name);
				}
				dropdown
					.setValue(settings.theme)
					.onChange(async (value) => {
						// Clear map-level style overrides so the new theme's values take effect
						if (!this.currentFilePath) return;
						const perNote =
							this.plugin.settings.mapSettings[this.currentFilePath] ?? {};
						this.plugin.settings.mapSettings[this.currentFilePath] = perNote;
						delete perNote.baseStyle;
						delete perNote.background;
						delete perNote.branchLineColor;
						delete perNote.branchLineThickness;

						// Apply theme's layout/branch settings as map-level overrides
						const theme = getTheme(value, this.plugin.settings.customThemes);
						if (theme) {
							if (theme.branchLine?.style) perNote.branchLineStyle = theme.branchLine.style;
							else delete perNote.branchLineStyle;
							if (theme.direction) perNote.direction = theme.direction;
							else delete perNote.direction;
							if (theme.collapseDepth != null) perNote.collapseDepth = theme.collapseDepth;
							else delete perNote.collapseDepth;
							if (theme.horizontalSpacing != null) perNote.horizontalSpacing = theme.horizontalSpacing;
							else delete perNote.horizontalSpacing;
							if (theme.verticalSpacing != null) perNote.verticalSpacing = theme.verticalSpacing;
							else delete perNote.verticalSpacing;
							if (theme.topicShape) perNote.topicShape = theme.topicShape;
							else delete perNote.topicShape;
						}

						await this.saveSetting("theme", value);
						this.updateThemeMgmtVisibility();
						this.updateSaveThemeVisibility();
						this.refreshMapStyleControls();
					});
			});

		this.updateThemeMgmtVisibility();
		this.updateSaveThemeVisibility();

		// Variant section — header row with label + icon buttons, dropdown below
		const variantSection = container.createDiv({ cls: "osmosis-variant-section" });
		this.variantSetting = variantSection;

		const variantHeader = variantSection.createDiv({ cls: "osmosis-variant-header" });
		variantHeader.createSpan({ text: "Variant", cls: "osmosis-variant-label" });

		const variantBtnGroup = variantHeader.createDiv({ cls: "osmosis-class-header-btns" });

		const newVarBtn = variantBtnGroup.createEl("button", {
			cls: "osmosis-class-icon-btn",
			attr: { "aria-label": "New variant", title: "New variant" },
		});
		setIcon(newVarBtn, "plus");
		newVarBtn.addEventListener("click", () => this.promptNewVariant());

		const saveVarBtn = variantBtnGroup.createEl("button", {
			cls: "osmosis-class-icon-btn osmosis-save-to-variant-btn",
			attr: { "aria-label": "Save node style to variant", title: "Save to variant" },
		});
		setIcon(saveVarBtn, "save");
		saveVarBtn.addEventListener("click", () => void this.saveStylesToVariant());
		this.saveToVariantBtn = saveVarBtn;

		const renameVarBtn = variantBtnGroup.createEl("button", {
			cls: "osmosis-class-icon-btn",
			attr: { "aria-label": "Rename variant", title: "Rename" },
		});
		setIcon(renameVarBtn, "pencil");
		renameVarBtn.addEventListener("click", () => this.promptRenameVariant());

		const deleteVarBtn = variantBtnGroup.createEl("button", {
			cls: "osmosis-class-icon-btn osmosis-variant-delete-btn",
			attr: { "aria-label": "Delete variant", title: "Delete" },
		});
		setIcon(deleteVarBtn, "trash-2");
		deleteVarBtn.addEventListener("click", () => this.confirmDeleteVariant());

		new Setting(variantSection)
			.setName("Active")
			.addDropdown((dropdown) => {
				this.variantDropdown = dropdown.selectEl;
				this.rebuildVariantDropdown();
				dropdown.onChange((value) => {
					const mindMap = this.getActiveMindMap();
					if (mindMap) {
						void mindMap.setActiveVariant(value || undefined);
					}
					this.updateSaveToVariantVisibility();
				});
			});

		this.updateSaveToVariantVisibility();

		// Layout direction
		new Setting(container)
			.setName("Layout direction")
			.addDropdown((dropdown) => {
				this.mapDirectionDropdown = dropdown.selectEl;
				dropdown
					.addOption("left-right", "Left to right")
					.addOption("top-down", "Top to bottom")
					.setValue(settings.direction)
					.onChange(async (value) => {
						await this.saveSetting(
							"direction",
							value as LayoutDirection,
						);
					});
			});

		// Collapse depth
		new Setting(container)
			.setName("Default collapse depth")
			.setDesc("0 = expand all")
			.addSlider((slider) => {
				this.mapCollapseSlider = slider.sliderEl;
				slider
					.setLimits(0, 6, 1)
					.setValue(settings.collapseDepth)
					.setDynamicTooltip()
					.onChange(async (value) => {
						await this.saveSetting("collapseDepth", value);
					});
			});

		// Horizontal spacing
		new Setting(container)
			.setName("Horizontal spacing")
			.setDesc("Space between parent and children")
			.addSlider((slider) => {
				this.mapHSpacingSlider = slider.sliderEl;
				slider
					.setLimits(20, 200, 5)
					.setValue(settings.horizontalSpacing)
					.setDynamicTooltip()
					.onChange(async (value) => {
						await this.saveSetting("horizontalSpacing", value);
					});
			});

		// Vertical spacing
		new Setting(container)
			.setName("Vertical spacing")
			.setDesc("Space between sibling nodes")
			.addSlider((slider) => {
				this.mapVSpacingSlider = slider.sliderEl;
				slider
					.setLimits(2, 40, 1)
					.setValue(settings.verticalSpacing)
					.setDynamicTooltip()
					.onChange(async (value) => {
						await this.saveSetting("verticalSpacing", value);
					});
			});

		// ─── Global Style Sections ──────────────────────────────
		container.createEl("hr", { cls: "osmosis-map-style-divider" });

		this.renderMapStyleSection(container, "Background", (body) => {
			this.renderMapBackgroundSection(body);
		});
		this.renderMapStyleSection(container, "Default fill", (body) => {
			this.renderMapFillSection(body);
		});
		this.renderMapStyleSection(container, "Default border", (body) => {
			this.renderMapBorderSection(body);
		});
		this.renderMapStyleSection(container, "Default text", (body) => {
			this.renderMapTextSection(body);
		});
		this.renderMapStyleSection(container, "Branch line", (body) => {
			this.renderMapBranchLineSection(body);
		});

		this.refreshMapStyleControls();
	}

	// ─── Format Tab ──────────────────────────────────────────

	private renderFormatTab(container: HTMLElement): void {
		this.formatControlEls = [];
		this.controls = emptyFormatControls();

		// "No node selected" banner — shown/hidden dynamically
		const noSelBanner = container.createDiv({
			cls: "osmosis-format-no-selection",
			text: "Select a node to edit its style.",
		});
		this.formatControlEls.push(noSelBanner);

		// Global reset button
		const resetAll = container.createDiv({ cls: "osmosis-format-reset-all" });
		const resetAllBtn = resetAll.createEl("button", {
			cls: "osmosis-format-reset-btn",
			text: "Reset all styles",
		});
		resetAllBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			const mindMap = this.getActiveMindMap();
			const count = mindMap?.getSelectedNodeInfo()?.nodeIds.length ?? 0;
			if (count === 0) return;
			const modal = new Modal(this.app);
			modal.titleEl.setText("Reset all styles");
			modal.contentEl.createEl("p", {
				text: `Remove all style overrides from ${count} selected node(s)? They will revert to theme defaults.`,
			});
			const btnRow = modal.contentEl.createDiv({ cls: "modal-button-container" });
			btnRow.createEl("button", { text: "Cancel" })
				.addEventListener("click", () => modal.close());
			const confirm = btnRow.createEl("button", {
				cls: "mod-warning",
				text: "Reset",
			});
			confirm.addEventListener("click", () => {
				modal.close();
				void this.resetSelectedNodeStyles();
			});
			modal.open();
		});

		// Collapsible sections with live controls
		for (const section of FORMAT_SECTIONS) {
			const sectionEl = container.createDiv({
				cls: "osmosis-format-section",
			});

			const header = sectionEl.createDiv({
				cls: "osmosis-format-section-header",
			});
			const chevron = header.createSpan({ cls: "osmosis-chevron-icon" });
			setIcon(chevron, "chevron-right");
			header.createSpan({ text: section });

			// Per-section reset button
			const keys = SECTION_STYLE_KEYS[section];
			if (keys) {
				const resetBtn = header.createEl("button", {
					cls: "osmosis-format-section-reset-btn",
					attr: { "aria-label": `Reset ${section.toLowerCase()}` },
				});
				resetBtn.textContent = "\u21BA"; // ↺ reset icon
				resetBtn.addEventListener("click", (e) => {
					e.stopPropagation();
					void this.resetSelectedNodeStyles(keys);
				});
			}

			const body = sectionEl.createDiv({
				cls: "osmosis-format-section-body",
			});

			this.renderFormatSection(section, body, header);

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

	/** Render live controls for a Format section. */
	private renderFormatSection(
		section: (typeof FORMAT_SECTIONS)[number],
		body: HTMLElement,
		header?: HTMLElement,
	): void {
		switch (section) {
			case "Style class":
				this.renderStyleClassSection(body, header);
				break;
			case "Shape":
				this.renderShapeSection(body);
				break;
			case "Fill":
				this.renderFillSection(body);
				break;
			case "Border":
				this.renderBorderSection(body);
				break;
			case "Text":
				this.renderTextSection(body);
				break;
			case "Branch line":
				this.renderBranchLineSection(body);
				break;
		}
	}

	private renderStyleClassSection(body: HTMLElement, header?: HTMLElement): void {
		// Icon buttons in the section header row
		if (header) {
			const btnGroup = header.createDiv({ cls: "osmosis-class-header-btns" });

			const newBtn = btnGroup.createEl("button", {
				cls: "osmosis-class-icon-btn",
				attr: { "aria-label": "New class from node styles", title: "New class" },
			});
			setIcon(newBtn, "plus");
			newBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				this.promptNewClass();
			});

			const saveBtn = btnGroup.createEl("button", {
				cls: "osmosis-class-icon-btn osmosis-save-to-class-btn is-hidden",
				attr: { "aria-label": "Save styles to class", title: "Save to class" },
			});
			setIcon(saveBtn, "save");
			saveBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				void this.saveStylesToClass();
			});
			this.controls.saveToClassBtn = saveBtn;

			const renameBtn = btnGroup.createEl("button", {
				cls: "osmosis-class-icon-btn",
				attr: { "aria-label": "Rename class", title: "Rename" },
			});
			setIcon(renameBtn, "pencil");
			renameBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				this.promptRenameClass();
			});

			const scopeBtn = btnGroup.createEl("button", {
				cls: "osmosis-class-icon-btn",
				attr: { "aria-label": "Change class scope", title: "Change scope" },
			});
			setIcon(scopeBtn, "arrow-right-left");
			scopeBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				void this.changeClassScope();
			});

			const deleteBtn = btnGroup.createEl("button", {
				cls: "osmosis-class-icon-btn osmosis-class-delete-btn",
				attr: { "aria-label": "Delete class", title: "Delete" },
			});
			setIcon(deleteBtn, "trash-2");
			deleteBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				this.confirmDeleteClass();
			});

			this.controls.classMgmtBtns = btnGroup;
		}

		// Class assignment dropdown
		new Setting(body)
			.setName("Class")
			.addDropdown((d) => {
				d.addOption("", "(none)");
				d.onChange((value) => {
					void this.writeNodeStyle({
						class: value || undefined,
					});
					this.updateSaveToClassVisibility();
				});
				this.controls.classDropdown = d.selectEl;
			});
	}

	/** Show "Save to class" button only when the selected node has a class assigned. */
	private updateSaveToClassVisibility(): void {
		const btn = this.controls.saveToClassBtn;
		if (!btn) return;
		const className = this.controls.classDropdown?.value;
		btn.toggleClass("is-hidden", !className);
	}

	/**
	 * Save the selected node's local style overrides into its assigned class,
	 * then clear the local overrides so the node inherits from the class.
	 */
	private async saveStylesToClass(): Promise<void> {
		const mindMap = this.getActiveMindMap();
		if (!mindMap) return;

		const selection = mindMap.getSelectedNodeInfo();
		if (!selection?.primaryId) return;

		const layoutNode = mindMap.getLayoutNodeById(selection.primaryId);
		if (!layoutNode) return;

		const className = this.controls.classDropdown?.value;
		if (!className) return;

		const fm = mindMap.getOsmosisStyleFrontmatter();
		const globalClasses = mindMap.getGlobalClasses();
		const scope = getClassScope(fm, className, globalClasses);
		if (!scope) return;

		// Get the node's local style overrides (excluding the class assignment itself)
		const localStyle = lookupNodeStyle(fm, layoutNode);
		if (!localStyle) {
			new Notice("No local style overrides to save");
			return;
		}

		const styleToSave = { ...localStyle };
		delete styleToSave.class; // Don't save the class assignment into the class definition
		delete styleToSave.width; // Custom width is per-node, not a class property

		if (Object.keys(styleToSave).length === 0) {
			new Notice("No local style overrides to save");
			return;
		}

		// Merge local overrides INTO the existing class definition (don't replace it)
		const existingClass = lookupClassStyle(fm, className, globalClasses) ?? {};
		const merged: NodeStyle = { ...existingClass };
		mergeNodeStyle(merged, styleToSave);

		// Save to the appropriate scope
		if (scope === "local") {
			await mindMap.saveClassDefinition(className, merged);
		} else {
			await mindMap.saveGlobalClassDefinition(className, merged);
		}

		// Clear local overrides (keep only the class assignment)
		const ALL_VISUAL_KEYS: (keyof NodeStyle)[] =
			["shape", "fill", "border", "text", "branchLine", "background", "width"];
		await mindMap.resetNodeStyles(selection.nodeIds, ALL_VISUAL_KEYS);

		this.refreshFormatControls();
		new Notice(`Styles saved to ${scope} class "${className}"`);
	}

	/** Prompt user for a new class name, capturing current node styles. */
	private promptNewClass(): void {
		const mindMap = this.getActiveMindMap();
		if (!mindMap) return;

		const modal = new Modal(this.app);
		modal.titleEl.setText("New style class");

		let inputValue = "";
		let scope: "local" | "global" = "local";

		new Setting(modal.contentEl)
			.setName("Class name")
			.addText((text) => {
				text.setPlaceholder("Emphasis");
				text.onChange((value) => { inputValue = value.trim(); });
				setTimeout(() => text.inputEl.focus(), 50);
				text.inputEl.addEventListener("keydown", (e) => {
					if (e.key === "Enter" && inputValue) {
						modal.close();
						void this.createNewClass(inputValue, scope);
					}
				});
			});

		new Setting(modal.contentEl)
			.setName("Scope")
			.setDesc("Local classes are saved to this note. Global classes are available across all notes.")
			.addDropdown((d) => {
				d.addOption("local", "This note");
				d.addOption("global", "All notes");
				d.onChange((value) => { scope = value as "local" | "global"; });
			});

		const btnRow = modal.contentEl.createDiv({ cls: "modal-button-container" });
		btnRow.createEl("button", { text: "Cancel" })
			.addEventListener("click", () => modal.close());
		btnRow.createEl("button", { cls: "mod-cta", text: "Create" })
			.addEventListener("click", () => {
				if (!inputValue) return;
				modal.close();
				void this.createNewClass(inputValue, scope);
			});
		modal.open();
	}

	/** Create a new class from the selected node's current style overrides. */
	private async createNewClass(name: string, scope: "local" | "global"): Promise<void> {
		const mindMap = this.getActiveMindMap();
		if (!mindMap) return;

		// Validate name
		if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) {
			new Notice("Class name must start with a letter and contain only letters, numbers, hyphens, or underscores");
			return;
		}

		// Check if name already exists in either scope
		const fm = mindMap.getOsmosisStyleFrontmatter();
		const globalClasses = mindMap.getGlobalClasses();
		if (fm?.classes?.[name] || globalClasses[name]) {
			new Notice(`Class "${name}" already exists`);
			return;
		}

		// Capture the selected node's effective visual style as the class definition.
		// This includes local overrides, class-inherited properties, and theme defaults,
		// so creating a class from a node that already uses a class works correctly.
		const selection = mindMap.getSelectedNodeInfo();
		let styleToSave: NodeStyle = {};
		if (selection?.primaryId) {
			const layoutNode = mindMap.getLayoutNodeById(selection.primaryId);
			if (layoutNode) {
				const localStyle = lookupNodeStyle(fm, layoutNode);
				const globalClasses = mindMap.getGlobalClasses();
				const classStyle = lookupClassStyle(fm, localStyle?.class, globalClasses);

				// Merge local + class overrides (skip theme defaults — class should layer on top of theme)
				const localVisual = localStyle ? { ...localStyle } : {};
				delete localVisual.class;
				if (classStyle) {
					// Class properties that aren't overridden locally
					styleToSave = { ...classStyle, ...localVisual };
				} else if (Object.keys(localVisual).length > 0) {
					styleToSave = localVisual;
				}

				// If the node has a shape from map settings (not theme), include it
				// only if it was explicitly set locally or via class
				if (!styleToSave.shape && localStyle?.shape) {
					styleToSave.shape = localStyle.shape;
				}
			}
		}

		// Save to the chosen scope
		if (scope === "local") {
			await mindMap.saveClassDefinition(name, styleToSave);
		} else {
			await mindMap.saveGlobalClassDefinition(name, styleToSave);
		}

		// Clear local overrides and assign the new class
		if (selection) {
			if (Object.keys(styleToSave).length > 0) {
				const ALL_VISUAL_KEYS: (keyof NodeStyle)[] =
					["shape", "fill", "border", "text", "branchLine", "background", "width"];
				await mindMap.resetNodeStyles(selection.nodeIds, ALL_VISUAL_KEYS);
			}
			await this.writeNodeStyle({ class: name });
		}

		this.rebuildClassDropdown(mindMap.getOsmosisStyleFrontmatter(), mindMap.getGlobalClasses());
		if (this.controls.classDropdown) {
			this.controls.classDropdown.value = name;
		}
		this.updateSaveToClassVisibility();
		new Notice(`${scope === "global" ? "Global" : "Local"} class "${name}" created`);
	}

	/** Prompt to rename the currently selected class. */
	private promptRenameClass(): void {
		const mindMap = this.getActiveMindMap();
		if (!mindMap) return;

		const oldName = this.controls.classDropdown?.value;
		if (!oldName) {
			new Notice("Select a class to rename");
			return;
		}

		const modal = new Modal(this.app);
		modal.titleEl.setText("Rename class");

		let newName = oldName;
		new Setting(modal.contentEl)
			.setName("New name")
			.addText((text) => {
				text.setValue(oldName);
				text.onChange((value) => { newName = value.trim(); });
				setTimeout(() => { text.inputEl.focus(); text.inputEl.select(); }, 50);
				text.inputEl.addEventListener("keydown", (e) => {
					if (e.key === "Enter" && newName && newName !== oldName) {
						modal.close();
						void this.doRenameClass(oldName, newName);
					}
				});
			});

		const btnRow = modal.contentEl.createDiv({ cls: "modal-button-container" });
		btnRow.createEl("button", { text: "Cancel" })
			.addEventListener("click", () => modal.close());
		btnRow.createEl("button", { cls: "mod-cta", text: "Rename" })
			.addEventListener("click", () => {
				if (!newName || newName === oldName) return;
				modal.close();
				void this.doRenameClass(oldName, newName);
			});
		modal.open();
	}

	private async doRenameClass(oldName: string, newName: string): Promise<void> {
		const mindMap = this.getActiveMindMap();
		if (!mindMap) return;

		if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(newName)) {
			new Notice("Class name must start with a letter and contain only letters, numbers, hyphens, or underscores");
			return;
		}

		const fm = mindMap.getOsmosisStyleFrontmatter();
		const globalClasses = mindMap.getGlobalClasses();
		if (fm?.classes?.[newName] || globalClasses[newName]) {
			new Notice(`Class "${newName}" already exists`);
			return;
		}

		const scope = getClassScope(fm, oldName, globalClasses);
		if (scope === "local") {
			await mindMap.renameClassDefinition(oldName, newName);
		} else if (scope === "global") {
			await mindMap.renameGlobalClassDefinition(oldName, newName);
		}

		this.rebuildClassDropdown(mindMap.getOsmosisStyleFrontmatter(), mindMap.getGlobalClasses());
		if (this.controls.classDropdown) {
			this.controls.classDropdown.value = newName;
		}
		this.updateSaveToClassVisibility();
		new Notice(`Class renamed to "${newName}"`);
	}

	/** Confirm and delete the currently selected class. */
	private confirmDeleteClass(): void {
		const mindMap = this.getActiveMindMap();
		if (!mindMap) return;

		const className = this.controls.classDropdown?.value;
		if (!className) {
			new Notice("Select a class to delete");
			return;
		}

		const fm = mindMap.getOsmosisStyleFrontmatter();
		const scope = getClassScope(fm, className, mindMap.getGlobalClasses());
		const scopeLabel = scope === "global" ? "global " : "";

		const modal = new Modal(this.app);
		modal.titleEl.setText("Delete class");
		modal.contentEl.createEl("p", {
			text: `Delete ${scopeLabel}class "${className}"? This will also remove the class assignment from any nodes using it.`,
		});

		const btnRow = modal.contentEl.createDiv({ cls: "modal-button-container" });
		btnRow.createEl("button", { text: "Cancel" })
			.addEventListener("click", () => modal.close());
		btnRow.createEl("button", { cls: "mod-warning", text: "Delete" })
			.addEventListener("click", () => {
				modal.close();
				void this.doDeleteClass(className, scope ?? "local");
			});
		modal.open();
	}

	private async doDeleteClass(className: string, scope: "local" | "global"): Promise<void> {
		const mindMap = this.getActiveMindMap();
		if (!mindMap) return;

		if (scope === "local") {
			await mindMap.deleteClassDefinition(className);
		} else {
			await mindMap.deleteGlobalClassDefinition(className);
		}

		this.rebuildClassDropdown(mindMap.getOsmosisStyleFrontmatter(), mindMap.getGlobalClasses());
		if (this.controls.classDropdown) {
			this.controls.classDropdown.value = "";
		}
		this.updateSaveToClassVisibility();
		new Notice(`Class "${className}" deleted`);
	}

	/** Change a class's scope between local and global. */
	private async changeClassScope(): Promise<void> {
		const mindMap = this.getActiveMindMap();
		if (!mindMap) return;

		const className = this.controls.classDropdown?.value;
		if (!className) {
			new Notice("Select a class to change scope");
			return;
		}

		const fm = mindMap.getOsmosisStyleFrontmatter();
		const globalClasses = mindMap.getGlobalClasses();
		const currentScope = getClassScope(fm, className, globalClasses);
		if (!currentScope) return;

		const targetScope = currentScope === "local" ? "global" : "local";
		const targetLabel = targetScope === "global" ? "global (all notes)" : "local (this note)";

		// Check if a class with the same name already exists in the target scope
		if (targetScope === "local" && fm?.classes?.[className]) {
			new Notice(`A local class "${className}" already exists`);
			return;
		}
		if (targetScope === "global" && globalClasses[className]) {
			new Notice(`A global class "${className}" already exists`);
			return;
		}

		const modal = new Modal(this.app);
		modal.titleEl.setText("Change class scope");
		modal.contentEl.createEl("p", {
			text: `Move class "${className}" to ${targetLabel}?`,
		});

		const btnRow = modal.contentEl.createDiv({ cls: "modal-button-container" });
		btnRow.createEl("button", { text: "Cancel" })
			.addEventListener("click", () => modal.close());
		btnRow.createEl("button", { cls: "mod-cta", text: "Move" })
			.addEventListener("click", () => {
				modal.close();
				void this.doChangeClassScope(className, currentScope, targetScope);
			});
		modal.open();
	}

	private async doChangeClassScope(
		className: string,
		fromScope: "local" | "global",
		toScope: "local" | "global",
	): Promise<void> {
		const mindMap = this.getActiveMindMap();
		if (!mindMap) return;

		await mindMap.moveClassToScope(className, fromScope, toScope);

		this.rebuildClassDropdown(mindMap.getOsmosisStyleFrontmatter(), mindMap.getGlobalClasses());
		if (this.controls.classDropdown) {
			this.controls.classDropdown.value = className;
		}
		this.updateSaveToClassVisibility();
		const label = toScope === "global" ? "global" : "local";
		new Notice(`Class "${className}" moved to ${label} scope`);
	}

	/** Rebuild variant dropdown from frontmatter variants. */
	private rebuildVariantDropdown(): void {
		const dd = this.variantDropdown;
		if (!dd) return;

		const mindMap = this.getActiveMindMap();
		const fm = mindMap?.getOsmosisStyleFrontmatter();
		const variants = fm?.variants;
		const activeVariant = fm?.activeVariant ?? "";

		// Clear existing options
		while (dd.options.length > 0) dd.remove(0);

		// Add "(none)" option
		const noneOpt = document.createElement("option");
		noneOpt.value = "";
		noneOpt.textContent = "(none)";
		dd.appendChild(noneOpt);

		if (variants) {
			for (const name of Object.keys(variants)) {
				const opt = document.createElement("option");
				opt.value = name;
				opt.textContent = name;
				dd.appendChild(opt);
			}
		}

		dd.value = activeVariant;
		this.updateSaveToVariantVisibility();
	}

	/** Show/hide the "Save to variant" button based on whether a variant is active. */
	private updateSaveToVariantVisibility(): void {
		if (!this.saveToVariantBtn) return;
		const activeVariant = this.variantDropdown?.value;
		this.saveToVariantBtn.toggleClass("is-hidden", !activeVariant);
	}

	/** Prompt for a new variant name. */
	private promptNewVariant(): void {
		const mindMap = this.getActiveMindMap();
		if (!mindMap) return;

		const modal = new Modal(this.app);
		modal.titleEl.setText("New variant");

		let inputValue = "";
		new Setting(modal.contentEl)
			.setName("Variant name")
			.addText((text) => {
				text.setPlaceholder("Presentation");
				text.onChange((value) => { inputValue = value.trim(); });
				setTimeout(() => text.inputEl.focus(), 50);
				text.inputEl.addEventListener("keydown", (e) => {
					if (e.key === "Enter" && inputValue) {
						modal.close();
						void this.doCreateVariant(inputValue);
					}
				});
			});

		const btnRow = modal.contentEl.createDiv({ cls: "modal-button-container" });
		btnRow.createEl("button", { text: "Cancel" })
			.addEventListener("click", () => modal.close());
		btnRow.createEl("button", { cls: "mod-cta", text: "Create" })
			.addEventListener("click", () => {
				if (!inputValue) return;
				modal.close();
				void this.doCreateVariant(inputValue);
			});
		modal.open();
	}

	private async doCreateVariant(name: string): Promise<void> {
		const mindMap = this.getActiveMindMap();
		if (!mindMap) return;

		const fm = mindMap.getOsmosisStyleFrontmatter();
		if (fm?.variants?.[name]) {
			new Notice(`Variant "${name}" already exists`);
			return;
		}

		await mindMap.createVariant(name);

		this.rebuildVariantDropdown();
		if (this.variantDropdown) {
			this.variantDropdown.value = name;
		}
		this.updateSaveToVariantVisibility();
		new Notice(`Variant "${name}" created and activated`);
	}

	/**
	 * Save the selected node's local style overrides into the active variant,
	 * then clear the local overrides so the node inherits from the variant.
	 */
	private async saveStylesToVariant(): Promise<void> {
		const mindMap = this.getActiveMindMap();
		if (!mindMap) return;

		const variantName = this.variantDropdown?.value;
		if (!variantName) {
			new Notice("No variant is active");
			return;
		}

		const selection = mindMap.getSelectedNodeInfo();
		if (!selection?.primaryId) {
			new Notice("Select a node first");
			return;
		}

		const layoutNode = mindMap.getLayoutNodeById(selection.primaryId);
		if (!layoutNode) return;

		const fm = mindMap.getOsmosisStyleFrontmatter();
		const localStyle = lookupNodeStyle(fm, layoutNode);
		if (!localStyle) {
			new Notice("No local style overrides to save");
			return;
		}

		const styleToSave = { ...localStyle };
		delete styleToSave.class;

		if (Object.keys(styleToSave).length === 0) {
			new Notice("No local style overrides to save");
			return;
		}

		// Use node content as the variant selector key
		const nodeKey = layoutNode.source.content;
		if (!nodeKey) {
			new Notice("Cannot save style for this node type");
			return;
		}

		await mindMap.saveVariantNodeStyle(variantName, nodeKey, styleToSave);

		// Clear local overrides
		const ALL_VISUAL_KEYS: (keyof NodeStyle)[] =
			["shape", "fill", "border", "text", "branchLine", "background", "width"];
		await mindMap.resetNodeStyles(selection.nodeIds, ALL_VISUAL_KEYS);

		this.refreshFormatControls();
		new Notice(`Style saved to variant "${variantName}" for "${nodeKey}"`);
	}

	/** Prompt to rename the active variant. */
	private promptRenameVariant(): void {
		const mindMap = this.getActiveMindMap();
		if (!mindMap) return;

		const oldName = this.variantDropdown?.value;
		if (!oldName) {
			new Notice("No variant is active");
			return;
		}

		const modal = new Modal(this.app);
		modal.titleEl.setText("Rename variant");

		let newName = oldName;
		new Setting(modal.contentEl)
			.setName("New name")
			.addText((text) => {
				text.setValue(oldName);
				text.onChange((value) => { newName = value.trim(); });
				setTimeout(() => { text.inputEl.focus(); text.inputEl.select(); }, 50);
				text.inputEl.addEventListener("keydown", (e) => {
					if (e.key === "Enter" && newName && newName !== oldName) {
						modal.close();
						void this.doRenameVariant(oldName, newName);
					}
				});
			});

		const btnRow = modal.contentEl.createDiv({ cls: "modal-button-container" });
		btnRow.createEl("button", { text: "Cancel" })
			.addEventListener("click", () => modal.close());
		btnRow.createEl("button", { cls: "mod-cta", text: "Rename" })
			.addEventListener("click", () => {
				if (!newName || newName === oldName) return;
				modal.close();
				void this.doRenameVariant(oldName, newName);
			});
		modal.open();
	}

	private async doRenameVariant(oldName: string, newName: string): Promise<void> {
		const mindMap = this.getActiveMindMap();
		if (!mindMap) return;

		const fm = mindMap.getOsmosisStyleFrontmatter();
		if (fm?.variants?.[newName]) {
			new Notice(`Variant "${newName}" already exists`);
			return;
		}

		await mindMap.renameVariant(oldName, newName);

		this.rebuildVariantDropdown();
		if (this.variantDropdown) {
			this.variantDropdown.value = newName;
		}
		new Notice(`Variant renamed to "${newName}"`);
	}

	/** Confirm and delete the active variant. */
	private confirmDeleteVariant(): void {
		const mindMap = this.getActiveMindMap();
		if (!mindMap) return;

		const variantName = this.variantDropdown?.value;
		if (!variantName) {
			new Notice("No variant is active");
			return;
		}

		const modal = new Modal(this.app);
		modal.titleEl.setText("Delete variant");
		modal.contentEl.createEl("p", {
			text: `Delete variant "${variantName}"? All style overrides in this variant will be lost.`,
		});

		const btnRow = modal.contentEl.createDiv({ cls: "modal-button-container" });
		btnRow.createEl("button", { text: "Cancel" })
			.addEventListener("click", () => modal.close());
		btnRow.createEl("button", { cls: "mod-warning", text: "Delete" })
			.addEventListener("click", () => {
				modal.close();
				void this.doDeleteVariant(variantName);
			});
		modal.open();
	}

	private async doDeleteVariant(variantName: string): Promise<void> {
		const mindMap = this.getActiveMindMap();
		if (!mindMap) return;

		await mindMap.deleteVariant(variantName);

		this.rebuildVariantDropdown();
		this.updateSaveToVariantVisibility();
		new Notice(`Variant "${variantName}" deleted`);
	}

	// ─── Map Tab: Global Style Sections ─────────────────────

	/** Create a collapsible section in the Map tab, matching Format tab pattern. */
	private renderMapStyleSection(
		container: HTMLElement,
		label: string,
		renderBody: (body: HTMLElement) => void,
	): void {
		const sectionEl = container.createDiv({ cls: "osmosis-format-section" });
		const header = sectionEl.createDiv({ cls: "osmosis-format-section-header" });
		const chevron = header.createSpan({ cls: "osmosis-chevron-icon" });
		setIcon(chevron, "chevron-right");
		header.createSpan({ text: label });

		// Per-section reset button
		const resetBtn = header.createEl("button", {
			cls: "osmosis-format-section-reset-btn",
			attr: { "aria-label": `Reset ${label.toLowerCase()}` },
		});
		resetBtn.textContent = "\u21BA";
		resetBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			void this.resetMapStyleSection(label);
		});

		const body = sectionEl.createDiv({ cls: "osmosis-format-section-body" });
		renderBody(body);

		header.addEventListener("click", () => {
			sectionEl.toggleClass("is-collapsed", !sectionEl.hasClass("is-collapsed"));
		});
	}

	/** Save a map-level base style property and re-render. */
	private async saveBaseStyleProp(update: Partial<NodeStyle>): Promise<void> {
		if (!this.currentFilePath) return;
		const filePath = this.currentFilePath;
		const perNote = this.plugin.settings.mapSettings[filePath] ?? {};
		this.plugin.settings.mapSettings[filePath] = perNote;

		const base: NodeStyle = perNote.baseStyle ?? {};
		// Merge update into base, handling sub-objects
		mergeNodeStyle(base, update as NodeStyle);
		perNote.baseStyle = base;

		await this.plugin.saveSettings();
		const mindMap = this.getActiveMindMap();
		if (mindMap) mindMap.applyMapSettings(this.getEffectiveSettings());
	}

	/** Reset specific map-level style keys. */
	private async resetMapStyleSection(section: string): Promise<void> {
		if (!this.currentFilePath) return;
		const filePath = this.currentFilePath;
		const perNote = this.plugin.settings.mapSettings[filePath];
		if (!perNote) return;

		switch (section) {
			case "Background":
				delete perNote.background;
				break;
			case "Default fill":
				if (perNote.baseStyle) {
					delete perNote.baseStyle.fill;
					delete perNote.baseStyle.background;
					if (Object.keys(perNote.baseStyle).length === 0) delete perNote.baseStyle;
				}
				break;
			case "Default border":
				if (perNote.baseStyle) {
					delete perNote.baseStyle.border;
					if (Object.keys(perNote.baseStyle).length === 0) delete perNote.baseStyle;
				}
				break;
			case "Default text":
				if (perNote.baseStyle) {
					delete perNote.baseStyle.text;
					if (Object.keys(perNote.baseStyle).length === 0) delete perNote.baseStyle;
				}
				break;
			case "Branch line":
				delete perNote.branchLineColor;
				delete perNote.branchLineThickness;
				break;
		}

		if (Object.keys(perNote).length === 0) {
			delete this.plugin.settings.mapSettings[filePath];
		}

		await this.plugin.saveSettings();
		const mindMap = this.getActiveMindMap();
		if (mindMap) mindMap.applyMapSettings(this.getEffectiveSettings());
		this.refreshMapStyleControls();
	}

	/** Get the resolved value for a map-level style property (map override ?? theme default). */
	private getResolvedThemeBase(): { base: NodeStyle; theme: ThemeDefinition | undefined } {
		const mindMap = this.getActiveMindMap();
		const theme = mindMap?.getActiveTheme();
		const settings = this.getEffectiveSettings();
		const base: NodeStyle = { ...(theme?.base ?? {}) };
		if (settings.baseStyle) mergeNodeStyle(base, settings.baseStyle);
		return { base, theme };
	}

	private renderMapBackgroundSection(body: HTMLElement): void {
		const setting = new Setting(body).setName("Color");
		const swatch = setting.controlEl.createDiv({ cls: "osmosis-color-swatch-btn" });
		this.mapBackgroundSwatch = swatch;

		swatch.addEventListener("click", () => {
			this.openColorPicker(swatch, swatch.style.backgroundColor || "#ffffff", (color) => {
				void this.saveMapScalarSetting("background", color);
			});
		});
	}

	private renderMapFillSection(body: HTMLElement): void {
		const settings = this.getEffectiveSettings();

		// Topic shape
		new Setting(body)
			.setName("Topic shape")
			.addDropdown((dropdown) => {
				this.mapTopicShapeDropdown = dropdown.selectEl;
				for (const [value, label] of Object.entries(SHAPE_LABELS)) {
					dropdown.addOption(value, label);
				}
				dropdown
					.setValue(settings.topicShape)
					.onChange(async (value) => {
						await this.saveSetting("topicShape", value as TopicShape);
					});
			});

		// Fill color
		const setting = new Setting(body).setName("Color");
		const swatch = setting.controlEl.createDiv({ cls: "osmosis-color-swatch-btn" });
		this.mapFillSwatch = swatch;

		swatch.addEventListener("click", () => {
			this.openColorPicker(swatch, swatch.style.backgroundColor || "#ffffff", (color) => {
				void this.saveBaseStyleProp({ fill: color });
				this.refreshMapStyleControls();
			});
		});
	}

	private renderMapBorderSection(body: HTMLElement): void {
		// Color
		const colorSetting = new Setting(body).setName("Color");
		const colorSwatch = colorSetting.controlEl.createDiv({ cls: "osmosis-color-swatch-btn" });
		this.mapBorderColorSwatch = colorSwatch;

		colorSwatch.addEventListener("click", () => {
			this.openColorPicker(colorSwatch, colorSwatch.style.backgroundColor || "#000000", (color) => {
				void this.saveBaseStyleProp({ border: { color } });
				this.refreshMapStyleControls();
			});
		});

		// Width
		new Setting(body)
			.setName("Width")
			.addSlider((slider) => {
				slider
					.setLimits(0, 8, 1)
					.setValue(1)
					.setDynamicTooltip()
					.onChange(async (value) => {
						await this.saveBaseStyleProp({ border: { width: value } });
						this.refreshMapStyleControls();
					});
				this.mapBorderWidthSlider = slider.sliderEl;
			});

		// Style
		new Setting(body)
			.setName("Style")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("solid", "Solid")
					.addOption("dashed", "Dashed")
					.addOption("dotted", "Dotted")
					.addOption("none", "None")
					.onChange(async (value) => {
						await this.saveBaseStyleProp({
							border: { style: value as "solid" | "dashed" | "dotted" | "none" },
						});
						this.refreshMapStyleControls();
					});
				this.mapBorderStyleDropdown = dropdown.selectEl;
			});
	}

	private renderMapTextSection(body: HTMLElement): void {
		// Font family
		const fontContainer = body.createDiv({ cls: "osmosis-format-font-row" });
		const fontLabel = new Setting(fontContainer).setName("Font family");
		const fontPickerEl = fontLabel.controlEl.createDiv();
		const fp = new FontPicker({
			app: this.app,
			plugin: this.plugin,
			initialFont: "",
			onChange: (font) => {
				void this.saveBaseStyleProp({ text: { font: font || undefined } });
				this.refreshMapStyleControls();
			},
		});
		void fp.render(fontPickerEl);
		this.mapTextFontPicker = fp;

		// Size
		new Setting(body)
			.setName("Size")
			.addSlider((slider) => {
				slider
					.setLimits(8, 48, 1)
					.setValue(14)
					.setDynamicTooltip()
					.onChange(async (value) => {
						await this.saveBaseStyleProp({ text: { size: value } });
						this.refreshMapStyleControls();
					});
				this.mapTextSizeSlider = slider.sliderEl;
			});

		// Weight
		new Setting(body)
			.setName("Weight")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("400", "Normal")
					.addOption("700", "Bold")
					.onChange(async (value) => {
						await this.saveBaseStyleProp({ text: { weight: Number(value) } });
						this.refreshMapStyleControls();
					});
				this.mapTextWeightDropdown = dropdown.selectEl;
			});

		// Color
		const textColorSetting = new Setting(body).setName("Color");
		const textColorSwatch = textColorSetting.controlEl.createDiv({ cls: "osmosis-color-swatch-btn" });
		this.mapTextColorSwatch = textColorSwatch;

		textColorSwatch.addEventListener("click", () => {
			this.openColorPicker(textColorSwatch, textColorSwatch.style.backgroundColor || "#000000", (color) => {
				void this.saveBaseStyleProp({ text: { color } });
				this.refreshMapStyleControls();
			});
		});

		// Alignment
		const alignSetting = new Setting(body).setName("Alignment");
		const alignGroup = alignSetting.controlEl.createDiv({ cls: "osmosis-align-group" });
		this.mapTextAlignBtns = alignGroup;

		for (const align of ["left", "center", "right", "justify"] as const) {
			const btn = alignGroup.createEl("button", {
				cls: "osmosis-align-btn",
				attr: { "data-align": align },
			});
			setIcon(btn, `align-${align}`);
			btn.setAttribute("title", align.charAt(0).toUpperCase() + align.slice(1));
			btn.addEventListener("click", () => {
				void this.saveBaseStyleProp({ text: { alignment: align } });
				this.refreshMapStyleControls();
			});
		}
	}

	private renderMapBranchLineSection(body: HTMLElement): void {
		const settings = this.getEffectiveSettings();

		// Branch line style
		new Setting(body)
			.setName("Style")
			.addDropdown((dropdown) => {
				this.mapBranchStyleDropdown = dropdown.selectEl;
				dropdown
					.addOption("curved", "Curved")
					.addOption("straight", "Straight")
					.addOption("angular", "Angular")
					.addOption("rounded-elbow", "Rounded elbow")
					.setValue(settings.branchLineStyle)
					.onChange(async (value) => {
						await this.saveSetting("branchLineStyle", value as BranchLineStyle);
					});
			});

		// Color
		const colorSetting = new Setting(body).setName("Color");
		const colorSwatch = colorSetting.controlEl.createDiv({ cls: "osmosis-color-swatch-btn" });
		this.mapBranchColorSwatch = colorSwatch;

		colorSwatch.addEventListener("click", () => {
			this.openColorPicker(colorSwatch, colorSwatch.style.backgroundColor || "#888888", (color) => {
				void this.saveMapScalarSetting("branchLineColor", color);
				this.refreshMapStyleControls();
			});
		});

		// Thickness
		new Setting(body)
			.setName("Thickness")
			.addSlider((slider) => {
				slider
					.setLimits(1, 8, 1)
					.setValue(2)
					.setDynamicTooltip()
					.onChange(async (value) => {
						void this.saveMapScalarSetting("branchLineThickness", value);
						this.refreshMapStyleControls();
					});
				this.mapBranchThicknessSlider = slider.sliderEl;
			});
	}

	/** Save a scalar map setting (background, branchLineColor, branchLineThickness). */
	private async saveMapScalarSetting<K extends "background" | "branchLineColor" | "branchLineThickness">(
		key: K,
		value: MapSettings[K],
	): Promise<void> {
		if (!this.currentFilePath) return;
		const filePath = this.currentFilePath;
		const perNote = this.plugin.settings.mapSettings[filePath] ?? {};
		this.plugin.settings.mapSettings[filePath] = perNote;

		if (value === undefined || value === "") {
			delete perNote[key];
		} else {
			(perNote as Record<string, unknown>)[key] = value;
		}

		if (Object.keys(perNote).length === 0) {
			delete this.plugin.settings.mapSettings[filePath];
		}

		await this.plugin.saveSettings();
		const mindMap = this.getActiveMindMap();
		if (mindMap) mindMap.applyMapSettings(this.getEffectiveSettings());
	}

	/** Refresh all map style section controls with resolved values. */
	private refreshMapStyleControls(): void {
		const settings = this.getEffectiveSettings();
		const { base, theme } = this.getResolvedThemeBase();

		// Background
		if (this.mapBackgroundSwatch) {
			const bg = settings.background ?? theme?.background ?? "";
			this.mapBackgroundSwatch.style.backgroundColor = bg;
		}

		// Fill
		if (this.mapFillSwatch) {
			this.mapFillSwatch.style.backgroundColor = base.fill ?? "";
		}

		// Border
		if (this.mapBorderColorSwatch) {
			this.mapBorderColorSwatch.style.backgroundColor = base.border?.color ?? "";
		}
		if (this.mapBorderWidthSlider) {
			this.mapBorderWidthSlider.value = String(base.border?.width ?? 1);
		}
		if (this.mapBorderStyleDropdown) {
			this.mapBorderStyleDropdown.value = base.border?.style ?? "solid";
		}

		// Text
		if (this.mapTextFontPicker) {
			this.mapTextFontPicker.setFont(base.text?.font ?? "");
		}
		if (this.mapTextSizeSlider) {
			this.mapTextSizeSlider.value = String(base.text?.size ?? 14);
		}
		if (this.mapTextWeightDropdown) {
			this.mapTextWeightDropdown.value = String(base.text?.weight ?? 400);
		}
		if (this.mapTextColorSwatch) {
			this.mapTextColorSwatch.style.backgroundColor = base.text?.color ?? "";
		}
		if (this.mapTextAlignBtns) {
			const active = base.text?.alignment ?? "left";
			for (const btn of Array.from(this.mapTextAlignBtns.children) as HTMLElement[]) {
				btn.toggleClass("is-active", btn.getAttribute("data-align") === active);
			}
		}

		// Branch line
		if (this.mapBranchColorSwatch) {
			this.mapBranchColorSwatch.style.backgroundColor =
				settings.branchLineColor ?? theme?.branchLine?.color ?? "";
		}
		if (this.mapBranchThicknessSlider) {
			this.mapBranchThicknessSlider.value = String(
				settings.branchLineThickness ?? theme?.branchLine?.thickness ?? 2,
			);
		}

		// Layout controls
		if (this.mapDirectionDropdown) {
			this.mapDirectionDropdown.value = settings.direction;
		}
		if (this.mapCollapseSlider) {
			this.mapCollapseSlider.value = String(settings.collapseDepth);
		}
		if (this.mapHSpacingSlider) {
			this.mapHSpacingSlider.value = String(settings.horizontalSpacing);
		}
		if (this.mapVSpacingSlider) {
			this.mapVSpacingSlider.value = String(settings.verticalSpacing);
		}
		if (this.mapBranchStyleDropdown) {
			this.mapBranchStyleDropdown.value = settings.branchLineStyle;
		}
		if (this.mapTopicShapeDropdown) {
			this.mapTopicShapeDropdown.value = settings.topicShape;
		}
	}

	// ─── Theme Management ────────────────────────────────────

	/** Show/hide the rename/delete buttons based on whether a custom theme is active. */
	private updateThemeMgmtVisibility(): void {
		const themeName = this.themeDropdown?.value ?? "";
		const isCustom = themeName !== "" && !isPresetTheme(themeName);
		this.renameThemeBtn?.toggleClass("is-hidden", !isCustom);
		this.deleteThemeBtn?.toggleClass("is-hidden", !isCustom);
	}

	/** Show/hide the save-to-theme button (only for custom themes). */
	private updateSaveThemeVisibility(): void {
		const themeName = this.themeDropdown?.value ?? "";
		const isCustom = themeName !== "" && !isPresetTheme(themeName);
		this.saveThemeBtn?.toggleClass("is-hidden", !isCustom);
	}

	/** Save current map settings back into the active custom theme. */
	private async saveToCurrentTheme(): Promise<void> {
		const themeName = this.themeDropdown?.value;
		if (!themeName || isPresetTheme(themeName)) return;

		const theme = this.extractThemeFromMap(themeName);
		this.plugin.settings.customThemes[themeName] = theme;
		await this.plugin.saveSettings();
		new Notice(`Theme "${themeName}" updated`);
	}

	/** Extract the current map's resolved styling into a new ThemeDefinition. */
	private extractThemeFromMap(name: string): ThemeDefinition {
		const mindMap = this.getActiveMindMap();
		const activeTheme = mindMap?.getActiveTheme();
		const fm = mindMap?.getOsmosisStyleFrontmatter();
		const nodeMap = mindMap?.getNodeMap();
		const globalClasses = mindMap?.getGlobalClasses() ?? {};
		const settings = this.getEffectiveSettings();

		// Start from the current theme as a base, or empty
		const base: NodeStyle = activeTheme?.base ? { ...activeTheme.base } : {};
		const depths: Record<string, NodeStyle> = {};

		if (activeTheme?.depths) {
			for (const [d, style] of Object.entries(activeTheme.depths)) {
				depths[d] = { ...style };
			}
		}

		// Walk all nodes and collect per-depth local overrides to fold into depth styles.
		// For each depth level, if any node has local overrides, merge them into that depth's style.
		// This captures the "design by example" pattern — style a real map, extract the pattern.
		if (nodeMap && fm?.styles) {
			const depthOverrides = new Map<number, NodeStyle[]>();
			for (const [, layoutNode] of nodeMap) {
				if (layoutNode.source.type === "root") continue;
				const stableKey = `_n:${layoutNode.source.id}`;
				const localStyle = fm.styles[stableKey];
				if (!localStyle) continue;
				const depth = layoutNode.source.type === "heading" ? layoutNode.source.depth : 0;
				if (!depthOverrides.has(depth)) depthOverrides.set(depth, []);
				depthOverrides.get(depth)!.push(localStyle);
			}

			// For each depth, merge overrides into the depth style.
			// If multiple nodes at the same depth have different overrides, the last one wins
			// (deterministic since nodeMap insertion order is tree order).
			for (const [depth, overrides] of depthOverrides) {
				const key = String(depth);
				if (!depths[key]) depths[key] = {};
				for (const override of overrides) {
					// Strip class reference — that's metadata, not a theme property
					// eslint-disable-next-line @typescript-eslint/no-unused-vars
				const { class: _cls, width: _w, ...styleProps } = override;
					Object.assign(depths[key], styleProps);
					if (styleProps.text) {
						depths[key].text = { ...depths[key].text, ...styleProps.text };
					}
					if (styleProps.border) {
						depths[key].border = { ...depths[key].border, ...styleProps.border };
					}
					if (styleProps.branchLine) {
						depths[key].branchLine = { ...depths[key].branchLine, ...styleProps.branchLine };
					}
				}
			}
		}

		// Also fold in class-level styles that are used by nodes
		if (nodeMap && fm) {
			for (const [, layoutNode] of nodeMap) {
				if (layoutNode.source.type === "root") continue;
				const stableKey = `_n:${layoutNode.source.id}`;
				const localStyle = fm.styles?.[stableKey];
				const className = localStyle?.class;
				if (!className) continue;
				const classStyle = lookupClassStyle(fm, className, globalClasses);
				if (!classStyle) continue;
				const depth = layoutNode.source.type === "heading" ? layoutNode.source.depth : 0;
				const key = String(depth);
				if (!depths[key]) depths[key] = {};
				// Merge class style as a weaker layer (local overrides already applied above)
				const existing = depths[key];
				if (!existing.fill && classStyle.fill) existing.fill = classStyle.fill;
				if (!existing.shape && classStyle.shape) existing.shape = classStyle.shape;
				if (classStyle.text) {
					existing.text = { ...classStyle.text, ...existing.text };
				}
				if (classStyle.border) {
					existing.border = { ...classStyle.border, ...existing.border };
				}
				if (classStyle.branchLine) {
					existing.branchLine = { ...classStyle.branchLine, ...existing.branchLine };
				}
			}
		}

		// Merge map-level baseStyle overrides into the extracted base
		if (settings.baseStyle) {
			mergeNodeStyle(base, settings.baseStyle);
		}

		// Build branch line from theme + map overrides (including style)
		const branchLine = activeTheme?.branchLine ? { ...activeTheme.branchLine } : undefined;
		const hasBranchOverrides = settings.branchLineColor || settings.branchLineThickness ||
			settings.branchLineStyle !== DEFAULT_MAP_SETTINGS.branchLineStyle;
		const extractedBranchLine = branchLine ?? (hasBranchOverrides ? {} : undefined);
		if (extractedBranchLine) {
			if (settings.branchLineColor) extractedBranchLine.color = settings.branchLineColor;
			if (settings.branchLineThickness) extractedBranchLine.thickness = settings.branchLineThickness;
			if (settings.branchLineStyle !== DEFAULT_MAP_SETTINGS.branchLineStyle) {
				extractedBranchLine.style = settings.branchLineStyle;
			}
		}

		return {
			name,
			base,
			depths,
			coloredBranches: activeTheme?.coloredBranches,
			branchColors: activeTheme?.branchColors ? [...activeTheme.branchColors] : undefined,
			branchLine: extractedBranchLine,
			background: settings.background ?? activeTheme?.background,
			collapseToggle: activeTheme?.collapseToggle ? { ...activeTheme.collapseToggle } : undefined,
			topicShape: settings.topicShape !== DEFAULT_MAP_SETTINGS.topicShape ? settings.topicShape : activeTheme?.topicShape,
			direction: settings.direction !== DEFAULT_MAP_SETTINGS.direction ? settings.direction : activeTheme?.direction,
			collapseDepth: settings.collapseDepth !== DEFAULT_MAP_SETTINGS.collapseDepth ? settings.collapseDepth : activeTheme?.collapseDepth,
			horizontalSpacing: settings.horizontalSpacing !== DEFAULT_MAP_SETTINGS.horizontalSpacing ? settings.horizontalSpacing : activeTheme?.horizontalSpacing,
			verticalSpacing: settings.verticalSpacing !== DEFAULT_MAP_SETTINGS.verticalSpacing ? settings.verticalSpacing : activeTheme?.verticalSpacing,
		};
	}

	/** Prompt the user to name a new theme extracted from the current map. */
	private promptExtractTheme(): void {
		const mindMap = this.getActiveMindMap();
		if (!mindMap) {
			new Notice("No active mind map");
			return;
		}

		const modal = new Modal(this.app);
		modal.titleEl.setText("Save current map as theme");

		let inputValue = "";
		new Setting(modal.contentEl)
			.setName("Theme name")
			.addText((text) => {
				text.setPlaceholder("My custom theme");
				text.onChange((v) => { inputValue = v.trim(); });
				// Focus and select on open
				setTimeout(() => text.inputEl.focus(), 50);
			});

		const btnRow = modal.contentEl.createDiv({ cls: "modal-button-container" });
		btnRow.createEl("button", { text: "Cancel" })
			.addEventListener("click", () => modal.close());
		btnRow.createEl("button", { cls: "mod-cta", text: "Save" })
			.addEventListener("click", () => {
				if (!inputValue) {
					new Notice("Theme name cannot be empty");
					return;
				}
				if (isPresetTheme(inputValue)) {
					new Notice("Cannot overwrite a built-in theme");
					return;
				}
				modal.close();
				void this.doExtractTheme(inputValue);
			});
		modal.open();
	}

	private async doExtractTheme(name: string): Promise<void> {
		const theme = this.extractThemeFromMap(name);
		this.plugin.settings.customThemes[name] = theme;
		await this.plugin.saveSettings();

		// Switch the current map to the new theme
		await this.saveSetting("theme", name);

		// Rebuild dropdown and update UI
		this.rebuildThemeDropdown();
		this.updateThemeMgmtVisibility();
		this.updateSaveThemeVisibility();
		new Notice(`Theme "${name}" saved`);
	}

	/** Rebuild the theme dropdown from presets + custom themes. */
	private rebuildThemeDropdown(): void {
		const dd = this.themeDropdown;
		if (!dd) return;

		const currentVal = dd.value;
		while (dd.options.length > 0) dd.remove(0);

		for (const name of getThemeNames(this.plugin.settings.customThemes)) {
			const opt = document.createElement("option");
			opt.value = name;
			opt.textContent = name;
			dd.appendChild(opt);
		}

		dd.value = currentVal;
	}

	/** Prompt to rename the current custom theme. */
	private promptRenameTheme(): void {
		const oldName = this.themeDropdown?.value;
		if (!oldName || isPresetTheme(oldName)) return;

		const modal = new Modal(this.app);
		modal.titleEl.setText("Rename theme");

		let inputValue = oldName;
		new Setting(modal.contentEl)
			.setName("New name")
			.addText((text) => {
				text.setValue(oldName);
				text.onChange((v) => { inputValue = v.trim(); });
				setTimeout(() => { text.inputEl.focus(); text.inputEl.select(); }, 50);
			});

		const btnRow = modal.contentEl.createDiv({ cls: "modal-button-container" });
		btnRow.createEl("button", { text: "Cancel" })
			.addEventListener("click", () => modal.close());
		btnRow.createEl("button", { cls: "mod-cta", text: "Rename" })
			.addEventListener("click", () => {
				if (!inputValue || inputValue === oldName) {
					modal.close();
					return;
				}
				if (isPresetTheme(inputValue)) {
					new Notice("Cannot use a built-in theme name");
					return;
				}
				if (this.plugin.settings.customThemes[inputValue]) {
					new Notice("A custom theme with that name already exists");
					return;
				}
				modal.close();
				void this.doRenameTheme(oldName, inputValue);
			});
		modal.open();
	}

	private async doRenameTheme(oldName: string, newName: string): Promise<void> {
		const themes = this.plugin.settings.customThemes;
		const theme = themes[oldName];
		if (!theme) return;

		theme.name = newName;
		themes[newName] = theme;
		delete themes[oldName];

		// Update any per-map settings that reference the old name
		for (const [, mapSettings] of Object.entries(this.plugin.settings.mapSettings)) {
			if (mapSettings.theme === oldName) {
				mapSettings.theme = newName;
			}
		}

		await this.plugin.saveSettings();

		// If the current map was using the old name, update it
		const settings = this.getEffectiveSettings();
		if (settings.theme === oldName) {
			await this.saveSetting("theme", newName);
		}

		this.rebuildThemeDropdown();
		if (this.themeDropdown) this.themeDropdown.value = newName;
		this.updateThemeMgmtVisibility();
		this.updateSaveThemeVisibility();
		new Notice(`Theme renamed to "${newName}"`);
	}

	/** Confirm and delete the current custom theme. */
	private confirmDeleteTheme(): void {
		const themeName = this.themeDropdown?.value;
		if (!themeName || isPresetTheme(themeName)) return;

		const modal = new Modal(this.app);
		modal.titleEl.setText("Delete theme");
		modal.contentEl.createEl("p", {
			text: `Delete custom theme "${themeName}"? Maps using it will revert to the Default theme.`,
		});

		const btnRow = modal.contentEl.createDiv({ cls: "modal-button-container" });
		btnRow.createEl("button", { text: "Cancel" })
			.addEventListener("click", () => modal.close());
		btnRow.createEl("button", { cls: "mod-warning", text: "Delete" })
			.addEventListener("click", () => {
				modal.close();
				void this.doDeleteTheme(themeName);
			});
		modal.open();
	}

	private async doDeleteTheme(themeName: string): Promise<void> {
		delete this.plugin.settings.customThemes[themeName];

		// Revert any per-map settings that reference this theme to Default
		for (const [, mapSettings] of Object.entries(this.plugin.settings.mapSettings)) {
			if (mapSettings.theme === themeName) {
				delete mapSettings.theme; // defaults back to "Default"
			}
		}

		await this.plugin.saveSettings();

		// If the current map was using this theme, switch to Default
		const settings = this.getEffectiveSettings();
		if (settings.theme === themeName || !settings.theme) {
			await this.saveSetting("theme", "Default");
		}

		this.rebuildThemeDropdown();
		if (this.themeDropdown) this.themeDropdown.value = "Default";
		this.updateThemeMgmtVisibility();
		this.updateSaveThemeVisibility();
		new Notice(`Theme "${themeName}" deleted`);
	}

	/** Rebuild the class dropdown options from local and global classes. */
	private rebuildClassDropdown(
		fm: OsmosisStyleFrontmatter | undefined,
		globalClasses?: Record<string, NodeStyle>,
	): void {
		const dd = this.controls.classDropdown;
		if (!dd) return;
		const currentVal = dd.value;
		// Remove all options except the first "(none)"
		while (dd.options.length > 1) dd.remove(1);

		// Local classes (per-note)
		if (fm?.classes) {
			for (const name of Object.keys(fm.classes)) {
				const opt = document.createElement("option");
				opt.value = name;
				opt.textContent = name;
				dd.appendChild(opt);
			}
		}

		// Global classes (skip if same name exists locally — local shadows global)
		if (globalClasses) {
			for (const name of Object.keys(globalClasses)) {
				if (fm?.classes?.[name]) continue; // local shadows global
				const opt = document.createElement("option");
				opt.value = name;
				opt.textContent = `${name} (global)`;
				dd.appendChild(opt);
			}
		}

		dd.value = currentVal;
	}

	private renderShapeSection(body: HTMLElement): void {
		new Setting(body)
			.setName("Shape")
			.addDropdown((dropdown) => {
				dropdown.addOption("inherit", "(inherit)");
				for (const [value, label] of Object.entries(SHAPE_LABELS)) {
					dropdown.addOption(value, label);
				}
				dropdown.onChange(async (value) => {
					if (value === "inherit") {
						await this.resetSelectedNodeStyles(["shape"]);
					} else {
						await this.writeNodeStyle({ shape: value as TopicShape });
					}
				});
				this.controls.shapeDropdown = dropdown.selectEl;
			});

		// Node width (custom content width via drag-to-resize or manual input)
		new Setting(body)
			.setName("Width")
			.setDesc("Content width in px (blank = auto)")
			.addText((text) => {
				text.setPlaceholder("Auto");
				text.inputEl.type = "number";
				text.inputEl.setCssStyles({ width: "70px" });
				text.inputEl.min = "40";
				const applyWidth = (): void => {
					const raw = text.inputEl.value.trim();
					if (raw === "") {
						void this.resetSelectedNodeStyles(["width"]);
					} else {
						const val = parseInt(raw, 10);
						if (!isNaN(val) && val >= 40) {
							void this.writeNodeStyle({ width: val });
						}
					}
				};
				text.inputEl.addEventListener("change", applyWidth);
				text.inputEl.addEventListener("keydown", (e) => {
					if (e.key === "Enter") applyWidth();
				});
				this.controls.nodeWidthInput = text.inputEl;
			});
	}

	private renderFillSection(body: HTMLElement): void {
		const setting = new Setting(body).setName("Color");
		const swatch = setting.controlEl.createDiv({ cls: "osmosis-color-swatch-btn" });
		this.controls.fillSwatch = swatch;

		swatch.addEventListener("click", () => {
			this.openColorPicker(swatch, swatch.style.backgroundColor || "#ffffff", (color) => {
				void this.writeNodeStyle({ fill: color });
			});
		});
	}

	private renderBorderSection(body: HTMLElement): void {
		// Color
		const colorSetting = new Setting(body).setName("Color");
		const colorSwatch = colorSetting.controlEl.createDiv({ cls: "osmosis-color-swatch-btn" });
		this.controls.borderColorSwatch = colorSwatch;

		colorSwatch.addEventListener("click", () => {
			this.openColorPicker(colorSwatch, colorSwatch.style.backgroundColor || "#000000", (color) => {
				void this.writeNodeStyle({ border: { color } });
			});
		});

		// Width
		new Setting(body)
			.setName("Width")
			.addSlider((slider) => {
				slider
					.setLimits(0, 8, 1)
					.setValue(1)
					.setDynamicTooltip()
					.onChange(async (value) => {
						await this.writeNodeStyle({ border: { width: value } });
					});
				this.controls.borderWidthSlider = slider.sliderEl;
			});

		// Style
		new Setting(body)
			.setName("Style")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("inherit", "(inherit)")
					.addOption("solid", "Solid")
					.addOption("dashed", "Dashed")
					.addOption("dotted", "Dotted")
					.addOption("none", "None")
					.onChange(async (value) => {
						if (value === "inherit") {
							await this.writeNodeStyle({ border: { style: undefined } });
						} else {
							await this.writeNodeStyle({
								border: { style: value as "solid" | "dashed" | "dotted" | "none" },
							});
						}
					});
				this.controls.borderStyleDropdown = dropdown.selectEl;
			});
	}

	private renderTextSection(body: HTMLElement): void {
		// Font family
		const fontContainer = body.createDiv({ cls: "osmosis-format-font-row" });
		const fontLabel = new Setting(fontContainer).setName("Font family");
		const fontPickerEl = fontLabel.controlEl.createDiv();
		const fp = new FontPicker({
			app: this.app,
			plugin: this.plugin,
			initialFont: "",
			onChange: (font) => {
				void this.writeNodeStyle({ text: { font: font || undefined } });
			},
		});
		void fp.render(fontPickerEl);
		this.controls.fontPicker = fp;

		// Size
		new Setting(body)
			.setName("Size")
			.addSlider((slider) => {
				slider
					.setLimits(8, 48, 1)
					.setValue(14)
					.setDynamicTooltip()
					.onChange(async (value) => {
						await this.writeNodeStyle({ text: { size: value } });
					});
				this.controls.textSizeSlider = slider.sliderEl;
			});

		// Weight
		new Setting(body)
			.setName("Weight")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("inherit", "(inherit)")
					.addOption("400", "Normal")
					.addOption("700", "Bold")
					.onChange(async (value) => {
						if (value === "inherit") {
							await this.writeNodeStyle({ text: { weight: undefined } });
						} else {
							await this.writeNodeStyle({ text: { weight: Number(value) } });
						}
					});
				this.controls.textWeightDropdown = dropdown.selectEl;
			});

		// Color
		const textColorSetting = new Setting(body).setName("Color");
		const textColorSwatch = textColorSetting.controlEl.createDiv({ cls: "osmosis-color-swatch-btn" });
		this.controls.textColorSwatch = textColorSwatch;

		textColorSwatch.addEventListener("click", () => {
			this.openColorPicker(textColorSwatch, textColorSwatch.style.backgroundColor || "#000000", (color) => {
				void this.writeNodeStyle({ text: { color } });
			});
		});

		// Alignment
		const alignSetting = new Setting(body).setName("Alignment");
		const alignGroup = alignSetting.controlEl.createDiv({ cls: "osmosis-align-group" });
		this.controls.textAlignBtns = alignGroup;

		for (const align of ["left", "center", "right", "justify"] as const) {
			const btn = alignGroup.createEl("button", {
				cls: "osmosis-align-btn",
				attr: { "data-align": align },
			});
			setIcon(btn, `align-${align}`);
			btn.setAttribute("title", align.charAt(0).toUpperCase() + align.slice(1));
			btn.addEventListener("click", () => {
				void this.writeNodeStyle({ text: { alignment: align } });
			});
		}
	}

	private renderBranchLineSection(body: HTMLElement): void {
		// Shape (line style)
		new Setting(body)
			.setName("Shape")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("inherit", "(inherit)")
					.addOption("curved", "Curved")
					.addOption("straight", "Straight")
					.addOption("angular", "Angular")
					.addOption("rounded-elbow", "Rounded elbow")
					.onChange(async (value) => {
						if (value === "inherit") {
							await this.writeNodeStyle({ branchLine: { style: undefined } });
						} else {
							await this.writeNodeStyle({
								branchLine: { style: value as "curved" | "straight" | "angular" | "rounded-elbow" },
							});
						}
					});
				this.controls.branchStyleDropdown = dropdown.selectEl;
			});

		// Color
		const colorSetting = new Setting(body).setName("Color");
		const colorSwatch = colorSetting.controlEl.createDiv({ cls: "osmosis-color-swatch-btn" });
		this.controls.branchColorSwatch = colorSwatch;

		colorSwatch.addEventListener("click", () => {
			this.openColorPicker(colorSwatch, colorSwatch.style.backgroundColor || "#888888", (color) => {
				void this.writeNodeStyle({ branchLine: { color } });
			});
		});

		// Thickness
		new Setting(body)
			.setName("Thickness")
			.addSlider((slider) => {
				slider
					.setLimits(1, 8, 1)
					.setValue(2)
					.setDynamicTooltip()
					.onChange(async (value) => {
						await this.writeNodeStyle({ branchLine: { thickness: value } });
					});
				this.controls.branchThicknessSlider = slider.sliderEl;
			});
	}

	// ─── Color Picker Helper ─────────────────────────────────

	private openColorPicker(anchor: HTMLElement, initialColor: string, onChange: (color: string) => void): void {
		this.closeAllPickers();
		const mindMap = this.getActiveMindMap();
		const themeColors = extractThemeColors(mindMap?.getActiveTheme());

		const picker = new ColorPicker({
			app: this.app,
			plugin: this.plugin,
			initialColor,
			themeColors,
			onChange,
		});
		this.activePickers.push(picker);
		picker.open(anchor);
	}

	private closeAllPickers(): void {
		for (const p of this.activePickers) {
			p.close();
		}
		this.activePickers = [];
	}

	// ─── Node Style Write ────────────────────────────────────

	/** Apply a partial NodeStyle override to all selected nodes. */
	private async writeNodeStyle(update: NodeStyle): Promise<void> {
		const mindMap = this.getActiveMindMap();
		if (!mindMap) return;

		const selection = mindMap.getSelectedNodeInfo();
		if (!selection || selection.nodeIds.length === 0) return;

		const overrides = new Map<string, NodeStyle>();
		for (const nodeId of selection.nodeIds) {
			overrides.set(nodeId, update);
		}

		await mindMap.applyNodeStyleOverrides(overrides);
		this.refreshFormatControls();
	}

	/** Reset style properties for all selected nodes. Pass keys to reset specific groups, omit for all. */
	private async resetSelectedNodeStyles(keys?: (keyof NodeStyle)[]): Promise<void> {
		const mindMap = this.getActiveMindMap();
		if (!mindMap) return;

		const selection = mindMap.getSelectedNodeInfo();
		if (!selection || selection.nodeIds.length === 0) return;

		await mindMap.resetNodeStyles(selection.nodeIds, keys);
		this.refreshFormatControls();
	}

	// ─── Format Tab State ────────────────────────────────────

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

		if (hasSelection) {
			this.refreshFormatControls();
		}
	}

	/** Refresh all Format tab controls with the current selection's resolved style. */
	private refreshFormatControls(): void {
		const mindMap = this.getActiveMindMap();
		if (!mindMap) return;

		const selection = mindMap.getSelectedNodeInfo();
		if (!selection || !selection.primaryId) return;

		const layoutNode = mindMap.getLayoutNodeById(selection.primaryId);
		if (!layoutNode) return;

		const theme = mindMap.getActiveTheme();
		const fm = mindMap.getOsmosisStyleFrontmatter();
		const localStyle = lookupNodeStyle(fm, layoutNode);
		const globalClasses = mindMap.getGlobalClasses();
		const classStyle = lookupClassStyle(fm, localStyle?.class, globalClasses);
		const nodeDepth = layoutNode.source.type === "heading" ? layoutNode.source.depth : undefined;
		const resolved = resolveNodeStyle(theme, nodeDepth, localStyle, classStyle);

		// Variant dropdown (Map tab)
		this.rebuildVariantDropdown();

		// Style class
		this.rebuildClassDropdown(fm, globalClasses);
		if (this.controls.classDropdown) {
			this.controls.classDropdown.value = localStyle?.class ?? "";
		}
		this.updateSaveToClassVisibility();

		// Shape
		if (this.controls.shapeDropdown) {
			this.controls.shapeDropdown.value = localStyle?.shape ?? "inherit";
		}

		// Width
		if (this.controls.nodeWidthInput) {
			this.controls.nodeWidthInput.value = localStyle?.width != null ? String(localStyle.width) : "";
		}

		// Fill
		if (this.controls.fillSwatch) {
			this.controls.fillSwatch.style.backgroundColor = resolved.fill ?? "";
		}

		// Border
		if (this.controls.borderColorSwatch) {
			this.controls.borderColorSwatch.style.backgroundColor = resolved.border?.color ?? "";
		}
		if (this.controls.borderWidthSlider) {
			this.controls.borderWidthSlider.value = String(resolved.border?.width ?? 1);
		}
		if (this.controls.borderStyleDropdown) {
			this.controls.borderStyleDropdown.value = localStyle?.border?.style ?? "inherit";
		}

		// Text
		this.controls.fontPicker?.setFont(resolved.text?.font ?? "");
		if (this.controls.textSizeSlider) {
			this.controls.textSizeSlider.value = String(resolved.text?.size ?? 14);
		}
		if (this.controls.textWeightDropdown) {
			const w = localStyle?.text?.weight;
			this.controls.textWeightDropdown.value = w != null ? String(w) : "inherit";
		}
		if (this.controls.textColorSwatch) {
			this.controls.textColorSwatch.style.backgroundColor = resolved.text?.color ?? "";
		}
		if (this.controls.textAlignBtns) {
			const align = resolved.text?.alignment ?? "left";
			const btns = this.controls.textAlignBtns.querySelectorAll(".osmosis-align-btn");
			btns.forEach((btn) => {
				if (btn instanceof HTMLElement) {
					btn.toggleClass("is-active", btn.getAttribute("data-align") === align);
				}
			});
		}

		// Branch line
		if (this.controls.branchStyleDropdown) {
			this.controls.branchStyleDropdown.value = localStyle?.branchLine?.style ?? "inherit";
		}
		if (this.controls.branchColorSwatch) {
			this.controls.branchColorSwatch.style.backgroundColor = resolved.branchLine?.color ?? "";
		}
		if (this.controls.branchThicknessSlider) {
			this.controls.branchThicknessSlider.value = String(resolved.branchLine?.thickness ?? 2);
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
