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
import { computeLayout, LayoutNode, LayoutResult, DEFAULT_LAYOUT_CONFIG } from "../layout";
import type OsmosisPlugin from "../main";
import type { BranchLineStyle } from "../settings";
import { TransclusionResolver } from "../transclusion";

export const VIEW_TYPE_MINDMAP = "osmosis-mindmap";

const SVG_NS = "http://www.w3.org/2000/svg";
const XHTML_NS = "http://www.w3.org/1999/xhtml";

// Viewport constants
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const ZOOM_SENSITIVITY = 0.002;
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

	// Viewport state
	private viewBox = { x: 0, y: 0, w: 800, h: 600 };
	private zoom = 1;
	private isPanning = false;
	private panStart = { x: 0, y: 0 };
	private svg: SVGSVGElement | null = null;

	// Collapse state
	private collapsedIds = new Set<string>();
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
	private editOverlay: HTMLInputElement | null = null;
	private editCleanup: (() => void) | null = null;

	// Sync state: when true, skip the next vault.modify reload to prevent flicker
	private suppressNextReload = false;

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

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		this.navigation = true;
		this.icon = "git-fork";
		this.plugin = (this.app as unknown as { plugins: { plugins: Record<string, OsmosisPlugin> } }).plugins.plugins["osmosis"] as OsmosisPlugin;
		this.transclusionResolver = new TransclusionResolver(this.app, this.cache);

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
	}

	getViewType(): string {
		return VIEW_TYPE_MINDMAP;
	}

	getDisplayText(): string {
		return this.currentFile ? `Mind Map: ${this.currentFile.basename}` : "Mind Map";
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
		this.registerDomEvent(container, "pointercancel", this.handlePointerCancel);
		this.registerDomEvent(container, "pointerleave", this.handlePointerLeave);
		this.registerDomEvent(container, "wheel", this.handleWheel, { passive: false });
		this.registerDomEvent(container, "click", this.handleClick);
		this.registerDomEvent(container, "dblclick", this.handleDblClick);

		// Block touch events from reaching Obsidian's gesture handlers (drawer swipes,
		// command palette pull-down). Pointer events and touch events are separate
		// streams — stopPropagation on pointer events does not affect touch events.
		this.registerDomEvent(container, "touchstart", this.handleTouchCapture, { passive: false } as AddEventListenerOptions);
		this.registerDomEvent(container, "touchmove", this.handleTouchCapture, { passive: false } as AddEventListenerOptions);
		this.registerDomEvent(container, "touchend", this.handleTouchCapture as EventListener);

		// Respond to container resize (e.g. mobile keyboard opening) by updating viewBox
		this.resizeObserver = new ResizeObserver(() => this.handleContainerResize());
		this.resizeObserver.observe(container);

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

		this.currentFile = file;
		const content = await this.app.vault.read(file);
		this.currentTree = this.cache.get(file.path, content);

		// Resolve transclusion links to vault files
		await this.transclusionResolver.resolveTree(this.currentTree);

		await this.render();
	}

	// ─── Viewport ────────────────────────────────────────────

	private updateViewBox(): void {
		if (!this.svg) return;
		const { x, y, w, h } = this.viewBox;
		this.svg.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
		this.scheduleCullUpdate();
	}

	/** Check if a node (in SVG coords with offset applied) intersects the expanded viewport */
	private isNodeInViewport(node: LayoutNode, offsetX: number, offsetY: number): boolean {
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
	private isBranchInViewport(parent: LayoutNode, child: LayoutNode, offsetX: number, offsetY: number): boolean {
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
		if (!this.svg || !this.currentLayout || !this.nodesGroup || !this.branchLinesGroup) return;

		const { nodes } = this.currentLayout;
		const offsetX = this.getOffsetX();
		const offsetY = this.getOffsetY();
		const lineStyle = this.plugin?.settings?.branchLineStyle ?? "curved";

		const nowVisible = new Set<string>();
		for (const node of nodes) {
			if (node.source.type === "root") continue;
			if (this.isNodeInViewport(node, offsetX, offsetY) || node.source.id === this.editingNodeId) {
				nowVisible.add(node.source.id);
			}
		}

		// Remove nodes that left the viewport (but never cull the node being edited)
		for (const id of this.renderedNodeIds) {
			if (!nowVisible.has(id) && id !== this.editingNodeId) {
				// Remove node group
				const el = this.nodesGroup.querySelector(`.osmosis-node-group[data-node-id="${id}"]`);
				el?.remove();
				// Remove branch line
				const line = this.branchLinesGroup.querySelector(`.osmosis-branch-line[data-child-id="${id}"]`);
				line?.remove();
			}
		}

		// Add nodes that entered the viewport
		const renderPromises: Promise<void>[] = [];
		for (const node of nodes) {
			if (node.source.type === "root") continue;
			const id = node.source.id;
			if (nowVisible.has(id) && !this.renderedNodeIds.has(id)) {
				renderPromises.push(this.drawNode(this.nodesGroup, node, offsetX, offsetY));
				// Draw branch line whenever the child node is visible
				if (node.parent) {
					this.drawBranchLine(this.branchLinesGroup, node.parent, node, offsetX, offsetY, lineStyle);
				}
			}
		}
		await Promise.all(renderPromises);

		this.renderedNodeIds = nowVisible;
	}

	private screenToSvg(clientX: number, clientY: number): { x: number; y: number } {
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
		if (e.button === 0 && !nodeId && e.shiftKey && e.pointerType !== "touch") {
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
			this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
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
				const remaining = this.activePointers.values().next().value as { x: number; y: number };
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
			if (wasDragCandidate && !this.longPressTriggered && dragCandidateId) {
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
		const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.pinchStartZoom * ratio));

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
		const svgOldCenter = this.screenToSvg(this.pinchCenter.x, this.pinchCenter.y);
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

		const svgPoint = this.screenToSvg(e.clientX, e.clientY);
		const delta = e.deltaY * ZOOM_SENSITIVITY;
		const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom * (1 - delta)));

		const scale = this.zoom / newZoom;
		this.viewBox.x = svgPoint.x - (svgPoint.x - this.viewBox.x) * scale;
		this.viewBox.y = svgPoint.y - (svgPoint.y - this.viewBox.y) * scale;
		this.viewBox.w *= scale;
		this.viewBox.h *= scale;
		this.zoom = newZoom;

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
		const nodeId = this.getClickedNodeId(e);
		if (nodeId) {
			this.startEditing(nodeId);
		}
	};

	// ─── Collapse ────────────────────────────────────────────

	private toggleCollapse(nodeId: string): void {
		if (this.collapsedIds.has(nodeId)) {
			this.collapsedIds.delete(nodeId);
		} else {
			this.collapsedIds.add(nodeId);
		}
		void this.renderAnimated();
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
				oldPositions.set(node.source.id, { x: node.rect.x, y: node.rect.y });
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
		const rh = parseFloat(this.rubberBandRect.getAttribute("height") ?? "0");

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
			} else if (deleteEnd < content.length && content[deleteEnd] === "\n") {
				deleteEnd++;
			}

			content = content.slice(0, deleteStart) + content.slice(deleteEnd);
		}

		this.selectedNodeIds.clear();
		this.selectedNodeId = null;
		await this.writeMarkdown(content);
		this.selectFirstNode();
	}

	/**
	 * Toggle collapse on all selected nodes.
	 */
	private toggleCollapseSelected(): void {
		let anyExpanded = false;
		for (const id of this.selectedNodeIds) {
			const node = this.nodeMap.get(id);
			if (node && (node.children.length > 0 || node.collapsed) && !this.collapsedIds.has(id)) {
				anyExpanded = true;
				break;
			}
		}

		for (const id of this.selectedNodeIds) {
			const node = this.nodeMap.get(id);
			if (!node || (node.children.length === 0 && !node.collapsed)) continue;
			if (anyExpanded) {
				this.collapsedIds.add(id);
			} else {
				this.collapsedIds.delete(id);
			}
		}

		void this.renderAnimated();
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
			const old = this.svg.querySelector(`[data-node-id="${this.cursorSyncNodeId}"]`);
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
			if (view instanceof MarkdownView && view.file === this.currentFile) {
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
		this.selectNode(nodeId);
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
		rect.setAttribute("class", "osmosis-node osmosis-node-" + node.source.type);
		ghost.appendChild(rect);

		const fo = document.createElementNS(SVG_NS, "foreignObject");
		fo.setAttribute("width", String(node.rect.width));
		fo.setAttribute("height", String(node.rect.height));
		const wrapper = document.createElementNS(XHTML_NS, "div") as HTMLDivElement;
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

			// Check gap above this node (insert before)
			const gapAbove = nodeY;
			const distAbove = Math.abs(svgPt.y - gapAbove);
			if (distAbove < bestDist && Math.abs(svgPt.x - nodeX) < 300) {
				const parentNode = layoutNode.parent;
				const siblingIdx = parentNode.children.indexOf(layoutNode);
				// Don't allow dropping right back where it came from
				if (!this.isSamePosition(dragNode, parentNode.source.id, siblingIdx)) {
					bestDist = distAbove;
					bestTarget = { parentId: parentNode.source.id, index: siblingIdx };
					indicatorY = gapAbove;
					indicatorX1 = nodeX;
					indicatorX2 = nodeX + layoutNode.rect.width;
				}
			}

			// Check gap below this node (insert after)
			const gapBelow = nodeY + layoutNode.rect.height;
			const distBelow = Math.abs(svgPt.y - gapBelow);
			if (distBelow < bestDist && Math.abs(svgPt.x - nodeX) < 300) {
				const parentNode = layoutNode.parent;
				const siblingIdx = parentNode.children.indexOf(layoutNode) + 1;
				if (!this.isSamePosition(dragNode, parentNode.source.id, siblingIdx)) {
					bestDist = distBelow;
					bestTarget = { parentId: parentNode.source.id, index: siblingIdx };
					indicatorY = gapBelow;
					indicatorX1 = nodeX;
					indicatorX2 = nodeX + layoutNode.rect.width;
				}
			}

			// Check reparent: if cursor is to the right of a node, drop as its child
			const rightEdge = nodeX + layoutNode.rect.width + 30;
			if (svgPt.x > rightEdge && Math.abs(svgPt.y - nodeCY) < layoutNode.rect.height) {
				const dist = Math.abs(svgPt.y - nodeCY);
				if (dist < bestDist) {
					// Don't reparent to self
					if (layoutNode.source.id !== this.dragNodeId && !this.isDescendant(dragNode, layoutNode)) {
						bestDist = dist;
						bestTarget = { parentId: layoutNode.source.id, index: layoutNode.children.length };
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

	private isSamePosition(dragNode: LayoutNode, parentId: string, index: number): boolean {
		if (!dragNode.parent) return false;
		const currentParentId = dragNode.parent.source.id;
		const currentIndex = dragNode.parent.children.indexOf(dragNode);
		return currentParentId === parentId && (index === currentIndex || index === currentIndex + 1);
	}

	private async executeDrop(): Promise<void> {
		const dragNodeId = this.dragNodeId;
		const dropTarget = this.dropTarget;

		this.cleanupDrag();

		if (!dragNodeId || !dropTarget || !this.currentFile || !this.currentTree) return;

		const dragNode = this.nodeMap.get(dragNodeId);
		if (!dragNode) return;

		const content = await this.app.vault.read(this.currentFile);
		const src = dragNode.source;

		// Extract the dragged node's full text (including subtree)
		const dragStart = src.range.start;
		const dragEnd = this.subtreeEnd(src);
		let dragText = content.slice(dragStart, dragEnd);

		// Find the target parent and insertion point
		const targetParent = this.findNodeById(this.currentTree.root, dropTarget.parentId);
		if (!targetParent) return;

		// Compute the new type and depth based on target parent
		const newType = this.inferChildType(targetParent);
		const newDepth = this.inferChildDepth(targetParent);

		// Re-indent the dragged text if the depth or type changed
		dragText = this.reindentSubtree(dragText, src, newType, newDepth);

		// Determine insertion offset in the markdown
		let insertOffset: number;
		if (dropTarget.index >= targetParent.children.length) {
			// Append after last child's subtree
			if (targetParent.children.length > 0) {
				const lastChild = targetParent.children[targetParent.children.length - 1];
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
		let removeStart = dragStart;
		let removeEnd = dragEnd;

		// Consume adjacent newline with removal
		if (removeStart > 0 && content[removeStart - 1] === "\n") {
			removeStart--;
		} else if (removeEnd < content.length && content[removeEnd] === "\n") {
			removeEnd++;
		}

		let updated: string;
		if (removeStart < insertOffset) {
			// Dragging forward: remove first, then adjust insert position
			const afterRemove = content.slice(0, removeStart) + content.slice(removeEnd);
			const adjustedInsert = insertOffset - (removeEnd - removeStart);
			// Need a newline before the inserted text
			const prefix = adjustedInsert > 0 && afterRemove[adjustedInsert - 1] !== "\n" ? "\n" : "";
			const suffix = adjustedInsert < afterRemove.length && afterRemove[adjustedInsert] !== "\n" ? "\n" : "";
			updated = afterRemove.slice(0, adjustedInsert) + prefix + dragText + suffix + afterRemove.slice(adjustedInsert);
		} else {
			// Dragging backward: insert first, then remove (with adjusted position)
			const prefix = insertOffset > 0 && content[insertOffset - 1] !== "\n" ? "\n" : "";
			const suffix = insertOffset < content.length && content[insertOffset] !== "\n" ? "\n" : "";
			const afterInsert = content.slice(0, insertOffset) + prefix + dragText + suffix + content.slice(insertOffset);
			const shift = prefix.length + dragText.length + suffix.length;
			updated = afterInsert.slice(0, removeStart + shift) + afterInsert.slice(removeEnd + shift);
		}

		await this.writeMarkdown(updated);
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
		if (parent.type === "heading" || parent.type === "root") return "bullet";
		return parent.type;
	}

	private inferChildDepth(parent: OsmosisNode): number {
		if (parent.type === "heading" || parent.type === "root") return 0;
		return parent.depth + 1;
	}

	/**
	 * Re-indent a subtree's text to match a new type/depth.
	 * Adjusts the first line and all descendant lines proportionally.
	 */
	private reindentSubtree(
		text: string,
		originalNode: OsmosisNode,
		newType: OsmosisNode["type"],
		newDepth: number,
	): string {
		const lines = text.split("\n");
		const depthDelta = newDepth - originalNode.depth;
		const result: string[] = [];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line === undefined) continue;
			if (line.trim() === "") {
				result.push(line);
				continue;
			}

			if (i === 0) {
				// First line: serialize with new type and depth
				result.push(this.serializeLine(newType, newDepth, originalNode.content));
			} else {
				// Descendant lines: adjust indentation proportionally
				const match = line.match(/^(\s*)/);
				const currentIndent = match ? match[1]?.length ?? 0 : 0;
				const indentPerLevel = 2;
				const newIndent = Math.max(0, currentIndent + depthDelta * indentPerLevel);
				result.push(" ".repeat(newIndent) + line.trimStart());
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
				this.navigateSibling(-1);
				e.preventDefault();
				break;
			case "ArrowDown":
				this.navigateSibling(1);
				e.preventDefault();
				break;
			case "ArrowLeft":
				this.navigateToParent();
				e.preventDefault();
				break;
			case "ArrowRight":
				this.navigateToFirstChild();
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
					if (e.shiftKey) {
						// Shift+Enter = add sibling after selected node
						const enterNode = this.nodeMap.get(this.selectedNodeId);
						if (enterNode) {
							void this.addSiblingNode(enterNode);
						}
					} else {
						// Enter = start editing
						this.startEditing(this.selectedNodeId);
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
			case "a":
				// Ctrl/Cmd+A = select all
				if (e.ctrlKey || e.metaKey) {
					e.preventDefault();
					this.selectNodes(new Set(this.nodeMap.keys()));
				}
				break;
		}
	}

	private navigateSibling(direction: number): void {
		if (!this.selectedNodeId) {
			// Select first visible node
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
		}
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
		if (this.collapsedIds.has(this.selectedNodeId) && node.source.children.length > 0) {
			this.toggleCollapse(this.selectedNodeId);
			return;
		}

		const firstChild = node.children[0];
		if (firstChild) {
			this.selectNode(firstChild.source.id);
			this.scrollToSelectedNode();
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
		const vk: { overlaysContent: boolean; addEventListener: (type: string, fn: () => void) => void; removeEventListener: (type: string, fn: () => void) => void } | null = "virtualKeyboard" in navigator ? (navigator as any).virtualKeyboard : null;
		if (vk) vk.overlaysContent = true;

		const input = document.createElement("input");
		input.type = "text";
		input.className = "osmosis-node-input osmosis-edit-overlay";
		input.value = node.source.content;

		const isMobile = Platform.isMobile;

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

			// Mobile: use fixed positioning on document.body to escape
			// Obsidian's layout resize when the keyboard opens.
			input.setCssStyles({
				position: "fixed",
				left: `${screenRect.left}px`,
				top: `${screenRect.top}px`,
				width: `${screenRect.width}px`,
				height: `${screenRect.height}px`,
				zIndex: "10000",
			});
			document.body.appendChild(input);
		} else {
			// Desktop: absolute positioning inside container
			const containerRect = this.contentEl.getBoundingClientRect();
			input.setCssStyles({
				position: "absolute",
				left: `${screenRect.left - containerRect.left}px`,
				top: `${screenRect.top - containerRect.top}px`,
				width: `${screenRect.width}px`,
				height: `${screenRect.height}px`,
				zIndex: "1000",
			});
			this.contentEl.appendChild(input);
		}

		input.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter") {
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
			// Small delay to allow click events to process first
			setTimeout(() => {
				if (this.editingNodeId === nodeId) {
					this.stopEditing(true);
				}
			}, 100);
		});

		this.editOverlay = input;

		// On mobile, reposition input above keyboard if it would be hidden
		const cleanups: Array<() => void> = [];
		if (isMobile) {
			const repositionAboveKeyboard = () => {
				if (!this.editOverlay) return;
				const availableH = window.visualViewport?.height ?? window.innerHeight;
				const inputRect = this.editOverlay.getBoundingClientRect();
				if (inputRect.bottom > availableH - 10) {
					this.editOverlay.style.top = `${availableH - inputRect.height - 10}px`;
				}
			};
			if (vk) {
				vk.addEventListener("geometrychange", repositionAboveKeyboard);
				cleanups.push(() => vk.removeEventListener("geometrychange", repositionAboveKeyboard));
			}
			if (window.visualViewport) {
				window.visualViewport.addEventListener("resize", repositionAboveKeyboard);
				cleanups.push(() => window.visualViewport?.removeEventListener("resize", repositionAboveKeyboard));
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
		cleanups.push(() => this.contentEl.removeEventListener("scroll", lockScroll, true));

		this.editCleanup = () => {
			for (const fn of cleanups) fn();
			if (vk) vk.overlaysContent = false;
		};

		input.focus({ preventScroll: true });
		input.select();
		lockScroll();
	}

	private stopEditing(save: boolean): void {
		if (!this.editingNodeId || !this.svg) return;

		const nodeId = this.editingNodeId;
		const newContent = this.editOverlay?.value ?? "";
		this.editingNodeId = null;

		// Clean up event listeners, virtualKeyboard state, scroll locks
		if (this.editCleanup) {
			this.editCleanup();
			this.editCleanup = null;
		}

		// Remove the HTML overlay (works for both body and contentEl)
		if (this.editOverlay) {
			this.editOverlay.remove();
			this.editOverlay = null;
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

		if (save && newContent !== node.source.content) {
			// Write change back to markdown (triggers re-render)
			void this.renameNode(node, newContent);
		}

		this.contentEl.focus({ preventScroll: true });
	}

	// ─── Map → Markdown Sync ────────────────────────────────

	/**
	 * Serialize a node type/depth/content back to a markdown line.
	 */
	private serializeLine(type: OsmosisNode["type"], depth: number, content: string): string {
		switch (type) {
			case "heading":
				return `${"#".repeat(depth)} ${content}`;
			case "bullet":
				return `${"  ".repeat(depth)}- ${content}`;
			case "ordered":
				return `${"  ".repeat(depth)}1. ${content}`;
			case "paragraph":
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
	 * Write markdown content back to the file, suppressing the reload cycle.
	 */
	private async writeMarkdown(newContent: string): Promise<void> {
		if (!this.currentFile) return;
		this.suppressNextReload = true;
		this.cache.invalidate(this.currentFile.path);
		await this.app.vault.modify(this.currentFile, newContent);

		// Re-parse and re-render from the new content
		this.currentTree = this.cache.get(this.currentFile.path, newContent);
		await this.render();
	}

	/**
	 * Rename a node: replace the line in markdown with updated content.
	 */
	private async renameNode(node: LayoutNode, newContent: string): Promise<void> {
		if (!this.currentFile) return;
		const content = await this.app.vault.read(this.currentFile);
		const src = node.source;
		const newLine = this.serializeLine(src.type, src.depth, newContent);
		const updated = content.slice(0, src.range.start) + newLine + content.slice(src.range.end);
		await this.writeMarkdown(updated);
	}

	/**
	 * Add a child node under the given parent.
	 * Inserts a new line after the parent's subtree.
	 */
	private async addChildNode(parentNode: LayoutNode): Promise<void> {
		if (!this.currentFile) return;
		const content = await this.app.vault.read(this.currentFile);
		const src = parentNode.source;

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
		const updated = content.slice(0, insertPos) + "\n" + newLine + content.slice(insertPos);

		const selectedId = this.selectedNodeId;
		await this.writeMarkdown(updated);

		// Find and start editing the newly added node (last child of parent)
		this.startEditingNewNode(selectedId, true);
	}

	/**
	 * Add a sibling node after the given node.
	 * Inserts a new line after the node's subtree at the same level.
	 */
	private async addSiblingNode(node: LayoutNode): Promise<void> {
		if (!this.currentFile) return;
		const content = await this.app.vault.read(this.currentFile);
		const src = node.source;

		const newLine = this.serializeLine(src.type, src.depth, "");
		const insertPos = this.subtreeEnd(src);

		const updated = content.slice(0, insertPos) + "\n" + newLine + content.slice(insertPos);

		const selectedId = this.selectedNodeId;
		await this.writeMarkdown(updated);

		// Find and start editing the new sibling (node right after the original)
		this.startEditingNewNode(selectedId, false);
	}

	/**
	 * Delete a node and all its children from the markdown.
	 */
	private async deleteNode(node: LayoutNode): Promise<void> {
		if (!this.currentFile) return;
		const content = await this.app.vault.read(this.currentFile);
		const src = node.source;

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

		const updated = content.slice(0, deleteStart) + content.slice(deleteEnd);

		// Select the parent or sibling after deletion
		const parentId = node.parent?.source.type !== "root" ? node.parent?.source.id : null;
		await this.writeMarkdown(updated);

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
	private startEditingNewNode(previousSelectedId: string | null, isChild: boolean): void {
		if (!previousSelectedId) return;

		// The tree has been re-parsed, so we need to find the original node by position match
		// The new node will be a zero-length content node
		for (const [id, layoutNode] of this.nodeMap) {
			if (layoutNode.source.content === "") {
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
		container.empty();
		container.addClass("osmosis-mindmap-container");

		// Clean up previous render component
		this.renderComponent?.unload();
		this.renderComponent = new Component();
		this.renderComponent.load();

		if (!this.currentTree) {
			container.createEl("p", { text: "Open a Markdown file to view its mind map." });
			return;
		}

		const layout = computeLayout(this.currentTree, {}, this.collapsedIds);
		this.currentLayout = layout;

		// Build node map for keyboard nav
		this.nodeMap.clear();
		for (const node of layout.nodes) {
			if (node.source.type !== "root") {
				this.nodeMap.set(node.source.id, node);
			}
		}

		await this.renderSvg(container, layout);
	}

	private async renderSvg(container: HTMLElement, layout: LayoutResult): Promise<void> {
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

		svg.setAttribute("viewBox", `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.w} ${this.viewBox.h}`);

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

		const lineStyle = this.plugin?.settings?.branchLineStyle ?? "curved";

		// Only render nodes visible in the current viewport
		this.renderedNodeIds.clear();
		const renderPromises: Promise<void>[] = [];

		for (const node of nodes) {
			if (node.source.type === "root") continue;
			if (!this.isNodeInViewport(node, offsetX, offsetY)) continue;

			this.renderedNodeIds.add(node.source.id);
			renderPromises.push(this.drawNode(nodesGroup, node, offsetX, offsetY));

			if (node.parent && this.isBranchInViewport(node.parent, node, offsetX, offsetY)) {
				this.drawBranchLine(branchLinesGroup, node.parent, node, offsetX, offsetY, lineStyle);
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
		const classes = [`osmosis-node-group`, `osmosis-node-group-${node.source.type}`];
		if (this.selectedNodeIds.has(node.source.id)) {
			classes.push("osmosis-node-selected");
		}
		if (node.source.type === "transclusion" && node.source.sourceFile) {
			classes.push("osmosis-node-resolved");
		}
		if (node.source.type === "transclusion" && !node.source.sourceFile) {
			classes.push("osmosis-node-unresolved");
		}
		group.setAttribute("class", classes.join(" "));
		group.setAttribute("data-node-id", node.source.id);
		if (node.source.sourceFile) {
			group.setAttribute("data-source-file", node.source.sourceFile);
		}

		// Background rect
		const rect = document.createElementNS(SVG_NS, "rect");
		rect.setAttribute("x", String(x));
		rect.setAttribute("y", String(y));
		rect.setAttribute("width", String(width));
		rect.setAttribute("height", String(height));
		rect.setAttribute("rx", "4");
		rect.setAttribute("class", `osmosis-node osmosis-node-${node.source.type}`);
		group.appendChild(rect);

		// foreignObject with rendered markdown
		const fo = document.createElementNS(SVG_NS, "foreignObject");
		fo.setAttribute("x", String(x));
		fo.setAttribute("y", String(y));
		fo.setAttribute("width", String(width));
		fo.setAttribute("height", String(height));

		const wrapper = document.createElementNS(XHTML_NS, "div") as HTMLDivElement;
		wrapper.setAttribute("xmlns", XHTML_NS);
		wrapper.className = "osmosis-node-content";
		fo.appendChild(wrapper);
		group.appendChild(fo);

		// Render markdown content into the wrapper
		const sourcePath = this.currentFile?.path ?? "";
		if (this.renderComponent) {
			await MarkdownRenderer.render(
				this.app,
				node.source.content,
				wrapper,
				sourcePath,
				this.renderComponent,
			);
		}

		// Collapse toggle for nodes with children
		if (node.source.children.length > 0) {
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
		toggleGroup.appendChild(circle);

		// +/- icon
		const icon = document.createElementNS(SVG_NS, "text");
		icon.setAttribute("x", String(toggleX + toggleSize / 2));
		icon.setAttribute("y", String(toggleY + toggleSize / 2));
		icon.setAttribute("text-anchor", "middle");
		icon.setAttribute("dominant-baseline", "central");
		icon.setAttribute("class", "osmosis-collapse-icon");
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
				const radius = Math.min(12, Math.abs(cy - py) / 2, Math.abs(cx - px) / 4);
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
