import {
	ItemView,
	WorkspaceLeaf,
	TFile,
	MarkdownView,
	MarkdownRenderer,
	Component,
} from "obsidian";
import { ParseCache } from "../cache";
import { OsmosisParser } from "../parser";
import { OsmosisNode, OsmosisTree } from "../types";
import { computeLayout, LayoutNode, LayoutResult, DEFAULT_LAYOUT_CONFIG } from "../layout";
import type OsmosisPlugin from "../main";
import type { BranchLineStyle } from "../settings";

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

export class MindMapView extends ItemView {
	private cache = new ParseCache();
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

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		this.navigation = true;
		this.icon = "git-fork";
		this.plugin = (this.app as unknown as { plugins: { plugins: Record<string, OsmosisPlugin> } }).plugins.plugins["osmosis"] as OsmosisPlugin;
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
		this.registerDomEvent(container, "mousedown", this.handleMouseDown);
		this.registerDomEvent(container, "mousemove", this.handleMouseMove);
		this.registerDomEvent(container, "mouseup", this.handleMouseUp);
		this.registerDomEvent(container, "mouseleave", this.handleMouseUp);
		this.registerDomEvent(container, "wheel", this.handleWheel, { passive: false });
		this.registerDomEvent(container, "click", this.handleClick);
		this.registerDomEvent(container, "dblclick", this.handleDblClick);

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
		this.renderComponent?.unload();
		this.renderComponent = null;
		this.svg = null;
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

		this.currentFile = file;
		const content = await this.app.vault.read(file);
		this.currentTree = this.cache.get(file.path, content);

