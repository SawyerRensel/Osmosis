import { Notice, Platform, Plugin, MarkdownView, TAbstractFile, TFile, WorkspaceLeaf, debounce, setIcon, type App, type Editor, type MarkdownFileInfo, type Menu } from "obsidian";
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
import { ScheduleStore, SCHEDULE_FRONTMATTER_KEY, parseScheduleFrontmatter, parseDisabledFrontmatter, parseOcclusionFrontmatter } from "./store/ScheduleStore";
import { ReviewLog, isReviewLogPath, platformDeviceLabel, slugifyDeviceLabel, type ReviewLogCache } from "./store/ReviewLog";
import { MindMapView, VIEW_TYPE_MINDMAP } from "./views/MindMapView";
import { PropertiesSidebarView, VIEW_TYPE_PROPERTIES } from "./views/PropertiesSidebarView";
import { SequentialStudyModal } from "./views/SequentialStudyModal";
import { DashboardSidebarView, VIEW_TYPE_DASHBOARD } from "./views/DashboardSidebarView";
import { BASES_CARD_BROWSER_VIEW_ID, createCardBrowserRegistration, type CardBrowserView } from "./views/CardBrowserView";
import { StatsView, VIEW_TYPE_STATS } from "./views/StatsView";
import { ContextualStudyProcessor } from "./views/ContextualStudyProcessor";
import { LineRevealProcessor } from "./views/LineRevealProcessor";
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
	usedGroupsInFence,
	type FenceIdentity,
	type OcclusionTarget,
} from "./card-gen/occlusion";
import { OcclusionEditorModal } from "./views/OcclusionEditorModal";
import { generateBlockId } from "./block-id";
import { planRapidCard } from "./rapid-cards";
import { MutationHistory, type HistoryResult } from "./browse/history";
import type { MutationDeps } from "./browse/mutate";
import type { Card, OcclusionSet, StudyMode } from "./database/types";
import type { DeckScope } from "./study/types";

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
	/** Explicit deps for the card browser's four mutations. */
	cardMutations!: MutationDeps;
	/** Session-only undo stack for those mutations. */
	mutationHistory!: MutationHistory;
	reviewLog!: ReviewLog;
	cardSync!: CardSyncService;
	lineReveal!: LineRevealProcessor;
	/** Reading-view fence cards, so `lineReveal` can redraw them on a mode change. */
	contextualStudy!: ContextualStudyProcessor;
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
			(path: string) => isReviewLogPath(path, this.settings.reviewLogFolder),
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
			(file: TFile) => {
				// Shape sets for occluded line cards. No pending overlay: masks
				// change only when the editor saves them, which rewrites the
				// frontmatter directly rather than staging through ScheduleStore.
				const raw: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter?.[SCHEDULE_FRONTMATTER_KEY];
				return parseOcclusionFrontmatter(raw);
			},
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
			},
			resolveFile: (notePath: string) => this.app.vault.getFileByPath(notePath),
		};
		this.mutationHistory = new MutationHistory(this.cardMutations);

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
		this.contextualStudy = new ContextualStudyProcessor(this);
		this.contextualStudy.register();

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
				if (this.isNoteFile(file)) debouncedSync(file);
			}),
		);

		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (this.isNoteFile(file)) debouncedSync(file);
			}),
		);

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
				// A note moved *into* the review log folder: nothing will sync
				// that path again, so its cards have to go now or linger forever.
				if (
					file.extension === "md"
					&& !isReviewLogPath(oldPath, this.settings.reviewLogFolder)
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
			&& !isReviewLogPath(file.path, this.settings.reviewLogFolder)
		);
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
		const existing = target.carrier === "fence"
			? fenceOcclusions(lines, target.span!).get(target.label ?? "")
			: parseOcclusionFrontmatter(
				this.app.metadataCache.getFileCache(file)?.frontmatter?.[SCHEDULE_FRONTMATTER_KEY],
			).get(target.blockId ?? "");

		// Numbering is per carrier, not per diagram: a fence's occlusion cards
		// all derive `<fenceId>-cN`, so a second diagram starting again from c1
		// would overwrite the first diagram's cards.
		const reservedGroups = target.carrier === "fence"
			? usedGroupsInFence(lines, target.span!)
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
		// Force out any pending schedule frontmatter writes
		void this.scheduleStore.flush();
		// ...and any fence schedules a contextual session was still holding, so
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
			btn.className = "clickable-icon view-action osmosis-mindmap-action";
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
