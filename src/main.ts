import { Notice, Platform, Plugin, MarkdownView, TAbstractFile, TFile, WorkspaceLeaf, debounce, editorInfoField, setIcon, type App, type Editor, type MarkdownFileInfo, type Menu } from "obsidian";
/* eslint-disable-next-line import/no-extraneous-dependencies -- CodeMirror 6 ships inside Obsidian and is resolved from the host at runtime; it is a peer of the editor API, not a bundled dependency. */
import { keymap, type EditorView } from "@codemirror/view";
/* eslint-disable-next-line import/no-extraneous-dependencies -- Same as above: @codemirror/state is provided by Obsidian, never bundled. */
import { Prec } from "@codemirror/state";
import { DEFAULT_SETTINGS, OsmosisSettings, OsmosisSettingTab } from "./settings";
import { FSRSScheduler } from "./database/FSRSScheduler";
import { StudySessionManager } from "./study/StudySessionManager";
import { CardSyncService } from "./card-gen/CardSyncService";
import { CardStore } from "./store/CardStore";
import { FenceWriter } from "./store/FenceWriter";
import { ScheduleStore, SCHEDULE_FRONTMATTER_KEY, parseScheduleFrontmatter, parseDisabledFrontmatter, parseOcclusionFrontmatter, parseBuriedFrontmatter } from "./store/ScheduleStore";
import { NoteData } from "./store/NoteData";
import { DataMover, type VaultMoveResult } from "./store/DataMover";
import { SIDECAR_SUFFIX, hasSidecarKeys, isSidecarPath, migratedSidecarFolder } from "./store/sidecar";
import { FENCES_FRONTMATTER_KEY, parseFencesFrontmatter, type FenceOverlay } from "./store/fence-sidecar";
import { ReviewLog, isReviewLogPath, platformDeviceLabel, slugifyDeviceLabel, type ReviewLogCache } from "./store/ReviewLog";
import { MindMapView, VIEW_TYPE_MINDMAP } from "./views/MindMapView";
import { HIDE_NAVBAR_CLASS, TOOLBAR_GROUPS, syncNavbar } from "./views/ToolRibbon";
import { installMarkdownViewStandIn } from "./editor/EmbeddableMarkdownEditor";
import { PropertiesSidebarView, VIEW_TYPE_PROPERTIES } from "./views/PropertiesSidebarView";
import { FlashcardStudyView, VIEW_TYPE_STUDY } from "./views/FlashcardStudyView";
import { DashboardSidebarView, VIEW_TYPE_DASHBOARD } from "./views/DashboardSidebarView";
import { DecksView, VIEW_TYPE_DECKS } from "./views/DecksView";
import { BASES_CARD_BROWSER_VIEW_ID, createCardBrowserRegistration, type CardBrowserView } from "./views/CardBrowserView";
import { StatsView, VIEW_TYPE_STATS } from "./views/StatsView";
import { CosmosView, VIEW_TYPE_COSMOS } from "./views/CosmosView";
import { normalizeOverlays, type CosmosOverlays } from "./cosmos/overlays";
import { normalizeCollapsed, type SettingsSectionId } from "./cosmos/settings-sections";
import { NoteStudyProcessor } from "./views/NoteStudyProcessor";
import { LineRevealProcessor, findModeToggle, peekIcon } from "./views/LineRevealProcessor";
import { engineFor, isNoteLayout, noteLayout, writeNoteLayout, type MapEngine, type NoteLayout } from "./note-layout";
import { registerReviewShardProcessor } from "./views/ReviewShardProcessor";
import { GenerateFlashcardsModal } from "./views/GenerateFlashcardsModal";
import { ConfirmModal } from "./views/ConfirmModal";
import { planIdGeneration, removeBlockIdsInRange, type LineRange } from "./card-gen/generate-ids";
import {
	DEFAULT_OCCLUSION_MODE,
	decodeEmbedTarget,
	embedLines,
	ensureFenceIdentity,
	fenceOcclusions,
	locateOcclusionTarget,
	pickEmbedLine,
	rewriteFenceEmbeds,
	usedGroups,
	type FenceIdentity,
	type OcclusionTarget,
} from "./card-gen/occlusion";
import { OcclusionEditorModal } from "./views/OcclusionEditorModal";
import { generateBlockId } from "./block-id";
import { planRapidCard } from "./rapid-cards";
import { headingLinkAliasFilter } from "./heading-link-alias";
import { MutationHistory, type HistoryResult } from "./browse/history";
import type { MutationDeps } from "./browse/mutate";
import { EditHistory, holdAcross } from "./edit-history";
import { styleMappingFor } from "./styles";
import type { Card, OcclusionSet, StudyMode } from "./database/types";
import type { StudyScope } from "./study/types";
import { toStudyOrigin, type StudyOrigin } from "./study/study-origin";
import { migrateRenamedSettingKeys } from "./study/mode-names";
import { LEGACY_COSMOS_VIEW_TYPE, LEGACY_STORAGE_KEYS, cosmosTabTitle, cosmosViewStateFrom, migrateStorageKeys } from "./cosmos-legacy";

/**
 * Extensions the "Create image occlusion" item is offered for — Obsidian's own
 * image formats. SVG is included: it rasterises in an `<img>` like any other,
 * and diagrams are exactly what gets occluded.
 */
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "bmp", "svg", "webp", "avif"]);

/**
 * Every line an image file is embedded on in a note.
 *
 * Embeds are matched by *resolution* rather than by text, since the same file
 * can be written as a short link, a full path, or percent-encoded — and the
 * file-menu hands us a `TFile`, not the spelling the author used. A note can
 * hold several, deliberately: each instance of a diagram carries its own masks,
 * so which one was clicked is `pickEmbedLine`'s question to answer.
 */
function findEmbedLines(content: string, image: TFile, app: App, notePath: string): number[] {
	return embedLines(content)
		.filter((embed) =>
			app.metadataCache.getFirstLinkpathDest(decodeEmbedTarget(embed.target), notePath)?.path === image.path)
		.map((embed) => embed.line);
}

/**
 * The document line a click landed on, or null when it cannot be determined.
 *
 * Obsidian's `file-menu` carries no position and the bundled 1.13 `Editor`
 * exposes neither `posAtMouse` nor `posAtCoords`, so the click is mapped
 * through CodeMirror's own `posAtCoords` on the view behind the editor. Null in
 * reading mode, where there is no CodeMirror view to ask.
 */
function lineAtMouse(editor: Editor, event: MouseEvent | null): number | null {
	if (!event) return null;
	const view = (editor as unknown as { cm?: EditorView }).cm;
	if (!view) return null;
	const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
	if (pos === null) return null;
	// CodeMirror numbers lines from 1; the editor API and our parsers from 0.
	return view.state.doc.lineAt(pos).number - 1;
}

/** localStorage key for the review log's rollup cache (per vault, per device). */
const REVIEW_ROLLUP_CACHE_KEY = "osmosis-review-rollup";

