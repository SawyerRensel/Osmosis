import { App, PluginSettingTab, Setting, AbstractInputSuggest, TFolder, getAllTags } from "obsidian";
import OsmosisPlugin from "./main";
import type { BranchLineStyle, MapSettings } from "./styles";
export type { MapSettings, BranchLineStyle, BranchLinePattern, BranchLineTaper } from "./styles";
export { DEFAULT_MAP_SETTINGS } from "./styles";

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

export interface OsmosisSettings {
	branchLineStyle: BranchLineStyle;
	cursorSync: boolean;
	showTransclusionStyle: boolean;
	/** @deprecated Migrated to osmosis-styles frontmatter. Kept for migration only. */
	mapSettings: Record<string, Partial<MapSettings>>;
	/** User-saved custom colors for the color picker palette. */
	customColors: string[];
	/** Global style classes available across all notes. */
	globalClasses: Record<string, import("./styles").NodeStyle>;
	/** User-created custom themes, keyed by name. */
	customThemes: Record<string, import("./styles").ThemeDefinition>;

	// ── Spaced Repetition Settings ────────────────────────────
	/** Maximum new cards per day (0 = unlimited). */
	dailyNewCardLimit: number;
	/** Maximum review cards per day (0 = unlimited). */
	dailyReviewCardLimit: number;
	/** Learning steps for new cards (e.g., "1m, 10m"). */
	learningSteps: string;
	/** Relearning steps for lapsed cards (e.g., "10m"). */
	relearningSteps: string;

	// ── Note Inclusion Settings ────────────────────────────
	/** Folder paths that auto-enable card generation (without osmosis-cards: true). */
	includeFolders: string[];
	/** Tags that auto-enable card generation (without #, without osmosis-cards: true). */
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
	dailyNewCardLimit: 20,
	dailyReviewCardLimit: 200,
	learningSteps: "1m, 10m",
	relearningSteps: "10m",

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
			.setName("Learning steps")
			.setDesc("Steps for new cards (e.g., \"1m, 10m\"). Cards reappear within the session at each interval.")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.learningSteps)
					.setPlaceholder("1m, 10m")
					.onChange(async (value) => {
						this.plugin.settings.learningSteps = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Relearning steps")
			.setDesc("Steps for lapsed cards (e.g., \"10m\"). Cards rated \"again\" reappear after this delay.")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.relearningSteps)
					.setPlaceholder("10m")
					.onChange(async (value) => {
						this.plugin.settings.relearningSteps = value;
						await this.plugin.saveSettings();
					}),
			);

		this.buildChipList(containerEl, {
			name: "Include folders",
			desc: "Notes in these folders auto-generate cards without needing osmosis-cards: true.",
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
			desc: "Notes with these tags auto-generate cards without needing osmosis-cards: true.",
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
