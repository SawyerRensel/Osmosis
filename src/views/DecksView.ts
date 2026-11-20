import { ItemView, type WorkspaceLeaf } from "obsidian";
import type OsmosisPlugin from "../main";
import { renderDecksDashboard } from "./DecksDashboard";

export const VIEW_TYPE_DECKS = "osmosis-decks";

/**
 * The Decks page: the sidebar dashboard (`DashboardSidebarView`) as a tab in
 * the main area, drawn by the same renderer. The ribbon opens it, and the
 * Flashcard study tab turns into it when its cap is toggled off.
 *
 * Studying a deck from here reuses the study tab if one is open; otherwise
 * this tab becomes the study tab, so toggling study off and on again stays in
 * one tab.
 */
export class DecksView extends ItemView {
	private refreshInterval: number | null = null;
	private columnEl: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, private readonly plugin: OsmosisPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_DECKS;
	}

	getDisplayText(): string {
		return "Osmosis Decks";
	}

	getIcon(): string {
		return "brain-circuit";
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass("osmosis-decks-view");
		// The dashboard sits in a readable column; a tab is much wider than the sidebar
		this.columnEl = this.contentEl.createDiv({ cls: "osmosis-decks-column" });
		this.render();
		// Same 60 s refresh as the sidebar, so due counts stay current
		this.refreshInterval = window.setInterval(() => this.render(), 60_000);
	}

	async onClose(): Promise<void> {
		if (this.refreshInterval !== null) {
			window.clearInterval(this.refreshInterval);
			this.refreshInterval = null;
		}
		this.columnEl = null;
		this.contentEl.empty();
	}

	render(): void {
		if (!this.columnEl) return;
		renderDecksDashboard(this.columnEl, this.plugin, (scope) => {
			void this.plugin.openStudySession(scope, this.leaf);
		});
	}
}
