import { App, PluginSettingTab, Setting } from "obsidian";
import OsmosisPlugin from "./main";
import type { LayoutDirection } from "./layout";
import type { TopicShape, NodeStyle } from "./styles";

export type BranchLineStyle = "curved" | "straight" | "angular" | "rounded-elbow";

/** Per-map settings that override global defaults. */
export interface MapSettings {
	direction: LayoutDirection;
	branchLineStyle: BranchLineStyle;
	collapseDepth: number;
	horizontalSpacing: number;
	verticalSpacing: number;
	theme: string;
	topicShape: TopicShape;
	/** Map-level global node style overrides (fill, border, text). */
	baseStyle?: NodeStyle;
	/** Map background color override. */
	background?: string;
	/** Branch line color override. */
	branchLineColor?: string;
	/** Branch line thickness override. */
	branchLineThickness?: number;
	/** Maximum node width before text wraps (px). */
	maxNodeWidth?: number;
}

export const DEFAULT_MAP_SETTINGS: MapSettings = {
	direction: "left-right",
	branchLineStyle: "curved",
	collapseDepth: 0,
	horizontalSpacing: 80,
	verticalSpacing: 8,
	theme: "Default",
	topicShape: "rounded-rect",
};

/** How to resolve heading vs. cloze conflicts in the same section. */
export type HeadingClozeConflict = "both" | "cloze_only" | "heading_only";

export interface OsmosisSettings {
	branchLineStyle: BranchLineStyle;
	cursorSync: boolean;
	showTransclusionStyle: boolean;
	/** Per-note map settings keyed by file path. Only non-default values stored. */
	mapSettings: Record<string, Partial<MapSettings>>;
	/** User-saved custom colors for the color picker palette. */
	customColors: string[];
	/** Global style classes available across all notes. */
	globalClasses: Record<string, import("./styles").NodeStyle>;
	/** User-created custom themes, keyed by name. */
	customThemes: Record<string, import("./styles").ThemeDefinition>;

	// ── Spaced Repetition Settings ────────────────────────────
	/** Whether headings automatically generate cards (default: true). */
	headingAutoGenerate: boolean;
	/** Whether **bold** text generates cloze cards (default: true). */
	clozeBoldEnabled: boolean;
	/** How to handle sections with both heading and cloze cards. */
	headingClozeConflict: HeadingClozeConflict;
	/** Maximum new cards per day (0 = unlimited). */
	dailyNewCardLimit: number;
	/** Maximum review cards per day (0 = unlimited). */
	dailyReviewCardLimit: number;

	// ── Note Inclusion Settings ────────────────────────────
	/** Folder paths that auto-enable card generation (without osmosis: true). */
	includeFolders: string[];
	/** Tags that auto-enable card generation (without #, without osmosis: true). */
	includeTags: string[];

	// ── Study Mode Settings ─────────────────────────────────
	/** Whether contextual mode activates automatically in reading view (default: true). */
	contextualAutoActivate: boolean;
	/** Whether inline clozes blank out in contextual mode (default: false). */
	contextualInlineCloze: boolean;
}

export const DEFAULT_SETTINGS: OsmosisSettings = {
	branchLineStyle: "curved",
	cursorSync: true,
	showTransclusionStyle: false,
	mapSettings: {},
	customColors: [],
	globalClasses: {},
	customThemes: {},

	// SR defaults
	headingAutoGenerate: true,
	clozeBoldEnabled: true,
	headingClozeConflict: "cloze_only",
	dailyNewCardLimit: 20,
	dailyReviewCardLimit: 200,

	// Note inclusion defaults
	includeFolders: [],
	includeTags: [],

	// Study Mode defaults
	contextualAutoActivate: true,
	contextualInlineCloze: false,
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

		// ── Spaced Repetition ──────────────────────────────────
		new Setting(containerEl).setName("Spaced repetition").setHeading();

		new Setting(containerEl)
			.setName("Auto-generate heading cards")
			.setDesc("Automatically create cards from headings and their body text.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.headingAutoGenerate)
					.onChange(async (value) => {
						this.plugin.settings.headingAutoGenerate = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Bold text cloze cards")
			.setDesc("Generate cloze cards from **bold** text in opted-in notes.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.clozeBoldEnabled)
					.onChange(async (value) => {
						this.plugin.settings.clozeBoldEnabled = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Heading and cloze conflict")
			.setDesc("When a heading section contains cloze targets, which cards to keep.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("both", "Keep both")
					.addOption("cloze_only", "Cloze only")
					.addOption("heading_only", "Heading only")
					.setValue(this.plugin.settings.headingClozeConflict)
					.onChange(async (value) => {
						this.plugin.settings.headingClozeConflict = value as HeadingClozeConflict;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Daily new card limit")
			.setDesc("Maximum new cards per day (0 = unlimited).")
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.dailyNewCardLimit))
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num >= 0) {
							this.plugin.settings.dailyNewCardLimit = num;
							await this.plugin.saveSettings();
						}
					}),
			);

		new Setting(containerEl)
			.setName("Daily review card limit")
			.setDesc("Maximum review cards per day (0 = unlimited).")
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.dailyReviewCardLimit))
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num >= 0) {
							this.plugin.settings.dailyReviewCardLimit = num;
							await this.plugin.saveSettings();
						}
					}),
			);

		new Setting(containerEl)
			.setName("Include folders")
			.setDesc("Notes in these folders auto-generate cards without needing osmosis: true. One folder path per line.")
			.addTextArea((text) =>
				text
					.setValue(this.plugin.settings.includeFolders.join("\n"))
					.onChange(async (value) => {
						this.plugin.settings.includeFolders = value
							.split("\n")
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Include tags")
			.setDesc("Notes with these tags auto-generate cards without needing osmosis: true. One tag per line, without #.")
			.addTextArea((text) =>
				text
					.setValue(this.plugin.settings.includeTags.join("\n"))
					.onChange(async (value) => {
						this.plugin.settings.includeTags = value
							.split("\n")
							.map((s) => s.trim().replace(/^#/, ""))
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
					}),
			);
	}
}
