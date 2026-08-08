import { App, PluginSettingTab, Setting, SettingDefinitionItem, AbstractInputSuggest, TFolder, getAllTags } from "obsidian";
import OsmosisPlugin from "./main";
import { normalizeLogFolder } from "./store/ReviewLog";
import type { BranchLineStyle, MapSettings } from "./styles";
import type { MindMapDefaultMode } from "./reading-mode";
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
	/** Whether transcluded branches load expanded when a map opens (default: true). */
	expandTransclusions: boolean;
	/** Which mode new mind map views open in (default: "editing"). */
	mindMapDefaultMode: MindMapDefaultMode;
	/**
	 * Legacy per-note map settings. Superseded by `osmosis-styles` frontmatter;
	 * retained solely so `migrateMapSettingsToFrontmatter()` can drain existing
	 * data.json files. Nothing else should read or write this.
	 */
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
	/** Whether line cards count in deck totals and sequential study (default: true). */
	includeLineCardsInDecks: boolean;

	// ── Review Log ──────────────────────────────────────────
	/** Vault folder holding the append-only review-history shards. */
	reviewLogFolder: string;
	/**
	 * Overrides the auto-detected device label in shard filenames. Empty means
	 * detect (Obsidian Sync's device name, else the platform).
	 */
	reviewLogDeviceLabel: string;
	/**
	 * Random ID identifying this install in shard headers, so two devices that
	 * slug to the same label can be told apart. Generated on first load.
	 */
	installId: string;
	/**
	 * Whether the user has dismissed the Obsidian Sync notice. The notice
	 * informs rather than detects — Sync's "all other types" toggle is not
	 * readable from the plugin — so it needs a way to be closed.
	 */
	reviewLogSyncNoticeDismissed: boolean;

	// ── Note Inclusion Settings ────────────────────────────
	/** Folder paths that auto-enable card generation (without osmosis-cards: true). */
	includeFolders: string[];
	/** Tags that auto-enable card generation (without #, without osmosis-cards: true). */
	includeTags: string[];
	/** Folder paths whose notes never generate cards, even with osmosis-cards: true. */
	excludeFolders: string[];
	/** Tags (without #) whose notes never generate cards, even with osmosis-cards: true. */
	excludeTags: string[];

	// ── Study Mode Settings ─────────────────────────────────
	/** Whether contextual mode activates automatically in reading view (default: true). */
	contextualAutoActivate: boolean;
	/** Whether inline clozes blank out in contextual mode (default: false). */
	contextualInlineCloze: boolean;
	/** Whether to show the deck breadcrumb in the sequential study modal (default: false). */
	showStudyBreadcrumb: boolean;
	/** Preceding sibling lines shown as context on line-card fronts in sequential study (default: 2). */
	sequentialContextLines: number;

	/** Default maximum node width before text wraps, in px. Per-map "Max width"
	 *  in the properties sidebar overrides this (default: 230). */
	defaultMaxNodeWidth: number;

	// ── Stats Dashboard ─────────────────────────────────────
	/**
	 * Panel IDs in the order the stats dashboard shows them, written when a
	 * reader drags a panel by its handle. Empty means the default order; IDs are
	 * reconciled against the panels that actually exist on every render, so a
	 * stale entry is harmless.
	 */
	statsPanelOrder: string[];

	// ── Mind Map Editing ────────────────────────────────────
	/** Maximum undo/redo history entries kept per mind map (default: 50). */
	undoMaxSteps: number;
	/** Hard ceiling on undo/redo history memory per mind map, in MB; the oldest
	 *  edits drop when either this or undoMaxSteps is reached first (default: 20). */
	undoMaxMemoryMB: number;
}

