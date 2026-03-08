import {
	ItemView,
	WorkspaceLeaf,
	TFile,
	MarkdownView,
	MarkdownRenderer,
	Component,
	Platform,
	Scope,
} from "obsidian";
import { ParseCache } from "../cache";
import { OsmosisParser } from "../parser";
import { OsmosisNode, OsmosisTree } from "../types";
import {
	computeLayout,
	LayoutNode,
	LayoutResult,
	DEFAULT_LAYOUT_CONFIG,
} from "../layout";
import type OsmosisPlugin from "../main";
import type { BranchLineStyle, MapSettings } from "../settings";
import { DEFAULT_MAP_SETTINGS } from "../settings";
import { TransclusionResolver } from "../transclusion";
import { getTheme, isDefaultTheme } from "../themes";
import { resolveNodeStyle } from "../styles";
import type { ThemeDefinition } from "../styles";
import { createShapeElement, getShapeInsets } from "../shapes";
import { ToolRibbon } from "./ToolRibbon";
import {
	EmbeddableMarkdownEditor,
	autoResizeExtension,
} from "../editor/EmbeddableMarkdownEditor";
// eslint-disable-next-line import/no-extraneous-dependencies
import { EditorSelection } from "@codemirror/state";

export const VIEW_TYPE_MINDMAP = "osmosis-mindmap";

const SVG_NS = "http://www.w3.org/2000/svg";
const XHTML_NS = "http://www.w3.org/1999/xhtml";

// Viewport constants
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const ZOOM_SENSITIVITY = 0.002;
const SCROLL_SENSITIVITY = 1;
const LAYOUT_PADDING = 50;

// Animation constants
const COLLAPSE_ANIMATION_MS = 80;

// Drag constants
const DRAG_THRESHOLD = 5; // pixels before drag starts

// Touch constants
const LONG_PRESS_MS = 400; // ms before touch-on-node becomes drag
const DOUBLE_TAP_MS = 300; // max ms between taps for double-tap
const DOUBLE_TAP_DISTANCE = 20; // max px drift between two taps

// Viewport culling constants
const CULL_MARGIN = 200; // extra pixels around viewport to pre-render

export class MindMapView extends ItemView {
	private cache = new ParseCache();
	private transclusionResolver: TransclusionResolver;
	private currentFile: TFile | null = null;
	private currentTree: OsmosisTree | null = null;
	private renderComponent: Component | null = null;
	plugin: OsmosisPlugin;

	// Per-map settings (resolved from defaults + per-note overrides)
	private mapSettings: MapSettings = { ...DEFAULT_MAP_SETTINGS };
	private activeTheme: ThemeDefinition | undefined;

	// Viewport state
	private viewBox = { x: 0, y: 0, w: 800, h: 600 };
	private zoom = 1;
	private isPanning = false;
	private panStart = { x: 0, y: 0 };
	private svg: SVGSVGElement | null = null;

	// Collapse state
	private collapsedIds = new Set<string>();
	/** Transclusion nodes deferred for lazy loading (not yet parsed/expanded). */
	private lazyTransclusionIds = new Set<string>();
	private currentLayout: LayoutResult | null = null;

	// Selection state
	private selectedNodeId: string | null = null;
	private selectedNodeIds = new Set<string>();
	private nodeMap = new Map<string, LayoutNode>();

	// Rubber-band selection state
	private isRubberBanding = false;
	private rubberBandStart = { x: 0, y: 0 };
	private rubberBandRect: SVGRectElement | null = null;

	// Editing state
	private editingNodeId: string | null = null;
	private editContainer: HTMLDivElement | null = null;
	private editEditor: EmbeddableMarkdownEditor | null = null;
	private editCleanup: (() => void) | null = null;

	// Sync state: when true, skip the next vault.modify reload to prevent flicker
	private suppressNextReload = false;

	// Clipboard state for copy/cut/paste
	private clipboardText: string | null = null;
	private clipboardNodeType: OsmosisNode["type"] | null = null;
	private clipboardNodeDepth: number | null = null;
	private clipboardIsCut = false;
	private clipboardSourceIds: Set<string> = new Set();

	// Drag-and-drop state
	private dragNodeId: string | null = null;
	private dragStartScreen = { x: 0, y: 0 };
	private isDragging = false;
	private dragGhost: SVGGElement | null = null;
	private dropIndicator: SVGLineElement | null = null;
	private dropTarget: { parentId: string; index: number } | null = null;

	// Cursor sync state
	private parser = new OsmosisParser();
	private cursorSyncNodeId: string | null = null;
	private cursorSyncTimer: ReturnType<typeof setTimeout> | null = null;
	private suppressCursorSync = false;

	// Node size measurement cache (keyed by display content string)
	private nodeSizeCache = new Map<
		string,
		{ width: number; height: number }
	>();
	// Rendered HTML cache: avoids repeated MarkdownRenderer.render() calls for
	// nodes whose content hasn't changed (keyed by display content string)
	private nodeHtmlCache = new Map<string, HTMLElement>();

	// Viewport culling state
	private renderedNodeIds = new Set<string>();
	private cullRafId: number | null = null;
	private branchLinesGroup: SVGGElement | null = null;
	private nodesGroup: SVGGElement | null = null;

	// Touch/pointer state
	private activePointers = new Map<number, { x: number; y: number }>();
	private longPressTimer: ReturnType<typeof setTimeout> | null = null;
	private longPressTriggered = false;
	private lastTapTime = 0;
	private lastTapPosition = { x: 0, y: 0 };
	private lastTapNodeId: string | null = null;
	private pinchStartDistance: number | null = null;
	private pinchStartZoom = 1;
	private pinchCenter = { x: 0, y: 0 };
	private lastPointerType = "mouse";
	private touchSelectionMode = false;
	private resizeObserver: ResizeObserver | null = null;
	private toolRibbon: ToolRibbon | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		this.navigation = true;
		this.icon = "git-fork";
		this.plugin = (
			this.app as unknown as {
				plugins: { plugins: Record<string, OsmosisPlugin> };
			}
		).plugins.plugins["osmosis"] as OsmosisPlugin;
		this.transclusionResolver = new TransclusionResolver(
			this.app,
			this.cache,
		);

		// Register a scope so Obsidian routes key events to this view when focused,
		// preventing global hotkeys (like F2 = "rename file") from intercepting them.
		this.scope = new Scope(this.app.scope);
		this.scope.register([], "F2", (e: KeyboardEvent) => {
			if (!this.editingNodeId && this.selectedNodeId) {
				this.startEditing(this.selectedNodeId);
				e.preventDefault();
				return false;
			}
			return undefined;
		});

