import { ItemView, WorkspaceLeaf, TFile, MarkdownView } from "obsidian";
import { ParseCache } from "../cache";
import { OsmosisTree, OsmosisNode } from "../types";

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

		// Task 2.1: Debug tree rendering — replaced by SVG in Task 2.2+
		const pre = container.createEl("pre", { cls: "osmosis-mindmap-debug" });
		pre.setText(this.treeToString(this.currentTree.root, 0));
	}

	private treeToString(node: OsmosisNode, indent: number): string {
		const prefix = "  ".repeat(indent);
		const label = node.type === "root" ? "(root)" : `[${node.type}] ${node.content}`;
		let result = `${prefix}${label}\n`;
		for (const child of node.children) {
			result += this.treeToString(child, indent + 1);
		}
		return result;
	}
}