export const DEFAULT_SETTINGS: OsmosisSettings = {
	branchLineStyle: "curved",
	cursorSync: true,
	showTransclusionStyle: false,
	expandTransclusions: true,
	mindMapDefaultMode: "editing",
	defaultMaxNodeWidth: 230,
	mapSettings: {},
	customColors: [],
	globalClasses: {},
	customThemes: {},

	// SR defaults
	dailyNewCardLimit: 20,
	dailyReviewCardLimit: 200,
	learningSteps: "1m, 10m",
	relearningSteps: "10m",
	includeLineCardsInDecks: true,

	// Review log defaults
	reviewLogFolder: "Osmosis/Reviews",
	reviewLogDeviceLabel: "",
	installId: "",
	reviewLogSyncNoticeDismissed: false,

	// Note inclusion defaults
	includeFolders: [],
	includeTags: [],
	excludeFolders: [],
	excludeTags: [],

	// Study Mode defaults
	contextualAutoActivate: true,
	contextualInlineCloze: false,
	showStudyBreadcrumb: false,
	sequentialContextLines: 2,

	// Stats dashboard defaults
	statsPanelOrder: [],

	// Mind map editing defaults
	undoMaxSteps: 50,
	undoMaxMemoryMB: 20,
};

/** Reject non-integer or negative daily card limits with an inline message. */
function validateCardLimit(value: number): string | void {
	if (!Number.isInteger(value) || value < 0) {
		return "Enter a whole number of 0 or more.";
	}
}

/** Reject non-integer or below-one values (undo limits) with an inline message. */
function validatePositiveInt(value: number): string | void {
	if (!Number.isInteger(value) || value < 1) {
		return "Enter a whole number of 1 or more.";
	}
}

export class OsmosisSettingTab extends PluginSettingTab {
	plugin: OsmosisPlugin;

