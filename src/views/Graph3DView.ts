import { ItemView, MarkdownRenderer, Menu, Notice, Platform, parseLinktext, Scope, TFile, debounce, setIcon, setTooltip, type App, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import { ParseCache } from "../cache";
import { EditPipeline } from "../edit-pipeline";
import { canConvertBranch, convertBranchToNote } from "../convert-branch";
import { migrateBlockIdentity, moveAcrossFiles, readMovedScheduleEntries, type MoveContext } from "../edit-moves";
import { collectBlockIds, dropContext, editSelectionStart, nodeEditText, normalizeWrite, renameInFile, resolveInsertSite, restoreEditedLine, toggleCheckboxLine } from "../mindmap-edit";
import type { OsmosisNode } from "../types";
import { decodeEmbedTarget } from "../card-gen/occlusion";
import { attachmentNodeId, buildGraph, ghostNodeId, isNoteRoot, linkTargetNode, noteNodeId, type GraphModel, type GraphNode, type LinkResolver, type NoteInput } from "../graph3d/model";
import { facingPhase } from "../graph3d/flatten";
import { cleanNearTier, type NearTierSettings } from "../graph3d/lod";
import { collectEmbedded } from "../graph3d/transcluded";
import type { LinkClick } from "../graph3d/links";
import { refocusPath } from "../graph3d/refocus";
import { isEntry, landing, readPlace, stepTo, type Place, type Step } from "../graph3d/history";
import type { Arrow } from "../graph3d/arrow-nav";
import { computeHorizon, noteAdjacency, withBacklinkers, withEmbedded, type Horizon, type NoteAdjacency } from "../graph3d/horizon";
import { doubleClickEdit } from "../edit-keys";
import { ancestorsOf, appendToLine, carryPairs, carrySiblings, findNodeById, heldDiff, isEditableTarget, lineNodeAt, linkInNote, linkSubpath, locateLine, mapStart, moveGap, moveInNote, moveRefusal, planStructural, stampBlockId, type MovePlace, type StructuralAction } from "../graph3d/edit";
import { outlineChanged } from "../graph3d/outline";
import { deleteLines, linesMarkdown, selectionMarkdown, topmostLines, type CopyGroup } from "../graph3d/selection";
import { movedOut, planSelectionLink, planSelectionMove, planSelectionRelevel, type PickedLine, type PlanNote, type SelectionEdit } from "../graph3d/selection-edit";
import { placeNodes, type Placed } from "../graph3d/positions";
import { selectAfterDelete } from "../select-after-delete";
import { liftOffFocus, liftOffFrame, liftOffSeeds, readLiftOff, type Landing, type LiftOff } from "../graph3d/liftoff";
import { readMapState, writeMapState } from "../mindmap-state";
import { memoryStrengths, nodeTags, overlayNodeColor, modelKey, visibleModel, type ColorContext, type Graph3DOverlays } from "../graph3d/overlays";
import { FSRSScheduler } from "../database/FSRSScheduler";
import type OsmosisPlugin from "../main";
import type { Graph3DScene, SceneControls, SceneOverlays, SceneTheme } from "./Graph3DScene";
import type { PanelLink } from "./Graph3DNear";
import { Graph3DEditor } from "./Graph3DEdit";
import { Graph3DOverlaysMenu } from "./Graph3DOverlays";
import { Graph3DStudy } from "./Graph3DStudy";
import { Graph3DTrailPicker } from "./Graph3DTrailPicker";
import { isTrail } from "../graph3d/trail-note";
import { renderOcclusion } from "./OcclusionRenderer";
import { nearestTarget } from "../graph3d/study";
import type { FSRSRating } from "../database/FSRSScheduler";

export const VIEW_TYPE_GRAPH3D = "osmosis-graph3d";

/** 0: just the focus note and what it transcludes (see `graph3d/transcluded.ts`). */
export const GRAPH3D_DEFAULT_DEPTH = 0;
/** Each hop multiplies the loaded area, so phones get a shallower ceiling. */
const MAX_DEPTH = Platform.isMobile ? 3 : 5;
const FLIGHT_KEYS = ["w", "a", "s", "d", "q", "e"];
/** Relational study's rating keys, as in every other study surface. */
const RATING_KEYS: readonly FSRSRating[] = [1, 2, 3, 4];
/**
 * Whether the walk and fly joysticks are on. Kept per device (Obsidian's
 * vault-scoped localStorage), not in synced settings: a phone that walks with
 * them shouldn't turn them on for a laptop that has keys.
 */
const STICKS_STORAGE_KEY = "osmosis-graph3d-sticks";
/** Whether a plain plate click only selects it (Overlays: "Click selects only"). Per device, like the joysticks; off by default. */
const CLICK_SELECTS_ONLY_STORAGE_KEY = "osmosis-graph3d-click-selects-only";
/**
 * The near tier's panel detail and live-panel limit (Overlays: "Panel detail"
 * and "Live panels"). Per device like the joysticks, and keyed by platform so
 * a desktop window emulating mobile keeps its own pair. Applies to every 3D view.
 */
const NEAR_TIER_STORAGE_KEY = `osmosis-graph3d-near-tier-${Platform.isMobile ? "mobile" : "desktop"}`;
/** The settings every 3D view reads each frame: read from storage once, then kept here so a change shows in all open views at once. */
let nearTier: NearTierSettings | null = null;
/**
 * Whether Obsidian's mobile toolbar (the floating navbar) is hidden while a 3D
 * graph is the active view. Per device, like the joysticks: it is a preference
 * about this phone's screen, and the same graph opened on a laptop has no
 * toolbar to hide. Off by default, so a first-time user sees the app as usual.
 */
const HIDE_TOOLBAR_STORAGE_KEY = "osmosis-graph3d-hide-toolbar";
/** Body class that hides the toolbar (`.mobile-navbar`), set only while a 3D graph that asks for it is the active view. */
export const HIDE_TOOLBAR_CLASS = "osmosis-graph3d-hide-toolbar";

/**
 * Put the body class in line with the active view: on only while it is a 3D
 * graph that hides the toolbar, so Obsidian's toolbar is never left hidden
 * elsewhere. `except` is a view that is closing and no longer counts.
 */
export function syncMobileToolbar(app: App, except: Graph3DView | null = null): void {
	const active = app.workspace.getActiveViewOfType(Graph3DView);
	document.body.toggleClass(HIDE_TOOLBAR_CLASS, Platform.isMobile && active !== null && active !== except && active.hidesToolbar);
}

/**
 * The 3D graph: every line of the notes within N hops of the focus note, as
 * nodes in space. See the `# Spec` section of `vault/Planner/Develop Mind-Map
 * Graph View.md`.
 *
 * This class owns the Obsidian side (state, events, header, keys) and feeds
 * the pure model in `src/graph3d/` to the engine in `Graph3DScene`, which is
 * imported only when the view opens.
 */
export class Graph3DView extends ItemView {
	private scene: Graph3DScene | null = null;
	private readonly cache = new ParseCache(200);
	private adjacency: NoteAdjacency | null = null;
	private horizon: Horizon | null = null;
	/** The graph last shown, for finding a link's target node. */
	private model: GraphModel | null = null;
	private focusPath: string | null = null;
	private depth = GRAPH3D_DEFAULT_DEPTH;
	/** Whether notes linking to a loaded note count as hops; off, the graph follows outgoing links only, like the mind map. */
	private backlinks = false;
	private follow = false;
	private loadSeq = 0;
	private followActionEl: HTMLElement | null = null;
	private studyActionEl: HTMLElement | null = null;
	/** Relational study, while the view is open; its session runs only while `active`. */
	private study: Graph3DStudy | null = null;
	/** Whether this view hides Obsidian's mobile toolbar while it is the active view. */
	hidesToolbar = false;
	private toolbarToggleEl: HTMLElement | null = null;
	private overlaysMenu: Graph3DOverlaysMenu | null = null;
	/** The colour mode the scene is coloured in now, to tell when the menu changed it. */
	private colorBy: Graph3DOverlays["colorBy"] | null = null;
	/** Which of the toggles that add or remove plates (see `modelKey`) the model shown now was built under, to reload when the menu changes one. */
	private modelShown: string | null = null;
	/** The model changed because of an Overlays toggle: once it is in the scene, the loaded nodes re-settle, plates that just arrived included (`Graph3DScene.reshape`). */
	private resettleOnLoad = false;
	/** The model as built from the notes, before the Overlays leave plates out: tag colours read the tag hubs from it, which Tags off removes. */
	private fullModel: GraphModel | null = null;
	private stageEl: HTMLElement | null = null;
	private emptyEl: HTMLElement | null = null;
	/** Whether the view is in edit mode: its edit gestures act, and flight keys stay off the structural ones. Off by default and not saved. */
	private editMode = false;
	private editActionEl: HTMLElement | null = null;
	/** Every 3D write goes through here, into the history shared with the mind map. */
	private readonly edits = new EditPipeline(
		this.app,
		this.plugin().editHistory,
		() => this.editOwner,
		(path) => {
			this.cache.invalidate(path);
			this.prefetched.delete(path);
		},
	);
	/** The inline editor over the node being edited. While it is open, reloads wait (see `reload`). */
	private readonly editor = new Graph3DEditor(this.app, this);
	/** An editor is being prepared (its line is being read), so a second request must not start another. */
	private opening = false;
	/** Edits closed and still being written: reloads wait for these too, so a hop made while one saves (the F key, the plate menu) lands after the save. */
	private saving = 0;
	/** The focus note just changed (or the view just opened): the next reload that shows it renews its ring phase, so its first flat slice faces the camera (`Graph3DScene.faceNote`). Edits and other reloads leave it. */
	private faceFocus = true;
	/** A reload that was asked for while the editor was open or saving, run when it is done. */
	private queuedReload: { flyToFocus: boolean; subpath: string; landOn: string | null } | null = null;
	/** The first `setState` has run: later ones are steps of the tab's back/forward history (see `navigate`). */
	private placed = false;
	/** The step `setState` took last, for `navigate` to wait on; null when the leaf was busy and never called it. */
	private arrival: Promise<void> | null = null;
	/** The note the write in progress is filed under in the history (see `commitEdit`). */
	private editOwner: string | null = null;
	/** The note last edited, so undo still finds it after the edited line's ID, and the focus with it, changed. */
	private lastEditPath: string | null = null;
	/** Lines an edit just changed, for the next reload to keep in place: each is at `start` in its note now, and `from` is the node it was (a new line has none); the first is selected again. */
	private edited: { path: string; start: number; from?: string }[] = [];
	/** The write in progress is a save or a delete: the reload that shows it selects the line `edited` names first (or `selectAfter`), alone. */
	private selectLanded = false;
	/** An edit made in this view (or its undo or redo) was written: the reload that shows it re-settles the loaded nodes if it changed an outline (`outlineChanged`). */
	private editLanded = false;
	/** A structural edit made a new empty line, which the next reload opens the editor on once it is in the scene. */
	private pendingEdit: { path: string; start: number } | null = null;
	/** A structural edit left no line to select (a delete under the root): the next reload selects this node, the note's core. */
	private selectAfter: string | null = null;
	/** A structural edit is being worked out and written, so a key repeating on the same line starts no second one over it. */
	private structuring = false;
	/** Releases for the histories of the notes loaded now: a note's undo history lives while some view holds it. */
	private readonly holds = new Map<string, () => void>();
	/** The mind map's picture, handed over by its 2D/3D toggle: the next reload lifts off from it (see `graph3d/liftoff.ts`). */
	private liftOff: LiftOff | null = null;
	/** The mind map's own state (pinned, reading mode) from the toggle that opened this view, handed back on the toggle to 2D. */
	private mapState: { pinned: boolean; readingMode: boolean } | null = null;
	/** The save of the edit closed last, for the toggle to 2D to wait on. */
	private saved: Promise<void> = Promise.resolve();
	/** Text of the notes one hop past the loaded area, read ahead so the next hop waits on no I/O. */
	private readonly prefetched = new Map<string, { mtime: number; text: string }>();

	private readonly scheduleReload = debounce(() => void this.reload(), 750, true);

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		this.navigation = true;
		this.icon = "orbit";

		// Flight keys go through the view's scope: a global user hotkey on the
		// same letter would otherwise take the key before the view sees it.
		this.scope = new Scope(this.app.scope);
		for (const key of FLIGHT_KEYS) {
			this.scope.register([], key, (e: KeyboardEvent) => {
				if (isEditableTarget(e.target)) return undefined;
				this.scene?.heldKeys.add(key);
				return false;
			});
		}
		// Study keys act only during a session, and otherwise pass the key on.
		const typing = (e: KeyboardEvent): boolean => isEditableTarget(e.target);
		this.scope.register([], " ", (e: KeyboardEvent) => (this.study?.active === true && !typing(e) && this.study.reveal() ? false : undefined));
		for (const rating of RATING_KEYS) {
			this.scope.register([], String(rating), (e: KeyboardEvent) => {
				if (this.study?.active !== true || typing(e)) return undefined;
				void this.study.rate(rating);
				return false;
			});
		}
		// Undo and redo act on the edits any view made to the focused note. Typing in a text box or editor keeps its own.
		const stepKey = (isRedo: boolean) => (e: KeyboardEvent) => {
			if (typing(e)) return undefined;
			void this.step(isRedo);
			return false;
		};
		this.scope.register(["Mod"], "z", stepKey(false));
		this.scope.register(["Mod", "Shift"], "z", stepKey(true));
		this.scope.register(["Mod"], "y", stepKey(true));
		// In edit mode, F2 edits the focused line (a button or a text box keeps its own keys).
		const editKey = (e: KeyboardEvent) => {
			if (!this.editMode || isEditableTarget(e.target) || e.target instanceof HTMLButtonElement) return undefined;
			const node = this.scene?.focusedNode() ?? null;
			if (node === null || !this.beginEdit(node)) return undefined;
			return false;
		};
		// Escape drops a link drag in progress, else closes the Overlays menu (which a press on the canvas does not); otherwise the key goes on.
		// Then it clears the selection (multi-select).
		this.scope.register([], "Escape", (e: KeyboardEvent) => {
			if (this.scene?.cancelLinkDrag() === true) return false;
			if (this.scene?.closeHelp() === true) return false;
			if (this.overlaysMenu?.isOpen === true) {
				this.overlaysMenu.toggle(false);
				return false;
			}
			// The editor's own Escape (cancel the edit) goes on.
			if (isEditableTarget(e.target) || this.editor.isOpen) return undefined;
			return this.scene?.clearSelection() === true ? false : undefined;
		});
		// Ctrl/Cmd+C copies the selection as Markdown, when no text box has the keys.
		this.scope.register(["Mod"], "c", (e: KeyboardEvent) => {
			// Text selected in a panel is copied as text, as usual.
			if (isEditableTarget(e.target) || this.editor.isOpen || activeWindow.getSelection()?.isCollapsed === false) return undefined;
			const nodes = this.scene?.selectedNodes() ?? [];
			if (nodes.length === 0) return undefined;
			void this.copySelection(nodes);
			return false;
		});
		this.scope.register([], "F2", editKey);
		// F makes the selected node's note the focus note: the one deliberate hop besides the plate menu.
		this.scope.register([], "f", (e: KeyboardEvent) => {
			if (isEditableTarget(e.target)) return undefined;
			const node = this.scene?.focusedNode() ?? null;
			if (node === null || refocusPath(node, this.focusPath) === null) return undefined;
			this.hop(node);
			return false;
		});
		// In edit mode, the mind map's structural keys act on the focused line.
		const structuralKey = (action: StructuralAction) => (e: KeyboardEvent) => {
			if (!this.editMode || isEditableTarget(e.target) || e.target instanceof HTMLButtonElement) return undefined;
			// Delete with more than one plate selected deletes them all.
			const selected = this.scene?.selectedNodes() ?? [];
			if (action === "delete" && selected.length > 1) {
				void this.deleteSelection(selected);
				return false;
			}
			// So do indent and outdent (Alt+→ / Alt+←).
			if ((action === "indent" || action === "outdent") && selected.length > 1) {
				void this.relevelSelection(action, selected);
				return false;
			}
			const node = this.scene?.focusedNode() ?? null;
			if (node === null || node.kind !== "line") return undefined;
			void this.structural(action, node, false, selected);
			return false;
		};
		this.scope.register([], "Tab", structuralKey("child"));
		this.scope.register([], "Enter", structuralKey("sibling"));
		this.scope.register(["Mod"], "Enter", structuralKey("parent"));
		this.scope.register([], "Delete", structuralKey("delete"));
		this.scope.register([], "Backspace", structuralKey("delete"));
		this.scope.register(["Alt"], "ArrowUp", structuralKey("up"));
		this.scope.register(["Alt"], "ArrowDown", structuralKey("down"));
		this.scope.register(["Alt"], "ArrowLeft", structuralKey("outdent"));
		this.scope.register(["Alt"], "ArrowRight", structuralKey("indent"));
		// The arrows move the selection to the related plate closest to that direction on screen, and the camera glides after it.
		// Shift+arrow adds that plate to the selection instead. A step in back/forward, as a plate click is; the focus note stays.
		const arrowKey = (arrow: Arrow, extend: boolean) => (e: KeyboardEvent) => {
			if (isEditableTarget(e.target) || e.target instanceof HTMLSelectElement || this.editor.isOpen) return undefined;
			const scene = this.scene;
			const selected = scene?.selectedNodes() ?? [];
			if (scene === null || selected.length === 0) return undefined;
			const id = scene.arrowTarget(arrow);
			if (id === null) return false;
			scene.select(extend ? [...selected.map((node) => node.id), id] : [id]);
			void this.navigate({ focus: this.focusPath, node: id }, "", true, true);
			return false;
		};
		for (const [key, arrow] of [["ArrowUp", "up"], ["ArrowDown", "down"], ["ArrowLeft", "left"], ["ArrowRight", "right"]] as const) {
			this.scope.register([], key, arrowKey(arrow, false));
			this.scope.register(["Shift"], key, arrowKey(arrow, true));
		}
	}

	getViewType(): string {
		return VIEW_TYPE_GRAPH3D;
	}

	getDisplayText(): string {
		const file = this.focusPath === null ? null : this.app.vault.getFileByPath(this.focusPath);
		return file ? `3D graph: ${file.basename}` : "3D graph";
	}

	getState(): Record<string, unknown> {
		const state = super.getState();
		state.focus = this.focusPath;
		state.depth = this.depth;
		state.backlinks = this.backlinks;
		state.follow = this.follow;
		// The plate the camera is at, so the tab's back/forward entries tell visits within one focus note apart (see `navigate`).
		state.node = this.scene?.focusedNode()?.id ?? null;
		return state;
	}

	async setState(state: Record<string, unknown>, result: ViewStateResult): Promise<void> {
		// Once open, a new state is a step through the tab's history: a visit or refocus of ours, or back/forward. Depth, backlinks and follow stay as they are.
		if (this.placed) {
			const step = stepTo(this.here(), readPlace(state));
			if (isEntry(step)) result.history = true;
			// Not awaited: the leaf stays busy until this returns, and drops any step asked for meanwhile.
			this.arrival = this.travel(step, typeof state?.subpath === "string" ? state.subpath : "", state?.land !== false, state?.glide === true);
			return;
		}
		this.placed = true;
		if (typeof state?.focus === "string") {
			if (state.focus !== this.focusPath) this.faceFocus = true;
			this.focusPath = state.focus;
		}
		if (typeof state?.depth === "number") this.depth = Math.min(MAX_DEPTH, Math.max(0, Math.round(state.depth)));
		if (typeof state?.follow === "boolean") this.follow = state.follow;
		if (typeof state?.backlinks === "boolean") this.backlinks = state.backlinks;
		// From the mind map's 2D/3D toggle: its picture to lift off from, and its own state to hand back. Neither is kept in getState.
		const liftOff = readLiftOff(state?.liftOff);
		if (liftOff !== null) this.liftOff = liftOff;
		if (state?.map !== undefined) {
			const map = readMapState(state.map);
			this.mapState = { pinned: map.pinned, readingMode: map.readingMode ?? false };
		}
		// Hold the focus note's history from here, not from the first reload, which can wait on the engine loading: a mind map handing this leaf over may let go of it first.
		if (this.focusPath !== null && !this.holds.has(this.focusPath)) this.holds.set(this.focusPath, this.plugin().editHistory.hold(this.focusPath));
		this.overlaysMenu?.showReach({ depth: this.depth, backlinks: this.backlinks });
		this.followActionEl?.toggleClass("is-active", this.follow);
		this.updateHeader();
		await super.setState(state, result);
		// A heading or block to land on, from a Mod-click on a link in another 3D graph. Not kept in getState.
		// The plate the camera was at, when the tab's forward (or a restored workspace) brings this view back.
		await this.reload(true, typeof state?.subpath === "string" ? state.subpath : "", readPlace(state).node);
	}

	private nearTier(): NearTierSettings {
		nearTier ??= cleanNearTier(this.app.loadLocalStorage(NEAR_TIER_STORAGE_KEY), Platform.isMobile);
		return nearTier;
	}

	async onOpen(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass("osmosis-graph3d");

		this.overlaysMenu = new Graph3DOverlaysMenu(
			root,
			this.plugin().settings.graph3dOverlays,
			{ depth: this.depth, backlinks: this.backlinks },
			MAX_DEPTH,
			{
				get: () => this.app.loadLocalStorage(CLICK_SELECTS_ONLY_STORAGE_KEY) === true,
				set: (on) => this.app.saveLocalStorage(CLICK_SELECTS_ONLY_STORAGE_KEY, on),
			},
			{
				get: () => this.nearTier(),
				set: (patch) => {
					nearTier = cleanNearTier({ ...this.nearTier(), ...patch }, Platform.isMobile);
					this.app.saveLocalStorage(NEAR_TIER_STORAGE_KEY, nearTier);
				},
			},
			(overlays) => this.plugin().setGraph3DOverlays(overlays),
			({ depth, backlinks }) => {
				const reloads = depth !== this.depth || backlinks !== this.backlinks;
				this.depth = depth;
				this.backlinks = backlinks;
				this.app.workspace.requestSaveLayout();
				if (reloads) void this.reload();
			},
		);

		// Bottom-left corner, phones and tablets only: hides Obsidian's own toolbar, which floats over the viewport.
		this.hidesToolbar = Platform.isMobile && this.app.loadLocalStorage(HIDE_TOOLBAR_STORAGE_KEY) === true;
		this.toolbarToggleEl = root.createDiv({ cls: "osmosis-graph3d-toolbar-toggle clickable-icon" });
		this.toolbarToggleEl.toggleClass("is-hidden", !Platform.isMobile);
		setIcon(this.toolbarToggleEl, "panel-bottom");
		this.toolbarToggleEl.addEventListener("click", () => this.toggleToolbar());
		this.showToolbarToggle();
		// The toolbar comes back whenever another view becomes active, and goes again when this one does.
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => syncMobileToolbar(this.app)));
		syncMobileToolbar(this.app);

		this.addAction("brain-circuit", "Switch to 2D mind map", () => void this.switchTo2D());
		this.followActionEl = this.addAction("locate-fixed", "Follow active note", () => this.toggleFollow());
		this.followActionEl.toggleClass("is-active", this.follow);
		this.studyActionEl = this.addAction("graduation-cap", "Relational study", () => this.toggleStudy());
		this.editActionEl = this.addAction("pencil", "Edit mode", () => this.toggleEditMode());
		this.editActionEl.toggleClass("is-active", this.editMode);

		this.emptyEl = root.createDiv({
			cls: "osmosis-graph3d-empty",
			text: "Open a note and run \"Open 3D graph for current note\".",
		});
		this.stageEl = root.createDiv({ cls: "osmosis-graph3d-stage" });
		this.study = new Graph3DStudy(root, this.plugin(), {
			redraw: () => this.redraw(),
			visit: (node) => this.visit(node),
			nearest: (ids) => this.nearest(ids),
			focusPath: () => this.focusPath,
			loadedNotes: () => this.routeNotes(),
			hopsFrom: (path) => this.hopsFrom(path),
			goTo: (path, find) => void this.goTo(path, find),
			thread: (ids) => this.scene?.setThread(ids),
			pickTrail: () => this.pickTrail(),
			resolveLink: (target, from) => this.app.metadataCache.getFirstLinkpathDest(target, from)?.path ?? null,
		});

		const { Graph3DScene } = await import("./Graph3DScene");
		// The view may have closed while the engine module loaded.
		if (this.stageEl === null) return;
		this.scene = new Graph3DScene(this.stageEl, {
			controls: this.controlSettings(),
			overlays: this.sceneOverlays(),
			onNodeClick: (node, selectOnly) => this.clickNode(node, selectOnly),
			onNodeArrived: (node) => this.visit(node),
			onLinkClick: (link, action) => this.followLink(link, action),
			onCheckboxClick: (node) => void this.toggleCheckbox(node),
			onNodeDoubleClick: (node) => this.editOnDoubleClick(node),
			onContextMenu: (node, x, y) => this.showNodeMenu(node, x, y),
			onClickWhileEditing: () => this.editor.close(true),
			onLinkDrop: (from, to, x, y) => this.showDropMenu(from, to, x, y),
			renderMarkdown: (markdown, el, sourcePath, component) => MarkdownRenderer.render(this.app, markdown, el, sourcePath, component),
			renderDiagram: (el, occlusion, side, sourcePath) => renderOcclusion(this.app, el, occlusion, side, sourcePath),
			sticks: this.app.loadLocalStorage(STICKS_STORAGE_KEY) === true,
			onSticksToggle: (shown) => this.app.saveLocalStorage(STICKS_STORAGE_KEY, shown),
			clickSelectsOnly: () => this.app.loadLocalStorage(CLICK_SELECTS_ONLY_STORAGE_KEY) === true,
			nearTier: () => this.nearTier(),
		});
		this.scene.setTheme(this.readTheme());
		this.scene.setLinkMode(this.editMode);
		// The stage can be 0×0 when the view opens (in a background tab, say),
		// and a leaf being shown again isn't always a resize event.
		const stage = this.stageEl;
		const observer = new ResizeObserver(() => this.scene?.resize(stage.clientWidth, stage.clientHeight));
		observer.observe(stage);
		this.register(() => observer.disconnect());

		this.registerEvent(this.app.workspace.on("css-change", () => this.scene?.setTheme(this.readTheme())));
		this.registerEvent(
			this.app.workspace.on("file-open", (file) => {
				if (!this.follow || file?.extension !== "md" || file.path === this.focusPath) return;
				void this.setFocus(file.path, true);
			}),
		);
		// `resolve` fires once a file's links are re-indexed, so the horizon
		// sees the edit too. Only notes within reach of the loaded area matter.
		this.registerEvent(
			this.app.metadataCache.on("resolve", (file) => {
				if (this.horizon?.hops.has(file.path) !== true) return;
				this.adjacency = null;
				this.scheduleReload();
			}),
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				this.adjacency = null;
				if (oldPath === this.focusPath) {
					this.focusPath = file.path;
					this.updateHeader();
				}
				if (this.horizon?.hops.has(oldPath) === true) this.scheduleReload();
			}),
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (this.horizon?.hops.has(file.path) !== true) return;
				this.adjacency = null;
				if (file.path === this.focusPath) this.focusPath = null;
				this.updateHeader();
				this.scheduleReload();
			}),
		);
		// Keyup lands wherever focus is, so it is caught on the window.
		this.registerDomEvent(window, "keyup", (e) => this.scene?.heldKeys.delete(e.key.toLowerCase()));
		this.registerDomEvent(window, "blur", () => this.scene?.heldKeys.clear());

		await this.reload(true);
	}

	async onClose(): Promise<void> {
		// An edit still open when the view closes is dropped; one that blurred away already began saving.
		this.editor.close(false);
		this.scheduleReload.cancel();
		this.loadSeq++;
		this.study?.destroy();
		this.study = null;
		this.toolbarToggleEl = null;
		syncMobileToolbar(this.app, this);
		this.scene?.destroy();
		this.scene = null;
		this.overlaysMenu = null;
		this.colorBy = null;
		this.modelShown = null;
		this.resettleOnLoad = false;
		this.fullModel = null;
		this.stageEl = null;
		this.cache.clear();
		this.prefetched.clear();
		this.model = null;
		this.editActionEl = null;
		this.queuedReload = null;
		for (const release of this.holds.values()) release();
		this.holds.clear();
	}

	/** Re-read the navigation settings and overlays, after they change in Osmosis settings or an Overlays menu. */
	applyControlSettings(): void {
		this.scene?.setControls(this.controlSettings());
		this.scene?.setOverlays(this.sceneOverlays());
		const overlays = this.plugin().settings.graph3dOverlays;
		// This view's own menu already shows what it sent; rebuilding it would end a slider drag.
		if (this.overlaysMenu !== null && this.overlaysMenu.current !== overlays) this.overlaysMenu.show(overlays);
		if (overlays.colorBy !== this.colorBy && this.model !== null) this.scene?.setColoring(this.coloring(this.model));
		// Attachments, Tags and Unresolved links off leave their plates out of the model, so turning one either way rebuilds it.
		if (this.modelShown !== null && modelKey(overlays.edges) !== this.modelShown) {
			this.resettleOnLoad = true;
			void this.reload();
		}
	}

	private plugin(): OsmosisPlugin {
		return this.app.plugins.plugins["osmosis"] as OsmosisPlugin;
	}

	private controlSettings(): SceneControls {
		const { settings } = this.plugin();
		return { desktopPivot: settings.graph3dDesktopPivot, touchDrag: settings.graph3dOneFingerDrag };
	}

	private sceneOverlays(): SceneOverlays {
		const { colorBy: _colorBy, ...overlays } = this.plugin().settings.graph3dOverlays;
		return overlays;
	}

	/**
	 * How to colour `model`'s nodes in the current colour mode. Tags and memory
	 * strength are read here, once per model, and only in the mode that shows
	 * them. Memory strength is as of now: a review elsewhere shows at the next
	 * reload (a hop, an edit, or changing the colour mode).
	 */
	private coloring(model: GraphModel): (node: GraphNode) => string {
		const mode = this.plugin().settings.graph3dOverlays.colorBy;
		this.colorBy = mode;
		const context: ColorContext = {
			tags: mode === "tag" ? nodeTags(this.fullModel ?? model) : new Map(),
			strengths: mode === "memory" ? this.memoryStrengths(model) : new Map(),
		};
		return (node) => overlayNodeColor(node, mode, context);
	}

	/** FSRS retrievability of the line cards on `model`'s lines (see `memoryStrengths`). Disabled cards don't count. */
	private memoryStrengths(model: GraphModel): Map<string, number | null> {
		const plugin = this.plugin();
		const now = Date.now();
		const scheduler = new FSRSScheduler({ learningSteps: plugin.settings.learningSteps, relearningSteps: plugin.settings.relearningSteps });
		const byNote = new Map<string, Map<string, (number | null)[]>>();
		return memoryStrengths(model, (path, blockId) => {
			let cards = byNote.get(path);
			if (cards === undefined) {
				cards = new Map();
				for (const card of plugin.cardStore.getCardsByNote(path)) {
					if (card.blockId === undefined || card.disabled === true) continue;
					const strength = scheduler.retrievability(
						{
							stability: card.stability ?? 0,
							difficulty: card.difficulty ?? 0,
							due: card.due ?? now,
							lastReview: card.lastReview ?? null,
							reps: card.reps ?? 0,
							lapses: card.lapses ?? 0,
							state: card.state ?? "new",
							learningSteps: card.learningSteps ?? 0,
						},
						now,
					);
					cards.set(card.blockId, [...(cards.get(card.blockId) ?? []), strength]);
				}
				byNote.set(path, cards);
			}
			return cards.get(blockId) ?? [];
		});
	}

	private toggleFollow(): void {
		this.follow = !this.follow;
		this.followActionEl?.toggleClass("is-active", this.follow);
		this.app.workspace.requestSaveLayout();
		const file = this.app.workspace.getActiveFile();
		if (this.follow && file?.extension === "md" && file.path !== this.focusPath) void this.setFocus(file.path, true);
	}

	private toggleToolbar(): void {
		this.hidesToolbar = !this.hidesToolbar;
		this.app.saveLocalStorage(HIDE_TOOLBAR_STORAGE_KEY, this.hidesToolbar);
		this.showToolbarToggle();
		syncMobileToolbar(this.app);
	}

	private showToolbarToggle(): void {
		this.toolbarToggleEl?.toggleClass("is-active", this.hidesToolbar);
		this.toolbarToggleEl?.setAttr("aria-pressed", String(this.hidesToolbar));
		if (this.toolbarToggleEl !== null) setTooltip(this.toolbarToggleEl, this.hidesToolbar ? "Show Obsidian's toolbar" : "Hide Obsidian's toolbar");
	}

	private toggleStudy(): void {
		if (this.study === null) return;
		if (this.study.active) this.study.stop();
		else {
			this.setEditMode(false);
			this.study.start();
		}
		this.studyActionEl?.toggleClass("is-active", this.study.active);
	}

	private toggleEditMode(): void {
		if (!this.editMode && this.editBlocked()) return;
		this.setEditMode(!this.editMode);
	}

	private setEditMode(on: boolean): void {
		this.editMode = on;
		this.editActionEl?.toggleClass("is-active", on);
		this.scene?.setLinkMode(on);
		// Leaving edit mode (or starting a study session) saves the line being edited.
		if (!on) this.editor.close(true);
	}

	/**
	 * Whether a relational study session forbids editing now, telling the user
	 * if so. A session hides due cards' text in place, so an editor on a hidden
	 * node would show the answer, and its nodes are keyed by IDs an edit changes.
	 */
	private editBlocked(): boolean {
		if (this.study?.active !== true) return false;
		new Notice("Relational study: editing is off");
		return true;
	}

	/**
	 * Undo or redo the newest edit to the focused node's note, whichever view
	 * made it. Files come back by `vault.modify`, so the loaded area reloads.
	 */
	private async step(isRedo: boolean): Promise<void> {
		if (this.editBlocked()) return;
		const focused = this.scene?.focusedNode() ?? null;
		const key = focused?.path ?? this.lastEditPath ?? this.focusPath;
		if (key === null) return;
		try {
			const restored = await this.edits.step(key, isRedo);
			if (restored === null) return;
			const start = focused?.source?.range.start;
			if (focused?.path !== undefined && start !== undefined && restored.some((file) => file.path === focused.path)) {
				this.edited = [{ path: focused.path, start, from: focused.id }];
			}
			this.lastEditPath = key;
			this.editLanded = true;
			void this.reload();
		} catch (error) {
			console.error("Osmosis: 3D graph undo failed", error);
			new Notice("Osmosis: could not " + (isRedo ? "redo" : "undo") + " that edit");
		}
	}

	/**
	 * `node`'s line as it is on disk now: the file's fresh bytes, parsed, and the
	 * line found again by ID. The model comes from a cached read and a schedule
	 * flush can move every offset since, so an edit never splices by the
	 * model's offsets. Null when the line has gone.
	 */
	private async freshLine(node: GraphNode): Promise<{ file: TFile; content: string; line: OsmosisNode; root: OsmosisNode } | null> {
		const id = node.source?.id;
		const file = node.kind === "line" && node.path !== undefined ? this.app.vault.getFileByPath(node.path) : null;
		if (file === null || id === undefined) return null;
		const content = await this.app.vault.read(file);
		const { root } = this.cache.get(file.path, content);
		const line = findNodeById(root, id);
		return line === null ? null : { file, content, line, root };
	}

	/**
	 * Write `content` to `file` as an edit of `node`'s line, filed under the
	 * line's note in the shared history. Then reload the loaded area, keeping
	 * the line selected and where it was: an edit changes its ID, not its start.
	 */
	private async commitEdit(file: TFile, content: string, node: GraphNode, start: number, select = false): Promise<void> {
		await this.commitLines(file, content, [{ path: file.path, start, from: node.id }], select ? () => { this.selectLanded = true; } : undefined);
	}

	/**
	 * Write `content` to `file` as one edit, filed under the note in the shared
	 * history, then reload with `edited` (see the field) to keep in place.
	 * `then` is set once the write has landed, for the reload to act on.
	 */
	private async commitLines(file: TFile, content: string, edited: typeof this.edited, then?: () => void): Promise<void> {
		this.editOwner = file.path;
		this.lastEditPath = file.path;
		// A reload already under way could read the new bytes and seed the line's successor beside its parent before `edited` says where it goes: drop it; the reload below replaces it.
		this.loadSeq++;
		await this.edits.write(file, content);
		// Marked only now, so a reload that was already under way can't take it.
		this.edited = edited;
		this.editLanded = true;
		then?.();
		void this.reload();
	}

	/** A double click on `node`: edit it, turning edit mode on first if it is off. True when taken (see `doubleClickEdit`). */
	private editOnDoubleClick(node: GraphNode): boolean {
		const action = doubleClickEdit({ isLine: node.kind === "line", hasSource: node.source !== undefined }, this.editMode, this.study?.active === true);
		if (action === "none") return false;
		if (action === "enable") this.setEditMode(true);
		return this.beginEdit(node);
	}

	/**
	 * Open the inline editor on `node` if edit mode is on and it is a line.
	 * True when the gesture is taken, so a double click does not also fly.
	 */
	private beginEdit(node: GraphNode): boolean {
		if (!this.editMode || node.kind !== "line" || node.source === undefined) return false;
		if (this.editBlocked()) return false;
		void this.openEditor(node);
		return true;
	}

	/**
	 * Read the line fresh, then open the editor on the node's plate, where the
	 * near tier keeps it as the camera moves. The text is `nodeEditText`, as in
	 * the mind map: markers in, indentation and block ID out (both come back on
	 * save). The camera stays put (`Graph3DScene.setEditing`): on desktop it
	 * only turns to a line off screen; on a phone it pans the line above the
	 * keyboard.
	 */
	private async openEditor(node: GraphNode): Promise<void> {
		if (this.opening || this.editor.isOpen) return;
		this.opening = true;
		try {
			const fresh = await this.freshLine(node);
			const scene = this.scene;
			if (fresh === null || scene === null) {
				if (fresh === null) new Notice("Osmosis: that line has changed; try again");
				return;
			}
			const stage = this.stageEl;
			if (stage === null) return;
			const text = nodeEditText(fresh.line);
			this.editor.open({
				host: stage,
				file: fresh.file,
				text,
				selectionStart: editSelectionStart(text, fresh.line.content),
				onVisibleBand: (band) => this.scene?.setVisibleBand(band),
				done: (edited) => {
					this.saved = this.finishEdit(node, text, edited);
				},
			});
			// Gone from the scene since the read (it can't be while the editor is open: reloads wait).
			if (!scene.setEditing(node.id, this.editor, Platform.isMobile)) this.editor.close(false);
		} catch (error) {
			console.error("Osmosis: 3D graph could not open the editor", error);
			new Notice("Osmosis: could not edit that line");
		} finally {
			this.opening = false;
		}
	}

	/** The editor closed: `edited` is its text on save, null on cancel. Writes what changed, then lets a reload that waited run. */
	private async finishEdit(node: GraphNode, original: string, edited: string | null): Promise<void> {
		this.scene?.setEditing(null);
		this.saving++;
		try {
			// A save selects the line, new or not. Every way an edit commits (blur, Ctrl/Cmd+Enter, the check button, a click on the canvas, leaving edit mode) ends here. An edit that changes the line gives it a new ID: the reload selects that (`place`).
			if (edited !== null) {
				this.scene?.select([node.id]);
				if (edited !== original) await this.saveEdit(node, edited);
			}
		} catch (error) {
			console.error("Osmosis: 3D graph could not save an edit", error);
			new Notice("Osmosis: could not save that edit");
		} finally {
			this.saving--;
			const queued = this.queuedReload;
			this.queuedReload = null;
			if (queued !== null) void this.reload(queued.flyToFocus, queued.subpath, queued.landOn);
		}
	}

	/**
	 * Write the edited text into the line's note, as the mind map's rename
	 * does: the line is found again in the file's fresh bytes, `renameInFile`
	 * restores its indentation and block ID (and, if its markers changed
	 * between list and heading, moves its subtree), and the file is
	 * renumbered and spaced like any 2D write.
	 */
	private async saveEdit(node: GraphNode, edited: string): Promise<void> {
		const fresh = await this.freshLine(node);
		if (fresh === null) {
			new Notice("Osmosis: that line changed before the edit saved");
			return;
		}
		const { file, content, line, root } = fresh;
		const { text } = renameInFile(content, line, ancestorsOf(root, line.id), edited);
		const out = normalizeWrite(text);
		if (out === content) return;
		await this.commitEdit(file, out, node, locateLine(out, restoreEditedLine(line, edited), line.range.start), true);
	}

	/**
	 * Line `from` was dropped on node `to` in edit mode: add a link to `to` at
	 * the end of `from`'s line. `to` is a line (linked by its heading text, or
	 * by a block ID that is stamped on it if it has none) or a note's root (a
	 * core, or a sole H1, which is the note: linked as `[[Note]]`). Both ends
	 * are found again in fresh bytes. Within one note, both splices are taken
	 * on one string and written once; across notes it is an edit group (the
	 * target's note first, so a failure leaves a harmless ID rather than a link
	 * to nothing), which one undo reverts.
	 */
	private async linkLines(from: GraphNode, to: GraphNode): Promise<void> {
		if (this.editBlocked()) return;
		try {
			const a = await this.freshLine(from);
			const toFile = to.path === undefined ? null : this.app.vault.getFileByPath(to.path);
			if (a === null || toFile === null) {
				new Notice("Osmosis: that line has changed; try again");
				return;
			}
			const toNote = isNoteRoot(to);
			if (toNote && to.path === a.file.path) {
				new Notice("Osmosis: that line is already in that note");
				return;
			}
			const sameNote = to.path === a.file.path;
			const b = toNote || to.kind !== "line" ? null : sameNote ? { content: a.content, line: findNodeById(a.root, to.source?.id ?? ""), root: a.root } : await this.freshLine(to);
			if (!toNote && to.kind === "line" && (b === null || b.line === null)) {
				new Notice("Osmosis: that line has changed; try again");
				return;
			}
			const target = b?.line ?? null;
			const sub = linkSubpath(target, b?.root ?? a.root, b?.content ?? "");
			if (sub === null) {
				new Notice("Osmosis: can't link to that line (it can't take a block ID)");
				return;
			}
			const text = this.app.fileManager.generateMarkdownLink(toFile, a.file.path, sub.subpath);
			const start = a.line.range.start;
			this.editOwner = a.file.path;
			this.lastEditPath = a.file.path;
			let edited: typeof this.edited;
			if (sameNote) {
				const out = linkInNote(a.content, a.line, target, text, sub.stamp);
				if (out === null) {
					new Notice("Osmosis: can't add a link to that kind of line");
					return;
				}
				await this.edits.write(a.file, out.content);
				edited = [{ path: a.file.path, start: out.aStart, from: from.id }];
				if (out.bStart !== null && sub.stamp !== null) edited.push({ path: toFile.path, start: out.bStart, from: to.id });
			} else {
				const appended = appendToLine(a.content, a.line, text);
				if (appended === null) {
					new Notice("Osmosis: can't add a link to that kind of line");
					return;
				}
				const stamped = target !== null && b !== null && sub.stamp !== null ? stampBlockId(b.content, target, sub.stamp) : null;
				this.edits.recorder.beginGroup();
				try {
					if (stamped !== null) await this.edits.write(toFile, stamped);
					await this.edits.write(a.file, appended);
				} finally {
					this.edits.recorder.endGroup();
				}
				edited = [{ path: a.file.path, start, from: from.id }];
				if (stamped !== null && target !== null) edited.push({ path: toFile.path, start: target.range.start, from: to.id });
			}
			// Marked only now, so a reload that was already under way can't take it.
			this.edited = edited;
			this.editLanded = true;
			void this.reload();
		} catch (error) {
			console.error("Osmosis: 3D graph could not link those lines", error);
			new Notice("Osmosis: could not add that link");
		}
	}

	/**
	 * Line `from` was dropped on node `to` in edit mode: a menu at the drop
	 * point offers a link to `to` (slice 4's gesture) or a move of the line,
	 * with its subtree, under or after `to`, or to the end of `to`'s note. A
	 * menu rather than a modifier key, so a phone gets every choice; Escape or
	 * a click elsewhere writes nothing. A sole H1 root is both a heading and
	 * the note: it offers what a core does (a `[[Note]]` link, the end of the
	 * note) and "Move under", but not "Move after", which would put the line
	 * outside the H1 and so give the note back its core.
	 */
	private showDropMenu(from: GraphNode, to: GraphNode, x: number, y: number): void {
		if (this.editBlocked()) return;
		// Dragged from a selected plate (with more than it selected), the menu acts on every selected line: the same choices, the same look.
		const selection = this.scene?.selectedNodes() ?? [];
		const group = selection.length > 1 && selection.some((n) => n.id === from.id) ? selection : null;
		const linkable = (n: GraphNode): boolean => n.kind === "line" && n.id !== to.id && (!isNoteRoot(to) || to.path !== n.path);
		const menu = new Menu();
		if (group === null ? !isNoteRoot(to) || to.path !== from.path : group.some(linkable)) {
			menu.addItem((item) => item.setTitle("Add link").setIcon("link").onClick(() => void (group === null ? this.linkLines(from, to) : this.linkSelection(group, to))));
		}
		const move = (title: string, icon: string, place: MovePlace): void => {
			menu.addItem((item) => item.setTitle(title).setIcon(icon).onClick(() => void (group === null ? this.moveLine(from, to, place) : this.moveSelection(group, to, place))));
		};
		if (to.kind === "line") move("Move under", "corner-down-right", "under");
		if (to.kind === "line" && !isNoteRoot(to)) move("Move after", "arrow-down", "after");
		if (isNoteRoot(to)) move("Move to end of note", "arrow-down-to-line", "end");
		// After the release's own click has gone by, so it cannot close the menu.
		window.setTimeout(() => menu.showAtPosition({ x, y }), 0);
	}

	/**
	 * What the shared cross-note move needs from this view: its pipeline, the
	 * mind map's write normalisation, and a frontmatter write that also drops
	 * the note's stale parse.
	 */
	private moveContext(): MoveContext {
		return {
			app: this.app,
			edits: this.edits,
			write: (file, content) => this.edits.write(file, normalizeWrite(content)),
			processFrontMatter: async (file, fn) => {
				await this.edits.processFrontMatter(file, fn);
				this.cache.invalidate(file.path);
				this.prefetched.delete(file.path);
			},
			plugin: this.plugin(),
		};
	}

	/**
	 * Move `from`'s line and its subtree to `place` relative to `to`, as the
	 * mind map's drag and drop does. Within one note it is one write. Into
	 * another note it is the mind map's own cross-note move (`edit-moves.ts`):
	 * the destination is written first, the block IDs' review history follows
	 * them, and one undo restores both notes. The moved line is selected; a
	 * line whose ID changed (a new note, or a new depth) arrives beside its new
	 * parent rather than keeping its old place.
	 */
	private async moveLine(from: GraphNode, to: GraphNode, place: MovePlace): Promise<void> {
		if (this.editBlocked() || this.structuring || this.editor.isOpen) return;
		this.structuring = true;
		try {
			const a = await this.freshLine(from);
			const destFile = to.path === undefined ? null : this.app.vault.getFileByPath(to.path);
			if (a === null || destFile === null) {
				new Notice("Osmosis: that line has changed; try again");
				return;
			}
			const sameNote = destFile.path === a.file.path;
			const destContent = sameNote ? a.content : await this.app.vault.read(destFile);
			const destRoot = sameNote ? a.root : this.cache.get(destFile.path, destContent).root;
			const target = to.kind === "line" ? findNodeById(destRoot, to.source?.id ?? "") : null;
			const gap = to.kind === "line" && target === null ? null : moveGap(destRoot, target, place, a.line);
			if (gap === null) {
				new Notice("Osmosis: that line has changed; try again");
				return;
			}
			if (sameNote) {
				const refusal = moveRefusal(a.root, a.line, gap);
				if (refusal !== null) {
					new Notice(refusal === "inside" ? "Osmosis: a line can't move under itself" : "Osmosis: the line is already there");
					return;
				}
				const plan = moveInNote(a.content, a.root, a.line, gap);
				if (plan === null) return;
				const out = normalizeWrite(plan.text);
				if (out === a.content) return;
				const start = mapStart(plan.text, out, plan.start);
				await this.commitLines(a.file, out, start === null ? [] : [{ path: a.file.path, start }]);
				return;
			}
			this.editOwner = a.file.path;
			this.lastEditPath = destFile.path;
			// As in `commitLines`: a reload already under way must not place the moved lines before `edited` does.
			this.loadSeq++;
			const site = resolveInsertSite(gap.parent, gap.index, () => destFile.path);
			const moved = await moveAcrossFiles(this.moveContext(), [a.line], site, a.file.path, (src) => dropContext(gap.parent, gap.index, src));
			let start: number | null = null;
			if (moved !== null) {
				const out = normalizeWrite(moved.text);
				start = mapStart(moved.text, out, moved.start);
				// Moving review history rewrote the destination's frontmatter only, so the body moved by its change in size.
				const now = await this.app.vault.read(destFile);
				if (start !== null) start += now.length - out.length;
			}
			// Marked only now, so a reload that was already under way can't take it.
			this.edited = start === null ? [] : [{ path: destFile.path, start }];
			this.editLanded = true;
			void this.reload();
		} catch (error) {
			console.error("Osmosis: 3D graph could not move that line", error);
			new Notice("Osmosis: could not move that line");
		} finally {
			this.structuring = false;
		}
	}

	/**
	 * Do the mind map's structural edit `action` on `node`'s line: the same
	 * bytes (`planStructural` wraps the functions `MindMapView` calls), found
	 * against the file's fresh bytes, written once and filed in the shared
	 * history. A new line opens the editor at once; a line that moved or was
	 * re-levelled (its IDs change with its depth, and all its descendants'
	 * with it) keeps its place, and so does everything under it.
	 */
	private async structural(action: StructuralAction, node: GraphNode, fromMenu = false, picked: readonly GraphNode[] = []): Promise<void> {
		if (this.editBlocked() || this.structuring || this.editor.isOpen) return;
		this.structuring = true;
		try {
			const fresh = await this.freshLine(node);
			if (fresh === null) {
				new Notice("Osmosis: that line has changed; try again");
				return;
			}
			const { file, content, line, root } = fresh;
			// Only the selected lines of this note can be wrapped with it (Ctrl+Enter).
			const selectedIds = new Set<string>();
			for (const pick of picked) if (pick.kind === "line" && pick.path === file.path && pick.source !== undefined) selectedIds.add(pick.source.id);
			const plan = planStructural(action, content, root, line, selectedIds);
			if (plan === null) {
				if (fromMenu) new Notice("Osmosis: nothing to do there");
				return;
			}
			const out = normalizeWrite(plan.text);
			if (out === content) return;
			// Spacing normalisation can shift every offset: follow lines by count.
			const at = (start: number | null): number | null => (start === null ? null : mapStart(plan.text, out, start));
			const selected = at(plan.select);
			const edited: typeof this.edited = [];
			if (selected !== null && (plan.fresh || plan.moved === null)) edited.push({ path: file.path, start: selected });
			const movedAt = plan.moved === null ? null : at(plan.moved.start);
			if (plan.moved !== null && movedAt !== null) {
				const graphIds = new Map<string, string>();
				for (const n of this.model?.nodes ?? []) if (n.kind === "line" && n.path === file.path && n.source !== undefined) graphIds.set(n.source.id, n.id);
				for (const { from, to } of carrySiblings([plan.moved.node, ...plan.moved.following], this.cache.get(file.path, out).root, movedAt)) {
					edited.push({ path: file.path, start: to.range.start, from: graphIds.get(from.id) });
				}
			}
			await this.commitLines(file, out, edited, () => {
				this.pendingEdit = plan.fresh && selected !== null ? { path: file.path, start: selected } : null;
				this.selectAfter = plan.select === null ? noteNodeId(file.path) : null;
				// A delete selects the line `plan.select` names; the other actions leave the selection as it was.
				this.selectLanded = action === "delete";
			});
		} catch (error) {
			console.error("Osmosis: 3D graph could not make that edit", error);
			new Notice("Osmosis: could not make that edit");
		} finally {
			this.structuring = false;
		}
	}

	/**
	 * Copy `nodes` as Markdown (`selectionMarkdown`): each note's selected lines
	 * with their subtrees, re-levelled and in document order, grouped by note
	 * (the primary's note first). Plates that are not lines (notes, tags,
	 * files, unresolved links) follow as links or tags.
	 */
	private async copySelection(nodes: readonly GraphNode[]): Promise<void> {
		try {
			const byPath = new Map<string, string[]>();
			const others: string[] = [];
			for (const node of nodes) {
				const id = node.source?.id;
				if (node.kind === "line" && node.path !== undefined && id !== undefined) {
					const ids = byPath.get(node.path) ?? [];
					ids.push(id);
					byPath.set(node.path, ids);
				} else others.push(node.kind === "tag" ? node.label : `[[${node.label}]]`);
			}
			const groups: CopyGroup[] = [];
			for (const [path, ids] of byPath) {
				const file = this.app.vault.getFileByPath(path);
				if (file === null) continue;
				const content = await this.app.vault.read(file);
				const { root } = this.cache.get(path, content);
				const lines = ids.map((id) => findNodeById(root, id)).filter((line): line is OsmosisNode => line !== null);
				if (lines.length > 0) groups.push({ title: file.basename, markdown: linesMarkdown(content, lines) });
			}
			if (others.length > 0) groups.push({ title: null, markdown: others.join("\n") });
			if (groups.length === 0) return;
			await navigator.clipboard.writeText(selectionMarkdown(groups));
			new Notice(nodes.length === 1 ? "Copied as Markdown" : `Copied ${nodes.length} selected as Markdown`);
		} catch (error) {
			console.error("Osmosis: 3D graph could not copy the selection", error);
			new Notice("Osmosis: could not copy the selection");
		}
	}

	/**
	 * Delete every selected line with its subtree (as a single delete does),
	 * across notes, as one undo step. Plates that are not lines are skipped.
	 * After, the previous sibling of the first deleted line in document order is
	 * selected, else its parent, else its note's core (`selectAfterDelete`); the
	 * anchor is in the primary's note, or the first note written if the primary
	 * is not a line. The loaded nodes re-settle (`commitLines`'s `editLanded`).
	 */
	private async deleteSelection(nodes: readonly GraphNode[]): Promise<void> {
		if (this.editBlocked() || this.structuring || this.editor.isOpen) return;
		this.structuring = true;
		try {
			const byPath = new Map<string, string[]>();
			for (const node of nodes) {
				const id = node.source?.id;
				if (node.kind !== "line" || node.path === undefined || id === undefined || node.root === true) continue;
				byPath.set(node.path, [...(byPath.get(node.path) ?? []), id]);
			}
			if (byPath.size === 0) {
				new Notice("Osmosis: nothing selected to delete");
				return;
			}
			const anchorPath = byPath.has(nodes[0]?.path ?? "") ? nodes[0]!.path! : byPath.keys().next().value!;
			const writes: { file: TFile; out: string }[] = [];
			let edited: typeof this.edited = [];
			let selectAfter: string | null = null;
			for (const [path, ids] of byPath) {
				const file = this.app.vault.getFileByPath(path);
				if (file === null) continue;
				const content = await this.app.vault.read(file);
				const { root } = this.cache.get(path, content);
				const lines = topmostLines(ids.map((id) => findNodeById(root, id)).filter((line): line is OsmosisNode => line !== null));
				if (lines.length === 0) continue;
				const text = deleteLines(content, lines);
				const out = normalizeWrite(text);
				if (out === content) continue;
				writes.push({ file, out });
				// Select the previous sibling of the first deleted line, else its parent (or the note's core, under the root).
				if (path !== anchorPath) continue;
				const after = selectAfterDelete(root, ids);
				const kept = after === null ? null : findNodeById(this.cache.get(path, text).root, after);
				const start = kept === null ? null : mapStart(text, out, kept.range.start);
				const from = after === null ? undefined : this.model?.nodes.find((n) => n.path === path && n.source?.id === after)?.id;
				if (start === null) selectAfter = noteNodeId(path);
				else edited = [{ path, start, from }];
			}
			if (writes.length === 0) return;
			this.editOwner = writes[0]!.file.path;
			this.lastEditPath = writes[0]!.file.path;
			// As in `commitLines`: a reload already under way must not place lines before `edited` does.
			this.loadSeq++;
			this.edits.recorder.beginGroup();
			try {
				for (const { file, out } of writes) await this.edits.write(file, out);
			} finally {
				this.edits.recorder.endGroup();
			}
			this.scene?.clearSelection();
			// Marked only now, so a reload that was already under way can't take it.
			this.edited = edited;
			this.selectAfter = selectAfter;
			this.selectLanded = true;
			this.editLanded = true;
			void this.reload();
		} catch (error) {
			console.error("Osmosis: 3D graph could not delete the selection", error);
			new Notice("Osmosis: could not delete those lines");
		} finally {
			this.structuring = false;
		}
	}

	/** Every note of `paths`, read fresh and parsed; null when one has gone. */
	private async readNotes(paths: Iterable<string>): Promise<Map<string, PlanNote & { file: TFile }> | null> {
		const notes = new Map<string, PlanNote & { file: TFile }>();
		for (const path of new Set(paths)) {
			const file = this.app.vault.getFileByPath(path);
			if (file === null) return null;
			const content = await this.app.vault.read(file);
			notes.set(path, { file, content, root: this.cache.get(path, content).root });
		}
		return notes;
	}

	/** The selected line plates `nodes` as lines of `notes`, found again by ID; null when one has gone. */
	private pickLines(nodes: readonly GraphNode[], notes: ReadonlyMap<string, PlanNote>): PickedLine[] | null {
		const picked: PickedLine[] = [];
		for (const node of nodes) {
			const note = node.path === undefined ? undefined : notes.get(node.path);
			const line = note === undefined ? null : findNodeById(note.root, node.source?.id ?? "");
			if (line === null || node.path === undefined) return null;
			picked.push({ path: node.path, line });
		}
		return picked;
	}

	/**
	 * Write an action on a selection (`plan`) as one edit group, `first`'s note
	 * first, so one undo restores every note. A cross-note move (`moved`: the
	 * text each origin gave up) then carries its block IDs' review history, as
	 * one line's move does. The lines keep their selection and start where they
	 * were (`carry`: their subtrees too); the primary's entry goes first, so the
	 * re-settle (`editLanded`) runs once with the camera on it.
	 */
	private async commitSelection(
		notes: ReadonlyMap<string, PlanNote & { file: TFile }>,
		plan: SelectionEdit,
		first: string,
		primary: GraphNode | undefined,
		carry: boolean,
		moved?: { dest: string; out: ReadonlyMap<string, string> },
	): Promise<void> {
		const writes = [...plan.texts]
			.flatMap(([path, text]) => {
				const note = notes.get(path);
				const out = normalizeWrite(text);
				return note === undefined || out === note.content ? [] : [{ path, file: note.file, text, out }];
			})
			.sort((a, b) => Number(b.path === first) - Number(a.path === first));
		if (writes.length === 0) return;
		const graphId = (path: string, id: string): string | undefined => this.model?.nodes.find((n) => n.kind === "line" && n.path === path && n.source?.id === id)?.id;
		const entries: { path: string; start: number; from?: string; primary: boolean }[] = [];
		for (const line of plan.lines) {
			const write = writes.find((w) => w.path === line.path);
			const start = write === undefined ? null : mapStart(write.text, write.out, line.start);
			if (write === undefined || start === null) continue;
			const pairs = carry ? carryPairs(line.line, this.cache.get(line.path, write.out).root, start) : [{ from: line.line, to: null }];
			for (const { from, to } of pairs) {
				entries.push({ path: line.path, start: to?.range.start ?? start, from: graphId(line.origin, from.id), primary: line.origin === primary?.path && from.id === primary.source?.id });
			}
		}
		entries.sort((a, b) => Number(b.primary) - Number(a.primary));
		this.editOwner = writes[0]!.path;
		this.lastEditPath = writes[0]!.path;
		// As in `commitLines`: a reload already under way must not place lines before `edited` does.
		this.loadSeq++;
		this.edits.recorder.beginGroup();
		try {
			for (const { file, out } of writes) await this.edits.write(file, out);
			const dest = moved === undefined ? undefined : writes.find((w) => w.path === moved.dest);
			if (moved !== undefined && moved.out.size > 0) {
				const context = this.moveContext();
				for (const [origin, text] of moved.out) {
					const ids = collectBlockIds(text);
					await migrateBlockIdentity(context, origin, moved.dest, ids, await readMovedScheduleEntries(context, origin, ids));
				}
				// Moving review history rewrote the destination's frontmatter only, so its body moved by its change in size.
				if (dest !== undefined) {
					const grew = (await this.app.vault.read(dest.file)).length - dest.out.length;
					for (const entry of entries) if (entry.path === dest.path) entry.start += grew;
				}
			}
		} finally {
			this.edits.recorder.endGroup();
		}
		// Marked only now, so a reload that was already under way can't take it.
		this.edited = entries.map(({ path, start, from }) => ({ path, start, from }));
		this.editLanded = true;
		void this.reload();
	}

	/**
	 * Move every selected line, each with its subtree, to `place` relative to
	 * `to` (the drop menu, dragged from a selected plate): in document order,
	 * from any note, one undo step (`planSelectionMove`). Plates that are not
	 * lines, and a sole H1 root (the note itself), are skipped.
	 */
	private async moveSelection(nodes: readonly GraphNode[], to: GraphNode, place: MovePlace): Promise<void> {
		if (this.editBlocked() || this.structuring || this.editor.isOpen) return;
		this.structuring = true;
		try {
			const lines = nodes.filter((n) => n.kind === "line" && n.root !== true && n.path !== undefined);
			if (lines.length === 0 || to.path === undefined) {
				new Notice("Osmosis: no selected lines to move");
				return;
			}
			const notes = await this.readNotes([to.path, ...lines.map((n) => n.path!)]);
			const dest = notes?.get(to.path);
			const target = dest === undefined || to.kind !== "line" ? null : findNodeById(dest.root, to.source?.id ?? "");
			const picked = notes === null ? null : this.pickLines(lines, notes);
			if (notes === null || picked === null || (to.kind === "line" && target === null)) {
				new Notice("Osmosis: that line has changed; try again");
				return;
			}
			const plan = planSelectionMove(notes, picked, { path: to.path, node: target }, place);
			if (plan === "inside") {
				new Notice("Osmosis: a line can't move under itself");
				return;
			}
			if (plan === null) {
				new Notice("Osmosis: that line has changed; try again");
				return;
			}
			await this.commitSelection(notes, plan, to.path, nodes[0], true, { dest: to.path, out: movedOut(notes, picked, to.path) });
		} catch (error) {
			console.error("Osmosis: 3D graph could not move the selection", error);
			new Notice("Osmosis: could not move those lines");
		} finally {
			this.structuring = false;
		}
	}

	/**
	 * Indent or outdent every selected line together (Alt+→ / Alt+←, or the
	 * selection menu), one undo step (`planSelectionRelevel`). A line that
	 * can't go (a first child, a heading at the root) stays.
	 */
	private async relevelSelection(action: "indent" | "outdent", nodes: readonly GraphNode[], fromMenu = false): Promise<void> {
		if (this.editBlocked() || this.structuring || this.editor.isOpen) return;
		this.structuring = true;
		try {
			const lines = nodes.filter((n) => n.kind === "line" && n.root !== true && n.path !== undefined);
			const notes = await this.readNotes(lines.map((n) => n.path!));
			const picked = notes === null ? null : this.pickLines(lines, notes);
			if (notes === null || picked === null) {
				new Notice("Osmosis: that line has changed; try again");
				return;
			}
			const plan = picked.length === 0 ? null : planSelectionRelevel(action, notes, picked);
			if (plan === null) {
				if (fromMenu) new Notice("Osmosis: nothing to do there");
				return;
			}
			await this.commitSelection(notes, plan, nodes[0]?.path ?? picked[0]!.path, nodes[0], true);
		} catch (error) {
			console.error("Osmosis: 3D graph could not re-level the selection", error);
			new Notice("Osmosis: could not make that edit");
		} finally {
			this.structuring = false;
		}
	}

	/**
	 * Link every selected line to `to` (the drop menu's "Add link", dragged
	 * from a selected plate), the target's block ID stamped once and written
	 * first, one undo step (`planSelectionLink`). The rules of one link hold:
	 * no line links to itself, nor to its own note.
	 */
	private async linkSelection(nodes: readonly GraphNode[], to: GraphNode): Promise<void> {
		if (this.editBlocked() || this.structuring || this.editor.isOpen) return;
		this.structuring = true;
		try {
			const toFile = to.path === undefined ? null : this.app.vault.getFileByPath(to.path);
			const toLine = to.kind === "line" && !isNoteRoot(to);
			const lines = nodes.filter((n) => n.kind === "line" && n.path !== undefined);
			const notes = toFile === null ? null : await this.readNotes([...(toLine ? [toFile.path] : []), ...lines.map((n) => n.path!)]);
			const toNote = toFile === null ? undefined : notes?.get(toFile.path);
			const target = toLine && toNote !== undefined ? findNodeById(toNote.root, to.source?.id ?? "") : null;
			const picked = notes === null ? null : this.pickLines(lines, notes);
			if (toFile === null || notes === null || picked === null || (toLine && target === null)) {
				new Notice("Osmosis: that line has changed; try again");
				return;
			}
			const plan = planSelectionLink(notes, picked, { path: toFile.path, node: target }, (fromPath, subpath) => this.app.fileManager.generateMarkdownLink(toFile, fromPath, subpath));
			if (plan === null) {
				new Notice("Osmosis: can't link to that line (it can't take a block ID)");
				return;
			}
			if (plan.lines.length === 0) {
				new Notice("Osmosis: can't add a link to those lines");
				return;
			}
			await this.commitSelection(notes, plan, toFile.path, nodes[0], false);
		} catch (error) {
			console.error("Osmosis: 3D graph could not link the selection", error);
			new Notice("Osmosis: could not add those links");
		} finally {
			this.structuring = false;
		}
	}

	/**
	 * The context menu of a line or note plate (right-click, or a long press on
	 * touch): "Focus this note" (a hop, greyed out in the focus note itself),
	 * and in edit mode, for a line, edit it or any structural edit.
	 */
	private showNodeMenu(node: GraphNode, x: number, y: number): void {
		if (this.editor.isOpen) return;
		// A selected plate's menu acts on the whole selection (if more than it is selected); any other plate's on itself.
		const selection = this.scene?.selectedNodes() ?? [];
		const group = selection.length > 1 && selection.some((n) => n.id === node.id) ? selection : null;
		this.scene?.setFocusId(node.id);
		const menu = new Menu();
		const path = refocusPath(node, this.focusPath);
		menu.addItem((item) => item.setTitle("Focus this note").setIcon("locate").setDisabled(path === null).onClick(() => this.hop(node)));
		menu.addItem((item) =>
			item
				.setTitle(group === null ? "Copy as Markdown" : `Copy ${group.length} selected as Markdown`)
				.setIcon("copy")
				.onClick(() => void this.copySelection(group ?? [node])),
		);
		if (group !== null) {
			const lines = group.filter((n) => n.kind === "line").length;
			if (this.editMode && lines > 0 && this.study?.active !== true) {
				menu.addSeparator();
				menu.addItem((item) => item.setTitle(`Indent ${lines} selected lines`).setIcon("indent-increase").onClick(() => void this.relevelSelection("indent", group, true)));
				menu.addItem((item) => item.setTitle(`Outdent ${lines} selected lines`).setIcon("indent-decrease").onClick(() => void this.relevelSelection("outdent", group, true)));
				menu.addSeparator();
				menu.addItem((item) => item.setTitle(`Delete ${lines} selected lines`).setIcon("trash-2").setWarning(true).onClick(() => void this.deleteSelection(group)));
			}
			menu.showAtPosition({ x, y });
			return;
		}
		if (!this.editMode || node.kind !== "line" || this.editBlocked()) {
			menu.showAtPosition({ x, y });
			return;
		}
		menu.addSeparator();
		const add = (title: string, icon: string, action: StructuralAction): void => {
			menu.addItem((item) => item.setTitle(title).setIcon(icon).onClick(() => void this.structural(action, node, true)));
		};
		menu.addItem((item) => item.setTitle("Edit text").setIcon("pencil").onClick(() => void this.beginEdit(node)));
		menu.addSeparator();
		add("Add child", "arrow-right-from-line", "child");
		add("Add sibling", "arrow-down-from-line", "sibling");
		add("Insert parent", "arrow-right-to-line", "parent");
		if (!isNoteRoot(node) && node.source !== undefined && canConvertBranch(node.source)) {
			menu.addItem((item) => item.setTitle("Convert branch to note").setIcon("file-output").onClick(() => void this.convertBranch(node)));
		}
		menu.addSeparator();
		add("Move up", "arrow-up", "up");
		add("Move down", "arrow-down", "down");
		add("Indent", "indent-increase", "indent");
		add("Outdent", "indent-decrease", "outdent");
		menu.addSeparator();
		menu.addItem((item) => item.setTitle("Delete").setIcon("trash-2").setWarning(true).onClick(() => void this.structural("delete", node, true)));
		menu.showAtPosition({ x, y });
	}

	/**
	 * Move `node`'s line and its subtree into a new note, an `![[embed]]` left in
	 * its place (`convertBranchToNote`). The reload selects the embed line, and
	 * the new note joins the graph through it, as embedded content or (in
	 * Planets mode) a planet of its own, per the depth rules.
	 */
	private async convertBranch(node: GraphNode): Promise<void> {
		if (this.editBlocked() || this.structuring || this.editor.isOpen) return;
		const file = node.path === undefined ? null : this.app.vault.getFileByPath(node.path);
		const id = node.source?.id;
		if (file === null || id === undefined) return;
		this.structuring = true;
		try {
			this.editOwner = file.path;
			this.lastEditPath = file.path;
			// As in `commitLines`: a reload already under way must not place lines before `edited` does.
			this.loadSeq++;
			const { branchNoteFolder: folder, branchNoteTemplate: template } = this.plugin().settings;
			const done = await convertBranchToNote(this.moveContext(), { folder, template }, file, id);
			if (done !== null) {
				this.edited = [{ path: file.path, start: done.embedStart, from: node.id }];
				this.editLanded = true;
				this.selectLanded = true;
			}
			void this.reload();
		} catch (error) {
			console.error("Osmosis: 3D graph could not convert a branch", error);
			new Notice("Osmosis: could not convert that branch");
		} finally {
			this.structuring = false;
		}
	}

	/** A tap on a task checkbox in a panel: tick or untick the line in its note. Outside edit mode too, as in Obsidian's reading view. */
	private async toggleCheckbox(node: GraphNode): Promise<void> {
		if (this.editBlocked()) return;
		try {
			const fresh = await this.freshLine(node);
			if (fresh === null || fresh.line.metadata?.checkbox !== true) return;
			const { file, content, line } = fresh;
			const { start, end } = line.range;
			const toggled = toggleCheckboxLine(content.slice(start, end), line.metadata?.checked === true);
			await this.commitEdit(file, content.slice(0, start) + toggled + content.slice(end), node, start);
		} catch (error) {
			console.error("Osmosis: 3D graph could not toggle a checkbox", error);
			new Notice("Osmosis: could not change that checkbox");
		}
	}

	/**
	 * Hold the history of every note now loaded, and let go of those that left,
	 * so an edit stays undoable while its note is on screen and no longer.
	 */
	private syncHolds(loaded: ReadonlySet<string>): void {
		const { acquire, release } = heldDiff(new Set(this.holds.keys()), loaded);
		for (const path of release) {
			this.holds.get(path)?.();
			this.holds.delete(path);
		}
		for (const path of acquire) this.holds.set(path, this.plugin().editHistory.hold(path));
	}

	/**
	 * Where every node of `model` starts: where it is now, and a line an edit
	 * just changed where its old self was (the edit gave it a new ID), so it
	 * stays put instead of re-settling beside its parent. Consumes `edited`:
	 * the changed line is also selected again.
	 */
	private place(scene: Graph3DScene, model: GraphModel, via: ReadonlyMap<string, string>, seeds?: ReadonlyMap<string, Placed>): Map<string, Placed> {
		const positions = scene.positions();
		// The lift-off's seeds, for nodes not in the scene yet (the first load after the toggle, when none are).
		for (const [id, seed] of seeds ?? []) if (!positions.has(id)) positions.set(id, seed);
		const { edited } = this;
		this.edited = [];
		// An edited line that was selected stays selected under its new ID.
		const carried = new Map<string, string>();
		let landed: string | null = null;
		edited.forEach((line, i) => {
			const id = lineNodeAt(model, line.path, line.start);
			const from = line.from === undefined ? undefined : positions.get(line.from);
			if (id === null) return;
			if (from !== undefined && !positions.has(id)) positions.set(id, from);
			if (line.from !== undefined && line.from !== id) carried.set(line.from, id);
			if (i === 0) {
				scene.setFocusId(id);
				landed = id;
			}
		});
		scene.carrySelection(carried);
		if (this.selectAfter !== null) {
			scene.setFocusId(this.selectAfter);
			landed = this.selectAfter;
		}
		this.selectAfter = null;
		// A save or a delete selects its line alone (the scene drops an ID that is not in the model).
		if (this.selectLanded && landed !== null) scene.select([landed]);
		this.selectLanded = false;
		return placeNodes(model, positions, via);
	}

	/** Hand the scene the current model again, as the study session shows it now. */
	private redraw(): void {
		this.studyActionEl?.toggleClass("is-active", this.study?.active === true);
		if (this.study?.active === true) this.setEditMode(false);
		const { scene, model, horizon } = this;
		if (scene === null || model === null || horizon === null) return;
		scene.setData(this.study?.decorate(model) ?? model, this.place(scene, model, horizon.via));
	}

	/** The node among `ids` nearest the camera. */
	private nearest(ids: readonly string[]): string | null {
		const scene = this.scene;
		if (scene === null) return null;
		const positions = scene.positions();
		const candidates = ids.flatMap((id) => {
			const at = positions.get(id);
			return at === undefined ? [] : [{ id, ...at }];
		});
		return nearestTarget(scene.viewpoint(), candidates);
	}

	/**
	 * The notes a due-driven route is collected from: the loaded area, but at
	 * depth 0 (the focus and what it embeds) also its linked notes, one hop out.
	 * A route needs somewhere to go, and a stop in a note not loaded recentres the graph on it.
	 */
	private routeNotes(): string[] {
		const loaded = new Set(this.horizon?.loaded ?? []);
		if (this.depth === 0 && this.focusPath !== null) {
			this.adjacency ??= noteAdjacency(this.app.metadataCache.resolvedLinks);
			for (const path of computeHorizon(this.adjacency, this.focusPath, 1, this.backlinks).loaded) loaded.add(path);
		}
		return [...loaded];
	}

	/** Hop distance from `path` to every note it reaches. Links count in both directions: a route is flown, not followed. */
	private hopsFrom(path: string): ReadonlyMap<string, number> {
		this.adjacency ??= noteAdjacency(this.app.metadataCache.resolvedLinks);
		return computeHorizon(this.adjacency, path, Number.MAX_SAFE_INTEGER - 1, true).hops;
	}

	/**
	 * Fly to the node `find` picks from the model (a study stop), leaving the
	 * focus note as it is. When that node is not in the model shown now (its
	 * note is beyond the loaded area), make `path` the focus note first, then
	 * fly once the reload has landed.
	 */
	private async goTo(path: string, find: (model: GraphModel) => string | null): Promise<void> {
		const id = this.model === null ? null : find(this.model);
		const node = id === null ? undefined : this.model?.nodes.find((n) => n.id === id);
		if (node !== undefined) {
			this.visit(node);
			return;
		}
		await this.navigate({ focus: path, node: null }, "", false);
		const landed = this.model === null ? null : find(this.model);
		if (landed !== null) this.scene?.flyTo(landed, true);
	}

	/** The trail notes in the vault: Markdown notes marked `osmosis-trail: true`. */
	private trailNotes(): TFile[] {
		return this.app.vault.getMarkdownFiles().filter((file) => isTrail(this.app.metadataCache.getFileCache(file)?.frontmatter));
	}

	/** Ask which trail note to walk, and read it. Null when the vault has none, or the picker is dismissed. */
	private async pickTrail(): Promise<{ path: string; text: string } | null> {
		const trails = this.trailNotes();
		if (trails.length === 0) {
			new Notice("No trail notes found. Add `osmosis-trail: true` to a note's properties and list its stops as links.");
			return null;
		}
		const file = await new Graph3DTrailPicker(this.app, trails).pick();
		return file === null ? null : { path: file.path, text: await this.app.vault.cachedRead(file) };
	}

	/**
	 * A click or tap on a node: in a study session, arriving at (or revealing) a hidden card.
	 * (Arriving by a ride along an edge is `visit` alone: the card stays hidden until the plate is clicked.)
	 */
	private clickNode(node: GraphNode, selectOnly: boolean): void {
		this.study?.clicked(node);
		// "Click selects only" is about the camera: the study action above still runs, but no flight and no history step.
		if (!selectOnly) this.visit(node);
	}

	/**
	 * Travel, camera only: fly to `node` and select it. The focus note, and so
	 * the loaded area, stays as it is, whatever note the node is in. Plate
	 * clicks, edge rides' arrivals, panel links and study stops within the
	 * loaded area all come here. A step in the tab's back/forward history.
	 */
	private visit(node: GraphNode): void {
		void this.navigate({ focus: this.focusPath, node: node.id });
	}

	/**
	 * A hop, on purpose (the plate menu's "Focus this note", the F key): fly to
	 * `node` and make its note the focus note, recentring the loaded area on it.
	 * Tags, attachments and ghosts belong to no note, and are never hops.
	 */
	private hop(node: GraphNode): void {
		void this.navigate({ focus: refocusPath(node, this.focusPath) ?? this.focusPath, node: node.id });
	}

	/** Where the view stands: its focus note and the plate the camera is at. */
	private here(): Place {
		return { focus: this.focusPath, node: this.scene?.focusedNode()?.id ?? null };
	}

	/**
	 * Go to `place` as a step in the tab's back/forward history. Core keeps the
	 * place being left when `setState` reports a step (`result.history`), and
	 * back/forward hand an old place to `setState` without recording one; a new
	 * step after going back clears the forward entries. A `subpath` lands on a
	 * heading or block when `place` has no plate; without `land`, a refocus
	 * leaves the camera where it is. With `glide` (an arrow key), a plate in the
	 * same focus note is glided to without turning (`Graph3DScene.glideTo`)
	 * rather than flown to. While the leaf is busy (still opening, say) it
	 * drops the call, so the step is taken without an entry.
	 */
	private async navigate(place: Place, subpath = "", land = true, glide = false): Promise<void> {
		this.arrival = null;
		await this.leaf.setViewState({ type: VIEW_TYPE_GRAPH3D, state: { ...this.getState(), focus: place.focus, node: place.node, subpath, land, glide } });
		this.arrival ??= this.travel(stepTo(this.here(), place), subpath, land, glide);
		await this.arrival;
	}

	/**
	 * Take a step: fly to another plate (or, if an edit deleted it, its note's
	 * root), or make another note the focus note and land on the step's plate.
	 * A plate loaded now is flown to at once, so the camera follows it while
	 * the reload re-heats the layout, as a hop always has. With `glide`, a
	 * plate in the same focus note is glided to instead (see `navigate`).
	 */
	private async travel(step: Step, subpath: string, land: boolean, glide = false): Promise<void> {
		const scene = this.scene;
		if (step.kind === "none" || scene === null) return;
		const loaded = (id: string): boolean => this.model?.nodes.some((node) => node.id === id) ?? false;
		if (step.kind === "fly") {
			if (this.focusPath === null) return;
			const to = landing(loaded, this.focusPath, step.node);
			if (glide) scene.glideTo(to);
			else scene.flyTo(to);
			return;
		}
		const node = step.node;
		const flown = node !== null && loaded(node);
		if (flown) scene.flyTo(node);
		await this.setFocus(step.focus, land && node === null, subpath, flown ? null : node);
	}

	/**
	 * Follow a link clicked in a near-tier panel, as the mind map does
	 * (`MindMapView.openNodeLink`) but staying in 3D: a plain click flies to the
	 * target, the line a heading or block link names, leaving the focus note as
	 * it is; a target not loaded makes its note the focus note first (a hop,
	 * since there is nowhere to fly until it is). Mod opens it in a new 3D graph tab; Mod+Alt in a
	 * note view in a new tab. A plain click never replaces this view: what has
	 * no node here (an unresolved link, a file not shown) opens in a new tab.
	 */
	private followLink(link: PanelLink, action: Exclude<LinkClick, "none" | "node">): void {
		if (action === "external") {
			window.open(link.href);
			return;
		}
		const { workspace, metadataCache } = this.app;
		if (action === "open-note") {
			void workspace.openLinkText(link.href, link.sourcePath, "tab");
			return;
		}
		const { path, subpath: hash } = parseLinktext(link.href);
		const subpath = hash.replace(/^#/, "");
		const file = path === "" ? this.app.vault.getFileByPath(link.sourcePath) : metadataCache.getFirstLinkpathDest(path, link.sourcePath);
		if (file === null || file.extension !== "md") {
			// Attachments and unresolved links are nodes too, when a loaded note reaches them.
			const id = file === null ? ghostNodeId(path) : attachmentNodeId(file.path);
			const node = action === "follow" ? this.model?.nodes.find((n) => n.id === id) : undefined;
			if (node !== undefined) this.visit(node);
			else void workspace.openLinkText(link.href, link.sourcePath, "tab");
			return;
		}
		if (action === "follow-tab") {
			void workspace.getLeaf("tab").setViewState({
				type: VIEW_TYPE_GRAPH3D,
				state: { focus: file.path, depth: this.depth, backlinks: this.backlinks, subpath },
				active: true,
			});
			return;
		}
		const id = this.model === null ? null : linkTargetNode(this.model, file.path, subpath);
		const node = id === null ? undefined : this.model?.nodes.find((n) => n.id === id);
		if (node !== undefined) this.visit(node);
		else void this.navigate({ focus: file.path, node: null }, subpath);
	}

	/**
	 * The 2D/3D toggle (this view's header action, and the mind map's toggle
	 * command): show the focused node's note as a mind map in this leaf,
	 * landing on the focused line at the scale its plate is drawn now (see
	 * `graph3d/liftoff.ts`). An open edit saves first, as a blur does; a study
	 * session ends, flushing its ratings; a link drag is dropped. The note's
	 * undo history is held across the swap.
	 */
	async switchTo2D(): Promise<void> {
		this.scene?.cancelLinkDrag();
		if (this.editor.isOpen) this.editor.close(true);
		await this.saved;
		if (this.study?.active === true) this.toggleStudy();
		const scene = this.scene;
		const node = scene?.focusedNode() ?? null;
		const nodePath = node !== null && (node.kind === "line" || node.kind === "note") ? node.path : undefined;
		const path = nodePath ?? this.focusPath;
		if (path === null) {
			new Notice("Open a note in the 3D graph first");
			return;
		}
		const focus = node?.kind === "line" && nodePath !== undefined && node.source !== undefined ? { path: nodePath, start: node.source.range.start, root: false } : null;
		const landing: Landing = { focus, platePx: scene?.linePlatePixels(node?.id ?? null) ?? null };
		const map = this.mapState ?? { pinned: true, readingMode: false };
		const state = { ...writeMapState(path, map.pinned, map.readingMode), landing, graph3d: { depth: this.depth, backlinks: this.backlinks, follow: this.follow } };
		await this.plugin().swapLeafView(this.leaf, "2d", state, [path]);
	}

	/**
	 * Make `path` the focus note and reload the area around it; every focus
	 * change after the view opens comes here. Steps of the tab's history come
	 * through `navigate`; Follow active note calls this directly and records
	 * none. With `flyToFocus`, fly to the new focus note's core, or to the
	 * line `subpath` names in it; `landOn` is a plate to land on instead.
	 */
	private setFocus(path: string, flyToFocus: boolean, subpath = "", landOn: string | null = null): Promise<void> {
		this.focusPath = path;
		this.faceFocus = true;
		this.updateHeader();
		this.app.workspace.requestSaveLayout();
		return this.reload(flyToFocus, subpath, landOn);
	}

	private updateHeader(): void {
		// updateHeader() refreshes the tab title; not in public typings
		(this.leaf as unknown as { updateHeader(): void }).updateHeader();
	}

	/**
	 * Recompute the horizon from the focus and show every loaded note. With
	 * `flyToFocus`, the camera then stands at the focus note's core: the
	 * engine's default framing is far enough out that the mist hides most of
	 * the loaded area. A `subpath` (a heading or block, without its `#`) lands
	 * on that line instead. A `landOn` plate (a back/forward step's) is landed
	 * on whatever `flyToFocus` says, or its note's root if an edit deleted it.
	 */
	private async reload(flyToFocus = false, subpath = "", landOn: string | null = null): Promise<void> {
		const scene = this.scene;
		if (scene === null) return;
		// A reload can drop the node being edited, or build the edited line's successor before the save marks where it goes: wait for the editor to close and its save to land.
		if (this.editor.isOpen || this.saving > 0) {
			this.queuedReload = {
				flyToFocus: flyToFocus || (this.queuedReload?.flyToFocus ?? false),
				subpath: subpath || (this.queuedReload?.subpath ?? ""),
				landOn: landOn ?? this.queuedReload?.landOn ?? null,
			};
			return;
		}
		const seq = ++this.loadSeq;
		const focus = this.focusPath;
		this.emptyEl?.toggleClass("is-hidden", focus !== null);
		if (focus === null) {
			this.horizon = null;
			this.model = null;
			this.fullModel = null;
			this.syncHolds(new Set());
			scene.setData({ nodes: [], edges: [] }, new Map());
			return;
		}

		const { metadataCache, vault } = this.app;
		this.adjacency ??= noteAdjacency(metadataCache.resolvedLinks);
		const resolve: LinkResolver = (linkpath, sourcePath) => metadataCache.getFirstLinkpathDest(decodeEmbedTarget(linkpath), sourcePath)?.path ?? null;
		const readNote = async (path: string): Promise<NoteInput | null> => {
			const file = vault.getFileByPath(path);
			if (!(file instanceof TFile)) return null;
			try {
				const prefetched = this.prefetched.get(path);
				const markdown = prefetched?.mtime === file.stat.mtime ? prefetched.text : await vault.cachedRead(file);
				return { tree: this.cache.get(path, markdown), cache: metadataCache.getFileCache(file) };
			} catch (error) {
				console.error(`Osmosis: 3D graph could not read ${path}`, error);
				return null;
			}
		};
		let horizon: Horizon;
		let notes: (NoteInput | null)[];
		if (this.depth === 0) {
			// The focus note and what it transcludes (and, with Backlinks, the notes linking to it): its own links load nothing, so only the linked notes' text is read ahead.
			const base = computeHorizon(this.adjacency, focus, 0, false);
			const focusNote = await readNote(focus);
			const embedded = focusNote === null ? null : await collectEmbedded(focusNote, readNote, resolve);
			horizon = embedded === null ? base : withEmbedded(base, embedded.hops, embedded.via);
			notes = embedded?.notes ?? [];
			if (this.backlinks) {
				// "What links here": whole notes, one hop from the focus. An embedded one is already in `notes`, in the part its embed shows.
				horizon = withBacklinkers(horizon, this.adjacency);
				const have = new Set(notes.flatMap((note) => (note === null ? [] : [note.tree.filePath])));
				const linking = await Promise.all([...horizon.loaded].filter((path) => !have.has(path)).map(readNote));
				notes = [...notes, ...linking.filter((note): note is NoteInput => note !== null)];
			}
		} else {
			horizon = computeHorizon(this.adjacency, focus, this.depth, this.backlinks);
			notes = await Promise.all([...horizon.loaded].map(readNote));
		}
		// A newer reload (another hop, an edit) started while these were read.
		if (seq !== this.loadSeq) return;

		const { edges } = this.plugin().settings.graph3dOverlays;
		this.modelShown = modelKey(edges);
		const fullModel = buildGraph(
			notes.filter((note): note is NoteInput => note !== null),
			resolve,
			{ contentOnly: this.depth === 0, globalClasses: this.plugin().settings.globalClasses },
		);
		const model = visibleModel(fullModel, edges);
		// An edit that added, deleted, moved or re-levelled a line makes room for its new shape; rewording one does not.
		const reshaped = this.editLanded && this.model !== null && outlineChanged(this.model, model);
		this.editLanded = false;
		this.horizon = horizon;
		this.model = model;
		this.fullModel = fullModel;
		scene.setColoring(this.coloring(model));
		this.syncHolds(horizon.loaded);
		// Once, after the mind map's toggle: its nodes start flat where it drew them, free, and the camera looks at them from where the map did.
		const liftOff = this.liftOff;
		this.liftOff = null;
		const seeds = liftOff === null ? undefined : liftOffSeeds(model, liftOff, scene.linePlateHeight);
		if (this.faceFocus) {
			this.faceFocus = false;
			// The lift-off camera stands over the map looking down -z, on the +z side of the notes.
			scene.faceNote(noteNodeId(focus), liftOff === null ? null : facingPhase({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 0 }));
		}
		scene.setData(this.study?.decorate(model) ?? model, this.place(scene, model, horizon.via, seeds));
		if (this.resettleOnLoad) {
			this.resettleOnLoad = false;
			scene.reshape(!this.focusLeft(scene, model));
		}
		if (liftOff !== null) {
			const focusId = liftOffFocus(model, liftOff) ?? noteNodeId(focus);
			scene.setFocusId(focusId);
			scene.standOver({ x: 0, y: 0, z: 0 }, liftOffFrame(liftOff, scene.linePlateHeight), focusId);
		} else if (landOn !== null) {
			const ids = new Set(model.nodes.map((node) => node.id));
			scene.flyTo(landing((id) => ids.has(id), focus, landOn), true);
		} else if (flyToFocus) scene.flyTo(linkTargetNode(model, focus, subpath) ?? noteNodeId(focus), true);
		this.openPending(scene, model);
		// After the new line is seeded beside its parent, so the camera tracks it from there.
		if (reshaped) scene.reshape(true, true);
		this.prefetch(horizon.prefetch, seq);
	}

	/** Whether the scene's focused plate is not in `model` (a tag hub or ghost an Overlays toggle just took away): the camera stays where it is. */
	private focusLeft(scene: Graph3DScene, model: GraphModel): boolean {
		const focus = scene.focusedNode();
		return focus !== null && !model.nodes.some((node) => node.id === focus.id);
	}

	/** A structural edit made a new empty line: now that it is in the scene, clear of its parent, edit it. */
	private openPending(scene: Graph3DScene, model: GraphModel): void {
		const pending = this.pendingEdit;
		this.pendingEdit = null;
		if (pending === null) return;
		const id = lineNodeAt(model, pending.path, pending.start);
		const node = id === null ? undefined : model.nodes.find((n) => n.id === id);
		if (node === undefined) return;
		scene.seedClear(node.id);
		this.beginEdit(node);
	}

	/**
	 * Read ahead the notes one hop past the loaded area, and forget the ones
	 * that no longer are. Only the text: parsing waits until a hop loads them.
	 */
	private prefetch(ring: ReadonlySet<string>, seq: number): void {
		for (const path of this.prefetched.keys()) if (!ring.has(path)) this.prefetched.delete(path);
		for (const path of ring) {
			const file = this.app.vault.getFileByPath(path);
			if (file === null || this.prefetched.get(path)?.mtime === file.stat.mtime) continue;
			// Taken before the read, so an edit made during it shows as stale.
			const mtime = file.stat.mtime;
			this.app.vault.cachedRead(file).then(
				(text) => {
					if (seq === this.loadSeq) this.prefetched.set(path, { mtime, text });
				},
				// The hop that needs this note will read it, and report a failure, itself.
				() => undefined,
			);
		}
	}

	/**
	 * Theme colours as the engine needs them: resolved `rgb()` strings. Reading
	 * the variables directly can yield any CSS colour syntax a theme likes, so a
	 * probe element lets the browser resolve them.
	 */
	private readTheme(): SceneTheme {
		const probe = this.contentEl.createDiv({ cls: "osmosis-graph3d-probe" });
		const style = getComputedStyle(probe);
		const theme = { background: style.backgroundColor, text: style.color, plate: style.borderTopColor, font: style.fontFamily, accent: style.borderBottomColor };
		probe.remove();
		return theme;
	}
}
