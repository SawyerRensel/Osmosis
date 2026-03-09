import { Plugin, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, OsmosisSettings, OsmosisSettingTab } from "./settings";
import { CardDatabase } from "./database/CardDatabase";
import { FSRSScheduler } from "./database/FSRSScheduler";
import { StudySessionManager } from "./study/StudySessionManager";
import { MindMapView, VIEW_TYPE_MINDMAP } from "./views/MindMapView";
import { PropertiesSidebarView, VIEW_TYPE_PROPERTIES } from "./views/PropertiesSidebarView";
import { SequentialStudyModal } from "./views/SequentialStudyModal";
import { DashboardSidebarView, VIEW_TYPE_DASHBOARD } from "./views/DashboardSidebarView";
import { ContextualStudyProcessor } from "./views/ContextualStudyProcessor";
import type { DeckScope } from "./study/types";

export default class OsmosisPlugin extends Plugin {
	settings!: OsmosisSettings;
	cardDb!: CardDatabase;

	async onload() {
		await this.loadSettings();

		// Card database — lazy initialized on first SR access, not here
		this.cardDb = new CardDatabase(".osmosis/cards.db", this.app.vault.adapter);

		this.addSettingTab(new OsmosisSettingTab(this.app, this));

		this.registerView(VIEW_TYPE_MINDMAP, (leaf: WorkspaceLeaf) => new MindMapView(leaf));
		this.registerView(VIEW_TYPE_PROPERTIES, (leaf: WorkspaceLeaf) => new PropertiesSidebarView(leaf));
		this.registerView(VIEW_TYPE_DASHBOARD, (leaf: WorkspaceLeaf) => new DashboardSidebarView(leaf));

		this.addRibbonIcon("git-fork", "Open mind map", () => {
			void this.activateMindMapView();
		});

		this.addRibbonIcon("graduation-cap", "Osmosis dashboard", () => {
			void this.activateDashboard();
		});

		this.addCommand({
			id: "open-mind-map",
			name: "Open mind map view",
			callback: () => {
				void this.activateMindMapView();
			},
		});

		this.addCommand({
			id: "open-properties-sidebar",
			name: "Open mind map properties",
			callback: () => {
				void this.activatePropertiesSidebar();
			},
		});

		this.addCommand({
			id: "open-dashboard",
			name: "Open dashboard",
			callback: () => {
				void this.activateDashboard();
			},
		});

		// ── Study Commands ──────────────────────────────────────
		this.addCommand({
			id: "study-all",
			name: "Study all decks",
			callback: () => {
				void this.openStudySession({ type: "all" });
			},
		});

		// ── Contextual Study Mode ───────────────────────────────
		new ContextualStudyProcessor(this).register();

		// ── Card Insertion Commands ──────────────────────────────
		this.registerCardInsertionCommands();
	}

	onunload() {
		void this.cardDb.close();
	}

	private async activateMindMapView(): Promise<void> {
		const { workspace } = this.app;

		const existing = workspace.getLeavesOfType(VIEW_TYPE_MINDMAP);
		if (existing.length > 0 && existing[0]) {
			void workspace.revealLeaf(existing[0]);
			return;
		}

		const leaf = workspace.getLeaf("split", "vertical");
		await leaf.setViewState({
			type: VIEW_TYPE_MINDMAP,
			active: true,
		});
		void workspace.revealLeaf(leaf);
	}

	async activatePropertiesSidebar(): Promise<void> {
		const { workspace } = this.app;

		const existing = workspace.getLeavesOfType(VIEW_TYPE_PROPERTIES);
		if (existing.length > 0 && existing[0]) {
			void workspace.revealLeaf(existing[0]);
			return;
		}

		const leaf = workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({
			type: VIEW_TYPE_PROPERTIES,
			active: true,
		});
		void workspace.revealLeaf(leaf);
	}

	async activateDashboard(): Promise<void> {
		const { workspace } = this.app;

		const existing = workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD);
		if (existing.length > 0 && existing[0]) {
			void workspace.revealLeaf(existing[0]);
			return;
		}

		const leaf = workspace.getLeftLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({
			type: VIEW_TYPE_DASHBOARD,
			active: true,
		});
		void workspace.revealLeaf(leaf);
	}

	async openStudySession(scope: DeckScope): Promise<void> {
		await this.cardDb.ensureInitialized();
		const sessionManager = new StudySessionManager(this.cardDb, new FSRSScheduler());
		const modal = new SequentialStudyModal(this.app, sessionManager, scope, {
			newLimit: this.settings.dailyNewCardLimit,
			reviewLimit: this.settings.dailyReviewCardLimit,
		});
		modal.open();
	}

	private registerCardInsertionCommands(): void {
		const skeletons = [
			{ id: "insert-card-basic", name: "Insert basic card", meta: "" },
			{ id: "insert-card-bidi", name: "Insert bidirectional card", meta: "bidi: true\n" },
			{ id: "insert-card-type-in", name: "Insert type-in card", meta: "type-in: true\n" },
			{ id: "insert-card-bidi-type-in", name: "Insert bidirectional type-in card", meta: "bidi: true\ntype-in: true\n" },
		];

		for (const skeleton of skeletons) {
			this.addCommand({
				id: skeleton.id,
				name: skeleton.name,
				editorCallback: (editor) => {
					const cursor = editor.getCursor();
					const metaBlock = skeleton.meta ? `${skeleton.meta}\n` : "";
					const fence = `\`\`\`osmosis\n${metaBlock}Front content\n***\nBack content\n\`\`\`\n`;

					editor.replaceRange(fence, cursor);

					// Position cursor on the "Front content" line and select it
					const metaLines = skeleton.meta ? skeleton.meta.split("\n").length : 0;
					const frontLine = cursor.line + 1 + metaLines;
					editor.setSelection(
						{ line: frontLine, ch: 0 },
						{ line: frontLine, ch: "Front content".length },
					);
				},
			});
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<OsmosisSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
