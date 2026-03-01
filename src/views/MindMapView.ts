import {
	ItemView,
	WorkspaceLeaf,
	TFile,
	MarkdownView,
	MarkdownRenderer,
	Component,
} from "obsidian";
import { ParseCache } from "../cache";
import { OsmosisTree } from "../types";
import { computeLayout, LayoutNode, LayoutResult, DEFAULT_LAYOUT_CONFIG } from "../layout";
import type OsmosisPlugin from "../main";
import type { BranchLineStyle } from "../settings";

export const VIEW_TYPE_MINDMAP = "osmosis-mindmap";

const SVG_NS = "http://www.w3.org/2000/svg";
const XHTML_NS = "http://www.w3.org/1999/xhtml";

export class MindMapView extends ItemView {
	private cache = new ParseCache();
	private currentFile: TFile | null = null;
	private currentTree: OsmosisTree | null = null;
	private renderComponent: Component | null = null;
	plugin: OsmosisPlugin;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		this.navigation = true;
		this.icon = "git-fork";
		// Plugin reference is set after construction via the view factory
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
					void this.loadFile(file);
				}
			}),
		);
	}

	async onClose(): Promise<void> {
		this.renderComponent?.unload();
		this.renderComponent = null;
		this.contentEl.empty();
		this.currentFile = null;
		this.currentTree = null;
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

		const layout = computeLayout(this.currentTree);
		await this.renderSvg(container, layout);
	}

	private async renderSvg(container: HTMLElement, layout: LayoutResult): Promise<void> {
		const { bounds, nodes } = layout;
		const padding = 20;
		const svgWidth = bounds.width + padding * 2;
		const svgHeight = bounds.height + padding * 2;
		const offsetX = -bounds.x1 + padding;
		const offsetY = -bounds.y1 + padding;

		const svg = document.createElementNS(SVG_NS, "svg");
		svg.setAttribute("width", String(svgWidth));
		svg.setAttribute("height", String(svgHeight));
		svg.setAttribute("viewBox", `0 0 ${String(svgWidth)} ${String(svgHeight)}`);
		svg.addClass("osmosis-mindmap-svg");

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
		group.setAttribute("class", `osmosis-node-group osmosis-node-group-${node.source.type}`);
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

		svg.appendChild(group);
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
			// Root has no visual rect — start line from just left of the child
			const stubLength = DEFAULT_LAYOUT_CONFIG.horizontalSpacing / 2;
			px = cx - stubLength;
			py = cy;
		} else {
			// Parent attachment point: center-right
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
					// Straight horizontal line when vertically aligned
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
