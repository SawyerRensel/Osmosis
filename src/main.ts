import { Notice, Platform, Plugin, MarkdownView, TAbstractFile, TFile, WorkspaceLeaf, debounce, setIcon, type Editor, type MarkdownFileInfo, type Menu } from "obsidian";
import { DEFAULT_SETTINGS, OsmosisSettings, OsmosisSettingTab } from "./settings";
import { FSRSScheduler } from "./database/FSRSScheduler";
import { StudySessionManager } from "./study/StudySessionManager";
import { CardSyncService } from "./card-gen/CardSyncService";
import { CardStore } from "./store/CardStore";
import { FenceWriter } from "./store/FenceWriter";
import { ScheduleStore, SCHEDULE_FRONTMATTER_KEY, parseScheduleFrontmatter, parseDisabledFrontmatter } from "./store/ScheduleStore";
import { ReviewLog, platformDeviceLabel, slugifyDeviceLabel, type ReviewLogCache } from "./store/ReviewLog";
import { MindMapView, VIEW_TYPE_MINDMAP } from "./views/MindMapView";
import { PropertiesSidebarView, VIEW_TYPE_PROPERTIES } from "./views/PropertiesSidebarView";
import { SequentialStudyModal } from "./views/SequentialStudyModal";
import { DashboardSidebarView, VIEW_TYPE_DASHBOARD } from "./views/DashboardSidebarView";
import { BASES_CARD_BROWSER_VIEW_ID, createCardBrowserRegistration } from "./views/CardBrowserView";
import { StatsView, VIEW_TYPE_STATS } from "./views/StatsView";
import { ContextualStudyProcessor } from "./views/ContextualStudyProcessor";
import { LineRevealProcessor } from "./views/LineRevealProcessor";
import { GenerateFlashcardsModal } from "./views/GenerateFlashcardsModal";
import { ConfirmModal } from "./views/ConfirmModal";
import { planIdGeneration, removeBlockIdsInRange, type LineRange } from "./card-gen/generate-ids";
import type { Card, StudyMode } from "./database/types";
import type { DeckScope } from "./study/types";

/** localStorage key for the review log's rollup cache (per vault, per device). */
const REVIEW_ROLLUP_CACHE_KEY = "osmosis-review-rollup";

/** The base file the Browse entry points open, created on first use. */
const CARD_BROWSER_BASE_PATH = "Osmosis/Cards.base";

/**
 * The starting base: every markdown note, with the card filtering left to the
 * view's own options.
 *
 * The filter deliberately does *not* narrow to `osmosis-cards` notes. That
 * property opts a note into *line* cards; a note holding only ```osmosis fences
 * needs no property and would vanish from a base that required one. Notes with
 * no cards cost nothing here — the view drops them.
 */
const CARD_BROWSER_BASE_CONTENT = `filters:
  and:
    - file.ext == "md"
views:
  - type: ${BASES_CARD_BROWSER_VIEW_ID}
    name: Cards
    layout: table
    cardState: all
    dueWindow: any
    cardType: all
    sortBy: due
    showDisabled: false
`;

export default class OsmosisPlugin extends Plugin {
	settings!: OsmosisSettings;
	/** Whether the Bases core plugin accepted our view registration. */
	basesAvailable = false;
	cardStore!: CardStore;
	fenceWriter!: FenceWriter;
	scheduleStore!: ScheduleStore;
	reviewLog!: ReviewLog;
	cardSync!: CardSyncService;
	lineReveal!: LineRevealProcessor;