/** The base file the Browse entry points open, created on first use. */
const CARD_BROWSER_BASE_PATH = "Osmosis/Osmosis Browser.base";

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
    name: Browser
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
	/** Where each note's Osmosis data lives: its frontmatter or its sidecar. Every schedule read and write goes through it. */
	noteData!: NoteData;
	/** The "Move data …" commands and the sidecar folder move. */
	dataMover!: DataMover;
	/** Explicit deps for the card browser's four mutations. */
	cardMutations!: MutationDeps;
	/** Session-only undo stack for those mutations. */
	mutationHistory!: MutationHistory;
	/** Undo/redo for map edits, one history per file, shared by the mind map and Cosmos. */
	readonly editHistory = new EditHistory(() => ({
		maxSteps: this.settings.undoMaxSteps,
		maxMemoryMB: this.settings.undoMaxMemoryMB,
	}));
	reviewLog!: ReviewLog;
	cardSync!: CardSyncService;
	lineReveal!: LineRevealProcessor;
	/** Reading-view fence cards, so `lineReveal` can redraw them on a mode change. */
	noteStudy!: NoteStudyProcessor;
	/**
	 * Resolves once the startup vault scan has filled the card store.
	 *
	 * `syncAll` walks every markdown file in the vault, and a view the workspace
	 * restored is on screen well before it finishes. Anything that reads the
	 * store to decide *whether there is work to do* — rather than to display
	 * whatever it currently holds — has to wait for this, or it decides against
	 * an empty store.
	 *
	 * Resolves on failure too: a scan that threw must not leave study
	 * permanently unavailable.
	 */
	cardStoreReady!: Promise<void>;
	/** True once {@link cardStoreReady} has settled, so callers can stay synchronous. */
	isCardStoreReady = false;
	private resolveCardStoreReady!: () => void;
	/**
	 * The scope a study tab that is opening right now should start on
	 * (`openStudySession`), and what the tab showed before study took it over.
	 * A study tab that opens without one steps back to its origin (or the Decks
	 * page) instead, so this is how a new one tells the two apart.
	 */
	private pendingStudy: { scope: StudyScope; origin: StudyOrigin | null } | null = null;
	/** The most recent right-click, so a file-menu can be traced back to a line. */
	private lastContextMenu: MouseEvent | null = null;
	/**
	 * Whether Rapid Flashcard Mode is on. Deliberately in memory only and off at
	 * every startup: nothing but the menu item turns it off, and a persisted
	 * "on" would mean Enter behaving strangely days later in an unrelated note.
	 */
	private rapidMode = false;

	async onload() {
		await this.loadSettings();

		// Node editors stand in as the active MarkdownView while focused, so
		// plugins like QuickAdd can read and replace their selection.
		this.register(installMarkdownViewStandIn(this.app));

		// Armed before anything can await it — the startup scan below settles it.
		this.cardStoreReady = new Promise<void>((resolve) => {
			this.resolveCardStoreReady = () => {
				this.isCardStoreReady = true;
				resolve();
			};
		});

		// In-memory card store — replaces SQLite database
		this.cardStore = new CardStore();

		// Note data — the note-or-sidecar seam. Its rename/delete listeners are
		// registered before the plugin's own below, so a renamed note's sidecar
		// is re-keyed before anything re-reads it.
		this.noteData = new NoteData(this.app, () => ({
			dataLocation: this.settings.dataLocation,
			sidecarFolder: this.settings.sidecarFolder,
		}), (path) => isReviewLogPath(path, this.settings.reviewLogFolder), () => {
			this.settings.sidecarFolderExcluded = true;
			void this.saveData(this.settings);
		});
		this.noteData.attach(this);

		// Fence writer — writes schedule data back into markdown fences, or into
		// a sidecar-mode note's sidecar
		this.fenceWriter = new FenceWriter(this.app.vault, this.noteData);

		// Schedule store — debounced osmosis-schedule frontmatter writes for line cards
		this.scheduleStore = new ScheduleStore(
			this.noteData,
			(notePath: string) => this.app.vault.getFileByPath(notePath),
		);

		this.dataMover = new DataMover(
			this.app,
			this.noteData,
			(file: TFile) => this.flushNoteData(file),
			(path: string) => this.isOsmosisDataPath(path),
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
			(path: string) => this.isOsmosisDataPath(path),
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
				const raw: unknown = this.noteData.frontmatter(file)[SCHEDULE_FRONTMATTER_KEY];
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
				const raw: unknown = this.noteData.frontmatter(file)[SCHEDULE_FRONTMATTER_KEY];
				const disabled = parseDisabledFrontmatter(raw);
				for (const [blockId, flag] of this.scheduleStore.getPendingDisabled(file.path)) {
					if (flag) disabled.add(blockId);
					else disabled.delete(blockId);
				}
				return disabled;
			},
			(file: TFile) => {
				// Shape sets for occluded line cards. No pending overlay: masks
				// change only when the editor saves them, which rewrites the
				// frontmatter directly rather than staging through ScheduleStore.
				const raw: unknown = this.noteData.frontmatter(file)[SCHEDULE_FRONTMATTER_KEY];
				return parseOcclusionFrontmatter(raw);
			},
			(file: TFile) => {
				// Buried line cards: osmosis-schedule `buriedUntil` overlaid with
				// pending unflushed buries and un-buries
				const raw: unknown = this.noteData.frontmatter(file)[SCHEDULE_FRONTMATTER_KEY];
				const buried = parseBuriedFrontmatter(raw);
				for (const [key, until] of this.scheduleStore.getPendingBuried(file.path)) {
					if (until === null) buried.delete(key);
					else buried.set(key, until);
				}
				return buried;
			},
			(file: TFile) => this.fenceOverlays(file),
		);

		// Card-browser mutations. Explicit deps rather than the plugin, so the four
		// operations and their undo records are testable without Bases or a vault.
		// `vault.read` rather than `cachedRead`: these snapshots are what undo
		// compares against before overwriting a note, so they must be the file as it
		// actually is, not as the cache last saw it.
		this.cardMutations = {
			cardStore: this.cardStore,
			fenceWriter: this.fenceWriter,
			lineCards: this.scheduleStore,
			files: {
				read: (file: TFile) => this.app.vault.read(file),
				process: (file: TFile, fn: (data: string) => string) => this.app.vault.process(file, fn),
				processFrontMatter: (file: TFile, fn: (frontmatter: Record<string, unknown>) => void) =>
					this.app.fileManager.processFrontMatter(file, fn),
				scheduleFile: (file: TFile) => this.noteData.targetFor(file),
			},
			resolveFile: (notePath: string) => this.app.vault.getFileByPath(notePath),
		};
		this.mutationHistory = new MutationHistory(this.cardMutations);

		this.addSettingTab(new OsmosisSettingTab(this.app, this));

		this.registerView(VIEW_TYPE_MINDMAP, (leaf: WorkspaceLeaf) => new MindMapView(leaf));
		this.registerView(VIEW_TYPE_PROPERTIES, (leaf: WorkspaceLeaf) => new PropertiesSidebarView(leaf));
		this.registerView(VIEW_TYPE_DASHBOARD, (leaf: WorkspaceLeaf) => new DashboardSidebarView(leaf));
		this.registerView(VIEW_TYPE_DECKS, (leaf: WorkspaceLeaf) => new DecksView(leaf, this));
		this.registerView(VIEW_TYPE_STATS, (leaf: WorkspaceLeaf) => new StatsView(leaf));
		this.registerView(VIEW_TYPE_STUDY, (leaf: WorkspaceLeaf) => new FlashcardStudyView(leaf, this));
		this.registerView(VIEW_TYPE_COSMOS, (leaf: WorkspaceLeaf) => new CosmosView(leaf));
		// Cosmos was the 3D graph, under another view type, before T107. Its
		// per-device preferences move to their new keys before any tab reads
		// them, and tabs saved under the old type reopen as Cosmos.
		migrateStorageKeys({
			load: (key) => this.app.loadLocalStorage(key) as unknown,
			save: (key, value) => this.app.saveLocalStorage(key, value),
		}, LEGACY_STORAGE_KEYS);
		this.app.workspace.onLayoutReady(() => void this.reopenLegacyCosmosLeaves());

		// Browse is a Bases view, not a view type of our own: Bases already owns
		// note-level querying, sorting and `.base` persistence, and a second
		// browser would only reimplement them. Registration fails when the Bases
		// core plugin is disabled, which is a state the Browse entry points have
		// to explain rather than fail silently in.
		this.basesAvailable = this.registerBasesView(
			BASES_CARD_BROWSER_VIEW_ID,
			createCardBrowserRegistration(this),
		);

		// The Decks page is the plugin's only ribbon entry; the sidebar dashboard
		// it mirrors is opened by the `open-dashboard` command. A mind map is
		// opened from a note's header action, file menu, or the command below —
		// all of which know which note to map, which the ribbon never did.
		this.addRibbonIcon("brain-circuit", "Osmosis decks", () => {
			void this.activateDecksTab();
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

		// The Osmosis bar hides Obsidian's navigation bar only while a map is the active view: it comes back whenever another view becomes active.
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => syncNavbar(this.app)));

		// One command per mind map toolbar button, so each can take a hotkey.
		// None ships with one: the view's built-in keys already cover them.
		for (const def of TOOLBAR_GROUPS.flat()) {
			if (!def.command) continue;
			this.addCommand({
				id: `mindmap-${def.id}`,
				name: def.command,
				icon: def.icon,
				// Cosmos draws the same ribbon (minus fold and unfold), so the command runs there too.
				checkCallback: (checking) => {
					const view = this.app.workspace.getActiveViewOfType(MindMapView) ?? this.app.workspace.getActiveViewOfType(CosmosView);
					return view ? view.runToolbarCommand(def, checking) : false;
				},
			});
		}

		this.addCommand({
			id: "open-graph3d",
			name: "Open Cosmos for current note",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (file?.extension !== "md") return false;
				if (!checking) void this.openCosmos(file);
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

		// Undo/redo for card-browser mutations. Deliberately left without a default
		// hotkey: Ctrl+Z belongs to the editor, and taking it here would break undo
		// in every note. Both are also buttons in the browser's own toolbar.
		this.addCommand({
			id: "undo-card-mutation",
			name: "Undo last card mutation",
			checkCallback: (checking) => {
				if (this.mutationHistory.undoLabel === null) return false;
				if (!checking) void this.undoCardMutation();
				return true;
			},
		});

		this.addCommand({
			id: "redo-card-mutation",
			name: "Redo last undone card mutation",
			checkCallback: (checking) => {
				if (this.mutationHistory.redoLabel === null) return false;
				if (!checking) void this.redoCardMutation();
				return true;
			},
		});

		// ── Note header ⋯ menu: Peek ────────────────────────────
		// The note view is Obsidian's, not ours, so its ⋯ menu is reached through
		// the workspace `file-menu` event (source "more-options", which carries
		// the leaf). `setSection("pane")` joins the editor-behaviour group at the
		// top (Rapid flashcard mode sits there too). Peek used to be a header button.
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file: TAbstractFile, source: string, leaf?: WorkspaceLeaf) => {
				if (source !== "more-options") return;
				if (!(file instanceof TFile) || file.extension !== "md") return;
				const view = leaf?.view;
				if (!(view instanceof MarkdownView) || !this.lineReveal.hasCards(file.path)) return;
				menu.addItem((item) => {
					item.setTitle("Peek mode")
						.setIcon(peekIcon())
						.setChecked(this.lineReveal.isPeeking(file.path))
						.setSection("pane")
						.onClick(() => {
							this.lineReveal.peekNote(view);
						});
				});
			}),
		);

		// ── File menu: "Mind map view" ──────────────────────────
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file: TAbstractFile, _source: string, leaf?: WorkspaceLeaf) => {
				if (!(file instanceof TFile) || file.extension !== "md") return;
				menu.addItem((item) => {
					item.setTitle("Map view")
						.setIcon("brain-circuit")
						.onClick(() => {
							if (leaf) {
								void this.openNoteMap(leaf, file.path);
							} else {
								void this.activateMindMapView();
							}
						});
				});
				menu.addItem((item) => {
					item.setTitle("Cosmos")
						.setIcon("orbit")
						.onClick(() => {
							void this.openCosmos(file);
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

		// ── Image context menu: "Create image occlusion" ─────────
		//
		// Obsidian exposes no image-specific menu event, so the item is offered
		// through both menus that can surface over an embed: `editor-menu`,
		// which fires for a right-click in the editor (including on a selected
		// image since 1.13), and `file-menu`, which fires when the menu is
		// raised against the image file itself. Whichever one the click reaches,
		// the item is there.
		// The file-menu hands over the image but not where it was clicked, so the
		// right-click that raised it is recorded here. Captured, so it is on
		// record before Obsidian's own handler builds the menu.
		this.registerDomEvent(document, "contextmenu", (event) => { this.lastContextMenu = event; }, { capture: true });

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, image: TAbstractFile, _source: string, leaf?: WorkspaceLeaf) => {
				if (!(image instanceof TFile) || !IMAGE_EXTENSIONS.has(image.extension.toLowerCase())) return;
				const view = leaf?.view instanceof MarkdownView ? leaf.view : this.app.workspace.getActiveViewOfType(MarkdownView);
				const note = view?.file;
				if (!note) return;
				// A note can embed one image more than once, each instance with its
				// own masks, so the file alone cannot say which was clicked. The
				// click's own position answers it; the cursor is the fallback for
				// reading mode, where there is no CodeMirror view to ask. Neither
				// resolving leaves the item off rather than guessing a diagram.
				const line = pickEmbedLine(
					findEmbedLines(view.editor.getValue(), image, this.app, note.path),
					lineAtMouse(view.editor, this.lastContextMenu) ?? view.editor.getCursor().line,
				);
				if (line === null) return;
				menu.addItem((item) => {
					item.setTitle("Create image occlusion")
						.setIcon("square-dashed-mouse-pointer")
						// Grouped with Obsidian's own image actions (Copy image,
						// Swap file, …) rather than trailing after Delete image,
						// which is where an unsectioned item lands.
						.setSection("image")
						.onClick(() => { void this.openOcclusionEditor(note, line); });
				});
			}),
		);

		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu: Menu, editor: Editor, info: MarkdownView | MarkdownFileInfo) => {
				const file = info.file;
				if (!file || file.extension !== "md") return;
				const line = editor.getCursor().line;
				if (locateOcclusionTarget(editor.getValue(), line) === null) return;
				menu.addItem((item) => {
					item.setTitle("Create image occlusion")
						.setIcon("square-dashed-mouse-pointer")
						.onClick(() => { void this.openOcclusionEditor(file, line); });
				});
			}),
		);

		this.addCommand({
			id: "create-image-occlusion",
			name: "Create image occlusion",
			editorCheckCallback: (checking, editor, ctx) => {
				const file = ctx.file;
				if (!file || file.extension !== "md") return false;
				if (locateOcclusionTarget(editor.getValue(), editor.getCursor().line) === null) return false;
				if (!checking) void this.openOcclusionEditor(file, editor.getCursor().line);
				return true;
			},
		});

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

		// The study tab without starting a session: the session already running
		// in it, or else the Decks page, which a bare study tab turns into
		this.addCommand({
			id: "open-study",
			name: "Open study tab",
			callback: () => {
				void this.activateMainView(VIEW_TYPE_STUDY);
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

		// ── Note Study Mode ───────────────────────────────
		this.noteStudy = new NoteStudyProcessor(this);
		this.noteStudy.register();

		// Progressive line-card reveal in reading view (plan §5)
		this.lineReveal = new LineRevealProcessor(this);
		this.lineReveal.register();

		// Review log shards are notes now, so opening one has to show something
		// better than fifteen thousand lines of JSON.
		registerReviewShardProcessor(this);

		// ── Card Insertion Commands ──────────────────────────────
		this.registerCardInsertionCommands();

		// ── Granular line-card add/remove/exclude (plan §8) ──────
		this.registerLineCardCommands();

		// ── Rapid Flashcard Mode ────────────────────────────────
		this.registerRapidFlashcardMode();

		// ── Moving data between notes and sidecars ──────────────
		this.registerDataMoveCommands();

		// ── Heading links: hide the block id behind an alias ────
		// Workspace editor extensions reach the note editor and the mind map
		// and Cosmos node editors alike (they are Obsidian markdown editors).
		this.registerEditorExtension(
			headingLinkAliasFilter((state, linkpath) => {
				const source = state.field(editorInfoField, false)?.file ?? null;
				if (!source) return null;
				const target = linkpath === "" ? source : this.app.metadataCache.getFirstLinkpathDest(linkpath, source.path);
				if (!target) return null;
				return this.app.metadataCache.getFileCache(target)?.headings?.map((h) => h.heading) ?? null;
			}),
		);

		// ── Card Sync ───────────────────────────────────────────
		// Full vault scan once layout is ready (files are loaded)
		this.app.workspace.onLayoutReady(() => {
			// Before the scan: line-card schedules in sidecars read through it.
			// Before the migration too, which writes where each note keeps its styles.
			this.noteData.rebuildIndex();
			// A vault on the old default folder moves first (it never rejects),
			// so nothing below writes a sidecar into the folder being vacated.
			void this.migrateSidecarFolderDefault().then(() => {
				void this.excludeSidecarFolderOnce();

				// Migrate per-note mapSettings from data.json → osmosis-styles frontmatter
				void this.migrateMapSettingsToFrontmatter();
				return this.cardSync.syncAll();
			}).then(() => {
				this.refreshDashboard();
				this.lineReveal.refreshChrome();
			}).catch((error: unknown) => {
				// A throw here would otherwise vanish AND leave header chrome
				// and dashboard stale until the next workspace event
				console.error("Osmosis: startup card sync/refresh failed", error);
			}).finally(() => {
				this.resolveCardStoreReady();
			});
		});

		// Incremental sync on file changes (debounced).
		//
		// The files are accumulated in a map rather than passed as the debounced
		// function's argument, because `debounce` keeps only the *last* call's
		// arguments. A burst that touches several notes — a study session flushes
		// schedule frontmatter into every transcluded note it rated — used to
		// sync whichever note happened to be written last and silently drop the
		// rest, leaving their cards stale in the store until something else
		// touched them.
		//
		// Keyed by path so repeated writes to one note collapse, and each file's
		// failure is caught on its own so one bad note cannot cost the whole
		// batch its refresh.
		const pendingSync = new Map<string, TFile>();
		const debouncedSync = debounce(() => {
			const files = [...pendingSync.values()];
			pendingSync.clear();
			void Promise.all(
				files.map((file) =>
					this.cardSync.syncFile(file).catch((error: unknown) => {
						console.error(`Osmosis: incremental card sync failed for ${file.path}`, error);
					}),
				),
			).then(() => {
				this.refreshDashboard();
				this.lineReveal.refreshChrome();
			});
		}, 2000, true);

		const queueSync = (file: TFile): void => {
			pendingSync.set(file.path, file);
			debouncedSync();
		};

		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (this.isNoteFile(file)) queueSync(file);
			}),
		);

		// A sidecar edited, synced in, created or deleted: its note's line-card
		// schedules changed without the note itself being touched.
		this.register(this.noteData.onChange((notePath) => {
			const note = this.app.vault.getFileByPath(notePath);
			if (note && this.isNoteFile(note)) queueSync(note);
		}));

		// Registered only once layout is ready: Obsidian also fires `create` for
		// every existing file while the vault loads, which would queue the whole
		// vault for a second, all-at-once sync on top of `syncAll` — the startup
		// freeze. Files that exist at load are `syncAll`'s job.
		this.app.workspace.onLayoutReady(() => {
			this.registerEvent(
				this.app.vault.on("create", (file) => {
					if (this.isNoteFile(file)) queueSync(file);
				}),
			);
		});

		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (this.isNoteFile(file)) {
					this.cardSync.handleDelete(file.path);
					this.refreshDashboard();
				}
			}),
		);

		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (this.isNoteFile(file)) {
					this.cardSync.handleRename(oldPath, file.path);
					this.refreshDashboard();
					return;
				}
				if (!(file instanceof TFile)) return;
				// A note moved *into* the review log or sidecar folder: nothing
				// will sync that path again, so its cards have to go now or
				// linger forever.
				if (
					file.extension === "md"
					&& !this.isOsmosisDataPath(oldPath)
				) {
					this.cardSync.handleDelete(oldPath);
					this.refreshDashboard();
					return;
				}
				if (file.extension !== "md") void this.repointFenceEmbeds(oldPath, file);
			}),
		);
	}

	/**
	 * Whether a vault event is about a note Osmosis should look at.
	 *
	 * Review log shards are Markdown so that Obsidian Sync carries them without
	 * configuration, which also makes them indistinguishable from notes to every
	 * listener above. Each flush would otherwise re-parse its own 1.8 MB shard
	 * through the card parser and drag a dashboard and chrome refresh along with
	 * it — silently, since nothing errors; studying just gets slower the longer
	 * you have been studying.
	 */
	private isNoteFile(file: TAbstractFile): file is TFile {
		return (
			file instanceof TFile
			&& file.extension === "md"
			&& !this.isOsmosisDataPath(file.path)
		);
	}

	/**
	 * True for a path Osmosis keeps its own data in — a review log shard or a
	 * sidecar. Both are Markdown, and neither is ever a note: not card-sync
	 * input, not a deck, not a Cosmos note.
	 */
	isOsmosisDataPath(path: string): boolean {
		return isReviewLogPath(path, this.settings.reviewLogFolder) || this.noteData.isSidecar(path);
	}

	/**
	 * A note's `osmosis-fences` entries, by fence id — the fence review data a
	 * sidecar-mode note keeps out of its fence headers. Empty in note mode.
	 */
	fenceOverlays(file: TFile): Map<string, FenceOverlay> {
		return parseFencesFrontmatter(this.noteData.frontmatter(file)[FENCES_FRONTMATTER_KEY]);
	}

	/**
	 * Open the occlusion editor on the image embed at `line` of `file`.
	 *
	 * Which carrier the shapes land in follows where the image already lives: an
	 * embed inside an ```osmosis fence keeps its set in that fence's header,
	 * anything else becomes a line card. Wrapping prose in a fence would
	 * restructure the user's note and cost the embed Obsidian's own rename
	 * handling, which only reaches links *outside* code fences.
	 *
	 * Identity is minted lazily and only on save — a fence with no `id:`, an
	 * embed with no `{label}`, a line with no block ID. Cancelling the editor
	 * must leave the note exactly as it was.
	 */
	async openOcclusionEditor(file: TFile, line: number): Promise<void> {
		const content = await this.app.vault.cachedRead(file);
		const target = locateOcclusionTarget(content, line);
		if (!target) {
			new Notice("No image on this line to occlude.");
			return;
		}

		const image = this.app.metadataCache.getFirstLinkpathDest(decodeEmbedTarget(target.image), file.path);
		if (!image) {
			new Notice(`Image not found: ${target.image}`);
			return;
		}

		const lines = content.split("\n");
		// A sidecar-mode fence's entry owns its shape sets once it exists; the
		// header's are stale then (see `fence-sidecar.ts`).
		const fenceSets = target.carrier !== "fence"
			? undefined
			: (target.id ? this.fenceOverlays(file).get(target.id)?.occlusions : undefined)
				?? fenceOcclusions(lines, target.span!);
		const existing = fenceSets
			? fenceSets.get(target.label ?? "")
			: parseOcclusionFrontmatter(
				this.noteData.frontmatter(file)[SCHEDULE_FRONTMATTER_KEY],
			).get(target.blockId ?? "");

		// Numbering is per carrier, not per diagram: a fence's occlusion cards
		// all derive `<fenceId>-cN`, so a second diagram starting again from c1
		// would overwrite the first diagram's cards.
		const reservedGroups = fenceSets
			? usedGroups(fenceSets.values())
				.filter((group) => !(existing?.shapes ?? []).some((shape) => shape.group === group))
			: [];

		new OcclusionEditorModal(this.app, {
			src: this.app.vault.getResourcePath(image),
			image: target.image,
			set: existing ?? { mode: DEFAULT_OCCLUSION_MODE, shapes: [] },
			reservedGroups,
			onSave: (set) => {
				void this.saveOcclusion(file, target, set).catch((error: unknown) => {
					console.error("Osmosis: failed to save image occlusion", error);
					new Notice("Failed to save image occlusion — see the console for details.");
				});
			},
		}).open();
	}

	/**
	 * Persist an edited shape set, minting whatever identity its carrier still
	 * lacks first.
	 *
	 * The identity edits and the shape write are separate passes over the file
	 * because they go through different machinery — `vault.process` for the
	 * markdown body, `FenceWriter`/`ScheduleStore` for the card data — and the
	 * writers locate their target by the very ID being minted, so it has to be
	 * on disk before they run.
	 */
	private async saveOcclusion(file: TFile, target: OcclusionTarget, set: OcclusionSet): Promise<void> {
		if (target.carrier === "fence") {
			// Re-derived inside `process` rather than reused from the modal's
			// snapshot, so an edit made to the note while the editor was open
			// cannot be clobbered — the same pattern `addLineCards` follows.
			let identity: FenceIdentity | null = null;
			await this.app.vault.process(file, (data) => {
				identity = ensureFenceIdentity(data, target.line, target.image, () => generateBlockId());
				return identity?.content ?? data;
			});
			if (!identity) {
				new Notice("Could not find the card fence for this image.");
				return;
			}

			const { id, label } = identity as FenceIdentity;
			await this.fenceWriter.writeOcclusion(file, id, label, set);
		} else {
			let blockId = target.blockId;
			if (blockId === null) {
				const plan = planIdGeneration(await this.app.vault.cachedRead(file), {
					start: target.line,
					end: target.line,
				});
				const insertion = plan.insertions[0];
				if (!insertion) {
					new Notice("Could not tag this image as a card — its line cannot carry a block ID.");
					return;
				}
				blockId = insertion.id;
				await this.app.vault.process(file, (data) => {
					const fresh = planIdGeneration(data, { start: target.line, end: target.line });
					blockId = fresh.insertions[0]?.id ?? blockId;
					return fresh.content;
				});
				await this.ensureCardsOptIn(file);
			}

			this.scheduleStore.setOcclusion(file.path, blockId!, set);
			await this.scheduleStore.flushPath(file.path);
		}

		await this.cardSync.syncFile(file);
		this.refreshDashboard();
		this.lineReveal.refreshChrome();
		const groups = new Set(set.shapes.map((shape) => shape.group)).size;
		new Notice(
			set.shapes.length === 0
				? "Removed the image occlusion."
				: `Saved ${String(set.shapes.length)} mask${set.shapes.length === 1 ? "" : "s"} as ${String(groups)} card${groups === 1 ? "" : "s"}.`,
		);
	}

	/** Whether a note's frontmatter already opts it into card generation. */
	private hasCardsOptIn(file: TFile): boolean {
		const rawOptIn: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter?.["osmosis-cards"];
		return rawOptIn === true || rawOptIn === "true";
	}

	/** Add `osmosis-cards: true` to a note that has not opted into card generation. */
	private async ensureCardsOptIn(file: TFile): Promise<void> {
		if (this.hasCardsOptIn(file)) return;
		await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
			frontmatter["osmosis-cards"] = true;
		});
	}

	/**
	 * Opt a note into card generation after a card has been written into its
	 * editor — by Rapid Flashcard Mode or an "Insert … card" command.
	 *
	 * Without the opt-in the note generates *nothing*, fences included (see
	 * `processNote`), so a card inserted into an un-opted-in note would sit
	 * there inert. The editor is flushed first because `processFrontMatter`
	 * reads the file from disk, while the new card is so far only in the
	 * editor's buffer.
	 */
	private async optInAfterCardInsert(view: MarkdownView): Promise<void> {
		const file = view.file;
		if (!file || this.hasCardsOptIn(file)) return;
		await view.save();
		await this.ensureCardsOptIn(file);
	}

	/**
	 * Repoint osmosis-fence image embeds after the image they point at is renamed.
	 *
	 * Obsidian's metadata cache deliberately does not index links inside code
	 * fences — the reason `[[example]]` in a code block renders as literal text —
	 * so its own rename handling cannot see these embeds and would leave an
	 * occluded diagram pointing at a path that no longer exists. Line cards need
	 * none of this: their embed is ordinary Markdown outside any fence.
	 *
	 * Only fences are rewritten, and only in notes whose cached links or embeds
	 * already mention the image, so the common rename touches a handful of files
	 * rather than the whole vault.
	 */
	private async repointFenceEmbeds(oldPath: string, file: TFile): Promise<void> {
		const basename = (path: string): string => path.split("/").pop() ?? path;
		const oldName = basename(oldPath);
		const newName = basename(file.path);

		// A link is ours to rewrite when it resolved to the renamed file. The
		// cache can no longer resolve the old path, so match on the text as
		// written: either the full old path or its basename (the shortest-path
		// spelling Obsidian writes by default). The replacement keeps whichever
		// form the author used.
		const resolve = (target: string): string | null => {
			if (target === oldPath) return file.path;
			if (target === oldName) return newName;
			return null;
		};

		for (const note of this.app.vault.getMarkdownFiles()) {
			const content = await this.app.vault.cachedRead(note);
			if (!content.includes(oldName)) continue;
			const rewritten = rewriteFenceEmbeds(content, resolve);
			if (rewritten !== content) {
				await this.app.vault.modify(note, rewritten);
			}
		}
	}

	onunload() {
		// Never leave Obsidian's navigation bar hidden behind a plugin that is gone
		document.body.removeClass(HIDE_NAVBAR_CLASS);
		this.saveOverlays.run();
		// Force out any pending schedule frontmatter writes
		void this.scheduleStore.flush();
		// ...and any fence schedules a note study session was still holding, so
		// closing Obsidian mid-session does not lose the reviews it staged
		void this.fenceWriter.flush();
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
	 * Point sidecar lookup at a different folder, moving the sidecar files
	 * there. Pending writes go out first, into the old folder; the setting
	 * changes before the files move, so each is re-indexed as it lands. The
	 * full re-sync re-reads every note's schedules through the rebuilt index.
	 */
	async changeSidecarFolder(folder: string): Promise<void> {
		const previous = this.settings.sidecarFolder;
		if (folder === previous) return;
		await this.scheduleStore.flush();
		await this.fenceWriter.flush();
		const files = this.app.vault.getMarkdownFiles()
			.filter((file) => isSidecarPath(file.path, previous) && file.name.endsWith(SIDECAR_SUFFIX));
		this.settings.sidecarFolder = folder;
		const moved = await this.dataMover.moveSidecars(files, folder);
		this.noteData.rebuildIndex();
		this.noteData.excludeFolder(previous, folder);
		this.settings.sidecarFolderExcluded = true;
		await this.saveSettings();
		if (files.length > 0) {
			const failed = files.length - moved;
			new Notice(`Moved ${plural(moved, "sidecar file")} to "${folder}".${failed > 0 ? ` ${plural(failed, "file")} could not be moved: see the console.` : ""}`);
		}
	}

	/**
	 * Move a vault still on the old default sidecar folder to the new one, once
	 * the layout is ready (the move needs the vault's files and the stores).
	 * With files on disk it goes through `changeSidecarFolder`, which also
	 * swaps the Excluded-files entry; with no folder there is nothing to move,
	 * so only the setting changes.
	 */
	private async migrateSidecarFolderDefault(): Promise<void> {
		const target = migratedSidecarFolder(this.settings.sidecarFolder);
		if (target === null) return;
		try {
			if (this.app.vault.getAbstractFileByPath(this.settings.sidecarFolder) === null) {
				this.settings.sidecarFolder = target;
				await this.saveData(this.settings);
				return;
			}
			await this.changeSidecarFolder(target);
		} catch (error) {
			console.error("Osmosis: moving the sidecar folder to its new default failed", error);
		}
	}

	/**
	 * Put an already existing sidecar folder in Obsidian's Excluded files, once.
	 * A folder Osmosis creates is excluded as it is created (`NoteData`), and a
	 * folder change swaps the entry; the flag keeps a user's removal standing.
	 */
	private async excludeSidecarFolderOnce(): Promise<void> {
		if (this.settings.sidecarFolderExcluded) return;
		if (this.app.vault.getAbstractFileByPath(this.settings.sidecarFolder) === null) return;
		this.noteData.excludeFolder(null, this.settings.sidecarFolder);
		this.settings.sidecarFolderExcluded = true;
		await this.saveData(this.settings);
	}

	/**
	 * Write out everything pending for a note before its data moves: its open
	 * editors (a move reads the file from disk) and staged schedule and fence
	 * writes. Mind map edits are written as they are made, so there is nothing
	 * of theirs to flush.
	 */
	private async flushNoteData(file: TFile): Promise<void> {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			if (leaf.view instanceof MarkdownView && leaf.view.file?.path === file.path) await leaf.view.save();
		}
		await this.scheduleStore.flushPath(file.path);
		await this.fenceWriter.flushPath(file.path);
	}

	/**
	 * The four "Move data" commands. The one-note pair is shown only
	 * when there may be something to move: data in the note's properties or a
	 * fence card (whose header may hold review state), or a sidecar to empty.
	 */
	private registerDataMoveCommands(): void {
		const activeNote = (): TFile | null => {
			const file = this.app.workspace.getActiveFile();
			return file?.extension === "md" && !this.isOsmosisDataPath(file.path) ? file : null;
		};

		this.addCommand({
			id: "move-data-to-sidecar",
			name: "Move data to sidecar",
			checkCallback: (checking) => {
				const file = activeNote();
				if (!file) return false;
				const inNote = hasSidecarKeys(this.app.metadataCache.getFileCache(file)?.frontmatter)
					|| this.cardStore.getCardsByNote(file.path).some((card) => card.blockId === undefined);
				if (!inNote) return false;
				if (!checking) void this.runNoteMove(file, "sidecar");
				return true;
			},
		});

		this.addCommand({
			id: "move-data-into-note",
			name: "Move data into note",
			checkCallback: (checking) => {
				const file = activeNote();
				if (!file || !this.noteData.sidecarOf(file)) return false;
				if (!checking) void this.runNoteMove(file, "note");
				return true;
			},
		});

		this.addCommand({
			id: "move-all-data-to-sidecars",
			name: "Move all data to sidecars",
			callback: () => {
				new ConfirmModal(this.app, {
					title: "Move all data to sidecars?",
					body: `Every note's flashcard schedules, fence review data and mind map styles move out of the note into a sidecar file in "${this.settings.sidecarFolder}". Notes without Osmosis data are not touched.`,
					confirmText: "Move to sidecars",
				}, () => { void this.runVaultMove("sidecar"); }).open();
			},
		});

		this.addCommand({
			id: "move-all-data-into-notes",
			name: "Move all data into notes",
			checkCallback: (checking) => {
				if (this.noteData.notesWithSidecars().length === 0) return false;
				if (!checking) {
					new ConfirmModal(this.app, {
						title: "Move all data into notes?",
						body: "Every sidecar's data moves back into its note's properties and fence headers, and the sidecar goes to the trash.",
						confirmText: "Move into notes",
					}, () => { void this.runVaultMove("note"); }).open();
				}
				return true;
			},
		});
	}

	private async runNoteMove(file: TFile, to: "sidecar" | "note"): Promise<void> {
		try {
			const outcome = to === "sidecar" ? await this.dataMover.toSidecar(file) : await this.dataMover.intoNote(file);
			if (outcome.kind === "nothing") {
				new Notice(to === "sidecar" ? "This note has no flashcard data or styles to move." : "This note has no sidecar.");
			} else if (outcome.kind === "failed") {
				new Notice(`Could not move the data: ${outcome.reason}. Nothing was lost; try again.`);
			} else {
				const dropped = outcome.dropped > 0 ? ` Dropped data for ${plural(outcome.dropped, "fence")} no longer in the note.` : "";
				new Notice(to === "sidecar" ? "Moved the data to the sidecar." : `Moved the data into the note.${dropped}`);
			}
		} catch (error) {
			console.error(`Osmosis: could not move the data of ${file.path}`, error);
			new Notice("Could not move the data; nothing was changed. See the console for details.");
		}
	}

	private async runVaultMove(to: "sidecar" | "note"): Promise<void> {
		new Notice(to === "sidecar" ? "Moving data to sidecars…" : "Moving data into notes…");
		const result: VaultMoveResult = to === "sidecar" ? await this.dataMover.allToSidecars() : await this.dataMover.allIntoNotes();
		const parts = [`Moved the data of ${plural(result.moved, "note")} ${to === "sidecar" ? "to sidecars" : "into notes"}.`];
		if (result.dropped > 0) parts.push(`Dropped data for ${plural(result.dropped, "fence")} no longer in their notes.`);
		if (result.orphans > 0) parts.push(`Left ${plural(result.orphans, "sidecar")} that match no note.`);
		if (result.failed > 0) parts.push(`${plural(result.failed, "note")} could not be moved and kept their data: see the console.`);
		new Notice(parts.join(" "), 10000);
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

			const btn = createEl("a");
			btn.className = "clickable-icon view-action osmosis-mindmap-action";
			btn.setAttribute("aria-label", "Map view");
			setIcon(btn, "brain-circuit");
			btn.addEventListener("click", () => {
				const file = (leaf.view as MarkdownView).file;
				if (file) void this.openNoteMap(leaf, file.path);
			});

			// Directly left of Obsidian's reading/editing toggle, so 🧠, Study (which
			// LineRevealProcessor puts right after 🧠) and Edit form one run, with no
			// other header action between them; leftmost if the toggle is not found.
			const modeToggle = findModeToggle(viewActions);
			if (modeToggle) {
				viewActions.insertBefore(btn, modeToggle);
			} else {
				viewActions.prepend(btn);
			}
		}
	}

	/** The Layout `path` is drawn in: its own (from its styles, in the note or its sidecar), else the Default layout. */
	noteLayoutOf(path: string): NoteLayout {
		const file = this.app.vault.getFileByPath(path);
		const styles = file === null ? undefined : this.noteData.frontmatter(file)["osmosis-styles"];
		return noteLayout(styles, this.settings.defaultLayout);
	}

	/** Show `path` in `leaf` in its own layout: the mind map, or Cosmos centred on it. The brain button and the file menu's map entry. */
	private async openNoteMap(leaf: WorkspaceLeaf, path: string): Promise<void> {
		const cosmos = engineFor(this.noteLayoutOf(path)) === "cosmos";
		await leaf.setViewState({ type: cosmos ? VIEW_TYPE_COSMOS : VIEW_TYPE_MINDMAP, state: cosmos ? { focus: path } : { file: path }, active: true });
	}

	/**
	 * Save `layout` as the note's own Layout (the Default layout removes the
	 * key instead, `writeNoteLayout`), then show it: every map of the note
	 * whose view no longer draws it swaps in place (no animation, the undo
	 * history held, the focused line centred), and a Cosmos centred on it
	 * that still does lays it out afresh. A mind map holding the note records
	 * the write, so its undo takes it back. The style sidebar's Layout picker
	 * and Cosmos's Layout dropdown call this.
	 */
	async setNoteLayout(path: string, layout: NoteLayout): Promise<void> {
		const file = this.app.vault.getFileByPath(path);
		if (file === null) return;
		const maps = this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP).map((leaf) => leaf.view).filter((view): view is MindMapView => view instanceof MindMapView && view.getCurrentFile()?.path === path);
		const write = (fm: Record<string, unknown>) => writeNoteLayout(fm, layout, this.settings.defaultLayout);
		try {
			if (maps[0]) await maps[0].processStylesTracked(file, write);
			else await this.noteData.process(file, write);
		} catch (error) {
			console.error(`Osmosis: could not save the layout of ${path}`, error);
			new Notice("Osmosis: could not save the layout");
			return;
		}
		// The views read the layout back from the metadata cache, which catches up with the write a moment later.
		await this.untilLayoutReads(path, layout);
		const engine = engineFor(layout);
		if (engine === "cosmos") for (const map of maps) await map.swapToCosmos();
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_COSMOS)) {
			const view = leaf.view;
			if (!(view instanceof CosmosView) || view.focusNote !== path) continue;
			if (engine === "mindmap") await view.swapToMindMap(path);
			else view.applyLayout();
		}
	}

	/** Re-measure and re-render every open mind map, after a global setting
	 *  that affects node sizing changes. */
	remeasureOpenMindMaps(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP)) {
			if (leaf.view instanceof MindMapView) leaf.view.remeasureAndRender();
		}
	}

	/** Apply Cosmos navigation settings to every open Cosmos. */
	/**
	 * Take a change from the 3D Settings in the style sidebar: every open Cosmos shows
	 * it at once. Saved straight to data.json, and debounced, since a slider
	 * fires on every step; `saveSettings()` would also re-sync every card.
	 */
	setCosmosOverlays(overlays: CosmosOverlays): void {
		this.settings.graph3dOverlays = overlays;
		this.saveOverlays();
		this.refreshOpenCosmosControls();
	}

	/** Take the style sidebar's 3D Settings sections that are collapsed, saved like the overlays. */
	setCosmosSettingsCollapsed(collapsed: SettingsSectionId[]): void {
		this.settings.graph3dSettingsCollapsed = collapsed;
		this.saveOverlays();
	}

	private readonly saveOverlays = debounce(() => void this.saveData(this.settings), 500, true);

	refreshOpenCosmosControls(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_COSMOS)) {
			if (leaf.view instanceof CosmosView) leaf.view.applyControlSettings();
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

	/** Resolves once `path` reads as `layout` (`noteLayoutOf`), or after two seconds if the metadata cache never says so. */
	private untilLayoutReads(path: string, layout: NoteLayout): Promise<void> {
		if (this.noteLayoutOf(path) === layout) return Promise.resolve();
		return new Promise((resolve) => {
			const done = () => {
				this.app.metadataCache.offref(ref);
				window.clearTimeout(timer);
				resolve();
			};
			const ref = this.app.metadataCache.on("changed", () => {
				if (this.noteLayoutOf(path) === layout) done();
			});
			const timer = window.setTimeout(done, 2000);
		});
	}

	/**
	 * Swap the view in `leaf` to `to`'s, with `state`, when a note's layout
	 * moves it to the other view (`setNoteLayout`, or Follow active note).
	 * The outgoing view lets go of its notes' undo histories when it closes,
	 * which may be before the incoming one takes them, so `keep` is held
	 * across the swap (see `holdAcross`). A swap made by following leaves the
	 * leaf in the background (`active` false), where the user isn't looking.
	 */
	async swapLeafView(leaf: WorkspaceLeaf, to: MapEngine, state: Record<string, unknown>, keep: Iterable<string>, active = true): Promise<void> {
		const type = to === "cosmos" ? VIEW_TYPE_COSMOS : VIEW_TYPE_MINDMAP;
		try {
			await holdAcross(this.editHistory, keep, () => leaf.setViewState({ type, state, active }));
		} catch (error) {
			console.error("Osmosis: could not swap the map view", error);
			new Notice("Osmosis: could not switch views");
		}
	}

	/** A Cosmos opens in its own tab, centred on `file`. */
	private async openCosmos(file: TFile): Promise<void> {
		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.setViewState({ type: VIEW_TYPE_COSMOS, state: { focus: file.path }, active: true });
		void this.app.workspace.revealLeaf(leaf);
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

	// ── Card-browser mutations ──────────────────────────────────

	/**
	 * Open card browsers, so a mutation or an undo can re-render them.
	 *
	 * A `BasesView` is built by Bases inside a leaf a plugin cannot reach from
	 * `getLeavesOfType`, so the views register themselves here instead.
	 */
	private readonly cardBrowsers = new Set<CardBrowserView>();

	registerCardBrowser(view: CardBrowserView): void {
		this.cardBrowsers.add(view);
	}

	unregisterCardBrowser(view: CardBrowserView): void {
		this.cardBrowsers.delete(view);
	}

	/** Re-render every open card browser. Guarded per view — one broken render
	 * must not stop the others, nor take out the undo that triggered it. */
	refreshCardBrowsers(): void {
		for (const view of this.cardBrowsers) {
			try {
				view.refresh();
			} catch (error) {
				console.error("Osmosis: could not refresh a card browser", error);
			}
		}
	}

	async undoCardMutation(): Promise<void> {
		this.reportHistory(await this.mutationHistory.undo(), "Undid", "undo");
	}

	async redoCardMutation(): Promise<void> {
		this.reportHistory(await this.mutationHistory.redo(), "Redid", "redo");
	}

	/**
	 * Report an undo or redo, and refresh what it changed.
	 *
	 * A refused one is the interesting case. Restoring a note from a snapshot would
	 * overwrite anything written to it since, so `MutationHistory` checks first and
	 * refuses rather than winning that race — and the reason has to reach the user,
	 * because from the outside a silent no-op looks like a broken button.
	 */
	private reportHistory(result: HistoryResult, verb: string, noun: string): void {
		if (result.ok) {
			new Notice(`Osmosis: ${verb} "${result.label}".`);
			this.refreshCardBrowsers();
			this.refreshDashboard();
			this.lineReveal.refreshChrome();
			return;
		}

		switch (result.reason) {
			case "empty":
				new Notice(`Osmosis: nothing to ${noun}.`);
				break;
			case "missing":
				new Notice(`Osmosis: "${result.path}" is no longer in the vault, so this cannot be ${verb === "Undid" ? "undone" : "redone"}.`);
				break;
			case "conflict":
				new Notice(`Osmosis: "${result.path}" has changed since. Reversing it would discard that edit, so nothing was written.`);
				break;
		}
	}

	/** Re-render every open deck dashboard: the sidebar and any Decks tabs. */
	refreshDashboard(): void {
		const { workspace } = this.app;
		const leaves = [...workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD), ...workspace.getLeavesOfType(VIEW_TYPE_DECKS)];
		for (const leaf of leaves) {
			// Leaves are deferred placeholders until first shown — they have
			// no render() (calling it would throw and kill the caller), and
			// render themselves from the store in onOpen().
			const view = leaf.view;
			if (view instanceof DashboardSidebarView) void view.render();
			else if (view instanceof DecksView) view.render();
		}
	}

	/**
	 * The ribbon's Decks page, in a main-area tab: an open one is revealed and
	 * redrawn rather than a second stacked beside it.
	 */
	async activateDecksTab(): Promise<void> {
		await this.activateMainView(VIEW_TYPE_DECKS);
		const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_DECKS)[0];
		if (leaf?.view instanceof DecksView) leaf.view.render();
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

	/**
	 * Start a flashcard session in the study tab. There is only ever one: an
	 * open study tab is revealed and rebuilt with the new scope (ending the
	 * session it held), rather than a second tab stacked beside it. With none
	 * open, `from.leaf` (a Decks tab) becomes the study tab, or else a new tab.
	 *
	 * `from.takeOver` (a note's Study menu) makes the launching tab the study
	 * tab even when one is open: that one steps back to what it held first, as
	 * its cap would. A tab study takes over remembers what it showed, and its
	 * cap puts that back; the takeover itself is a history entry, so the tab's
	 * Back lands there too.
	 */
	async openStudySession(scope: StudyScope, from?: { leaf: WorkspaceLeaf; takeOver?: boolean }): Promise<void> {
		const { workspace } = this.app;
		let existing: WorkspaceLeaf | undefined = workspace.getLeavesOfType(VIEW_TYPE_STUDY)[0];
		if (from?.takeOver && existing && existing !== from.leaf) {
			// A restored placeholder opens bare, and a bare study tab steps back by itself
			if (existing.view instanceof FlashcardStudyView) await existing.view.leaveStudy();
			else await existing.loadIfDeferred();
			existing = undefined;
		}
		if (existing?.view instanceof FlashcardStudyView) {
			existing.view.startSession(scope);
			await workspace.revealLeaf(existing);
			return;
		}

		// A study view about to open — a tab restored at startup that is still
		// a placeholder, or a new one — takes the scope in its onOpen. Without
		// one it would show the Decks page instead.
		const leaf = existing ?? from?.leaf ?? workspace.getLeaf("tab");
		// A restored study tab keeps the origin it saved; a tab taken over gets its own
		let origin: StudyOrigin | null = null;
		if (!existing && from) {
			const eState: unknown = from.leaf.getEphemeralState();
			origin = toStudyOrigin({ ...from.leaf.getViewState(), eState });
		}
		this.pendingStudy = { scope, origin };
		try {
			if (existing) await existing.loadIfDeferred();
			else await leaf.setViewState({ type: VIEW_TYPE_STUDY, active: true });
		} finally {
			this.pendingStudy = null;
		}
		await workspace.revealLeaf(leaf);
	}

	/** For a study tab's onOpen: the scope and origin `openStudySession` is opening it on, taken once. */
	takePendingStudy(): { scope: StudyScope; origin: StudyOrigin | null } | null {
		const pending = this.pendingStudy;
		this.pendingStudy = null;
		return pending;
	}

	/**
	 * A study session ended or finished: force pending line-card schedule
	 * writes and buffered review-log entries to disk, and refresh the deck
	 * counts in the dashboard. Safe to call more than once.
	 */
	flushStudySession(): void {
		void this.scheduleStore.flush();
		void this.reviewLog.flush();
		this.refreshDashboard();
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
				editorCallback: (editor, ctx) => {
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

					// A fence in an un-opted-in note generates no card at all.
					if (ctx instanceof MarkdownView) void this.optInAfterCardInsert(ctx);
				},
			});
		}
	}

	/**
	 * Rapid Flashcard Mode: while it is on, blank lines alone turn typed text
	 * into an `osmosis` fence — one blank line separates front from back, two
	 * commit the card. The grammar and its edge cases live in `rapid-cards.ts`;
	 * this is the keymap and the toggle.
	 *
	 * The toggle sits in a note's ⋯ menu rather than the command palette, which
	 * is several taps deep on the platform the mode exists for.
	 */
	private registerRapidFlashcardMode(): void {
		// Highest precedence, so a commit is decided before the editor's own
		// Enter — list continuation and the rest — claims the keystroke.
		this.registerEditorExtension(
			Prec.highest(keymap.of([{ key: "Enter", run: (view) => this.commitRapidCard(view) }])),
		);

		this.addCommand({
			id: "toggle-rapid-flashcard-mode",
			name: "Toggle rapid flashcard mode",
			callback: () => {
				this.toggleRapidMode();
			},
		});

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file: TAbstractFile, source: string) => {
				if (source !== "more-options") return;
				if (!(file instanceof TFile) || file.extension !== "md") return;
				menu.addItem((item) => {
					item.setTitle("Rapid flashcard mode")
						.setIcon("zap")
						.setChecked(this.rapidMode)
						// Alongside "Source mode", the other editor-behaviour toggle.
						.setSection("pane")
						.onClick(() => {
							this.toggleRapidMode();
						});
				});
			}),
		);
	}

	/** Flip Rapid Flashcard Mode, from either the ⋯ menu or the command palette. */
	private toggleRapidMode(): void {
		this.rapidMode = !this.rapidMode;
		new Notice(`Rapid flashcard mode ${this.rapidMode ? "on" : "off"}`);
	}

	/**
	 * Handle Enter while the mode is on: commit a card when this keystroke is
	 * the second blank line below a front/back pair, and otherwise hand the
	 * keystroke back to the editor untouched.
	 */
	private commitRapidCard(view: EditorView): boolean {
		if (!this.rapidMode) return false;

		// Only the note you are actually editing. The mind map's embedded
		// editors inherit registered extensions too, and a fence appearing
		// inside a node being renamed is not what anyone asked for.
		const active = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!active || (active.editor as unknown as { cm?: EditorView }).cm !== view) return false;

		const { state } = view;
		const cursor = state.selection.main;
		if (!cursor.empty) return false;

		const edit = planRapidCard(
			state.doc.toString().split("\n"),
			state.doc.lineAt(cursor.head).number - 1,
		);
		if (!edit) return false;

		const from = state.doc.line(edit.fromLine + 1).from;
		const to = state.doc.line(edit.toLine + 1).to;
		// Every replacement line before the one the cursor ends on, newlines included.
		const offset = edit.text
			.split("\n")
			.slice(0, edit.cursorLine)
			.reduce((sum, line) => sum + line.length + 1, 0);
		view.dispatch({
			changes: { from, to, insert: edit.text },
			selection: { anchor: from + offset },
		});
		void this.optInAfterCardInsert(active);
		return true;
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
			this.scheduleStore.setDisabled(file.path, card.blockId!, disabled, card.occlusionGroup);
		}
		await this.scheduleStore.flushPath(file.path);
		this.refreshDashboard();
		this.lineReveal.refreshChrome();
		new Notice(
			`${disabled ? "Excluded" : "Included"} ${String(targets.length)} line card${targets.length === 1 ? "" : "s"}.`,
		);
	}

	/**
	 * Reopen each tab saved under Cosmos's pre-T107 view type as Cosmos, with
	 * its saved state. Obsidian keeps such a leaf as a placeholder of the
	 * unknown type, so `getLeavesOfType` finds it and `getViewState` still
	 * holds what the old view saved.
	 */
	private async reopenLegacyCosmosLeaves(): Promise<void> {
		for (const leaf of this.app.workspace.getLeavesOfType(LEGACY_COSMOS_VIEW_TYPE)) {
			const old = leaf.getViewState();
			try {
				await leaf.setViewState(cosmosViewStateFrom(old, VIEW_TYPE_COSMOS, cosmosTabTitle(old.state)));
			} catch (error) {
				console.error("Osmosis: could not move a tab saved under the old view type to Cosmos", error);
			}
		}
	}

	async loadSettings() {
		const saved = await this.loadData() as Record<string, unknown> | null;
		// Settings renamed in T105 (sequentialContextLines →
		// flashcardContextLines, …) and T107 (graph3dDesktopPivot →
		// cosmosDesktopPivot, …). Migrated before the merge, or the default
		// for the new key would shadow the user's old value.
		if (saved) migrateRenamedSettingKeys(saved);
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved as Partial<OsmosisSettings> | null);
		// Replaced by graph3dOneFingerDrag (now cosmosOneFingerDrag) before release, with a new default.
		// Any saveSettings() wrote the old default here, so it is dropped rather
		// than carried over.
		Reflect.deleteProperty(this.settings, "graph3dTouchDrag");
		// Saved Cosmos node positions, dropped before release: a vault's
		// shape keeps changing, so each session settles it afresh.
		Reflect.deleteProperty(this.settings, "graph3dPositions");
		this.settings.graph3dOverlays = normalizeOverlays(this.settings.graph3dOverlays);
		this.settings.graph3dSettingsCollapsed = normalizeCollapsed(this.settings.graph3dSettingsCollapsed);
		if (!isNoteLayout(this.settings.defaultLayout)) this.settings.defaultLayout = DEFAULT_SETTINGS.defaultLayout;

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

	/** Migrate per-note mapSettings from data.json into osmosis-styles frontmatter (the note's, or its sidecar's). */
	private async migrateMapSettingsToFrontmatter(): Promise<void> {
		const entries = Object.entries(this.settings.mapSettings);
		if (entries.length === 0) return;

		for (const [filePath, overrides] of entries) {
			if (!overrides || Object.keys(overrides).length === 0) continue;
			const file = this.app.vault.getFileByPath(filePath);
			if (!(file instanceof TFile)) continue;

			try {
				await this.noteData.process(
					file,
					(fm: Record<string, unknown>) => {
						const osmosis = styleMappingFor(fm);

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

/** "1 note", "3 notes". */
function plural(count: number, noun: string): string {
	return `${String(count)} ${noun}${count === 1 ? "" : "s"}`;
}
