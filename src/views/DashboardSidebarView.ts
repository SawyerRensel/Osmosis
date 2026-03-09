import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import type OsmosisPlugin from "../main";
import { buildDeckTree } from "../study/DeckTreeBuilder";
import type { DeckNode, DeckScope } from "../study/types";
import { SequentialStudyModal } from "./SequentialStudyModal";

export const VIEW_TYPE_DASHBOARD = "osmosis-dashboard";

/**
 * Sidebar dashboard showing deck tree with New/Learn/Due counts.
 * Click a deck to start sequential study. "Study all" button for full collection.
 */
export class DashboardSidebarView extends ItemView {
	plugin!: OsmosisPlugin;

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
		return "graduation-cap";
	}

	async onOpen(): Promise<void> {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
		this.plugin = (this.app as any).plugins.plugins["osmosis"] as OsmosisPlugin;
		await this.render();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	async render(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("osmosis-dashboard");

		const now = Date.now();
		const decks = this.plugin.cardStore.getAllDecks();
		const counts = this.plugin.cardStore.getCardCountsByDeck(now);
		const tree = buildDeckTree(decks, counts);

		// Total counts
		let totalNew = 0, totalLearn = 0, totalDue = 0;
		for (const node of tree) {
			totalNew += node.newCount;
			totalLearn += node.learnCount;
			totalDue += node.dueCount;
		}

		// Study All button
		const header = contentEl.createDiv({ cls: "osmosis-dash-header" });
		const studyAllBtn = header.createEl("button", {
			cls: "osmosis-dash-btn",
		});
		studyAllBtn.createSpan({ text: "Study all" });
		const headerCounts = studyAllBtn.createSpan({ cls: "osmosis-dash-counts" });
		this.renderCounts(headerCounts, totalNew, totalLearn, totalDue);
		studyAllBtn.addEventListener("click", () => {
			this.openStudy({ type: "all" });
		});

		// Deck tree
		if (tree.length === 0) {
			contentEl.createDiv({ cls: "osmosis-dash-empty", text: "No decks yet. Add osmosis: true to a note's frontmatter to get started." });
		} else {
			const treeEl = contentEl.createDiv({ cls: "osmosis-dash-tree" });
			this.renderDeckTree(treeEl, tree, 0);
		}
	}

	private renderDeckTree(container: HTMLElement, nodes: DeckNode[], depth: number): void {
		for (const node of nodes) {
			const row = container.createDiv({ cls: `osmosis-dash-deck-row osmosis-dash-depth-${depth}` });

			// Collapse toggle
			if (node.children.length > 0) {
				const toggle = row.createSpan({ cls: "osmosis-dash-collapse" });
				setIcon(toggle, "chevron-down");

				let collapsed = false;
				const childContainer = container.createDiv({ cls: "osmosis-dash-children" });
				this.renderDeckTree(childContainer, node.children, depth + 1);

				toggle.addEventListener("click", (e) => {
					e.stopPropagation();
					collapsed = !collapsed;
					if (collapsed) {
						childContainer.addClass("osmosis-hidden");
					} else {
						childContainer.removeClass("osmosis-hidden");
					}
					toggle.empty();
					setIcon(toggle, collapsed ? "chevron-right" : "chevron-down");
				});
			} else {
				row.createSpan({ cls: "osmosis-dash-collapse-spacer" });
			}

			// Deck name
			row.createSpan({ cls: "osmosis-dash-deck-name", text: node.name });

			// Counts
			const countsEl = row.createSpan({ cls: "osmosis-dash-counts" });
			this.renderCounts(countsEl, node.newCount, node.learnCount, node.dueCount);

			// Click to study this deck
			row.addEventListener("click", () => {
				const deckScope: DeckScope = node.children.length > 0
					? { type: "parent", deck: node.fullPath }
					: { type: "single", deck: node.fullPath };
				this.openStudy(deckScope);
			});
		}
	}

	private renderCounts(el: HTMLElement, newCount: number, learnCount: number, dueCount: number): void {
		el.createSpan({ cls: `osmosis-dash-new${newCount === 0 ? " osmosis-dash-zero" : ""}`, text: String(newCount) });
		el.createSpan({ cls: `osmosis-dash-learn${learnCount === 0 ? " osmosis-dash-zero" : ""}`, text: String(learnCount) });
		el.createSpan({ cls: `osmosis-dash-due${dueCount === 0 ? " osmosis-dash-zero" : ""}`, text: String(dueCount) });
	}

	private openStudy(scope: DeckScope): void {
		const sessionManager = this.plugin.createSessionManager();
		const modal = new SequentialStudyModal(
			this.app,
			sessionManager,
			scope,
			{
				newLimit: this.plugin.settings.dailyNewCardLimit,
				reviewLimit: this.plugin.settings.dailyReviewCardLimit,
			},
		);
		modal.onClose = () => {
			void this.render();
		};
		modal.open();
	}
}
