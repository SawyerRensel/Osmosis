import {
	ItemView,
	WorkspaceLeaf,
	TFile,
	MarkdownView,
	MarkdownRenderer,
	Component,
} from "obsidian";
import { ParseCache } from "../cache";
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
	private nodeMap = new Map<string, LayoutNode>();

	// Editing state
	private editingNodeId: string | null = null;

	// Sync state: when true, skip the next vault.modify reload to prevent flicker
	private suppressNextReload = false;

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
		// Middle-click or left-click on background starts pan
		if (e.button === 1 || (e.button === 0 && !this.getClickedNodeId(e))) {
			this.isPanning = true;
			this.panStart = { x: e.clientX, y: e.clientY };
			e.preventDefault();
		}
	};

	private handleMouseMove = (e: MouseEvent): void => {
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
		if (this.isPanning) return;

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
			this.selectNode(nodeId);
			this.contentEl.focus();
		} else {
			this.selectNode(null);
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

	private selectNode(nodeId: string | null): void {
		// Remove old selection
		if (this.selectedNodeId && this.svg) {
			const oldGroup = this.svg.querySelector(`[data-node-id="${this.selectedNodeId}"]`);
			oldGroup?.classList.remove("osmosis-node-selected");
		}

		this.selectedNodeId = nodeId;

		// Apply new selection
		if (nodeId && this.svg) {
			const newGroup = this.svg.querySelector(`[data-node-id="${nodeId}"]`);
			newGroup?.classList.add("osmosis-node-selected");
		}
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
				if (this.selectedNodeId) {
					const delNode = this.nodeMap.get(this.selectedNodeId);
					if (delNode) {
						void this.deleteNode(delNode);
					}
				}
				e.preventDefault();
				break;
			case " ":
				// Space = toggle collapse on selected node
				if (this.selectedNodeId) {
					const node = this.nodeMap.get(this.selectedNodeId);
					if (node && node.children.length > 0) {
						this.toggleCollapse(this.selectedNodeId);
						e.preventDefault();
					}
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
		if (node.source.id === this.selectedNodeId) {
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
