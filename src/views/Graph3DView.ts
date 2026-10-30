import { ItemView, Platform, Scope, SliderComponent, TFile, debounce, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import { ParseCache } from "../cache";
import { decodeEmbedTarget } from "../card-gen/occlusion";
import { buildGraph, noteNodeId, type GraphNode, type NoteInput } from "../graph3d/model";
import { computeHorizon, noteAdjacency, type Horizon, type NoteAdjacency } from "../graph3d/horizon";
import { placeNodes } from "../graph3d/positions";
import type OsmosisPlugin from "../main";
import type { Graph3DScene, SceneControls, SceneTheme } from "./Graph3DScene";

export const VIEW_TYPE_GRAPH3D = "osmosis-graph3d";

export const GRAPH3D_DEFAULT_DEPTH = 2;
/** Each hop multiplies the loaded area, so phones get a shallower ceiling. */
const MAX_DEPTH = Platform.isMobile ? 3 : 5;
const FLIGHT_KEYS = ["w", "a", "s", "d", "q", "e"];

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
	private focusPath: string | null = null;
	private depth = GRAPH3D_DEFAULT_DEPTH;
	private follow = false;
	private loadSeq = 0;
	private followActionEl: HTMLElement | null = null;
	private depthSlider: SliderComponent | null = null;
	private stageEl: HTMLElement | null = null;
	private emptyEl: HTMLElement | null = null;
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
				if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return undefined;
				this.scene?.heldKeys.add(key);
				return false;
			});
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
		state.follow = this.follow;
		return state;
	}

	async setState(state: Record<string, unknown>, result: ViewStateResult): Promise<void> {
		if (typeof state?.focus === "string") this.focusPath = state.focus;
		if (typeof state?.depth === "number") this.depth = Math.min(MAX_DEPTH, Math.max(1, Math.round(state.depth)));
		if (typeof state?.follow === "boolean") this.follow = state.follow;
		this.depthSlider?.setValue(this.depth);
		this.followActionEl?.toggleClass("is-active", this.follow);
		this.updateHeader();
		await super.setState(state, result);
		await this.reload(true);
	}

	async onOpen(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass("osmosis-graph3d");

		const header = root.createDiv({ cls: "osmosis-graph3d-header" });
		header.createSpan({ cls: "osmosis-graph3d-header-label", text: "Depth" });
		this.depthSlider = new SliderComponent(header)
			.setLimits(1, MAX_DEPTH, 1)
			.setValue(this.depth)
			.onChange((value) => {
				this.depth = value;
				this.app.workspace.requestSaveLayout();
				void this.reload();
			});

		this.followActionEl = this.addAction("locate-fixed", "Follow active note", () => this.toggleFollow());
		this.followActionEl.toggleClass("is-active", this.follow);

		this.emptyEl = root.createDiv({
			cls: "osmosis-graph3d-empty",
			text: "Open a note and run \"Open 3D graph for current note\".",
		});
		this.stageEl = root.createDiv({ cls: "osmosis-graph3d-stage" });

		const { Graph3DScene } = await import("./Graph3DScene");
		// The view may have closed while the engine module loaded.
		if (this.stageEl === null) return;
		this.scene = new Graph3DScene(this.stageEl, {
			isMobile: Platform.isMobile,
			controls: this.controlSettings(),
			onNodeClick: (node) => this.hop(node),
		});
		this.scene.setTheme(this.readTheme());
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
				this.setFocus(file.path, true);
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
		this.scheduleReload.cancel();
		this.loadSeq++;
		this.scene?.destroy();
		this.scene = null;
		this.stageEl = null;
		this.cache.clear();
		this.prefetched.clear();
	}

	/** Re-read the navigation settings, after they change in Osmosis settings. */
	applyControlSettings(): void {
		this.scene?.setControls(this.controlSettings());
	}

	private controlSettings(): SceneControls {
		const { settings } = this.app.plugins.plugins["osmosis"] as OsmosisPlugin;
		return { desktopPivot: settings.graph3dDesktopPivot, touchDrag: settings.graph3dOneFingerDrag };
	}

	private toggleFollow(): void {
		this.follow = !this.follow;
		this.followActionEl?.toggleClass("is-active", this.follow);
		this.app.workspace.requestSaveLayout();
		const file = this.app.workspace.getActiveFile();
		if (this.follow && file?.extension === "md" && file.path !== this.focusPath) this.setFocus(file.path, true);
	}

	/** Click or tap: fly to the node, and recentre the loaded area on its note. */
	private hop(node: GraphNode): void {
		this.scene?.flyTo(node.id);
		// Tags, attachments and ghosts are destinations, never hops.
		if ((node.kind === "note" || node.kind === "line") && node.path !== undefined && node.path !== this.focusPath) {
			this.setFocus(node.path, false);
		}
	}

	private setFocus(path: string, flyToCore: boolean): void {
		this.focusPath = path;
		this.updateHeader();
		this.app.workspace.requestSaveLayout();
		void this.reload(flyToCore);
	}

	private updateHeader(): void {
		// updateHeader() refreshes the tab title; not in public typings
		(this.leaf as unknown as { updateHeader(): void }).updateHeader();
	}

	/**
	 * Recompute the horizon from the focus and show every loaded note. With
	 * `flyToFocus`, the camera then stands at the focus note's core: the
	 * engine's default framing is far enough out that the mist hides most of
	 * the loaded area.
	 */
	private async reload(flyToFocus = false): Promise<void> {
		const seq = ++this.loadSeq;
		const scene = this.scene;
		if (scene === null) return;
		const focus = this.focusPath;
		this.emptyEl?.toggleClass("is-hidden", focus !== null);
		if (focus === null) {
			this.horizon = null;
			scene.setData({ nodes: [], edges: [] }, new Map());
			return;
		}

		const { metadataCache, vault } = this.app;
		this.adjacency ??= noteAdjacency(metadataCache.resolvedLinks);
		const horizon = computeHorizon(this.adjacency, focus, this.depth);
		const notes = await Promise.all(
			[...horizon.loaded].map(async (path): Promise<NoteInput | null> => {
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
			}),
		);
		// A newer reload (another hop, an edit) started while these were read.
		if (seq !== this.loadSeq) return;

		const model = buildGraph(
			notes.filter((note): note is NoteInput => note !== null),
			(linkpath, sourcePath) => metadataCache.getFirstLinkpathDest(decodeEmbedTarget(linkpath), sourcePath)?.path ?? null,
		);
		this.horizon = horizon;
		scene.setData(model, placeNodes(model, scene.positions(), horizon.via));
		if (flyToFocus) scene.flyTo(noteNodeId(focus), true);
		this.prefetch(horizon.prefetch, seq);
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
		const background = getComputedStyle(probe).backgroundColor;
		const text = getComputedStyle(probe).color;
		probe.remove();
		return { background, text };
	}
}