	async onload() {
		await this.loadSettings();

		// In-memory card store — replaces SQLite database
		this.cardStore = new CardStore();

		// Fence writer — writes schedule data back into markdown fences
		this.fenceWriter = new FenceWriter(this.app.vault);

		// Schedule store — debounced osmosis-schedule frontmatter writes for line cards
		this.scheduleStore = new ScheduleStore(
			this.app.fileManager,
			(notePath: string) => this.app.vault.getFileByPath(notePath),
		);

		// Review log — append-only review history in the vault, sharded by
		// month and device. The rollup cache rides in vault-local storage, not
		// in a file: if every device wrote it, it would become a shared-write
		// file and reintroduce exactly the conflict sharding removes.
		this.reviewLog = new ReviewLog(
			this.app.vault.adapter,
			() => ({
				folder: this.settings.reviewLogFolder,
				deviceLabel: this.resolveDeviceLabel(),
				installId: this.settings.installId,
			}),
			{
				// `loadLocalStorage` is typed `any`; the cache validates its own
				// shape, so hand it over as unknown rather than trusting it.
				load: (): unknown => this.app.loadLocalStorage(REVIEW_ROLLUP_CACHE_KEY) as unknown,
				save: (cache: ReviewLogCache) => {
					this.app.saveLocalStorage(REVIEW_ROLLUP_CACHE_KEY, cache);
				},
			},
		);

		// Card sync service — connects note processor to card store
		this.cardSync = new CardSyncService(
			this.app.vault,
			this.cardStore,
			this.fenceWriter,
			() => ({
				includeFolders: this.settings.includeFolders,
				includeTags: this.settings.includeTags,
				excludeFolders: this.settings.excludeFolders,
				excludeTags: this.settings.excludeTags,
				includeLineCardsInDecks: this.settings.includeLineCardsInDecks,
			}),
			(file: TFile) => {
				const cache = this.app.metadataCache.getFileCache(file);
				const inlineTags = (cache?.tags ?? []).map((t) => t.tag.replace(/^#/, ""));
				const fmTags: string[] = Array.isArray(cache?.frontmatter?.tags)
					? (cache.frontmatter.tags as string[]).map((t: string) => t.replace(/^#/, ""))
					: [];
				return [...new Set([...inlineTags, ...fmTags])];
			},
			(file: TFile) => {
				// Line-card schedules: osmosis-schedule frontmatter overlaid with
				// pending ratings that haven't been flushed to disk yet
				const raw: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter?.[SCHEDULE_FRONTMATTER_KEY];
				const schedules = parseScheduleFrontmatter(raw);
				for (const [blockId, entry] of this.scheduleStore.getPendingEntries(file.path)) {
					if (entry === null) schedules.delete(blockId);
					else schedules.set(blockId, entry);
				}
				return schedules;
			},
			(file: TFile) => {
				// Disabled ("excluded") line cards: osmosis-schedule
				// `disabled: true` overlaid with pending unflushed changes
				const raw: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter?.[SCHEDULE_FRONTMATTER_KEY];
				const disabled = parseDisabledFrontmatter(raw);
				for (const [blockId, flag] of this.scheduleStore.getPendingDisabled(file.path)) {
					if (flag) disabled.add(blockId);
					else disabled.delete(blockId);
				}
				return disabled;
			},
		);

		this.addSettingTab(new OsmosisSettingTab(this.app, this));

		this.registerView(VIEW_TYPE_MINDMAP, (leaf: WorkspaceLeaf) => new MindMapView(leaf));
		this.registerView(VIEW_TYPE_PROPERTIES, (leaf: WorkspaceLeaf) => new PropertiesSidebarView(leaf));
		this.registerView(VIEW_TYPE_DASHBOARD, (leaf: WorkspaceLeaf) => new DashboardSidebarView(leaf));
		this.registerView(VIEW_TYPE_STATS, (leaf: WorkspaceLeaf) => new StatsView(leaf));

		// Browse is a Bases view, not a view type of our own: Bases already owns
		// note-level querying, sorting and `.base` persistence, and a second
		// browser would only reimplement them. Registration fails when the Bases
		// core plugin is disabled, which is a state the Browse entry points have
		// to explain rather than fail silently in.
		this.basesAvailable = this.registerBasesView(
			BASES_CARD_BROWSER_VIEW_ID,
			createCardBrowserRegistration(this),
		);

		// The dashboard is the plugin's only ribbon entry. A mind map is opened
		// from a note's header action, file menu, or the command below — all of
		// which know which note to map, which the ribbon never did.
		this.addRibbonIcon("brain-circuit", "Osmosis dashboard", () => {
			void this.activateDashboard();
		});

		this.addCommand({
			id: "open-mind-map",
			name: "Open mind map view",
			callback: () => {
				void this.activateMindMapView();
			},
		});

		this.addCommand({
			id: "toggle-mindmap-reading-mode",
			name: "Toggle mind map reading mode",
			checkCallback: (checking) => {
				const view = this.app.workspace.getActiveViewOfType(MindMapView);
				if (!view) return false;
				if (!checking) view.toggleReadingMode();
				return true;
			},
		});

		this.addCommand({
			id: "open-properties-sidebar",
			name: "Open mind map properties",
			callback: () => {
				void this.activatePropertiesSidebar();
			},
		});

		this.addCommand({
			id: "open-dashboard",
			name: "Open dashboard",
			callback: () => {
				void this.activateDashboard();
			},
		});

		this.addCommand({
			id: "open-card-browser",
			name: "Open card browser",
			callback: () => {
				void this.openCardBrowser();
			},
		});

		this.addCommand({
			id: "open-stats",
			name: "Open statistics",
			callback: () => {
				void this.activateMainView(VIEW_TYPE_STATS);
			},
		});

		// ── File menu: "Mind map view" ──────────────────────────
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file: TAbstractFile, _source: string, leaf?: WorkspaceLeaf) => {
				if (!(file instanceof TFile) || file.extension !== "md") return;
				menu.addItem((item) => {
					item.setTitle("Mind map view")
						.setIcon("brain-circuit")
						.onClick(() => {
							if (leaf) {
								void leaf.setViewState({
									type: VIEW_TYPE_MINDMAP,
									state: { file: file.path },
									active: true,
								});
							} else {
								void this.activateMindMapView();
							}
						});
				});
				menu.addItem((item) => {
					item.setTitle("Generate flashcards")
						.setIcon("layers")
						.onClick(() => {
							void this.openGenerateFlashcards(file);
						});
				});
			}),
		);

		// ── "Mind map view" icon in markdown view header ────────
		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.addMindMapActionToMarkdownLeaves();
			}),
		);
		this.app.workspace.onLayoutReady(() => {
			this.addMindMapActionToMarkdownLeaves();
		});

		// ── Study Commands ──────────────────────────────────────
		this.addCommand({
			id: "study-all",
			name: "Study all decks",
			callback: () => {
				void this.openStudySession({ type: "all" });
			},
		});

		// ── Notes as Flashcards: ID generation ──────────────────
		this.addCommand({
			id: "generate-flashcards",
			name: "Generate flashcards from note",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!checking) void this.openGenerateFlashcards(file);
				return true;
			},
		});

		// ── Contextual Study Mode ───────────────────────────────
		new ContextualStudyProcessor(this).register();

		// Progressive line-card reveal in reading view (plan §5)
		this.lineReveal = new LineRevealProcessor(this);
		this.lineReveal.register();

		// ── Card Insertion Commands ──────────────────────────────
		this.registerCardInsertionCommands();

		// ── Granular line-card add/remove/exclude (plan §8) ──────
		this.registerLineCardCommands();

		// ── Card Sync ───────────────────────────────────────────
		// Full vault scan once layout is ready (files are loaded)
		this.app.workspace.onLayoutReady(() => {
			// Migrate per-note mapSettings from data.json → osmosis-styles frontmatter
			void this.migrateMapSettingsToFrontmatter();

			this.cardSync.syncAll().then(() => {
				this.refreshDashboard();
				this.lineReveal.refreshChrome();
			}).catch((error: unknown) => {
				// A throw here would otherwise vanish AND leave header chrome
				// and dashboard stale until the next workspace event
				console.error("Osmosis: startup card sync/refresh failed", error);
			});
		});

		// Incremental sync on file changes (debounced)
		const debouncedSync = debounce((file: TFile) => {
			this.cardSync.syncFile(file).then(() => {
				this.refreshDashboard();
				this.lineReveal.refreshChrome();
			}).catch((error: unknown) => {
				console.error("Osmosis: incremental card sync/refresh failed", error);
			});
		}, 2000, true);

		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile && file.extension === "md") {
					debouncedSync(file);
				}
			}),
		);

		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (file instanceof TFile && file.extension === "md") {
					debouncedSync(file);
				}
			}),
		);

		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (file instanceof TFile && file.extension === "md") {
					this.cardSync.handleDelete(file.path);
					this.refreshDashboard();
				}
			}),
		);

		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (file instanceof TFile && file.extension === "md") {
					this.cardSync.handleRename(oldPath, file.path);
					this.refreshDashboard();
				}
			}),
		);
	}

	onunload() {
		// Force out any pending schedule frontmatter writes
		void this.scheduleStore.flush();
		// ...and any buffered review-log entries, so closing Obsidian mid-session
		// does not lose the reviews it holds
		void this.reviewLog.flush();
	}

	/**
	 * This device's shard label. A user override wins; otherwise Obsidian
	 * Sync's device name, which the user already chose and will recognise in a
	 * filename; otherwise the platform.
	 *
	 * `deviceName` is not in the public API, so it is read through the
	 * declaration in `obsidian-internals.d.ts` and guarded — it only exists for
	 * Sync users at all.
	 */
	resolveDeviceLabel(): string {
		const override = this.settings.reviewLogDeviceLabel.trim();
		if (override !== "") return slugifyDeviceLabel(override);

		const syncName = this.app.internalPlugins.plugins.sync?.instance?.deviceName;
		if (typeof syncName === "string" && syncName.trim() !== "") {
			return slugifyDeviceLabel(syncName);
		}

		return platformDeviceLabel(Platform);
	}

	/**
	 * Whether to show the Sync notice in settings: Obsidian Sync is running
	 * and the user has not dismissed it.
	 *
	 * Worth surfacing because the failure it describes is invisible — reviews
	 * keep recording normally, they just never reach the other devices, and
	 * the toggle is per-device so enabling it once is not enough.
	 *
	 * Note this does *not* check whether the toggle is actually off. That
	 * state is not reachable from the Sync instance (see
	 * `obsidian-internals.d.ts` for what was tried), so the notice informs
	 * rather than detects, and carries a Dismiss instead. Two guesses at the
	 * internal shape both produced a notice that lied about the user's
	 * configuration; saying something true and letting the user close it beats
	 * a third guess.
	 */
	shouldShowSyncNotice(): boolean {
		if (this.settings.reviewLogSyncNoticeDismissed) return false;
		return this.app.internalPlugins.plugins.sync?.enabled === true;
	}

	/** Hide the Sync notice for good. */
	async dismissSyncNotice(): Promise<void> {
		this.settings.reviewLogSyncNoticeDismissed = true;
		await this.saveData(this.settings);
	}

	/**
	 * Point the review log at a different folder, moving existing shards.
	 *
	 * The order matters. Buffered entries drain into the folder they were
	 * recorded against *before* the setting changes, so a flush cannot create a
	 * shard in the destination that the move then collides with.
	 */
	async changeReviewLogFolder(folder: string): Promise<void> {
		const previous = this.settings.reviewLogFolder;
		if (folder === previous) return;

		await this.reviewLog.flush();
		this.settings.reviewLogFolder = folder;
		// saveData rather than saveSettings: the log folder has no bearing on
		// card generation, so the full re-sync would be wasted work.
		await this.saveData(this.settings);
		await this.reviewLog.moveFolder(previous, folder);

		new Notice(`Review log moved to "${folder}".`);
	}

	/**
	 * Override the device label in shard filenames. Existing shards keep their
	 * old names and are still read — the union spans every shard in the folder,
	 * whatever it is called.
	 */
	async setReviewLogDeviceLabel(label: string): Promise<void> {
		if (label === this.settings.reviewLogDeviceLabel) return;
		this.settings.reviewLogDeviceLabel = label;
		await this.saveData(this.settings);
	}

	private addMindMapActionToMarkdownLeaves(): void {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const viewActions = leaf.view.containerEl.querySelector(".view-actions");
			if (!viewActions || viewActions.querySelector(".osmosis-mindmap-action")) continue;

			// Find the reading-view toggle to insert before it
			const readingViewBtn = viewActions.querySelector('a.clickable-icon[aria-label="Reading view"]');

			const btn = createEl("a");
			btn.className = "clickable-icon osmosis-mindmap-action";
			btn.setAttribute("aria-label", "Mind map view");
			setIcon(btn, "brain-circuit");
			btn.addEventListener("click", () => {
				const file = (leaf.view as MarkdownView).file;
				if (file) {
					void leaf.setViewState({
						type: VIEW_TYPE_MINDMAP,
						state: { file: file.path },
						active: true,
					});
				}
			});

			if (readingViewBtn) {
				viewActions.insertBefore(btn, readingViewBtn);
			} else {
				viewActions.prepend(btn);
			}
		}
	}

	/** Re-measure and re-render every open mind map, after a global setting
	 *  that affects node sizing changes. */
	remeasureOpenMindMaps(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP)) {
			if (leaf.view instanceof MindMapView) leaf.view.remeasureAndRender();
		}
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

	async activatePropertiesSidebar(): Promise<void> {
		const { workspace } = this.app;

		const existing = workspace.getLeavesOfType(VIEW_TYPE_PROPERTIES);
		if (existing.length > 0 && existing[0]) {
			void workspace.revealLeaf(existing[0]);
			return;
		}

		const leaf = workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({
			type: VIEW_TYPE_PROPERTIES,
			active: true,
		});
		void workspace.revealLeaf(leaf);
	}

	/** Re-render any open dashboard sidebar views. */
	refreshDashboard(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD)) {
			// Sidebar leaves are deferred placeholders until first shown —
			// they have no render() (calling it would throw and kill the
			// caller), and render themselves from the store in onOpen().
			const view = leaf.view;
			if (view instanceof DashboardSidebarView) void view.render();
		}
	}

	async activateDashboard(): Promise<void> {
		const { workspace } = this.app;

		const existing = workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD);
		if (existing.length > 0 && existing[0]) {
			void workspace.revealLeaf(existing[0]);
			// Refresh counts when re-opening an existing dashboard. A still-
			// deferred leaf renders itself in onOpen() once revealed.
			const view = existing[0].view;
			if (view instanceof DashboardSidebarView) void view.render();
			return;
		}

		const leaf = workspace.getLeftLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({
			type: VIEW_TYPE_DASHBOARD,
			active: true,
		});
		void workspace.revealLeaf(leaf);
	}

	/**
	 * Reveal a main-area operator view (browse, stats), reusing its existing
	 * leaf if one is open rather than stacking duplicate tabs.
	 */
	async activateMainView(viewType: string): Promise<void> {
		const { workspace } = this.app;

		const existing = workspace.getLeavesOfType(viewType);
		if (existing.length > 0 && existing[0]) {
			void workspace.revealLeaf(existing[0]);
			return;
		}

		const leaf = workspace.getLeaf("tab");
		await leaf.setViewState({ type: viewType, active: true });
		void workspace.revealLeaf(leaf);
	}

	/**
	 * Open the card browser, which is a `.base` file rather than a view of our
	 * own — creating it, preconfigured with the Osmosis Cards view, if it is
	 * absent.
	 *
	 * This is deliberately a shortcut to a file and not a second browser: the
	 * user can then edit it like any base, or add the Osmosis Cards view to a
	 * base of their own, and there is only one implementation either way.
	 */
	async openCardBrowser(): Promise<void> {
		if (!this.basesAvailable) {
			new Notice("Bases must be enabled to browse cards. Turn it on under core plugins in settings.");
			return;
		}

		let file = this.app.vault.getFileByPath(CARD_BROWSER_BASE_PATH);
		if (!file) {
			try {
				const folder = CARD_BROWSER_BASE_PATH.split("/").slice(0, -1).join("/");
				if (folder !== "" && !this.app.vault.getFolderByPath(folder)) {
					await this.app.vault.createFolder(folder);
				}
				file = await this.app.vault.create(CARD_BROWSER_BASE_PATH, CARD_BROWSER_BASE_CONTENT);
			} catch (error) {
				// Most likely a name collision with something that is not a file
				// we can open — worth saying so rather than opening nothing.
				console.error("Osmosis: could not create the card browser base", error);
				new Notice(`Osmosis: could not create "${CARD_BROWSER_BASE_PATH}".`);
				return;
			}
		}

		await this.app.workspace.getLeaf("tab").openFile(file);
	}

	async openStudySession(scope: DeckScope): Promise<void> {
		const sessionManager = this.createSessionManager("sequential");
		const modal = new SequentialStudyModal(
			this.app,
			sessionManager,
			scope,
			{
				newLimit: this.settings.dailyNewCardLimit,
				reviewLimit: this.settings.dailyReviewCardLimit,
			},
			this.fenceWriter,
			(notePath: string) => this.app.vault.getFileByPath(notePath),
			this.settings.showStudyBreadcrumb,
			this.settings.sequentialContextLines,
			() => {
				// Session end: force pending line-card schedule writes to disk
				// and buffered review-log entries
				void this.scheduleStore.flush();
				void this.reviewLog.flush();
			},
		);
		modal.open();
	}

	/**
	 * "Generate flashcards from note": plan block-ID insertions, show the
	 * confirmation modal, and on confirm tag the note (and opt it in).
	 */
	private async openGenerateFlashcards(file: TFile): Promise<void> {
		const content = await this.app.vault.cachedRead(file);
		const plan = planIdGeneration(content);

		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const rawOptIn: unknown = fm?.["osmosis-cards"];
		const optedIn = rawOptIn === true || rawOptIn === "true";

		if (plan.insertions.length === 0) {
			new Notice("Nothing to generate — every element is already tagged.");
			return;
		}

		new GenerateFlashcardsModal(this.app, file.basename, plan, !optedIn, () => {
			void (async () => {
				let tagged = 0;
				// Re-plan inside process() so concurrent edits can't clobber
				await this.app.vault.process(file, (data) => {
					const fresh = planIdGeneration(data);
					tagged = fresh.insertions.length;
					return fresh.content;
				});
				if (!optedIn) {
					await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
						frontmatter["osmosis-cards"] = true;
					});
				}
				new Notice(`Tagged ${String(tagged)} element${tagged === 1 ? "" : "s"} with Osmosis IDs.`);
			})();
		}).open();
	}

	/**
	 * Create a StudySessionManager wired to the plugin's store and writer.
	 * `mode` is the study surface its answers are attributed to in the review
	 * log — required so a new surface cannot log unattributed reviews.
	 */
	createSessionManager(mode: StudyMode): StudySessionManager {
		return new StudySessionManager(
			this.cardStore,
			new FSRSScheduler({
				learningSteps: this.settings.learningSteps,
				relearningSteps: this.settings.relearningSteps,
			}),
			this.fenceWriter,
			(notePath: string) => this.app.vault.getFileByPath(notePath),
			mode,
			this.scheduleStore,
			this.reviewLog,
		);
	}

	private registerCardInsertionCommands(): void {
		const skeletons = [
			{ id: "insert-card-basic", name: "Insert basic card", meta: "" },
			{ id: "insert-card-bidi", name: "Insert bidirectional card", meta: "bidi: true\n" },
			{ id: "insert-card-type-in", name: "Insert type-in card", meta: "type-in: true\n" },
			{ id: "insert-card-bidi-type-in", name: "Insert bidirectional type-in card", meta: "bidi: true\ntype-in: true\n" },
		];

		for (const skeleton of skeletons) {
			this.addCommand({
				id: skeleton.id,
				name: skeleton.name,
				editorCallback: (editor) => {
					const cursor = editor.getCursor();
					const metaBlock = skeleton.meta ? `${skeleton.meta}\n` : "";
					const fence = `\`\`\`osmosis\n${metaBlock}Front content\n***\nBack content\n\`\`\`\n`;

					editor.replaceRange(fence, cursor);

					// Position cursor on the "Front content" line and select it
					const metaLines = skeleton.meta ? skeleton.meta.split("\n").length : 0;
					const frontLine = cursor.line + 1 + metaLines;
					editor.setSelection(
						{ line: frontLine, ch: 0 },
						{ line: frontLine, ch: "Front content".length },
					);
				},
			});
		}
	}

	/**
	 * Register the editor commands and context-menu items for granular
	 * line-card control: add / remove IDs and exclude / include from study on
	 * the selected lines (no selection = current line). See plan §8.
	 */
	private registerLineCardCommands(): void {
		this.addCommand({
			id: "add-line-cards-selection",
			name: "Add line cards from selection",
			editorCallback: (editor, ctx) => {
				const file = ctx.file;
				if (file) void this.addLineCards(file, this.selectionLineRange(editor));
			},
		});
		this.addCommand({
			id: "remove-line-cards-selection",
			name: "Remove line cards from selection",
			editorCallback: (editor, ctx) => {
				const file = ctx.file;
				if (file) void this.removeLineCards(file, this.selectionLineRange(editor));
			},
		});
		this.addCommand({
			id: "exclude-line-cards-selection",
			name: "Exclude line cards in selection from study",
			editorCallback: (editor, ctx) => {
				const file = ctx.file;
				if (file) void this.setLineCardsDisabled(file, this.selectionLineRange(editor), true);
			},
		});
		this.addCommand({
			id: "include-line-cards-selection",
			name: "Include line cards in selection in study",
			editorCallback: (editor, ctx) => {
				const file = ctx.file;
				if (file) void this.setLineCardsDisabled(file, this.selectionLineRange(editor), false);
			},
		});

		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu: Menu, editor: Editor, info: MarkdownView | MarkdownFileInfo) => {
				const file = info.file;
				if (!file || file.extension !== "md") return;
				const range = this.selectionLineRange(editor);
				// Keep unrelated notes' menus clean: only surface these items on
				// notes already opted in, or where the selection holds line cards.
				const rawOptIn: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter?.["osmosis-cards"];
				const optedIn = rawOptIn === true || rawOptIn === "true";
				const { enabled, disabled } = this.lineCardsInRange(file.path, range);
				if (!optedIn && enabled.length + disabled.length === 0) return;
				this.addLineCardMenuItems(menu, file, range);
			}),
		);
	}

	/** Selected line range, or the cursor's line when there is no selection. */
	private selectionLineRange(editor: Editor): LineRange {
		const from = editor.getCursor("from");
		const to = editor.getCursor("to");
		return { start: Math.min(from.line, to.line), end: Math.max(from.line, to.line) };
	}

	/** Line cards in a note whose source line falls within the range. */
	private lineCardsInRange(notePath: string, range: LineRange): {
		enabled: Card[];
		disabled: Card[];
	} {
		const enabled: Card[] = [];
		const disabled: Card[] = [];
		for (const card of this.cardStore.getCardsByNote(notePath)) {
			if (card.cardType !== "line" || card.blockId === undefined) continue;
			if (card.sourceLine < range.start || card.sourceLine > range.end) continue;
			if (card.disabled) disabled.push(card);
			else enabled.push(card);
		}
		return { enabled, disabled };
	}

	/** Add the relevant line-card items to an editor or node context menu. */
	private addLineCardMenuItems(menu: Menu, file: TFile, range: LineRange): void {
		const { enabled, disabled } = this.lineCardsInRange(file.path, range);
		menu.addSeparator();
		menu.addItem((item) =>
			item.setTitle("Add line cards").setIcon("layers")
				.onClick(() => void this.addLineCards(file, range)),
		);
		if (enabled.length + disabled.length > 0) {
			menu.addItem((item) =>
				item.setTitle("Remove line cards").setIcon("layers")
					.onClick(() => void this.removeLineCards(file, range)),
			);
		}
		if (enabled.length > 0) {
			menu.addItem((item) =>
				item.setTitle("Exclude from study").setIcon("eye-off")
					.onClick(() => void this.setLineCardsDisabled(file, range, true)),
			);
		}
		if (disabled.length > 0) {
			menu.addItem((item) =>
				item.setTitle("Include in study").setIcon("eye")
					.onClick(() => void this.setLineCardsDisabled(file, range, false)),
			);
		}
	}

	/**
	 * Tag the elements overlapping a line range with block IDs (opting the
	 * note in if needed). Re-plans inside `process` so concurrent edits can't
	 * clobber. Public for the mind-map node menu.
	 */
	async addLineCards(file: TFile, range: LineRange): Promise<void> {
		const preview = planIdGeneration(await this.app.vault.cachedRead(file), range);
		if (preview.insertions.length === 0) {
			new Notice("Nothing to add — every element in the selection is already tagged.");
			return;
		}

		let tagged = 0;
		await this.app.vault.process(file, (data) => {
			const fresh = planIdGeneration(data, range);
			tagged = fresh.insertions.length;
			return fresh.content;
		});

		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const rawOptIn: unknown = fm?.["osmosis-cards"];
		if (rawOptIn !== true && rawOptIn !== "true") {
			await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
				frontmatter["osmosis-cards"] = true;
			});
		}
		new Notice(`Added ${String(tagged)} line card${tagged === 1 ? "" : "s"}.`);
	}

	/**
	 * Strip line-card block IDs from a line range. Warns first when the range
	 * contains user-authored IDs (deleting them can break links). The orphan
	 * flow soft-deletes the cards' schedules. Public for the mind-map node menu.
	 */
	async removeLineCards(file: TFile, range: LineRange): Promise<void> {
		const dryRun = removeBlockIdsInRange(await this.app.vault.cachedRead(file), range);
		if (dryRun.removed.length === 0) {
			new Notice("No line cards to remove in the selection.");
			return;
		}

		const apply = async () => {
			let count = 0;
			await this.app.vault.process(file, (data) => {
				const result = removeBlockIdsInRange(data, range);
				count = result.removed.length;
				return result.content;
			});
			new Notice(`Removed ${String(count)} line card${count === 1 ? "" : "s"}.`);
		};

		const userIds = dryRun.removed.filter((r) => r.isUserId).length;
		if (userIds > 0) {
			new ConfirmModal(
				this.app,
				{
					title: "Remove line cards?",
					body: `${String(userIds)} of these ${String(dryRun.removed.length)} block ID${dryRun.removed.length === 1 ? "" : "s"} ${userIds === 1 ? "was" : "were"} not created by Osmosis. Removing ${userIds === 1 ? "it" : "them"} may break existing "[[note#^id]]" links. To pause a card without deleting its ID, use "Exclude from study" instead.`,
					confirmText: "Remove anyway",
					warning: true,
				},
				() => void apply(),
			).open();
			return;
		}
		await apply();
	}

	/**
	 * Exclude (disable) or include (enable) every line card whose source line
	 * falls in the range. Updates the store immediately and flushes the flag
	 * to osmosis-schedule frontmatter. Public for the mind-map node menu.
	 */
	async setLineCardsDisabled(file: TFile, range: LineRange, disabled: boolean): Promise<void> {
		const { enabled, disabled: alreadyDisabled } = this.lineCardsInRange(file.path, range);
		const targets = disabled ? enabled : alreadyDisabled;
		if (targets.length === 0) {
			new Notice(disabled ? "No cards to exclude in the selection." : "No excluded cards to include in the selection.");
			return;
		}

		for (const card of targets) {
			this.cardStore.setDisabled(card.id, disabled);
			this.scheduleStore.setDisabled(file.path, card.blockId!, disabled);
		}
		await this.scheduleStore.flushPath(file.path);
		this.refreshDashboard();
		this.lineReveal.refreshChrome();
		new Notice(
			`${disabled ? "Excluded" : "Included"} ${String(targets.length)} line card${targets.length === 1 ? "" : "s"}.`,
		);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<OsmosisSettings>);

		// Identifies this install in review-log shard headers, so two devices
		// that slug to the same label are still distinguishable. Generated once
		// and never shown to the user.
		if (this.settings.installId === "") {
			this.settings.installId = generateInstallId();
			await this.saveData(this.settings);
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Re-sync all cards so folder/tag filter changes take effect immediately
		void this.cardSync.syncAll().then(() => {
			this.refreshDashboard();
		});
	}

	/** Migrate per-note mapSettings from data.json into osmosis-styles frontmatter. */
	private async migrateMapSettingsToFrontmatter(): Promise<void> {
		const entries = Object.entries(this.settings.mapSettings);
		if (entries.length === 0) return;

		for (const [filePath, overrides] of entries) {
			if (!overrides || Object.keys(overrides).length === 0) continue;
			const file = this.app.vault.getFileByPath(filePath);
			if (!(file instanceof TFile)) continue;

			try {
				await this.app.fileManager.processFrontMatter(
					file,
					(fm: Record<string, unknown>) => {
						const osmosis = (fm["osmosis-styles"] as Record<string, unknown>) ?? {};
						fm["osmosis-styles"] = osmosis;

						// Copy each override into frontmatter (don't overwrite existing values)
						for (const [key, value] of Object.entries(overrides)) {
							if (value !== undefined && osmosis[key] === undefined) {
								osmosis[key] = value;
							}
						}
					},
				);
			} catch {
				// File may have been deleted or be unreadable — skip silently
				continue;
			}
		}

		// Clear migrated entries from data.json
		this.settings.mapSettings = {};
		await this.saveData(this.settings);
		console.debug(`Osmosis: migrated map settings for ${entries.length} note(s) to frontmatter`);
	}
}

/** Random 8-hex-character ID identifying this install in shard headers. */
function generateInstallId(): string {
	const bytes = new Uint8Array(4);
	crypto.getRandomValues(bytes);
	return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
