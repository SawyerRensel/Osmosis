import { App, PluginSettingTab, Setting, AbstractInputSuggest, TFolder, getAllTags } from "obsidian";
import OsmosisPlugin from "./main";
import type { LayoutDirection } from "./layout";
import type { TopicShape, NodeStyle } from "./styles";

/** Auto-suggest for vault folder paths. */
class FolderSuggest extends AbstractInputSuggest<string> {
	getSuggestions(query: string): string[] {
		const lq = query.toLowerCase();
		return this.app.vault.getAllFolders(false)
			.map((f: TFolder) => f.path)
			.filter((p: string) => p.toLowerCase().includes(lq))
			.sort();
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value);
	}

	selectSuggestion(value: string): void {
		this.setValue(value);
		this.close();
	}
}

/** Auto-suggest for vault tags (without #). */
class TagSuggest extends AbstractInputSuggest<string> {
	getSuggestions(query: string): string[] {
		const lq = query.toLowerCase();
		const tags = new Set<string>();
		for (const file of this.app.vault.getMarkdownFiles()) {
			const cache = this.app.metadataCache.getFileCache(file);
			if (cache) {
				const fileTags = getAllTags(cache);
				if (fileTags) {
					for (const t of fileTags) tags.add(t.replace(/^#/, ""));
				}
			}
		}
		return [...tags].filter((t) => t.toLowerCase().includes(lq)).sort();
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value);
	}

	selectSuggestion(value: string): void {
		this.setValue(value);
		this.close();
	}
}

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

		this.buildChipList(containerEl, {
			name: "Include folders",
			desc: "Notes in these folders auto-generate cards without needing osmosis: true.",
			items: this.plugin.settings.includeFolders,
			placeholder: "Add folder...",
			createSuggest: (input) => new FolderSuggest(this.app, input),
			onUpdate: async (items) => {
				this.plugin.settings.includeFolders = items;
				await this.plugin.saveSettings();
			},
		});

		this.buildChipList(containerEl, {
			name: "Include tags",
			desc: "Notes with these tags auto-generate cards without needing osmosis: true.",
			items: this.plugin.settings.includeTags,
			placeholder: "Add tag...",
			createSuggest: (input) => new TagSuggest(this.app, input),
			onUpdate: async (items) => {
				this.plugin.settings.includeTags = items;
				await this.plugin.saveSettings();
			},
		});
	}

	/** Build a chip-list setting with auto-suggest input. */
	private buildChipList(
		containerEl: HTMLElement,
		opts: {
			name: string;
			desc: string;
			items: string[];
			placeholder: string;
			createSuggest: (input: HTMLInputElement) => AbstractInputSuggest<string>;
			onUpdate: (items: string[]) => Promise<void>;
		},
	): void {
		const setting = new Setting(containerEl)
			.setName(opts.name)
			.setDesc(opts.desc);

		// Chip container
		const chipContainer = setting.controlEl.createDiv({ cls: "osmosis-chip-list" });

		const renderChips = (): void => {
			chipContainer.empty();
			for (const item of opts.items) {
				const chip = chipContainer.createDiv({ cls: "osmosis-chip" });
				chip.createSpan({ text: item });
				const removeBtn = chip.createSpan({ cls: "osmosis-chip-remove", text: "\u00d7" });
				removeBtn.addEventListener("click", () => {
					const idx = opts.items.indexOf(item);
					if (idx >= 0) {
						opts.items.splice(idx, 1);
						renderChips();
						void opts.onUpdate(opts.items);
					}
				});
			}
		};

		renderChips();

		// Input with auto-suggest
		const input = chipContainer.createEl("input", {
			type: "text",
			placeholder: opts.placeholder,
			cls: "osmosis-chip-input",
		});

		const suggest = opts.createSuggest(input);

		const addItem = (value: string): void => {
			const cleaned = value.trim().replace(/^#/, "");
			if (cleaned && !opts.items.includes(cleaned)) {
				opts.items.push(cleaned);
				renderChips();
				// Re-append input after chips
				chipContainer.appendChild(input);
				void opts.onUpdate(opts.items);
			}
			input.value = "";
		};

		suggest.onSelect((value: string) => {
			addItem(value);
		});

		input.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				addItem(input.value);
			}
		});
	}
}
