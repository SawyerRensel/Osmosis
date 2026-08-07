import { ItemView, WorkspaceLeaf } from "obsidian";

export const VIEW_TYPE_STATS = "osmosis-stats";

/**
 * Main-area view for study statistics.
 *
 * A shell for now — the heatmap, graphs, and rollups are the "Osmosis stats
 * dashboard" task, which reads from `plugin.reviewLog`. Registering the view
 * type here is what gives it a tab, history, and the ability to be pinned or
 * split.
 */
export class StatsView extends ItemView {
	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_STATS;
	}

	getDisplayText(): string {
		return "Osmosis stats";
	}

	getIcon(): string {
		return "bar-chart";
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("osmosis-operator-view");
		contentEl.createEl("h2", { text: "Stats" });
		contentEl.createDiv({
			cls: "osmosis-operator-placeholder",
			text: "Study statistics are not built yet.",
		});
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}
}