		// Register Ctrl/Cmd combos that Obsidian would otherwise intercept
		for (const key of ["d", "c", "x", "v", "z", "y", "Enter"]) {
			this.scope.register(["Mod"], key, (e: KeyboardEvent) => {
				this.handleKeyDown(e);
				return false;
			});
		}
		for (const key of ["[", "]", "z"]) {
			this.scope.register(["Mod", "Shift"], key, (e: KeyboardEvent) => {
				this.handleKeyDown(e);
				return false;
			});
		}
		for (const key of ["[", "]"]) {
			this.scope.register(["Mod"], key, (e: KeyboardEvent) => {
				this.handleKeyDown(e);
				return false;
			});
		}
	}

	getViewType(): string {
		return VIEW_TYPE_MINDMAP;
	}

	getDisplayText(): string {
		return this.currentFile
			? `Mind Map: ${this.currentFile.basename}`
			: "Mind Map";
	}

	async onOpen(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass("osmosis-mindmap-container");
		container.setAttribute("tabindex", "0");

		// All interaction handlers on the container (HTMLElement)
		this.registerDomEvent(container, "keydown", (e: KeyboardEvent) => {
			this.handleKeyDown(e);
		});
		this.registerDomEvent(container, "pointerdown", this.handlePointerDown);
		this.registerDomEvent(container, "pointermove", this.handlePointerMove);
		this.registerDomEvent(container, "pointerup", this.handlePointerUp);
		this.registerDomEvent(
			container,
			"pointercancel",
			this.handlePointerCancel,
		);
		this.registerDomEvent(
			container,
			"pointerleave",
			this.handlePointerLeave,
		);
		this.registerDomEvent(container, "wheel", this.handleWheel, {
			passive: false,
		});
		this.registerDomEvent(container, "click", this.handleClick);
		this.registerDomEvent(container, "dblclick", this.handleDblClick);

		// Block touch events from reaching Obsidian's gesture handlers (drawer swipes,
		// command palette pull-down). Pointer events and touch events are separate
		// streams — stopPropagation on pointer events does not affect touch events.
		this.registerDomEvent(
			container,
			"touchstart",
			this.handleTouchCapture,
			{ passive: false } as AddEventListenerOptions,
		);
		this.registerDomEvent(container, "touchmove", this.handleTouchCapture, {
			passive: false,
		} as AddEventListenerOptions);
		this.registerDomEvent(
			container,
			"touchend",
			this.handleTouchCapture as EventListener,
		);

		// Respond to container resize (e.g. mobile keyboard opening) by updating viewBox
		this.resizeObserver = new ResizeObserver(() =>
			this.handleContainerResize(),
		);
		this.resizeObserver.observe(container);

		// Create the tool ribbon (action bar)
		this.toolRibbon = new ToolRibbon(container, {
			fitToView: () => this.fitToView(),
			zoomIn: () => this.zoomStep(1.25),
			zoomOut: () => this.zoomStep(1 / 1.25),
			centerOnRoot: () => this.centerOnRoot(),
			foldAll: () => this.foldAll(),
			unfoldAll: () => this.unfoldAll(),
			addSibling: () => {
				const node = this.selectedNodeId
					? this.nodeMap.get(this.selectedNodeId)
					: null;
				if (node) void this.addSiblingNode(node);
			},
			addChild: () => {
				const node = this.selectedNodeId
					? this.nodeMap.get(this.selectedNodeId)
					: null;
				if (node) void this.addChildNode(node);
			},
			insertParent: () => {
				const node = this.selectedNodeId
					? this.nodeMap.get(this.selectedNodeId)
					: null;
				if (node) void this.insertParentNode(node);
			},
			moveUp: () => void this.moveNodeUpDown(-1),
			moveDown: () => void this.moveNodeUpDown(1),
			indent: () => void this.indentNode(),
			outdent: () => void this.outdentNode(),
			deleteNode: () => {
				if (this.selectedNodeIds.size > 1) {
					void this.deleteSelectedNodes();
				} else if (this.selectedNodeId) {
					const node = this.nodeMap.get(this.selectedNodeId);
					if (node) void this.deleteNode(node);
				}
			},
			copy: () => void this.copySelectedNodes(false),
			cut: () => void this.copySelectedNodes(true),
			paste: () => void this.pasteNodes(),
			undo: () => this.forwardUndoRedo(false),
			redo: () => this.forwardUndoRedo(true),
		});

		await this.loadActiveFile();

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (leaf?.view instanceof MarkdownView) {
					void this.loadFile(leaf.view.file);
				}
			}),
		);

		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile && file === this.currentFile) {
					if (this.suppressNextReload) {
						this.suppressNextReload = false;
						return;
					}
					void this.loadFile(file);
				}
			}),
		);

		// Cursor sync: editor → map
		this.registerInterval(
			window.setInterval(() => this.syncEditorCursorToMap(), 150),
		);
	}

	async onClose(): Promise<void> {
		this.toolRibbon?.destroy();
		this.toolRibbon = null;
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.renderComponent?.unload();
		this.renderComponent = null;
		this.svg = null;
		this.branchLinesGroup = null;
		this.nodesGroup = null;
		this.renderedNodeIds.clear();
		this.cancelLongPress();
		this.activePointers.clear();
		this.pinchStartDistance = null;
		this.longPressTriggered = false;
		if (this.cullRafId !== null) {
			cancelAnimationFrame(this.cullRafId);
			this.cullRafId = null;
		}
		this.contentEl.empty();
		this.currentFile = null;
		this.currentTree = null;
		this.currentLayout = null;
		this.nodeMap.clear();
		this.selectedNodeIds.clear();
		this.cursorSyncNodeId = null;
		this.rubberBandRect?.remove();
		this.rubberBandRect = null;
		if (this.cursorSyncTimer) {
			clearTimeout(this.cursorSyncTimer);
			this.cursorSyncTimer = null;
		}
		this.cleanupDrag();
	}

	private async loadActiveFile(): Promise<void> {
		const activeLeaf = this.app.workspace.getMostRecentLeaf();
		if (activeLeaf?.view instanceof MarkdownView && activeLeaf.view.file) {
			await this.loadFile(activeLeaf.view.file);
		}
	}

	private async loadFile(file: TFile | null): Promise<void> {
		if (!file || file.extension !== "md") return;
		// Don't reload/re-render while inline editing is active — focus changes
		// (e.g. input on document.body) can trigger active-leaf-change which
		// would destroy the SVG mid-edit.
		if (this.editingNodeId) return;

		// Clear caches when switching to a different file
		if (file !== this.currentFile) {
			this.nodeSizeCache.clear();
			this.nodeHtmlCache.clear();
		}
		this.currentFile = file;
		this.loadMapSettings();
		const content = await this.app.vault.read(file);
		this.currentTree = this.cache.get(file.path, content);

		// Lazy loading: auto-collapse transclusion nodes so they're deferred
		this.lazyTransclusionIds.clear();
		this.collectTransclusionIds(
			this.currentTree.root,
			this.lazyTransclusionIds,
		);
		for (const id of this.lazyTransclusionIds) {
			this.collapsedIds.add(id);
		}

		// Resolve and expand transclusion links (skip lazy/collapsed ones)
		await this.transclusionResolver.expandTree(
			this.currentTree,
			this.lazyTransclusionIds,
		);

		await this.render();
	}

	/** Returns the current file's path, used by the properties sidebar. */
	getCurrentFilePath(): string | null {
		return this.currentFile?.path ?? null;
	}

	/** Apply per-map settings from the properties sidebar and re-render. */
	applyMapSettings(settings: MapSettings): void {
		// Clear size cache when theme or shape changes (affects measurement)
		if (settings.theme !== this.mapSettings.theme ||
			settings.topicShape !== this.mapSettings.topicShape) {
			this.nodeSizeCache.clear();
		}
		this.mapSettings = { ...settings };
		void this.render();
	}

	/** Load per-note map settings from plugin data, merging with defaults. */
	private loadMapSettings(): void {
		const path = this.currentFile?.path;
		if (!path) {
			this.mapSettings = { ...DEFAULT_MAP_SETTINGS };
			return;
		}
		const overrides = this.plugin?.settings?.mapSettings?.[path] ?? {};
		this.mapSettings = { ...DEFAULT_MAP_SETTINGS, ...overrides };
	}

	// ─── Viewport ────────────────────────────────────────────

	private updateViewBox(): void {
		if (!this.svg) return;
		const { x, y, w, h } = this.viewBox;
		this.svg.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
		this.scheduleCullUpdate();
	}

	/** Notify the toolbar of current selection/editing state. */
	private updateToolbarState(): void {
		this.toolRibbon?.updateState({
			hasSelection: this.selectedNodeId !== null,
			isEditing: this.editingNodeId !== null,
			hasFile: this.currentFile !== null,
		});
	}

	/** Fit the entire mind map into the visible viewport with padding. */
	private fitToView(): void {
		if (!this.currentLayout) return;
		const bounds = this.currentLayout.bounds;
		const contentWidth = bounds.width + LAYOUT_PADDING * 2;
		const contentHeight = bounds.height + LAYOUT_PADDING * 2;

		const containerRect = this.contentEl.getBoundingClientRect();
		const cw = containerRect.width || contentWidth;
		const ch = containerRect.height || contentHeight;

		const zoom = Math.min(cw / contentWidth, ch / contentHeight, MAX_ZOOM);
		this.zoom = Math.max(MIN_ZOOM, zoom);

		const scaledW = cw / this.zoom;
		const scaledH = ch / this.zoom;
		this.viewBox.x = (contentWidth - scaledW) / 2;
		this.viewBox.y = (contentHeight - scaledH) / 2;
		this.viewBox.w = scaledW;
		this.viewBox.h = scaledH;
		this.updateViewBox();
	}

	/** Step zoom by a multiplier, centered on the viewport center. */
	private zoomStep(factor: number): void {
		const newZoom = Math.max(
			MIN_ZOOM,
			Math.min(MAX_ZOOM, this.zoom * factor),
		);
		const scale = this.zoom / newZoom;
		const cx = this.viewBox.x + this.viewBox.w / 2;
		const cy = this.viewBox.y + this.viewBox.h / 2;
		this.viewBox.w *= scale;
		this.viewBox.h *= scale;
		this.viewBox.x = cx - this.viewBox.w / 2;
		this.viewBox.y = cy - this.viewBox.h / 2;
		this.zoom = newZoom;
		this.updateViewBox();
	}

	/** Center the viewport on the root node. */
	private centerOnRoot(): void {
		if (!this.currentLayout) return;
		const root = this.currentLayout.root;
		// Root node is virtual; center on its first child if possible
		const target = root.children.length > 0 ? root.children[0] : null;
		if (!target) return;

		const offsetX = this.getOffsetX();
		const offsetY = this.getOffsetY();
		const nx = target.rect.x + offsetX + target.rect.width / 2;
		const ny = target.rect.y + offsetY + target.rect.height / 2;
		this.viewBox.x = nx - this.viewBox.w / 2;
		this.viewBox.y = ny - this.viewBox.h / 2;
		this.updateViewBox();
	}

	/** Check if a node (in SVG coords with offset applied) intersects the expanded viewport */
	private isNodeInViewport(
		node: LayoutNode,
		offsetX: number,
		offsetY: number,
	): boolean {
		const nx = node.rect.x + offsetX;
		const ny = node.rect.y + offsetY;
		const nw = node.rect.width;
		const nh = node.rect.height;

		const vx = this.viewBox.x - CULL_MARGIN;
		const vy = this.viewBox.y - CULL_MARGIN;
		const vw = this.viewBox.w + CULL_MARGIN * 2;
		const vh = this.viewBox.h + CULL_MARGIN * 2;

		return nx + nw > vx && nx < vx + vw && ny + nh > vy && ny < vy + vh;
	}

	/** Check if a branch line (between parent and child) intersects the expanded viewport */
	private isBranchInViewport(
		parent: LayoutNode,
		child: LayoutNode,
		offsetX: number,
		offsetY: number,
	): boolean {
		// Use bounding box of the two connection points
		const cx = child.rect.x + offsetX;
		const cy = child.rect.y + child.rect.height / 2 + offsetY;
		let px: number, py: number;
		if (parent.source.type === "root") {
			const stubLength = DEFAULT_LAYOUT_CONFIG.horizontalSpacing / 2;
			px = cx - stubLength;
			py = cy;
		} else {
			px = parent.rect.x + parent.rect.width + offsetX;
			py = parent.rect.y + parent.rect.height / 2 + offsetY;
		}
		const minX = Math.min(px, cx);
		const minY = Math.min(py, cy);
		const maxX = Math.max(px, cx);
		const maxY = Math.max(py, cy);

		const vx = this.viewBox.x - CULL_MARGIN;
		const vy = this.viewBox.y - CULL_MARGIN;
		const vw = this.viewBox.w + CULL_MARGIN * 2;
		const vh = this.viewBox.h + CULL_MARGIN * 2;

		return maxX > vx && minX < vx + vw && maxY > vy && minY < vy + vh;
	}

	/** Schedule a viewport cull update on the next animation frame */
	private scheduleCullUpdate(): void {
		if (this.cullRafId !== null) return;
		this.cullRafId = requestAnimationFrame(() => {
			this.cullRafId = null;
			void this.updateVisibleNodes();
		});
	}

	/** Add/remove DOM nodes based on current viewport */
	private async updateVisibleNodes(): Promise<void> {
		if (
			!this.svg ||
			!this.currentLayout ||
			!this.nodesGroup ||
			!this.branchLinesGroup
		)
			return;

		const { nodes } = this.currentLayout;
		const offsetX = this.getOffsetX();
		const offsetY = this.getOffsetY();
		const lineStyle = this.mapSettings.branchLineStyle;

		const nowVisible = new Set<string>();
		for (const node of nodes) {
			if (node.source.type === "root") continue;
			if (
				this.isNodeInViewport(node, offsetX, offsetY) ||
				node.source.id === this.editingNodeId
			) {
				nowVisible.add(node.source.id);
			}
		}

		// Remove nodes that left the viewport (but never cull the node being edited)
		for (const id of this.renderedNodeIds) {
			if (!nowVisible.has(id) && id !== this.editingNodeId) {
				// Remove node group
				const el = this.nodesGroup.querySelector(
					`.osmosis-node-group[data-node-id="${id}"]`,
				);
				el?.remove();
				// Remove branch line
				const line = this.branchLinesGroup.querySelector(
					`.osmosis-branch-line[data-child-id="${id}"]`,
				);
				line?.remove();
			}
		}

		// Add nodes that entered the viewport
		const renderPromises: Promise<void>[] = [];
		for (const node of nodes) {
			if (node.source.type === "root") continue;
			const id = node.source.id;
			if (nowVisible.has(id) && !this.renderedNodeIds.has(id)) {
				renderPromises.push(
					this.drawNode(this.nodesGroup, node, offsetX, offsetY),
				);
				// Draw branch line whenever the child node is visible
				if (node.parent) {
					this.drawBranchLine(
						this.branchLinesGroup,
						node.parent,
						node,
						offsetX,
						offsetY,
						lineStyle,
					);
				}
			}
		}
		await Promise.all(renderPromises);

		this.renderedNodeIds = nowVisible;
	}

	private screenToSvg(
		clientX: number,
		clientY: number,
	): { x: number; y: number } {
		if (!this.svg) return { x: 0, y: 0 };
		const ctm = this.svg.getScreenCTM();
		if (!ctm) return { x: 0, y: 0 };
		const inv = ctm.inverse();
		return {
			x: inv.a * clientX + inv.c * clientY + inv.e,
			y: inv.b * clientX + inv.d * clientY + inv.f,
		};
	}

	// ─── Pointer event handlers (unified mouse + touch) ─────

	private handlePointerDown = (e: PointerEvent): void => {
		this.lastPointerType = e.pointerType;
		this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

		// Two+ pointers = pinch gesture — cancel any single-finger state
		if (this.activePointers.size >= 2) {
			this.cancelLongPress();
			this.dragNodeId = null;
			this.isPanning = false;
			this.initPinch();
			e.preventDefault();
			e.stopPropagation();
			return;
		}

		if (e.button !== 0 && e.button !== 1) return;

		const nodeId = this.getClickedNodeId(e);

		// Touch: double-tap detection
		if (e.pointerType === "touch") {
			const now = Date.now();
			const dx = e.clientX - this.lastTapPosition.x;
			const dy = e.clientY - this.lastTapPosition.y;
			const dist = Math.sqrt(dx * dx + dy * dy);

			if (
				now - this.lastTapTime < DOUBLE_TAP_MS &&
				dist < DOUBLE_TAP_DISTANCE &&
				nodeId &&
				nodeId === this.lastTapNodeId
			) {
				this.cancelLongPress();
				this.startEditing(nodeId);
				e.preventDefault();
				e.stopPropagation();
				return;
			}
		}

		// Left-click / touch on a node: prepare for potential drag
		if (e.button === 0 && nodeId && !this.editingNodeId) {
			const target = e.target as Element;
			if (target.closest(".osmosis-collapse-toggle")) return;

			this.dragNodeId = nodeId;
			this.dragStartScreen = { x: e.clientX, y: e.clientY };

			// Touch: start long-press timer for selection mode + potential drag
			if (e.pointerType === "touch") {
				this.longPressTriggered = false;
				this.longPressTimer = setTimeout(() => {
					this.longPressTriggered = true;
					// Enter touch selection mode and select this node
					this.touchSelectionMode = true;
					if (this.dragNodeId) {
						this.toggleNodeInSelection(this.dragNodeId);
					}
					if (navigator.vibrate) navigator.vibrate(50);
				}, LONG_PRESS_MS);
				e.preventDefault();
				e.stopPropagation();
			}
			// Mouse: don't preventDefault — it would suppress click/dblclick events
			return;
		}

		// Shift+left-click on background: rubber-band (mouse only)
		if (
			e.button === 0 &&
			!nodeId &&
			e.shiftKey &&
			e.pointerType !== "touch"
		) {
			const svgPt = this.screenToSvg(e.clientX, e.clientY);
			this.isRubberBanding = true;
			this.rubberBandStart = svgPt;
			e.preventDefault();
			e.stopPropagation();
			return;
		}

		// Middle-click or left-click/touch on background: pan
		if (e.button === 1 || (e.button === 0 && !nodeId)) {
			this.isPanning = true;
			this.panStart = { x: e.clientX, y: e.clientY };
			e.preventDefault();
			e.stopPropagation();
		}
	};

	private handlePointerMove = (e: PointerEvent): void => {
		if (this.activePointers.has(e.pointerId)) {
			this.activePointers.set(e.pointerId, {
				x: e.clientX,
				y: e.clientY,
			});
		}

		// Pinch zoom (2+ pointers)
		if (this.activePointers.size >= 2 && this.pinchStartDistance !== null) {
			e.preventDefault();
			e.stopPropagation();
			this.updatePinch();
			return;
		}

		// Rubber-band selection
		if (this.isRubberBanding && this.svg) {
			e.stopPropagation();
			this.updateRubberBand(e);
			return;
		}

		// Check for drag threshold
		if (this.dragNodeId && !this.isDragging) {
			const dx = e.clientX - this.dragStartScreen.x;
			const dy = e.clientY - this.dragStartScreen.y;
			const dist = Math.sqrt(dx * dx + dy * dy);

			if (e.pointerType === "touch") {
				// Movement cancels long-press; if not triggered, convert to pan
				if (dist >= DRAG_THRESHOLD) {
					this.cancelLongPress();
					if (!this.longPressTriggered) {
						this.dragNodeId = null;
						this.isPanning = true;
						this.panStart = { x: e.clientX, y: e.clientY };
					} else {
						// Long-press triggered + movement → start drag
						this.startDrag(this.dragNodeId);
					}
					e.stopPropagation();
				}
			} else {
				if (dist >= DRAG_THRESHOLD) {
					this.startDrag(this.dragNodeId);
				}
			}
		}

		// Update drag position
		if (this.isDragging && this.svg) {
			e.stopPropagation();
			this.updateDrag(e);
			return;
		}

		if (!this.isPanning || !this.svg) return;

		e.stopPropagation();
		const svgCurrent = this.screenToSvg(e.clientX, e.clientY);
		const svgStart = this.screenToSvg(this.panStart.x, this.panStart.y);

		this.viewBox.x -= svgCurrent.x - svgStart.x;
		this.viewBox.y -= svgCurrent.y - svgStart.y;
		this.panStart = { x: e.clientX, y: e.clientY };

		this.updateViewBox();
	};

	private handlePointerUp = (e: PointerEvent): void => {
		this.activePointers.delete(e.pointerId);
		this.cancelLongPress();

		// Was pinching — if one finger lifts, transition to pan with remaining finger
		if (this.pinchStartDistance !== null) {
			this.pinchStartDistance = null;
			if (this.activePointers.size === 1) {
				const remaining = this.activePointers.values().next().value as {
					x: number;
					y: number;
				};
				this.isPanning = true;
				this.panStart = { x: remaining.x, y: remaining.y };
			}
			return;
		}

		if (this.isRubberBanding) {
			this.finishRubberBand();
			return;
		}

		if (this.isDragging) {
			void this.executeDrop();
			return;
		}

		// If we had a drag candidate but didn't reach threshold, treat as tap
		const wasDragCandidate = this.dragNodeId !== null;
		const dragCandidateId = this.dragNodeId;
		this.dragNodeId = null;
		this.isPanning = false;

		// Don't interfere with active editing (e.g. double-tap just started editing)
		if (e.pointerType === "touch" && this.editingNodeId) return;

		// Touch: synthesize tap
		if (e.pointerType === "touch") {
			if (
				wasDragCandidate &&
				!this.longPressTriggered &&
				dragCandidateId
			) {
				this.handleTouchTap(e, dragCandidateId);
			} else if (!wasDragCandidate) {
				const nodeId = this.getClickedNodeId(e);
				this.handleTouchTap(e, nodeId);
			}
			// Long-press triggered but no drag → already handled in timer (selection mode)
		}
	};

	private handlePointerCancel = (e: PointerEvent): void => {
		this.activePointers.delete(e.pointerId);
		this.cancelLongPress();
		if (this.activePointers.size === 0) {
			this.cleanupAllInteractions();
		}
	};

	private handlePointerLeave = (e: PointerEvent): void => {
		// For mouse: treat like pointerup (finish interactions)
		if (e.pointerType === "mouse") {
			this.activePointers.delete(e.pointerId);
			this.handlePointerUp(e);
		}
		// Touch: pointercancel handles cleanup instead
	};

	// ─── Touch gesture helpers ──────────────────────────────

	private handleTouchTap(e: PointerEvent, nodeId: string | null): void {
		if (!nodeId) {
			this.selectNode(null);
			this.touchSelectionMode = false;
			this.lastTapTime = Date.now();
			this.lastTapPosition = { x: e.clientX, y: e.clientY };
			this.lastTapNodeId = null;
			return;
		}

		// Check collapse toggle
		const target = e.target as Element;
		const toggle = target.closest(".osmosis-collapse-toggle");
		if (toggle) {
			const toggleNodeId = toggle.getAttribute("data-node-id");
			if (toggleNodeId) {
				this.toggleCollapse(toggleNodeId);
			}
			this.lastTapTime = 0; // Reset so next tap isn't treated as double-tap
			return;
		}

		// In touch selection mode, taps toggle selection (like shift+click)
		if (this.touchSelectionMode) {
			this.toggleNodeInSelection(nodeId);
			this.contentEl.focus();
			// Record for double-tap but don't allow double-tap in selection mode
			this.lastTapTime = 0;
			this.lastTapPosition = { x: e.clientX, y: e.clientY };
			this.lastTapNodeId = null;
			return;
		}

		// Normal tap: select the node
		this.selectNode(nodeId);
		this.syncMapSelectionToEditor(nodeId);
		this.contentEl.focus();

		// Record for double-tap detection
		this.lastTapTime = Date.now();
		this.lastTapPosition = { x: e.clientX, y: e.clientY };
		this.lastTapNodeId = nodeId;
	}

	private initPinch(): void {
		const pointers = Array.from(this.activePointers.values());
		const p1 = pointers[0];
		const p2 = pointers[1];
		if (!p1 || !p2) return;

		this.pinchStartDistance = Math.sqrt(
			(p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2,
		);
		this.pinchStartZoom = this.zoom;
		this.pinchCenter = {
			x: (p1.x + p2.x) / 2,
			y: (p1.y + p2.y) / 2,
		};
	}

	private updatePinch(): void {
		const pointers = Array.from(this.activePointers.values());
		const p1 = pointers[0];
		const p2 = pointers[1];
		if (!p1 || !p2 || this.pinchStartDistance === null) return;

		const currentDistance = Math.sqrt(
			(p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2,
		);

		const ratio = currentDistance / this.pinchStartDistance;
		const newZoom = Math.max(
			MIN_ZOOM,
			Math.min(MAX_ZOOM, this.pinchStartZoom * ratio),
		);

		// Zoom around the pinch center (same math as handleWheel)
		const newCenter = {
			x: (p1.x + p2.x) / 2,
			y: (p1.y + p2.y) / 2,
		};
		const svgPoint = this.screenToSvg(newCenter.x, newCenter.y);
		const scale = this.zoom / newZoom;
		this.viewBox.x = svgPoint.x - (svgPoint.x - this.viewBox.x) * scale;
		this.viewBox.y = svgPoint.y - (svgPoint.y - this.viewBox.y) * scale;
		this.viewBox.w *= scale;
		this.viewBox.h *= scale;
		this.zoom = newZoom;

		// Pan if pinch center moved
		const svgOldCenter = this.screenToSvg(
			this.pinchCenter.x,
			this.pinchCenter.y,
		);
		const svgNewCenter = this.screenToSvg(newCenter.x, newCenter.y);
		this.viewBox.x -= svgNewCenter.x - svgOldCenter.x;
		this.viewBox.y -= svgNewCenter.y - svgOldCenter.y;

		this.pinchCenter = newCenter;
		this.updateViewBox();
	}

	/**
	 * Block touch events from propagating to Obsidian's gesture handlers.
	 * This prevents drawer swipes and command palette pull-down on mobile.
	 */
	private handleTouchCapture = (e: TouchEvent): void => {
		e.stopPropagation();
	};

	/**
	 * Handle container resize (e.g. mobile keyboard opening/closing).
	 * Adjusts viewBox dimensions to match new container size while keeping
	 * the center point stable.
	 */
	private handleContainerResize(): void {
		if (!this.svg) return;
		// Skip resize while editing — virtual keyboard opening/closing would
		// shift the viewBox and cause the map to jump away from the edit node.
		if (this.editingNodeId) return;

		const rect = this.contentEl.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) return;

		// Compute new viewBox dimensions at current zoom level
		const newW = rect.width / this.zoom;
		const newH = rect.height / this.zoom;

		// Keep the center point stable
		const cx = this.viewBox.x + this.viewBox.w / 2;
		const cy = this.viewBox.y + this.viewBox.h / 2;
		this.viewBox.x = cx - newW / 2;
		this.viewBox.y = cy - newH / 2;
		this.viewBox.w = newW;
		this.viewBox.h = newH;

		this.updateViewBox();
	}

	private cancelLongPress(): void {
		if (this.longPressTimer !== null) {
			clearTimeout(this.longPressTimer);
			this.longPressTimer = null;
		}
	}

	private cleanupAllInteractions(): void {
		this.cancelLongPress();
		this.isPanning = false;
		this.isRubberBanding = false;
		this.dragNodeId = null;
		this.pinchStartDistance = null;
		this.longPressTriggered = false;
		this.touchSelectionMode = false;
		if (this.isDragging) {
			this.cleanupDrag();
		}
		if (this.rubberBandRect) {
			this.rubberBandRect.remove();
			this.rubberBandRect = null;
		}
	}

	private handleWheel = (e: WheelEvent): void => {
		e.preventDefault();

		if (e.ctrlKey || e.metaKey) {
			// Ctrl+Scroll: zoom in/out
			const svgPoint = this.screenToSvg(e.clientX, e.clientY);
			const delta = e.deltaY * ZOOM_SENSITIVITY;
			const newZoom = Math.max(
				MIN_ZOOM,
				Math.min(MAX_ZOOM, this.zoom * (1 - delta)),
			);

			const scale = this.zoom / newZoom;
			this.viewBox.x = svgPoint.x - (svgPoint.x - this.viewBox.x) * scale;
			this.viewBox.y = svgPoint.y - (svgPoint.y - this.viewBox.y) * scale;
			this.viewBox.w *= scale;
			this.viewBox.h *= scale;
			this.zoom = newZoom;
		} else {
			// Scroll/trackpad: pan in both axes (supports diagonal gestures)
			// Shift+scroll with a mouse wheel: treat deltaY as horizontal
			const dx = e.shiftKey && e.deltaX === 0 ? e.deltaY : e.deltaX;
			const dy = e.shiftKey && e.deltaX === 0 ? 0 : e.deltaY;
			this.viewBox.x += (dx * SCROLL_SENSITIVITY) / this.zoom;
			this.viewBox.y += (dy * SCROLL_SENSITIVITY) / this.zoom;
		}

		this.updateViewBox();
	};

	private getClickedNodeId(e: { target: EventTarget | null }): string | null {
		const target = e.target as Element;
		const group = target.closest(".osmosis-node-group");
		return group?.getAttribute("data-node-id") ?? null;
	}

	private handleClick = (e: MouseEvent): void => {
		if (this.lastPointerType === "touch") return;
		if (this.isPanning || this.isDragging) return;

		// Check if clicking a collapse toggle
		const target = e.target as Element;
		const toggle = target.closest(".osmosis-collapse-toggle");
		if (toggle) {
			const nodeId = toggle.getAttribute("data-node-id");
			if (nodeId) {
				this.toggleCollapse(nodeId);
			}
			return;
		}

		// Check if clicking a link inside a node
		const anchor = target.closest("a");
		if (anchor) {
			e.preventDefault();
			e.stopPropagation();
			const href = anchor.getAttribute("href");
			if (href) {
				if (anchor.classList.contains("internal-link")) {
					const dataHref = anchor.getAttribute("data-href") ?? href;
					void this.app.workspace.openLinkText(dataHref, this.currentFile?.path ?? "");
				} else {
					window.open(href);
				}
			}
			return;
		}

		// Check if clicking a node
		const nodeId = this.getClickedNodeId(e);
		if (nodeId) {
			if (e.shiftKey) {
				this.toggleNodeInSelection(nodeId);
			} else {
				this.selectNode(nodeId);
				this.syncMapSelectionToEditor(nodeId);
			}
			this.contentEl.focus();
		} else {
			if (!e.shiftKey) {
				this.selectNode(null);
			}
		}
	};

	private handleDblClick = (e: MouseEvent): void => {
		if (this.lastPointerType === "touch") return;
		if ((e.target as Element).closest("a")) return;
		const nodeId = this.getClickedNodeId(e);
		if (nodeId) {
			this.startEditing(nodeId);
		}
	};

	// ─── Collapse ────────────────────────────────────────────

	private toggleCollapse(nodeId: string): void {
		if (this.collapsedIds.has(nodeId)) {
			this.collapsedIds.delete(nodeId);

			// Lazy loading: if this is a deferred transclusion, expand it now
			if (this.lazyTransclusionIds.has(nodeId)) {
				this.lazyTransclusionIds.delete(nodeId);
				void this.expandLazyTransclusion(nodeId);
				return;
			}
		} else {
			this.collapsedIds.add(nodeId);
		}
		void this.renderAnimated();
	}

	/**
	 * Expand a single lazy transclusion node on demand.
	 * Finds the node in the tree, parses and splices its content, then re-renders.
	 */
	private async expandLazyTransclusion(nodeId: string): Promise<void> {
		if (!this.currentTree || !this.currentFile) return;

		const { parent, node } =
			this.findNodeWithParent(this.currentTree.root, nodeId) ?? {};
		if (!parent || !node || node.type !== "transclusion") return;

		await this.transclusionResolver.expandSingleNode(
			parent,
			node,
			node.sourceFile ? this.currentFile.path : this.currentFile.path,
		);

		await this.renderAnimated();
	}

	/** Walk the tree to find a node and its parent by ID. */
	private findNodeWithParent(
		current: OsmosisNode,
		targetId: string,
	): { parent: OsmosisNode; node: OsmosisNode } | null {
		for (const child of current.children) {
			if (child.id === targetId) return { parent: current, node: child };
			const found = this.findNodeWithParent(child, targetId);
			if (found) return found;
		}
		return null;
	}

	/** Collect IDs of all transclusion nodes in the tree. */
	private collectTransclusionIds(node: OsmosisNode, ids: Set<string>): void {
		if (node.type === "transclusion") {
			ids.add(node.id);
		}
		for (const child of node.children) {
			this.collectTransclusionIds(child, ids);
		}
	}

	private async renderAnimated(): Promise<void> {
		if (!this.svg) {
			await this.render();
			return;
		}

		// Capture old positions for animation
		const oldPositions = new Map<string, { x: number; y: number }>();
		if (this.currentLayout) {
			for (const node of this.currentLayout.nodes) {
				if (node.source.type === "root") continue;
				oldPositions.set(node.source.id, {
					x: node.rect.x,
					y: node.rect.y,
				});
			}
		}

		// Re-render with new collapse state
		await this.render();

		if (!this.svg || !this.currentLayout) return;

		// Add animation class to SVG for CSS-driven transition
		if (this.svg) {
			this.svg.addClass("osmosis-animating");
			setTimeout(() => {
				this.svg?.removeClass("osmosis-animating");
			}, COLLAPSE_ANIMATION_MS);
		}
	}

	// ─── Selection ───────────────────────────────────────────

	/**
	 * Set a single node as selected, clearing any multi-selection.
	 */
	private selectNode(nodeId: string | null): void {
		this.clearSelectionVisuals();
		this.selectedNodeIds.clear();
		this.selectedNodeId = nodeId;

		if (nodeId) {
			this.selectedNodeIds.add(nodeId);
		}

		this.applySelectionVisuals();
	}

	/**
	 * Toggle a node in the multi-selection (Shift+click).
	 */
	private toggleNodeInSelection(nodeId: string): void {
		this.clearSelectionVisuals();
		if (this.selectedNodeIds.has(nodeId)) {
			this.selectedNodeIds.delete(nodeId);
			if (this.selectedNodeId === nodeId) {
				// Move primary selection to another selected node or null
				const next = this.selectedNodeIds.values().next();
				this.selectedNodeId = next.done ? null : next.value;
			}
		} else {
			this.selectedNodeIds.add(nodeId);
			this.selectedNodeId = nodeId;
		}
		this.applySelectionVisuals();
	}

	/**
	 * Select multiple nodes at once (e.g., from rubber-band).
	 */
	private selectNodes(nodeIds: Set<string>): void {
		this.clearSelectionVisuals();
		this.selectedNodeIds = new Set(nodeIds);
		const first = nodeIds.values().next();
		this.selectedNodeId = first.done ? null : first.value;
		this.applySelectionVisuals();
	}

	private clearSelectionVisuals(): void {
		if (!this.svg) return;
		for (const id of this.selectedNodeIds) {
			const el = this.svg.querySelector(`[data-node-id="${id}"]`);
			el?.classList.remove("osmosis-node-selected");
		}
	}

	private applySelectionVisuals(): void {
		if (!this.svg) return;
		for (const id of this.selectedNodeIds) {
			const el = this.svg.querySelector(`[data-node-id="${id}"]`);
			el?.classList.add("osmosis-node-selected");
		}
		this.updateToolbarState();
	}

	// ─── Rubber-Band Selection ───────────────────────────────

	private updateRubberBand(e: MouseEvent): void {
		if (!this.svg) return;
		const svgPt = this.screenToSvg(e.clientX, e.clientY);

		// Create rect on first move
		if (!this.rubberBandRect) {
			const rect = document.createElementNS(SVG_NS, "rect");
			rect.setAttribute("class", "osmosis-rubber-band");
			this.svg.appendChild(rect);
			this.rubberBandRect = rect;
		}

		const x = Math.min(this.rubberBandStart.x, svgPt.x);
		const y = Math.min(this.rubberBandStart.y, svgPt.y);
		const w = Math.abs(svgPt.x - this.rubberBandStart.x);
		const h = Math.abs(svgPt.y - this.rubberBandStart.y);

		this.rubberBandRect.setAttribute("x", String(x));
		this.rubberBandRect.setAttribute("y", String(y));
		this.rubberBandRect.setAttribute("width", String(w));
		this.rubberBandRect.setAttribute("height", String(h));
	}

	private finishRubberBand(): void {
		this.isRubberBanding = false;

		if (!this.rubberBandRect || !this.svg) {
			this.rubberBandRect?.remove();
			this.rubberBandRect = null;
			return;
		}

		const rx = parseFloat(this.rubberBandRect.getAttribute("x") ?? "0");
		const ry = parseFloat(this.rubberBandRect.getAttribute("y") ?? "0");
		const rw = parseFloat(this.rubberBandRect.getAttribute("width") ?? "0");
		const rh = parseFloat(
			this.rubberBandRect.getAttribute("height") ?? "0",
		);

		this.rubberBandRect.remove();
		this.rubberBandRect = null;

		if (rw < 3 && rh < 3) return; // Too small, ignore

		const offsetX = this.getOffsetX();
		const offsetY = this.getOffsetY();
		const selected = new Set<string>();

		for (const [id, node] of this.nodeMap) {
			const nx = node.rect.x + offsetX;
			const ny = node.rect.y + offsetY;
			const nw = node.rect.width;
			const nh = node.rect.height;

			// Check if node overlaps with rubber-band rect
			if (nx + nw > rx && nx < rx + rw && ny + nh > ry && ny < ry + rh) {
				selected.add(id);
			}
		}

		if (selected.size > 0) {
			this.selectNodes(selected);
		}
	}

	// ─── Bulk Operations ────────────────────────────────────

	/**
	 * Delete all selected nodes from the markdown.
	 * Processes nodes from end-of-document to start to preserve offsets.
	 */
	private async deleteSelectedNodes(): Promise<void> {
		if (!this.currentFile || this.selectedNodeIds.size === 0) return;

		// Collect ranges sorted by position (descending) to process from end
		const ranges: { start: number; end: number }[] = [];
		for (const id of this.selectedNodeIds) {
			const node = this.nodeMap.get(id);
			if (!node) continue;
			ranges.push({
				start: node.source.range.start,
				end: this.subtreeEnd(node.source),
			});
		}
		ranges.sort((a, b) => b.start - a.start);

		let content = await this.app.vault.read(this.currentFile);

		for (const range of ranges) {
			let deleteStart = range.start;
			let deleteEnd = range.end;

			if (deleteStart > 0 && content[deleteStart - 1] === "\n") {
				deleteStart--;
			} else if (
				deleteEnd < content.length &&
				content[deleteEnd] === "\n"
			) {
				deleteEnd++;
			}

			content = content.slice(0, deleteStart) + content.slice(deleteEnd);
		}

		this.selectedNodeIds.clear();
		this.selectedNodeId = null;
		await this.writeMarkdown(this.renumberOrderedLists(content));
		this.selectFirstNode();
	}

	/**
	 * Move selected node(s) up or down among siblings.
	 * direction: -1 = up, 1 = down.
	 */
	private async moveNodeUpDown(direction: number): Promise<void> {
		if (!this.currentFile || !this.selectedNodeId) return;

		const node = this.nodeMap.get(this.selectedNodeId);
		if (!node?.parent) return;

		const src = node.source;
		const file = this.getNodeFile(src);
		if (!file) return;

		const parentSrc = node.parent.source;
		const siblings = parentSrc.children;

		// Collect selected sibling indices, sorted by position
		const selectedIndices = this.getSelectedSiblingIndices(siblings);
		if (selectedIndices.length === 0) return;

		// Find the swap target (the sibling adjacent to the selected block)
		const swapIdx =
			direction < 0
				? selectedIndices[0]! + direction
				: selectedIndices[selectedIndices.length - 1]! + direction;
		if (swapIdx < 0 || swapIdx >= siblings.length) return;

		const swapSrc = siblings[swapIdx];
		if (!swapSrc) return;

		const content = await this.app.vault.read(file);

		// Collect all selected subtree texts in order
		const selectedSrcs = selectedIndices.map((i) => siblings[i]!);
		const blockStart = selectedSrcs[0]!.range.start;
		const blockEnd = this.subtreeEnd(
			selectedSrcs[selectedSrcs.length - 1]!,
		);
		const blockText = content.slice(blockStart, blockEnd);

		const swapStart = swapSrc.range.start;
		const swapEnd = this.subtreeEnd(swapSrc);
		const swapText = content.slice(swapStart, swapEnd);

		// Swap block with target.
		// Replace the entire range spanning both nodes (including any gap
		// and surrounding blank lines) with the swapped texts joined by "\n".
		// normalizeHeadingSpacing (called by writeNodeFile) will re-add proper
		// blank lines around headings and top-level code fences.
		const rangeStart = Math.min(blockStart, swapStart);
		const rangeEnd = Math.max(blockEnd, swapEnd);

		// Strip trailing blank lines before the swap range
		let headEnd = rangeStart;
		while (headEnd > 0 && content[headEnd - 1] === "\n") {
			headEnd--;
		}
		const head = headEnd > 0 ? content.slice(0, headEnd) + "\n" : "";

		// Strip leading blank lines after the swap range
		let tailPos = rangeEnd;
		while (tailPos < content.length && content[tailPos] === "\n") {
			tailPos++;
		}
		const tail =
			tailPos < content.length
				? "\n" + content.slice(tailPos)
				: content.slice(rangeEnd);

		let updated: string;
		if (blockStart < swapStart) {
			updated = head + swapText + "\n" + blockText + tail;
		} else {
			updated = head + blockText + "\n" + swapText + tail;
		}

		const movedContents = selectedSrcs.map((s) => s.content);
		await this.writeNodeFile(src, updated);

		// Re-select all moved nodes
		this.reselectMultiAfterMove(movedContents);
	}

	/**
	 * Get sorted indices of selected nodes among a sibling list.
	 */
	private getSelectedSiblingIndices(siblings: OsmosisNode[]): number[] {
		const indices: number[] = [];
		for (let i = 0; i < siblings.length; i++) {
			const sib = siblings[i];
			if (sib && this.selectedNodeIds.has(sib.id)) {
				indices.push(i);
			}
		}
		return indices.sort((a, b) => a - b);
	}

	/**
	 * After a move operation, re-select moved nodes by content match.
	 */
	private reselectMultiAfterMove(contents: string[]): void {
		const contentSet = new Set(contents);
		const matchedIds: string[] = [];
		for (const [id, layoutNode] of this.nodeMap) {
			if (contentSet.has(layoutNode.source.content)) {
				matchedIds.push(id);
				contentSet.delete(layoutNode.source.content);
			}
		}
		if (matchedIds.length > 0) {
			this.clearSelectionVisuals();
			this.selectedNodeIds = new Set(matchedIds);
			this.selectedNodeId = matchedIds[matchedIds.length - 1] ?? null;
			this.applySelectionVisuals();
			this.scrollToSelectedNode();
		}
	}

	/**
	 * Indent node(s): reparent under previous sibling (Alt+Right).
	 * Supports multi-select: all selected siblings become children of the previous sibling.
	 */
	private async indentNode(): Promise<void> {
		if (!this.currentFile || !this.selectedNodeId) return;

		const node = this.nodeMap.get(this.selectedNodeId);
		if (!node?.parent) return;

		const parentSrc = node.parent.source;
		const siblings = parentSrc.children;
		const selectedIndices = this.getSelectedSiblingIndices(siblings);
		if (selectedIndices.length === 0) return;

		const firstIdx = selectedIndices[0]!;
		if (firstIdx <= 0) return;

		const prevSibling = siblings[firstIdx - 1];
		if (!prevSibling) return;

		const firstSrc = siblings[firstIdx]!;
		const file = this.getNodeFile(firstSrc);
		if (!file) return;

		const content = await this.app.vault.read(file);

		// Collect block of selected subtrees
		const lastSrc = siblings[selectedIndices[selectedIndices.length - 1]!]!;
		const blockStart = firstSrc.range.start;
		const blockEnd = this.subtreeEnd(lastSrc);

		// Re-indent each selected node's subtree individually
		const reindentedParts: string[] = [];
		for (const idx of selectedIndices) {
			const nodeSrc = siblings[idx]!;
			const nodeText = content.slice(
				nodeSrc.range.start,
				this.subtreeEnd(nodeSrc),
			);
			const newType = this.inferIndentType(prevSibling, nodeSrc);
			const newDepth = this.inferIndentDepth(prevSibling, nodeSrc);
			reindentedParts.push(
				this.reindentSubtree(nodeText, nodeSrc, newType, newDepth),
			);
		}
		const reindented = reindentedParts.join("\n");

		// Remove block from current position
		let removeStart = blockStart;
		if (removeStart > 0 && content[removeStart - 1] === "\n") {
			removeStart--;
		}

		// Insert at end of previous sibling's subtree
		const insertPos = this.subtreeEnd(prevSibling);
		const prefix =
			insertPos > 0 && content[insertPos - 1] !== "\n" ? "\n" : "";

		const withoutBlock =
			content.slice(0, removeStart) + content.slice(blockEnd);
		const updated =
			withoutBlock.slice(0, insertPos) +
			prefix +
			reindented +
			withoutBlock.slice(insertPos);

		const movedContents = selectedIndices.map((i) => siblings[i]!.content);
		await this.writeNodeFile(firstSrc, updated);
		this.reselectMultiAfterMove(movedContents);
	}

	/**
	 * Outdent node(s): promote to parent's level (Alt+Left).
	 * Supports multi-select: all selected siblings promote together.
	 */
	private async outdentNode(): Promise<void> {
		if (!this.currentFile || !this.selectedNodeId) return;

		const node = this.nodeMap.get(this.selectedNodeId);
		if (!node?.parent) return;

		const parentNode = node.parent;

		// Special case: outdenting a direct child of root promotes in-place
		// list item → paragraph → heading
		if (parentNode.source.type === "root") {
			const siblings = parentNode.source.children;
			const selectedIndices = this.getSelectedSiblingIndices(siblings);
			if (selectedIndices.length === 0) return;

			const firstSrc = siblings[selectedIndices[0]!]!;

			// Determine promotion target type and depth
			let newType: OsmosisNode["type"];
			let newDepth: number;
			if (firstSrc.type === "bullet" || firstSrc.type === "ordered") {
				newType = "paragraph";
				newDepth = 0;
			} else if (firstSrc.type === "paragraph") {
				newType = "heading";
				// Match neighboring heading siblings, default to h1
				newDepth = this.inferRootHeadingLevel(parentNode.source, selectedIndices[0]!);
			} else {
				return; // headings and other types can't promote further at root
			}

			const lastSrc = siblings[selectedIndices[selectedIndices.length - 1]!]!;
			const file = this.getNodeFile(firstSrc);
			if (!file) return;

			const content = await this.app.vault.read(file);
			const blockStart = firstSrc.range.start;
			const blockEnd = this.subtreeEnd(lastSrc);

			const reindentedParts: string[] = [];
			for (const idx of selectedIndices) {
				const nodeSrc = siblings[idx]!;
				const nodeText = content.slice(
					nodeSrc.range.start,
					this.subtreeEnd(nodeSrc),
				);
				reindentedParts.push(
					this.reindentSubtree(nodeText, nodeSrc, newType, newDepth),
				);
			}
			const reindented = reindentedParts.join("\n");

			const updated =
				content.slice(0, blockStart) + reindented + content.slice(blockEnd);

			const movedContents = selectedIndices.map((i) => siblings[i]!.content);
			await this.writeNodeFile(firstSrc, updated);
			this.reselectMultiAfterMove(movedContents);
			return;
		}

		const grandparent = parentNode.parent;
		if (!grandparent) return;

		const siblings = parentNode.source.children;
		const selectedIndices = this.getSelectedSiblingIndices(siblings);
		if (selectedIndices.length === 0) return;

		const firstSrc = siblings[selectedIndices[0]!]!;
		const lastSrc = siblings[selectedIndices[selectedIndices.length - 1]!]!;

		const file = this.getNodeFile(firstSrc);
		if (!file) return;

		const content = await this.app.vault.read(file);
		const blockStart = firstSrc.range.start;
		const blockEnd = this.subtreeEnd(lastSrc);

		// Re-indent each selected node's subtree individually
		const reindentedParts: string[] = [];
		for (const idx of selectedIndices) {
			const nodeSrc = siblings[idx]!;
			const nodeText = content.slice(
				nodeSrc.range.start,
				this.subtreeEnd(nodeSrc),
			);
			// Becoming a sibling of parent — preserve node's own list type
			// Only switch type for heading transitions
			let newType: OsmosisNode["type"];
			if (nodeSrc.type === "heading" && parentNode.source.type === "heading") {
				newType = "heading";
			} else if (
				(nodeSrc.type === "bullet" || nodeSrc.type === "ordered") &&
				nodeSrc.depth === 0 &&
				parentNode.source.type === "heading"
			) {
				// Depth-0 list item directly under a heading: promote to paragraph
				// (progressive: bullet → paragraph → heading on successive outdents)
				newType = "paragraph";
			} else if (nodeSrc.type === "bullet" || nodeSrc.type === "ordered") {
				// Nested list items keep their own type when outdenting
				newType = nodeSrc.type;
			} else {
				newType = parentNode.source.type;
			}
			const newDepth = parentNode.source.depth;
			reindentedParts.push(
				this.reindentSubtree(nodeText, nodeSrc, newType, newDepth),
			);
		}
		const reindented = reindentedParts.join("\n");

		// Remove block from current position
		let removeStart = blockStart;
		if (removeStart > 0 && content[removeStart - 1] === "\n") {
			removeStart--;
		}

		// Insert after parent's subtree
		const parentEnd = this.subtreeEnd(parentNode.source);

		const withoutBlock =
			content.slice(0, removeStart) + content.slice(blockEnd);
		const removedLength = blockEnd - removeStart;
		const adjustedParentEnd = parentEnd - removedLength;

		const prefix =
			adjustedParentEnd > 0 &&
			withoutBlock[adjustedParentEnd - 1] !== "\n"
				? "\n"
				: "";
		const updated =
			withoutBlock.slice(0, adjustedParentEnd) +
			prefix +
			reindented +
			withoutBlock.slice(adjustedParentEnd);

		const movedContents = selectedIndices.map((i) => siblings[i]!.content);
		await this.writeNodeFile(firstSrc, updated);
		this.reselectMultiAfterMove(movedContents);
	}

	/**
	 * Copy (or cut) selected node subtrees to the internal clipboard.
	 */
	private async copySelectedNodes(isCut: boolean): Promise<void> {
		if (!this.currentFile || !this.selectedNodeId) return;

		const node = this.nodeMap.get(this.selectedNodeId);
		if (!node) return;

		const src = node.source;
		const file = this.getNodeFile(src);
		if (!file) return;

		const content = await this.app.vault.read(file);

		// Collect subtree texts for all selected nodes, sorted by document position
		const selected = [...this.selectedNodeIds]
			.map((id) => this.nodeMap.get(id))
			.filter((n): n is LayoutNode => n !== undefined)
			.sort((a, b) => a.source.range.start - b.source.range.start);

		const texts: string[] = [];
		for (const sel of selected) {
			const start = sel.source.range.start;
			const end = this.subtreeEnd(sel.source);
			texts.push(content.slice(start, end));
		}

		this.clipboardText = texts.join("\n");
		this.clipboardNodeType = src.type;
		this.clipboardNodeDepth = src.depth;
		this.clipboardIsCut = isCut;
		this.clipboardSourceIds = new Set(this.selectedNodeIds);

		// Also put plain text on system clipboard for external paste
		await navigator.clipboard.writeText(this.clipboardText);

		// If cut, delete the selected nodes
		if (isCut) {
			if (this.selectedNodeIds.size > 1) {
				await this.deleteSelectedNodes();
			} else {
				await this.deleteNode(node);
			}
		}
	}

	/**
	 * Paste clipboard content as sibling(s) below the selected node.
	 */
	private async pasteNodes(): Promise<void> {
		if (!this.currentFile || !this.selectedNodeId || !this.clipboardText)
			return;

		const node = this.nodeMap.get(this.selectedNodeId);
		if (!node) return;

		const src = node.source;
		const file = this.getNodeFile(src);
		if (!file) return;

		const content = await this.app.vault.read(file);
		const insertPos = this.subtreeEnd(src);

		// Adjust pasted text depth if target differs from source
		let pasteText = this.clipboardText;
		if (this.clipboardNodeType && this.clipboardNodeDepth !== null) {
			const depthDelta = src.depth - this.clipboardNodeDepth;
			if (depthDelta !== 0 || this.clipboardNodeType !== src.type) {
				pasteText = this.adjustPasteDepth(
					pasteText,
					this.clipboardNodeType,
					depthDelta,
				);
			}
		}

		const updated =
			content.slice(0, insertPos) +
			"\n" +
			pasteText +
			content.slice(insertPos);
		await this.writeNodeFile(src, updated);
	}

	/**
	 * Adjust the depth of pasted text line-by-line, preserving content.
	 * Skips content lines inside code fences (only adjusts fence line indentation).
	 */
	private adjustPasteDepth(
		text: string,
		sourceType: OsmosisNode["type"],
		depthDelta: number,
	): string {
		const lines = text.split("\n");
		const result: string[] = [];
		let inCodeBlock = false;
		let codeFenceChar = "";
		let codeFenceLen = 0;

		for (const line of lines) {
			if (line.trim() === "") {
				result.push(line);
				continue;
			}

			const trimmed = line.trimStart();
			const fenceMatch = /^(`{3,}|~{3,})(.*)$/.exec(trimmed);

			// Code block: leave all lines (fences + content) untouched
			if (inCodeBlock) {
				if (
					fenceMatch?.[1] &&
					fenceMatch[1].charAt(0) === codeFenceChar &&
					fenceMatch[1].length >= codeFenceLen &&
					(fenceMatch[2] ?? "").trim() === ""
				) {
					inCodeBlock = false;
				}
				result.push(line);
				continue;
			} else if (fenceMatch?.[1]) {
				inCodeBlock = true;
				codeFenceChar = fenceMatch[1].charAt(0);
				codeFenceLen = fenceMatch[1].length;
				result.push(line);
				continue;
			}

			// Table lines (pipe-prefixed): leave untouched
			if (/^\s*\|/.test(line)) {
				result.push(line);
				continue;
			}

			// Handle heading lines
			const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
			if (headingMatch?.[1] && headingMatch[2] !== undefined) {
				const oldLevel = headingMatch[1].length;
				const newLevel = Math.max(
					1,
					Math.min(6, oldLevel + depthDelta),
				);
				result.push("#".repeat(newLevel) + " " + headingMatch[2]);
				continue;
			}

			// Handle list lines (tab or space indented)
			const listMatch = line.match(/^(\t*)([ ]*)(.*)$/);
			if (listMatch?.[3] !== undefined) {
				const currentTabs = listMatch[1]?.length ?? 0;
				const currentSpaces = listMatch[2]?.length ?? 0;
				const currentDepth =
					currentTabs + Math.floor(currentSpaces / 2);
				const newDepth = Math.max(0, currentDepth + depthDelta);
				result.push(
					"\t".repeat(newDepth) +
					listMatch[3].replace(/^[ \t]*/, ""),
				);
				continue;
			}

			result.push(line);
		}

		return result.join("\n");
	}

	/**
	 * Insert a new parent node above the selected node(s).
	 * The selected node(s) (and their subtrees) become children of the new node.
	 * Supports multi-select: all selected siblings get parented under the new node.
	 */
	private async insertParentNode(node: LayoutNode): Promise<void> {
		if (!this.currentFile) return;

		const src = node.source;
		const file = this.getNodeFile(src);
		if (!file) return;

		const content = await this.app.vault.read(file);

		// Collect selected siblings sorted by position
		let blockStart: number;
		let blockEnd: number;
		let blockText: string;

		if (this.selectedNodeIds.size > 1 && node.parent) {
			const siblings = node.parent.source.children;
			const selectedIndices = this.getSelectedSiblingIndices(siblings);
			if (selectedIndices.length === 0) return;

			const firstSrc = siblings[selectedIndices[0]!]!;
			const lastSrc =
				siblings[selectedIndices[selectedIndices.length - 1]!]!;
			blockStart = firstSrc.range.start;
			blockEnd = this.subtreeEnd(lastSrc);
		} else {
			blockStart = src.range.start;
			blockEnd = this.subtreeEnd(src);
		}
		blockText = content.slice(blockStart, blockEnd);

		// Create the new parent line at the same type/depth as the first selected node
		const newParentLine = this.serializeLine(src.type, src.depth, "");

		// Indent all selected subtrees by 1 level
		let indentedSubtree: string;
		if (src.type === "heading") {
			indentedSubtree = this.indentSubtreeHeadings(blockText);
		} else {
			indentedSubtree = blockText
				.split("\n")
				.map((line) => (line.trim() === "" ? line : "\t" + line))
				.join("\n");
		}

		// Replace: [newParentLine]\n[indentedSubtree]
		const updated =
			content.slice(0, blockStart) +
			newParentLine +
			"\n" +
			indentedSubtree +
			content.slice(blockEnd);

		const selectedId = this.selectedNodeId;
		await this.writeNodeFile(src, updated);

		// Start editing the new (empty) parent node
		this.startEditingNewNode(selectedId, false);
	}

	/**
	 * Increase all heading levels in a subtree by 1 (e.g., ## → ###).
	 */
	private indentSubtreeHeadings(text: string): string {
		return text
			.split("\n")
			.map((line) => {
				const headingMatch = line.match(/^(#{1,5})\s/);
				if (headingMatch && headingMatch[1]) {
					return "#" + line;
				}
				return line;
			})
			.join("\n");
	}

	/**
	 * Duplicate the selected node(s) (and their subtrees) as siblings below.
	 */
	private async duplicateNode(node: LayoutNode): Promise<void> {
		if (!this.currentFile) return;
		const src = node.source;
		const file = this.getNodeFile(src);
		if (!file) return;

		const content = await this.app.vault.read(file);

		// Collect all selected nodes sorted by document position
		const selected = [...this.selectedNodeIds]
			.map((id) => this.nodeMap.get(id))
			.filter((n): n is LayoutNode => n !== undefined)
			.sort((a, b) => a.source.range.start - b.source.range.start);

		if (selected.length === 0) return;

		// Find the block range covering all selected subtrees
		const blockStart = selected[0]!.source.range.start;
		const blockEnd = this.subtreeEnd(selected[selected.length - 1]!.source);
		const blockText = content.slice(blockStart, blockEnd);

		const updated =
			content.slice(0, blockEnd) +
			"\n" +
			blockText +
			content.slice(blockEnd);
		await this.writeNodeFile(src, updated);
	}

	/**
	 * Toggle collapse on all selected nodes.
	 */
	private toggleCollapseSelected(): void {
		let anyExpanded = false;
		for (const id of this.selectedNodeIds) {
			const node = this.nodeMap.get(id);
			if (
				node &&
				(node.children.length > 0 || node.collapsed) &&
				!this.collapsedIds.has(id)
			) {
				anyExpanded = true;
				break;
			}
		}

		for (const id of this.selectedNodeIds) {
			const node = this.nodeMap.get(id);
			if (!node || (node.children.length === 0 && !node.collapsed))
				continue;
			if (anyExpanded) {
				this.collapsedIds.add(id);
			} else {
				this.collapsedIds.delete(id);
			}
		}

		void this.renderAnimated();
	}

	/**
	 * Get all descendant node IDs of a layout node (recursive, layout tree only).
	 */
	private getDescendantIds(node: LayoutNode): string[] {
		const ids: string[] = [];
		for (const child of node.children) {
			ids.push(child.source.id);
			ids.push(...this.getDescendantIds(child));
		}
		return ids;
	}

	/**
	 * Get all descendant node IDs from the source tree (includes collapsed children).
	 */
	private getSourceDescendantIds(node: OsmosisNode): string[] {
		const ids: string[] = [];
		for (const child of node.children) {
			ids.push(child.id);
			ids.push(...this.getSourceDescendantIds(child));
		}
		return ids;
	}

	/**
	 * Get the maximum visible depth under a node (not counting collapsed subtrees).
	 */
	private getMaxVisibleDepth(node: LayoutNode, currentDepth: number): number {
		if (
			this.collapsedIds.has(node.source.id) ||
			node.children.length === 0
		) {
			return currentDepth;
		}
		let max = currentDepth;
		for (const child of node.children) {
			max = Math.max(
				max,
				this.getMaxVisibleDepth(child, currentDepth + 1),
			);
		}
		return max;
	}

	/**
	 * Collect nodes at a specific visible depth under a root node.
	 */
	private getNodesAtVisibleDepth(
		node: LayoutNode,
		targetDepth: number,
		currentDepth: number,
	): LayoutNode[] {
		if (this.collapsedIds.has(node.source.id)) return [];
		if (currentDepth === targetDepth) return [node];
		const result: LayoutNode[] = [];
		for (const child of node.children) {
			result.push(
				...this.getNodesAtVisibleDepth(
					child,
					targetDepth,
					currentDepth + 1,
				),
			);
		}
		return result;
	}

	/**
	 * Fold one level: collapse the deepest visible children of each selected node.
	 */
	private foldOneLevel(): void {
		const targetIds =
			this.selectedNodeIds.size > 0
				? [...this.selectedNodeIds]
				: this.selectedNodeId
					? [this.selectedNodeId]
					: [];
		let changed = false;

		for (const id of targetIds) {
			const node = this.nodeMap.get(id);
			if (!node) continue;

			const maxDepth = this.getMaxVisibleDepth(node, 0);
			if (maxDepth <= 0) continue; // Nothing to fold

			// Find nodes at the deepest visible level that have children
			const deepestParents = this.getNodesAtVisibleDepth(
				node,
				maxDepth - 1,
				0,
			).filter(
				(n) =>
					n.children.length > 0 &&
					!this.collapsedIds.has(n.source.id),
			);

			for (const parent of deepestParents) {
				this.collapsedIds.add(parent.source.id);
				changed = true;
			}
		}

		if (changed) void this.renderAnimated();
	}

	/**
	 * Unfold one level: expand the shallowest collapsed children of each selected node.
	 */
	private unfoldOneLevel(): void {
		const targetIds =
			this.selectedNodeIds.size > 0
				? [...this.selectedNodeIds]
				: this.selectedNodeId
					? [this.selectedNodeId]
					: [];
		let changed = false;

		for (const id of targetIds) {
			const node = this.nodeMap.get(id);
			if (!node) continue;

			// If the node itself is collapsed, expand it
			if (this.collapsedIds.has(id)) {
				this.collapsedIds.delete(id);
				changed = true;
				continue;
			}

			// Find shallowest collapsed descendants
			const shallowest = this.findShallowestCollapsed(node, 0);
			if (shallowest.depth === Infinity) continue;

			for (const n of shallowest.nodes) {
				this.collapsedIds.delete(n.source.id);
				changed = true;
			}
		}

		if (changed) void this.renderAnimated();
	}

	/**
	 * Find collapsed nodes at the shallowest depth under a given node.
	 */
	private findShallowestCollapsed(
		node: LayoutNode,
		depth: number,
	): { depth: number; nodes: LayoutNode[] } {
		let minDepth = Infinity;
		let result: LayoutNode[] = [];

		for (const child of node.children) {
			if (this.collapsedIds.has(child.source.id)) {
				if (depth + 1 < minDepth) {
					minDepth = depth + 1;
					result = [child];
				} else if (depth + 1 === minDepth) {
					result.push(child);
				}
			} else {
				const sub = this.findShallowestCollapsed(child, depth + 1);
				if (sub.depth < minDepth) {
					minDepth = sub.depth;
					result = sub.nodes;
				} else if (sub.depth === minDepth) {
					result.push(...sub.nodes);
				}
			}
		}

		return { depth: minDepth, nodes: result };
	}

	/**
	 * Fold all: collapse all descendants of selected nodes.
	 */
	private foldAll(): void {
		const targetIds =
			this.selectedNodeIds.size > 0
				? [...this.selectedNodeIds]
				: this.selectedNodeId
					? [this.selectedNodeId]
					: [];
		let changed = false;

		for (const id of targetIds) {
			const node = this.nodeMap.get(id);
			if (!node) continue;

			const descendants = this.getDescendantIds(node);
			for (const descId of descendants) {
				const descNode = this.nodeMap.get(descId);
				if (
					descNode &&
					descNode.children.length > 0 &&
					!this.collapsedIds.has(descId)
				) {
					this.collapsedIds.add(descId);
					changed = true;
				}
			}
			// Also collapse the node itself if it has children
			if (node.children.length > 0 && !this.collapsedIds.has(id)) {
				this.collapsedIds.add(id);
				changed = true;
			}
		}

		if (changed) void this.renderAnimated();
	}

	/**
	 * Unfold all: expand all descendants of selected nodes.
	 * Uses source tree to find collapsed children (layout tree omits them).
	 */
	private unfoldAll(): void {
		const targetIds =
			this.selectedNodeIds.size > 0
				? [...this.selectedNodeIds]
				: this.selectedNodeId
					? [this.selectedNodeId]
					: [];
		let changed = false;

		for (const id of targetIds) {
			const node = this.nodeMap.get(id);
			if (!node) continue;

			// Uncollapse this node
			if (this.collapsedIds.has(id)) {
				this.collapsedIds.delete(id);
				changed = true;
			}
			// Uncollapse all descendants via source tree
			const descendants = this.getSourceDescendantIds(node.source);
			for (const descId of descendants) {
				if (this.collapsedIds.has(descId)) {
					this.collapsedIds.delete(descId);
					changed = true;
				}
			}
		}

		if (changed) void this.renderAnimated();
	}

	// ─── Cursor Sync ────────────────────────────────────────

	/**
	 * Poll the active editor's cursor position and highlight the corresponding map node.
	 * Uses a polling interval because Obsidian doesn't expose a reliable cursor-change event.
	 */
	private syncEditorCursorToMap(): void {
		if (!this.isCursorSyncEnabled() || this.suppressCursorSync) return;
		if (!this.currentTree) return;

		const editor = this.getActiveEditor();
		if (!editor) return;

		const cursor = editor.getCursor();
		const offset = editor.posToOffset(cursor);
		const node = this.parser.findNodeAtPosition(this.currentTree, offset);
		if (!node || node.type === "root") {
			this.setCursorSyncHighlight(null);
			return;
		}

		if (node.id !== this.cursorSyncNodeId) {
			this.setCursorSyncHighlight(node.id);
		}
	}

	/**
	 * Move the editor cursor to the start of a node's range.
	 */
	private syncMapSelectionToEditor(nodeId: string): void {
		if (!this.isCursorSyncEnabled()) return;

		const layoutNode = this.nodeMap.get(nodeId);
		if (!layoutNode) return;

		const editor = this.getActiveEditor();
		if (!editor) return;

		const pos = editor.offsetToPos(layoutNode.source.range.start);
		this.suppressCursorSync = true;
		editor.setCursor(pos);
		this.suppressCursorSync = false;
	}

	/**
	 * Apply or remove the cursor-sync highlight CSS class.
	 */
	private setCursorSyncHighlight(nodeId: string | null): void {
		if (!this.svg) return;

		// Remove old highlight
		if (this.cursorSyncNodeId) {
			const old = this.svg.querySelector(
				`[data-node-id="${this.cursorSyncNodeId}"]`,
			);
			old?.classList.remove("osmosis-node-cursor-synced");
		}

		this.cursorSyncNodeId = nodeId;

		// Apply new highlight
		if (nodeId) {
			const el = this.svg.querySelector(`[data-node-id="${nodeId}"]`);
			el?.classList.add("osmosis-node-cursor-synced");
		}
	}

	private isCursorSyncEnabled(): boolean {
		return this.plugin?.settings?.cursorSync ?? true;
	}

	/**
	 * Get the editor from a MarkdownView showing our current file.
	 */
	private getActiveEditor(): MarkdownView["editor"] | null {
		const leaves = this.app.workspace.getLeavesOfType("markdown");
		for (const leaf of leaves) {
			const view = leaf.view;
			if (
				view instanceof MarkdownView &&
				view.file === this.currentFile
			) {
				return view.editor;
			}
		}
		return null;
	}

	// ─── Drag-and-Drop ──────────────────────────────────────

	private startDrag(nodeId: string): void {
		if (!this.svg) return;
		const node = this.nodeMap.get(nodeId);
		if (!node) return;

		this.isDragging = true;
		// Preserve multi-selection if dragging a node that's already selected
		if (!this.selectedNodeIds.has(nodeId)) {
			this.selectNode(nodeId);
		}
		this.contentEl.addClass("osmosis-dragging");

		// Create ghost node (semi-transparent clone)
		const offsetX = this.getOffsetX();
		const offsetY = this.getOffsetY();
		const ghost = document.createElementNS(SVG_NS, "g");
		ghost.setAttribute("class", "osmosis-drag-ghost");

		const rect = document.createElementNS(SVG_NS, "rect");
		rect.setAttribute("width", String(node.rect.width));
		rect.setAttribute("height", String(node.rect.height));
		rect.setAttribute("rx", "4");
		rect.setAttribute(
			"class",
			"osmosis-node osmosis-node-" + node.source.type,
		);
		ghost.appendChild(rect);

		const fo = document.createElementNS(SVG_NS, "foreignObject");
		fo.setAttribute("width", String(node.rect.width));
		fo.setAttribute("height", String(node.rect.height));
		const wrapper = document.createElementNS(
			XHTML_NS,
			"div",
		) as HTMLDivElement;
		wrapper.setAttribute("xmlns", XHTML_NS);
		wrapper.className = "osmosis-node-content";
		wrapper.textContent = node.source.content;
		fo.appendChild(wrapper);
		ghost.appendChild(fo);

		// Position at the node's current location
		const nx = node.rect.x + offsetX;
		const ny = node.rect.y + offsetY;
		ghost.setAttribute("transform", `translate(${nx}, ${ny})`);
		this.svg.appendChild(ghost);
		this.dragGhost = ghost;

		// Create drop indicator line
		const indicator = document.createElementNS(SVG_NS, "line");
		indicator.setAttribute("class", "osmosis-drop-indicator");
		indicator.setAttribute("display", "none");
		this.svg.appendChild(indicator);
		this.dropIndicator = indicator;
	}

	private updateDrag(e: MouseEvent): void {
		if (!this.svg || !this.dragGhost || !this.dragNodeId) return;

		const svgPt = this.screenToSvg(e.clientX, e.clientY);

		// Move ghost to follow cursor (centered on cursor)
		const node = this.nodeMap.get(this.dragNodeId);
		if (!node) return;
		const gx = svgPt.x - node.rect.width / 2;
		const gy = svgPt.y - node.rect.height / 2;
		this.dragGhost.setAttribute("transform", `translate(${gx}, ${gy})`);

		// Find drop target
		this.updateDropTarget(svgPt);
	}

	private updateDropTarget(svgPt: { x: number; y: number }): void {
		if (!this.dragNodeId || !this.currentLayout) return;

		const offsetX = this.getOffsetX();
		const offsetY = this.getOffsetY();
		const dragNode = this.nodeMap.get(this.dragNodeId);
		if (!dragNode) return;

		let bestDist = Infinity;
		let bestTarget: { parentId: string; index: number } | null = null;
		let indicatorY = 0;
		let indicatorX1 = 0;
		let indicatorX2 = 0;

		// Check each visible node for potential drop positions
		for (const [, layoutNode] of this.nodeMap) {
			if (!layoutNode.parent) continue;

			// Can't drop onto self or descendants
			if (this.isDescendant(dragNode, layoutNode)) continue;

			const nodeX = layoutNode.rect.x + offsetX;
			const nodeY = layoutNode.rect.y + offsetY;
			const nodeCY = nodeY + layoutNode.rect.height / 2;

			// Use weighted 2D distance so nodes at cursor's X-level are preferred
			// over nodes at different depths that happen to be close in Y
			const nodeCX = nodeX + layoutNode.rect.width / 2;
			const dx = svgPt.x - nodeCX;

			// Check gap above this node (insert before)
			const gapAbove = nodeY;
			const dyAbove = svgPt.y - gapAbove;
			const distAbove = Math.sqrt(dyAbove * dyAbove + dx * dx * 0.25);
			if (distAbove < bestDist && Math.abs(dx) < 300) {
				const parentNode = layoutNode.parent;
				const siblingIdx = parentNode.children.indexOf(layoutNode);
				// Don't allow dropping right back where it came from
				if (
					!this.isSamePosition(
						dragNode,
						parentNode.source.id,
						siblingIdx,
					)
				) {
					bestDist = distAbove;
					bestTarget = {
						parentId: parentNode.source.id,
						index: siblingIdx,
					};
					indicatorY = gapAbove;
					indicatorX1 = nodeX;
					indicatorX2 = nodeX + layoutNode.rect.width;
				}
			}

			// Check gap below this node (insert after)
			const gapBelow = nodeY + layoutNode.rect.height;
			const dyBelow = svgPt.y - gapBelow;
			const distBelow = Math.sqrt(dyBelow * dyBelow + dx * dx * 0.25);
			if (distBelow < bestDist && Math.abs(dx) < 300) {
				const parentNode = layoutNode.parent;
				const siblingIdx = parentNode.children.indexOf(layoutNode) + 1;
				if (
					!this.isSamePosition(
						dragNode,
						parentNode.source.id,
						siblingIdx,
					)
				) {
					bestDist = distBelow;
					bestTarget = {
						parentId: parentNode.source.id,
						index: siblingIdx,
					};
					indicatorY = gapBelow;
					indicatorX1 = nodeX;
					indicatorX2 = nodeX + layoutNode.rect.width;
				}
			}

			// Check reparent: if cursor is to the right of a node, drop as its child
			const rightEdge = nodeX + layoutNode.rect.width + 30;
			if (
				svgPt.x > rightEdge &&
				Math.abs(svgPt.y - nodeCY) < layoutNode.rect.height
			) {
				const dist = Math.abs(svgPt.y - nodeCY);
				if (dist < bestDist) {
					// Don't reparent to self
					if (
						layoutNode.source.id !== this.dragNodeId &&
						!this.isDescendant(dragNode, layoutNode)
					) {
						bestDist = dist;
						bestTarget = {
							parentId: layoutNode.source.id,
							index: layoutNode.children.length,
						};
						indicatorY = nodeCY;
						indicatorX1 = rightEdge;
						indicatorX2 = rightEdge + 40;
					}
				}
			}
		}

		this.dropTarget = bestTarget;

		// Update visual indicator
		if (this.dropIndicator) {
			if (bestTarget) {
				this.dropIndicator.setAttribute("x1", String(indicatorX1));
				this.dropIndicator.setAttribute("y1", String(indicatorY));
				this.dropIndicator.setAttribute("x2", String(indicatorX2));
				this.dropIndicator.setAttribute("y2", String(indicatorY));
				this.dropIndicator.removeAttribute("display");
			} else {
				this.dropIndicator.setAttribute("display", "none");
			}
		}
	}

	private isDescendant(ancestor: LayoutNode, node: LayoutNode): boolean {
		if (node.source.id === ancestor.source.id) return true;
		for (const child of ancestor.children) {
			if (this.isDescendant(child, node)) return true;
		}
		return false;
	}

	private isSamePosition(
		dragNode: LayoutNode,
		parentId: string,
		index: number,
	): boolean {
		if (!dragNode.parent) return false;
		const currentParentId = dragNode.parent.source.id;
		const currentIndex = dragNode.parent.children.indexOf(dragNode);
		return (
			currentParentId === parentId &&
			(index === currentIndex || index === currentIndex + 1)
		);
	}

	private async executeDrop(): Promise<void> {
		const dragNodeId = this.dragNodeId;
		const dropTarget = this.dropTarget;
		// Snapshot selected IDs before cleanup clears drag state
		const selectedIds = new Set(this.selectedNodeIds);

		this.cleanupDrag();

		if (
			!dragNodeId ||
			!dropTarget ||
			!this.currentFile ||
			!this.currentTree
		)
			return;

		const dragNode = this.nodeMap.get(dragNodeId);
		if (!dragNode?.parent) return;

		const content = await this.app.vault.read(this.currentFile);

		// Find the target parent and insertion point
		const targetParent = this.findNodeById(
			this.currentTree.root,
			dropTarget.parentId,
		);
		if (!targetParent) return;

		// Collect all selected siblings (multi-select support, like Alt+Arrow)
		const parentSrc = dragNode.parent.source;
		const siblings = parentSrc.children;
		const selectedIndices: number[] = [];
		for (let i = 0; i < siblings.length; i++) {
			const sib = siblings[i];
			if (sib && selectedIds.has(sib.id)) {
				selectedIndices.push(i);
			}
		}
		selectedIndices.sort((a, b) => a - b);

		// Fall back to just the dragged node if none of the selection is among siblings
		if (selectedIndices.length === 0) {
			const dragIdx = siblings.indexOf(dragNode.source);
			if (dragIdx >= 0) selectedIndices.push(dragIdx);
			else return;
		}

		// Collect block range spanning all selected subtrees
		const selectedSrcs = selectedIndices.map((i) => siblings[i]!);
		const blockStart = selectedSrcs[0]!.range.start;
		const blockEnd = this.subtreeEnd(
			selectedSrcs[selectedSrcs.length - 1]!,
		);

		// Re-indent each selected node's subtree individually
		const reindentedParts: string[] = [];
		for (const nodeSrc of selectedSrcs) {
			const nodeText = content.slice(
				nodeSrc.range.start,
				this.subtreeEnd(nodeSrc),
			);
			const newType = this.inferDropType(targetParent, dropTarget.index, nodeSrc);
			const newDepth = this.inferDropDepth(
				targetParent,
				dropTarget.index,
				newType,
			);
			reindentedParts.push(
				this.reindentSubtree(nodeText, nodeSrc, newType, newDepth),
			);
		}
		let dragText = reindentedParts.join("\n");

		// Determine insertion offset in the markdown
		let insertOffset: number;
		if (dropTarget.index >= targetParent.children.length) {
			// Append after last child's subtree
			if (targetParent.children.length > 0) {
				const lastChild =
					targetParent.children[targetParent.children.length - 1];
				if (lastChild) {
					insertOffset = this.subtreeEnd(lastChild);
				} else {
					insertOffset = this.subtreeEnd(targetParent);
				}
			} else {
				insertOffset = targetParent.range.end;
			}
		} else {
			// Insert before the child at dropTarget.index
			const targetChild = targetParent.children[dropTarget.index];
			if (targetChild) {
				insertOffset = targetChild.range.start;
			} else {
				insertOffset = this.subtreeEnd(targetParent);
			}
		}

		// Build new content: remove old, insert at new position
		// Must handle the case where removal shifts the insert position
		let removeStart = blockStart;
		let removeEnd = blockEnd;

		// Consume all surrounding blank lines at the removal site so they
		// don't accumulate on repeated moves. normalizeHeadingSpacing will
		// re-add proper spacing around headings and top-level code fences.
		while (removeStart > 0 && content[removeStart - 1] === "\n") {
			removeStart--;
		}
		while (removeEnd < content.length && content[removeEnd] === "\n") {
			removeEnd++;
		}
		// Re-add exactly one \n as separator between surrounding content
		if (removeStart > 0 && removeEnd < content.length) {
			removeStart++; // preserve one \n from the leading newlines
		}

		let updated: string;
		if (removeStart < insertOffset) {
			// Dragging forward: remove first, then adjust insert position
			const afterRemove =
				content.slice(0, removeStart) + content.slice(removeEnd);
			const adjustedInsert = insertOffset - (removeEnd - removeStart);
			const prefix =
				adjustedInsert > 0 && afterRemove[adjustedInsert - 1] !== "\n"
					? "\n"
					: "";
			const suffix =
				adjustedInsert < afterRemove.length &&
				afterRemove[adjustedInsert] !== "\n"
					? "\n"
					: "";
			updated =
				afterRemove.slice(0, adjustedInsert) +
				prefix +
				dragText +
				suffix +
				afterRemove.slice(adjustedInsert);
		} else {
			// Dragging backward: insert first, then remove (with adjusted position)
			const prefix =
				insertOffset > 0 && content[insertOffset - 1] !== "\n"
					? "\n"
					: "";
			const suffix =
				insertOffset < content.length && content[insertOffset] !== "\n"
					? "\n"
					: "";
			const afterInsert =
				content.slice(0, insertOffset) +
				prefix +
				dragText +
				suffix +
				content.slice(insertOffset);
			const shift = prefix.length + dragText.length + suffix.length;
			updated =
				afterInsert.slice(0, removeStart + shift) +
				afterInsert.slice(removeEnd + shift);
		}

		const movedContents = selectedSrcs.map((s) => s.content);
		await this.writeMarkdown(this.renumberOrderedLists(updated));
		this.reselectMultiAfterMove(movedContents);
	}

	private cleanupDrag(): void {
		this.isDragging = false;
		this.dragNodeId = null;
		this.dropTarget = null;
		this.contentEl.removeClass("osmosis-dragging");

		if (this.dragGhost) {
			this.dragGhost.remove();
			this.dragGhost = null;
		}
		if (this.dropIndicator) {
			this.dropIndicator.remove();
			this.dropIndicator = null;
		}
	}

	private findNodeById(node: OsmosisNode, id: string): OsmosisNode | null {
		if (node.id === id) return node;
		for (const child of node.children) {
			const found = this.findNodeById(child, id);
			if (found) return found;
		}
		return null;
	}

	private inferChildType(parent: OsmosisNode): OsmosisNode["type"] {
		if (parent.type === "heading" || parent.type === "root")
			return "bullet";
		return parent.type;
	}

	private inferChildDepth(parent: OsmosisNode): number {
		if (parent.type === "heading" || parent.type === "root") return 0;
		return parent.depth + 1;
	}

	/**
	 * Infer heading level when promoting a root child to a heading.
	 * Matches the nearest heading sibling's level, defaulting to h1.
	 */
	private inferRootHeadingLevel(root: OsmosisNode, index: number): number {
		const siblings = root.children;
		// Check neighbors outward from the index
		for (let dist = 1; dist < siblings.length; dist++) {
			for (const i of [index - dist, index + dist]) {
				const sib = siblings[i];
				if (sib?.type === "heading") return sib.depth;
			}
		}
		return 1;
	}

	/**
	 * Determine the new type when indenting a node under a new parent.
	 * Headings indenting under headings stay as headings (deeper level).
	 * Non-headings indenting under headings become bullets.
	 */
	private inferIndentType(
		newParent: OsmosisNode,
		movingNode: OsmosisNode,
	): OsmosisNode["type"] {
		if (
			movingNode.type === "heading" &&
			(newParent.type === "heading" || newParent.type === "root")
		) {
			return "heading";
		}
		return this.inferChildType(newParent);
	}

	/**
	 * Determine the new depth when indenting a node under a new parent.
	 * Headings get parent depth + 1. Lists get standard child depth.
	 */
	private inferIndentDepth(
		newParent: OsmosisNode,
		movingNode: OsmosisNode,
	): number {
		if (
			movingNode.type === "heading" &&
			(newParent.type === "heading" || newParent.type === "root")
		) {
			return Math.min(6, newParent.depth + 1);
		}
		return this.inferChildDepth(newParent);
	}

	/**
	 * Determine the new type for a drag-and-drop operation.
	 * Unlike indent (which makes children), D&D places nodes as siblings.
	 * When dropping between heading siblings, non-heading nodes promote to headings.
	 * List items (bullet/ordered) preserve their own type.
	 */
	private inferDropType(
		targetParent: OsmosisNode,
		dropIndex: number,
		movingNode: OsmosisNode,
	): OsmosisNode["type"] {
		if (targetParent.type === "heading" || targetParent.type === "root") {
			// Check if neighboring siblings at the drop position are headings
			const neighbor =
				targetParent.children[dropIndex] ??
				targetParent.children[dropIndex - 1];
			if (neighbor?.type === "heading") return "heading";
		}
		// List items preserve their own type
		if (movingNode.type === "bullet" || movingNode.type === "ordered") {
			return movingNode.type;
		}
		return this.inferChildType(targetParent);
	}

	/**
	 * Determine the new depth for a drag-and-drop operation.
	 * Matches the depth of neighboring siblings at the drop position.
	 */
	private inferDropDepth(
		targetParent: OsmosisNode,
		dropIndex: number,
		dropType: OsmosisNode["type"],
	): number {
		if (dropType === "heading") {
			const neighbor =
				targetParent.children[dropIndex] ??
				targetParent.children[dropIndex - 1];
			if (neighbor?.type === "heading") return neighbor.depth;
			return Math.min(6, targetParent.depth + 1);
		}
		return this.inferChildDepth(targetParent);
	}

	/**
	 * Re-indent a subtree's text to match a new type/depth.
	 * Adjusts the first line and all descendant lines proportionally.
	 * Handles cross-type transitions (heading↔bullet) where depth semantics differ.
	 */
	private reindentSubtree(
		text: string,
		originalNode: OsmosisNode,
		newType: OsmosisNode["type"],
		newDepth: number,
	): string {
		// Code blocks and tables are atomic — never re-indent their contents
		if (originalNode.type === "codeblock" || originalNode.type === "table") return text;

		// When converting heading → list type, strip internal blank lines
		// that were added by normalizeHeadingSpacing — they break list nesting.
		const crossingToList =
			originalNode.type === "heading" && newType !== "heading";
		const rawLines = text.split("\n");
		const lines = crossingToList
			? rawLines.filter((l) => l.trim() !== "")
			: rawLines;
		const result: string[] = [];

		// Calculate child depth delta — depends on whether we're crossing type boundaries.
		// Heading children start at bullet depth 0; bullet children are at parent depth + 1.
		const oldChildBase =
			originalNode.type === "heading" || originalNode.type === "root" || originalNode.type === "paragraph"
				? 0
				: originalNode.depth + 1;
		const newChildBase =
			newType === "heading" || newType === "root" || newType === "paragraph" ? 0 : newDepth + 1;
		const childDepthDelta = newChildBase - oldChildBase;

		let inFence = false;
		let fenceChar = "";
		let fenceLen = 0;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line === undefined) continue;
			if (line.trim() === "") {
				result.push(line);
				continue;
			}

			// Code block: leave all lines (fences + content) untouched
			const trimmed = line.trimStart();
			const fm = /^(`{3,}|~{3,})(.*)$/.exec(trimmed);
			if (inFence) {
				if (
					fm?.[1] &&
					fm[1].charAt(0) === fenceChar &&
					fm[1].length >= fenceLen &&
					(fm[2] ?? "").trim() === ""
				) {
					inFence = false;
				}
				result.push(line);
				continue;
			} else if (fm?.[1]) {
				inFence = true;
				fenceChar = fm[1].charAt(0);
				fenceLen = fm[1].length;
				result.push(line);
				continue;
			}

			if (i === 0) {
				// First line: serialize with new type and depth
				result.push(
					this.serializeLine(newType, newDepth, originalNode.content),
				);
			} else {
				// Descendant lines: check if heading or list
				const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
				if (headingMatch?.[1]) {
					// Heading descendant: adjust heading level
					const oldLevel = headingMatch[1].length;
					const newLevel = Math.max(
						1,
						Math.min(6, oldLevel + childDepthDelta),
					);
					result.push(
						"#".repeat(newLevel) + " " + (headingMatch[2] ?? ""),
					);
				} else {
					// List/other descendant: adjust tab indentation
					const match = line.match(/^(\t*)([ ]*)/);
					const currentTabs = match?.[1]?.length ?? 0;
					const currentSpaces = match?.[2]?.length ?? 0;
					const currentDepth =
						currentTabs + Math.floor(currentSpaces / 2);
					const newTabDepth = Math.max(
						0,
						currentDepth + childDepthDelta,
					);
					result.push("\t".repeat(newTabDepth) + line.trimStart());
				}
			}
		}

		return result.join("\n");
	}

	// ─── Keyboard ────────────────────────────────────────────

	private handleKeyDown(e: KeyboardEvent): void {
		// Don't handle keys during editing
		if (this.editingNodeId) {
			if (e.key === "Escape") {
				this.stopEditing(false);
				e.preventDefault();
			}
			return;
		}

		switch (e.key) {
			case "ArrowUp":
				if (e.altKey) {
					void this.moveNodeUpDown(-1);
				} else if (e.shiftKey) {
					this.extendSelectionSibling(-1);
				} else {
					this.navigateSibling(-1);
				}
				e.preventDefault();
				break;
			case "ArrowDown":
				if (e.altKey) {
					void this.moveNodeUpDown(1);
				} else if (e.shiftKey) {
					this.extendSelectionSibling(1);
				} else {
					this.navigateSibling(1);
				}
				e.preventDefault();
				break;
			case "ArrowLeft":
				if (e.altKey) {
					void this.outdentNode();
				} else if (e.shiftKey) {
					this.extendSelectionToParent();
				} else {
					this.navigateToParent();
				}
				e.preventDefault();
				break;
			case "ArrowRight":
				if (e.altKey) {
					void this.indentNode();
				} else if (e.shiftKey) {
					this.extendSelectionToChildren();
				} else {
					this.navigateToFirstChild();
				}
				e.preventDefault();
				break;
			case "Tab":
				e.preventDefault();
				if (this.selectedNodeId) {
					const tabNode = this.nodeMap.get(this.selectedNodeId);
					if (tabNode) {
						void this.addChildNode(tabNode);
					}
				}
				break;
			case "Enter":
				if (this.selectedNodeId) {
					if (e.ctrlKey || e.metaKey) {
						// Ctrl+Enter = insert parent topic
						const parentEnterNode = this.nodeMap.get(
							this.selectedNodeId,
						);
						if (parentEnterNode) {
							void this.insertParentNode(parentEnterNode);
						}
					} else {
						// Enter = add sibling after selected node
						const enterNode = this.nodeMap.get(this.selectedNodeId);
						if (enterNode) {
							void this.addSiblingNode(enterNode);
						}
					}
					e.preventDefault();
				}
				break;
			case "F2":
				if (this.selectedNodeId) {
					this.startEditing(this.selectedNodeId);
					e.preventDefault();
				}
				break;
			case "Delete":
			case "Backspace":
				if (this.selectedNodeIds.size > 1) {
					void this.deleteSelectedNodes();
				} else if (this.selectedNodeId) {
					const delNode = this.nodeMap.get(this.selectedNodeId);
					if (delNode) {
						void this.deleteNode(delNode);
					}
				}
				e.preventDefault();
				break;
			case " ":
				// Space = toggle collapse on selected node(s)
				if (this.selectedNodeIds.size > 1) {
					this.toggleCollapseSelected();
					e.preventDefault();
				} else if (this.selectedNodeId) {
					const node = this.nodeMap.get(this.selectedNodeId);
					if (node && (node.children.length > 0 || node.collapsed)) {
						this.toggleCollapse(this.selectedNodeId);
						e.preventDefault();
					}
				}
				break;
			case "c":
				// Ctrl/Cmd+C = copy node(s)
				if ((e.ctrlKey || e.metaKey) && this.selectedNodeId) {
					e.preventDefault();
					void this.copySelectedNodes(false);
				}
				break;
			case "x":
				// Ctrl/Cmd+X = cut node(s)
				if ((e.ctrlKey || e.metaKey) && this.selectedNodeId) {
					e.preventDefault();
					void this.copySelectedNodes(true);
				}
				break;
			case "v":
				// Ctrl/Cmd+V = paste node(s)
				if (
					(e.ctrlKey || e.metaKey) &&
					this.selectedNodeId &&
					this.clipboardText
				) {
					e.preventDefault();
					void this.pasteNodes();
				}
				break;
			case "d":
				// Ctrl/Cmd+D = duplicate node
				if ((e.ctrlKey || e.metaKey) && this.selectedNodeId) {
					e.preventDefault();
					const dupNode = this.nodeMap.get(this.selectedNodeId);
					if (dupNode) {
						void this.duplicateNode(dupNode);
					}
				}
				break;
			case "a":
				// Ctrl/Cmd+A = select all
				if (e.ctrlKey || e.metaKey) {
					e.preventDefault();
					this.selectNodes(new Set(this.nodeMap.keys()));
				}
				break;
			case "[":
			case "{": // Shift+[ produces "{" as e.key
				if ((e.ctrlKey || e.metaKey) && this.selectedNodeId) {
					e.preventDefault();
					if (e.shiftKey) {
						this.foldAll(); // Ctrl+Shift+[ = fold all children
					} else {
						this.foldOneLevel(); // Ctrl+[ = fold deepest visible level
					}
				}
				break;
			case "]":
			case "}": // Shift+] produces "}" as e.key
				if ((e.ctrlKey || e.metaKey) && this.selectedNodeId) {
					e.preventDefault();
					if (e.shiftKey) {
						this.unfoldAll(); // Ctrl+Shift+] = unfold all children
					} else {
						this.unfoldOneLevel(); // Ctrl+] = unfold shallowest collapsed level
					}
				}
				break;
			case "z":
			case "Z": // Shift+z produces "Z" as e.key
				// Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z = redo
				if (e.ctrlKey || e.metaKey) {
					e.preventDefault();
					this.forwardUndoRedo(e.shiftKey);
				}
				break;
			case "y":
				// Ctrl/Cmd+Y = redo (Windows convention)
				if (e.ctrlKey || e.metaKey) {
					e.preventDefault();
					this.forwardUndoRedo(true);
				}
				break;
		}
	}

	private navigateSibling(direction: number): void {
		if (!this.selectedNodeId) {
			this.selectFirstNode();
			return;
		}

		const node = this.nodeMap.get(this.selectedNodeId);
		if (!node?.parent) return;

		const siblings = node.parent.children;
		const idx = siblings.indexOf(node);
		const newIdx = idx + direction;
		const target = siblings[newIdx];
		if (newIdx >= 0 && newIdx < siblings.length && target) {
			this.selectNode(target.source.id);
			this.scrollToSelectedNode();
		} else {
			// Jump to cousin at same depth
			const cousin = this.findCousin(node, direction);
			if (cousin) {
				this.selectNode(cousin.source.id);
				this.scrollToSelectedNode();
			}
		}
	}

	/**
	 * Find the adjacent cousin node at the same depth level.
	 * When at end of siblings, traverses up to parent's sibling, then down to its child.
	 */
	private findCousin(node: LayoutNode, direction: number): LayoutNode | null {
		const parent = node.parent;
		if (!parent?.parent) return null;

		const parentSiblings = parent.parent.children;
		const parentIdx = parentSiblings.indexOf(parent);
		const nextParentIdx = parentIdx + direction;
		const nextParent = parentSiblings[nextParentIdx];

		if (
			nextParentIdx < 0 ||
			nextParentIdx >= parentSiblings.length ||
			!nextParent
		) {
			// Recursively look for cousins further up
			const parentCousin = this.findCousin(parent, direction);
			if (parentCousin && parentCousin.children.length > 0) {
				return direction > 0
					? parentCousin.children[0]!
					: parentCousin.children[parentCousin.children.length - 1]!;
			}
			return null;
		}

		if (nextParent.children.length === 0) return null;
		return direction > 0
			? nextParent.children[0]!
			: nextParent.children[nextParent.children.length - 1]!;
	}

	private navigateToParent(): void {
		if (!this.selectedNodeId) {
			this.selectFirstNode();
			return;
		}

		const node = this.nodeMap.get(this.selectedNodeId);
		if (node?.parent && node.parent.source.type !== "root") {
			this.selectNode(node.parent.source.id);
			this.scrollToSelectedNode();
		}
	}

	private navigateToFirstChild(): void {
		if (!this.selectedNodeId) {
			this.selectFirstNode();
			return;
		}

		const node = this.nodeMap.get(this.selectedNodeId);
		if (!node) return;

		// If collapsed, expand first
		if (
			this.collapsedIds.has(this.selectedNodeId) &&
			node.source.children.length > 0
		) {
			this.toggleCollapse(this.selectedNodeId);
			return;
		}

		const firstChild = node.children[0];
		if (firstChild) {
			this.selectNode(firstChild.source.id);
			this.scrollToSelectedNode();
		}
	}

	/**
	 * Extend selection to the next/previous sibling (Shift+Up/Down).
	 */
	/**
	 * Move the selection cursor to targetId, adding or removing from selection.
	 * If target is already selected (backtracking), deselects the current node.
	 */
	private extendSelectionTo(targetId: string): void {
		this.clearSelectionVisuals();
		if (
			this.selectedNodeIds.has(targetId) &&
			this.selectedNodeId !== targetId
		) {
			// Backtracking: deselect current cursor node, move cursor to target
			if (this.selectedNodeId) {
				this.selectedNodeIds.delete(this.selectedNodeId);
			}
		} else {
			// Extending: add target to selection
			this.selectedNodeIds.add(targetId);
		}
		this.selectedNodeId = targetId;
		this.applySelectionVisuals();
		this.scrollToSelectedNode();
	}

	private extendSelectionSibling(direction: number): void {
		if (!this.selectedNodeId) {
			this.selectFirstNode();
			return;
		}

		const node = this.nodeMap.get(this.selectedNodeId);
		if (!node?.parent) return;

		const siblings = node.parent.children;
		const idx = siblings.indexOf(node);
		const newIdx = idx + direction;
		const target = siblings[newIdx];
		if (newIdx >= 0 && newIdx < siblings.length && target) {
			this.extendSelectionTo(target.source.id);
		} else {
			// Jump to cousin at same depth
			const cousin = this.findCousin(node, direction);
			if (cousin) {
				this.extendSelectionTo(cousin.source.id);
			}
		}
	}

	/**
	 * Extend selection to the parent node (Shift+Left).
	 */
	private extendSelectionToParent(): void {
		if (!this.selectedNodeId) {
			this.selectFirstNode();
			return;
		}

		const node = this.nodeMap.get(this.selectedNodeId);
		if (node?.parent && node.parent.source.type !== "root") {
			this.extendSelectionTo(node.parent.source.id);
		}
	}

	/**
	 * Extend selection to the first child (Shift+Right).
	 */
	private extendSelectionToChildren(): void {
		if (!this.selectedNodeId) {
			this.selectFirstNode();
			return;
		}

		const node = this.nodeMap.get(this.selectedNodeId);
		if (!node) return;

		// If collapsed, expand first
		if (
			this.collapsedIds.has(this.selectedNodeId) &&
			node.source.children.length > 0
		) {
			this.toggleCollapse(this.selectedNodeId);
			return;
		}

		const firstChild = node.children[0];
		if (firstChild) {
			this.extendSelectionTo(firstChild.source.id);
		}
	}

	private selectFirstNode(): void {
		if (!this.currentLayout) return;
		// Select the first non-root node
		for (const node of this.currentLayout.nodes) {
			if (node.source.type !== "root") {
				this.selectNode(node.source.id);
				this.scrollToSelectedNode();
				return;
			}
		}
	}

	private scrollToSelectedNode(): void {
		if (!this.selectedNodeId || !this.svg) return;
		const node = this.nodeMap.get(this.selectedNodeId);
		if (!node) return;

		const { x, y, width, height } = node.rect;
		const cx = x + width / 2 + this.getOffsetX();
		const cy = y + height / 2 + this.getOffsetY();

		// Check if node is visible in current viewBox
		const margin = 50;
		if (
			cx < this.viewBox.x + margin ||
			cx > this.viewBox.x + this.viewBox.w - margin ||
			cy < this.viewBox.y + margin ||
			cy > this.viewBox.y + this.viewBox.h - margin
		) {
			// Pan to center the node
			this.viewBox.x = cx - this.viewBox.w / 2;
			this.viewBox.y = cy - this.viewBox.h / 2;
			this.updateViewBox();
		}
	}

	// ─── Inline Editing ──────────────────────────────────────

	private startEditing(nodeId: string): void {
		if (this.editingNodeId) {
			this.stopEditing(true);
		}

		const node = this.nodeMap.get(nodeId);
		if (!node || !this.svg) return;

		this.editingNodeId = nodeId;
		this.selectNode(nodeId);

		const group = this.svg.querySelector(`[data-node-id="${nodeId}"]`);
		if (!group) return;

		const rectEl = group.querySelector("rect.osmosis-node");
		if (!rectEl) return;

		// Get the node's screen position from the SVG rect element
		const screenRect = rectEl.getBoundingClientRect();

		// Hide the in-SVG content while the overlay is active
		const fo = group.querySelector("foreignObject");
		if (fo) fo.classList.add("osmosis-fo-hidden");

		// On mobile, tell the Chromium WebView to overlay the keyboard instead
		// of resizing the viewport (the root cause of the map disappearing).
		// VirtualKeyboard API is not in TS standard lib, so we need unsafe access.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
		const vk: {
			overlaysContent: boolean;
			addEventListener: (type: string, fn: () => void) => void;
			removeEventListener: (type: string, fn: () => void) => void;
		} | null =
			"virtualKeyboard" in navigator
				? (navigator as any).virtualKeyboard
				: null;
		if (vk) vk.overlaysContent = true;

		// Scale font size to match the current zoom level so text appears
		// the same size as the rendered node content
		const baseFontSize = 13;
		const scaledFontSize = baseFontSize * this.zoom;

		const isMobile = Platform.isMobile;

		// Create container div for the embedded editor
		const container = document.createElement("div");
		container.className = "osmosis-edit-overlay";

		if (isMobile) {
			// Lock the SVG to position:fixed so it escapes Obsidian's layout
			// resize when the virtual keyboard opens. The SVG keeps its
			// pre-keyboard pixel dimensions and is unaffected by parent shrinking.
			if (this.svg) {
				const svgRect = this.svg.getBoundingClientRect();
				const s = this.svg.style;
				s.position = "fixed";
				s.left = `${svgRect.left}px`;
				s.top = `${svgRect.top}px`;
				s.width = `${svgRect.width}px`;
				s.height = `${svgRect.height}px`;
				s.zIndex = "9998";
			}

			const availableH =
				window.visualViewport?.height ?? window.innerHeight;

			// Mobile: use fixed positioning on document.body to escape
			// Obsidian's layout resize when the keyboard opens.
			container.setCssStyles({
				position: "fixed",
				left: `${screenRect.left}px`,
				top: `${screenRect.top}px`,
				minWidth: `${screenRect.width}px`,
				minHeight: `${screenRect.height}px`,
				maxWidth: `${window.innerWidth - screenRect.left - 8}px`,
				maxHeight: `${availableH - 10}px`,
				fontSize: `${scaledFontSize}px`,
				zIndex: "10000",
			});
			document.body.appendChild(container);
		} else {
			// Desktop: absolute positioning inside container
			const containerRect = this.contentEl.getBoundingClientRect();
			const availableWidth = containerRect.right - screenRect.left - 16;
			container.setCssStyles({
				position: "absolute",
				left: `${screenRect.left - containerRect.left}px`,
				top: `${screenRect.top - containerRect.top}px`,
				minWidth: `${screenRect.width}px`,
				minHeight: `${screenRect.height}px`,
				maxWidth: `${availableWidth}px`,
				maxHeight: `${containerRect.height}px`,
				fontSize: `${scaledFontSize}px`,
				zIndex: "1000",
			});
			this.contentEl.appendChild(container);
		}

		this.editContainer = container;

		// Add save/cancel buttons floating above the editor
		const cancelBtn = document.createElement("button");
		cancelBtn.className = "osmosis-edit-btn osmosis-edit-cancel";
		cancelBtn.setAttribute("aria-label", "Cancel editing");
		cancelBtn.textContent = "Cancel";
		cancelBtn.addEventListener("pointerdown", (e) => {
			e.preventDefault(); // Prevent blur
			e.stopPropagation();
			this.stopEditing(false);
		});
		const saveBtn = document.createElement("button");
		saveBtn.className = "osmosis-edit-btn osmosis-edit-save";
		saveBtn.setAttribute("aria-label", "Save changes");
		saveBtn.textContent = "Save";
		saveBtn.addEventListener("pointerdown", (e) => {
			e.preventDefault(); // Prevent blur
			e.stopPropagation();
			this.stopEditing(true);
		});
		container.appendChild(cancelBtn);
		container.appendChild(saveBtn);

		// Stack buttons vertically when container is too narrow for side-by-side
		if (screenRect.width < 160) {
			container.classList.add("osmosis-edit-narrow");
		}

		// Prevent clicks on the editor container from reaching the SVG/mind map
		container.addEventListener("pointerdown", (e) => e.stopPropagation());
		container.addEventListener("click", (e) => e.stopPropagation());

		// For checkbox nodes, strip the [ ]/[x] prefix for editing
		let editValue = node.source.content;
		if (node.source.metadata?.checkbox) {
			editValue = editValue.replace(/^\[[ xX]\]\s*/, "");
		}

		// Try to instantiate the embedded Obsidian editor; fall back to textarea
		try {
			const editor = new EmbeddableMarkdownEditor(this.app, container, {
				value: editValue,
				cls: "osmosis-node-editor",
				onEnter: () => false, // Let Enter insert newline (default CM behavior)
				onSubmit: () => {
					// Ctrl+Enter saves
					// Defer so CM keymap handler returns true (suppressing the event)
					// before the editor is destroyed; otherwise the keystroke leaks
					// to the workspace and reaches the left-side markdown editor.
					queueMicrotask(() => this.stopEditing(true));
				},
				onEscape: () => {
					// Escape cancels
					queueMicrotask(() => this.stopEditing(false));
				},
				onBlur: () => {
					// Small delay to allow click events to process first
					setTimeout(() => {
						if (this.editingNodeId === nodeId) {
							this.stopEditing(true);
						}
					}, 100);
				},
				extensions: [
					autoResizeExtension(() => this.resizeEditContainer()),
				],
			});

			this.editEditor = editor;

			// Focus the CM6 editor and select all text
			editor.editor.cm.focus();
			const doc = editor.editor.cm.state.doc;
			editor.editor.cm.dispatch({
				selection: EditorSelection.range(0, doc.length),
			});
		} catch (err) {
			console.warn(
				"Osmosis: EmbeddableMarkdownEditor failed, falling back to textarea",
				err,
			);
			container.remove();
			this.editContainer = null;
			this.createFallbackTextarea(
				node,
				nodeId,
				screenRect,
				scaledFontSize,
				isMobile,
			);
		}

		// On mobile, reposition editor above keyboard if it would be hidden
		const cleanups: Array<() => void> = [];
		if (isMobile) {
			const repositionAboveKeyboard = () => {
				if (!this.editContainer) return;
				const availableH =
					window.visualViewport?.height ?? window.innerHeight;
				const elRect = this.editContainer.getBoundingClientRect();
				if (elRect.bottom > availableH - 10) {
					this.editContainer.style.top = `${availableH - elRect.height - 10}px`;
				}
			};
			if (vk) {
				vk.addEventListener("geometrychange", repositionAboveKeyboard);
				cleanups.push(() =>
					vk.removeEventListener(
						"geometrychange",
						repositionAboveKeyboard,
					),
				);
			}
			if (window.visualViewport) {
				window.visualViewport.addEventListener(
					"resize",
					repositionAboveKeyboard,
				);
				cleanups.push(() =>
					window.visualViewport?.removeEventListener(
						"resize",
						repositionAboveKeyboard,
					),
				);
			}
		}

		// Scroll lock as a safety net
		const lockScroll = () => {
			let el: Element | null = this.contentEl;
			while (el) {
				el.scrollTop = 0;
				el.scrollLeft = 0;
				el = el.parentElement;
			}
		};
		this.contentEl.addEventListener("scroll", lockScroll, true);
		cleanups.push(() =>
			this.contentEl.removeEventListener("scroll", lockScroll, true),
		);

		this.editCleanup = () => {
			for (const fn of cleanups) fn();
			if (vk) vk.overlaysContent = false;
		};

		lockScroll();
	}

	/** Auto-resize the edit container to fit the editor's content.
	 *  Called via the autoResizeExtension on doc changes. We use
	 *  requestMeasure to avoid layout thrash — just request CM6 to
	 *  re-measure, and the container's height:fit-content handles the rest. */
	private resizeEditContainer(): void {
		if (!this.editContainer || !this.editEditor) return;
		const cm = this.editEditor.editor?.cm;
		if (!cm) return;

		// Measure the longest line's pixel width using CM's character metrics
		const doc = cm.state.doc;
		const charWidth = cm.defaultCharacterWidth;
		let maxChars = 0;
		for (let i = 1; i <= doc.lines; i++) {
			maxChars = Math.max(maxChars, doc.line(i).length);
		}
		// Content width = longest line + padding (8px each side + 4px buffer + border)
		const contentWidth = maxChars * charWidth + 24;

		const minWidth = parseFloat(this.editContainer.style.minWidth) || 0;
		const maxWidth =
			parseFloat(this.editContainer.style.maxWidth) || Infinity;
		const newWidth = Math.min(Math.max(contentWidth, minWidth), maxWidth);
		this.editContainer.style.width = `${newWidth}px`;

		// Toggle stacked button layout when container is narrow
		this.editContainer.classList.toggle("osmosis-edit-narrow", newWidth < 160);

		cm.requestMeasure();
	}

	/** Fallback: create a plain textarea if the embedded editor fails */
	private createFallbackTextarea(
		node: LayoutNode,
		nodeId: string,
		screenRect: DOMRect,
		scaledFontSize: number,
		isMobile: boolean,
	): void {
		const container = document.createElement("div");
		container.className = "osmosis-edit-overlay";

		const input = document.createElement("textarea");
		input.className = "osmosis-node-input osmosis-fallback-textarea";
		input.value = node.source.content;
		input.rows = 1;
		input.setCssStyles({
			width: "100%",
			height: "100%",
			fontSize: `${scaledFontSize}px`,
		});
		container.appendChild(input);

		if (isMobile) {
			container.setCssStyles({
				position: "fixed",
				left: `${screenRect.left}px`,
				top: `${screenRect.top}px`,
				width: `${screenRect.width}px`,
				height: `${screenRect.height}px`,
				zIndex: "10000",
			});
			document.body.appendChild(container);
		} else {
			const containerRect = this.contentEl.getBoundingClientRect();
			container.setCssStyles({
				position: "absolute",
				left: `${screenRect.left - containerRect.left}px`,
				top: `${screenRect.top - containerRect.top}px`,
				width: `${screenRect.width}px`,
				height: `${screenRect.height}px`,
				zIndex: "1000",
			});
			this.contentEl.appendChild(container);
		}

		input.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
				this.stopEditing(true);
				e.preventDefault();
				e.stopPropagation();
			} else if (e.key === "Escape") {
				this.stopEditing(false);
				e.preventDefault();
				e.stopPropagation();
			}
			// Prevent keyboard nav while editing
			e.stopPropagation();
		});

		input.addEventListener("blur", () => {
			setTimeout(() => {
				if (this.editingNodeId === nodeId) {
					this.stopEditing(true);
				}
			}, 100);
		});

		this.editContainer = container;

		input.focus({ preventScroll: true });
		input.select();
	}

	private stopEditing(save: boolean): void {
		if (!this.editingNodeId || !this.svg) return;

		const nodeId = this.editingNodeId;
		// Get content from embedded editor or fallback textarea
		let newContent = "";
		if (this.editEditor) {
			newContent = this.editEditor.value;
		} else if (this.editContainer) {
			const textarea = this.editContainer.querySelector("textarea");
			newContent = textarea?.value ?? "";
		}
		this.editingNodeId = null;

		// Clean up event listeners, virtualKeyboard state, scroll locks
		if (this.editCleanup) {
			this.editCleanup();
			this.editCleanup = null;
		}

		// Destroy embedded editor if present
		if (this.editEditor) {
			this.editEditor.destroy();
			this.editEditor = null;
		}

		// Remove the container (works for both body and contentEl)
		if (this.editContainer) {
			this.editContainer.remove();
			this.editContainer = null;
		}

		// Restore SVG from fixed positioning used during mobile editing
		if (this.svg) {
			const s = this.svg.style;
			s.position = "";
			s.left = "";
			s.top = "";
			s.width = "";
			s.height = "";
			s.zIndex = "";
		}

		// Restore visibility of the in-SVG content
		const group = this.svg.querySelector(`[data-node-id="${nodeId}"]`);
		if (group) {
			const fo = group.querySelector("foreignObject");
			if (fo) fo.classList.remove("osmosis-fo-hidden");
		}

		const node = this.nodeMap.get(nodeId);
		if (!node) return;

		// Re-add checkbox prefix if this was a checkbox node
		if (save && node.source.metadata?.checkbox) {
			const prefix = (node.source.metadata.checked as boolean) ? "[x] " : "[ ] ";
			newContent = prefix + newContent;
		}

		if (save && newContent !== node.source.content) {
			// Write change back to markdown (triggers re-render)
			void this.renameNode(node, newContent);
		}

		this.contentEl.focus({ preventScroll: true });
		this.updateToolbarState();
	}

	// ─── Map → Markdown Sync ────────────────────────────────

	/**
	 * Ensure exactly one blank line before and after headings, top-level
	 * code fences, tables, and standalone paragraphs.
	 */
	private normalizeHeadingSpacing(content: string): string {
		// First: collapse runs of 2+ blank lines into exactly one blank line
		const collapsed = content.replace(/\n{3,}/g, "\n\n");
		const lines = collapsed.split("\n");
		const result: string[] = [];
		let inCodeBlock = false;
		let inTable = false;
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i] ?? "";
			const isHeading = /^#{1,6}\s/.test(line);
			// Only add spacing around top-level code fences (not indented ones inside lists)
			const isFence = /^(`{3,}|~{3,})/.test(line.trim());
			const isTopLevelFence = isFence && /^(`{3,}|~{3,})/.test(line);
			const isTableLine = /^\s*\|/.test(line);
			// Detect table start (first pipe line after non-pipe)
			const isTableStart = isTableLine && !inTable;
			// Detect paragraph: non-blank, non-list, non-heading, non-fence, non-table,
			// not indented (top-level), not inside code block
			const isTopLevelParagraph = !isHeading && !isFence && !isTableLine
				&& line.trim() !== "" && !/^(\t| {2,})/.test(line)
				&& !/^[-*]\s/.test(line) && !/^\d+\.\s/.test(line)
				&& !inCodeBlock;

			if (isFence) inCodeBlock = !inCodeBlock;
			if (isTableStart) inTable = true;
			if (inTable && !isTableLine) inTable = false;

			const prevLine = result[result.length - 1];
			const needsBlankBefore =
				isHeading
				|| (isTopLevelFence && inCodeBlock)
				|| isTableStart
				|| (isTopLevelParagraph && prevLine !== undefined && prevLine.trim() !== ""
					&& !/^#{1,6}\s/.test(prevLine));

			if (
				needsBlankBefore &&
				result.length > 0 &&
				prevLine !== undefined &&
				prevLine.trim() !== ""
			) {
				result.push("");
			}
			result.push(line);

			const nextLine = lines[i + 1];
			// Detect table end (current is table, next is not)
			const isTableEnd = isTableLine && (nextLine === undefined || !/^\s*\|/.test(nextLine));
			const needsBlankAfter =
				isHeading
				|| (isTopLevelFence && !inCodeBlock)
				|| isTableEnd
				|| (isTopLevelParagraph && nextLine !== undefined && nextLine.trim() !== ""
					&& !/^#{1,6}\s/.test(nextLine));

			if (needsBlankAfter) {
				if (nextLine !== undefined && nextLine.trim() !== "") {
					result.push("");
				}
			}
		}
		return result.join("\n");
	}

	/**
	 * Serialize a node type/depth/content back to a markdown line.
	 */
	private serializeLine(
		type: OsmosisNode["type"],
		depth: number,
		content: string,
	): string {
		switch (type) {
			case "heading":
				return `${"#".repeat(depth)} ${content}`;
			case "bullet":
				return `${"\t".repeat(depth)}- ${content}`;
			case "ordered":
				return `${"\t".repeat(depth)}1. ${content}`;
			case "paragraph":
				return content;
			case "table":
				return content;
			case "transclusion":
				return `![[${content}]]`;
			default:
				return content;
		}
	}

	/**
	 * Find the end of a node's entire subtree (the max range.end of all descendants).
	 */
	private subtreeEnd(node: OsmosisNode): number {
		let end = node.range.end;
		for (const child of node.children) {
			end = Math.max(end, this.subtreeEnd(child));
		}
		return end;
	}

	/**
	 * Forward undo/redo to the markdown editor for the current file.
	 */
	private forwardUndoRedo(isRedo: boolean): void {
		if (!this.currentFile) return;
		// Find an editor that has the same file open
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (
				view instanceof MarkdownView &&
				view.file === this.currentFile
			) {
				// Suppress the vault modify event so we skip the full loadFile()
				// cycle (async file read + transclusion expansion). Instead, read
				// the new content directly from the editor (in-memory, instant).
				this.suppressNextReload = true;
				if (isRedo) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
					(view.editor as any).redo();
				} else {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
					(view.editor as any).undo();
				}
				const newContent = view.editor.getValue();
				this.cache.invalidate(this.currentFile.path);
				this.currentTree = this.cache.get(
					this.currentFile.path,
					newContent,
				);
				void this.render();
				return;
			}
		}
		// Fallback: execute Obsidian's built-in commands
		// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
		(this.app as any).commands?.executeCommandById?.(
			isRedo ? "editor:redo" : "editor:undo",
		);
	}

	/**
	 * Write markdown content back to the file, suppressing the reload cycle.
	 */
	private async writeMarkdown(newContent: string): Promise<void> {
		if (!this.currentFile) return;
		newContent = this.normalizeHeadingSpacing(newContent);
		this.suppressNextReload = true;
		this.cache.invalidate(this.currentFile.path);
		await this.app.vault.modify(this.currentFile, newContent);

		// Re-parse and re-render from the new content
		this.currentTree = this.cache.get(this.currentFile.path, newContent);
		await this.render();
	}

	/**
	 * Write markdown content to a transcluded source file, then re-render
	 * the current file (re-expanding transclusions to pick up the change).
	 */
	private async writeTranscludedMarkdown(
		sourceFilePath: string,
		newContent: string,
	): Promise<void> {
		if (!this.currentFile) return;
		const sourceFile = this.app.vault.getFileByPath(sourceFilePath);
		if (!(sourceFile instanceof TFile)) return;

		newContent = this.normalizeHeadingSpacing(newContent);
		this.suppressNextReload = true;
		this.cache.invalidate(sourceFilePath);
		await this.app.vault.modify(sourceFile, newContent);

		// Re-read and re-expand the current (parent) file to pick up the change
		const parentContent = await this.app.vault.read(this.currentFile);
		this.cache.invalidate(this.currentFile.path);
		this.currentTree = this.cache.get(this.currentFile.path, parentContent);
		await this.transclusionResolver.expandTree(
			this.currentTree,
			this.lazyTransclusionIds,
		);
		await this.render();
	}

	/**
	 * Rename a node: replace the line in markdown with updated content.
	 * For transcluded nodes, writes to the source file (not the parent note).
	 */
	private async renameNode(
		node: LayoutNode,
		newContent: string,
	): Promise<void> {
		if (!this.currentFile) return;
		const src = node.source;
		const file = this.getNodeFile(src);
		if (!file) return;

		const content = await this.app.vault.read(file);
		const newLine = this.serializeLine(src.type, src.depth, newContent);
		const updated =
			content.slice(0, src.range.start) +
			newLine +
			content.slice(src.range.end);
		await this.writeNodeFile(src, updated);
	}

	/**
	 * Get the file a node belongs to: source file for transcluded nodes, current file otherwise.
	 */
	private getNodeFile(src: OsmosisNode): TFile | null {
		if (src.isTranscluded && src.sourceFile) {
			const file = this.app.vault.getFileByPath(src.sourceFile);
			return file instanceof TFile ? file : null;
		}
		return this.currentFile;
	}

	/**
	 * Renumber ordered list items so consecutive siblings at the same depth
	 * are numbered sequentially (1, 2, 3, ...). Skips code fence contents.
	 */
	private renumberOrderedLists(text: string): string {
		const lines = text.split("\n");
		let inCodeBlock = false;
		// Track the last ordered-list depth and per-depth counters.
		// A blank line or non-ordered-list line resets the counter for that depth.
		const counters = new Map<number, number>();
		let prevWasOrdered = false;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]!;

			// Track code fences
			const trimmed = line.trimStart();
			const fenceMatch = /^(`{3,}|~{3,})/.exec(trimmed);
			if (fenceMatch) {
				inCodeBlock = !inCodeBlock;
				continue;
			}
			if (inCodeBlock) continue;

			// Match ordered list lines: optional tabs/spaces, then digit(s), dot, space
			const match = /^(\t*)([ ]*)(\d+)\.\s+(.*)$/.exec(line);
			if (match?.[3] !== undefined && match[4] !== undefined) {
				const tabs = match[1]?.length ?? 0;
				const spaces = match[2]?.length ?? 0;
				const depth = tabs + Math.floor(spaces / 2);

				if (!prevWasOrdered) {
					// Start of a new ordered list group: reset all counters
					counters.clear();
				}

				const current = (counters.get(depth) ?? 0) + 1;
				counters.set(depth, current);
				// Clear counters for deeper levels (they restart if we come back)
				for (const [d] of counters) {
					if (d > depth) counters.delete(d);
				}
				prevWasOrdered = true;

				const indent = (match[1] ?? "") + (match[2] ?? "");
				lines[i] = `${indent}${String(current)}. ${match[4]}`;
			} else if (line.trim() === "") {
				// Blank line resets
				counters.clear();
				prevWasOrdered = false;
			} else {
				// Non-ordered content (bullet, heading, paragraph) — reset
				counters.clear();
				prevWasOrdered = false;
			}
		}

		return lines.join("\n");
	}

	/**
	 * Write updated content to the correct file for a node.
	 */
	private async writeNodeFile(
		src: OsmosisNode,
		updated: string,
	): Promise<void> {
		const renumbered = this.renumberOrderedLists(updated);
		if (src.isTranscluded && src.sourceFile) {
			await this.writeTranscludedMarkdown(src.sourceFile, renumbered);
		} else {
			await this.writeMarkdown(renumbered);
		}
	}

	/**
	 * Toggle the checked state of a checkbox node in the source file.
	 */
	private async toggleCheckboxNode(src: OsmosisNode): Promise<void> {
		const file = this.getNodeFile(src);
		if (!file) return;
		const content = await this.app.vault.read(file);
		const lineText = content.slice(src.range.start, src.range.end);
		const isChecked = src.metadata?.checked as boolean;
		const toggled = isChecked
			? lineText.replace(/\[x\]/i, "[ ]")
			: lineText.replace("[ ]", "[x]");
		const updated =
			content.slice(0, src.range.start) +
			toggled +
			content.slice(src.range.end);
		await this.writeNodeFile(src, updated);
	}

	/**
	 * Add a child node under the given parent.
	 * Inserts a new line after the parent's subtree.
	 * For transcluded parents, writes to the source file.
	 */
	private async addChildNode(parentNode: LayoutNode): Promise<void> {
		if (!this.currentFile) return;
		const src = parentNode.source;
		const file = this.getNodeFile(src);
		if (!file) return;
		const content = await this.app.vault.read(file);

		// Determine child type and depth
		let childType: OsmosisNode["type"];
		let childDepth: number;

		if (src.type === "heading") {
			// Child of heading: bullet at depth 0
			childType = "bullet";
			childDepth = 0;
		} else if (src.type === "bullet") {
			childType = "bullet";
			childDepth = src.depth + 1;
		} else if (src.type === "ordered") {
			childType = "ordered";
			childDepth = src.depth + 1;
		} else {
			childType = "bullet";
			childDepth = 0;
		}

		const newLine = this.serializeLine(childType, childDepth, "");
		const insertPos = this.subtreeEnd(src);

		// Insert after the subtree with a newline
		const updated =
			content.slice(0, insertPos) +
			"\n" +
			newLine +
			content.slice(insertPos);

		const selectedId = this.selectedNodeId;
		await this.writeNodeFile(src, updated);

		// Find and start editing the newly added node (last child of parent)
		this.startEditingNewNode(selectedId, true);
	}

	/**
	 * Add a sibling node after the given node.
	 * Inserts a new line after the node's subtree at the same level.
	 * For transcluded nodes, writes to the source file.
	 */
	private async addSiblingNode(node: LayoutNode): Promise<void> {
		if (!this.currentFile) return;
		const src = node.source;
		const file = this.getNodeFile(src);
		if (!file) return;
		const content = await this.app.vault.read(file);

		// If sibling of a checkbox, create a new unchecked checkbox
		const newContent = src.metadata?.checkbox ? "[ ] " : "";
		const insertPos = this.subtreeEnd(src);

		let insertText: string;
		if (src.type === "paragraph" || src.type === "codeblock" || src.type === "table") {
			// Paragraphs, code blocks, and tables need a blank line separator
			// Use a zero-width space as placeholder (not stripped by trim())
			insertText = "\n\n\u200B";
		} else {
			const newLine = this.serializeLine(src.type, src.depth, newContent);
			insertText = "\n" + newLine;
		}

		const updated =
			content.slice(0, insertPos) +
			insertText +
			content.slice(insertPos);

		const selectedId = this.selectedNodeId;
		await this.writeNodeFile(src, updated);

		// Find and start editing the new sibling (node right after the original)
		this.startEditingNewNode(selectedId, false);
	}

	/**
	 * Delete a node and all its children from the markdown.
	 * For transcluded nodes, deletes from the source file.
	 */
	private async deleteNode(node: LayoutNode): Promise<void> {
		if (!this.currentFile) return;
		const src = node.source;
		const file = this.getNodeFile(src);
		if (!file) return;
		const content = await this.app.vault.read(file);

		const start = src.range.start;
		const end = this.subtreeEnd(src);

		// Also consume the preceding or following newline to avoid blank lines
		let deleteStart = start;
		let deleteEnd = end;

		if (deleteStart > 0 && content[deleteStart - 1] === "\n") {
			deleteStart--;
		} else if (deleteEnd < content.length && content[deleteEnd] === "\n") {
			deleteEnd++;
		}

		const updated =
			content.slice(0, deleteStart) + content.slice(deleteEnd);

		// Select the parent or sibling after deletion
		const parentId =
			node.parent?.source.type !== "root" ? node.parent?.source.id : null;
		await this.writeNodeFile(src, updated);

		// Try to select something reasonable after deletion
		if (parentId) {
			const parentNode = this.nodeMap.get(parentId);
			if (parentNode) {
				this.selectNode(parentId);
			}
		} else {
			this.selectFirstNode();
		}
	}

	/**
	 * After adding a child or sibling, find the new node and start editing it.
	 */
	private startEditingNewNode(
		previousSelectedId: string | null,
		isChild: boolean,
	): void {
		if (!previousSelectedId) return;

		// The tree has been re-parsed, so we need to find the original node by position match
		// The new node will have empty content (or just a checkbox/placeholder)
		for (const [id, layoutNode] of this.nodeMap) {
			const c = layoutNode.source.content;
			const stripped = c.replace(/[\u200B\u00A0]/g, "");
			const isEmpty = stripped.trim() === ""
				|| /^\[[ xX]\]\s*$/.test(stripped);
			if (isEmpty) {
				this.selectNode(id);
				this.scrollToSelectedNode();
				this.startEditing(id);
				return;
			}
		}
	}

	// ─── Rendering ───────────────────────────────────────────

	private getOffsetX(): number {
		if (!this.currentLayout) return LAYOUT_PADDING;
		return -this.currentLayout.bounds.x1 + LAYOUT_PADDING;
	}

	private getOffsetY(): number {
		if (!this.currentLayout) return LAYOUT_PADDING;
		return -this.currentLayout.bounds.y1 + LAYOUT_PADDING;
	}

	private async render(): Promise<void> {
		const container = this.contentEl;
		this.toolRibbon?.detach();
		container.empty();
		container.addClass("osmosis-mindmap-container");

		// Clean up previous render component
		this.renderComponent?.unload();
		this.renderComponent = new Component();
		this.renderComponent.load();

		if (!this.currentTree) {
			container.createEl("p", {
				text: "Open a Markdown file to view its mind map.",
			});
			return;
		}

		// Measure actual content sizes before layout
		const nodeSizes = await this.measureNodeSizes(
			container,
			this.currentTree,
		);

		const layout = computeLayout(
			this.currentTree,
			{
				direction: this.mapSettings.direction,
				horizontalSpacing: this.mapSettings.horizontalSpacing,
				verticalSpacing: this.mapSettings.verticalSpacing,
				topicShape: this.mapSettings.topicShape ?? "rounded-rect",
			},
			this.collapsedIds,
			nodeSizes,
		);
		this.currentLayout = layout;

		// Build node map for keyboard nav
		this.nodeMap.clear();
		for (const node of layout.nodes) {
			if (node.source.type !== "root") {
				this.nodeMap.set(node.source.id, node);
			}
		}

		await this.renderSvg(container, layout);

		// Re-attach toolbar (container.empty() removes it)
		this.toolRibbon?.attach();
		this.updateToolbarState();
	}

	/**
	 * Measure actual rendered content sizes for all nodes.
	 * Creates a hidden offscreen container, renders each node's markdown,
	 * and measures the resulting dimensions.
	 *
	 * Two-pass approach: first measure natural (unconstrained) width,
	 * then if it exceeds maxNodeWidth, constrain width and re-measure height.
	 */
	private async measureNodeSizes(
		container: HTMLElement,
		tree: OsmosisTree,
	): Promise<Map<string, { width: number; height: number }>> {
		const sizes = new Map<string, { width: number; height: number }>();
		const cfg = DEFAULT_LAYOUT_CONFIG;
		// Reduce max content width for shapes with insets so text wraps before
		// the shape boundary clips it.
		const shapeInsets = getShapeInsets(this.mapSettings.topicShape ?? "rounded-rect");
		const totalInsetX = Math.min(shapeInsets.left, 0.45) + Math.min(shapeInsets.right, 0.45);
		const shapeScale = 1 - totalInsetX;
		const contentMaxWidth = cfg.maxNodeWidth * shapeScale - cfg.nodePaddingX * 2;

		const sourcePath = this.currentFile?.path ?? "";
		const allNodes = this.collectAllNodes(tree.root);

		// Collect nodes that need measurement (not in cache).
		// Cache key includes heading depth since typography varies by level.
		const toMeasure: { node: OsmosisNode; displayContent: string; cacheKey: string }[] = [];
		for (const node of allNodes) {
			if (node.type === "root") continue;
			const displayContent = this.getNodeDisplayContent(node);
			const cacheKey = node.type === "heading"
				? `h${String(node.depth)}:${displayContent}`
				: displayContent;
			const cached = this.nodeSizeCache.get(cacheKey);
			if (cached) {
				sizes.set(node.id, cached);
			} else {
				toMeasure.push({ node, displayContent, cacheKey });
			}
		}

		// Only create the measurer if there are uncached nodes
		if (toMeasure.length > 0) {
			const measurer = document.createElement("div");
			measurer.style.cssText = `
				position: absolute; left: -9999px; top: -9999px;
				visibility: hidden; pointer-events: none;
			`;
			container.appendChild(measurer);

			for (const { node, displayContent, cacheKey } of toMeasure) {
				// Render into a wide cell so nothing wraps, then use Range to
				// measure actual content width (ignores block-level expansion).
				const cell = document.createElement("div");
				cell.className = "osmosis-node-content osmosis-measure-cell";
				if (node.type === "heading") {
					cell.setAttribute("data-depth", String(node.depth));
				}
				// Apply theme text styles for accurate measurement
				if (this.activeTheme) {
					const nodeDepth = node.type === "heading" ? node.depth : 0;
					const style = resolveNodeStyle(this.activeTheme, nodeDepth);
					const textStyles: string[] = ["width: 9999px"];
					if (style.text?.size) textStyles.push(`font-size: ${String(style.text.size)}px`);
					if (style.text?.weight) textStyles.push(`font-weight: ${String(style.text.weight)}`);
					if (style.text?.font) textStyles.push(`font-family: ${style.text.font}`);
					cell.setAttribute("style", textStyles.join("; "));
				} else {
					cell.setCssStyles({ width: "9999px" });
				}
				measurer.appendChild(cell);

				if (this.renderComponent) {
					await MarkdownRenderer.render(
						this.app,
						displayContent,
						cell,
						sourcePath,
						this.renderComponent,
					);
				}

				// Replace video platform links with embedded iframes
				this.replaceVideoEmbeds(cell);

				// Inject checkbox for task-list items (affects size measurement)
				if (node.metadata?.checkbox) {
					const cb = document.createElement("input");
					cb.type = "checkbox";
					cb.className = "task-list-item-checkbox";
					if (node.metadata.checked) {
						cb.checked = true;
					}
					const p = cell.querySelector("p");
					if (p) {
						p.insertBefore(cb, p.firstChild);
					} else if (cell.firstChild) {
						cell.insertBefore(cb, cell.firstChild);
					}
				}

				// Use Range to get tight bounding box of actual rendered content
				const range = document.createRange();
				range.selectNodeContents(cell);
				const contentRect = range.getBoundingClientRect();
				const naturalWidth = contentRect.width;

				const finalWidth = Math.min(
					Math.max(Math.ceil(naturalWidth), 40),
					contentMaxWidth,
				);
				let finalHeight: number;

				if (naturalWidth > contentMaxWidth) {
					// Constrain width and re-measure wrapped height
					cell.setCssStyles({
						width: `${String(contentMaxWidth)}px`,
					});
					finalHeight = Math.max(
						Math.ceil(cell.getBoundingClientRect().height),
						20,
					);
				} else {
					finalHeight = Math.max(Math.ceil(contentRect.height), 20);
				}

				const size = { width: finalWidth, height: finalHeight };
				sizes.set(node.id, size);
				this.nodeSizeCache.set(cacheKey, size);
			}

			measurer.remove();
		}

		return sizes;
	}

	/** Collect all OsmosisNodes from the tree into a flat array. */
	private collectAllNodes(node: OsmosisNode): OsmosisNode[] {
		const result: OsmosisNode[] = [node];
		for (const child of node.children) {
			result.push(...this.collectAllNodes(child));
		}
		return result;
	}

	/** Get the display content for a node, adding list prefix if needed. */
	private getNodeDisplayContent(node: OsmosisNode): string {
		if (
			node.type === "ordered" &&
			node.metadata?.listNumber !== undefined
		) {
			// Escape the dot so MarkdownRenderer renders as plain text, not <ol>
			return `${String(node.metadata.listNumber as number)}\\. ${node.content}`;
		}
		if (node.type === "bullet") {
			if (node.metadata?.checkbox) {
				// Strip the [ ]/[x] prefix — checkbox input injected post-render
				return node.content.replace(/^\[[ xX]\]\s*/, "");
			}
			return `\u2022 ${node.content}`;
		}
		return node.content;
	}

	/** YouTube / video URL patterns → embed URL extractors */
	private static readonly VIDEO_EMBED_PATTERNS: {
		pattern: RegExp;
		toEmbed: (match: RegExpExecArray) => string;
	}[] = [
		{
			// https://www.youtube.com/watch?v=VIDEO_ID or &v=VIDEO_ID
			pattern: /https?:\/\/(?:www\.)?youtube\.com\/watch\?[^\s]*v=([a-zA-Z0-9_-]+)/,
			toEmbed: (m) => `https://www.youtube.com/embed/${m[1]}`,
		},
		{
			// https://youtu.be/VIDEO_ID
			pattern: /https?:\/\/youtu\.be\/([a-zA-Z0-9_-]+)/,
			toEmbed: (m) => `https://www.youtube.com/embed/${m[1]}`,
		},
		{
			// https://www.youtube.com/embed/VIDEO_ID (already embed format)
			pattern: /https?:\/\/(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]+)/,
			toEmbed: (m) => `https://www.youtube.com/embed/${m[1]}`,
		},
		{
			// https://vimeo.com/VIDEO_ID
			pattern: /https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/,
			toEmbed: (m) => `https://player.vimeo.com/video/${m[1]}`,
		},
	];

	/**
	 * Post-render: replace links to video platforms with embedded iframes.
	 * Works in both the measurement div and the actual SVG foreignObject.
	 */
	private replaceVideoEmbeds(container: HTMLElement, ns?: string): void {
		const links = container.querySelectorAll("a");
		for (const link of Array.from(links)) {
			const href = link.getAttribute("href") ?? "";
			for (const { pattern, toEmbed } of MindMapView.VIDEO_EMBED_PATTERNS) {
				const match = pattern.exec(href);
				if (match) {
					const iframe = ns
						? (document.createElementNS(ns, "iframe") as HTMLIFrameElement)
						: document.createElement("iframe");
					if (ns) iframe.setAttribute("xmlns", ns);
					iframe.setAttribute("src", toEmbed(match));
					iframe.setAttribute("frameborder", "0");
					iframe.setAttribute("allowfullscreen", "true");
					iframe.setAttribute(
						"allow",
						"accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
					);
					iframe.className = "osmosis-video-embed";
					link.replaceWith(iframe);
					break;
				}
			}
		}
	}

	private async renderSvg(
		container: HTMLElement,
		layout: LayoutResult,
	): Promise<void> {
		const { bounds, nodes } = layout;
		const offsetX = this.getOffsetX();
		const offsetY = this.getOffsetY();

		// Content dimensions in SVG coordinates
		const contentWidth = bounds.width + LAYOUT_PADDING * 2;
		const contentHeight = bounds.height + LAYOUT_PADDING * 2;

		const svg = document.createElementNS(SVG_NS, "svg");
		svg.setAttribute("width", "100%");
		svg.setAttribute("height", "100%");
		svg.addClass("osmosis-mindmap-svg");

		// Initialize viewBox: use actual container dimensions so culling works from the start.
		// The user sees the top-left portion of the map; pan/zoom to explore.
		if (!this.svg) {
			const containerRect = container.getBoundingClientRect();
			const w = containerRect.width || contentWidth;
			const h = containerRect.height || contentHeight;
			this.viewBox = { x: 0, y: 0, w, h };
			this.zoom = 1;
		}

		svg.setAttribute(
			"viewBox",
			`${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.w} ${this.viewBox.h}`,
		);

		this.svg = svg;

		// Create groups for layering: branch lines behind nodes
		const branchLinesGroup = document.createElementNS(SVG_NS, "g");
		branchLinesGroup.setAttribute("class", "osmosis-branch-lines-group");
		svg.appendChild(branchLinesGroup);
		this.branchLinesGroup = branchLinesGroup;

		const nodesGroup = document.createElementNS(SVG_NS, "g");
		nodesGroup.setAttribute("class", "osmosis-nodes-group");
		svg.appendChild(nodesGroup);
		this.nodesGroup = nodesGroup;

		const lineStyle = this.mapSettings.branchLineStyle;

		// Resolve active theme for this render pass
		const themeName = this.mapSettings.theme;
		if (themeName && !isDefaultTheme(themeName)) {
			this.activeTheme = getTheme(themeName);
		} else {
			this.activeTheme = undefined;
		}

		// Apply theme background to container
		if (this.activeTheme?.background) {
			container.style.backgroundColor = this.activeTheme.background;
		} else {
			container.style.backgroundColor = "";
		}

		// Only render nodes visible in the current viewport
		this.renderedNodeIds.clear();
		const renderPromises: Promise<void>[] = [];

		for (const node of nodes) {
			if (node.source.type === "root") continue;
			if (!this.isNodeInViewport(node, offsetX, offsetY)) continue;

			this.renderedNodeIds.add(node.source.id);
			renderPromises.push(
				this.drawNode(nodesGroup, node, offsetX, offsetY),
			);

			if (
				node.parent &&
				this.isBranchInViewport(node.parent, node, offsetX, offsetY)
			) {
				this.drawBranchLine(
					branchLinesGroup,
					node.parent,
					node,
					offsetX,
					offsetY,
					lineStyle,
				);
			}
		}

		await Promise.all(renderPromises);
		container.appendChild(svg);
	}

	private async drawNode(
		svg: SVGElement,
		node: LayoutNode,
		offsetX: number,
		offsetY: number,
	): Promise<void> {
		const x = node.rect.x + offsetX;
		const y = node.rect.y + offsetY;
		const { width, height } = node.rect;

		const group = document.createElementNS(SVG_NS, "g");
		const classes = [
			`osmosis-node-group`,
			`osmosis-node-group-${node.source.type}`,
		];
		if (this.selectedNodeIds.has(node.source.id)) {
			classes.push("osmosis-node-selected");
		}
		if (
			node.source.type === "transclusion" &&
			node.source.metadata?.cyclic
		) {
			classes.push("osmosis-node-cyclic");
		} else if (
			node.source.type === "transclusion" &&
			node.source.sourceFile
		) {
			classes.push("osmosis-node-resolved");
		} else if (
			node.source.type === "transclusion" &&
			!node.source.sourceFile
		) {
			classes.push("osmosis-node-unresolved");
		}
		if (
			node.source.isTranscluded &&
			this.plugin?.settings?.showTransclusionStyle
		) {
			classes.push("osmosis-node-transcluded");
		}
		group.setAttribute("class", classes.join(" "));
		group.setAttribute("data-node-id", node.source.id);
		if (node.source.sourceFile) {
			group.setAttribute("data-source-file", node.source.sourceFile);
		}

		// Resolve style early so shape is available for element creation
		const nodeDepth = node.source.type === "heading" ? node.source.depth : undefined;
		const resolvedStyle = this.activeTheme
			? resolveNodeStyle(this.activeTheme, nodeDepth)
			: undefined;

		// Background shape (determined by resolved style, map setting, or default)
		const shape = resolvedStyle?.shape ?? this.mapSettings.topicShape ?? "rounded-rect";
		group.setAttribute("data-shape", shape);
		const shapeEl = createShapeElement(shape, x, y, width, height);
		shapeEl.setAttribute(
			"class",
			`osmosis-node osmosis-node-${node.source.type}`,
		);
		group.appendChild(shapeEl);

		// Compute the inscribed content rectangle within the shape.
		// The foreignObject is inset so text/media stay inside the shape boundary.
		const insets = getShapeInsets(shape);
		const foX = x + insets.left * width;
		const foY = y + insets.top * height;
		const foW = width * (1 - insets.left - insets.right);
		const foH = height * (1 - insets.top - insets.bottom);

		// foreignObject with rendered markdown
		const fo = document.createElementNS(SVG_NS, "foreignObject");
		fo.setAttribute("x", String(foX));
		fo.setAttribute("y", String(foY));
		fo.setAttribute("width", String(foW));
		fo.setAttribute("height", String(foH));

		const wrapper = document.createElementNS(
			XHTML_NS,
			"div",
		) as HTMLDivElement;
		wrapper.setAttribute("xmlns", XHTML_NS);
		wrapper.className = "osmosis-node-content";
		if (node.source.type === "heading") {
			wrapper.setAttribute("data-depth", String(node.source.depth));
		}
		fo.appendChild(wrapper);
		group.appendChild(fo);

		// Apply theme styles via inline style (overrides CSS class rules)
		if (resolvedStyle) {
			const style = resolvedStyle;
			// Use inline style on shape element — SVG attributes are overridden by CSS class rules
			const shapeStyles: string[] = [];
			if (style.fill) shapeStyles.push(`fill: ${style.fill}`);
			if (style.border?.color) shapeStyles.push(`stroke: ${style.border.color}`);
			if (style.border?.width) shapeStyles.push(`stroke-width: ${String(style.border.width)}`);
			if (style.border?.style === "dashed") shapeStyles.push("stroke-dasharray: 4 2");
			if (style.border?.style === "dotted") shapeStyles.push("stroke-dasharray: 1 2");
			if (shapeStyles.length > 0) shapeEl.setAttribute("style", shapeStyles.join("; "));
			const textStyles: string[] = [];
			if (style.text?.color) textStyles.push(`color: ${style.text.color}`);
			if (style.text?.size) textStyles.push(`font-size: ${String(style.text.size)}px`);
			if (style.text?.weight) textStyles.push(`font-weight: ${String(style.text.weight)}`);
			if (style.text?.font) textStyles.push(`font-family: ${style.text.font}`);
			if (style.text?.alignment) textStyles.push(`text-align: ${style.text.alignment}`);
			if (style.text?.style === "italic") textStyles.push("font-style: italic");
			if (textStyles.length > 0) wrapper.setAttribute("style", textStyles.join("; "));
		}

		// Render markdown content into the wrapper
		const sourcePath = this.currentFile?.path ?? "";
		if (
			node.source.type === "transclusion" &&
			node.source.metadata?.cyclic
		) {
			// Cycle indicator: show warning instead of raw link
			const cycleLabel = document.createElementNS(
				XHTML_NS,
				"span",
			) as HTMLSpanElement;
			cycleLabel.setAttribute("xmlns", XHTML_NS);
			cycleLabel.className = "osmosis-cycle-indicator";
			cycleLabel.textContent = `\u21BB ${node.source.content}`;
			wrapper.appendChild(cycleLabel);
		} else {
			const displayContent = this.getNodeDisplayContent(node.source);
			// Checkbox nodes have state (checked/unchecked) baked into cached HTML,
			// so skip the cache to always render fresh with the current checked state.
			const isCheckboxNode = !!node.source.metadata?.checkbox;
			const cachedHtml = isCheckboxNode
				? null
				: this.nodeHtmlCache.get(displayContent);
			if (cachedHtml) {
				// Clone cached rendered content instead of re-rendering markdown
				for (const child of Array.from(cachedHtml.childNodes)) {
					wrapper.appendChild(child.cloneNode(true));
				}
			} else if (this.renderComponent) {
				await MarkdownRenderer.render(
					this.app,
					displayContent,
					wrapper,
					sourcePath,
					this.renderComponent,
				);

				// Replace video platform links with embedded iframes
				this.replaceVideoEmbeds(wrapper, XHTML_NS);

				// Add language label to code block nodes
				if (node.source.type === "codeblock") {
					const langMatch = /^(`{3,}|~{3,})(\S+)/.exec(
						node.source.content,
					);
					const lang = langMatch?.[2];
					if (lang && !lang.startsWith("ad-")) {
						const label = document.createElementNS(
							XHTML_NS,
							"span",
						) as HTMLSpanElement;
						label.setAttribute("xmlns", XHTML_NS);
						label.className = "osmosis-code-lang-label";
						label.textContent = lang;
						wrapper.appendChild(label);
					}
				}

				// Inject checkbox for task-list items
				if (node.source.metadata?.checkbox) {
					const cb = document.createElementNS(XHTML_NS, "input") as HTMLInputElement;
					cb.setAttribute("xmlns", XHTML_NS);
					cb.type = "checkbox";
					cb.className = "task-list-item-checkbox";
					cb.dataset.task = (node.source.metadata.checked as boolean) ? "x" : "";
					if (node.source.metadata.checked) {
						cb.checked = true;
					}
					// Prepend checkbox before existing content
					const firstChild = wrapper.firstChild;
					if (firstChild) {
						// Insert inside the first <p> if present, otherwise before first child
						const p = wrapper.querySelector("p");
						if (p) {
							p.insertBefore(cb, p.firstChild);
						} else {
							wrapper.insertBefore(cb, firstChild);
						}
					} else {
						wrapper.appendChild(cb);
					}
				}

				// Cache the rendered wrapper content for future cloning
				// (skip checkbox nodes — their checked state makes caching incorrect)
				if (!isCheckboxNode) {
					const cacheEntry = document.createElementNS(
						XHTML_NS,
						"div",
					) as HTMLDivElement;
					for (const child of Array.from(wrapper.childNodes)) {
						cacheEntry.appendChild(child.cloneNode(true));
					}
					this.nodeHtmlCache.set(displayContent, cacheEntry);
				}
			}
		}

		// Wire up checkbox toggle — must run after render (both cached and fresh paths)
		if (node.source.metadata?.checkbox) {
			const cb = wrapper.querySelector<HTMLInputElement>(
				"input.task-list-item-checkbox",
			);
			if (cb) {
				cb.addEventListener("click", (e) => {
					e.stopPropagation();
					void this.toggleCheckboxNode(node.source);
				});
			}
		}

		// Collapse toggle for nodes with children, or lazy transclusions with content to load
		const isLazyTransclusion =
			this.lazyTransclusionIds.has(node.source.id) &&
			node.source.metadata?.resolved;
		if (node.source.children.length > 0 || isLazyTransclusion) {
			this.drawCollapseToggle(group, node, x, y, width, height);
		}

		svg.appendChild(group);
	}

	private drawCollapseToggle(
		group: SVGGElement,
		node: LayoutNode,
		x: number,
		y: number,
		width: number,
		height: number,
	): void {
		const isCollapsed = this.collapsedIds.has(node.source.id);
		const toggleSize = 14;
		const toggleX = x + width + 4;
		const toggleY = y + height / 2 - toggleSize / 2;

		const toggleGroup = document.createElementNS(SVG_NS, "g");
		toggleGroup.setAttribute("class", "osmosis-collapse-toggle");
		toggleGroup.setAttribute("data-node-id", node.source.id);

		// Circle background
		const circle = document.createElementNS(SVG_NS, "circle");
		circle.setAttribute("cx", String(toggleX + toggleSize / 2));
		circle.setAttribute("cy", String(toggleY + toggleSize / 2));
		circle.setAttribute("r", String(toggleSize / 2));
		circle.setAttribute("class", "osmosis-collapse-circle");
		// Apply theme toggle styles via inline style (overrides CSS class rules)
		if (this.activeTheme?.collapseToggle) {
			const ct = this.activeTheme.collapseToggle;
			const circleStyles: string[] = [];
			if (ct.fill) circleStyles.push(`fill: ${ct.fill}`);
			if (ct.stroke) circleStyles.push(`stroke: ${ct.stroke}`);
			if (circleStyles.length > 0) circle.setAttribute("style", circleStyles.join("; "));
		}
		toggleGroup.appendChild(circle);

		// +/- icon
		const icon = document.createElementNS(SVG_NS, "text");
		icon.setAttribute("x", String(toggleX + toggleSize / 2));
		icon.setAttribute("y", String(toggleY + toggleSize / 2));
		icon.setAttribute("text-anchor", "middle");
		icon.setAttribute("dominant-baseline", "central");
		icon.setAttribute("class", "osmosis-collapse-icon");
		if (this.activeTheme?.collapseToggle?.icon) {
			icon.setAttribute("style", `fill: ${this.activeTheme.collapseToggle.icon}`);
		}
		icon.textContent = isCollapsed ? "+" : "\u2212";
		toggleGroup.appendChild(icon);

		group.appendChild(toggleGroup);
	}

	private drawBranchLine(
		svg: SVGElement,
		parent: LayoutNode,
		child: LayoutNode,
		offsetX: number,
		offsetY: number,
		lineStyle: BranchLineStyle,
	): void {
		// Child attachment point: center-left
		const cx = child.rect.x + offsetX;
		const cy = child.rect.y + child.rect.height / 2 + offsetY;

		let px: number;
		let py: number;

		if (parent.source.type === "root") {
			const stubLength = DEFAULT_LAYOUT_CONFIG.horizontalSpacing / 2;
			px = cx - stubLength;
			py = cy;
		} else {
			px = parent.rect.x + parent.rect.width + offsetX;
			py = parent.rect.y + parent.rect.height / 2 + offsetY;
		}

		const path = document.createElementNS(SVG_NS, "path");
		path.setAttribute("d", this.computeLinePath(px, py, cx, cy, lineStyle));
		path.setAttribute("class", "osmosis-branch-line");
		path.setAttribute("data-child-id", child.source.id);
		// Apply theme branch line styles via inline style (overrides CSS class rules)
		if (this.activeTheme?.branchLine) {
			const bl = this.activeTheme.branchLine;
			const lineStyles: string[] = ["fill: none"];
			if (bl.color) lineStyles.push(`stroke: ${bl.color}`);
			if (bl.thickness) lineStyles.push(`stroke-width: ${String(bl.thickness)}`);
			path.setAttribute("style", lineStyles.join("; "));
		}
		svg.appendChild(path);
	}

	private computeLinePath(
		px: number,
		py: number,
		cx: number,
		cy: number,
		style: BranchLineStyle,
	): string {
		const midX = (px + cx) / 2;

		switch (style) {
			case "straight":
				return `M ${px} ${py} L ${cx} ${cy}`;

			case "angular":
				return `M ${px} ${py} L ${midX} ${py} L ${midX} ${cy} L ${cx} ${cy}`;

			case "rounded-elbow": {
				const radius = Math.min(
					12,
					Math.abs(cy - py) / 2,
					Math.abs(cx - px) / 4,
				);
				if (Math.abs(cy - py) < 1) {
					return `M ${px} ${py} L ${cx} ${cy}`;
				}
				const dir = cy > py ? 1 : -1;
				return (
					`M ${px} ${py} ` +
					`L ${midX - radius} ${py} ` +
					`Q ${midX} ${py}, ${midX} ${py + radius * dir} ` +
					`L ${midX} ${cy - radius * dir} ` +
					`Q ${midX} ${cy}, ${midX + radius} ${cy} ` +
					`L ${cx} ${cy}`
				);
			}

			case "curved":
			default:
				return `M ${px} ${py} C ${midX} ${py}, ${midX} ${cy}, ${cx} ${cy}`;
		}
	}
}
