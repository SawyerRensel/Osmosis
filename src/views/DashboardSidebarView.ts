import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import type OsmosisPlugin from "../main";
import { deckScopeOf, visibleDeckTree } from "../study/DeckTreeBuilder";
import type { DeckNode, DeckScope } from "../study/types";
import { VIEW_TYPE_STATS } from "./StatsView";

export const VIEW_TYPE_DASHBOARD = "osmosis-dashboard";

/**
 * Sidebar dashboard showing deck tree with New/Learn/Due counts.
 * Click a deck to start sequential study. "Study all" button for full collection.
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
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("osmosis-dashboard");

		const now = Date.now();
		const decks = this.plugin.cardStore.getAllDecks();
		const counts = this.plugin.cardStore.getCardCountsByDeck(now);
		const tree = visibleDeckTree(decks, counts, this.plugin.cardStore.getFolderDerivedDecks());

		// Total counts
		let totalNew = 0, totalLearn = 0, totalDue = 0;
		for (const node of tree) {
			totalNew += node.newCount;
			totalLearn += node.learnCount;
			totalDue += node.dueCount;
		}

		// Operator bar — the wide surfaces open in the main area, not here
		const operators = contentEl.createDiv({ cls: "osmosis-dash-operators" });
		// Browse opens a `.base` file rather than a view type of its own — the
		// browser is a Bases view, so the button is a shortcut to the base.
		this.renderOperator(operators, "Browse", "search", () => this.plugin.openCardBrowser());
		this.renderOperator(operators, "Stats", "bar-chart", () => this.plugin.activateMainView(VIEW_TYPE_STATS));

		// Column headers — placed above "Study all" so they label its counts as
		// well as the tree's. Every count group is right-aligned to the same
		// edge, so the columns line up whatever a row's indent or name length.
		const colHeaders = contentEl.createDiv({ cls: "osmosis-dash-col-headers" });
		for (const label of ["New", "Learn", "Due", "Total"]) {
			colHeaders.createSpan({ cls: "osmosis-dash-col-header", text: label });
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
			contentEl.createDiv({ cls: "osmosis-dash-empty", text: "No decks yet. Add osmosis-cards: true to a note's frontmatter to get started." });
		} else {
			const treeEl = contentEl.createDiv({ cls: "osmosis-dash-tree" });
			this.renderDeckTree(treeEl, tree, 0);
		}
	}

	private renderOperator(
		container: HTMLElement,
		label: string,
		icon: string,
		open: () => Promise<void>,
	): void {
		const btn = container.createEl("button", { cls: "osmosis-dash-operator" });
		setIcon(btn.createSpan({ cls: "osmosis-dash-operator-icon" }), icon);
		btn.createSpan({ text: label });
		btn.addEventListener("click", () => {
			void open();
		});
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
				this.openStudy(deckScopeOf(node));
			});
		}
	}

	private renderCounts(el: HTMLElement, newCount: number, learnCount: number, dueCount: number): void {
		// Total is the sum of the three columns: cards waiting right now. Cards
		// scheduled for a future day are in none of them, so this is not the
		// deck's card count.
		const total = newCount + learnCount + dueCount;
		el.createSpan({ cls: `osmosis-dash-new${newCount === 0 ? " osmosis-dash-zero" : ""}`, text: String(newCount) });
		el.createSpan({ cls: `osmosis-dash-learn${learnCount === 0 ? " osmosis-dash-zero" : ""}`, text: String(learnCount) });
		el.createSpan({ cls: `osmosis-dash-due${dueCount === 0 ? " osmosis-dash-zero" : ""}`, text: String(dueCount) });
		el.createSpan({ cls: `osmosis-dash-total${total === 0 ? " osmosis-dash-zero" : ""}`, text: String(total) });
	}

	/** Start a session in the study tab. Deck counts refresh when it ends (`flushStudySession`). */
	private openStudy(scope: DeckScope): void {
		void this.plugin.openStudySession(scope);
	}
}
