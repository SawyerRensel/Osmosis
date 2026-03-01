import { ItemView, WorkspaceLeaf, TFile, MarkdownView } from "obsidian";
import { ParseCache } from "../cache";
import { OsmosisTree } from "../types";
import { computeLayout, LayoutNode, LayoutResult } from "../layout";

export const VIEW_TYPE_MINDMAP = "osmosis-mindmap";

export class MindMapView extends ItemView {
	private cache = new ParseCache();
	private currentFile: TFile | null = null;
	private currentTree: OsmosisTree | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		this.navigation = true;
		this.icon = "git-fork";
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

		this.render();
	}

	private render(): void {
		const container = this.contentEl;
		container.empty();
		container.addClass("osmosis-mindmap-container");

		if (!this.currentTree) {
			container.createEl("p", { text: "Open a Markdown file to view its mind map." });
			return;
		}

		// Compute layout and render SVG
		const layout = computeLayout(this.currentTree);
		this.renderSvg(container, layout);
	}

	private renderSvg(container: HTMLElement, layout: LayoutResult): void {
		const { bounds, nodes } = layout;
		const padding = 20;
		const svgWidth = bounds.width + padding * 2;
		const svgHeight = bounds.height + padding * 2;
		const offsetX = -bounds.x1 + padding;
		const offsetY = -bounds.y1 + padding;

		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("width", String(svgWidth));
		svg.setAttribute("height", String(svgHeight));
		svg.setAttribute("viewBox", `0 0 ${String(svgWidth)} ${String(svgHeight)}`);
		svg.addClass("osmosis-mindmap-svg");

		// Draw branch lines first (behind nodes)
		for (const node of nodes) {
			if (node.source.type === "root") continue;
			if (node.parent && node.parent.source.type !== "root") {
				this.drawBranchLine(svg, node.parent, node, offsetX, offsetY);
			} else if (node.parent?.source.type === "root") {
				// Root's children get lines from the left edge
				this.drawBranchLine(svg, null, node, offsetX, offsetY);
			}
		}

		// Draw nodes
		for (const node of nodes) {
			if (node.source.type === "root") continue;
			this.drawNode(svg, node, offsetX, offsetY);
		}

		container.appendChild(svg);
	}

	private drawNode(
		svg: SVGSVGElement,
		node: LayoutNode,
		offsetX: number,
		offsetY: number,
	): void {
		const x = node.rect.x + offsetX;
		const y = node.rect.y + offsetY;

		const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		rect.setAttribute("x", String(x));
		rect.setAttribute("y", String(y));
		rect.setAttribute("width", String(node.rect.width));
		rect.setAttribute("height", String(node.rect.height));
		rect.setAttribute("rx", "4");
		rect.setAttribute("class", `osmosis-node osmosis-node-${node.source.type}`);
		svg.appendChild(rect);

		const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
		text.setAttribute("x", String(x + node.rect.width / 2));
		text.setAttribute("y", String(y + node.rect.height / 2));
		text.setAttribute("text-anchor", "middle");
		text.setAttribute("dominant-baseline", "central");
		text.setAttribute("class", "osmosis-node-text");
		text.textContent = node.source.content;
		svg.appendChild(text);
	}

	private drawBranchLine(
		svg: SVGSVGElement,
		parent: LayoutNode | null,
		child: LayoutNode,
		offsetX: number,
		offsetY: number,
	): void {
		const cx = child.rect.x + offsetX;
		const cy = child.rect.y + child.rect.height / 2 + offsetY;

		let px: number;
		let py: number;
		if (parent) {
			px = parent.rect.x + parent.rect.width + offsetX;
			py = parent.rect.y + parent.rect.height / 2 + offsetY;
		} else {
			// Child of root — line starts from child's left edge
			px = cx;
			py = cy;
			return; // No line needed for root children with no visible parent
		}

		const midX = (px + cx) / 2;
		const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
		path.setAttribute(
			"d",
			`M ${String(px)} ${String(py)} C ${String(midX)} ${String(py)}, ${String(midX)} ${String(cy)}, ${String(cx)} ${String(cy)}`,
		);
		path.setAttribute("class", "osmosis-branch-line");
		svg.appendChild(path);
	}
}
