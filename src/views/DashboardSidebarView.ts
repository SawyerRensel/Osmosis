import { ItemView, WorkspaceLeaf } from "obsidian";
import type OsmosisPlugin from "../main";
import { renderDecksDashboard } from "./DecksDashboard";

export const VIEW_TYPE_DASHBOARD = "osmosis-dashboard";

/**
 * Sidebar dashboard showing deck tree with New/Learn/Due counts.
 * Click a deck to start flashcard study. "Study all" button for full collection.
 */
export class DashboardSidebarView extends ItemView {
	plugin!: OsmosisPlugin;
	private refreshInterval: number | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_DASHBOARD;
	}

	getDisplayText(): string {
		return "Osmosis";
	}

	getIcon(): string {
		return "brain-circuit";
	}

	async onOpen(): Promise<void> {
		this.plugin = this.app.plugins.plugins["osmosis"] as OsmosisPlugin;
		await this.render();
		// Auto-refresh every 60 seconds so due counts stay current
		this.refreshInterval = window.setInterval(() => {
			void this.render();
		}, 60_000);
	}

	async onClose(): Promise<void> {
		if (this.refreshInterval !== null) {
			window.clearInterval(this.refreshInterval);
			this.refreshInterval = null;
		}
		this.contentEl.empty();
	}

	async render(): Promise<void> {
		// Shared with the Decks tab (`DecksView`)
		renderDecksDashboard(this.contentEl, this.plugin, (scope) => {
			// Deck counts refresh when the session ends (`flushStudySession`)
			void this.plugin.openStudySession(scope);
		});
	}
}
