import { ItemView, WorkspaceLeaf } from "obsidian";

export const VIEW_TYPE_CARD_BROWSER = "osmosis-card-browser";

/**
 * Main-area view for browsing every card in the collection.
 *
 * A shell for now — the browsing surface itself is the "Create Card Browser -
 * Editor" task. Registering the view type here is what gives it a tab, history,
 * and the ability to be pinned or split.
 */
export class CardBrowserView extends ItemView {
	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_CARD_BROWSER;
	}

	getDisplayText(): string {
		return "Osmosis browse";
	}

	getIcon(): string {
		return "search";
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("osmosis-operator-view");
		contentEl.createEl("h2", { text: "Browse" });
		contentEl.createDiv({
			cls: "osmosis-operator-placeholder",
			text: "Card browsing is not built yet.",
		});
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}
}