		await this.render();
	}

	// ─── Viewport ────────────────────────────────────────────

	private updateViewBox(): void {
		if (!this.svg) return;
		const { x, y, w, h } = this.viewBox;
		this.svg.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
	}

	private screenToSvg(clientX: number, clientY: number): { x: number; y: number } {
		if (!this.svg) return { x: 0, y: 0 };
		const rect = this.svg.getBoundingClientRect();
		const ratioX = this.viewBox.w / rect.width;
		const ratioY = this.viewBox.h / rect.height;
		return {
			x: this.viewBox.x + (clientX - rect.left) * ratioX,
			y: this.viewBox.y + (clientY - rect.top) * ratioY,
		};
	}

	private handleMouseDown = (e: MouseEvent): void => {
		if (e.button !== 0 && e.button !== 1) return;

		const nodeId = this.getClickedNodeId(e);

		// Left-click on a node: prepare for potential drag
		if (e.button === 0 && nodeId && !this.editingNodeId) {
			// Don't drag collapse toggles
			const target = e.target as Element;
			if (target.closest(".osmosis-collapse-toggle")) return;

			this.dragNodeId = nodeId;
			this.dragStartScreen = { x: e.clientX, y: e.clientY };
			e.preventDefault();
			return;
		}

		// Shift+left-click on background starts rubber-band selection
		if (e.button === 0 && !nodeId && e.shiftKey) {
			const svgPt = this.screenToSvg(e.clientX, e.clientY);
			this.isRubberBanding = true;
			this.rubberBandStart = svgPt;
			e.preventDefault();
			return;
		}

		// Middle-click or left-click on background starts pan
		if (e.button === 1 || (e.button === 0 && !nodeId)) {
			this.isPanning = true;
			this.panStart = { x: e.clientX, y: e.clientY };
			e.preventDefault();
		}
	};

	private handleMouseMove = (e: MouseEvent): void => {
		// Rubber-band selection
		if (this.isRubberBanding && this.svg) {
			this.updateRubberBand(e);
			return;
		}

		// Check for drag threshold
		if (this.dragNodeId && !this.isDragging) {
			const dx = e.clientX - this.dragStartScreen.x;
			const dy = e.clientY - this.dragStartScreen.y;
			if (Math.sqrt(dx * dx + dy * dy) >= DRAG_THRESHOLD) {
				this.startDrag(this.dragNodeId);
			}
		}

		// Update drag position
		if (this.isDragging && this.svg) {
			this.updateDrag(e);
			return;
		}

		if (!this.isPanning || !this.svg) return;

		const rect = this.svg.getBoundingClientRect();
		const dx = (e.clientX - this.panStart.x) * (this.viewBox.w / rect.width);
		const dy = (e.clientY - this.panStart.y) * (this.viewBox.h / rect.height);

		this.viewBox.x -= dx;
		this.viewBox.y -= dy;
		this.panStart = { x: e.clientX, y: e.clientY };

		this.updateViewBox();
	};

	private handleMouseUp = (): void => {
		if (this.isRubberBanding) {
			this.finishRubberBand();
			return;
		}

		if (this.isDragging) {
			void this.executeDrop();
			return;
		}

		// If we had a drag candidate but didn't reach threshold, treat as click
		this.dragNodeId = null;
		this.isPanning = false;
	};

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

	private getClickedNodeId(e: MouseEvent): string | null {
		const target = e.target as Element;
		const group = target.closest(".osmosis-node-group");
		return group?.getAttribute("data-node-id") ?? null;
	}

	private handleClick = (e: MouseEvent): void => {
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
			if (node && node.children.length > 0 && !this.collapsedIds.has(id)) {
				anyExpanded = true;
				break;
			}
		}

		for (const id of this.selectedNodeIds) {
			const node = this.nodeMap.get(id);
			if (!node || node.children.length === 0) continue;
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
				this.dropIndicator.setAttribute("display", "");
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
					if (node && node.children.length > 0) {
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

		const fo = group.querySelector("foreignObject");
		if (!fo) return;

		const contentDiv = fo.querySelector(".osmosis-node-content") as HTMLDivElement;
		if (!contentDiv) return;

		// Replace rendered markdown with editable input
		contentDiv.empty();
		contentDiv.addClass("osmosis-node-editing");

		const input = document.createElement("input");
		input.type = "text";
		input.className = "osmosis-node-input";
		input.value = node.source.content;

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

		contentDiv.appendChild(input);
		input.focus();
		input.select();
	}

	private stopEditing(save: boolean): void {
		if (!this.editingNodeId || !this.svg) return;

		const nodeId = this.editingNodeId;
		this.editingNodeId = null;

		const group = this.svg.querySelector(`[data-node-id="${nodeId}"]`);
		if (!group) return;

		const input = group.querySelector<HTMLInputElement>(".osmosis-node-input");
		const newContent = input?.value ?? "";

		const node = this.nodeMap.get(nodeId);
		if (!node) return;

		if (save && newContent !== node.source.content) {
			// Write change back to markdown
			void this.renameNode(node, newContent);
		} else {
			// Re-render to restore the markdown display
			void this.render();
		}

		this.contentEl.focus();
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

		// Initialize viewBox to fit content if this is a fresh render (no previous zoom state)
		// or preserve existing viewBox if user has already panned/zoomed
		if (!this.svg) {
			// First render — fit content to view
			this.viewBox = { x: 0, y: 0, w: contentWidth, h: contentHeight };
			this.zoom = 1;
		}

		svg.setAttribute("viewBox", `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.w} ${this.viewBox.h}`);

		this.svg = svg;

		const lineStyle = this.plugin?.settings?.branchLineStyle ?? "curved";

		// Draw branch lines first (behind nodes)
		for (const node of nodes) {
			if (node.source.type === "root") continue;
			if (node.parent) {
				this.drawBranchLine(svg, node.parent, node, offsetX, offsetY, lineStyle);
			}
		}

		// Draw nodes
		const renderPromises: Promise<void>[] = [];
		for (const node of nodes) {
			if (node.source.type === "root") continue;
			renderPromises.push(this.drawNode(svg, node, offsetX, offsetY));
		}
		await Promise.all(renderPromises);

		container.appendChild(svg);
	}

	private async drawNode(
		svg: SVGSVGElement,
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
		group.setAttribute("class", classes.join(" "));
		group.setAttribute("data-node-id", node.source.id);

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
		svg: SVGSVGElement,
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