	constructor(app: App, plugin: OsmosisPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * Persist through the plugin's own saver rather than the base
	 * implementation, which writes `plugin.settings` but skips the card re-sync
	 * and dashboard refresh that `saveSettings()` triggers.
	 */
	async setControlValue(key: string, value: unknown): Promise<void> {
		Object.assign(this.plugin.settings, { [key]: value });
		await this.plugin.saveSettings();
		if (key === "defaultMaxNodeWidth") {
			this.plugin.remeasureOpenMindMaps();
		}
	}

	getSettingDefinitions(): SettingDefinitionItem<keyof OsmosisSettings>[] {
		return [
			{
				name: "Branch line style",
				desc: "Style of connecting lines between nodes.",
				control: {
					type: "dropdown",
					key: "branchLineStyle",
					options: {
						curved: "Curved",
						straight: "Straight",
						angular: "Angular",
						"rounded-elbow": "Rounded elbow",
					},
				},
			},
			{
				name: "Max node width",
				desc: "Default maximum width before node text wraps. Individual maps can override this from the properties sidebar.",
				control: {
					type: "slider",
					key: "defaultMaxNodeWidth",
					min: 100,
					max: 800,
					step: 10,
					displayFormat: (value: number) => `${String(value)} px`,
				},
			},
			{
				name: "Highlight transcluded branches",
				desc: "Visually distinguish nodes embedded from other files.",
				control: { type: "toggle", key: "showTransclusionStyle" },
			},
			{
				name: "Expand transclusions",
				desc: "Load embedded notes expanded when a mind map opens. When off, they start collapsed and load on first expand.",
				control: { type: "toggle", key: "expandTransclusions" },
			},
			{
				name: "Default mind map mode",
				desc: "Which mode mind map views open in. Reading mode blocks map edits (drag, in-place editing, structure changes) while pan, zoom, fold, study, and peek stay available.",
				control: {
					type: "dropdown",
					key: "mindMapDefaultMode",
					options: {
						editing: "Editing",
						reading: "Reading",
						"reading-mobile": "Reading on mobile only",
					},
				},
			},
			{
				name: "Cursor sync",
				desc: "Sync cursor position between the Markdown editor and mind map.",
				control: { type: "toggle", key: "cursorSync" },
			},
			{
				type: "group",
				heading: "Undo history",
				items: [
					{
						name: "Undo steps",
						desc: "Maximum undo/redo history kept per mind map. Older edits drop once this many are stored.",
						control: {
							type: "number",
							key: "undoMaxSteps",
							min: 1,
							step: 1,
							validate: validatePositiveInt,
						},
					},
					{
						name: "Undo memory cap (MB)",
						desc: "Hard ceiling on undo history memory per mind map. Whichever limit — steps or memory — is reached first drops the oldest edits.",
						control: {
							type: "number",
							key: "undoMaxMemoryMB",
							min: 1,
							step: 1,
							validate: validatePositiveInt,
						},
					},
				],
			},
			{
				type: "group",
				heading: "Spaced repetition",
				items: [
					{
						name: "Daily new card limit",
						desc: "Maximum new cards per day (0 = unlimited).",
						control: {
							type: "number",
							key: "dailyNewCardLimit",
							min: 0,
							step: 1,
							validate: validateCardLimit,
						},
					},
					{
						name: "Daily review card limit",
						desc: "Maximum review cards per day (0 = unlimited).",
						control: {
							type: "number",
							key: "dailyReviewCardLimit",
							min: 0,
							step: 1,
							validate: validateCardLimit,
						},
					},
					{
						name: "Learning steps",
						desc: "Steps for new cards (e.g., \"1m, 10m\"). Cards reappear within the session at each interval.",
						control: { type: "text", key: "learningSteps", placeholder: "1m, 10m" },
					},
					{
						name: "Relearning steps",
						desc: "Steps for lapsed cards (e.g., \"10m\"). Cards rated \"again\" reappear after this delay.",
						control: { type: "text", key: "relearningSteps", placeholder: "10m" },
					},
					{
						name: "Include line cards in decks",
						desc: "Count line cards (block-ID-tagged lines) in deck totals and sequential study. Off keeps them studiable in-place only. Per-note override: osmosis-line-cards: false.",
						control: { type: "toggle", key: "includeLineCardsInDecks" },
					},
				],
			},
			{
				type: "group",
				heading: "Review history",
				items: [
					{
						name: "Check that Obsidian Sync carries review history",
						desc:
							"Sync only carries .jsonl files when \"Sync all other types\" is on in Settings → Sync, and it is off by default. "
							+ "Sync settings do not propagate, so it has to be enabled on every device separately. "
							+ "Reviews recorded while it is off stay on this device. "
							+ "Osmosis cannot read that setting, so it cannot confirm this for you.",
						// Shown whenever Sync is running, until dismissed. It
						// deliberately does not claim the toggle is off —
						// that state is not reachable from the Sync instance.
						visible: () => this.plugin.shouldShowSyncNotice(),
						render: (setting) => {
							setting.setClass("osmosis-settings-notice");
							setting.addButton((btn) => {
								btn.setButtonText("Dismiss").onClick(() => {
									void this.plugin.dismissSyncNotice().then(() => {
										// update(), not display(): on Obsidian
										// 1.13+ only update() re-evaluates the
										// declarative definitions, including
										// this row's `visible` predicate.
										this.update();
									});
								});
							});
						},
					},
					{
						name: "Review log folder",
						desc: "Where per-review history is stored. Changing this moves the existing files.",
						render: (setting) => {
							this.buildPathInput(setting, {
								value: this.plugin.settings.reviewLogFolder,
								placeholder: DEFAULT_SETTINGS.reviewLogFolder,
								createSuggest: (input) => new FolderSuggest(this.app, input),
								normalize: (raw) => normalizeLogFolder(raw, DEFAULT_SETTINGS.reviewLogFolder),
								onCommit: (folder) => this.plugin.changeReviewLogFolder(folder),
							});
						},
					},
					{
						name: "Device name",
						desc: "Labels this device's review-history files, keeping them separate from your other devices' so no file ever has two writers. Leave empty to detect automatically.",
						render: (setting) => {
							this.buildPathInput(setting, {
								value: this.plugin.settings.reviewLogDeviceLabel,
								// Shows what detection picked, so an empty
								// field reads as "automatic", not "unset"
								placeholder: this.plugin.resolveDeviceLabel(),
								normalize: (raw) => raw.trim(),
								onCommit: (label) => this.plugin.setReviewLogDeviceLabel(label),
							});
						},
					},
				],
			},
			{
				type: "group",
				heading: "Study mode",
				items: [
					{
						name: "Show deck breadcrumb in study modal",
						desc: "Display the deck path between the action buttons and progress bar in sequential study mode.",
						control: { type: "toggle", key: "showStudyBreadcrumb" },
					},
					{
						name: "Line card context lines",
						desc: "How many immediately preceding sibling lines to show for context on a line card's front in sequential study (0 = breadcrumb only).",
						control: {
							type: "slider",
							key: "sequentialContextLines",
							min: 0,
							max: 5,
							step: 1,
						},
					},
					{
						name: "Include folders",
						desc: "Notes in these folders auto-generate cards without needing osmosis-cards: true.",
						render: (setting) =>
							this.buildChipList(setting, {
								items: this.plugin.settings.includeFolders,
								placeholder: "Add folder...",
								createSuggest: (input) => new FolderSuggest(this.app, input),
								onUpdate: async (items) => {
									this.plugin.settings.includeFolders = items;
									await this.plugin.saveSettings();
								},
							}),
					},
					{
						name: "Include tags",
						desc: "Notes with these tags auto-generate cards without needing osmosis-cards: true.",
						render: (setting) =>
							this.buildChipList(setting, {
								items: this.plugin.settings.includeTags,
								placeholder: "Add tag...",
								createSuggest: (input) => new TagSuggest(this.app, input),
								onUpdate: async (items) => {
									this.plugin.settings.includeTags = items;
									await this.plugin.saveSettings();
								},
							}),
					},
					{
						name: "Exclude folders",
						desc: "Notes in these folders never generate cards, even with osmosis-cards: true or a matching include folder or tag.",
						render: (setting) =>
							this.buildChipList(setting, {
								items: this.plugin.settings.excludeFolders,
								placeholder: "Add folder...",
								createSuggest: (input) => new FolderSuggest(this.app, input),
								onUpdate: async (items) => {
									this.plugin.settings.excludeFolders = items;
									await this.plugin.saveSettings();
								},
							}),
					},
					{
						name: "Exclude tags",
						desc: "Notes with these tags never generate cards, even with osmosis-cards: true or a matching include folder or tag.",
						render: (setting) =>
							this.buildChipList(setting, {
								items: this.plugin.settings.excludeTags,
								placeholder: "Add tag...",
								createSuggest: (input) => new TagSuggest(this.app, input),
								onUpdate: async (items) => {
									this.plugin.settings.excludeTags = items;
									await this.plugin.saveSettings();
								},
							}),
					},
				],
			},
		];
	}

	/**
	 * Attach a single-value text input, optionally with auto-suggest.
	 *
	 * Commits on blur or Enter rather than per keystroke: these settings have
	 * side effects (the folder one moves files), and firing them on every
	 * character typed would move the log once per letter.
	 */
	private buildPathInput(
		setting: Setting,
		opts: {
			value: string;
			placeholder: string;
			createSuggest?: (input: HTMLInputElement) => AbstractInputSuggest<string>;
			normalize: (raw: string) => string;
			onCommit: (value: string) => Promise<void>;
		},
	): void {
		setting.addText((text) => {
			text.setPlaceholder(opts.placeholder).setValue(opts.value);

			let committed = opts.value;
			const commit = (raw: string): void => {
				const next = opts.normalize(raw);
				text.setValue(next);
				if (next === committed) return;
				committed = next;
				void opts.onCommit(next);
			};

			if (opts.createSuggest) {
				opts.createSuggest(text.inputEl).onSelect((value: string) => {
					commit(value);
				});
			}

			text.inputEl.addEventListener("blur", () => {
				commit(text.getValue());
			});
			text.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
				if (e.key === "Enter") {
					e.preventDefault();
					text.inputEl.blur();
				}
			});
		});
	}

	/** Attach a chip-list control with auto-suggest input to an existing row. */
	private buildChipList(
		setting: Setting,
		opts: {
			items: string[];
			placeholder: string;
			createSuggest: (input: HTMLInputElement) => AbstractInputSuggest<string>;
			onUpdate: (items: string[]) => Promise<void>;
		},
	): void {
		// Chip container
		const chipContainer = setting.controlEl.createDiv({ cls: "osmosis-chip-list" });

		// Built detached; renderChips() re-appends it after the chips on every
		// render, since empty() clears the input out along with them.
		const input = createEl("input", {
			type: "text",
			placeholder: opts.placeholder,
			cls: "osmosis-chip-input",
		});

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
			chipContainer.appendChild(input);
		};

		renderChips();

		const suggest = opts.createSuggest(input);

		const addItem = (value: string): void => {
			const cleaned = value.trim().replace(/^#/, "");
			if (cleaned && !opts.items.includes(cleaned)) {
				opts.items.push(cleaned);
				renderChips();
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
